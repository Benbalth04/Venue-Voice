from __future__ import annotations

import uuid
from datetime import datetime
from datetime import timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from sqlalchemy import func

from ..auth.jwt import get_current_user
from ..auth.subscription import require_active_subscription
from ..auth.user_timezone import format_dt_for_user
from ..core.errors.exceptions import ConflictError, NotFoundError, StaleObjectError, ValidationError
from ..core.timezone_australia import effective_zoneinfo_for_stored_timezone
from ..db.postgres import get_db_connection
from ..models.postgres_model import (
    Company as CompanyORM,
    Location as LocationORM,
    LocationSurvey as LocationSurveyORM,
    Survey as SurveyORM,
    SurveyStatus,
    User as UserORM,
)
from ..schemas.pydantic_model import (
    DeleteRequest,
    LocationSurveyBulkAssignCreate,
    LocationSurveyResponse,
    LocationSurveyUpdate,
)
from ..services.location_survey_service import (
    derive_location_survey_status,
    find_duplicate_location_ids,
    utc_now,
)

router = APIRouter(dependencies=[Depends(require_active_subscription)])


def _strip_tz(dt: datetime) -> datetime:
    """Normalize a datetime for comparison with a naive TIMESTAMP column."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


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
        raise NotFoundError(code="COMPANY_NOT_FOUND", message="Company not found")
    return company


def _serialize_location_survey(
    location_survey: LocationSurveyORM,
    user: UserORM,
    now: datetime | None = None,
) -> LocationSurveyResponse:
    tz = effective_zoneinfo_for_stored_timezone(user.timezone)
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
        start_date=format_dt_for_user(location_survey.start_date, tz) or "",
        end_date=format_dt_for_user(location_survey.end_date, tz) if location_survey.end_date else None,
        status=derive_location_survey_status(location_survey, location, survey, current_time),
        created_at=format_dt_for_user(location_survey.created_at, tz) or "",
        updated_at=format_dt_for_user(location_survey.updated_at, tz) or "",
    )


def _get_location_survey_or_404(location_survey_id: str, company_id: uuid.UUID, db: Session) -> LocationSurveyORM:
    try:
        parsed_id = uuid.UUID(location_survey_id)
    except ValueError:
        raise ValidationError(code="INVALID_LOCATION_SURVEY_ID", message="Invalid location survey ID")

    location_survey = (
        db.query(LocationSurveyORM)
        .options(
            joinedload(LocationSurveyORM.location),
            joinedload(LocationSurveyORM.survey),
        )
        .join(LocationORM, LocationORM.id == LocationSurveyORM.location_id)
        .join(SurveyORM, SurveyORM.id == LocationSurveyORM.survey_id)
        .filter(
            LocationSurveyORM.id == parsed_id,
            LocationSurveyORM.deleted_at.is_(None),
            LocationORM.company_id == company_id,
            LocationORM.deleted_at.is_(None),
            SurveyORM.company_id == company_id,
            SurveyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not location_survey:
        raise NotFoundError(code="LOCATION_SURVEY_NOT_FOUND", message="Location survey not found")
    return location_survey


@router.post("/location-surveys/bulk-assign", response_model=list[LocationSurveyResponse], status_code=201)
def bulk_assign_location_surveys(
    payload: LocationSurveyBulkAssignCreate,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)

    survey = (
        db.query(SurveyORM)
        .filter(
            SurveyORM.id == payload.survey_id,
            SurveyORM.company_id == company.id,
            SurveyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not survey:
        raise NotFoundError(code="SURVEY_NOT_FOUND", message="Survey not found")
    if survey.status != SurveyStatus.active:
        raise ValidationError(code="SURVEY_NOT_PUBLISHED", message="This survey is not published")

    locations = (
        db.query(LocationORM)
        .filter(
            LocationORM.id.in_(payload.location_ids),
            LocationORM.company_id == company.id,
            LocationORM.deleted_at.is_(None),
        )
        .all()
    )
    if len(locations) != len(payload.location_ids):
        raise NotFoundError(code="LOCATION_NOT_FOUND", message="One or more locations were not found")

    inactive_locations = [str(location.id) for location in locations if not location.is_active]
    if inactive_locations:
        raise ValidationError(
            code="LOCATION_INACTIVE",
            message="One or more selected locations are not active",
            details={"location_ids": inactive_locations},
        )

    existing_assignments = (
        db.query(LocationSurveyORM.location_id)
        .filter(
            LocationSurveyORM.survey_id == survey.id,
            LocationSurveyORM.location_id.in_(payload.location_ids),
            LocationSurveyORM.deleted_at.is_(None),
        )
        .all()
    )
    duplicate_location_ids = find_duplicate_location_ids(
        payload.location_ids,
        [row[0] for row in existing_assignments],
    )
    if duplicate_location_ids:
        raise ConflictError(
            code="LOCATION_SURVEY_CONFLICT",
            message="This survey is already assigned to one or more selected locations",
            details={"location_ids": [str(location_id) for location_id in duplicate_location_ids]},
        )

    assignments: list[LocationSurveyORM] = []
    for location in locations:
        assignment = (
            db.query(LocationSurveyORM)
            .filter(
                LocationSurveyORM.location_id == location.id,
                LocationSurveyORM.survey_id == survey.id,
            )
            .first()
        )
        if assignment:
            assignment.deleted_at = None
            assignment.is_active = True
            assignment.start_date = payload.start_date
            assignment.end_date = payload.end_date
            assignment.updated_at = datetime.now(timezone.utc)
        else:
            assignment = LocationSurveyORM(
                location_id=location.id,
                survey_id=survey.id,
                is_active=True,
                start_date=payload.start_date,
                end_date=payload.end_date,
            )
            db.add(assignment)
            db.flush()
        assignments.append(assignment)

    db.commit()

    created_assignments = (
        db.query(LocationSurveyORM)
        .options(
            joinedload(LocationSurveyORM.location),
            joinedload(LocationSurveyORM.survey),
        )
        .filter(LocationSurveyORM.id.in_([assignment.id for assignment in assignments]))
        .all()
    )
    now = utc_now()
    return [_serialize_location_survey(assignment, user, now) for assignment in created_assignments]


@router.patch("/location-surveys/{location_survey_id}", response_model=LocationSurveyResponse)
def update_location_survey(
    location_survey_id: str,
    payload: LocationSurveyUpdate,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Update assignment dates and is_active. QR code active/inactive is managed separately via /qr-codes."""
    company = _get_company(user, db)
    location_survey = _get_location_survey_or_404(location_survey_id, company.id, db)

    next_start_date = payload.start_date or location_survey.start_date
    next_end_date = payload.end_date if payload.end_date is not None else location_survey.end_date
    if next_end_date is not None and next_end_date <= next_start_date:
        raise ValidationError(
            code="INVALID_DATE_RANGE",
            message="end_date must be after start_date",
            status_code=422,
        )

    update_values: dict = {"updated_at": func.now()}
    if payload.is_active is not None:
        update_values["is_active"] = payload.is_active
    if payload.start_date is not None:
        update_values["start_date"] = payload.start_date
    if payload.end_date is not None or "end_date" in payload.model_dump(exclude_unset=True):
        update_values["end_date"] = payload.end_date

    rowcount = (
        db.query(LocationSurveyORM)
        .filter(
            LocationSurveyORM.id == location_survey.id,
            LocationSurveyORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update(update_values, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("LocationSurvey", str(location_survey.id))

    db.commit()
    db.refresh(location_survey)
    return _serialize_location_survey(location_survey, user)


@router.get("/location-surveys", response_model=list[LocationSurveyResponse])
def list_location_surveys(
    location_id: str | None = Query(default=None),
    survey_id: str | None = Query(default=None),
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
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
    return [_serialize_location_survey(location_survey, user, now) for location_survey in query.all()]


@router.delete("/location-surveys/{location_survey_id}", status_code=204)
def delete_location_survey(
    location_survey_id: str,
    payload: DeleteRequest,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
    location_survey = _get_location_survey_or_404(location_survey_id, company.id, db)

    rowcount = (
        db.query(LocationSurveyORM)
        .filter(
            LocationSurveyORM.id == location_survey.id,
            LocationSurveyORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update({"deleted_at": utc_now(), "updated_at": func.now()}, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("LocationSurvey", str(location_survey.id))

    db.commit()
