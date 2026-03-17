import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.jwt import get_current_user
from app.db.postgres import get_db_connection
from app.models.postgres_model import Survey as SurveyORM
from ..models.postgres_model import Company as CompanyORM
from app.models.postgres_model import Question as QuestionORM
from app.models.postgres_model import QuestionType as QuestionTypeORM
from app.models.postgres_model import SurveyVersion as SurveyVersionORM
from app.models.postgres_model import SurveyStatus
from app.models.postgres_model import QuestionTypeSetting as QuestionTypeSettingORM
from app.schemas.pydantic_model import (
    QuestionTypeResponse,
    SurveyCreate,
    SurveyListItem,
    SurveySaveVersion,
    SurveyUpdateMeta,
    SurveyWithSchema,
)
from app.services.survey_validation import validate_survey_schema as validate_survey_schema_service

router = APIRouter()

# ------------------------------------------------------------------
# Question types helpers (from question_types table)
# ------------------------------------------------------------------
def _get_valid_question_types(db: Session) -> set[str]:
    """Return set of valid question type strings from question_types table."""
    rows = db.query(QuestionTypeORM.type).all()
    return {r[0] for r in rows}


def _get_is_numeric_for_type(db: Session, q_type: str) -> bool:
    """Return is_numeric for question type from question_types table."""
    qt = db.query(QuestionTypeORM).filter(QuestionTypeORM.type == q_type).first()
    return qt.is_numeric if qt else False


# ------------------------------------------------------------------
# Schema validation (centralised - uses DB-driven rules)
# ------------------------------------------------------------------
def _load_question_type_schemas(db: Session) -> dict[str, list[dict[str, Any]]]:
    """Load question type settings definitions from DB for validation."""
    rows = db.query(QuestionTypeSettingORM).order_by(QuestionTypeSettingORM.question_type).all()
    by_type: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        by_type.setdefault(r.question_type, []).append({
            "setting_key": r.setting_key,
            "required": r.required,
            "allowed_values": r.allowed_values,
            "setting_type": r.setting_type,
            "validation_rules": r.validation_rules or {},
        })
    return by_type


def validate_survey_schema(schema: dict[str, Any], db: Session) -> tuple[bool, list[dict[str, Any]]]:
    """Validate survey schema. Returns (valid, errors) where errors are {question_id, setting, message}."""
    valid_types = _get_valid_question_types(db)
    schemas = _load_question_type_schemas(db)
    result = validate_survey_schema_service(schema, valid_types, schemas)
    errors = [
        {"question_id": e.question_id, "setting": e.setting, "message": e.message}
        for e in result.errors
    ]
    return result.valid, errors


def _extract_theme_settings(schema: dict[str, Any]) -> dict[str, Any] | None:
    """Extract theme_settings from schema (theme + settings) for storage in survey_versions."""
    theme = schema.get("theme") or {}
    settings = schema.get("settings") or {}
    merged = {**theme, **settings}
    if not merged:
        return None
    # Normalise to snake_case keys for DB
    out: dict[str, Any] = {}
    key_map = [
        ("font", ["font", "fontFamily"]),
        ("content_alignment", ["contentAlign", "content_alignment"]),
        ("primary_color", ["primaryColor", "primary_color"]),
        ("background_color", ["backgroundColor", "background_color"]),
        ("show_progress_bar", ["showProgressBar", "show_progress_bar"]),
        ("progress_bar_color", ["progressBarColor", "progress_bar_color"]),
    ]
    for db_key, aliases in key_map:
        val = next((merged.get(a) for a in aliases if merged.get(a) is not None), None)
        if val is not None:
            out[db_key] = val
    return out if out else None


