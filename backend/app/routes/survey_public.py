"""
Public survey completion flow - no auth required.
QR code URL: /r/{qrCodeId}
"""
import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, Form, Request, UploadFile
from starlette.datastructures import UploadFile as StarletteUploadFile

from ..core.errors.exceptions import ConflictError, NotFoundError, SessionExpiredError, SuspiciousSubmissionError, ValidationError
from ..core.rate_limit import check_rate_limit
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from ..db.postgres import get_db_connection
from decimal import Decimal

from ..models.postgres_model import (
    Company as CompanyORM,
    Location as LocationORM,
    LocationSnapshot as LocationSnapshotORM,
    LocationSurvey as LocationSurveyORM,
    QRCode as QRCodeORM,
    Question as QuestionORM,
    QuestionType as QuestionTypeORM,
    QuestionTypeSetting as QuestionTypeSettingORM,
    RedirectConfirmation as RedirectConfirmationORM,
    ScanEvent as ScanEventORM,
    Survey as SurveyORM,
    SurveyResponse as SurveyResponseORM,
    SurveyResponseAnswer as SurveyResponseAnswerORM,
    SurveyResponsePhoto as SurveyResponsePhotoORM,
    SurveySession as SurveySessionORM,
    SurveyVersion as SurveyVersionORM,
)
from ..integrations.supabase_storage import (
    delete_survey_photos_best_effort,
    get_supabase_service_client,
    upload_survey_photo,
)
from ..services.location_survey_service import utc_now, validate_qr_scan_access

router = APIRouter()

logger = logging.getLogger(__name__)

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN")


# --------------------------------------------------
# GET /survey/question-types - Public list of question types (no auth)
# --------------------------------------------------
@router.get("/survey/question-types")
def get_question_types_public(db: Session = Depends(get_db_connection)):
    """Return all question types. Public endpoint for survey creator."""
    rows = db.query(QuestionTypeORM).order_by(QuestionTypeORM.category, QuestionTypeORM.type).all()
    return [
        {"type": qt.type, "category": qt.category, "label": qt.label, "is_numeric": qt.is_numeric}
        for qt in rows
    ]


# --------------------------------------------------
# GET /survey/settings-schema - Question settings definitions (no auth)
# --------------------------------------------------
@router.get("/survey/settings-schema")
def get_settings_schema(db: Session = Depends(get_db_connection)):
    """Return question type settings definitions for the survey editor."""
    from ..schemas.pydantic_model import (
        QuestionSettingDefinition,
        QuestionTypeSettingsSchema,
        SettingsSchemaResponse,
    )

    types_rows = db.query(QuestionTypeORM).order_by(QuestionTypeORM.type).all()
    type_keys = [t.type for t in types_rows]

    settings_rows = (
        db.query(QuestionTypeSettingORM)
        .filter(QuestionTypeSettingORM.question_type.in_(type_keys))
        .order_by(QuestionTypeSettingORM.question_type, QuestionTypeSettingORM.setting_key)
        .all()
    )

    by_type: dict[str, list[QuestionSettingDefinition]] = {}
    for s in settings_rows:
        defn = QuestionSettingDefinition(
            key=s.setting_key,
            label=s.setting_label,
            type=s.setting_type,
            required=s.required,
            default_value=_parse_default(s.default_value, s.setting_type),
            allowed_values=s.allowed_values if isinstance(s.allowed_values, list) else None,
            validation_rules=s.validation_rules,
        )
        by_type.setdefault(s.question_type, []).append(defn)

    question_types = [
        QuestionTypeSettingsSchema(question_type=t, settings=by_type.get(t, []))
        for t in type_keys
    ]
    return SettingsSchemaResponse(question_types=question_types)


def _parse_default(val: str | None, setting_type: str) -> Any:
    if val is None:
        return None
    if setting_type == "boolean":
        return val.lower() in ("true", "1", "yes")
    if setting_type == "integer":
        try:
            return int(val)
        except ValueError:
            return val
    return val


