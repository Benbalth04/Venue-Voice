from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from zoneinfo import ZoneInfo

from ..auth.membership import get_company_from_membership, get_current_membership
from ..auth.subscription import require_active_subscription
from ..auth.user_timezone import format_dt_for_user, get_user_zoneinfo
from ..auth.viewer_scoping import apply_location_filter, apply_survey_filter, location_ids_subquery, survey_ids_subquery
from ..core.errors.exceptions import ValidationError
from ..db.postgres import get_db_connection
from ..models.postgres_model import (
    Location as LocationORM,
    LocationSurvey as LocationSurveyORM,
    Membership as MembershipORM,
    Survey as SurveyORM,
    SurveyStatus,
)
from ..schemas.pydantic_model import (
    LocationSurveyResponse,
)
from ..services.location_survey_service import (
    derive_location_survey_status,
    utc_now,
)

router = APIRouter(dependencies=[Depends(require_active_subscription)])


def _serialize_location_survey(
    location_survey: LocationSurveyORM,
    user_tz: ZoneInfo,
    now: datetime | None = None,
) -> LocationSurveyResponse:
    current_time = now or utc_now()
    survey = location_survey.survey
    location = location_survey.location
    return LocationSurveyResponse(
        id=location_survey.id,
        location_id=location.id,
        location_name=location.name,
        location_google_business_url=location.google_business_url,
        location_is_active=location.is_active,
        survey_id=survey.id,
        survey_name=survey.name,
        survey_is_published=survey.status == SurveyStatus.active,
        is_active=location_survey.is_active,
        start_date=format_dt_for_user(location_survey.start_date, user_tz) or "",
        end_date=format_dt_for_user(location_survey.end_date, user_tz) if location_survey.end_date else None,
        status=derive_location_survey_status(location_survey, location, survey, current_time),
        created_at=format_dt_for_user(location_survey.created_at, user_tz) or "",
        updated_at=format_dt_for_user(location_survey.updated_at, user_tz) or "",
    )



@router.get("/location-surveys", response_model=list[LocationSurveyResponse])
def list_location_surveys(
    location_id: str | None = Query(default=None),
    survey_id: str | None = Query(default=None),
    membership: MembershipORM = Depends(get_current_membership),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
    location_sq = location_ids_subquery(membership, db)
    survey_sq = survey_ids_subquery(membership, db)
    query = (
        db.query(LocationSurveyORM)
        .options(
            joinedload(LocationSurveyORM.location),
            joinedload(LocationSurveyORM.survey),
        )
        .join(LocationORM, LocationORM.id == LocationSurveyORM.location_id)
        .join(SurveyORM, SurveyORM.id == LocationSurveyORM.survey_id)
        .filter(
            LocationSurveyORM.deleted_at.is_(None),
            LocationORM.company_id == company.id,
            LocationORM.deleted_at.is_(None),
            SurveyORM.company_id == company.id,
            SurveyORM.deleted_at.is_(None),
        )
        .order_by(LocationSurveyORM.created_at.desc())
    )
    query = apply_location_filter(query, location_sq, LocationSurveyORM.location_id)
    query = apply_survey_filter(query, survey_sq, LocationSurveyORM.survey_id)

    if location_id:
        try:
            query = query.filter(LocationSurveyORM.location_id == uuid.UUID(location_id))
        except ValueError:
            raise ValidationError(code="INVALID_LOCATION_ID", message="Invalid location ID")
    if survey_id:
        try:
            query = query.filter(LocationSurveyORM.survey_id == uuid.UUID(survey_id))
        except ValueError:
            raise ValidationError(code="INVALID_SURVEY_ID", message="Invalid survey ID")

    now = utc_now()
    return [_serialize_location_survey(ls, user_tz, now) for ls in query.all()]


