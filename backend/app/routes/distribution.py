import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from ..auth.jwt import get_current_user
from ..auth.subscription import require_active_subscription
from ..auth.user_timezone import format_dt_for_user
from ..core.errors.exceptions import ConflictError, ExternalAPIError, NotFoundError, RateLimitExceededError, StaleObjectError, ValidationError
from ..core.timezone_australia import effective_zoneinfo_for_stored_timezone
from ..core.rate_limit import check_rate_limit, check_qr_rate_limit
from ..db.postgres import get_db_connection
from ..models.postgres_model import (
    Company as CompanyORM,
    Location as LocationORM,
    LocationSurvey as LocationSurveyORM,
    QRCode as QRCodeORM,
    QRCodeAsset as QRCodeAssetORM,
    Survey as SurveyORM,
    User as UserORM,
)
from ..schemas.pydantic_model import (
    DeleteRequest,
    QRCodeAssetUrls,
    QRCodeCreate,
    QRCodeResponse,
    QRCodeUpdate,
)
from ..services.location_survey_service import (
    derive_location_survey_status,
    derive_qr_code_status,
    get_company_submission_blocked_active_qr_count,
    utc_now,
)
from ..services.qr_code_service import (
    default_redirect_url_for_qr_id,
    delete_storage_paths,
    generate_qr_bytes,
    storage_path_for,
    upload_qr_assets_to_supabase,
)

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_active_subscription)])
public_router = APIRouter()


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


def _asset_urls(qr: QRCodeORM) -> QRCodeAssetUrls | None:
    assets = getattr(qr, "assets", None) or []
    if not assets:
        return None
    m = {a.format: a.public_url for a in assets}
    if not all(k in m for k in ("svg", "png", "jpeg")):
        return None
    return QRCodeAssetUrls(svg=m["svg"], png=m["png"], jpeg=m["jpeg"])


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
            selectinload(QRCodeORM.assets),
        )
        .join(LocationSurveyORM, LocationSurveyORM.id == QRCodeORM.location_survey_id)
        .join(LocationORM, LocationORM.id == QRCodeORM.location_id)
        .join(SurveyORM, SurveyORM.id == LocationSurveyORM.survey_id)
        .filter(
            QRCodeORM.id == uid,
            QRCodeORM.company_id == company_id,
            QRCodeORM.deleted_at.is_(None),
            LocationORM.deleted_at.is_(None),
            SurveyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not qr:
        raise NotFoundError(code="QR_CODE_NOT_FOUND", message="QR code not found")
    return qr


def _to_response(qr: QRCodeORM, user: UserORM) -> QRCodeResponse:
    tz = effective_zoneinfo_for_stored_timezone(user.timezone)
    location_survey = qr.location_survey
    location = location_survey.location
    survey = location_survey.survey
    now = utc_now()
    ls_status = derive_location_survey_status(location_survey, location, survey, now)
    qr_status = derive_qr_code_status(qr)
    return QRCodeResponse(
        id=qr.id,
        title=qr.title,
        location_survey_id=location_survey.id,
        survey_id=survey.id,
        survey_title=survey.name,
        qr_status=qr_status,
        location_survey_status=ls_status,
        location_id=location.id,
        location_name=location.name,
        start_date=format_dt_for_user(location_survey.start_date, tz) or "",
        end_date=format_dt_for_user(location_survey.end_date, tz) if location_survey.end_date else None,
        is_active=qr.is_active,
        redirect_url=qr.redirect_url,
        has_logo=qr.has_logo,
        assets=_asset_urls(qr),
        created_at=format_dt_for_user(qr.created_at, tz) or "",
        updated_at=format_dt_for_user(qr.updated_at, tz) or "",
        location_status=ls_status,
        assignment_status=ls_status,
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
            selectinload(QRCodeORM.assets),
        )
        .join(LocationSurveyORM, LocationSurveyORM.id == QRCodeORM.location_survey_id)
        .join(LocationORM, LocationORM.id == QRCodeORM.location_id)
        .join(SurveyORM, SurveyORM.id == LocationSurveyORM.survey_id)
        .filter(
            QRCodeORM.company_id == company.id,
            QRCodeORM.deleted_at.is_(None),
            LocationORM.deleted_at.is_(None),
            SurveyORM.deleted_at.is_(None),
        )
        .order_by(QRCodeORM.created_at.desc())
        .all()
    )
    return [_to_response(qr, user) for qr in qrs]


