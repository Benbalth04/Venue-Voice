import logging
import re
import uuid
from datetime import datetime, timezone

from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from ..auth.membership import get_company_from_membership, get_current_membership, require_company_admin
from ..auth.subscription import require_active_subscription
from ..auth.user_timezone import format_dt_for_user, get_user_zoneinfo
from ..auth.viewer_scoping import assert_location_access, location_ids_subquery, survey_ids_subquery
from ..core.config import settings
from ..core.errors.exceptions import ConflictError, ExternalAPIError, NotFoundError, RateLimitExceededError, StaleObjectError, ValidationError
from ..core.rate_limit import check_rate_limit, check_qr_rate_limit
from ..db.postgres import get_db_connection
from ..models.postgres_model import (
    Location as LocationORM,
    LocationSurvey as LocationSurveyORM,
    Membership as MembershipORM,
    QRCode as QRCodeORM,
    QRCodeAsset as QRCodeAssetORM,
    Survey as SurveyORM,
    SurveyResponse as SurveyResponseORM,
    SurveySession as SurveySessionORM,
    SurveyStatus,
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
from ..integrations.supabase_storage import generate_qr_signed_url, get_supabase_service_client
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




def _asset_urls(qr: QRCodeORM, client) -> QRCodeAssetUrls | None:
    assets = getattr(qr, "assets", None) or []
    if not assets:
        return None
    m = {a.format: a.storage_path for a in assets}
    if not all(k in m for k in ("svg", "png")):
        return None
    return QRCodeAssetUrls(
        svg=generate_qr_signed_url(client=client, storage_path=m["svg"]),
        png=generate_qr_signed_url(client=client, storage_path=m["png"]),
    )


def _get_active_qr_or_404(qr_id: str, company_id: uuid.UUID, db: Session) -> QRCodeORM:
    """Non-deleted QR on a non-archived location (dashboard operations on live rows)."""
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
            QRCodeORM.archived_at.is_(None),
            LocationORM.deleted_at.is_(None),
            LocationORM.archived_at.is_(None),
            SurveyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not qr:
        raise NotFoundError(code="QR_CODE_NOT_FOUND", message="QR code not found")
    return qr


def _get_qr_row_or_404(qr_id: str, company_id: uuid.UUID, db: Session) -> QRCodeORM:
    """Non-deleted QR (any archive state), for archive / unarchive."""
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


def _find_or_create_location_survey(
    location_id: uuid.UUID,
    survey_id: uuid.UUID,
    company_id: uuid.UUID,
    db: Session,
) -> LocationSurveyORM:
    """Return the LocationSurvey for (location_id, survey_id), creating or reactivating it as needed."""
    location = (
        db.query(LocationORM)
        .filter(
            LocationORM.id == location_id,
            LocationORM.company_id == company_id,
            LocationORM.deleted_at.is_(None),
            LocationORM.archived_at.is_(None),
        )
        .first()
    )
    if not location:
        raise NotFoundError(code="LOCATION_NOT_FOUND", message="Location not found")
    if location.archived_at is not None:
        raise ValidationError(code="LOCATION_ARCHIVED", message="Location is archived", status_code=422)
    if not location.is_active:
        raise ValidationError(code="LOCATION_INACTIVE", message="Location is not active", status_code=422)

    survey = (
        db.query(SurveyORM)
        .filter(
            SurveyORM.id == survey_id,
            SurveyORM.company_id == company_id,
            SurveyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not survey:
        raise NotFoundError(code="SURVEY_NOT_FOUND", message="Survey not found")
    if survey.status != SurveyStatus.active:
        raise ValidationError(code="SURVEY_NOT_PUBLISHED", message="Survey is not published", status_code=422)

    # Query including soft-deleted rows to avoid duplicate inserts (unique constraint on location_id, survey_id)
    existing = (
        db.query(LocationSurveyORM)
        .filter(
            LocationSurveyORM.location_id == location_id,
            LocationSurveyORM.survey_id == survey_id,
        )
        .first()
    )
    if existing:
        existing.deleted_at = None
        existing.is_active = True
        existing.updated_at = datetime.now(timezone.utc)
        db.flush()
        return existing

    ls = LocationSurveyORM(
        location_id=location_id,
        survey_id=survey_id,
        is_active=True,
        start_date=datetime.now(timezone.utc),
    )
    db.add(ls)
    db.flush()
    return ls


def _maybe_deactivate_location_survey(location_survey_id: uuid.UUID, db: Session) -> None:
    """Soft-delete a LocationSurvey if it has no remaining active (non-archived) QR codes."""
    remaining = (
        db.query(QRCodeORM)
        .filter(
            QRCodeORM.location_survey_id == location_survey_id,
            QRCodeORM.deleted_at.is_(None),
            QRCodeORM.archived_at.is_(None),
        )
        .count()
    )
    if remaining == 0:
        db.query(LocationSurveyORM).filter(
            LocationSurveyORM.id == location_survey_id,
        ).update({"deleted_at": utc_now(), "updated_at": utc_now()}, synchronize_session=False)
        db.commit()


def _to_response(qr: QRCodeORM, user_tz: ZoneInfo, client) -> QRCodeResponse:
    location_survey = qr.location_survey
    location = location_survey.location
    survey = location_survey.survey
    now = utc_now()
    ls_status = derive_location_survey_status(location_survey, location, survey, now)
    qr_status = derive_qr_code_status(qr)
    survey_published = (
        survey is not None
        and getattr(survey, "deleted_at", None) is None
        and getattr(survey, "status", None) == SurveyStatus.active
    )
    location_active = (
        location is not None
        and getattr(location, "deleted_at", None) is None
        and getattr(location, "archived_at", None) is None
        and bool(getattr(location, "is_active", False))
    )
    accepting_submissions_by_survey_and_location = survey_published and location_active
    return QRCodeResponse(
        id=qr.id,
        title=qr.title,
        location_survey_id=location_survey.id,
        survey_id=survey.id,
        survey_title=survey.name,
        qr_status=qr_status,
        location_survey_status=ls_status,
        accepting_submissions_by_survey_and_location=accepting_submissions_by_survey_and_location,
        location_id=location.id,
        location_name=location.name,
        start_date=format_dt_for_user(location_survey.start_date, user_tz) or "",
        end_date=format_dt_for_user(location_survey.end_date, user_tz) if location_survey.end_date else None,
        is_active=qr.is_active,
        redirect_url=qr.redirect_url,
        color=qr.color,
        assets=_asset_urls(qr, client),
        created_at=format_dt_for_user(qr.created_at, user_tz) or "",
        updated_at=format_dt_for_user(qr.updated_at, user_tz) or "",
        archived_at=format_dt_for_user(qr.archived_at, user_tz) if qr.archived_at else None,
        location_status=ls_status,
        assignment_status=ls_status,
    )


@router.get("/qr-codes", response_model=list[QRCodeResponse])
def list_qr_codes(
    archived: bool = Query(False, description="If true, only archived QR rows; if false, only non-archived."),
    membership: MembershipORM = Depends(get_current_membership),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
    location_sq = location_ids_subquery(membership, db)
    survey_sq = survey_ids_subquery(membership, db)
    q = (
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
    )
    if archived:
        q = q.filter(
            or_(
                QRCodeORM.archived_at.isnot(None),
                LocationORM.archived_at.isnot(None),
            )
        )
    else:
        q = q.filter(
            QRCodeORM.archived_at.is_(None),
            LocationORM.archived_at.is_(None),
        )
    if location_sq is not None:
        q = q.filter(QRCodeORM.location_id.in_(location_sq))
    if survey_sq is not None:
        q = q.filter(LocationSurveyORM.survey_id.in_(survey_sq))
    qrs = q.order_by(QRCodeORM.created_at.desc()).all()
    client = get_supabase_service_client()
    return [_to_response(qr, user_tz, client) for qr in qrs]


@router.get("/qr-codes/submission-blocked-summary")
def get_qr_codes_submission_blocked_summary(
    membership: MembershipORM = Depends(get_current_membership),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
    return {
        "submission_blocked_active_qr_count": get_company_submission_blocked_active_qr_count(
            db, company.id
        ),
    }


@router.get("/qr-codes/{qr_id}", response_model=QRCodeResponse)
def get_qr_code(
    qr_id: str,
    membership: MembershipORM = Depends(get_current_membership),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
    qr = _get_active_qr_or_404(qr_id, company.id, db)
    assert_location_access(membership, qr.location_id, db)
    client = get_supabase_service_client()
    return _to_response(qr, user_tz, client)


@router.post("/qr-codes", response_model=QRCodeResponse, status_code=201)
def create_qr_code(
    payload: QRCodeCreate,
    membership: MembershipORM = Depends(require_company_admin),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    """Create a QR code; auto-creates the LocationSurvey for the (location, survey) pair if needed."""
    company = get_company_from_membership(membership, db)

    location_survey = _find_or_create_location_survey(payload.location_id, payload.survey_id, company.id, db)

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

    color = (payload.color or "#000000").strip().upper()
    if not re.fullmatch(r"#[0-9A-F]{6}", color):
        raise ValidationError(code="INVALID_QR_COLOR", message="color must be a 6-digit hex value, e.g. #1A2B3C", status_code=422)

    qr_id = uuid.uuid4()
    raw_redirect = (payload.redirect_url or "").strip()
    if raw_redirect:
        redirect = raw_redirect
    else:
        redirect = default_redirect_url_for_qr_id(qr_id)

    logger.info("QR creation started", extra={"qr_code_id": str(qr_id)})

    try:
        assets_bytes = generate_qr_bytes(redirect_url=redirect, color=color)
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
        color=color,
    )
    db.add(qr)
    db.flush()

    paths_uploaded: list[str] = []
    try:
        storage_paths, paths_uploaded = upload_qr_assets_to_supabase(qr_code_id=qr_id, assets=assets_bytes)
        for fmt, path in storage_paths.items():
            db.add(
                QRCodeAssetORM(
                    qr_code_id=qr_id,
                    format=fmt,
                    storage_path=path,
                    public_url=path,
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

    client = get_supabase_service_client()
    return _to_response(_get_active_qr_or_404(str(qr_id), company.id, db), user_tz, client)


@router.patch("/qr-codes/{qr_id}", response_model=QRCodeResponse)
def update_qr_code(
    qr_id: str,
    payload: QRCodeUpdate,
    membership: MembershipORM = Depends(require_company_admin),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
    qr = _get_active_qr_or_404(qr_id, company.id, db)

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

    has_location = payload.location_id is not None
    has_survey = payload.survey_id is not None
    if has_location != has_survey:
        raise ValidationError(
            code="INVALID_REASSIGNMENT",
            message="location_id and survey_id must be provided together",
            status_code=422,
        )

    old_location_survey_id: uuid.UUID | None = None
    if has_location and has_survey:
        old_location_survey_id = qr.location_survey_id
        new_ls = _find_or_create_location_survey(payload.location_id, payload.survey_id, company.id, db)
        update_values["location_survey_id"] = new_ls.id
        update_values["location_id"] = new_ls.location_id

    if payload.is_active is not None:
        update_values["is_active"] = payload.is_active

    if payload.color is not None:
        color = payload.color.strip().upper()
        if not re.fullmatch(r"#[0-9A-F]{6}", color):
            raise ValidationError(
                code="INVALID_QR_COLOR",
                message="color must be a 6-digit hex value, e.g. #1A2B3C",
                status_code=422,
            )
        current = (qr.color or "#000000").strip().upper()
        if color != current:
            raw_redirect = (qr.redirect_url or "").strip()
            redirect = raw_redirect or default_redirect_url_for_qr_id(qr.id)
            logger.info("QR color update: regenerating assets", extra={"qr_code_id": str(qr.id)})
            try:
                assets_bytes = generate_qr_bytes(redirect_url=redirect, color=color)
            except ValidationError:
                raise
            except ExternalAPIError:
                raise
            except Exception as e:
                logger.exception("QR generation failed", extra={"qr_code_id": str(qr.id)})
                raise ExternalAPIError(
                    service_name="qr_generation",
                    error_message="Failed to generate QR code images",
                    code="QR_GENERATION_FAILED",
                    status_code=502,
                    details={"qr_code_id": str(qr.id)},
                ) from e
            delete_storage_paths([storage_path_for(qr.id, "svg"), storage_path_for(qr.id, "png")])
            try:
                upload_qr_assets_to_supabase(qr_code_id=qr.id, assets=assets_bytes)
            except Exception as e:
                logger.exception("QR storage replace failed", extra={"qr_code_id": str(qr.id)})
                raise ExternalAPIError(
                    service_name="qr_storage",
                    error_message="Failed to store QR code assets",
                    code="QR_STORAGE_REPLACE_FAILED",
                    status_code=502,
                    details={"qr_code_id": str(qr.id)},
                ) from e
            update_values["color"] = color

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

    # Clean up the old LocationSurvey if reassigned and it now has no QR codes
    if old_location_survey_id is not None and old_location_survey_id != update_values.get("location_survey_id"):
        _maybe_deactivate_location_survey(old_location_survey_id, db)

    client = get_supabase_service_client()
    return _to_response(_get_active_qr_or_404(str(qr.id), company.id, db), user_tz, client)


@router.post("/qr-codes/{qr_id}/archive", response_model=QRCodeResponse)
def archive_qr_code(
    qr_id: str,
    payload: DeleteRequest,
    membership: MembershipORM = Depends(require_company_admin),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
    qr = _get_qr_row_or_404(qr_id, company.id, db)
    assert_location_access(membership, qr.location_id, db)

    if qr.archived_at is not None:
        client = get_supabase_service_client()
        return _to_response(qr, user_tz, client)

    location_survey_id = qr.location_survey_id
    rowcount = (
        db.query(QRCodeORM)
        .filter(
            QRCodeORM.id == qr.id,
            QRCodeORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update({"archived_at": func.now(), "updated_at": func.now()}, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("QRCode", str(qr.id))

    db.commit()
    _maybe_deactivate_location_survey(location_survey_id, db)
    db.refresh(qr)
    client = get_supabase_service_client()
    return _to_response(qr, user_tz, client)


@router.post("/qr-codes/{qr_id}/unarchive", response_model=QRCodeResponse)
def unarchive_qr_code(
    qr_id: str,
    payload: DeleteRequest,
    membership: MembershipORM = Depends(require_company_admin),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
    qr = _get_qr_row_or_404(qr_id, company.id, db)
    assert_location_access(membership, qr.location_id, db)

    if qr.location.archived_at is not None:
        raise ValidationError(
            code="LOCATION_ARCHIVED",
            message="Unarchive the location before unarchiving this QR code.",
            status_code=422,
        )

    if qr.archived_at is None:
        client = get_supabase_service_client()
        return _to_response(qr, user_tz, client)

    rowcount = (
        db.query(QRCodeORM)
        .filter(
            QRCodeORM.id == qr.id,
            QRCodeORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update({"archived_at": None, "updated_at": func.now()}, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("QRCode", str(qr.id))

    db.commit()
    db.refresh(qr)
    client = get_supabase_service_client()
    return _to_response(qr, user_tz, client)


@router.post("/qr-codes/{qr_id}/delete", status_code=204)
def soft_delete_archived_qr_code(
    qr_id: str,
    payload: DeleteRequest,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    """Soft-delete an archived QR code when it has no non-deleted sessions or responses."""
    company = get_company_from_membership(membership, db)
    qr = _get_qr_row_or_404(qr_id, company.id, db)
    assert_location_access(membership, qr.location_id, db)

    if qr.archived_at is None:
        raise ValidationError(
            code="QR_CODE_NOT_ARCHIVED",
            message="Archive this QR code before deleting it.",
            status_code=422,
        )

    session_count = (
        db.query(func.count(SurveySessionORM.id))
        .filter(
            SurveySessionORM.qr_code_id == qr.id,
            SurveySessionORM.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )
    response_count = (
        db.query(func.count(SurveyResponseORM.id))
        .filter(
            SurveyResponseORM.qr_code_id == qr.id,
            SurveyResponseORM.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )
    if session_count > 0 or response_count > 0:
        raise ConflictError(
            code="QR_CODE_HAS_ACTIVITY",
            message="This QR code cannot be deleted because it has survey sessions or responses.",
            details={"session_count": int(session_count), "response_count": int(response_count)},
        )

    rowcount = (
        db.query(QRCodeORM)
        .filter(
            QRCodeORM.id == qr.id,
            QRCodeORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update({"deleted_at": func.now(), "updated_at": func.now()}, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("QRCode", str(qr.id))

    db.commit()
    _maybe_deactivate_location_survey(qr.location_survey_id, db)


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
        .join(LocationORM, LocationORM.id == QRCodeORM.location_id)
        .filter(
            QRCodeORM.title == title,
            QRCodeORM.deleted_at.is_(None),
            QRCodeORM.archived_at.is_(None),
            LocationORM.archived_at.is_(None),
        )
        .first()
    )
    if not qr:
        raise NotFoundError(code="QR_CODE_NOT_FOUND", message="QR code not found")

    check_qr_rate_limit(request, str(qr.id))

    logger.info(
        "qr_title_resolved",
        extra={
            "event_type": "qr_title_resolved",
            "qr_code_id": str(qr.id),
            "title": title,
        },
    )

    redirect_url = f"{settings.app_origin.rstrip('/')}/r/{qr.id}"
    return RedirectResponse(url=redirect_url, status_code=302)
