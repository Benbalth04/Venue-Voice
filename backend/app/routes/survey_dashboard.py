"""
Survey Dashboard routes – require authenticated user, company-scoped.
Endpoints aggregate per-question response data for a given survey.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth.membership import get_company_from_membership, get_current_membership
from ..auth.subscription import require_active_subscription
from ..auth.user_timezone import get_user_zoneinfo
from ..auth.viewer_scoping import assert_survey_access
from ..core.datetime_user_tz import (
    inclusive_local_date_range_to_utc_bounds,
    local_date_start_utc,
    naive_utc_for_sql,
)
from ..core.errors.exceptions import ValidationError
from ..db.postgres import get_db_connection
from ..models.postgres_model import Membership as MembershipORM
from ..schemas.pydantic_model import (
    DashboardFilterParams,
    EngagementBreakdownResponse,
    OldQuestionsDashboardResponse,
    QuestionBreakdownResponse,
    SurveyDashboardResponse,
)
from ..services.survey_dashboard_service import (
    get_dashboard_data,
    get_engagement_breakdown,
    get_old_questions_dashboard_data,
    get_question_breakdown,
)

router = APIRouter(prefix="/surveys", tags=["survey-dashboard"], dependencies=[Depends(require_active_subscription)])


def _parse_yyyy_mm_dd(s: str | None) -> date | None:
    if not s or not str(s).strip():
        return None
    t = str(s).strip()
    if len(t) >= 10:
        t = t[:10]
    try:
        return date.fromisoformat(t)
    except ValueError as e:
        raise ValidationError(
            code="INVALID_DATE",
            message="date_start and date_end must be YYYY-MM-DD",
        ) from e


def _survey_dashboard_filters(
    *,
    location_ids: list[uuid.UUID] | None,
    qr_code_ids: list[uuid.UUID] | None,
    date_start: str | None,
    date_end: str | None,
    user_tz: ZoneInfo,
) -> DashboardFilterParams:
    ds = _parse_yyyy_mm_dd(date_start)
    de = _parse_yyyy_mm_dd(date_end)
    if ds and de and ds > de:
        raise ValidationError(code="INVALID_DATE_RANGE", message="date_start must be before date_end")

    loc = location_ids or None
    qr = qr_code_ids or None

    if ds is not None and de is not None:
        utc_lo, utc_hi = inclusive_local_date_range_to_utc_bounds(ds, de, user_tz)
        return DashboardFilterParams(
            location_ids=loc,
            qr_code_ids=qr,
            date_start=naive_utc_for_sql(utc_lo),
            date_end=naive_utc_for_sql(utc_hi),
        )
    if ds is not None:
        return DashboardFilterParams(
            location_ids=loc,
            qr_code_ids=qr,
            date_start=naive_utc_for_sql(local_date_start_utc(ds, user_tz)),
            date_end=naive_utc_for_sql(local_date_start_utc(ds + timedelta(days=1), user_tz)),
        )
    if de is not None:
        return DashboardFilterParams(
            location_ids=loc,
            qr_code_ids=qr,
            date_start=datetime(2000, 1, 1),
            date_end=naive_utc_for_sql(local_date_start_utc(de + timedelta(days=1), user_tz)),
        )
    return DashboardFilterParams(location_ids=loc, qr_code_ids=qr, date_start=None, date_end=None)


@router.get(
    "/{survey_id}/dashboard",
    response_model=SurveyDashboardResponse,
    summary="Get aggregated dashboard data for a survey",
)
def get_survey_dashboard(
    survey_id: uuid.UUID,
    location_ids: list[uuid.UUID] | None = Query(default=None),
    qr_code_ids: list[uuid.UUID] | None = Query(default=None),
    date_start: str | None = Query(default=None, description="YYYY-MM-DD in user's saved timezone"),
    date_end: str | None = Query(default=None, description="YYYY-MM-DD in user's saved timezone"),
    membership: MembershipORM = Depends(get_current_membership),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
) -> SurveyDashboardResponse:
    company = get_company_from_membership(membership, db)
    assert_survey_access(membership, survey_id, db)
    filters = _survey_dashboard_filters(
        location_ids=location_ids,
        qr_code_ids=qr_code_ids,
        date_start=date_start,
        date_end=date_end,
        user_tz=user_tz,
    )
    return get_dashboard_data(db, survey_id, company.id, filters, user_tz)


@router.get(
    "/{survey_id}/dashboard/old-questions",
    response_model=OldQuestionsDashboardResponse,
    summary="Get aggregated dashboard data for questions not in the active survey version",
)
def get_old_questions_dashboard(
    survey_id: uuid.UUID,
    location_ids: list[uuid.UUID] | None = Query(default=None),
    qr_code_ids: list[uuid.UUID] | None = Query(default=None),
    date_start: str | None = Query(default=None, description="YYYY-MM-DD in user's saved timezone"),
    date_end: str | None = Query(default=None, description="YYYY-MM-DD in user's saved timezone"),
    membership: MembershipORM = Depends(get_current_membership),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
) -> OldQuestionsDashboardResponse:
    company = get_company_from_membership(membership, db)
    assert_survey_access(membership, survey_id, db)
    filters = _survey_dashboard_filters(
        location_ids=location_ids,
        qr_code_ids=qr_code_ids,
        date_start=date_start,
        date_end=date_end,
        user_tz=user_tz,
    )
    return get_old_questions_dashboard_data(db, survey_id, company.id, filters, user_tz)


@router.get(
    "/{survey_id}/dashboard/question-breakdown",
    response_model=QuestionBreakdownResponse,
    summary="Get per-location or per-QR-code aggregations for a single question (lazy drill-down)",
)
def get_question_breakdown_endpoint(
    survey_id: uuid.UUID,
    question_id: uuid.UUID = Query(..., description="stable_question_id of the question"),
    breakdown_by: Literal["location", "qr_code"] = Query(...),
    location_ids: list[uuid.UUID] | None = Query(default=None),
    qr_code_ids: list[uuid.UUID] | None = Query(default=None),
    date_start: str | None = Query(default=None, description="YYYY-MM-DD in user's saved timezone"),
    date_end: str | None = Query(default=None, description="YYYY-MM-DD in user's saved timezone"),
    membership: MembershipORM = Depends(get_current_membership),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
) -> QuestionBreakdownResponse:
    company = get_company_from_membership(membership, db)
    assert_survey_access(membership, survey_id, db)
    filters = _survey_dashboard_filters(
        location_ids=location_ids,
        qr_code_ids=qr_code_ids,
        date_start=date_start,
        date_end=date_end,
        user_tz=user_tz,
    )
    return get_question_breakdown(
        db, survey_id, company.id, question_id, breakdown_by, filters, user_tz
    )


@router.get(
    "/{survey_id}/dashboard/engagement-breakdown",
    response_model=EngagementBreakdownResponse,
    summary="Get per-location or per-QR-code engagement data for a survey (lazy drill-down)",
)
def get_engagement_breakdown_endpoint(
    survey_id: uuid.UUID,
    breakdown_by: Literal["location", "qr_code"] = Query(...),
    location_ids: list[uuid.UUID] | None = Query(default=None),
    qr_code_ids: list[uuid.UUID] | None = Query(default=None),
    date_start: str | None = Query(default=None, description="YYYY-MM-DD in user's saved timezone"),
    date_end: str | None = Query(default=None, description="YYYY-MM-DD in user's saved timezone"),
    membership: MembershipORM = Depends(get_current_membership),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
) -> EngagementBreakdownResponse:
    company = get_company_from_membership(membership, db)
    assert_survey_access(membership, survey_id, db)
    filters = _survey_dashboard_filters(
        location_ids=location_ids,
        qr_code_ids=qr_code_ids,
        date_start=date_start,
        date_end=date_end,
        user_tz=user_tz,
    )
    return get_engagement_breakdown(db, survey_id, company.id, breakdown_by, filters, user_tz)
