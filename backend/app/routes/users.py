from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth.jwt import get_current_user
from ..core.timezone_australia import assert_allowed_timezone_string
from ..db.postgres import get_db_connection
from ..models.postgres_model import Company as CompanyORM
from ..models.postgres_model import Location as LocationORM
from ..models.postgres_model import Subscription as SubscriptionORM
from ..models.postgres_model import User as UserORM
from ..schemas.pydantic_model import (
    SetupAccountRequest,
    UpdateUserTimezoneRequest,
    UserResponse,
)

router = APIRouter()


def _subscription_plan_name(db: Session, user_id) -> str | None:
    sub = db.query(SubscriptionORM).filter(SubscriptionORM.user_id == user_id).first()
    if sub and sub.plan_display_name and str(sub.plan_display_name).strip():
        return str(sub.plan_display_name).strip()
    return None


def _build_user_response(db: Session, user: UserORM) -> UserResponse:
    company_name = None
    if user.onboarding_complete:
        company = (
            db.query(CompanyORM)
            .filter(
                CompanyORM.owner_user_id == user.id,
                CompanyORM.deleted_at.is_(None),
            )
            .first()
        )
        company_name = company.name if company else None

    display_name = f"{user.first_name} {user.last_name}".strip() or "User"
    return UserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        onboarding_complete=user.onboarding_complete,
        email_verified=user.email_verified,
        timezone=user.timezone,
        subscription_plan_name=_subscription_plan_name(db, user.id),
        company_name=company_name,
        user_display_name=display_name,
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


@router.post("/setup-account")
def setup_account(
    payload: SetupAccountRequest,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Complete onboarding: create Company + Location, set onboarding_complete."""
    if user.onboarding_complete:
        return {"ok": True, "message": "Onboarding already complete"}

    tz = assert_allowed_timezone_string(payload.timezone)
    user.timezone = tz

    # UNIQUE on owner_user_id prevents duplicate companies on retries
    existing_company = (
        db.query(CompanyORM)
        .filter(
            CompanyORM.owner_user_id == user.id,
            CompanyORM.deleted_at.is_(None),
        )
        .first()
    )
    if existing_company:
        # Idempotent: already provisioned, just mark complete
        user.onboarding_complete = True
        db.commit()
        return {"ok": True, "message": "Onboarding already complete"}

    company = CompanyORM(
        owner_user_id=user.id,
        name=(payload.company_name).strip(),
        primary_industry=payload.primary_industry,
        company_size=payload.company_size,
        location_count=payload.location_count,
        how_heard=payload.how_heard,
    )
    db.add(company)
    db.flush()

    location = LocationORM(
        company_id=company.id,
        name=payload.location_name,
        is_active=True,
        state=payload.location_state,
        country=payload.location_country,
        google_business_url=payload.location_google_business_url,
    )
    db.add(location)

    user.onboarding_complete = True
    db.commit()

    return {"ok": True, "message": "Onboarding complete"}
