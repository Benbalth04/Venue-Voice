"""FastAPI dependencies for membership-based access control.

Every authenticated request to a company-scoped route resolves a Membership
ORM object. Downstream dependencies (require_company_admin, require_company_owner,
viewer scoping) compose on top of that resolved membership.

Usage
-----
    @router.get("/surveys")
    def list_surveys(
        membership: Membership = Depends(get_current_membership),
        db: Session = Depends(get_db_connection),
    ):
        company = get_company_from_membership(membership, db)
        ...

    @router.post("/surveys")
    def create_survey(
        membership: Membership = Depends(require_company_admin),
        db: Session = Depends(get_db_connection),
    ):
        ...
"""
from __future__ import annotations

import uuid

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from ..auth.jwt import get_current_user
from ..core.errors.exceptions import AuthError, NotFoundError, PermissionError
from ..db.postgres import get_db_connection
from ..models.postgres_model import Company, Membership, User


def get_current_membership(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
) -> Membership:
    """Resolve the caller's active membership.

    Priority:
    1. X-Company-ID header — used when the user belongs to multiple companies.
    2. Single-membership fallback — no header needed for single-company users.
    """
    company_id_header = request.headers.get("X-Company-ID")

    if company_id_header:
        try:
            company_uuid = uuid.UUID(company_id_header)
        except ValueError:
            raise PermissionError(
                code="INVALID_COMPANY_ID",
                message="X-Company-ID header must be a valid UUID.",
            )
        membership = (
            db.query(Membership)
            .filter(
                Membership.user_id == current_user.id,
                Membership.company_id == company_uuid,
            )
            .first()
        )
        if not membership:
            raise PermissionError(
                code="NOT_MEMBER",
                message="You are not a member of this company.",
            )
        return membership

    # No header — find the user's memberships
    memberships = (
        db.query(Membership)
        .filter(Membership.user_id == current_user.id)
        .all()
    )

    if len(memberships) == 1:
        return memberships[0]

    if len(memberships) > 1:
        raise AuthError(
            code="COMPANY_HEADER_REQUIRED",
            message=(
                "You belong to multiple companies. "
                "Include the X-Company-ID header to specify which company to use."
            ),
        )

    raise NotFoundError(
        code="NO_MEMBERSHIP",
        message="No company membership found. Please complete account setup.",
    )


def require_company_admin(
    membership: Membership = Depends(get_current_membership),
) -> Membership:
    """Raise 403 unless the caller is a company_admin or company_owner."""
    if membership.role not in ("company_admin", "company_owner"):
        raise PermissionError(
            code="ADMIN_REQUIRED",
            message="Company admin access is required for this action.",
        )
    return membership


def require_company_owner(
    membership: Membership = Depends(get_current_membership),
) -> Membership:
    """Raise 403 unless the caller is the company_owner."""
    if membership.role != "company_owner":
        raise PermissionError(
            code="OWNER_REQUIRED",
            message="Company owner access is required for this action.",
        )
    return membership


def get_company_from_membership(membership: Membership, db: Session) -> Company:
    """Resolve the Company ORM from a membership. Replaces _get_company(user, db)
    across all route files."""
    company = (
        db.query(Company)
        .filter(
            Company.id == membership.company_id,
            Company.deleted_at.is_(None),
        )
        .first()
    )
    if not company:
        raise NotFoundError(
            code="COMPANY_NOT_FOUND",
            message="Company not found.",
        )
    return company
