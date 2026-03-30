"""Stripe integration service.

All direct Stripe API calls are isolated here so that billing.py, the webhook
handler, and the reconciliation job share one consistent layer.

CLI → Production webhook migration
-----------------------------------
Currently you are using `stripe listen --forward-to localhost:5000/api/v1/webhooks/stripe`
which signs events with the secret printed by the CLI (whsec_...).  Set that
value as STRIPE_WEBHOOK_SECRET in your .env.

When you go to production:
  1. Register the endpoint in the Stripe Dashboard (Developers → Webhooks).
  2. Copy the signing secret from the dashboard into STRIPE_WEBHOOK_SECRET.
  3. No code changes required — the verification logic is identical.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import stripe
from sqlalchemy.orm import Session

from ..core.errors.exceptions import ExternalAPIError, NotFoundError
from ..models.postgres_model import Subscription, User

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Stripe client initialisation
# ---------------------------------------------------------------------------
_STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
_BASIC_PLAN_PRICE_ID = os.getenv("BASIC_PLAN_PRICE_ID")
_FREE_TRIAL_DAYS = int(os.getenv("BASIC_PLAN_FREE_TRIAL_DAYS"))
_APP_ORIGIN = os.getenv("FRONTEND_ORIGIN")

if _STRIPE_SECRET_KEY:
    stripe.api_key = _STRIPE_SECRET_KEY
else:
    logger.warning("STRIPE_SECRET_KEY is not set — Stripe calls will fail")

if not _APP_ORIGIN:
    logger.warning("_APP_ORIGIN not set - Stripe calls wiill fail")

# ---------------------------------------------------------------------------
# Active subscription check (shared logic)
# ---------------------------------------------------------------------------
_GRACE_PERIOD_DAYS = 3


def is_subscription_active(sub: Subscription | None) -> bool:
    """Return True if the subscription grants access.

    Rules:
    - trialing: active if trial_end is in the future (or not set)
    - active: always active
    - past_due: granted a 3-day grace period beyond current_period_end
    - everything else (canceled, incomplete, …): blocked
    """
    if sub is None:
        return False

    now = datetime.now(timezone.utc)

    if sub.status == "active":
        return True

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

def get_or_create_stripe_customer(user: User, db: Session) -> str:
    """Return the Stripe customer ID for this user, creating one if needed.

    The customer ID is persisted in the subscriptions table.  If no
    subscription row exists yet we create a minimal one just to store the
    customer ID.
    """
    sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    if sub and sub.stripe_customer_id:
        return sub.stripe_customer_id

    try:
        customer = stripe.Customer.create(
            email=user.email,
            name=f"{user.first_name} {user.last_name}",
            metadata={"user_id": str(user.id)},
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
            user_id=user.id,
            stripe_customer_id=customer.id,
            status="incomplete",
        )
        db.add(sub)

    db.commit()
    return customer.id


# ---------------------------------------------------------------------------
# Checkout session
# ---------------------------------------------------------------------------

def create_checkout_session(user: User, db: Session) -> str:
    """Create a Stripe Checkout session and return the hosted URL.

    - Applies a free trial when the user has never had one.
    - Sets trial_from_plan=False so Stripe does not grant a second trial on
      re-subscription.
    """
    customer_id = get_or_create_stripe_customer(user, db)

    sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    already_trialled = sub and sub.status not in ("incomplete",)

    subscription_data: dict = {}
    if not already_trialled and _FREE_TRIAL_DAYS > 0:
        subscription_data["trial_period_days"] = _FREE_TRIAL_DAYS

    try:
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": _BASIC_PLAN_PRICE_ID, "quantity": 1}],
            subscription_data=subscription_data,
            success_url=f"{_APP_ORIGIN}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{_APP_ORIGIN}/billing/failed"
            # Prevent a second free trial at the Stripe level too
        )
    except stripe.StripeError as exc:
        raise ExternalAPIError(
            service_name="Stripe",
            error_message=f"Failed to create checkout session: {exc}",
        ) from exc

    return session.url


# ---------------------------------------------------------------------------
# Customer portal session
# ---------------------------------------------------------------------------

def create_portal_session(user: User, db: Session) -> str:
    """Create a Stripe Customer Portal session and return the URL."""
    sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    if not sub or not sub.stripe_customer_id:
        raise NotFoundError(
            code="NO_SUBSCRIPTION",
            message="No billing account found for this user.",
        )

    try:
        session = stripe.billing_portal.Session.create(
            customer=sub.stripe_customer_id,
            return_url=f"{_APP_ORIGIN}/dashboard",
        )
    except stripe.StripeError as exc:
        raise ExternalAPIError(
            service_name="Stripe",
            error_message=f"Failed to create portal session: {exc}",
        ) from exc

    return session.url


# ---------------------------------------------------------------------------
# Subscription sync (used by webhook handler + reconciliation)
# ---------------------------------------------------------------------------

def sync_subscription_from_stripe_object(stripe_sub: stripe.Subscription, db: Session) -> None:
    """Upsert the local Subscription row from a Stripe subscription object.

    This is idempotent — safe to call multiple times for the same event.
    """
    raw_customer = getattr(stripe_sub, "customer", None)
    customer_id: str = raw_customer if isinstance(raw_customer, str) else getattr(raw_customer, "id", None)
    if not customer_id:
        print(f"[STRIPE SYNC] ERROR: Could not resolve customer_id from subscription {getattr(stripe_sub, 'id', '?')}")
        logger.error("Cannot sync subscription: missing customer on stripe object")
        return

    sub_id = getattr(stripe_sub, "id", "?")
    sub_status = getattr(stripe_sub, "status", "?")
    print(f"[STRIPE SYNC] Syncing subscription id={sub_id} status={sub_status} customer={customer_id}")

    sub = db.query(Subscription).filter(
        Subscription.stripe_customer_id == customer_id
    ).first()

    if sub is None:
        print(f"[STRIPE SYNC] No local subscription row found for customer={customer_id} — attempting to create one")
        metadata = getattr(stripe_sub, "metadata", None) or {}
        user_id_str = metadata.get("user_id") if hasattr(metadata, "get") else None
        if not user_id_str:
            try:
                customer = stripe.Customer.retrieve(customer_id)
                customer_meta = getattr(customer, "metadata", None) or {}
                user_id_str = customer_meta.get("user_id") if hasattr(customer_meta, "get") else None
                print(f"[STRIPE SYNC] Resolved user_id={user_id_str} from Stripe customer metadata")
            except stripe.StripeError as exc:
                print(f"[STRIPE SYNC] ERROR: Failed to retrieve customer {customer_id}: {exc}")

        if not user_id_str:
            print(f"[STRIPE SYNC] ERROR: Cannot sync — no user_id found for customer={customer_id}")
            logger.error(
                "Cannot sync subscription: no user_id for Stripe customer %s",
                customer_id,
            )
            return

        import uuid as _uuid
        sub = Subscription(
            user_id=_uuid.UUID(user_id_str),
            stripe_customer_id=customer_id,
        )
        db.add(sub)
        print(f"[STRIPE SYNC] Created new local subscription row for user_id={user_id_str}")
    else:
        print(f"[STRIPE SYNC] Found existing local subscription row id={sub.id} current_status={sub.status}")

    sub.stripe_subscription_id = getattr(stripe_sub, "id", None)
    sub.status = getattr(stripe_sub, "status", "unknown")

    trial_end_ts = getattr(stripe_sub, "trial_end", None)
    sub.trial_end = datetime.utcfromtimestamp(trial_end_ts) if trial_end_ts else None

    current_period_end_ts = getattr(stripe_sub, "current_period_end", None)
    if current_period_end_ts:
        sub.current_period_end = datetime.utcfromtimestamp(current_period_end_ts)

    sub.updated_at = datetime.utcnow()

    try:
        db.commit()
        print(f"[STRIPE SYNC] DB commit successful — subscription={sub_id} status={sub_status} customer={customer_id}")
    except Exception as exc:
        print(f"[STRIPE SYNC] ERROR: DB commit failed: {exc}")
        db.rollback()
        raise

    logger.info(
        "Synced subscription %s → status=%s customer=%s",
        sub_id,
        sub_status,
        customer_id,
    )


def get_subscription(user: User, db: Session) -> Subscription | None:
    return db.query(Subscription).filter(Subscription.user_id == user.id).first()