# ------------------------------------------------------------------
# Sync questions from schema to questions table
# ------------------------------------------------------------------
def _sync_questions_from_schema(db: Session, survey_version_id: uuid.UUID, schema: dict[str, Any]) -> None:
    """Populate questions table from survey schema. Replaces existing questions for this version."""
    questions_data = schema.get("questions")
    if not isinstance(questions_data, list):
        return

    # Delete existing questions for this version (new schema replaces them)
    db.query(QuestionORM).filter(QuestionORM.survey_version_id == survey_version_id).delete()

    for i, q in enumerate(questions_data):
        if not isinstance(q, dict):
            continue
        q_id = q.get("id")
        q_type = q.get("type")
        q_title = q.get("title")
        if not q_id or not q_type:
            continue

        # Extract question text from title (can be {text, style} or plain string)
        question_text = ""
        if isinstance(q_title, dict):
            question_text = str(q_title.get("text", "")).strip()
        elif q_title:
            question_text = str(q_title).strip()

        is_numeric = _get_is_numeric_for_type(db, q_type)


        config = q.get("settings") or q.get("config")
        if not isinstance(config, dict):
            config = None

        db.add(
            QuestionORM(
                survey_version_id=survey_version_id,
                question_key=str(q_id),
                question_text=question_text or "(Untitled)",
                question_type=q_type,
                config=config,
                position=i,
                is_numeric=is_numeric,
            )
        )


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _get_user_company(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_connection),
) -> CompanyORM:
    company = db.query(CompanyORM).filter(CompanyORM.owner_user_id == current_user.id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found for user")
    return company


def _survey_to_list_item(s: SurveyORM) -> SurveyListItem:
    return SurveyListItem(
        id=str(s.id),
        title=s.name,
        status=s.status.value if hasattr(s.status, "value") else str(s.status),
        latest_version=s.latest_version,
        created_at=s.created_at.isoformat() if s.created_at else "",
        updated_at=s.updated_at.isoformat() if s.updated_at else "",
    )


def _survey_to_with_schema(s: SurveyORM, sv: SurveyVersionORM) -> SurveyWithSchema:
    return SurveyWithSchema(
        id=str(s.id),
        title=s.name,
        status=s.status.value if hasattr(s.status, "value") else str(s.status),
        latest_version=s.latest_version,
        created_at=s.created_at.isoformat() if s.created_at else "",
        updated_at=s.updated_at.isoformat() if s.updated_at else "",
        survey_schema_json=sv.schema_json,
    )


def _get_survey_or_404(survey_id: str, user: Any, db: Session, company_id = None) -> SurveyORM:

    if company_id is None:
        company_id = _get_user_company(user, db).id

    try:
        sid = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid survey ID")
    survey = db.query(SurveyORM).filter(SurveyORM.id == sid).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    if survey.company_id != company_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return survey


def _get_latest_version_or_404(survey_id: uuid.UUID, db: Session) -> SurveyVersionORM:
    sv = (
        db.query(SurveyVersionORM)
        .filter(SurveyVersionORM.survey_id == survey_id)
        .order_by(SurveyVersionORM.version_number.desc())
        .first()
    )
    if not sv:
        raise HTTPException(status_code=404, detail="No versions found for this survey")
    return sv

# ------------------------------------------------------------------
# GET /surveys/question-types  –  list question types (from question_types table)
# ------------------------------------------------------------------
@router.get("/surveys/question-types", response_model=list[QuestionTypeResponse])
def list_question_types(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Return all question types from the question_types table."""
    rows = db.query(QuestionTypeORM).order_by(QuestionTypeORM.category, QuestionTypeORM.type).all()
    return [
        QuestionTypeResponse(
            type=qt.type,
            category=qt.category,
            label=qt.label,
            is_numeric=qt.is_numeric,
        )
        for qt in rows
    ]


# ------------------------------------------------------------------
# GET /surveys  –  list company surveys
# ------------------------------------------------------------------
@router.get("/surveys", response_model=list[SurveyListItem])
def list_surveys(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):

    company = _get_user_company(current_user, db)
    company_id = company.id

    surveys = (
        db.query(SurveyORM)
        .filter(SurveyORM.company_id == company_id)
        .order_by(SurveyORM.updated_at.desc())
        .all()
    )
    
    return [_survey_to_list_item(s) for s in surveys]


# ------------------------------------------------------------------
# GET /surveys/{id}  –  survey metadata (no schema)
# ------------------------------------------------------------------
@router.get("/surveys/{survey_id}", response_model=SurveyListItem)
def get_survey(
    survey_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    return _survey_to_list_item(_get_survey_or_404(survey_id, current_user, db))


# ------------------------------------------------------------------
# GET /surveys/{id}/latest  –  metadata + latest schema
# ------------------------------------------------------------------
@router.get("/surveys/{survey_id}/latest", response_model=SurveyWithSchema)
def get_survey_latest(
    survey_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey = _get_survey_or_404(survey_id, current_user, db)
    sv = _get_latest_version_or_404(survey.id, db)
    return _survey_to_with_schema(survey, sv)


# ------------------------------------------------------------------
# POST /surveys  –  create survey
# ------------------------------------------------------------------
@router.post("/surveys", response_model=SurveyWithSchema, status_code=201)
def create_survey(
    payload: SurveyCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Survey title cannot be empty")
    
    company = _get_user_company(current_user, db)
    company_id = company.id

    # Uniqueness check per company
    existing = (
        db.query(SurveyORM)
        .filter(
            SurveyORM.company_id == company_id,
            SurveyORM.name == title,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409, detail=f"A survey named '{title}' already exists"
        )

    valid, errors = validate_survey_schema(payload.survey_schema_json, db)
    if not valid:
        raise HTTPException(status_code=422, detail={"schema_errors": errors})

    survey = SurveyORM(
        company_id=company_id,
        name=title,
        status=SurveyStatus.draft,
        latest_version=1,
    )
    db.add(survey)
    db.flush()

    theme_settings = _extract_theme_settings(payload.survey_schema_json)
    sv = SurveyVersionORM(
        survey_id=survey.id,
        version_number=1,
        schema_json=payload.survey_schema_json,
        theme_settings=theme_settings,
        created_by=current_user.id,
    )
    db.add(sv)
    db.flush()
    _sync_questions_from_schema(db, sv.id, payload.survey_schema_json)
    db.commit()
    db.refresh(survey)
    db.refresh(sv)

    return _survey_to_with_schema(survey, sv)


# ------------------------------------------------------------------
# POST /surveys/{id}/versions  –  create new version (autosave)
# ------------------------------------------------------------------
@router.post("/surveys/{survey_id}/versions", response_model=SurveyWithSchema)
def save_survey_version(
    survey_id: str,
    payload: SurveySaveVersion,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey = _get_survey_or_404(survey_id, current_user, db)
    current_sv = _get_latest_version_or_404(survey.id, db)

    # Optimistic concurrency control
    if payload.version != survey.latest_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Version conflict: expected {survey.latest_version}, "
                f"got {payload.version}. Reload the survey and try again."
            ),
        )

    valid, errors = validate_survey_schema(payload.survey_schema_json, db)
    if not valid:
        raise HTTPException(status_code=422, detail={"schema_errors": errors})

    # Do not create a duplicate version row when there are no schema changes.
    if current_sv.schema_json == payload.survey_schema_json:
        return _survey_to_with_schema(survey, current_sv)

    new_version_number = survey.latest_version + 1
    theme_settings = _extract_theme_settings(payload.survey_schema_json)
    sv = SurveyVersionORM(
        survey_id=survey.id,
        version_number=new_version_number,
        schema_json=payload.survey_schema_json,
        theme_settings=theme_settings,
        created_by=current_user.id,
    )
    db.add(sv)
    db.flush()
    _sync_questions_from_schema(db, sv.id, payload.survey_schema_json)

    survey.latest_version = new_version_number
    survey.updated_at = datetime.now(timezone.utc)
    db.add(survey)
    db.commit()
    db.refresh(survey)
    db.refresh(sv)

    return _survey_to_with_schema(survey, sv)


# ------------------------------------------------------------------
# PATCH /surveys/{id}  –  update metadata (title / status)
# ------------------------------------------------------------------
@router.patch("/surveys/{survey_id}", response_model=SurveyListItem)
def update_survey_meta(
    survey_id: str,
    payload: SurveyUpdateMeta,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    
    company = _get_user_company(current_user, db)
    company_id = company.id

    survey = _get_survey_or_404(survey_id, current_user, db, company_id)

    if payload.title is not None:
        new_title = payload.title.strip()
        if not new_title:
            raise HTTPException(status_code=422, detail="Title cannot be empty")
        conflict = (
            db.query(SurveyORM)
            .filter(
                SurveyORM.company_id == company_id,
                SurveyORM.name == new_title,
                SurveyORM.id != survey.id,
            )
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=409, detail=f"A survey named '{new_title}' already exists"
            )
        survey.name = new_title

    if payload.status is not None:
        survey.status = SurveyStatus(payload.status)

    survey.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(survey)
    return _survey_to_list_item(survey)


# ------------------------------------------------------------------
# PATCH /surveys/{id}/publish  –  publish survey
# ------------------------------------------------------------------
@router.patch("/surveys/{survey_id}/publish", response_model=SurveyListItem)
def publish_survey(
    survey_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey = _get_survey_or_404(survey_id, current_user, db)
    sv = _get_latest_version_or_404(survey.id, db)
    valid, errors = validate_survey_schema(sv.schema_json, db)
    if not valid:
        raise HTTPException(status_code=422, detail={"schema_errors": errors})
    survey.status = SurveyStatus.active
    survey.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(survey)
    return _survey_to_list_item(survey)


# ------------------------------------------------------------------
# PATCH /surveys/{id}/archive  –  archive survey
# ------------------------------------------------------------------
@router.patch("/surveys/{survey_id}/archive", response_model=SurveyListItem)
def archive_survey(
    survey_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey = _get_survey_or_404(survey_id, current_user, db)
    survey.status = SurveyStatus.archived
    survey.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(survey)
    return _survey_to_list_item(survey)


# ------------------------------------------------------------------
# POST /surveys/{id}/duplicate  –  clone survey + latest version
# ------------------------------------------------------------------
@router.post("/surveys/{survey_id}/duplicate", response_model=SurveyWithSchema, status_code=201)
def duplicate_survey(
    survey_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    
    
    company = _get_user_company(current_user, db)
    company_id = company.id

    source = _get_survey_or_404(survey_id, current_user, db, company_id)
    source_sv = _get_latest_version_or_404(source.id, db)


    # Generate a unique title
    base_title = source.name + " (Copy)"
    candidate = base_title
    counter = 1
    while True:
        conflict = (
            db.query(SurveyORM)
            .filter(
                SurveyORM.company_id == company_id,
                SurveyORM.name == candidate,
            )
            .first()
        )
        if not conflict:
            break
        counter += 1
        candidate = f"{base_title} {counter}"

    new_survey = SurveyORM(
        company_id=company_id,
        name=candidate,
        status=SurveyStatus.draft,
        latest_version=1,
    )
    db.add(new_survey)
    db.flush()

    theme_settings = getattr(source_sv, "theme_settings", None) or _extract_theme_settings(source_sv.schema_json)
    new_sv = SurveyVersionORM(
        survey_id=new_survey.id,
        version_number=1,
        schema_json=source_sv.schema_json,
        theme_settings=theme_settings,
        created_by=current_user.id,
    )
    db.add(new_sv)
    db.flush()
    _sync_questions_from_schema(db, new_sv.id, source_sv.schema_json)
    db.commit()
    db.refresh(new_survey)
    db.refresh(new_sv)

    return _survey_to_with_schema(new_survey, new_sv)
