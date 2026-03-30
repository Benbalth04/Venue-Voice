"""FastAPI dependency that enforces an active subscription.

Usage
-----
Apply to any route that should be paywalled:

    @router.get("/protected")
    def protected_endpoint(
        _: None = Depends(require_active_subscription),
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db_connection),
    ):
        ...

The public survey-completion routes (survey_public.py, QR redirect) must NOT
use this dependency — they are already unauthenticated by design.
"""
from __future__ import annotations

from fastapi import Depends
from sqlalchemy.orm import Session

from ..auth.jwt import get_current_user
from ..core.errors.exceptions import PermissionError
from ..db.postgres import get_db_connection
from ..models.postgres_model import User
from ..services.stripe_service import get_subscription, is_subscription_active


def require_active_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
) -> None:
    """Raise PermissionError(403) if the user has no active subscription.

    The frontend SubscriptionGuard handles the UX redirect; this dependency
    is the backend enforcement layer that prevents direct API abuse.
    """
    sub = get_subscription(current_user, db)
    if not is_subscription_active(sub):
        raise PermissionError(
            code="SUBSCRIPTION_REQUIRED",
            message="An active subscription is required to access this feature.",
        )
