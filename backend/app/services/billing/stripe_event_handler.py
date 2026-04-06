"""Stripe webhook processing: sync subscription, enqueue billing emails."""

from __future__ import annotations

import logging
from typing import Any

import stripe
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...core.datetime_user_tz import (
    assume_utc,
    format_unix_epoch_for_email_date_only,
    format_unix_epoch_for_email_datetime,
)
from ...core.timezone_australia import effective_zoneinfo_for_stored_timezone
from ...models.email_event import EmailEvent
from ...auth.plan_enforcement import get_over_limit_status
from ...models.postgres_model import Company, Subscription, User
from ...services.plan_policy import get_policy_for_subscription
from ...services.stripe_service import get_subscription
from ...models.stripe_webhook_event import StripeWebhookEvent
from ..email.constants import EMAIL_CATEGORY_STRIPE_BILLING
from .stripe_billing_display import coerce_stripe_unix_timestamp
from .stripe_event_mapper import StripeEmailJob, map_stripe_event
from ..stripe_service import sync_subscription_from_stripe_object
from ...core.config import settings

logger = logging.getLogger(__name__)

_FRONTEND_ORIGIN = settings.app_origin.rstrip("/")

# Expand Product on the subscription item price so emails show product name, not bare price IDs.
_SUBSCRIPTION_RETRIEVE_EXPAND: list[str] = ["items.data.price.product"]

_HANDLED_SYNC_TYPES = {
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.trial_will_end",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
}


def _to_plain_dict(obj: Any) -> dict[str, Any]:
    if isinstance(obj, dict):
        return obj
    if obj is None:
        return {}
    try:
        if hasattr(obj, "to_dict_recursive"):
            out = obj.to_dict_recursive()
            return out if isinstance(out, dict) else {}
    except Exception:
        pass
    try:
        out = obj.to_dict()  # type: ignore[union-attr]
        return out if isinstance(out, dict) else {}
    except Exception:
        pass
    try:
        return dict(obj)
    except Exception:
        return {}


def _event_object(event: dict[str, Any]) -> dict[str, Any]:
    data = event.get("data")
    if not isinstance(data, dict):
        return {}
    obj = data.get("object")
    return obj if isinstance(obj, dict) else {}


def _subscription_id_from_value(val: Any) -> str | None:
    if isinstance(val, str) and val.startswith("sub_"):
        return val
    if isinstance(val, dict):
        sid = val.get("id")
        if isinstance(sid, str):
            return sid
    return None


def try_record_stripe_webhook_idempotency(db: Session, *, stripe_event_id: str, event_type: str) -> bool:
    """Insert idempotency row. Return False if this event was already recorded."""
    row = StripeWebhookEvent(stripe_event_id=stripe_event_id, event_type=event_type)
    db.add(row)
    try:
        db.commit()
        logger.info("Stripe webhook idempotency recorded event_id=%s type=%s", stripe_event_id, event_type)
        return True
    except IntegrityError:
        db.rollback()
        logger.info(
            "Stripe webhook duplicate delivery skipped event_id=%s type=%s",
            stripe_event_id,
            event_type,
        )
        return False


