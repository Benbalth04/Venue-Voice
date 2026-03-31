from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy.orm import Session, joinedload

from ..core.errors.exceptions import ValidationError
from ..models.postgres_model import LocationSurvey as LocationSurveyORM
from ..models.postgres_model import QRCode as QRCodeORM
from ..models.postgres_model import SurveyStatus


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def derive_location_survey_status(location_survey, location, survey, now: datetime) -> str:
    """Return one of: active, scheduled, inactive, deleted (assignment lifecycle, independent of QR codes)."""
    if getattr(location_survey, "deleted_at", None) is not None:
        return "deleted"

    if survey is None or getattr(survey, "deleted_at", None) is not None:
        return "inactive"
    if getattr(survey, "status", None) != SurveyStatus.active:
        return "inactive"

    if location is None or getattr(location, "deleted_at", None) is not None:
        return "inactive"
    if not getattr(location, "is_active", False):
        return "inactive"

    current_time = ensure_utc(now)
    start_date = ensure_utc(location_survey.start_date)
    end_date = ensure_utc(location_survey.end_date) if location_survey.end_date is not None else None

    if end_date is not None and current_time > end_date:
        return "inactive"

    if current_time < start_date:
        if not getattr(location_survey, "is_active", False):
            return "inactive"
        return "scheduled"

    if not getattr(location_survey, "is_active", False):
        return "inactive"

    return "active"


def derive_qr_code_status(qr) -> str:
    """Return one of: active, inactive, deleted (QR only; not tied to location_survey flags)."""
    if getattr(qr, "deleted_at", None) is not None:
        return "deleted"
    if not getattr(qr, "is_active", False):
        return "inactive"
    return "active"


def get_company_submission_blocked_active_qr_count(db: Session, company_id: uuid.UUID) -> int:
    """Count non-deleted, active QR codes whose linked assignment is not accepting submissions."""
    now = utc_now()
    qrs = (
        db.query(QRCodeORM)
        .options(
            joinedload(QRCodeORM.location_survey).joinedload(LocationSurveyORM.location),
            joinedload(QRCodeORM.location_survey).joinedload(LocationSurveyORM.survey),
        )
        .filter(
            QRCodeORM.company_id == company_id,
            QRCodeORM.deleted_at.is_(None),
            QRCodeORM.is_active.is_(True),
        )
        .all()
    )
    blocked = 0
    for qr in qrs:
        ls = qr.location_survey
        if ls is None:
            continue
        if derive_location_survey_status(ls, ls.location, ls.survey, now) != "active":
            blocked += 1
    return blocked


def validate_qr_scan_access(qr, now: datetime):
    if getattr(qr, "deleted_at", None) is not None:
        raise ValidationError(code="QR_CODE_INACTIVE", message="QR code is inactive")
    if not getattr(qr, "is_active", False):
        raise ValidationError(code="QR_CODE_INACTIVE", message="QR code is inactive")

    location_survey = getattr(qr, "location_survey", None)
    if location_survey is None or getattr(location_survey, "deleted_at", None) is not None:
        raise ValidationError(
            code="LOCATION_SURVEY_INACTIVE",
            message="This survey is not available right now",
        )

    current_time = ensure_utc(now)
    start_date = ensure_utc(location_survey.start_date)
    end_date = ensure_utc(location_survey.end_date) if location_survey.end_date is not None else None
    if current_time < start_date or (end_date is not None and current_time > end_date):
        raise ValidationError(
            code="LOCATION_SURVEY_DATE_INVALID",
            message="This survey is not currently running",
        )

    location = getattr(location_survey, "location", None)
    if location is None or getattr(location, "deleted_at", None) is not None or not getattr(location, "is_active", False):
        raise ValidationError(
            code="LOCATION_INACTIVE",
            message="This location is not active",
        )

    survey = getattr(location_survey, "survey", None)
    if survey is None or getattr(survey, "deleted_at", None) is not None or getattr(survey, "status", None) != SurveyStatus.active:
        raise ValidationError(
            code="SURVEY_UNPUBLISHED",
            message="This survey is not published",
        )

    return location_survey, location, survey


def find_duplicate_location_ids(
    requested_location_ids: Iterable[uuid.UUID],
    existing_location_ids: Iterable[uuid.UUID],
) -> list[uuid.UUID]:
    existing_lookup = set(existing_location_ids)
    return [location_id for location_id in requested_location_ids if location_id in existing_lookup]
