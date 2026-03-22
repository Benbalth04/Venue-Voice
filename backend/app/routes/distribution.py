import os
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session, joinedload

from ..auth.jwt import get_current_user
from ..core.errors.exceptions import ConflictError, NotFoundError, ValidationError
from ..db.postgres import get_db_connection
from ..models.postgres_model import (
    Company as CompanyORM,
    Location as LocationORM,
    LocationSurvey as LocationSurveyORM,
    QRCode as QRCodeORM,
    Survey as SurveyORM,
    User as UserORM,
)
from ..schemas.pydantic_model import QRCodeCreate, QRCodeResponse, QRCodeUpdate
from ..services.location_survey_service import derive_location_survey_status, utc_now

router = APIRouter()
public_router = APIRouter()


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


def _location_survey_query(db: Session):
    return (
        db.query(LocationSurveyORM)
        .options(
            joinedload(LocationSurveyORM.location),
            joinedload(LocationSurveyORM.survey),
        )
        .join(LocationORM, LocationORM.id == LocationSurveyORM.location_id)
        .join(SurveyORM, SurveyORM.id == LocationSurveyORM.survey_id)
        .filter(
            LocationSurveyORM.deleted_at.is_(None),
            LocationORM.deleted_at.is_(None),
            SurveyORM.deleted_at.is_(None),
        )
    )


def _get_location_survey_for_company(
    location_survey_id: uuid.UUID,
    company_id: uuid.UUID,
    db: Session,
) -> LocationSurveyORM:
    location_survey = (
        _location_survey_query(db)
        .filter(
            LocationSurveyORM.id == location_survey_id,
            LocationORM.company_id == company_id,
            SurveyORM.company_id == company_id,
        )
        .first()
    )
    if not location_survey:
        raise NotFoundError(code="LOCATION_SURVEY_NOT_FOUND", message="Location survey not found")
    return location_survey