@router.get("/qr-codes/submission-blocked-summary")
def get_qr_codes_submission_blocked_summary(
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
    return {
        "submission_blocked_active_qr_count": get_company_submission_blocked_active_qr_count(
            db, company.id
        ),
    }


@router.get("/qr-codes/{qr_id}", response_model=QRCodeResponse)
def get_qr_code(
    qr_id: str,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
    return _to_response(_get_qr_or_404(qr_id, company.id, db), user)


@router.post("/qr-codes", response_model=QRCodeResponse, status_code=201)
def create_qr_code(
    payload: QRCodeCreate,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Create a QR code; its active flag is independent of the assignment's is_active."""
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

    qr_id = uuid.uuid4()
    raw_redirect = (payload.redirect_url or "").strip()
    if raw_redirect:
        redirect = raw_redirect
    else:
        redirect = default_redirect_url_for_qr_id(qr_id)

    logger.info(
        "QR creation started",
        extra={"qr_code_id": str(qr_id), "has_logo": payload.has_logo},
    )

    try:
        assets_bytes = generate_qr_bytes(redirect_url=redirect, has_logo=payload.has_logo)
    except ValidationError:
        raise
    except ExternalAPIError:
        raise
    except Exception as e:
        logger.exception("QR generation failed", extra={"qr_code_id": str(qr_id)})
        raise ExternalAPIError(
            service_name="qr_generation",
            error_message="Failed to generate QR code images",
            code="QR_GENERATION_FAILED",
            status_code=502,
            details={"qr_code_id": str(qr_id)},
        ) from e

    qr = QRCodeORM(
        id=qr_id,
        company_id=company.id,
        title=title,
        is_active=True,
        location_survey_id=location_survey.id,
        location_id=location_survey.location_id,
        redirect_url=redirect,
        has_logo=payload.has_logo,
    )
    db.add(qr)
    db.flush()

    paths_uploaded: list[str] = []
    try:
        urls, paths_uploaded = upload_qr_assets_to_supabase(qr_code_id=qr_id, assets=assets_bytes)
        for fmt, url in urls.items():
            db.add(
                QRCodeAssetORM(
                    qr_code_id=qr_id,
                    format=fmt,
                    storage_path=storage_path_for(qr_id, fmt),
                    public_url=url,
                )
            )
        db.commit()
    except Exception as e:
        db.rollback()
        delete_storage_paths(paths_uploaded)
        if isinstance(e, ExternalAPIError):
            raise
        logger.exception("QR persist failed", extra={"qr_code_id": str(qr_id)})
        raise ExternalAPIError(
            service_name="qr_storage",
            error_message="Failed to store QR code assets",
            code="QR_PERSIST_FAILED",
            status_code=502,
            details={"qr_code_id": str(qr_id)},
        ) from e

    return _to_response(_get_qr_or_404(str(qr_id), company.id, db), user)


@router.patch("/qr-codes/{qr_id}", response_model=QRCodeResponse)
def update_qr_code(
    qr_id: str,
    payload: QRCodeUpdate,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
    qr = _get_qr_or_404(qr_id, company.id, db)

    update_values: dict = {"updated_at": func.now()}

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
        update_values["title"] = title

    if payload.location_survey_id is not None:
        location_survey = _get_location_survey_for_company(payload.location_survey_id, company.id, db)
        update_values["location_survey_id"] = location_survey.id
        update_values["location_id"] = location_survey.location_id

    if payload.is_active is not None:
        update_values["is_active"] = payload.is_active

    rowcount = (
        db.query(QRCodeORM)
        .filter(
            QRCodeORM.id == qr.id,
            QRCodeORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update(update_values, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("QRCode", str(qr.id))

    db.commit()
    return _to_response(_get_qr_or_404(str(qr.id), company.id, db), user)


@router.delete("/qr-codes/{qr_id}", status_code=204)
def delete_qr_code(
    qr_id: str,
    payload: DeleteRequest,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
    qr = _get_qr_or_404(qr_id, company.id, db)

    rowcount = (
        db.query(QRCodeORM)
        .filter(
            QRCodeORM.id == qr.id,
            QRCodeORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update({"deleted_at": utc_now(), "updated_at": func.now()}, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("QRCode", str(qr.id))

    db.commit()


@public_router.get("/{title}")
def resolve_qr(
    title: str,
    request: Request,
    db: Session = Depends(get_db_connection),
):
    # Rate limit: 30 requests / minute / IP (global) + 10 / minute / QR / IP
    check_rate_limit(request, "qr_redirect", limit=30, window=60)

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

    check_qr_rate_limit(request, str(qr.id))

    frontend_origin = os.getenv("FRONTEND_ORIGIN")
    redirect_url = f"{frontend_origin}/r/{qr.id}"
    return RedirectResponse(url=redirect_url, status_code=302)
