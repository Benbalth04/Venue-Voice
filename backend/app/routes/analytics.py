"""
Analytics routes – all require authenticated user, company-scoped.
"""
from __future__ import annotations

import json
import uuid
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.orm import Session

from ..auth.membership import get_company_from_membership, get_current_membership, require_company_admin
from ..core.cache import cache_delete, cache_get, cache_set
from ..core.config import settings
from ..auth.subscription import require_active_subscription
from ..auth.user_timezone import get_user_zoneinfo
from ..auth.viewer_scoping import assert_survey_access
from ..db.postgres import get_db_connection
from ..models.postgres_model import Membership as MembershipORM, User as UserORM
from ..schemas.pydantic_model import (
    AdvancedFilterPayload,
    AnalyticsFiltersResponse,
    AnalyticsResponseDetail,
    AnalyticsResponseList,
    DeleteResponseRequest,
    NewResponsesResponse,
    PhotoSignedUrlResponse,
)
from ..services.analytics_service import (
    delete_response,
    get_analytics_filters,
    get_analytics_responses,
    get_new_responses_since,
    get_response_detail,
)
from ..core.errors.app_error import AppError
from ..core.errors.error_category import ErrorCategory
from ..core.errors.exceptions import NotFoundError, PermissionError, ValidationError
from ..integrations.supabase_storage import generate_photo_signed_url, get_supabase_service_client
from ..models.postgres_model import (
    Company as CompanyORM,
    SurveyResponse as SurveyResponseORM,
    SurveyResponsePhoto as SurveyResponsePhotoORM,
    SurveySession as SurveySessionORM,
    SurveyVersion as SurveyVersionORM,
)

router = APIRouter(dependencies=[Depends(require_active_subscription)])


def _shared_filter_params(
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(100, ge=1, le=500, description="Rows per page"),
    survey_id: str | None = Query(None),
    qr_code_id: str | None = Query(None),
    location_id: str | None = Query(None, description="UUID or '__none__' for no-location rows"),
    completed: bool | None = Query(None),
    date_start: str | None = Query(None, description="YYYY-MM-DD in user's saved timezone"),
    date_end: str | None = Query(None, description="YYYY-MM-DD in user's saved timezone"),
    sort_column: str = Query("scan_time"),
    sort_direction: Literal["asc", "desc"] = Query("desc"),
    include_archived: bool = Query(False, description="Include sessions tied to archived QR, location, or survey"),
):
    return dict(
        page=page,
        page_size=page_size,
        survey_id=survey_id,
        qr_code_id=qr_code_id,
        location_id=location_id,
        completed=completed,
        date_start=date_start,
        date_end=date_end,
        sort_column=sort_column,
        sort_direction=sort_direction,
        include_archived=include_archived,
    )


# ------------------------------------------------------------------
# GET /analytics/unread-count
# ------------------------------------------------------------------
@router.get("/analytics/unread-count")
def unread_response_count(
    membership: MembershipORM = Depends(get_current_membership),
    db: Session = Depends(get_db_connection),
):
    """Return unread completed survey response count for the current user."""
    from ..services.analytics_service import get_unread_response_count

    cache_key = f"unread_count:{membership.user_id}:{membership.company_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"count": int(cached)}
    try:
        count = get_unread_response_count(membership=membership, db=db)
        cache_set(cache_key, str(count), settings.unread_count_cache_ttl)
        return {"count": count}
    except Exception:
        return {"count": 0}


# ------------------------------------------------------------------
# GET /analytics/has-unread
# ------------------------------------------------------------------
@router.get("/analytics/has-unread")
def has_unread_reviews(
    membership: MembershipORM = Depends(get_current_membership),
    db: Session = Depends(get_db_connection),
):
    """Lightweight endpoint: returns true if user has any unread survey responses."""
    cache_key = f"unread_count:{membership.user_id}:{membership.company_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"has_unread": int(cached) > 0}
    from ..services.analytics_service import get_unread_response_count
    try:
        count = get_unread_response_count(membership=membership, db=db)
        cache_set(cache_key, str(count), settings.unread_count_cache_ttl)
        return {"has_unread": count > 0}
    except Exception:
        return {"has_unread": False}


