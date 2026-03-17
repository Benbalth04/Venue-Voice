"""
Public survey completion flow - no auth required.
QR code URL: /r/{qrCodeId}
"""
import hashlib
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.postgres import get_db_connection
from decimal import Decimal

from ..models.postgres_model import (
    Company as CompanyORM,
    Location as LocationORM,
    LocationSnapshot as LocationSnapshotORM,
    QRCode as QRCodeORM,
    Question as QuestionORM,
    QuestionType as QuestionTypeORM,
    QuestionTypeSetting as QuestionTypeSettingORM,
    ScanEvent as ScanEventORM,
    Survey as SurveyORM,
    SurveyResponse as SurveyResponseORM,
    SurveyResponseAnswer as SurveyResponseAnswerORM,
    SurveySession as SurveySessionORM,
    SurveyVersion as SurveyVersionORM,
)

router = APIRouter()

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
    """
    try:
        qr_uid = uuid.UUID(r)
    except ValueError:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"valid": False, "error": "Invalid QR code ID"},
        )

    qr = (
        db.query(QRCodeORM)
        .filter(QRCodeORM.id == qr_uid, QRCodeORM.is_active.is_(True))
        .first()
    )
    if not qr:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"valid": False, "error": "QR code not found or inactive"},
        )

    survey = db.query(SurveyORM).filter(SurveyORM.id == qr.survey_id).first()
    if not survey or survey.status != "active":
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"valid": False, "error": "Survey not found or inactive"},
        )

    sv = (
        db.query(SurveyVersionORM)
        .filter(
            SurveyVersionORM.survey_id == survey.id,
            SurveyVersionORM.version_number == survey.latest_version,
        )
        .first()
    )
    if not sv:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"valid": False, "error": "Survey version not found"},
        )

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    device_type, browser = _parse_user_agent(ua)

    loc = None
    if qr.location_id:
        loc = db.query(LocationORM).filter(LocationORM.id == qr.location_id).first()
    loc_snap = _create_location_snapshot(db, loc)

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
    db.commit()

    redirect_url = f"{FRONTEND_ORIGIN}/survey?session={session.id}&qr={qr.id}"
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "valid": True,
            "redirect_url": redirect_url,
            "session_id": str(session.id),
            "qr_code_id": str(qr.id),
            "survey_version_id": str(sv.id),
        },
    )


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
        raise HTTPException(status_code=400, detail="Invalid session or QR code ID")

    sess = (
        db.query(SurveySessionORM)
        .filter(
            SurveySessionORM.id == session_uid,
            SurveySessionORM.qr_code_id == qr_uid,
        )
        .first()
    )
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    sv = (
        db.query(SurveyVersionORM)
        .filter(SurveyVersionORM.id == sess.survey_version_id)
        .first()
    )
    if not sv:
        raise HTTPException(status_code=404, detail="Survey version not found")

    return {
        "survey_version_id": str(sv.id),
        "schema": sv.schema_json,
        "company_name": (
            db.query(CompanyORM).filter(CompanyORM.id == sess.company_id).first().name
            if sess.company_id
            else None
        ),
    }


class SurveySubmitBody(BaseModel):
    session_id: str
    qr_code_id: str
    answers: dict[str, Any] = {}


class AbandonBody(BaseModel):
    session_id: str
    qr_code_id: str


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
# POST /survey/submit - Submit survey responses
# --------------------------------------------------
@router.post("/survey/submit")
def submit_survey(
    body: SurveySubmitBody,
    request: Request,
    db: Session = Depends(get_db_connection),
):
    """
    Accept submission. Body: { session_id, qr_code_id, answers }
    """
    session_id = body.session_id
    qr_code_id = body.qr_code_id
    answers = body.answers or {}

    if not session_id or not qr_code_id:
        raise HTTPException(status_code=400, detail="session_id and qr_code_id required")

    try:
        session_uid = uuid.UUID(str(session_id))
        qr_uid = uuid.UUID(str(qr_code_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session or QR code ID")

    sess = (
        db.query(SurveySessionORM)
        .filter(
            SurveySessionORM.id == session_uid,
            SurveySessionORM.qr_code_id == qr_uid,
        )
        .first()
    )
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    existing = (
        db.query(SurveyResponseORM)
        .filter(SurveyResponseORM.session_id == sess.id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Survey already submitted for this session",
        )

    # Load schema to validate compulsory questions
    sv = (
        db.query(SurveyVersionORM)
        .filter(SurveyVersionORM.id == sess.survey_version_id)
        .first()
    )
    if not sv:
        raise HTTPException(status_code=404, detail="Survey version not found")

    schema = sv.schema_json or {}
    questions = schema.get("questions") or []
    required_ids = [str(q.get("id")) for q in questions if not q.get("optional")]
    missing_required = [
        qid for qid in required_ids
        if _is_answer_empty(answers.get(qid))
    ]
    if missing_required:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "You still have questions to complete",
                "missing_required": missing_required,
            },
        )

    # Load questions for this survey version (question_key = schema question id)
    questions_by_key = {
        str(q.question_key): q
        for q in db.query(QuestionORM)
        .filter(QuestionORM.survey_version_id == sess.survey_version_id)
        .all()
    }

    # Validate and convert answers for normalized storage
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
        if q_orm and q_orm.is_numeric:
            num_val = _to_numeric(raw_value)
            if num_val is not None:
                normalized_answers.append((q_orm.id, None, num_val))
        else:
            text_val = _to_text(raw_value)
            if text_val:
                qid = q_orm.id if q_orm else None
                normalized_answers.append((qid, text_val, None))

    end_time = datetime.now(timezone.utc)
    start_time = sess.start_time
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    time_taken = int((end_time - start_time).total_seconds()) if start_time else None

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
    db.commit()

    company = db.query(CompanyORM).filter(CompanyORM.id == sess.company_id).first()
    thank_you_message = (company.thank_you_message or "Thank you for your feedback!") if company else "Thank you for your feedback!"

    return {
        "success": True,
        "redirect_url": f"{FRONTEND_ORIGIN}/survey/thank-you?session={sess.id}&qr={sess.qr_code_id}",
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
    session_id = body.session_id
    qr_code_id = body.qr_code_id

    if not session_id or not qr_code_id:
        return {"ok": False}

    try:
        session_uid = uuid.UUID(session_id)
        qr_uid = uuid.UUID(qr_code_id)
    except ValueError:
        return {"ok": False}

    sess = (
        db.query(SurveySessionORM)
        .filter(
            SurveySessionORM.id == session_uid,
            SurveySessionORM.qr_code_id == qr_uid,
        )
        .first()
    )
    if not sess:
        return {"ok": False}

    existing = (
        db.query(SurveyResponseORM)
        .filter(SurveyResponseORM.session_id == sess.id)
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
        raise HTTPException(status_code=400, detail="Invalid session or QR code ID")

    resp = (
        db.query(SurveyResponseORM)
        .filter(
            SurveyResponseORM.session_id == session_uid,
            SurveyResponseORM.qr_code_id == qr_uid,
        )
        .first()
    )
    if not resp:
        raise HTTPException(status_code=404, detail="Submission not found")

    sess = db.query(SurveySessionORM).filter(SurveySessionORM.id == resp.session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    company = db.query(CompanyORM).filter(CompanyORM.id == sess.company_id).first()
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
