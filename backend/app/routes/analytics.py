"""
Analytics routes – all require authenticated user, company-scoped.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
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
        raise HTTPException(status_code=400, detail="date_start must be before date_end")
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
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load filter options")


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
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load analytics: {exc}")


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
        raise HTTPException(status_code=400, detail="Invalid response_id UUID")

    try:
        return get_response_detail(response_id=rid, user_id=current_user.id, db=db)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load response detail")


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
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate CSV export")


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
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate Excel export")
