"""Billing routes — all require a valid JWT."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo

from ..auth.jwt import get_current_user
from ..auth.user_timezone import get_user_zoneinfo
from ..core.datetime_user_tz import to_iso8601_zoned
from ..db.postgres import get_db_connection
from ..models.postgres_model import User
from ..schemas.pydantic_model import (
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    PortalSessionResponse,
    SubscriptionResponse,
    VerifyCheckoutSessionResponse,
)
from ..services.stripe_service import (
    create_checkout_session,
    create_portal_session,
    get_subscription,
    is_subscription_active,
    verify_checkout_session_for_user,
)

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/subscription", response_model=SubscriptionResponse)
def get_subscription_status(
    current_user: User = Depends(get_current_user),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    """Return the current user's subscription status."""
    sub = get_subscription(current_user, db)
    if sub is None:
        return SubscriptionResponse(
            status="none",
            is_active=False,
            plan_display_name=None,
        )
    return SubscriptionResponse(
        status=sub.status,
        trial_end=to_iso8601_zoned(sub.trial_end, user_tz),
        current_period_end=to_iso8601_zoned(sub.current_period_end, user_tz),
        stripe_customer_id=sub.stripe_customer_id,
        stripe_subscription_id=sub.stripe_subscription_id,
        plan_display_name=sub.plan_display_name,
        is_active=is_subscription_active(sub),
    )


@router.get("/verify-checkout-session", response_model=VerifyCheckoutSessionResponse)
def verify_checkout_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
):
    """Confirm the Stripe Checkout Session is complete and tied to the current user."""
    verify_checkout_session_for_user(session_id, current_user)
    return VerifyCheckoutSessionResponse(ok=True)


@router.post("/checkout", response_model=CheckoutSessionResponse)
def create_checkout(
    body: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Create a Stripe Checkout session and return the hosted URL."""
    url = create_checkout_session(
        current_user,
        db,
        body.plan,
        body.billing_interval,
    )
    return CheckoutSessionResponse(checkout_url=url)


@router.post("/portal", response_model=PortalSessionResponse)
def create_portal(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Create a Stripe Customer Portal session for managing billing."""
    url = create_portal_session(current_user, db)
    return PortalSessionResponse(portal_url=url)


@router.post("/checkout-failed")
def record_checkout_failed(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Record that the user abandoned or failed a Stripe Checkout session.

    Touches the subscription row's updated_at timestamp so funnel drop-off
    can be tracked via the updated_at field. No new columns required.
    """
    from ..models.postgres_model import Subscription
    from datetime import datetime

    sub = db.query(Subscription).filter(Subscription.user_id == current_user.id).first()
    if sub and sub.status == "incomplete":
        sub.updated_at = datetime.utcnow()
        db.commit()
    return {"ok": True}