def handle_stripe_webhook_event(db: Session, event: dict[str, Any]) -> None:
    """Sync billing state and enqueue transactional emails (no Resend in this thread)."""
    etype = str(event.get("type") or "")
    obj = _event_object(event)

    subscription_dict: dict[str, Any] | None = None
    invoice_dict: dict[str, Any] | None = None

    try:
        if etype in _HANDLED_SYNC_TYPES:
            _run_subscription_sync(etype, obj, db)
        if etype == "charge.refunded":
            pass
    except Exception:
        logger.exception("Stripe subscription sync failed event_type=%s", etype)

    try:
        if etype == "checkout.session.completed":
            sub_id = _subscription_id_from_value(obj.get("subscription"))
            if sub_id:
                stripe_sub = stripe.Subscription.retrieve(
                    sub_id, expand=_SUBSCRIPTION_RETRIEVE_EXPAND
                )
                subscription_dict = _to_plain_dict(stripe_sub)

        elif etype in (
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
            "customer.subscription.trial_will_end",
        ):
            sub_id = obj.get("id")
            if isinstance(sub_id, str):
                stripe_sub = stripe.Subscription.retrieve(
                    sub_id, expand=_SUBSCRIPTION_RETRIEVE_EXPAND
                )
                subscription_dict = _to_plain_dict(stripe_sub)

        elif etype in ("invoice.payment_succeeded", "invoice.payment_failed"):
            invoice_dict = obj
            sub_id = _subscription_id_from_value(obj.get("subscription"))
            if sub_id:
                stripe_sub = stripe.Subscription.retrieve(
                    sub_id, expand=_SUBSCRIPTION_RETRIEVE_EXPAND
                )
                subscription_dict = _to_plain_dict(stripe_sub)

        elif etype == "charge.refunded":
            invoice_dict = None

    except stripe.StripeError as exc:
        logger.error("Stripe API error building email context type=%s: %s", etype, exc)
    except Exception:
        logger.exception("Unexpected error building Stripe email context type=%s", etype)

    jobs = map_stripe_event(event, subscription=subscription_dict, invoice=invoice_dict)
    if not jobs:
        logger.debug("No billing emails mapped for type=%s", etype)
        return

    stripe_customer_id = _resolve_stripe_customer_id(etype, obj, subscription_dict)
    user, company = _resolve_user_and_company(db, stripe_customer_id)
    if not user or not (user.email or "").strip():
        logger.warning(
            "Skip billing emails: no user or email for customer_id=%s event_type=%s",
            stripe_customer_id,
            etype,
        )
        return
    if not company:
        logger.warning(
            "Skip billing emails: no company for user_id=%s stripe_event=%s (onboarding incomplete)",
            user.id,
            event.get("id"),
        )
        return

    evt_id = str(event.get("id") or "")
    base_ctx = _base_email_context(user)
    for job in jobs:
        _enqueue_billing_email(db, evt_id, user, company, job, base_ctx)

    # After a downgrade, log the over-limit state for observability.
    # No data is modified — this is purely a diagnostic log.
    if any(j.template == "plan_downgraded" for j in jobs):
        try:
            sub_orm = get_subscription(user, db)
            policy = get_policy_for_subscription(sub_orm)
            new_plan = (sub_orm.plan_display_name or "unknown").lower() if sub_orm else "unknown"
            over_limit = get_over_limit_status(db, company.id, policy)
            if over_limit.any_over_limit():
                logger.warning(
                    "Account over limit after subscription downgrade user_id=%s plan=%s "
                    "over_limit=%s counts=%s limits=%s",
                    user.id,
                    new_plan,
                    {
                        "locations": over_limit.locations,
                        "active_surveys": over_limit.active_surveys,
                        "active_flows": over_limit.active_flows,
                    },
                    over_limit.counts,
                    over_limit.limits,
                )
            else:
                logger.info(
                    "Subscription downgrade within limits user_id=%s plan=%s",
                    user.id,
                    new_plan,
                )
        except Exception:
            logger.exception("Failed to compute over-limit state after downgrade user_id=%s", user.id)


def _run_subscription_sync(etype: str, obj: dict[str, Any], db: Session) -> None:
    if etype == "checkout.session.completed":
        sub_id = _subscription_id_from_value(obj.get("subscription"))
        if not sub_id:
            return
        stripe_sub = stripe.Subscription.retrieve(
            sub_id, expand=_SUBSCRIPTION_RETRIEVE_EXPAND
        )
        sync_subscription_from_stripe_object(stripe_sub, db)
        return

    if etype in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "customer.subscription.trial_will_end",
    ):
        sub_id = obj.get("id")
        if not isinstance(sub_id, str):
            return
        stripe_sub = stripe.Subscription.retrieve(
            sub_id, expand=_SUBSCRIPTION_RETRIEVE_EXPAND
        )
        sync_subscription_from_stripe_object(stripe_sub, db)
        return

    if etype in ("invoice.payment_succeeded", "invoice.payment_failed"):
        sub_id = _subscription_id_from_value(obj.get("subscription"))
        if not sub_id:
            return
        stripe_sub = stripe.Subscription.retrieve(
            sub_id, expand=_SUBSCRIPTION_RETRIEVE_EXPAND
        )
        sync_subscription_from_stripe_object(stripe_sub, db)
        return


def _resolve_stripe_customer_id(
    etype: str,
    obj: dict[str, Any],
    subscription_dict: dict[str, Any] | None,
) -> str | None:
    if subscription_dict:
        c = subscription_dict.get("customer")
        if isinstance(c, str):
            return c
        if isinstance(c, dict) and c.get("id"):
            return str(c["id"])
    c = obj.get("customer")
    if isinstance(c, str):
        return c
    if isinstance(c, dict) and c.get("id"):
        return str(c["id"])
    return None