# --------------------------------------------------
# GET /survey/theme-settings-schema - Theme settings (no auth)
# --------------------------------------------------
@router.get("/survey/theme-settings-schema")
def get_theme_settings_schema():
    """Return theme settings schema with allowed values and defaults."""
    from ..schemas.pydantic_model import ThemeSettingDefinition, ThemeSettingsSchemaResponse

    settings = [
        ThemeSettingDefinition(
            key="font",
            label="Font",
            type="select",
            default_value="Inter",
            allowed_values=["Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Source Sans Pro"],
        ),
        ThemeSettingDefinition(
            key="content_alignment",
            label="Content alignment",
            type="select",
            default_value="left",
            allowed_values=["left", "center", "right"],
        ),
        ThemeSettingDefinition(
            key="show_progress_bar",
            label="Show progress bar",
            type="boolean",
            default_value=True,
            allowed_values=None,
        ),
        ThemeSettingDefinition(
            key="text_color",
            label="Text color",
            type="color",
            default_value="#1E1E1E",
            allowed_values=None,
        ),
        ThemeSettingDefinition(
            key="primary_color",
            label="Primary color",
            type="color",
            default_value="#7C3AED",
            allowed_values=None,
        ),
        ThemeSettingDefinition(
            key="background_color",
            label="Background color",
            type="color",
            default_value="#FFFFFF",
            allowed_values=None,
        ),
        ThemeSettingDefinition(
            key="progress_bar_color",
            label="Progress bar color",
            type="color",
            default_value="#7C3AED",
            allowed_values=None,
        ),
    ]
    return ThemeSettingsSchemaResponse(settings=settings)


def _hash_ip(ip: str | None) -> str | None:
    if not ip or not ip.strip():
        return None
    return hashlib.sha256(ip.strip().encode()).hexdigest()[:32]


def _parse_user_agent(ua: str | None) -> tuple[str | None, str | None]:
    """Return (device_type, browser)."""
    if not ua:
        return None, None
    ua_lower = ua.lower()
    device = "desktop"
    if "mobile" in ua_lower and "tablet" not in ua_lower:
        device = "mobile"
    elif "tablet" in ua_lower or "ipad" in ua_lower:
        device = "tablet"
    browser = "unknown"
    if "chrome" in ua_lower and "edg" not in ua_lower:
        browser = "chrome"
    elif "safari" in ua_lower and "chrome" not in ua_lower:
        browser = "safari"
    elif "firefox" in ua_lower:
        browser = "firefox"
    elif "edg" in ua_lower:
        browser = "edge"
    return device, browser


def _create_location_snapshot(db: Session, location: LocationORM | None) -> LocationSnapshotORM | None:
    if not location:
        return None
    snap = LocationSnapshotORM(
        location_id=location.id,
        name=location.name,
        state=location.state,
        country=location.country,
    )
    db.add(snap)
    db.flush()
    return snap


