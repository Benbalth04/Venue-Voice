import uuid
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors.exceptions import ConflictError, NotFoundError, PermissionError, StaleObjectError, ValidationError
from app.core.timezone_australia import effective_zoneinfo_for_stored_timezone

from app.auth.membership import get_company_from_membership, get_current_membership, require_company_admin
from app.auth.subscription import require_active_subscription
from app.auth.user_timezone import format_dt_for_user
from app.auth.viewer_scoping import apply_survey_filter, assert_survey_access, survey_ids_subquery
from app.db.postgres import get_db_connection
from app.models.postgres_model import Survey as SurveyORM
from app.models.postgres_model import User as UserORM
from app.models.postgres_model import Membership as MembershipORM
from ..models.postgres_model import Company as CompanyORM
from app.models.postgres_model import Question as QuestionORM
from app.models.postgres_model import QuestionType as QuestionTypeORM
from app.models.postgres_model import SurveyVersion as SurveyVersionORM
from app.models.postgres_model import SurveyStatus
from app.models.postgres_model import QuestionTypeSetting as QuestionTypeSettingORM
from app.models.postgres_model import LocationSurvey as LocationSurveyORM
from app.schemas.pydantic_model import (
    QuestionTypeResponse,
    SurveyCreate,
    SurveyListItem,
    SurveySaveVersion,
    SurveyStatusTransition,
    SurveyUpdateMeta,
    SurveyWithSchema,
)
from app.services.survey_validation import validate_survey_schema as validate_survey_schema_service

router = APIRouter(dependencies=[Depends(require_active_subscription)])


def _user_tz(user: UserORM) -> ZoneInfo:
    return effective_zoneinfo_for_stored_timezone(user.timezone)


