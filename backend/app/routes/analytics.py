"""
Analytics routes – all require authenticated user, company-scoped.
"""
from __future__ import annotations

import uuid
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth.jwt import get_current_user
from ..auth.subscription import require_active_subscription
from ..auth.user_timezone import get_user_zoneinfo
from ..db.postgres import get_db_connection
from ..models.postgres_model import User as UserORM
from ..schemas.pydantic_model import (
    AnalyticsFiltersResponse,
    AnalyticsResponseDetail,
    AnalyticsResponseList,
    PhotoSignedUrlResponse,
)
from ..services.analytics_service import (
    get_analytics_filters,
    get_analytics_responses,
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
    )


# ------------------------------------------------------------------
# GET /analytics/unread-count
# ------------------------------------------------------------------
@router.get("/analytics/unread-count")
def unread_response_count(
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Return unread completed survey response count for the current user."""
    from ..services.analytics_service import get_unread_response_count

    try:
        return {"count": get_unread_response_count(user_id=current_user.id, db=db)}
    except Exception:
        return {"count": 0}


# ------------------------------------------------------------------
# GET /analytics/has-unread
# ------------------------------------------------------------------
@router.get("/analytics/has-unread")
def has_unread_reviews(
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Lightweight endpoint: returns true if user has any unread survey responses."""
    from ..services.analytics_service import has_unread_responses
    try:
        return {"has_unread": has_unread_responses(user_id=current_user.id, db=db)}
    except Exception:
        return {"has_unread": False}


# ------------------------------------------------------------------
# GET /analytics/filters
# ------------------------------------------------------------------
@router.get("/analytics/filters", response_model=AnalyticsFiltersResponse)
def analytics_filters(
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Return available filter values for surveys, QR codes, and locations."""
    try:
        return get_analytics_filters(user_id=current_user.id, db=db)
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
    current_user: UserORM = Depends(get_current_user),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    """Paginated, filterable, sortable list of survey sessions."""
    try:
        return get_analytics_responses(
            user_id=current_user.id, db=db, user_tz=user_tz, **params
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
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Return full answer breakdown for a single survey response."""
    try:
        rid = uuid.UUID(response_id)
    except ValueError:
        raise ValidationError(code="INVALID_RESPONSE_ID", message="Invalid response_id UUID")

    try:
        return get_response_detail(response_id=rid, user_id=current_user.id, db=db)
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
    current_user: UserORM = Depends(get_current_user),
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

    # Verify the response belongs to the current user's company
    company = (
        db.query(CompanyORM)
        .filter(
            CompanyORM.owner_user_id == current_user.id,
            CompanyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not company:
        raise PermissionError(code="NO_COMPANY_FOR_USER", message="No company associated with this user")

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