# --------------------------------------------------
# GET /survey/redirect - Validate QR, create session, return redirect URL
# --------------------------------------------------
@router.get("/survey/redirect")
def survey_redirect(
    r: str,
    request: Request,
    db: Session = Depends(get_db_connection),
):
    """
    Validate QR code, create scan + session, return redirect URL.
    Query param: r = qr_code_id (UUID)
    Header: Idempotency-Key (optional) - if present and seen before, return cached response.
    """
    # Rate limit: 10 requests / minute / IP
    check_rate_limit(request, "survey_start", limit=10, window=60)

    idempotency_key = request.headers.get("Idempotency-Key")
    if idempotency_key and len(idempotency_key) <= 128:
        from sqlalchemy import text
        row = db.execute(
            text(
                """
                SELECT session_id, redirect_url
                FROM survey_redirect_idempotency
                WHERE idempotency_key = :k AND deleted_at IS NULL
                """
            ),
            {"k": idempotency_key},
        ).first()
        if row:
            return {
                "valid": True,
                "redirect_url": row[1],
                "session_id": str(row[0]),
                "qr_code_id": r,
                "survey_version_id": "",
            }

    try:
        qr_uid = uuid.UUID(r)
    except ValueError:
        raise ValidationError(code="INVALID_QR_CODE_ID", message="Invalid QR code ID")

    qr = (
        db.query(QRCodeORM)
        .options(
            joinedload(QRCodeORM.location_survey).joinedload(LocationSurveyORM.location),
            joinedload(QRCodeORM.location_survey).joinedload(LocationSurveyORM.survey),
        )
        .filter(
            QRCodeORM.id == qr_uid,
            QRCodeORM.deleted_at.is_(None),
        )
        .first()
    )
    if not qr:
        raise NotFoundError(code="QR_CODE_NOT_FOUND", message="QR code not found")

    location_survey, location, survey = validate_qr_scan_access(qr, utc_now())

    sv = (
        db.query(SurveyVersionORM)
        .filter(
            SurveyVersionORM.survey_id == survey.id,
            SurveyVersionORM.version_number == survey.latest_version,
            SurveyVersionORM.deleted_at.is_(None),
        )
        .first()
    )
    if not sv:
        raise NotFoundError(code="SURVEY_VERSION_NOT_FOUND", message="Survey version not found")

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    device_type, browser = _parse_user_agent(ua)

    loc_snap = _create_location_snapshot(db, location)

    scan = ScanEventORM(
        qr_code_id=qr.id,
        company_id=qr.company_id,
        location_snapshot_id=loc_snap.id if loc_snap else None,
        ip_address=ip,
        user_agent=ua,
    )
    db.add(scan)
    db.flush()

    session = SurveySessionORM(
        scan_id=scan.id,
        survey_version_id=sv.id,
        qr_code_id=qr.id,
        company_id=qr.company_id,
        location_snapshot_id=loc_snap.id if loc_snap else None,
        device_type=device_type,
        browser=browser,
        hashed_ip_address=_hash_ip(ip),
    )
    db.add(session)
    db.flush()

    scan.session_id = session.id

    redirect_url = f"{FRONTEND_ORIGIN}/survey?session={session.id}&qr={qr.id}"
    if idempotency_key and len(idempotency_key) <= 128:
        from sqlalchemy import text
        db.execute(
            text(
                """
                INSERT INTO survey_redirect_idempotency (idempotency_key, scan_id, session_id, redirect_url)
                VALUES (:k, :scan_id, :session_id, :url)
                ON CONFLICT (idempotency_key) DO NOTHING
                """
            ),
            {"k": idempotency_key, "scan_id": scan.id, "session_id": session.id, "url": redirect_url},
        )
    db.commit()

    return {
        "valid": True,
        "redirect_url": redirect_url,
        "session_id": str(session.id),
        "qr_code_id": str(qr.id),
        "survey_version_id": str(sv.id),
    }


# --------------------------------------------------
# GET /survey - Return survey JSON by session + qr (for frontend fetch)
# --------------------------------------------------
@router.get("/survey")
def get_survey_for_session(
    session: str,
    qr: str,
    request: Request,
    db: Session = Depends(get_db_connection),
):
    """
    Return survey schema for a valid session.
    Query params: session=session_id, qr=qr_code_id
    """
    try:
        session_uid = uuid.UUID(session)
        qr_uid = uuid.UUID(qr)
    except ValueError:
        raise ValidationError(code="INVALID_SESSION_OR_QR_ID", message="Invalid session or QR code ID")

    sess = (
        db.query(SurveySessionORM)
        .filter(
            SurveySessionORM.id == session_uid,
            SurveySessionORM.qr_code_id == qr_uid,
            SurveySessionORM.deleted_at.is_(None),
        )
        .first()
    )
    if not sess:
        raise NotFoundError(code="SESSION_NOT_FOUND", message="Session not found")

    sv = (
        db.query(SurveyVersionORM)
        .filter(
            SurveyVersionORM.id == sess.survey_version_id,
            SurveyVersionORM.deleted_at.is_(None),
        )
        .first()
    )
    if not sv:
        raise NotFoundError(code="SURVEY_VERSION_NOT_FOUND", message="Survey version not found")

    company = None
    if sess.company_id:
        company = (
            db.query(CompanyORM)
            .filter(
                CompanyORM.id == sess.company_id,
                CompanyORM.deleted_at.is_(None),
            )
            .first()
        )

    return {
        "survey_version_id": str(sv.id),
        "schema": sv.schema_json,
        "company_name": company.name if company else None,
    }