# ------------------------------------------------------------------
# GET /analytics/new-responses
# ------------------------------------------------------------------
@router.get("/analytics/new-responses", response_model=NewResponsesResponse)
def new_responses_since(
    since: str = Query(..., description="ISO 8601 datetime; responses submitted after this timestamp"),
    membership: MembershipORM = Depends(get_current_membership),
    db: Session = Depends(get_db_connection),
):
    """Return responses submitted since `since` for toast notifications. Capped at 10 min lookback."""
    from datetime import datetime as dt

    try:
        parsed_since = dt.fromisoformat(since.replace("Z", "+00:00"))
        # Strip timezone info for naive UTC comparison (DB stores naive UTC datetimes)
        if parsed_since.tzinfo is not None:
            from datetime import timezone
            parsed_since = parsed_since.astimezone(timezone.utc).replace(tzinfo=None)
    except (ValueError, TypeError) as exc:
        raise ValidationError(
            code="INVALID_SINCE",
            message="'since' must be a valid ISO 8601 datetime string",
        ) from exc

    try:
        responses = get_new_responses_since(membership=membership, db=db, since=parsed_since)
        return {"responses": responses}
    except Exception:
        return {"responses": []}


# ------------------------------------------------------------------
# GET /analytics/filters
# ------------------------------------------------------------------
@router.get("/analytics/filters", response_model=AnalyticsFiltersResponse)
def analytics_filters(
    membership: MembershipORM = Depends(get_current_membership),
    db: Session = Depends(get_db_connection),
):
    """Return available filter values for surveys, QR codes, and locations."""
    try:
        return get_analytics_filters(membership=membership, db=db)
    except AppError:
        raise
    except Exception:
        raise AppError(
            category=ErrorCategory.UNKNOWN,
            code="INTERNAL_SERVER_ERROR",
            message="Failed to load filter options",
            status_code=500,
        )


