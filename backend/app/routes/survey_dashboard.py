"""
Survey Dashboard routes – require authenticated user, company-scoped.
Endpoints aggregate per-question response data for a given survey.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth.jwt import get_current_user
from ..auth.subscription import require_active_subscription
from ..db.postgres import get_db_connection
from ..models.postgres_model import Company as CompanyORM, User as UserORM
from ..schemas.pydantic_model import (
    DashboardFilterParams,
    OldQuestionsDashboardResponse,
    SurveyDashboardResponse,
)
from ..services.survey_dashboard_service import (
    get_dashboard_data,
    get_old_questions_dashboard_data,
)
from ..core.errors.exceptions import NotFoundError

router = APIRouter(prefix="/surveys", tags=["survey-dashboard"], dependencies=[Depends(require_active_subscription)])


def _get_company(user: UserORM, db: Session) -> CompanyORM:
    company = (
        db.query(CompanyORM)
        .filter(
            CompanyORM.owner_user_id == user.id,
            CompanyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not company:
        raise NotFoundError(
            code="COMPANY_NOT_FOUND",
            message="Company not found",
            details={},
        )
    return company


@router.get(
    "/{survey_id}/dashboard",
    response_model=SurveyDashboardResponse,
    summary="Get aggregated dashboard data for a survey",
)
def get_survey_dashboard(
    survey_id: uuid.UUID,
    location_ids: list[uuid.UUID] | None = Query(default=None),
    qr_code_ids: list[uuid.UUID] | None = Query(default=None),
    date_start: datetime | None = Query(default=None),
    date_end: datetime | None = Query(default=None),
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
) -> SurveyDashboardResponse:
    company = _get_company(user, db)
    filters = DashboardFilterParams(
        location_ids=location_ids or None,
        qr_code_ids=qr_code_ids or None,
        date_start=date_start,
        date_end=date_end,
    )
    return get_dashboard_data(db, survey_id, company.id, filters)


@router.get(
    "/{survey_id}/dashboard/old-questions",
    response_model=OldQuestionsDashboardResponse,
    summary="Get aggregated dashboard data for questions not in the active survey version",
)
def get_old_questions_dashboard(
    survey_id: uuid.UUID,
    location_ids: list[uuid.UUID] | None = Query(default=None),
    qr_code_ids: list[uuid.UUID] | None = Query(default=None),
    date_start: datetime | None = Query(default=None),
    date_end: datetime | None = Query(default=None),
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
) -> OldQuestionsDashboardResponse:
    company = _get_company(user, db)
    filters = DashboardFilterParams(
        location_ids=location_ids or None,
        qr_code_ids=qr_code_ids or None,
        date_start=date_start,
        date_end=date_end,
    )
    return get_old_questions_dashboard_data(db, survey_id, company.id, filters)
