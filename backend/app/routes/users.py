from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.jwt import get_current_user
from ..auth.plan_enforcement import get_over_limit_status
from ..core.timezone_australia import assert_allowed_timezone_string
from ..db.postgres import get_db_connection
from ..models.postgres_model import Company as CompanyORM
from ..models.postgres_model import Location as LocationORM
from ..models.postgres_model import Question as QuestionORM
from ..models.postgres_model import Subscription as SubscriptionORM
from ..models.postgres_model import Survey as SurveyORM
from ..models.postgres_model import SurveyStatus
from ..models.postgres_model import SurveyVersion as SurveyVersionORM
from ..models.postgres_model import User as UserORM
from ..schemas.pydantic_model import (
    SetupAccountRequest,
    SubscriptionStatusResponse,
    SubscriptionWarning,
    UpdateUserTimezoneRequest,
    UserResponse,
)
from ..services.plan_policy import get_policy_for_subscription
from ..services.stripe_service import get_subscription

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


def _company_has_photo_questions(db: Session, company_id) -> bool:
    """Return True if the company has any (non-deleted) survey questions of type 'photo'."""
    count = (
        db.query(func.count(QuestionORM.id))
        .join(SurveyVersionORM, QuestionORM.survey_version_id == SurveyVersionORM.id)
        .join(SurveyORM, SurveyVersionORM.survey_id == SurveyORM.id)
        .filter(
            SurveyORM.company_id == company_id,
            SurveyORM.deleted_at.is_(None),
            QuestionORM.question_type == "photo",
            QuestionORM.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )
    return count > 0


@router.get("/me/subscription/status", response_model=SubscriptionStatusResponse)
def get_subscription_status(
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Return dynamic over-limit and feature-downgrade warnings for the account.

    Does not require an active subscription so that users who have just
    downgraded or cancelled can still see their account state.
    """
    sub = get_subscription(current_user, db)
    policy = get_policy_for_subscription(sub)
    plan_name = (sub.plan_display_name or "starter").strip().lower() if sub else "starter"

    company = (
        db.query(CompanyORM)
        .filter(
            CompanyORM.owner_user_id == current_user.id,
            CompanyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not company:
        return SubscriptionStatusResponse(plan=plan_name, over_limit={}, warnings=[])

    status = get_over_limit_status(db, company.id, policy)
    warnings: list[SubscriptionWarning] = []

    resource_labels: list[tuple[str, str, bool]] = [
        ("locations", "active locations", status.locations),
        ("active_surveys", "active surveys", status.active_surveys),
        ("active_flows", "active flows", status.active_flows),
    ]
    for resource, label, is_over in resource_labels:
        if is_over:
            limit = status.limits[resource]
            current = status.counts[resource]
            warnings.append(
                SubscriptionWarning(
                    type="OVER_LIMIT",
                    feature=resource,
                    message=(
                        f"Your account has {current} {label} but your {plan_name.capitalize()} "
                        f"plan allows {limit}. You cannot create new {label} until you reduce "
                        f"your usage or upgrade your plan."
                    ),
                    limit=limit,
                    current=current,
                )
            )

    if not policy.can_use_photo_feedback and _company_has_photo_questions(db, company.id):
        warnings.append(
            SubscriptionWarning(
                type="FEATURE_DOWNGRADED",
                feature="photo_feedback",
                message=(
                    "Your plan no longer includes photo feedback. "
                    "Photo responses in your surveys are hidden until you upgrade."
                ),
            )
        )

    return SubscriptionStatusResponse(
        plan=plan_name,
        over_limit={
            "locations": status.locations,
            "active_surveys": status.active_surveys,
            "active_flows": status.active_flows,
        },
        warnings=warnings,
    )


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
