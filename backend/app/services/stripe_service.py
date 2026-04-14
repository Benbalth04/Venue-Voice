"""Stripe integration service.

All direct Stripe API calls are isolated here so that billing.py, the webhook
handler, and the reconciliation job share one consistent layer.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import stripe
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.errors.exceptions import ExternalAPIError, NotFoundError, PermissionError, ValidationError
from ..core.observability import track_external_call
from ..models.postgres_model import Company, Subscription, User
from ..services.billing.stripe_billing_display import plan_display_name_from_price

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Stripe client initialisation
# ---------------------------------------------------------------------------
_FREE_TRIAL_DAYS = settings.default_free_trial_days
_APP_ORIGIN = settings.app_origin

_PLAN_PRICE_IDS: dict[tuple[str, str], str | None] = {
    ("starter", "monthly"): settings.starter_plan_monthly_price_id,
    ("starter", "yearly"): settings.starter_plan_yearly_price_id,
    ("growth", "monthly"): settings.growth_plan_monthly_price_id,
    ("growth", "yearly"): settings.growth_plan_yearly_price_id,
    ("pro", "monthly"): settings.pro_plan_monthly_price_id,
    ("pro", "yearly"): settings.pro_plan_yearly_price_id,
}

# Reverse map: price_id → (plan_key, display_name). Single source of truth for
# translating a Stripe price ID back to our internal plan representation.
PRICE_ID_TO_PLAN: dict[str, tuple[str, str]] = {
    pid: (plan, plan.title())
    for (plan, _interval), pid in _PLAN_PRICE_IDS.items()
    if pid
}

_STRIPE_CUSTOMER_PORTAL_ID = settings.stripe_customer_portal_id

stripe.api_key = settings.stripe_secret_key

# ---------------------------------------------------------------------------
# Active subscription check (shared logic)
# ---------------------------------------------------------------------------
_GRACE_PERIOD_DAYS = 3

_ALLOWED_DB_SUBSCRIPTION_STATUSES = frozenset(
    {
        "trialing",
        "active",
        "pending_cancel",
        "past_due",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "unpaid",
    }
)


def _access_within_trial_or_billing_period(sub: Subscription, now: datetime) -> bool:
    """True if trial is still running, else if the current billing period has not ended."""
    if sub.trial_end is not None:
        trial_end = sub.trial_end
        if trial_end.tzinfo is None:
            trial_end = trial_end.replace(tzinfo=timezone.utc)
        if trial_end > now:
            return True
    if sub.current_period_end is None:
        return False
    period_end = sub.current_period_end
    if period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=timezone.utc)
    return period_end > now


def db_subscription_status_from_stripe(stripe_sub: stripe.Subscription) -> str:
    """Map Stripe subscription fields to the value stored on ``subscriptions.status``.

    When cancellation is scheduled at period end but Stripe still reports ``active`` or
    ``trialing``, we persist ``pending_cancel`` so the product can distinguish that state.
    """
    stripe_status = getattr(stripe_sub, "status", None) or "incomplete"
    cancel_at_end = bool(getattr(stripe_sub, "cancel_at_period_end", False))
    if cancel_at_end and stripe_status in ("active", "trialing"):
        return "pending_cancel"
    if stripe_status in _ALLOWED_DB_SUBSCRIPTION_STATUSES:
        return stripe_status
    logger.warning("Unknown Stripe subscription status %s, storing as incomplete", stripe_status)
    return "incomplete"


def is_subscription_active(sub: Subscription | None) -> bool:
    """Return True if the subscription grants access.

    Rules:
    - trialing: active if trial_end is in the future (or not set)
    - active: always active
    - pending_cancel: active until trial_end or current_period_end (same access window as before cancel)
    - past_due: granted a 3-day grace period beyond current_period_end
    - everything else (canceled, incomplete, …): blocked
    """
    if sub is None:
        return False

    now = datetime.now(timezone.utc)

    if sub.status == "active":
        return True

    if sub.status == "pending_cancel":
        return _access_within_trial_or_billing_period(sub, now)

    if sub.status == "trialing":
        if sub.trial_end is None:
            return True
        trial_end = sub.trial_end
        if trial_end.tzinfo is None:
            trial_end = trial_end.replace(tzinfo=timezone.utc)
        return trial_end > now

    if sub.status == "past_due":
        if sub.current_period_end is None:
            return False
        grace_deadline = sub.current_period_end
        if grace_deadline.tzinfo is None:
            grace_deadline = grace_deadline.replace(tzinfo=timezone.utc)
        from datetime import timedelta
        return (grace_deadline + timedelta(days=_GRACE_PERIOD_DAYS)) > now

    return False


# ---------------------------------------------------------------------------
# Customer helpers
# ---------------------------------------------------------------------------

def get_or_create_stripe_customer(company: Company, owner: User, db: Session) -> str:
    """Return the Stripe customer ID for this company, creating one if needed.

    The customer ID is persisted in the subscriptions table.  If no
    subscription row exists yet we create a minimal one just to store the
    customer ID.
    """
    sub = db.query(Subscription).filter(Subscription.company_id == company.id).first()
    if sub and sub.stripe_customer_id:
        return sub.stripe_customer_id

    try:
        with track_external_call("stripe", "customer_create"):
            customer = stripe.Customer.create(
                email=owner.email,
                name=company.name,
                metadata={"company_id": str(company.id)},
            )
    except stripe.StripeError as exc:
        raise ExternalAPIError(
            service_name="Stripe",
            error_message=f"Failed to create Stripe customer: {exc}",
        ) from exc

    if sub:
        sub.stripe_customer_id = customer.id
        sub.updated_at = datetime.utcnow()
    else:
        sub = Subscription(
            company_id=company.id,
            stripe_customer_id=customer.id,
            status="incomplete",
        )
        db.add(sub)

    db.commit()
    return customer.id


# ---------------------------------------------------------------------------
# Checkout session
# ---------------------------------------------------------------------------

def _price_id_for_plan(plan: str, billing_interval: str) -> str:
    raw = _PLAN_PRICE_IDS.get((plan, billing_interval))
    price_id = (raw or "").strip()
    if not price_id:
        raise ExternalAPIError(
            service_name="Stripe",
            error_message=(
                f"Stripe price ID is not configured for plan={plan!r} "
                f"billing_interval={billing_interval!r}. Set the matching "
                "*_PLAN_*_PRICE_ID environment variable."
            ),
        )
    return price_id


def create_checkout_session(company: Company, owner: User, db: Session, plan: str, billing_interval: str) -> str:
    """Create a Stripe Checkout session and return the hosted URL.

    - Uses the price ID for the requested plan and billing interval from env.
    - Applies a free trial when the company has never had one.
    - Sets trial_from_plan=False so Stripe does not grant a second trial on
      re-subscription.
    """
    price_id = _price_id_for_plan(plan, billing_interval)
    customer_id = get_or_create_stripe_customer(company, owner, db)

    sub = db.query(Subscription).filter(Subscription.company_id == company.id).first()
    already_trialled = sub and sub.status not in ("incomplete",)

    subscription_data: dict = {}
    if not already_trialled and _FREE_TRIAL_DAYS > 0:
        subscription_data["trial_period_days"] = _FREE_TRIAL_DAYS

    try:
        with track_external_call("stripe", "checkout_session_create"):
            session = stripe.checkout.Session.create(
                customer=customer_id,
                mode="subscription",
                line_items=[{"price": price_id, "quantity": 1}],
                subscription_data=subscription_data,
                metadata={"company_id": str(company.id)},
                success_url=f"{_APP_ORIGIN}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{_APP_ORIGIN}/billing/failed?session_id={{CHECKOUT_SESSION_ID}}",
            )
    except stripe.StripeError as exc:
        raise ExternalAPIError(
            service_name="Stripe",
            error_message=f"Failed to create checkout session: {exc}",
        ) from exc

    return session.url


def verify_checkout_session_for_company(session_id: str, company: Company, db: Session) -> None:
    """Ensure a Stripe Checkout Session is complete and owned by ``company``.

    Supports both the new ``company_id`` metadata key and the legacy ``user_id``
    key (for sessions created before the company-based migration).

    Raises ``ValidationError`` or ``PermissionError`` on failure.
    """
    sid = (session_id or "").strip()
    if not sid:
        raise ValidationError(
            code="MISSING_SESSION_ID",
            message="session_id is required",
        )

    try:
        with track_external_call("stripe", "checkout_session_retrieve"):
            co = stripe.checkout.Session.retrieve(sid)
    except stripe.InvalidRequestError as exc:
        raise ValidationError(
            code="INVALID_CHECKOUT_SESSION",
            message="Could not retrieve checkout session.",
        ) from exc
    except stripe.StripeError as exc:
        raise ExternalAPIError(
            service_name="Stripe",
            error_message=f"Failed to verify checkout session: {exc}",
        ) from exc

    if getattr(co, "status", None) != "complete":
        raise ValidationError(
            code="CHECKOUT_NOT_COMPLETE",
            message="Checkout session is not complete.",
        )

    if getattr(co, "mode", None) != "subscription":
        raise ValidationError(
            code="INVALID_CHECKOUT_MODE",
            message="Invalid checkout session mode.",
        )

    raw_meta = getattr(co, "metadata", None)
    meta: dict = {}
    if raw_meta:
        meta = dict(raw_meta) if hasattr(raw_meta, "items") else {}

    # Primary: check company_id in session metadata
    meta_company_id = meta.get("company_id")

    # Last resort: check Stripe customer metadata
    if not meta_company_id:
        raw_customer = getattr(co, "customer", None)
        customer_id = raw_customer if isinstance(raw_customer, str) else getattr(raw_customer, "id", None)
        if customer_id:
            try:
                with track_external_call("stripe", "customer_retrieve"):
                    cust = stripe.Customer.retrieve(customer_id)
                raw_customer_meta = getattr(cust, "metadata", None)
                cm = dict(raw_customer_meta) if hasattr(raw_customer_meta, "items") else {}
                meta_company_id = cm.get("company_id")
            except stripe.StripeError:
                pass

    if not meta_company_id or str(company.id) != meta_company_id:
        raise PermissionError(
            code="CHECKOUT_SESSION_COMPANY_MISMATCH",
            message="This checkout does not belong to your company.",
        )


# ---------------------------------------------------------------------------
# Customer portal session
# ---------------------------------------------------------------------------

def create_portal_session(company: Company, db: Session) -> str:
    """Create a Stripe Customer Portal session and return the URL."""
    sub = db.query(Subscription).filter(Subscription.company_id == company.id).first()
    if not sub or not sub.stripe_customer_id:
        raise NotFoundError(
            code="NO_SUBSCRIPTION",
            message="No billing account found for this company.",
        )

    portal_config = (_STRIPE_CUSTOMER_PORTAL_ID or "").strip() or None
    if not portal_config:
        logger.warning("STRIPE_CUSTOMER_PORTAL_ID is not set — portal will use Stripe default config")

    try:
        create_params: dict = {
            "customer": sub.stripe_customer_id,
            "return_url": f"{_APP_ORIGIN}/dashboard/settings/manage-subscription/callback",
        }
        if portal_config:
            create_params["configuration"] = portal_config
        with track_external_call("stripe", "portal_session_create"):
            session = stripe.billing_portal.Session.create(**create_params)
    except stripe.StripeError as exc:
        raise ExternalAPIError(
            service_name="Stripe",
            error_message=f"Failed to create portal session: {exc}",
        ) from exc

    return session.url


# ---------------------------------------------------------------------------
# Subscription sync (used by webhook handler + reconciliation)
# ---------------------------------------------------------------------------

def _price_from_stripe_subscription(stripe_sub: stripe.Subscription):
    """Extract the first price object from a Stripe subscription, or None.

    Handles both Stripe SDK objects (attribute access) and plain dicts
    (dict access) since callers may pass either depending on the code path.
    """
    if isinstance(stripe_sub, dict):
        items_raw = stripe_sub.get("items") or {}
        data = items_raw.get("data") if isinstance(items_raw, dict) else []
    else:
        items = getattr(stripe_sub, "items", None)
        if items is None:
            return None
        # ListObject exposes .data; fall back to dict-style for safety
        data = getattr(items, "data", None)
        if data is None and hasattr(items, "get"):
            data = items.get("data")

    if not data:
        return None

    item = data[0]
    if isinstance(item, dict):
        return item.get("price")

    price = getattr(item, "price", None)
    # Final fallback: dict-style in case SDK version stores it differently
    if price is None and hasattr(item, "get"):
        price = item.get("price")
    return price


def plan_display_name_from_price_id(price_id: str | None) -> str | None:
    """Return the human-readable plan name for a Stripe price ID, or None."""
    if not price_id:
        return None
    entry = PRICE_ID_TO_PLAN.get(price_id)
    return entry[1] if entry else None


def _price_id_from_price(price: Any) -> str | None:
    """Extract the price ID regardless of whether price is a string, dict, or SDK object."""
    if isinstance(price, str):
        return price or None
    if isinstance(price, dict):
        return price.get("id") or None
    if price is None:
        return None
    pid = getattr(price, "id", None)
    if pid is None and hasattr(price, "get"):
        pid = price.get("id")
    return pid or None


def _plan_display_name_from_stripe_subscription(stripe_sub: stripe.Subscription) -> str | None:
    price = _price_from_stripe_subscription(stripe_sub)
    if price is None:
        return None
    # Primary: look up our known price IDs via centralized map
    price_id = _price_id_from_price(price)
    name = plan_display_name_from_price_id(price_id)
    if name:
        return name
    # Fallback: use Stripe price metadata (nickname / product name / price ID)
    if isinstance(price, dict):
        price_dict = price
    else:
        try:
            price_dict = price.to_dict()
        except Exception:
            price_dict = {}
    name = plan_display_name_from_price(price_dict)
    return name if name else None


def _billing_interval_from_stripe_subscription(stripe_sub: stripe.Subscription) -> str | None:
    price = _price_from_stripe_subscription(stripe_sub)
    if price is None:
        return None
    # Primary: look up our known price IDs
    price_id = _price_id_from_price(price)
    if price_id:
        for (plan, interval), pid in _PLAN_PRICE_IDS.items():
            if pid and pid == price_id:
                return interval  # "monthly" or "yearly"
    # Fallback: derive from Stripe recurring.interval
    if isinstance(price, dict):
        recurring = price.get("recurring")
    else:
        recurring = getattr(price, "recurring", None)
        if recurring is None and hasattr(price, "get"):
            recurring = price.get("recurring")
    if recurring:
        stripe_interval = (
            recurring.get("interval") if isinstance(recurring, dict)
            else getattr(recurring, "interval", None)
        )
        if stripe_interval == "month":
            return "monthly"
        if stripe_interval == "year":
            return "yearly"
    return None


def sync_subscription_from_stripe_object(stripe_sub: stripe.Subscription, db: Session) -> None:
    """Upsert the local Subscription row from a Stripe subscription object.

    This is idempotent — safe to call multiple times for the same event.
    """
    raw_customer = getattr(stripe_sub, "customer", None)
    customer_id: str = raw_customer if isinstance(raw_customer, str) else getattr(raw_customer, "id", None)
    if not customer_id:
        logger.error("Cannot sync subscription: missing customer on stripe object")
        return

    sub_id = getattr(stripe_sub, "id", "?")
    sub_status = getattr(stripe_sub, "status", "?")
    logger.debug("Syncing subscription id=%s status=%s customer=%s", sub_id, sub_status, customer_id)

    sub = db.query(Subscription).filter(
        Subscription.stripe_customer_id == customer_id
    ).first()

    if sub is None:
        logger.debug("No local subscription row for customer=%s — attempting to create one", customer_id)
        import uuid as _uuid

        # Resolve company_id from metadata: prefer company_id, fall back to legacy user_id
        metadata = getattr(stripe_sub, "metadata", None) or {}
        meta_dict = dict(metadata) if hasattr(metadata, "items") else {}
        company_id_str = meta_dict.get("company_id")

        if not company_id_str:
            # Try customer-level metadata
            try:
                with track_external_call("stripe", "customer_retrieve"):
                    customer = stripe.Customer.retrieve(customer_id)
                raw_customer_meta = getattr(customer, "metadata", None)
                customer_meta = (
                    dict(raw_customer_meta) if hasattr(raw_customer_meta, "items") else {}
                )
                company_id_str = customer_meta.get("company_id")
            except stripe.StripeError as exc:
                logger.error("Failed to retrieve Stripe customer %s: %s", customer_id, exc)

        if not company_id_str:
            logger.error(
                "Cannot sync subscription: no company_id for Stripe customer %s",
                customer_id,
            )
            return

        sub = Subscription(
            company_id=_uuid.UUID(company_id_str),
            stripe_customer_id=customer_id,
        )
        db.add(sub)
        logger.info("Created local subscription row for company_id=%s", company_id_str)
    else:
        logger.debug("Found existing subscription row id=%s status=%s", sub.id, sub.status)

    sub.stripe_subscription_id = getattr(stripe_sub, "id", None)
    sub.status = db_subscription_status_from_stripe(stripe_sub)

    trial_end_ts = getattr(stripe_sub, "trial_end", None)
    sub.trial_end = datetime.utcfromtimestamp(trial_end_ts) if trial_end_ts else None

    current_period_end_ts = getattr(stripe_sub, "current_period_end", None)
    if current_period_end_ts:
        sub.current_period_end = datetime.utcfromtimestamp(current_period_end_ts)

    price = _price_from_stripe_subscription(stripe_sub)
    sub.price_id = _price_id_from_price(price) if price is not None else None
    sub.plan_display_name = _plan_display_name_from_stripe_subscription(stripe_sub)
    sub.billing_interval = _billing_interval_from_stripe_subscription(stripe_sub)
    logger.debug(
        "Subscription price sync sub=%s price_id=%s plan=%s interval=%s",
        sub_id, sub.price_id, sub.plan_display_name, sub.billing_interval,
    )
    sub.cancel_at_period_end = bool(getattr(stripe_sub, "cancel_at_period_end", False))
    sub.updated_at = datetime.utcnow()

    try:
        db.commit()
    except Exception as exc:
        logger.error("DB commit failed while syncing subscription %s: %s", sub_id, exc)
        db.rollback()
        raise

    logger.info(
        "Synced subscription %s → status=%s customer=%s",
        sub_id,
        sub_status,
        customer_id,
    )


def get_company_subscription(company: Company, db: Session) -> Subscription | None:
    return db.query(Subscription).filter(Subscription.company_id == company.id).first()


