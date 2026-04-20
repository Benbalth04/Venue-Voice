"""Company user management routes.

All routes here require company_admin or company_owner role. Viewers cannot access
any of these endpoints. The invite flow uses the Supabase Admin API to send
magic-link emails.

Permission matrix:
  company_owner : all operations including removing/transferring to admins
  company_admin : list users, invite viewers, set viewer permissions, remove viewers
  viewer        : no access
"""
from __future__ import annotations

import uuid
from datetime import datetime

import stripe
from fastapi import APIRouter, Depends, Request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth.membership import (
    get_company_from_membership,
    require_company_admin,
    require_company_owner,
)
from ..core.rate_limit import check_user_rate_limit
from ..auth.subscription import require_active_subscription
from ..core.errors import (
    ConflictError,
    ExternalAPIError,
    NotFoundError,
    PermissionError,
    ValidationError,
)
from ..core.errors.app_error import AppError
from ..core.errors.error_category import ErrorCategory
from ..db.postgres import get_db_connection
from ..integrations.supabase_admin import (
    get_last_sign_in_map,
    invite_user_by_email,
    revoke_user_sessions,
)
from ..models.postgres_model import Company as CompanyORM
from ..models.postgres_model import Location as LocationORM
from ..models.postgres_model import Membership as MembershipORM
from ..models.postgres_model import Subscription as SubscriptionORM
from ..models.postgres_model import Survey as SurveyORM
from ..models.postgres_model import User as UserORM
from ..models.postgres_model import ViewerPermission as ViewerPermissionORM
from ..schemas.pydantic_model import (
    CompanyMemberResponse,
    InviteUserRequest,
    SetViewerPermissionsRequest,
    ViewerPermissionsResponse,
)

router = APIRouter(dependencies=[Depends(require_active_subscription)])


def _member_to_response(
    membership: MembershipORM,
    user: UserORM,
    db: Session,
    last_login_at: datetime | None = None,
) -> CompanyMemberResponse:
    invited_by_name: str | None = None
    if membership.invited_by:
        inviter = db.query(UserORM).filter(UserORM.id == membership.invited_by).first()
        if inviter:
            invited_by_name = f"{inviter.first_name} {inviter.last_name}".strip()

    return CompanyMemberResponse(
        membership_id=membership.id,
        user_id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=membership.role,
        all_surveys=membership.all_surveys,
        all_locations=membership.all_locations,
        invited_by_name=invited_by_name,
        timezone=user.timezone,
        last_login_at=last_login_at,
        created_at=membership.created_at,
    )


@router.get("/company/users", response_model=list[CompanyMemberResponse])
def list_company_users(
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    """List all users in the company. company_admin and company_owner."""
    rows = (
        db.query(MembershipORM, UserORM)
        .join(UserORM, MembershipORM.user_id == UserORM.id)
        .filter(
            MembershipORM.company_id == membership.company_id,
            UserORM.deleted_at.is_(None),
        )
        .order_by(MembershipORM.created_at.asc())
        .all()
    )
    user_ids = [str(u.id) for _, u in rows]
    last_sign_in_map = get_last_sign_in_map(user_ids)

    def parse_supabase_datetime(raw: str | None) -> datetime | None:
        if not raw:
            return None
        # Supabase commonly returns ISO strings ending in "Z"
        normalized = raw.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized)
        except ValueError:
            return None

    return [
        _member_to_response(
            m,
            u,
            db,
            last_login_at=parse_supabase_datetime(last_sign_in_map.get(str(u.id))),
        )
        for m, u in rows
    ]