def _strip_tz(dt: datetime) -> datetime:
    """Normalize a datetime for comparison with a naive TIMESTAMP column."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


# ------------------------------------------------------------------
# Question types helpers (from question_types table)
# ------------------------------------------------------------------
def _get_valid_question_types(db: Session) -> set[str]:
    """Return set of valid question type strings from question_types table."""
    rows = db.query(QuestionTypeORM.type).filter(QuestionTypeORM.deleted_at.is_(None)).all()
    return {r[0] for r in rows}


def _get_is_numeric_for_type(db: Session, q_type: str) -> bool:
    """Return is_numeric for question type from question_types table."""
    qt = (
        db.query(QuestionTypeORM)
        .filter(
            QuestionTypeORM.type == q_type,
            QuestionTypeORM.deleted_at.is_(None),
        )
        .first()
    )
    return qt.is_numeric if qt else False


# ------------------------------------------------------------------
# Schema validation (centralised - uses DB-driven rules)
# ------------------------------------------------------------------
def _load_question_type_schemas(db: Session) -> dict[str, list[dict[str, Any]]]:
    """Load question type settings definitions from DB for validation."""
    rows = (
        db.query(QuestionTypeSettingORM)
        .filter(QuestionTypeSettingORM.deleted_at.is_(None))
        .order_by(QuestionTypeSettingORM.question_type)
        .all()
    )
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
def _sync_questions_from_schema(
    db: Session,
    survey_version_id: uuid.UUID,
    schema: dict[str, Any],
    prev_by_key: dict[str, tuple[str, uuid.UUID]] | None = None,
) -> None:
    """Populate questions table from survey schema. Replaces existing questions for this version.

    prev_by_key maps question_key -> (question_type, stable_question_id) from the previous version.
    When provided, questions with the same key AND type inherit the previous stable_question_id so
    that rules and analytics remain stable across minor edits (title, description, style changes).
    A new stable_question_id is generated only when a question is new or its type has changed.
    """
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

        # Inherit stable_question_id from the previous version when key and type match.
        # A type change generates a fresh stable ID to properly invalidate dependent rules.
        stable_id: uuid.UUID
        if prev_by_key:
            prev_type, prev_stable = prev_by_key.get(str(q_id), (None, None))
            stable_id = prev_stable if (prev_stable is not None and prev_type == q_type) else uuid.uuid4()
        else:
            stable_id = uuid.uuid4()

        db.add(
            QuestionORM(
                stable_question_id=stable_id,
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
def _require_draft_for_survey_rename(survey: SurveyORM) -> None:
    """Survey titles may only be changed while the survey is still a draft."""
    if survey.status != SurveyStatus.draft:
        raise PermissionError(
            code="SURVEY_RENAME_NOT_ALLOWED",
            message="Only draft surveys can be renamed.",
        )


def _get_user_company(membership: MembershipORM, db: Session) -> CompanyORM:
    """Resolve company from membership. Replaces the old owner_user_id pattern."""
    return get_company_from_membership(membership, db)



def _survey_to_list_item(
    s: SurveyORM,
    *,
    user: UserORM,
    last_edited_by: str | None = None,
) -> SurveyListItem:
    tz = _user_tz(user)
    return SurveyListItem(
        id=s.id,
        title=s.name,
        status=s.status.value if hasattr(s.status, "value") else str(s.status),
        latest_version=s.latest_version,
        last_edited_by=last_edited_by,
        created_at=format_dt_for_user(s.created_at, tz) or "",
        updated_at=format_dt_for_user(s.updated_at, tz) or "",
    )


def _to_survey_with_schema(
    s: SurveyORM,
    sv: SurveyVersionORM,
    *,
    user: UserORM,
    last_edited_by: str | None = None,
) -> SurveyWithSchema:
    tz = _user_tz(user)
    return SurveyWithSchema(
        id=s.id,
        title=s.name,
        status=s.status.value if hasattr(s.status, "value") else str(s.status),
        latest_version=s.latest_version,
        created_at=format_dt_for_user(s.created_at, tz) or "",
        updated_at=format_dt_for_user(s.updated_at, tz) or "",
        last_edited_by=last_edited_by,
        survey_schema_json=sv.schema_json,
    )


def _get_survey_or_404(survey_id: str, company_id: uuid.UUID, db: Session) -> SurveyORM:
    try:
        sid = uuid.UUID(survey_id)
    except ValueError:
        raise ValidationError(code="INVALID_SURVEY_ID", message="Invalid survey ID")
    survey = (
        db.query(SurveyORM)
        .filter(
            SurveyORM.id == sid,
            SurveyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not survey:
        raise NotFoundError(code="SURVEY_NOT_FOUND", message="Survey not found")
    if survey.company_id != company_id:
        raise PermissionError(code="ACCESS_DENIED", message="Access denied")
    return survey


def _get_last_edited_by(survey_id: uuid.UUID, latest_version: int, current_user_id: uuid.UUID, db: Session) -> str | None:
    """Return display name of user who last edited the survey, or 'You' if current user."""
    latest_sv = (
        db.query(SurveyVersionORM)
        .filter(
            SurveyVersionORM.survey_id == survey_id,
            SurveyVersionORM.version_number == latest_version,
            SurveyVersionORM.deleted_at.is_(None),
        )
        .first()
    )
    if not latest_sv or not latest_sv.created_by:
        return None
    editor = (
        db.query(UserORM)
        .filter(
            UserORM.id == latest_sv.created_by,
            UserORM.deleted_at.is_(None),
        )
        .first()
    )

    if not editor:
        return None
    if editor.id == current_user_id:
        return "You"
    display = f"{editor.first_name} {editor.last_name}".strip()
    return display if display else editor.email


def _get_latest_version_or_404(survey_id: uuid.UUID, db: Session) -> SurveyVersionORM:
    sv = (
        db.query(SurveyVersionORM)
        .filter(
            SurveyVersionORM.survey_id == survey_id,
            SurveyVersionORM.deleted_at.is_(None),
        )
        .order_by(SurveyVersionORM.version_number.desc())
        .first()
    )
    if not sv:
        raise NotFoundError(code="SURVEY_VERSION_NOT_FOUND", message="No versions found for this survey")
    return sv

# ------------------------------------------------------------------
# GET /surveys/question-types  –  list question types (from question_types table)
# ------------------------------------------------------------------
@router.get("/surveys/question-types", response_model=list[QuestionTypeResponse])
def list_question_types(
    membership: MembershipORM = Depends(get_current_membership),
    db: Session = Depends(get_db_connection),
):
    """Return all question types from the question_types table."""
    rows = (
        db.query(QuestionTypeORM)
        .filter(QuestionTypeORM.deleted_at.is_(None))
        .order_by(QuestionTypeORM.category, QuestionTypeORM.type)
        .all()
    )
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
    status: str | None = Query(None, description="Filter by status, e.g. 'active'"),
    membership: MembershipORM = Depends(get_current_membership),
    db: Session = Depends(get_db_connection),
):
    """List surveys. Optional ?status=active to filter to active surveys only (e.g. for distribution dropdown)."""
    company = _get_user_company(membership, db)
    survey_sq = survey_ids_subquery(membership, db)
    current_user = db.query(UserORM).filter(UserORM.id == membership.user_id).first()

    q = (
        db.query(SurveyORM)
        .filter(
            SurveyORM.company_id == company.id,
            SurveyORM.deleted_at.is_(None),
        )
    )
    q = apply_survey_filter(q, survey_sq, SurveyORM.id)
    if status == "active":
        q = q.filter(SurveyORM.status == SurveyStatus.active)
    q = q.order_by(SurveyORM.updated_at.desc())
    surveys = q.all()

    result = []
    for s in surveys:
        last_edited_by = _get_last_edited_by(s.id, s.latest_version, membership.user_id, db)
        result.append(_survey_to_list_item(s, user=current_user, last_edited_by=last_edited_by))
    return result


# ------------------------------------------------------------------
# GET /surveys/{id}  –  survey metadata (no schema)
# ------------------------------------------------------------------
@router.get("/surveys/{survey_id}", response_model=SurveyListItem)
def get_survey(
    survey_id: str,
    membership: MembershipORM = Depends(get_current_membership),
    db: Session = Depends(get_db_connection),
):
    company = _get_user_company(membership, db)
    survey = _get_survey_or_404(survey_id, company.id, db)
    assert_survey_access(membership, survey.id, db)
    current_user = db.query(UserORM).filter(UserORM.id == membership.user_id).first()
    last_edited_by = _get_last_edited_by(survey.id, survey.latest_version, membership.user_id, db)
    return _survey_to_list_item(survey, user=current_user, last_edited_by=last_edited_by)


# ------------------------------------------------------------------
# GET /surveys/{id}/latest  –  metadata + latest schema
# ------------------------------------------------------------------
@router.get("/surveys/{survey_id}/latest", response_model=SurveyWithSchema)
def get_survey_latest(
    survey_id: str,
    membership: MembershipORM = Depends(get_current_membership),
    db: Session = Depends(get_db_connection),
):
    company = _get_user_company(membership, db)
    survey = _get_survey_or_404(survey_id, company.id, db)
    assert_survey_access(membership, survey.id, db)
    sv = _get_latest_version_or_404(survey.id, db)
    current_user = db.query(UserORM).filter(UserORM.id == membership.user_id).first()
    last_edited_by = _get_last_edited_by(survey.id, survey.latest_version, membership.user_id, db)
    return _to_survey_with_schema(survey, sv, user=current_user, last_edited_by=last_edited_by)


# ------------------------------------------------------------------
# POST /surveys  –  create survey
# ------------------------------------------------------------------
@router.post("/surveys", response_model=SurveyWithSchema, status_code=201)
def create_survey(
    payload: SurveyCreate,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    title = payload.title.strip()
    if not title:
        raise ValidationError(code="INVALID_SURVEY_TITLE", message="Survey title cannot be empty", status_code=422)

    company = _get_user_company(membership, db)
    company_id = company.id
    current_user = db.query(UserORM).filter(UserORM.id == membership.user_id).first()

    # Uniqueness check per company
    existing = (
        db.query(SurveyORM)
        .filter(
            SurveyORM.company_id == company_id,
            SurveyORM.name == title,
            SurveyORM.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        raise ConflictError(code="SURVEY_TITLE_CONFLICT", message=f"A survey named '{title}' already exists")

    valid, errors = validate_survey_schema(payload.survey_schema_json, db)
    if not valid:
        raise ValidationError(code="INVALID_SURVEY_SCHEMA", message="Survey schema validation failed", details={"schema_errors": errors}, status_code=422)

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
        created_by=membership.user_id,
    )
    db.add(sv)
    db.flush()
    _sync_questions_from_schema(db, sv.id, payload.survey_schema_json)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError(code="SURVEY_TITLE_CONFLICT", message=f"A survey named '{title}' already exists")
    db.refresh(survey)
    db.refresh(sv)

    return _to_survey_with_schema(survey, sv, user=current_user, last_edited_by=str(membership.user_id))


# ------------------------------------------------------------------
# POST /surveys/{id}/versions  –  create new version (autosave)
# ------------------------------------------------------------------
@router.post("/surveys/{survey_id}/versions", response_model=SurveyWithSchema)
def save_survey_version(
    survey_id: str,
    payload: SurveySaveVersion,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    company = _get_user_company(membership, db)
    current_user = db.query(UserORM).filter(UserORM.id == membership.user_id).first()
    survey = _get_survey_or_404(survey_id, company.id, db)
    if survey.status == SurveyStatus.active:
        raise ValidationError(
            code="SURVEY_ACTIVE_NO_EDIT",
            message="Cannot edit an active survey. Unpublish it first to make changes.",
            status_code=422,
        )
    current_sv = _get_latest_version_or_404(survey.id, db)

    # Optimistic concurrency control
    if payload.version != survey.latest_version:
        raise ConflictError(
            code="VERSION_CONFLICT",
            message=(
                f"Version conflict: expected {survey.latest_version}, "
                f"got {payload.version}. Reload the survey and try again."
            ),
        )

    valid, errors = validate_survey_schema(payload.survey_schema_json, db)
    if not valid:
        raise ValidationError(code="INVALID_SURVEY_SCHEMA", message="Survey schema validation failed", details={"schema_errors": errors}, status_code=422)

    last_edited_by = _get_last_edited_by(survey.id, survey.latest_version, current_user.id, db)

    # Do not create a duplicate version row when there are no schema changes.
    if current_sv.schema_json == payload.survey_schema_json:
        return _to_survey_with_schema(survey, current_sv, user=current_user, last_edited_by=last_edited_by)

    # Build stable_question_id map from the current version before creating the new one.
    prev_questions = (
        db.query(QuestionORM)
        .filter(
            QuestionORM.survey_version_id == current_sv.id,
            QuestionORM.deleted_at.is_(None),
        )
        .all()
    )
    prev_by_key: dict[str, tuple[str, uuid.UUID]] = {
        str(q.question_key): (q.question_type, q.stable_question_id)
        for q in prev_questions
    }

    new_version_number = survey.latest_version + 1
    theme_settings = _extract_theme_settings(payload.survey_schema_json)
    sv = SurveyVersionORM(
        survey_id=survey.id,
        version_number=new_version_number,
        schema_json=payload.survey_schema_json,
        theme_settings=theme_settings,
        created_by=membership.user_id,
    )
    db.add(sv)
    db.flush()
    _sync_questions_from_schema(db, sv.id, payload.survey_schema_json, prev_by_key)

    survey.latest_version = new_version_number
    survey.updated_at = datetime.now(timezone.utc)
    db.add(survey)
    db.commit()
    db.refresh(survey)
    db.refresh(sv)

    # Revalidate all rules and flows for this survey against the new version
    from ..services.rule_validator import revalidate_rules_for_survey
    from ..services.flow_validator import revalidate_flows_for_survey
    revalidate_rules_for_survey(db, survey.id)
    revalidate_flows_for_survey(db, survey.id)
    db.commit()

    return _to_survey_with_schema(survey, sv, user=current_user, last_edited_by=str(membership.user_id))


# ------------------------------------------------------------------
# PATCH /surveys/{id}  –  update metadata (title / status)
# ------------------------------------------------------------------
@router.patch("/surveys/{survey_id}", response_model=SurveyListItem)
def update_survey_meta(
    survey_id: str,
    payload: SurveyUpdateMeta,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    company = _get_user_company(membership, db)
    survey = _get_survey_or_404(survey_id, company.id, db)
    current_user = db.query(UserORM).filter(UserORM.id == membership.user_id).first()

    update_values: dict = {"updated_at": datetime.now(timezone.utc)}

    if payload.title is not None:
        _require_draft_for_survey_rename(survey)
        new_title = payload.title.strip()
        if not new_title:
            raise ValidationError(code="INVALID_SURVEY_TITLE", message="Title cannot be empty", status_code=422)
        conflict = (
            db.query(SurveyORM)
            .filter(
                SurveyORM.company_id == company.id,
                SurveyORM.name == new_title,
                SurveyORM.id != survey.id,
                SurveyORM.deleted_at.is_(None),
            )
            .first()
        )
        if conflict:
            raise ConflictError(code="SURVEY_TITLE_CONFLICT", message=f"A survey named '{new_title}' already exists")
        update_values["name"] = new_title

    if payload.status is not None:
        update_values["status"] = SurveyStatus(payload.status)

    rowcount = (
        db.query(SurveyORM)
        .filter(
            SurveyORM.id == survey.id,
            SurveyORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update(update_values, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("Survey", str(survey.id))

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError(code="SURVEY_TITLE_CONFLICT", message="A survey with that name already exists")
    db.refresh(survey)
    last_edited_by = _get_last_edited_by(survey.id, survey.latest_version, current_user.id, db)
    return _survey_to_list_item(survey, user=current_user, last_edited_by=last_edited_by)


# ------------------------------------------------------------------
# PATCH /surveys/{id}/publish  –  publish survey
# ------------------------------------------------------------------
@router.patch("/surveys/{survey_id}/publish", response_model=SurveyListItem)
def publish_survey(
    survey_id: str,
    payload: SurveyStatusTransition,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    company = _get_user_company(membership, db)
    current_user = db.query(UserORM).filter(UserORM.id == membership.user_id).first()
    survey = _get_survey_or_404(survey_id, company.id, db)
    sv = _get_latest_version_or_404(survey.id, db)
    valid, errors = validate_survey_schema(sv.schema_json, db)
    if not valid:
        raise ValidationError(code="INVALID_SURVEY_SCHEMA", message="Survey schema validation failed", details={"schema_errors": errors}, status_code=422)

    rowcount = (
        db.query(SurveyORM)
        .filter(SurveyORM.id == survey.id, SurveyORM.updated_at == _strip_tz(payload.updated_at))
        .update({"status": SurveyStatus.active, "updated_at": datetime.now(timezone.utc)}, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("Survey", str(survey.id))

    # Unpublish sets assignment rows to is_active=False; turn them back on when the survey goes live again.
    (
        db.query(LocationSurveyORM)
        .filter(
            LocationSurveyORM.survey_id == survey.id,
            LocationSurveyORM.deleted_at.is_(None),
        )
        .update({"is_active": True}, synchronize_session=False)
    )

    db.commit()
    db.refresh(survey)
    last_edited_by = _get_last_edited_by(survey.id, survey.latest_version, current_user.id, db)
    return _survey_to_list_item(survey, user=current_user, last_edited_by=last_edited_by)


# ------------------------------------------------------------------
# PATCH /surveys/{id}/archive  –  archive survey
# ------------------------------------------------------------------
@router.patch("/surveys/{survey_id}/archive", response_model=SurveyListItem)
def archive_survey(
    survey_id: str,
    payload: SurveyStatusTransition,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    company = _get_user_company(membership, db)
    current_user = db.query(UserORM).filter(UserORM.id == membership.user_id).first()
    survey = _get_survey_or_404(survey_id, company.id, db)

    rowcount = (
        db.query(SurveyORM)
        .filter(SurveyORM.id == survey.id, SurveyORM.updated_at == _strip_tz(payload.updated_at))
        .update({"status": SurveyStatus.archived, "updated_at": datetime.now(timezone.utc)}, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("Survey", str(survey.id))

    db.commit()
    db.refresh(survey)
    last_edited_by = _get_last_edited_by(survey.id, survey.latest_version, current_user.id, db)
    return _survey_to_list_item(survey, user=current_user, last_edited_by=last_edited_by)


# ------------------------------------------------------------------
# PATCH /surveys/{id}/unpublish  –  unpublish (active -> draft)
# ------------------------------------------------------------------
@router.patch("/surveys/{survey_id}/unpublish", response_model=SurveyListItem)
def unpublish_survey(
    survey_id: str,
    payload: SurveyStatusTransition,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    company = _get_user_company(membership, db)
    current_user = db.query(UserORM).filter(UserORM.id == membership.user_id).first()
    survey = _get_survey_or_404(survey_id, company.id, db)
    if survey.status != SurveyStatus.active:
        raise ValidationError(
            code="SURVEY_NOT_ACTIVE",
            message="Only active surveys can be unpublished",
            status_code=422,
        )

    rowcount = (
        db.query(SurveyORM)
        .filter(SurveyORM.id == survey.id, SurveyORM.updated_at == _strip_tz(payload.updated_at))
        .update({"status": SurveyStatus.draft, "updated_at": datetime.now(timezone.utc)}, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("Survey", str(survey.id))

    (
        db.query(LocationSurveyORM)
        .filter(
            LocationSurveyORM.survey_id == survey.id,
            LocationSurveyORM.deleted_at.is_(None),
        )
        .update({"is_active": False}, synchronize_session=False)
    )
    db.commit()
    db.refresh(survey)
    last_edited_by = _get_last_edited_by(survey.id, survey.latest_version, current_user.id, db)
    return _survey_to_list_item(survey, user=current_user, last_edited_by=last_edited_by)


# ------------------------------------------------------------------
# PATCH /surveys/{id}/unarchive  –  unarchive (archived -> draft)
# ------------------------------------------------------------------
@router.patch("/surveys/{survey_id}/unarchive", response_model=SurveyListItem)
def unarchive_survey(
    survey_id: str,
    payload: SurveyStatusTransition,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    company = _get_user_company(membership, db)
    current_user = db.query(UserORM).filter(UserORM.id == membership.user_id).first()
    survey = _get_survey_or_404(survey_id, company.id, db)
    if survey.status != SurveyStatus.archived:
        raise ValidationError(
            code="SURVEY_NOT_ARCHIVED",
            message="Only archived surveys can be unarchived",
            status_code=422,
        )

    rowcount = (
        db.query(SurveyORM)
        .filter(SurveyORM.id == survey.id, SurveyORM.updated_at == _strip_tz(payload.updated_at))
        .update({"status": SurveyStatus.draft, "updated_at": datetime.now(timezone.utc)}, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("Survey", str(survey.id))

    db.commit()
    db.refresh(survey)
    last_edited_by = _get_last_edited_by(survey.id, survey.latest_version, current_user.id, db)
    return _survey_to_list_item(survey, user=current_user, last_edited_by=last_edited_by)


# ------------------------------------------------------------------
# POST /surveys/{id}/duplicate  –  clone survey + latest version
# ------------------------------------------------------------------
@router.post("/surveys/{survey_id}/duplicate", response_model=SurveyWithSchema, status_code=201)
def duplicate_survey(
    survey_id: str,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    company = _get_user_company(membership, db)
    company_id = company.id
    current_user = db.query(UserORM).filter(UserORM.id == membership.user_id).first()

    source = _get_survey_or_404(survey_id, company_id, db)
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
                SurveyORM.deleted_at.is_(None),
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
        created_by=membership.user_id,
    )
    db.add(new_sv)
    db.flush()
    _sync_questions_from_schema(db, new_sv.id, source_sv.schema_json)
    db.commit()
    db.refresh(new_survey)
    db.refresh(new_sv)

    return _to_survey_with_schema(new_survey, new_sv, user=current_user, last_edited_by=str(membership.user_id))
