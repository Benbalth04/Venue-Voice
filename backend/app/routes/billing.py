"""Billing routes — all require a valid JWT and company_admin role."""
from __future__ import annotations

import logging

import stripe
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo

from ..auth.membership import get_company_from_membership, get_current_membership, require_company_admin, require_company_owner
from ..auth.user_timezone import get_user_zoneinfo
from ..core.datetime_user_tz import to_iso8601_zoned
from ..core.errors.exceptions import NotFoundError
from ..db.postgres import get_db_connection
from ..models.postgres_model import Membership, Subscription, User
from ..schemas.pydantic_model import (
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    PlanLimitsResponse,
    PortalSessionResponse,
    SubscriptionResponse,
    SyncSubscriptionResponse,
    VerifyCheckoutSessionResponse,
)
from ..core.rate_limit import check_user_rate_limit
from ..services.plan_policy import get_policy_for_subscription
from ..services.stripe_service import (
    create_checkout_session,
    create_portal_session,
    get_company_subscription,
    is_subscription_active,
    sync_subscription_from_stripe_object,
    verify_checkout_session_for_company,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/billing",
    tags=["billing"],
)


def _build_subscription_response(sub: Subscription, user_tz: ZoneInfo) -> dict:
    """Build the shared subscription response dict from a Subscription ORM row."""
    policy = get_policy_for_subscription(sub)
    plan_limits = PlanLimitsResponse(
        max_locations=policy.max_locations,
        max_active_surveys=policy.max_active_surveys,
        max_active_flows=policy.max_active_flows,
        max_branch_nodes_per_flow=policy.max_branch_nodes_per_flow,
        can_use_photo_feedback=policy.can_use_photo_feedback,
        can_expand_charts=policy.can_expand_charts,
    )
    return dict(
        status=sub.status,
        trial_end=to_iso8601_zoned(sub.trial_end, user_tz),
        current_period_end=to_iso8601_zoned(sub.current_period_end, user_tz),
        stripe_customer_id=sub.stripe_customer_id,
        stripe_subscription_id=sub.stripe_subscription_id,
        plan_display_name=sub.plan_display_name,
        billing_interval=sub.billing_interval,
        cancel_at_period_end=sub.cancel_at_period_end,
        price_id=sub.price_id,
        is_active=is_subscription_active(sub),
        plan_limits=plan_limits,
    )


@router.get("/subscription", response_model=SubscriptionResponse)
def get_subscription_status(
    membership: Membership = Depends(get_current_membership),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    """Return the current company's subscription status."""
    company = get_company_from_membership(membership, db)
    sub = get_company_subscription(company, db)
    if sub is None:
        return SubscriptionResponse(
            status="none",
            is_active=False,
            plan_display_name=None,
            plan_limits=None,
        )
    return SubscriptionResponse(**_build_subscription_response(sub, user_tz))


@router.post("/sync-subscription", response_model=SyncSubscriptionResponse)
def sync_subscription(
    membership: Membership = Depends(require_company_owner),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    """Manually pull the latest subscription state from Stripe for this company.

    Designed for recovery when a webhook was missed or failed. Always returns
    HTTP 200 — Stripe connectivity failures are absorbed server-side so users
    never see a provider error. ``sync_successful`` indicates whether Stripe
    was actually reached.
    """
    check_user_rate_limit(str(membership.user_id), "billing_sync_subscription", limit=5, window=300)
    company = get_company_from_membership(membership, db)
    sub = get_company_subscription(company, db)

    if sub is None or not sub.stripe_customer_id:
        raise NotFoundError(
            code="NO_SUBSCRIPTION",
            message="No Stripe customer found for this account. Please complete checkout first or contact support.",
        )

    try:
        stripe_subs = stripe.Subscription.list(
            customer=sub.stripe_customer_id,
            limit=10,
            expand=["data.items.data.price"],
        )
        for stripe_sub in stripe_subs.data:
            sync_subscription_from_stripe_object(stripe_sub, db)
        db.refresh(sub)
        sync_successful = True
    except stripe.StripeError:
        logger.exception(
            "Stripe API error during manual subscription sync for company %s", company.id
        )
        sync_successful = False

    return SyncSubscriptionResponse(
        **_build_subscription_response(sub, user_tz),
        sync_successful=sync_successful,
    )


@router.get("/verify-checkout-session", response_model=VerifyCheckoutSessionResponse)
def verify_checkout_session(
    session_id: str,
    membership: Membership = Depends(require_company_owner),
    db: Session = Depends(get_db_connection),
):
    """Confirm the Stripe Checkout Session is complete and tied to the current company."""
    company = get_company_from_membership(membership, db)
    verify_checkout_session_for_company(session_id, company, db)
    return VerifyCheckoutSessionResponse(ok=True)


@router.post("/checkout", response_model=CheckoutSessionResponse)
def create_checkout(
    body: CheckoutSessionRequest,
    request: Request,
    membership: Membership = Depends(require_company_owner),
    db: Session = Depends(get_db_connection),
):
    """Create a Stripe Checkout session and return the hosted URL."""
    check_user_rate_limit(str(membership.user_id), "billing_checkout", limit=10, window=3600)
    company = get_company_from_membership(membership, db)
    billing_user = db.query(User).filter(User.id == membership.user_id).first()
    url = create_checkout_session(
        company,
        billing_user,
        db,
        body.plan,
        body.billing_interval,
    )
    return CheckoutSessionResponse(checkout_url=url)


@router.post("/portal", response_model=PortalSessionResponse)
def create_portal(
    request: Request,
    membership: Membership = Depends(require_company_owner),
    db: Session = Depends(get_db_connection),
):
    """Create a Stripe Customer Portal session for managing billing."""
    check_user_rate_limit(str(membership.user_id), "billing_portal", limit=20, window=3600)
    company = get_company_from_membership(membership, db)
    url = create_portal_session(company, db)
    return PortalSessionResponse(portal_url=url)


@router.post("/checkout-failed")
def record_checkout_failed(
    membership: Membership = Depends(require_company_owner),
    db: Session = Depends(get_db_connection),
):
    """Record that the company abandoned or failed a Stripe Checkout session.

    Touches the subscription row's updated_at timestamp so funnel drop-off
    can be tracked via the updated_at field. No new columns required.
    """
    from datetime import datetime

    company = get_company_from_membership(membership, db)
    sub = db.query(Subscription).filter(Subscription.company_id == company.id).first()
    if sub and sub.status == "incomplete":
        sub.updated_at = datetime.utcnow()
        db.commit()
    return {"ok": True}