def _get_qr_or_404(qr_id: str, company_id: uuid.UUID, db: Session) -> QRCodeORM:
    try:
        uid = uuid.UUID(qr_id)
    except ValueError:
        raise NotFoundError(code="QR_CODE_NOT_FOUND", message="QR code not found")

    qr = (
        db.query(QRCodeORM)
        .options(
            joinedload(QRCodeORM.location),
            joinedload(QRCodeORM.location_survey).joinedload(LocationSurveyORM.location),
            joinedload(QRCodeORM.location_survey).joinedload(LocationSurveyORM.survey),
        )
        .join(LocationSurveyORM, LocationSurveyORM.id == QRCodeORM.location_survey_id)
        .join(LocationORM, LocationORM.id == QRCodeORM.location_id)
        .join(SurveyORM, SurveyORM.id == LocationSurveyORM.survey_id)
        .filter(
            QRCodeORM.id == uid,
            QRCodeORM.company_id == company_id,
            QRCodeORM.deleted_at.is_(None),
            LocationSurveyORM.deleted_at.is_(None),
            LocationORM.deleted_at.is_(None),
            SurveyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not qr:
        raise NotFoundError(code="QR_CODE_NOT_FOUND", message="QR code not found")
    return qr


def _to_response(qr: QRCodeORM) -> QRCodeResponse:
    location_survey = qr.location_survey
    location = location_survey.location
    survey = location_survey.survey
    status = derive_location_survey_status(location_survey, location, survey, utc_now())
    return QRCodeResponse(
        id=qr.id,
        title=qr.title,
        location_survey_id=location_survey.id,
        survey_id=survey.id,
        survey_title=survey.name,
        location_status=status,
        location_id=location.id,
        location_name=location.name,
        start_date=location_survey.start_date.isoformat(),
        end_date=location_survey.end_date.isoformat() if location_survey.end_date else None,
        assignment_status=status,
        is_active=qr.is_active,
        created_at=qr.created_at.isoformat(),
        updated_at=qr.updated_at.isoformat(),
    )


@router.get("/qr-codes", response_model=list[QRCodeResponse])
def list_qr_codes(
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
    qrs = (
        db.query(QRCodeORM)
        .options(
            joinedload(QRCodeORM.location),
            joinedload(QRCodeORM.location_survey).joinedload(LocationSurveyORM.location),
            joinedload(QRCodeORM.location_survey).joinedload(LocationSurveyORM.survey),
        )
        .join(LocationSurveyORM, LocationSurveyORM.id == QRCodeORM.location_survey_id)
        .join(LocationORM, LocationORM.id == QRCodeORM.location_id)
        .join(SurveyORM, SurveyORM.id == LocationSurveyORM.survey_id)
        .filter(
            QRCodeORM.company_id == company.id,
            QRCodeORM.deleted_at.is_(None),
            LocationSurveyORM.deleted_at.is_(None),
            LocationORM.deleted_at.is_(None),
            SurveyORM.deleted_at.is_(None),
        )
        .order_by(QRCodeORM.created_at.desc())
        .all()
    )
    return [_to_response(qr) for qr in qrs]


@router.post("/qr-codes", response_model=QRCodeResponse, status_code=201)
def create_qr_code(
    payload: QRCodeCreate,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)

    location_survey = _get_location_survey_for_company(payload.location_survey_id, company.id, db)

    title = payload.title.strip()
    if not title:
        raise ValidationError(code="INVALID_QR_TITLE", message="Title cannot be empty", status_code=422)

    existing = (
        db.query(QRCodeORM)
        .filter(
            QRCodeORM.title == title,
            QRCodeORM.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        raise ConflictError(code="QR_TITLE_CONFLICT", message="Title is already in use")

    qr = QRCodeORM(
        company_id=company.id,
        title=title,
        is_active=True,
        location_survey_id=location_survey.id,
        location_id=location_survey.location_id,
    )
    db.add(qr)
    db.commit()
    db.refresh(qr)
    return _to_response(_get_qr_or_404(str(qr.id), company.id, db))


@router.patch("/qr-codes/{qr_id}", response_model=QRCodeResponse)
def update_qr_code(
    qr_id: str,
    payload: QRCodeUpdate,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
    qr = _get_qr_or_404(qr_id, company.id, db)

    if payload.title is not None:
        title = payload.title.strip()
        if not title:
            raise ValidationError(code="INVALID_QR_TITLE", message="Title cannot be empty", status_code=422)
        existing = (
            db.query(QRCodeORM)
            .filter(
                QRCodeORM.title == title,
                QRCodeORM.id != qr.id,
                QRCodeORM.deleted_at.is_(None),
            )
            .first()
        )
        if existing:
            raise ConflictError(code="QR_TITLE_CONFLICT", message="Title is already in use")
        qr.title = title

    if payload.location_survey_id is not None:
        location_survey = _get_location_survey_for_company(payload.location_survey_id, company.id, db)
        qr.location_survey_id = location_survey.id
        qr.location_id = location_survey.location_id

    if payload.is_active is not None:
        qr.is_active = payload.is_active

    db.commit()
    db.refresh(qr)
    return _to_response(_get_qr_or_404(str(qr.id), company.id, db))


@router.delete("/qr-codes/{qr_id}", status_code=204)
def deactivate_qr_code(
    qr_id: str,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
    qr = _get_qr_or_404(qr_id, company.id, db)
    qr.is_active = False
    db.commit()


@public_router.get("/{title}")
def resolve_qr(
    title: str,
    db: Session = Depends(get_db_connection),
):
    qr = (
        db.query(QRCodeORM)
        .filter(
            QRCodeORM.title == title,
            QRCodeORM.deleted_at.is_(None),
        )
        .first()
    )
    if not qr:
        raise NotFoundError(code="QR_CODE_NOT_FOUND", message="QR code not found")

    frontend_origin = os.getenv("FRONTEND_ORIGIN")
    redirect_url = f"{frontend_origin}/r/{qr.id}"
    return RedirectResponse(url=redirect_url, status_code=302)