# ------------------------------------------------------------------
# GET /analytics/responses
# ------------------------------------------------------------------
@router.get("/analytics/responses", response_model=AnalyticsResponseList)
def analytics_responses(
    params: dict = Depends(_shared_filter_params),
    advanced_filter: str | None = Query(None, description="JSON-encoded advanced filter payload"),
    membership: MembershipORM = Depends(get_current_membership),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    """Paginated, filterable, sortable list of survey sessions."""
    parsed_adv: AdvancedFilterPayload | None = None
    if advanced_filter:
        try:
            raw = json.loads(advanced_filter)
            parsed_adv = AdvancedFilterPayload.model_validate(raw)
        except (json.JSONDecodeError, PydanticValidationError) as exc:
            raise ValidationError(
                code="INVALID_ADVANCED_FILTER",
                message="Invalid advanced filter payload",
                details={"detail": str(exc)},
            )
    if params.get("include_archived") and membership.role == "viewer":
        params = {**params, "include_archived": False}
    try:
        return get_analytics_responses(
            membership=membership, db=db, user_tz=user_tz, advanced_filter=parsed_adv, **params
        )
    except AppError:
        raise
    except Exception as exc:
        raise AppError(
            category=ErrorCategory.UNKNOWN,
            code="INTERNAL_SERVER_ERROR",
            message=f"Failed to load analytics: {exc}",
            status_code=500,
        )


# ------------------------------------------------------------------
# GET /analytics/response/{response_id}
# ------------------------------------------------------------------
@router.get("/analytics/response/{response_id}", response_model=AnalyticsResponseDetail)
def analytics_response_detail(
    response_id: str,
    membership: MembershipORM = Depends(get_current_membership),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    """Return full answer breakdown for a single survey response."""
    try:
        rid = uuid.UUID(response_id)
    except ValueError:
        raise ValidationError(code="INVALID_RESPONSE_ID", message="Invalid response_id UUID")

    try:
        return get_response_detail(
            response_id=rid,
            membership=membership,
            db=db,
            user_tz=user_tz,
        )
    except AppError:
        raise
    except Exception:
        raise AppError(
            category=ErrorCategory.UNKNOWN,
            code="INTERNAL_SERVER_ERROR",
            message="Failed to load response detail",
            status_code=500,
        )


# ------------------------------------------------------------------
# DELETE /analytics/response/{response_id}  (admin only)
# ------------------------------------------------------------------
@router.delete("/analytics/response/{response_id}", status_code=204)
def analytics_delete_response(
    response_id: str,
    payload: DeleteResponseRequest,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    """Soft-delete a survey response (and all child records) by ID. Admin only."""
    try:
        rid = uuid.UUID(response_id)
    except ValueError:
        raise ValidationError(code="INVALID_RESPONSE_ID", message="Invalid response_id UUID")

    try:
        delete_response(
            db=db,
            response_id=rid,
            membership=membership,
            confirmation=payload.confirmation,
        )
    except AppError:
        raise
    except Exception:
        raise AppError(
            category=ErrorCategory.UNKNOWN,
            code="INTERNAL_SERVER_ERROR",
            message="Failed to delete response",
            status_code=500,
        )


# ------------------------------------------------------------------
# GET /analytics/response/{response_id}/photo/{question_id}
# Returns a short-lived signed URL for a private survey photo.
# ------------------------------------------------------------------
@router.get(
    "/analytics/response/{response_id}/photo/{question_id}",
    response_model=PhotoSignedUrlResponse,
)
def analytics_response_photo_signed_url(
    response_id: str,
    question_id: str,
    membership: MembershipORM = Depends(get_current_membership),
    db: Session = Depends(get_db_connection),
):
    """Return a short-lived Supabase signed URL for a survey response photo."""
    try:
        rid = uuid.UUID(response_id)
    except ValueError:
        raise ValidationError(code="INVALID_RESPONSE_ID", message="Invalid response_id UUID")

    try:
        qid = uuid.UUID(question_id)
    except ValueError:
        raise ValidationError(code="INVALID_QUESTION_ID", message="Invalid question_id UUID")

    company = get_company_from_membership(membership, db)

    resp = (
        db.query(SurveyResponseORM)
        .join(SurveySessionORM, SurveySessionORM.id == SurveyResponseORM.session_id)
        .filter(
            SurveyResponseORM.id == rid,
            SurveySessionORM.company_id == company.id,
            SurveyResponseORM.deleted_at.is_(None),
            SurveySessionORM.deleted_at.is_(None),
        )
        .first()
    )
    if not resp:
        raise NotFoundError(code="RESPONSE_NOT_FOUND", message="Response not found")

    if membership.role == "viewer":
        sv = (
            db.query(SurveyVersionORM)
            .filter(
                SurveyVersionORM.id == resp.survey_version_id,
                SurveyVersionORM.deleted_at.is_(None),
            )
            .first()
        )
        if sv:
            assert_survey_access(membership, sv.survey_id, db)

    photo = (
        db.query(SurveyResponsePhotoORM)
        .filter(
            SurveyResponsePhotoORM.survey_response_id == rid,
            SurveyResponsePhotoORM.question_id == qid,
        )
        .first()
    )
    if not photo:
        raise NotFoundError(code="PHOTO_NOT_FOUND", message="No photo found for this response and question")

    try:
        supabase_client = get_supabase_service_client()
        expires_in = 3600  # 1 hour
        signed_url = generate_photo_signed_url(
            client=supabase_client,
            storage_path=photo.storage_path,
            expires_in=expires_in,
        )
    except AppError:
        raise
    except Exception:
        raise AppError(
            category=ErrorCategory.EXTERNAL,
            code="PHOTO_SIGNED_URL_FAILED",
            message="Failed to generate photo URL",
            status_code=502,
        )

    return PhotoSignedUrlResponse(signed_url=signed_url, expires_in_seconds=expires_in)
