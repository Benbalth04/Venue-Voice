from fastapi import APIRouter, Depends, Request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth.jwt import get_current_user
from ..auth.membership import get_company_from_membership, get_current_membership
from ..core.errors.exceptions import ConflictError, PermissionError as AppPermissionError
from ..core.rate_limit import check_rate_limit, check_user_rate_limit
from ..core.timezone_australia import assert_allowed_timezone_string
from ..db.postgres import get_db_connection
from ..models.postgres_model import Company as CompanyORM
from ..models.postgres_model import Location as LocationORM
from ..models.postgres_model import Membership as MembershipORM
from ..models.postgres_model import Subscription as SubscriptionORM
from ..models.postgres_model import User as UserORM
from ..integrations.supabase_admin import send_password_reset_email
from ..schemas.pydantic_model import (
    CompleteInviteRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    MembershipSummary,
    SetupAccountRequest,
    SubscriptionStatusResponse,
    UpdateUserTimezoneRequest,
    UserResponse,
)

router = APIRouter()


def _subscription_plan_name(db: Session, company_id) -> str | None:
    sub = db.query(SubscriptionORM).filter(SubscriptionORM.company_id == company_id).first()
    if sub and sub.plan_display_name and str(sub.plan_display_name).strip():
        return str(sub.plan_display_name).strip()
    return None


def _build_user_response(db: Session, user: UserORM) -> UserResponse:
    # Resolve all memberships for this user with their company names
    rows = (
        db.query(MembershipORM, CompanyORM)
        .join(CompanyORM, MembershipORM.company_id == CompanyORM.id)
        .filter(
            MembershipORM.user_id == user.id,
            CompanyORM.deleted_at.is_(None),
        )
        .all()
    )

    memberships: list[MembershipSummary] = [
        MembershipSummary(
            membership_id=m.id,
            company_id=m.company_id,
            company_name=c.name,
            role=m.role,
            all_surveys=m.all_surveys,
            all_locations=m.all_locations,
        )
        for m, c in rows
    ]

    # company_name: prefer owner or admin company; fall back to first membership
    company_name: str | None = None
    admin_rows = [(m, c) for m, c in rows if m.role in ("company_owner", "company_admin")]
    if admin_rows:
        company_name = admin_rows[0][1].name
    elif rows:
        company_name = rows[0][1].name

    # subscription_plan_name: look up the company's subscription directly.
    # For admins, use their admin company; for viewers, use the first membership's company.
    plan_name: str | None = None
    if admin_rows:
        plan_name = _subscription_plan_name(db, admin_rows[0][1].id)
    elif rows:
        plan_name = _subscription_plan_name(db, rows[0][1].id)

    display_name = f"{user.first_name} {user.last_name}".strip() or "User"
    return UserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        onboarding_complete=user.onboarding_complete,
        invite_pending=user.invite_pending,
        email_verified=user.email_verified,
        timezone=user.timezone,
        subscription_plan_name=plan_name,
        company_name=company_name,
        user_display_name=display_name,
        memberships=memberships,
    )


