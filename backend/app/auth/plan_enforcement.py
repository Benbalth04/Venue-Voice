"""Plan-tier enforcement helpers and FastAPI dependency factories.

Usage
-----
Block creation when a resource limit is reached (surveys, flows). Location
plan limits apply to **active** locations only — enforce when activating a
location, not when creating it (see assert_can_activate_location).

    @router.post("/flows")
    def create_flow(
        ...,
        _limit: None = Depends(require_limit("active_flows")),
    ):

Block a route if a boolean feature is not on the plan:

    @router.post("/some-route")
    def some_route(
        ...,
        _feature: None = Depends(require_feature("photo_feedback")),
    ):

For inline enforcement (e.g. conditional on payload content) import the
helpers directly:

    from ..auth.plan_enforcement import acquire_company_resource_lock, count_active_flows

Notes
-----
- Advisory locks (pg_advisory_xact_lock) are used before count-then-insert
  sequences to prevent race conditions. The lock is scoped to (company, resource)
  and is released automatically when the database transaction ends.
- All subscription-to-policy translation goes through get_policy_for_subscription()
  in plan_policy.py. Changing that one function is all that is needed when
  billing moves to org-level.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Callable

from fastapi import Depends
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ..auth.jwt import get_current_user
from ..core.errors.exceptions import NotFoundError, SubscriptionFeatureError, SubscriptionLimitError, suggest_upgrade_plan
from ..db.postgres import get_db_connection
from ..models.postgres_model import (
    Company as CompanyORM,
    Flow as FlowORM,
    Location as LocationORM,
    Survey as SurveyORM,
    SurveyStatus,
    User as UserORM,
)
from ..services.plan_policy import PlanPolicy, get_policy_for_subscription
from ..services.stripe_service import get_subscription


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_company_id(current_user: UserORM, db: Session) -> uuid.UUID:
    company = (
        db.query(CompanyORM)
        .filter(
            CompanyORM.owner_user_id == current_user.id,
            CompanyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not company:
        raise NotFoundError(code="COMPANY_NOT_FOUND", message="Company not found.")
    return company.id


# ---------------------------------------------------------------------------
# Public count helpers (also imported by flow_service.py and surveys.py)
# ---------------------------------------------------------------------------

def count_locations(db: Session, company_id: uuid.UUID) -> int:
    """Count **active** (non-deleted) locations for plan limits."""
    return (
        db.query(func.count(LocationORM.id))
        .filter(
            LocationORM.company_id == company_id,
            LocationORM.is_active.is_(True),
            LocationORM.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )


def assert_can_activate_location(db: Session, company_id: uuid.UUID, user: UserORM) -> None:
    """Raise SubscriptionLimitError if the company is already at its active-location cap.

    Call when transitioning a location from inactive → active. Creation of new
    locations does not use this check; new rows should be inserted inactive.
    """
    sub = get_subscription(user, db)
    policy = get_policy_for_subscription(sub)
    limit = policy.max_locations
    if limit == -1:
        return

    acquire_company_resource_lock(db, company_id, "locations")
    current = count_locations(db, company_id)
    if current >= limit:
        plan_key = (sub.plan_display_name or "starter").strip().lower() if sub else "starter"
        loc_word = "location" if limit == 1 else "locations"
        raise SubscriptionLimitError(
            resource="locations",
            limit=limit,
            current=current,
            is_over_limit=(current > limit),
            plan=plan_key,
            upgrade_to=suggest_upgrade_plan(plan_key),
            message=(
                f"Your plan allows up to {limit} active {loc_word}. "
                "Deactivate another location or upgrade your plan to activate this one."
            ),
        )


def count_active_surveys(db: Session, company_id: uuid.UUID) -> int:
    return (
        db.query(func.count(SurveyORM.id))
        .filter(
            SurveyORM.company_id == company_id,
            SurveyORM.status == SurveyStatus.active,
            SurveyORM.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )


def count_active_flows(db: Session, company_id: uuid.UUID) -> int:
    return (
        db.query(func.count(FlowORM.id))
        .filter(
            FlowORM.company_id == company_id,
            FlowORM.is_active.is_(True),
            FlowORM.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )


# ---------------------------------------------------------------------------
# Over-limit detection
# ---------------------------------------------------------------------------

@dataclass
class OverLimitStatus:
    """Snapshot of which resource types exceed the plan's allowed limits.

    Computed dynamically from live DB counts — never stored.
    An account goes 'over limit' when a downgrade reduces the plan cap below
    the number of resources the user already holds.
    """

    locations: bool
    active_surveys: bool
    active_flows: bool
    counts: dict[str, int]  # current live counts
    limits: dict[str, int]  # plan limits (-1 = unlimited)

    def any_over_limit(self) -> bool:
        return self.locations or self.active_surveys or self.active_flows


def get_over_limit_status(
    db: Session,
    company_id: uuid.UUID,
    policy: PlanPolicy,
) -> OverLimitStatus:
    """Compute which resource types currently exceed the given policy's limits.

    Does NOT acquire advisory locks — read-only, used for status reporting.
    """
    loc = count_locations(db, company_id)
    surveys = count_active_surveys(db, company_id)
    flows = count_active_flows(db, company_id)
    return OverLimitStatus(
        locations=policy.max_locations != -1 and loc > policy.max_locations,
        active_surveys=policy.max_active_surveys != -1 and surveys > policy.max_active_surveys,
        active_flows=policy.max_active_flows != -1 and flows > policy.max_active_flows,
        counts={"locations": loc, "active_surveys": surveys, "active_flows": flows},
        limits={
            "locations": policy.max_locations,
            "active_surveys": policy.max_active_surveys,
            "active_flows": policy.max_active_flows,
        },
    )


# ---------------------------------------------------------------------------
# Advisory lock
# ---------------------------------------------------------------------------

_RESOURCE_SALT: dict[str, int] = {
    "locations": 1,
    "active_surveys": 2,
    "active_flows": 3,
}


def acquire_company_resource_lock(db: Session, company_id: uuid.UUID, resource: str) -> None:
    """Acquire a PostgreSQL advisory transaction lock for (company, resource).

    The lock serialises concurrent creation requests for the same resource type
    within the same company. It is released automatically when the database
    transaction ends (commit or rollback), so no cleanup is required.

    Lock key derivation: XOR the company UUID integer (masked to positive int64)
    with a resource-specific salt shifted to the upper bits. Different resources
    for the same company get distinct keys and do not block each other.
    """
    salt = _RESOURCE_SALT.get(resource, 0)
    company_int = company_id.int & 0x7FFFFFFFFFFFFFFF  # ensure positive int64
    lock_key = (company_int ^ (salt << 48)) & 0x7FFFFFFFFFFFFFFF
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})


# ---------------------------------------------------------------------------
# Dependency factories
# ---------------------------------------------------------------------------

def require_limit(resource: str) -> Callable:
    """Return a FastAPI dependency that blocks creation when a plan limit is reached.

    resource must be one of: 'locations', 'active_surveys', 'active_flows'

    Note: for locations, ``count_locations`` counts only **active** rows. Prefer
    assert_can_activate_location() on PATCH instead of require_limit on POST.

    The dependency:
    1. Resolves the user's plan policy.
    2. Acquires a PG advisory transaction lock for (company, resource).
    3. Counts current usage.
    4. Raises SubscriptionLimitError (403) if the limit is reached.
    """
    def _dependency(
        current_user: UserORM = Depends(get_current_user),
        db: Session = Depends(get_db_connection),
    ) -> None:
        company_id = _get_company_id(current_user, db)
        sub = get_subscription(current_user, db)
        policy = get_policy_for_subscription(sub)
        plan_key = (sub.plan_display_name or "starter").strip().lower() if sub else "starter"

        acquire_company_resource_lock(db, company_id, resource)

        if resource == "locations":
            limit = policy.max_locations
            current = count_locations(db, company_id)
        elif resource == "active_surveys":
            limit = policy.max_active_surveys
            current = count_active_surveys(db, company_id)
        elif resource == "active_flows":
            limit = policy.max_active_flows
            current = count_active_flows(db, company_id)
        else:
            return  # Unknown resource — fail-open; do not block future resources

        if limit != -1 and current >= limit:
            raise SubscriptionLimitError(
                resource=resource,
                limit=limit,
                current=current,
                is_over_limit=(current > limit),
                plan=plan_key,
                upgrade_to=suggest_upgrade_plan(plan_key),
            )

    return _dependency


def require_feature(feature: str) -> Callable:
    """Return a FastAPI dependency that blocks a route if a plan feature is unavailable.

    feature must be one of: 'photo_feedback'
    """
    def _dependency(
        current_user: UserORM = Depends(get_current_user),
        db: Session = Depends(get_db_connection),
    ) -> None:
        sub = get_subscription(current_user, db)
        policy = get_policy_for_subscription(sub)

        if feature == "photo_feedback" and not policy.can_use_photo_feedback:
            raise SubscriptionFeatureError(
                feature="photo_feedback",
                message="Photo feedback questions require a Growth or Pro plan.",
            )
        # Unknown features fail-open

    return _dependency
