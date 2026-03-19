import os
import uuid
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse

from ..core.errors.exceptions import ConflictError, NotFoundError
from sqlalchemy.orm import Session, joinedload


from ..auth.jwt import get_current_user
from ..db.postgres import get_db_connection
from ..models.postgres_model import (
    Company as CompanyORM,
    Location as LocationORM,
    QRCode as QRCodeORM,
    ScanEvent as ScanEventORM,
    Survey as SurveyORM,
    User as UserORM,
)
from ..schemas.pydantic_model import (
    QRCodeCreate,
    QRCodeResponse,
    QRCodeUpdate,
    SurveySummaryResponse,
)

router = APIRouter()
public_router = APIRouter()


def _get_company(user: UserORM, db: Session) -> CompanyORM:
    company = db.query(CompanyORM).filter(CompanyORM.owner_user_id == user.id).first()
    if not company:
        raise NotFoundError(code="COMPANY_NOT_FOUND", message="Company not found")
    return company


def _get_qr_or_404(qr_id: str, company_id: uuid.UUID, db: Session) -> QRCodeORM:
    try:
        uid = uuid.UUID(qr_id)
    except ValueError:
        raise NotFoundError(code="QR_CODE_NOT_FOUND", message="QR code not found")

    qr = db.query(QRCodeORM).filter(
        QRCodeORM.id == uid,
        QRCodeORM.company_id == company_id,
    ).first()
    if not qr:
        raise NotFoundError(code="QR_CODE_NOT_FOUND", message="QR code not found")
    return qr


def _to_response(qr: QRCodeORM, survey_title: str | None = None, location_name: str | None = None) -> QRCodeResponse:
    return QRCodeResponse(
        id=qr.id,
        title=qr.title,
        survey_id=qr.survey_id,
        survey_title=survey_title,
        location_id=qr.location_id,
        location_name=location_name,
        is_active=qr.is_active,
        created_at=qr.created_at.isoformat(),
        updated_at=qr.updated_at.isoformat(),
    )

# --------------------------------------------------
# QR Codes CRUD
# --------------------------------------------------
@router.get("/qr-codes", response_model=list[QRCodeResponse])
def list_qr_codes(
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)

    # Query with eager loading for survey and location
    qrs = (
        db.query(QRCodeORM)
        .options(
            joinedload(QRCodeORM.survey),
            joinedload(QRCodeORM.location),
        )
        .filter(QRCodeORM.company_id == company.id)
        .order_by(QRCodeORM.created_at.desc())
        .all()
    )

    for qr in qrs:
        print("QR:", qr.id)
        print("survey_id:", qr.survey_id)
        print("survey:", qr.survey)
        print("location:", qr.location)

    # Map each QR to response
    return [
        _to_response(
            qr,
            survey_title=qr.survey.name if qr.survey else None,
            location_name=qr.location.name if qr.location else None,
        )
        for qr in qrs
    ]


@router.post("/qr-codes", response_model=QRCodeResponse, status_code=201)
def create_qr_code(
    payload: QRCodeCreate,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)

    # Validate survey belongs to company
    survey = db.query(SurveyORM).filter(
        SurveyORM.id == payload.survey_id,
        SurveyORM.company_id == company.id,
    ).first()
    if not survey:
        raise NotFoundError(code="SURVEY_NOT_FOUND", message="Survey not found")

    # Validate location belongs to company (if provided)
    loc = None
    if payload.location_id is not None:
        loc = db.query(LocationORM).filter(
            LocationORM.id == payload.location_id,
            LocationORM.company_id == company.id,
        ).first()
        if not loc:
            raise NotFoundError(code="LOCATION_NOT_FOUND", message="Location not found")

    # Check title uniqueness
    existing = db.query(QRCodeORM).filter(QRCodeORM.title == payload.title.strip()).first()
    if existing:
        raise ConflictError(code="QR_TITLE_CONFLICT", message="Title is already in use")

    qr = QRCodeORM(
        company_id=company.id,
        title=payload.title.strip(),
        is_active=True,
        survey_id=payload.survey_id,
        location_id=payload.location_id,
    )
    db.add(qr)
    db.commit()
    db.refresh(qr)
    return _to_response(qr=qr, survey_title=survey.name if payload.survey_id else None, location_name=loc.name if payload.location_id else None)


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
        existing = db.query(QRCodeORM).filter(
            QRCodeORM.title == title,
            QRCodeORM.id != qr.id,
        ).first()
        if existing:
            raise ConflictError(code="QR_TITLE_CONFLICT", message="Title is already in use")
        qr.title = title

    survey = None
    loc = None

    if payload.survey_id is not None:
        survey = db.query(SurveyORM).filter(
            SurveyORM.id == payload.survey_id,
            SurveyORM.company_id == company.id,
        ).first()
        if not survey:
            raise NotFoundError(code="SURVEY_NOT_FOUND", message="Survey not found")
        qr.survey_id = payload.survey_id

    if payload.location_id is not None:
        loc = db.query(LocationORM).filter(
            LocationORM.id == payload.location_id,
            LocationORM.company_id == company.id,
        ).first()
        if not loc:
            raise NotFoundError(code="LOCATION_NOT_FOUND", message="Location not found")
        qr.location_id = payload.location_id
    elif "location_id" in payload.model_dump(exclude_unset=True) and payload.location_id is None:
        qr.location_id = None

    if payload.is_active is not None:
        qr.is_active = payload.is_active

    db.commit()
    db.refresh(qr)
    return _to_response(qr=qr, survey_title=survey.name if payload.survey_id else None, location_name=loc.name if payload.location_id else None)


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


# --------------------------------------------------
# Public: QR redirect  (mounted at /q, no /api/v1 prefix)
# --------------------------------------------------
@public_router.get("/{title}")
def resolve_qr(
    title: str,
    request: Request,
    db: Session = Depends(get_db_connection),
):
    qr = db.query(QRCodeORM).filter(
        QRCodeORM.title == title,
        QRCodeORM.is_active.is_(True),
    ).first()

    if not qr:
        raise NotFoundError(code="QR_CODE_NOT_FOUND", message="QR code not found or inactive")

    # Track the scan
    scan = ScanEventORM(
        qr_code_id=qr.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(scan)
    db.commit()

    frontend_origin = os.getenv("FRONTEND_ORIGIN")
    redirect_url = f"{frontend_origin}/survey/{qr.survey_id}"
    return RedirectResponse(url=redirect_url, status_code=302)