@router.get("/user", response_model=UserResponse)
def get_me(
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Return current user profile. Triggers auto-bootstrap if user does not exist."""
    return _build_user_response(db, user)


@router.patch("/user/timezone", response_model=UserResponse)
def patch_user_timezone(
    payload: UpdateUserTimezoneRequest,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    user.timezone = assert_allowed_timezone_string(payload.timezone)
    db.commit()
    db.refresh(user)
    return _build_user_response(db, user)


@router.post("/user/confirm-email")
def confirm_email(
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Mark the authenticated user's email as verified. Called by the frontend
    after Supabase successfully processes an email verification link."""
    if not user.email_verified:
        user.email_verified = True
        db.commit()
    return {"ok": True}


@router.get("/me/subscription/status", response_model=SubscriptionStatusResponse)
def get_subscription_status(
    membership: MembershipORM = Depends(get_current_membership),
    db: Session = Depends(get_db_connection),
):
    """Return subscription status for the account. No tier-based limits are enforced."""
    return SubscriptionStatusResponse(
        plan=None,
        over_limit={},
        warnings=[],
        can_invite_users=True,
        max_company_members=-1,
    )


@router.post("/setup-account")
def setup_account(
    payload: SetupAccountRequest,
    request: Request,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Complete onboarding: create Company + Location + Membership, set onboarding_complete."""
    check_rate_limit(request, "setup_account", limit=5, window=3600)
    if user.onboarding_complete:
        return {"ok": True, "message": "Onboarding already complete"}

    tz = assert_allowed_timezone_string(payload.timezone)
    user.timezone = tz

    # Idempotency: check if this user already owns a company (company_owner membership)
    existing_owner_membership = (
        db.query(MembershipORM)
        .filter(
            MembershipORM.user_id == user.id,
            MembershipORM.role == "company_owner",
        )
        .first()
    )
    if existing_owner_membership:
        user.onboarding_complete = True
        db.commit()
        return {"ok": True, "message": "Onboarding already complete"}

    company = CompanyORM(
        name=(payload.company_name).strip(),
        primary_industry=payload.primary_industry,
        company_size=payload.company_size,
        location_count=payload.location_count,
        how_heard=payload.how_heard,
    )
    db.add(company)
    db.flush()  # Assign company.id before referencing it

    location = LocationORM(
        company_id=company.id,
        name=payload.location_name,
        is_active=True,
        state=payload.location_state,
        country=payload.location_country,
        google_business_url=payload.location_google_business_url,
    )
    db.add(location)

    # Create company_owner membership for the company creator
    _ensure_admin_membership(db, user.id, company.id, role="company_owner")

    user.onboarding_complete = True
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError(code="ONBOARDING_CONFLICT", message="Account setup already completed. Please refresh.")

    return {"ok": True, "message": "Onboarding complete"}


@router.post("/me/complete-join", response_model=UserResponse)
def complete_join(
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Mark onboarding complete for a user who joined via invite.

    Checks the user has at least one membership (added by an admin), then sets
    onboarding_complete=True so they can access the dashboard.
    """
    membership = (
        db.query(MembershipORM)
        .filter(
            MembershipORM.user_id == current_user.id,
            MembershipORM.deleted_at.is_(None),
        )
        .first()
    )
    if not membership:
        raise AppPermissionError(
            code="NO_MEMBERSHIP_FOUND",
            message="You haven't been added to any company yet. Ask your admin to invite you.",
        )

    current_user.onboarding_complete = True
    db.commit()
    db.refresh(current_user)
    return _build_user_response(db, current_user)


@router.patch("/me/complete-invite", response_model=UserResponse)
def complete_invite(
    payload: CompleteInviteRequest,
    request: Request,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Save name and timezone for a user completing their invite setup.

    Called from the /onboarding/invite-setup page after the user sets their
    password, optionally updates their name, and selects a timezone.
    """
    check_user_rate_limit(str(current_user.id), "complete_invite", limit=10, window=3600)
    current_user.first_name = payload.first_name.strip()
    current_user.last_name = payload.last_name.strip()
    current_user.timezone = assert_allowed_timezone_string(payload.timezone)
    current_user.invite_pending = False
    db.commit()
    db.refresh(current_user)
    return _build_user_response(db, current_user)


@router.post("/auth/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(body: ForgotPasswordRequest, request: Request):
    """Request a password reset email.

    Public endpoint — no authentication required. Always returns the same success
    message regardless of whether the email is registered to prevent enumeration.
    """
    check_rate_limit(request, "forgot_password", limit=5, window=3600)
    send_password_reset_email(email=str(body.email))
    return ForgotPasswordResponse(
        message="If an account exists for this email, you will receive a password reset link shortly."
    )


def _ensure_admin_membership(
    db: Session, user_id, company_id, role: str = "company_admin"
) -> None:
    """Upsert a membership with the given role. Safe to call on re-runs."""
    existing = (
        db.query(MembershipORM)
        .filter(
            MembershipORM.user_id == user_id,
            MembershipORM.company_id == company_id,
        )
        .first()
    )
    if not existing:
        membership = MembershipORM(
            user_id=user_id,
            company_id=company_id,
            role=role,
            all_surveys=True,
            all_locations=True,
        )
        db.add(membership)
        db.flush()