@router.post("/company/users/invite", response_model=CompanyMemberResponse, status_code=201)
def invite_company_user(
    payload: InviteUserRequest,
    request: Request,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    """Invite a user to the company via Supabase Admin API.

    company_owner can invite as 'viewer' or 'company_admin'.
    company_admin can only invite as 'viewer'.
    """
    check_user_rate_limit(str(membership.user_id), "invite_user", limit=20, window=3600)
    company = get_company_from_membership(membership, db)

    # Validate the requested role
    if payload.role not in ("viewer", "company_admin"):
        raise ValidationError(
            code="INVALID_ROLE",
            message="Role must be 'viewer' or 'company_admin'.",
        )

    # Only company_owner may invite company_admins
    if payload.role == "company_admin" and membership.role != "company_owner":
        raise PermissionError(
            code="OWNER_REQUIRED",
            message="Only the company owner can invite company admins.",
        )

    email = payload.email.lower().strip()

    # Check for existing membership by email (case-insensitive; stored casing may vary)
    existing_user = (
        db.query(UserORM)
        .filter(
            func.lower(UserORM.email) == email,
            UserORM.deleted_at.is_(None),
        )
        .first()
    )
    if existing_user:
        existing_membership = (
            db.query(MembershipORM)
            .filter(
                MembershipORM.user_id == existing_user.id,
                MembershipORM.company_id == company.id,
                MembershipORM.deleted_at.is_(None),
            )
            .first()
        )
        if existing_membership:
            raise ConflictError(
                code="ALREADY_MEMBER",
                message=(
                    "Invite not sent: this email address is already a member of your company."
                ),
            )

    # Call Supabase Admin API — creates auth user + sends invite email
    supabase_user = invite_user_by_email(
        email=email,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
    )
    supabase_uuid = uuid.UUID(supabase_user["id"])

    # Upsert DB user using the Supabase UUID (may already exist for re-invites)
    invited_user = db.query(UserORM).filter(UserORM.id == supabase_uuid).first()
    if not invited_user:
        invited_user = UserORM(
            id=supabase_uuid,
            email=email,
            first_name=payload.first_name.strip(),
            last_name=payload.last_name.strip(),
            onboarding_complete=True,  # Skip company-creation onboarding
            invite_pending=True,       # Route to invite-setup to set password + timezone
            email_verified=True,       # Invite link acts as email verification
        )
        db.add(invited_user)
        db.flush()
    elif not invited_user.onboarding_complete:
        # User signed up independently and is waiting to join — mark them complete now.
        # Do NOT set invite_pending=True; they already have a password from self-registration.
        invited_user.onboarding_complete = True

    # Create membership with the requested role
    new_membership = MembershipORM(
        company_id=company.id,
        user_id=supabase_uuid,
        role=payload.role,
        all_surveys=True,
        all_locations=True,
        invited_by=membership.user_id,
    )
    db.add(new_membership)
    try:
        db.commit()
        db.refresh(new_membership)
        db.refresh(invited_user)
    except IntegrityError:
        db.rollback()
        raise ConflictError(
            code="ALREADY_MEMBER",
            message=(
                "Invite not sent: this email address is already a member of your company."
            ),
        )

    return _member_to_response(new_membership, invited_user, db)


@router.get(
    "/company/users/{membership_id}/permissions",
    response_model=ViewerPermissionsResponse,
)
def get_viewer_permissions(
    membership_id: uuid.UUID,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    """Get viewer permissions for a specific member. company_admin and company_owner."""
    target = _get_target_membership(membership_id, membership.company_id, db)

    survey_ids = [
        vp.survey_id
        for vp in target.viewer_permissions
        if vp.survey_id is not None
    ]
    location_ids = [
        vp.location_id
        for vp in target.viewer_permissions
        if vp.location_id is not None
    ]

    return ViewerPermissionsResponse(
        membership_id=target.id,
        all_surveys=target.all_surveys,
        all_locations=target.all_locations,
        survey_ids=survey_ids,
        location_ids=location_ids,
    )


@router.post(
    "/company/users/{membership_id}/permissions",
    response_model=ViewerPermissionsResponse,
)
def set_viewer_permissions(
    membership_id: uuid.UUID,
    payload: SetViewerPermissionsRequest,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    """Replace all viewer permissions for a member. company_admin and company_owner.

    survey_ids and location_ids are ignored when all_surveys/all_locations are True.
    """
    company = get_company_from_membership(membership, db)
    target = _get_target_membership(membership_id, membership.company_id, db)

    if target.role != "viewer":
        raise PermissionError(
            code="ADMIN_PERMISSIONS_IMMUTABLE",
            message="Scoped permissions only apply to viewer accounts. Admins have full access.",
        )

    # Validate that supplied survey_ids belong to this company
    if payload.survey_ids:
        valid_surveys = (
            db.query(SurveyORM.id)
            .filter(
                SurveyORM.id.in_(payload.survey_ids),
                SurveyORM.company_id == company.id,
                SurveyORM.deleted_at.is_(None),
            )
            .all()
        )
        valid_survey_ids = {row[0] for row in valid_surveys}
        invalid = [sid for sid in payload.survey_ids if sid not in valid_survey_ids]
        if invalid:
            raise NotFoundError(
                code="SURVEY_NOT_FOUND",
                message=f"Survey(s) not found in this company: {invalid}",
            )

    # Validate that supplied location_ids belong to this company
    if payload.location_ids:
        valid_locations = (
            db.query(LocationORM.id)
            .filter(
                LocationORM.id.in_(payload.location_ids),
                LocationORM.company_id == company.id,
                LocationORM.deleted_at.is_(None),
            )
            .all()
        )
        valid_location_ids = {row[0] for row in valid_locations}
        invalid = [lid for lid in payload.location_ids if lid not in valid_location_ids]
        if invalid:
            raise NotFoundError(
                code="LOCATION_NOT_FOUND",
                message=f"Location(s) not found in this company: {invalid}",
            )

    # Update flags
    target.all_surveys = payload.all_surveys
    target.all_locations = payload.all_locations

    # Replace specific permission rows
    db.query(ViewerPermissionORM).filter(
        ViewerPermissionORM.membership_id == target.id
    ).delete(synchronize_session=False)

    if not payload.all_surveys:
        for sid in payload.survey_ids:
            db.add(ViewerPermissionORM(membership_id=target.id, survey_id=sid))

    if not payload.all_locations:
        for lid in payload.location_ids:
            db.add(ViewerPermissionORM(membership_id=target.id, location_id=lid))

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError(
            code="PERMISSIONS_CONFLICT",
            message="Permissions were updated by a concurrent request. Please refresh.",
        )
    db.refresh(target)

    return ViewerPermissionsResponse(
        membership_id=target.id,
        all_surveys=target.all_surveys,
        all_locations=target.all_locations,
        survey_ids=payload.survey_ids if not payload.all_surveys else [],
        location_ids=payload.location_ids if not payload.all_locations else [],
    )


@router.delete("/company/users/{membership_id}", status_code=204)
def remove_company_user(
    membership_id: uuid.UUID,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    """Remove a user from the company.

    company_owner : can remove company_admin or viewer (not themselves, not another owner)
    company_admin : can only remove viewer (not themselves, not admins, not owner)
    """
    target = _get_target_membership(membership_id, membership.company_id, db)

    # Nobody can remove the company_owner
    if target.role == "company_owner":
        raise PermissionError(
            code="CANNOT_REMOVE_OWNER",
            message="The company owner cannot be removed.",
        )

    # company_admin cannot remove another company_admin
    if membership.role == "company_admin" and target.role == "company_admin":
        raise PermissionError(
            code="CANNOT_REMOVE_ADMIN",
            message="Company admins cannot remove other admins.",
        )

    if target.user_id == membership.user_id:
        raise PermissionError(
            code="CANNOT_REMOVE_SELF",
            message="You cannot remove yourself from the company.",
        )

    target_user_id = str(target.user_id)
    db.delete(target)
    db.commit()

    revoke_user_sessions(target_user_id)


@router.post("/company/users/{membership_id}/promote-to-admin", response_model=CompanyMemberResponse)
def promote_to_admin(
    membership_id: uuid.UUID,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    """Promote a viewer to company_admin.

    company_owner and company_admin may promote viewers.
    Clears any scoped viewer permissions since admins have full access.
    """
    target = _get_target_membership(membership_id, membership.company_id, db)

    if target.role != "viewer":
        raise ValidationError(
            code="INVALID_PROMOTION_TARGET",
            message="Only viewers can be promoted to admin.",
        )

    if target.user_id == membership.user_id:
        raise PermissionError(
            code="CANNOT_PROMOTE_SELF",
            message="You cannot change your own role.",
        )

    target_user = db.query(UserORM).filter(UserORM.id == target.user_id).first()
    if not target_user:
        raise NotFoundError(
            code="USER_NOT_FOUND",
            message="Target user not found.",
        )

    target.role = "company_admin"
    target.all_surveys = True
    target.all_locations = True
    db.query(ViewerPermissionORM).filter(
        ViewerPermissionORM.membership_id == target.id
    ).delete(synchronize_session=False)
    db.commit()
    db.refresh(target)

    return _member_to_response(target, target_user, db)


@router.post("/company/users/{membership_id}/transfer-ownership", status_code=200)
def transfer_ownership(
    membership_id: uuid.UUID,
    membership: MembershipORM = Depends(require_company_owner),
    db: Session = Depends(get_db_connection),
):
    """Transfer company ownership to a company_admin.

    The target becomes company_owner. The caller (current owner) becomes company_admin.
    company_owner only.
    """
    target = _get_target_membership(membership_id, membership.company_id, db)

    if target.role != "company_admin":
        raise ValidationError(
            code="INVALID_TRANSFER_TARGET",
            message="Ownership can only be transferred to a company admin.",
        )

    if target.user_id == membership.user_id:
        raise PermissionError(
            code="CANNOT_TRANSFER_TO_SELF",
            message="You are already the company owner.",
        )

    new_owner_user = db.query(UserORM).filter(UserORM.id == target.user_id).first()
    if not new_owner_user:
        raise NotFoundError(
            code="USER_NOT_FOUND",
            message="Target user not found.",
        )

    # Update Stripe customer email to the new owner's email before committing the role swap.
    # If Stripe fails, the transfer is blocked to keep billing contact consistent.
    sub = db.query(SubscriptionORM).filter(SubscriptionORM.company_id == membership.company_id).first()
    if sub and sub.stripe_customer_id and (new_owner_user.email or "").strip():
        try:
            stripe.Customer.modify(sub.stripe_customer_id, email=new_owner_user.email.strip().lower())
        except stripe.StripeError as exc:
            raise ExternalAPIError(
                service_name="Stripe",
                error_message=f"Failed to update billing contact: {exc}",
            ) from exc

    # Both unique partial indexes (one owner, one admin per company) mean no
    # two-step flush order avoids a transient duplicate. Use viewer as a neutral
    # intermediate role so neither restricted role ever has two holders:
    #   1. target  → viewer   (frees the one-admin slot)
    #   2. owner   → admin    (fills admin slot; owner slot now free)
    #   3. target  → owner    (fills owner slot)
    try:
        target.role = "viewer"
        db.flush()
        membership.role = "company_admin"
        db.flush()
        target.role = "company_owner"
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(
            category=ErrorCategory.UNKNOWN,
            code="INTERNAL_SERVER_ERROR",
            message="Failed to transfer ownership. Please try again.",
            status_code=500,
        )

    return {"ok": True}


def _get_target_membership(
    membership_id: uuid.UUID,
    company_id: uuid.UUID,
    db: Session,
) -> MembershipORM:
    """Fetch a membership that belongs to the given company, or raise 404."""
    target = (
        db.query(MembershipORM)
        .filter(
            MembershipORM.id == membership_id,
            MembershipORM.company_id == company_id,
        )
        .first()
    )
    if not target:
        raise NotFoundError(
            code="MEMBERSHIP_NOT_FOUND",
            message="Member not found in this company.",
        )
    return target
