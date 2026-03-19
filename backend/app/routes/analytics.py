"""
Analytics routes – all require authenticated user, company-scoped.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..auth.jwt import get_current_user
from ..db.postgres import get_db_connection
from ..models.postgres_model import User as UserORM
from ..schemas.pydantic_model import (
    AnalyticsFiltersResponse,
    AnalyticsResponseDetail,
    AnalyticsResponseList,
)
from ..services.analytics_service import (
    build_csv_bytes,
    build_excel_bytes,
    get_analytics_filters,
    get_analytics_responses,
    get_response_detail,
)
from ..core.errors.app_error import AppError
from ..core.errors.error_category import ErrorCategory
from ..core.errors.exceptions import ValidationError

router = APIRouter()


def _shared_filter_params(
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(100, ge=1, le=500, description="Rows per page"),
    survey_id: str | None = Query(None),
    qr_code_id: str | None = Query(None),
    location_id: str | None = Query(None, description="UUID or '__none__' for no-location rows"),
    completed: bool | None = Query(None),
    date_start: datetime | None = Query(None),
    date_end: datetime | None = Query(None),
    sort_column: str = Query("scan_time"),
    sort_direction: Literal["asc", "desc"] = Query("desc"),
):
    if date_start and date_end and date_start > date_end:
        raise ValidationError(code="INVALID_DATE_RANGE", message="date_start must be before date_end")
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
    db: Session = Depends(get_db_connection),
):
    """Paginated, filterable, sortable list of survey sessions."""
    try:
        return get_analytics_responses(user_id=current_user.id, db=db, **params)
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
# GET /analytics/responses/export/csv
# ------------------------------------------------------------------
@router.get("/analytics/responses/export/csv")
def export_csv(
    params: dict = Depends(_shared_filter_params),
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Export filtered responses as CSV."""
    try:
        # Export all rows (no pagination limit)
        data = get_analytics_responses(
            user_id=current_user.id, db=db,
            **{**params, "page": 1, "page_size": 10_000},
        )
        content = build_csv_bytes(data.rows)
        return StreamingResponse(
            iter([content]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=analytics_responses.csv"},
        )
    except AppError:
        raise
    except Exception:
        raise AppError(
            category=ErrorCategory.UNKNOWN,
            code="INTERNAL_SERVER_ERROR",
            message="Failed to generate CSV export",
            status_code=500,
        )


# ------------------------------------------------------------------
# GET /analytics/responses/export/excel
# ------------------------------------------------------------------
@router.get("/analytics/responses/export/excel")
def export_excel(
    params: dict = Depends(_shared_filter_params),
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Export filtered responses as Excel (.xlsx)."""
    try:
        data = get_analytics_responses(
            user_id=current_user.id, db=db,
            **{**params, "page": 1, "page_size": 10_000},
        )
        content = build_excel_bytes(data.rows)
        return StreamingResponse(
            iter([content]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=analytics_responses.xlsx"},
        )
    except AppError:
        raise
    except Exception:
        raise AppError(
            category=ErrorCategory.UNKNOWN,
            code="INTERNAL_SERVER_ERROR",
            message="Failed to generate Excel export",
            status_code=500,
        )