def _resolve_user_and_company(
    db: Session,
    stripe_customer_id: str | None,
) -> tuple[User | None, Company | None]:
    if not stripe_customer_id:
        return None, None
    sub = db.query(Subscription).filter(Subscription.stripe_customer_id == stripe_customer_id).first()
    if not sub:
        return None, None
    user = db.query(User).filter(User.id == sub.user_id).first()
    if not user:
        return None, None
    company = (
        db.query(Company)
        .filter(Company.owner_user_id == user.id, Company.deleted_at.is_(None))
        .first()
    )
    return user, company


def _base_email_context(user: User) -> dict[str, Any]:
    origin = _FRONTEND_ORIGIN or "https://app.venuevoice.com.au"
    return {
        "first_name": user.first_name or "there",
        "manage_subscription_url": f"{origin}/dashboard/settings/manage-subscription",
        "dashboard_url": f"{origin}/dashboard",
    }


_TEMPLATES_TRIAL_END = frozenset({"trial_started", "trial_ending_soon"})
_TEMPLATES_NEXT_BILLING = frozenset(
    {
        "subscription_activated",
        "plan_upgraded",
        "plan_downgraded",
        "billing_interval_changed",
        "payment_success",
        "reactivation",
    }
)


def apply_user_timezone_to_billing_context(
    db: Session,
    user: User,
    merged: dict[str, Any],
    *,
    template: str,
) -> None:
    """Convert ``*_unix`` fields from ``stripe_event_mapper`` into localized ``*_display`` strings.

    Internal unix keys are removed so ``context_json`` never stores them. Queued rows created
    before this change may lack unix fields; optional ``setdefault`` keeps prior strings or "—".
    """
    tz = effective_zoneinfo_for_stored_timezone(user.timezone)

    if "trial_end_unix" in merged:
        raw = merged.pop("trial_end_unix")
        coerced = coerce_stripe_unix_timestamp(raw)
        merged["trial_end_display"] = (
            (format_unix_epoch_for_email_date_only(coerced, tz) or "—") if coerced else "—"
        )
    elif template in _TEMPLATES_TRIAL_END:
        merged.setdefault("trial_end_display", "—")

    if "current_period_end_unix" in merged:
        raw = merged.pop("current_period_end_unix")
        coerced = coerce_stripe_unix_timestamp(raw)
        merged["next_billing_display"] = (
            (format_unix_epoch_for_email_date_only(coerced, tz) or "—") if coerced else "—"
        )
    elif template in _TEMPLATES_NEXT_BILLING:
        merged.setdefault("next_billing_display", "—")

    if "next_retry_unix" in merged:
        raw = merged.pop("next_retry_unix")
        coerced = coerce_stripe_unix_timestamp(raw)
        merged["next_retry_display"] = (
            (format_unix_epoch_for_email_datetime(coerced, tz) or "—") if coerced else "—"
        )
    elif template == "payment_retrying":
        merged.setdefault("next_retry_display", "—")

    if template == "subscription_canceled":
        raw = merged.pop("access_until_unix", None)
        unix = coerce_stripe_unix_timestamp(raw)
        if unix is None:
            sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
            if sub and sub.current_period_end is not None:
                aware = assume_utc(sub.current_period_end)
                if aware is not None:
                    unix = int(aware.timestamp())
        if unix is not None:
            merged["access_until_display"] = format_unix_epoch_for_email_datetime(unix, tz) or "—"
        else:
            merged.setdefault("access_until_display", "—")


def _enqueue_billing_email(
    db: Session,
    stripe_event_id: str,
    user: User,
    company: Company,
    job: StripeEmailJob,
    base_ctx: dict[str, Any],
) -> None:
    idempotency_key = f"{stripe_event_id}:{job.template}"
    merged = {**base_ctx, **job.context}
    apply_user_timezone_to_billing_context(db, user, merged, template=job.template)
    row = EmailEvent(
        company_id=company.id,
        flow_run_id=None,
        recipient_email=user.email.strip().lower(),
        status="pending",
        event_category=EMAIL_CATEGORY_STRIPE_BILLING,
        template_name=job.template,
        stripe_event_id=stripe_event_id or None,
        idempotency_key=idempotency_key,
        context_json=merged,
    )
    db.add(row)
    try:
        db.commit()
        logger.info(
            "Billing email queued template=%s user_id=%s idempotency_key=%s",
            job.template,
            user.id,
            idempotency_key,
        )
    except IntegrityError:
        db.rollback()
        logger.info("Billing email dedup skip idempotency_key=%s", idempotency_key)