class AbandonBody(BaseModel):
    session_id: uuid.UUID
    qr_code_id: uuid.UUID


def _is_answer_empty(val: Any) -> bool:
    """Return True if the answer is empty (not provided or blank)."""
    if val is None:
        return True
    if isinstance(val, list):
        return len(val) == 0
    if isinstance(val, str):
        return not val.strip()
    if isinstance(val, (int, float)):
        return False  # 0 is valid for NPS
    return True


# --------------------------------------------------
# POST /survey/submit - Submit survey responses (multipart/form-data)
#
# Form fields:
#   session_id   : UUID
#   qr_code_id   : UUID
#   answers_json : JSON string — answers keyed by question_id (photo questions excluded)
#   photo_<question_id> : File (optional, one per photo question)
# --------------------------------------------------
@router.post("/survey/submit")
async def submit_survey(
    background_tasks: BackgroundTasks,
    request: Request,
    session_id: uuid.UUID = Form(...),
    qr_code_id: uuid.UUID = Form(...),
    answers_json: str = Form(default="{}"),
    company_name: str = Form(default=""),
    db: Session = Depends(get_db_connection),
):
    """
    Accept survey submission as multipart/form-data.
    Photo files are sent as separate form fields named photo_<question_id>.
    """
    # 1. Rate limit: 5 requests / minute / IP
    check_rate_limit(request, "survey_submit", limit=5, window=60)

    # 2. Honeypot: reject any submission that fills the hidden field
    if company_name:
        raise SuspiciousSubmissionError()

    # Parse JSON answers field
    try:
        answers: dict[str, Any] = json.loads(answers_json) if answers_json else {}
    except json.JSONDecodeError as exc:
        raise ValidationError(
            code="INVALID_ANSWERS_JSON",
            message="answers_json is not valid JSON",
            status_code=422,
        ) from exc

    session_uid = session_id
    qr_uid = qr_code_id

    # Extract and validate photo files from form before any DB work
    form = await request.form()
    # Map of question_id_str -> (UploadFile, bytes)
    photo_files_validated: dict[str, tuple[UploadFile, bytes]] = {}
    for field_name, field_value in form.multi_items():
        if not field_name.startswith("photo_"):
            continue
        if not isinstance(field_value, (UploadFile, StarletteUploadFile)):
            continue
        q_id_str = field_name[len("photo_"):]

        # Validate UUID
        try:
            uuid.UUID(q_id_str)
        except ValueError:
            raise ValidationError(
                code="INVALID_PHOTO_FIELD_NAME",
                message=f"Photo field '{field_name}' does not contain a valid question UUID.",
                status_code=422,
            )

        content_type = field_value.content_type or ""
        allowed_types = {"image/jpeg", "image/png", "image/webp", "image/heic"}
        if content_type not in allowed_types:
            raise ValidationError(
                code="INVALID_PHOTO_TYPE",
                message=(
                    f"Photo for question {q_id_str} has unsupported type '{content_type}'. "
                    "Allowed: image/jpeg, image/png, image/webp, image/heic."
                ),
                status_code=422,
            )

        data = await field_value.read()
        max_bytes = 10 * 1024 * 1024  # 10 MB
        if len(data) > max_bytes:
            raise ValidationError(
                code="PHOTO_TOO_LARGE",
                message=f"Photo for question {q_id_str} exceeds the 10 MB size limit.",
                details={"size_bytes": len(data), "max_bytes": max_bytes},
                status_code=422,
            )

        photo_files_validated[q_id_str] = (field_value, data)

    sess = (
        db.query(SurveySessionORM)
        .filter(
            SurveySessionORM.id == session_uid,
            SurveySessionORM.qr_code_id == qr_uid,
            SurveySessionORM.deleted_at.is_(None),
        )
        .first()
    )
    if not sess:
        raise NotFoundError(code="SESSION_NOT_FOUND", message="Session not found")

    # 4. Session expiry: reject if older than 15 minutes
    now_utc = datetime.now(timezone.utc)
    start_time_tz = sess.start_time
    if start_time_tz.tzinfo is None:
        start_time_tz = start_time_tz.replace(tzinfo=timezone.utc)
    session_age_seconds = (now_utc - start_time_tz).total_seconds()
    if session_age_seconds > 900:
        raise SessionExpiredError()

    # 5. Minimum completion time: reject if submitted in under 2 seconds (bot detection)
    if session_age_seconds < 2:
        raise SuspiciousSubmissionError()

    # 6. Duplicate submission check
    existing = (
        db.query(SurveyResponseORM)
        .filter(
            SurveyResponseORM.session_id == sess.id,
            SurveyResponseORM.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        raise ConflictError(
            code="SURVEY_ALREADY_SUBMITTED",
            message="Survey already submitted for this session",
        )

    # Load schema to validate compulsory questions
    sv = (
        db.query(SurveyVersionORM)
        .filter(
            SurveyVersionORM.id == sess.survey_version_id,
            SurveyVersionORM.deleted_at.is_(None),
        )
        .first()
    )
    if not sv:
        raise NotFoundError(code="SURVEY_VERSION_NOT_FOUND", message="Survey version not found")

    schema = sv.schema_json or {}
    schema_questions = schema.get("questions") or []

    # Build a map of question_id -> question_type from the schema for required checks
    question_type_map: dict[str, str] = {
        str(q.get("id")): str(q.get("type", "")) for q in schema_questions
    }

    required_ids = [str(q.get("id")) for q in schema_questions if not q.get("optional")]
    missing_required: list[str] = []
    for qid in required_ids:
        q_type = question_type_map.get(qid, "")
        if q_type == "photo":
            # Photo questions are answered when a file is uploaded
            if qid not in photo_files_validated:
                missing_required.append(qid)
        elif _is_answer_empty(answers.get(qid)):
            missing_required.append(qid)

    if missing_required:
        raise ValidationError(
            code="MISSING_REQUIRED_ANSWERS",
            message="You still have questions to complete",
            details={"missing_required": missing_required},
            status_code=422,
        )

    # Load questions for this survey version (question_key = schema question id)
    questions_by_key = {
        str(q.question_key): q
        for q in db.query(QuestionORM)
        .filter(
            QuestionORM.survey_version_id == sess.survey_version_id,
            QuestionORM.deleted_at.is_(None),
        )
        .all()
    }

    # Validate and convert non-photo answers for normalized storage
    def _to_text(v: Any) -> str | None:
        if v is None:
            return None
        if isinstance(v, list):
            return ", ".join(str(x).strip() for x in v if x is not None and str(x).strip())
        s = str(v).strip()
        return s if s else None

    def _to_numeric(v: Any) -> Decimal | None:
        if v is None or v == "":
            return None
        try:
            return Decimal(str(v))
        except Exception:
            return None

    normalized_answers: list[tuple[uuid.UUID | None, str | None, Decimal | None]] = []
    for q_key, raw_value in (answers or {}).items():
        if raw_value is None or (isinstance(raw_value, str) and not raw_value.strip()) or raw_value == []:
            continue
        q_orm = questions_by_key.get(q_key)
        # Skip photo questions — they are handled separately via Supabase upload
        if q_orm and q_orm.question_type == "photo":
            continue
        if q_orm and q_orm.is_numeric:
            num_val = _to_numeric(raw_value)
            if num_val is not None:
                normalized_answers.append((q_orm.stable_question_id, None, num_val))
        else:
            text_val = _to_text(raw_value)
            if text_val:
                qid = q_orm.stable_question_id if q_orm else None
                normalized_answers.append((qid, text_val, None))

    end_time = now_utc
    time_taken = int(session_age_seconds) if sess.start_time else None

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    device_type, browser = _parse_user_agent(ua)

    resp = SurveyResponseORM(
        survey_version_id=sess.survey_version_id,
        session_id=sess.id,
        qr_code_id=sess.qr_code_id,
        location_snapshot_id=sess.location_snapshot_id,
        answers=answers or {},
        completion_datetime=end_time,
        time_taken_seconds=time_taken,
        device_type=device_type,
        browser=browser,
        hashed_ip_address=_hash_ip(ip),
    )
    db.add(resp)
    db.flush()

    # Save normalized answers (text_value / numeric_value)
    for q_id, text_val, num_val in normalized_answers:
        db.add(
            SurveyResponseAnswerORM(
                survey_response_id=resp.id,
                question_id=q_id,
                text_value=text_val,
                numeric_value=num_val,
            )
        )

    sess.end_time = end_time
    sess.abandoned = False
    response_id = resp.id
    db.commit()

    # Upload photos to Supabase and persist metadata.
    # Done after the main commit so the survey_response row exists in the DB.
    # If an upload fails the error is logged and the response is still returned
    # (the DB row exists; we just won't have the photo).
    uploaded_paths: list[str] = []
    if photo_files_validated:
        try:
            supabase_client = get_supabase_service_client()
            for q_id_str, (upload_file, data) in photo_files_validated.items():
                filename = upload_file.filename or ""
                ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
                # Sanitise extension to a safe set
                if ext not in {"jpg", "jpeg", "png", "webp", "heic"}:
                    ext = "jpg"
                storage_path = f"{response_id}/{q_id_str}.{ext}"
                upload_survey_photo(
                    client=supabase_client,
                    storage_path=storage_path,
                    data=data,
                    mime_type=upload_file.content_type or "image/jpeg",
                )
                uploaded_paths.append(storage_path)

                # Look up the Question ORM row so we can store the stable question id
                q_orm = questions_by_key.get(q_id_str)
                question_db_id: uuid.UUID | None = q_orm.stable_question_id if q_orm else None

                # Persist photo metadata
                db.add(
                    SurveyResponsePhotoORM(
                        survey_response_id=resp.id,
                        question_id=question_db_id,
                        storage_path=storage_path,
                        mime_type=upload_file.content_type or "image/jpeg",
                        file_size_bytes=len(data),
                    )
                )

                # Also write a normalized answer row so analytics knows this
                # question was answered (text_value stores the storage path)
                db.add(
                    SurveyResponseAnswerORM(
                        survey_response_id=resp.id,
                        question_id=question_db_id,
                        text_value=storage_path,
                    )
                )

            db.commit()
        except Exception:
            logger.exception(
                "Photo upload failed after survey submit (response_id=%s); "
                "attempting best-effort storage cleanup",
                response_id,
            )
            # Best-effort cleanup of any already-uploaded objects
            if uploaded_paths:
                try:
                    supabase_client = get_supabase_service_client()
                    delete_survey_photos_best_effort(supabase_client, uploaded_paths)
                except Exception:
                    logger.exception("Failed to clean up partial photo uploads")

    from ..services.ai_analysis_service import run_ai_analysis_for_response
    from ..services.flow_service import (
        FlowExecutionMetadata,
        execute_flows_for_response,
        get_flow_execution_metadata,
        run_ai_background,
        run_ai_then_flow_background,
        run_flow_background,
    )

    saved = (
        db.query(SurveyResponseORM)
        .filter(
            SurveyResponseORM.id == response_id,
            SurveyResponseORM.deleted_at.is_(None),
        )
        .first()
    )

    workflow_action: dict[str, Any] | None = None

    if saved:
        qr = (
            db.query(QRCodeORM)
            .filter(
                QRCodeORM.id == sess.qr_code_id,
                QRCodeORM.deleted_at.is_(None),
            )
            .first()
        )
        if qr:
            # Determine which execution branch applies based on flow characteristics.
            try:
                meta = get_flow_execution_metadata(
                    db,
                    company_id=sess.company_id,
                    survey_id=sv.survey_id,
                    location_survey_id=qr.location_survey_id,
                )
            except Exception:
                logger.exception(
                    "Flow metadata check failed (response_id=%s) — defaulting to no-flow path",
                    response_id,
                )
                meta = FlowExecutionMetadata(
                    has_active_flow=False, has_redirect_action=False, requires_ai_sentiment=False
                )

            common_kwargs: dict[str, Any] = dict(
                company_id=sess.company_id,
                survey_id=sv.survey_id,
                survey_response_id=response_id,
                location_survey_id=qr.location_survey_id,
                qr_code_id=sess.qr_code_id,
            )

            if not meta.has_active_flow:
                # a. No active non-broken flow — still run AI analysis in background.
                background_tasks.add_task(run_ai_background, survey_response_id=response_id)

            elif not meta.has_redirect_action and not meta.requires_ai_sentiment:
                # has flow, no redirect, no AI — run flow in background.
                background_tasks.add_task(run_flow_background, **common_kwargs)

            elif not meta.has_redirect_action and meta.requires_ai_sentiment:
                # b. No redirect, flow uses AI sentiment — run AI first then flow in background (sequential).
                background_tasks.add_task(run_ai_then_flow_background, **common_kwargs)

            elif meta.has_redirect_action and not meta.requires_ai_sentiment:
                # c. Has redirect, no AI sentiment — fire AI in background, run flow sync for redirect URL.
                background_tasks.add_task(run_ai_background, survey_response_id=response_id)
                try:
                    workflow_action = execute_flows_for_response(db, **common_kwargs)
                except Exception:
                    logger.exception(
                        "Sync flow execution failed (response_id=%s)", response_id
                    )

            else:
                # d. Has redirect and AI sentiment — run AI sync first, then run flow sync.
                try:
                    run_ai_analysis_for_response(db, saved)
                except Exception:
                    logger.exception(
                        "Sync AI analysis failed (response_id=%s)", response_id
                    )
                try:
                    workflow_action = execute_flows_for_response(db, **common_kwargs)
                except Exception:
                    logger.exception(
                        "Sync flow execution failed (response_id=%s)", response_id
                    )

    company = (
        db.query(CompanyORM)
        .filter(
            CompanyORM.id == sess.company_id,
            CompanyORM.deleted_at.is_(None),
        )
        .first()
    )
    thank_you_message = (company.thank_you_message or "Thank you for your feedback!") if company else "Thank you for your feedback!"
    redirect_url = f"{FRONTEND_ORIGIN}/survey/thank-you?session={sess.id}&qr={sess.qr_code_id}"
    if workflow_action and workflow_action.get("type") == "redirect" and workflow_action.get("url"):
        dest = str(workflow_action["url"])
        params: dict[str, str] = {
            "dest": dest,
            "session": str(sess.id),
            "qr": str(sess.qr_code_id),
        }
        review_title = workflow_action.get("review_title")
        review_subtitle = workflow_action.get("review_subtitle")
        confirm_button_label = workflow_action.get("confirm_button_label")
        decline_button_label = workflow_action.get("decline_button_label")
        if isinstance(review_title, str) and review_title.strip():
            params["title"] = review_title.strip()
        if isinstance(review_subtitle, str) and review_subtitle.strip():
            params["subtitle"] = review_subtitle.strip()
        if isinstance(confirm_button_label, str) and confirm_button_label.strip():
            params["confirm"] = confirm_button_label.strip()
        if isinstance(decline_button_label, str) and decline_button_label.strip():
            params["decline"] = decline_button_label.strip()
        redirect_url = f"{FRONTEND_ORIGIN}/survey/review-redirect?{urlencode(params)}"

    return {
        "success": True,
        "redirect_url": redirect_url,
        "thank_you_message": thank_you_message,
        "company_name": company.name if company else None,
    }


# --------------------------------------------------
# POST /survey/abandon - Mark session as abandoned (called via sendBeacon on page unload)
# --------------------------------------------------
@router.post("/survey/abandon")
def abandon_survey(
    body: AbandonBody,
    db: Session = Depends(get_db_connection),
):
    """Mark session as abandoned. Body: { session_id, qr_code_id }."""
    session_uid = body.session_id
    qr_uid = body.qr_code_id

    sess = (
        db.query(SurveySessionORM)
        .filter(
            SurveySessionORM.id == session_uid,
            SurveySessionORM.qr_code_id == qr_uid,
            SurveySessionORM.deleted_at.is_(None),
        )
        .first()
    )
    if not sess:
        return {"ok": False}

    existing = (
        db.query(SurveyResponseORM)
        .filter(
            SurveyResponseORM.session_id == sess.id,
            SurveyResponseORM.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        return {"ok": True}

    sess.abandoned = True
    sess.end_time = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


# --------------------------------------------------
# GET /survey/thank-you - Return thank-you page data (company message, name)
# --------------------------------------------------
@router.get("/survey/thank-you")
def get_thank_you_data(
    session: str,
    qr: str,
    db: Session = Depends(get_db_connection),
):
    """Return company name and thank-you message for a completed session."""
    try:
        session_uid = uuid.UUID(session)
        qr_uid = uuid.UUID(qr)
    except ValueError:
        raise ValidationError(code="INVALID_SESSION_OR_QR_ID", message="Invalid session or QR code ID")

    resp = (
        db.query(SurveyResponseORM)
        .filter(
            SurveyResponseORM.session_id == session_uid,
            SurveyResponseORM.qr_code_id == qr_uid,
            SurveyResponseORM.deleted_at.is_(None),
        )
        .first()
    )
    if not resp:
        raise NotFoundError(code="SUBMISSION_NOT_FOUND", message="Submission not found")

    sess = (
        db.query(SurveySessionORM)
        .filter(
            SurveySessionORM.id == resp.session_id,
            SurveySessionORM.deleted_at.is_(None),
        )
        .first()
    )
    if not sess:
        raise NotFoundError(code="SESSION_NOT_FOUND", message="Session not found")

    company = (
        db.query(CompanyORM)
        .filter(
            CompanyORM.id == sess.company_id,
            CompanyORM.deleted_at.is_(None),
        )
        .first()
    )
    thank_you_message = (
        (company.thank_you_message or "Thank you for your feedback!")
        if company
        else "Thank you for your feedback!"
    )
    company_name = company.name if company else None

    return {
        "thank_you_message": thank_you_message,
        "company_name": company_name,
    }


# --------------------------------------------------
@router.post("/survey/redirect-confirmation")
def record_redirect_confirmation(
    session: str,
    qr: str,
    db: Session = Depends(get_db_connection),
):
    """Record that a respondent confirmed they want to follow the redirect.

    Idempotent — repeated calls for the same survey response are safe and
    return the same 200 response without creating duplicate rows.
    """
    try:
        session_uid = uuid.UUID(session)
        qr_uid = uuid.UUID(qr)
    except ValueError:
        raise ValidationError(code="INVALID_SESSION_OR_QR_ID", message="Invalid session or QR code ID")

    resp = (
        db.query(SurveyResponseORM)
        .filter(
            SurveyResponseORM.session_id == session_uid,
            SurveyResponseORM.qr_code_id == qr_uid,
            SurveyResponseORM.deleted_at.is_(None),
        )
        .first()
    )
    if not resp:
        raise NotFoundError(code="SUBMISSION_NOT_FOUND", message="Submission not found")

    from sqlalchemy.dialects.postgresql import insert as pg_insert

    stmt = (
        pg_insert(RedirectConfirmationORM)
        .values(survey_response_id=resp.id)
        .on_conflict_do_nothing(index_elements=["survey_response_id"])
    )
    db.execute(stmt)
    db.commit()

    return {"recorded": True}
