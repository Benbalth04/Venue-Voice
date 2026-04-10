"""FastAPI dependency that enforces an active subscription.

Usage
-----
Apply to any route that should be paywalled:

    @router.get("/protected")
    def protected_endpoint(
        _: None = Depends(require_active_subscription),
        membership: Membership = Depends(get_current_membership),
        db: Session = Depends(get_db_connection),
    ):
        ...

The public survey-completion routes (survey_public.py, QR redirect) must NOT
use this dependency — they are already unauthenticated by design.

Multi-user note: subscription is tied directly to the company. Invited viewers
inherit subscription access from the company they belong to.
"""
from __future__ import annotations

from fastapi import Depends
from sqlalchemy.orm import Session

from ..auth.membership import get_current_membership
from ..core.errors.exceptions import PermissionError
from ..db.postgres import get_db_connection
from ..models.postgres_model import Company, Membership
from ..services.stripe_service import get_company_subscription, is_subscription_active


def require_active_subscription(
    membership: Membership = Depends(get_current_membership),
    db: Session = Depends(get_db_connection),
) -> None:
    """Raise PermissionError(403) if the company has no active subscription."""
    company = (
        db.query(Company)
        .filter(Company.id == membership.company_id)
        .first()
    )
    if not company:
        raise PermissionError(
            code="SUBSCRIPTION_REQUIRED",
            message="An active subscription is required to access this feature.",
        )

    sub = get_company_subscription(company, db)
    if not is_subscription_active(sub):
        raise PermissionError(
            code="SUBSCRIPTION_REQUIRED",
            message="An active subscription is required to access this feature.",
        )
