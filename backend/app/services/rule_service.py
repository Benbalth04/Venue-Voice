from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy.orm import Session, joinedload

from datetime import timezone

from ..core.errors.exceptions import ConflictError, NotFoundError, RuleValidationError, StaleObjectError, ValidationError
from ..models.postgres_model import (
    AIAnalysis as AIAnalysisORM,
    Flow as FlowORM,
    FlowNode as FlowNodeORM,
    Question as QuestionORM,
    Rule as RuleORM,
    RuleCondition as RuleConditionORM,
    RuleGroup as RuleGroupORM,
    Survey as SurveyORM,
    SurveyResponse as SurveyResponseORM,
    SurveyResponseAnswer as SurveyResponseAnswerORM,
    SurveyVersion as SurveyVersionORM,
)
from ..schemas.pydantic_model import (
    RuleConditionType,
    RuleOperator,
    SentimentValue,
)

if TYPE_CHECKING:
    from ..schemas.pydantic_model import CreateRule, UpdateRule


def _strip_tz(dt) -> "datetime":
    """Normalize a datetime for comparison with a naive TIMESTAMP column."""
    from datetime import datetime
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


_TEXT_TYPES = {"text", "long_text"}
_STAR_TYPES = {"star"}
_NPS_TYPES = {"nps"}
_CHOICE_TYPES = {"multiple_choice", "checkbox", "yes_no"}


@dataclass(slots=True)
class ResponseValueContext:
    question_id: uuid.UUID
    question_key: str
    question_type: str
    is_numeric: bool
    raw_value: Any
    numeric_value: float | None
    text_value: str | None
    sentiment: str | None
    sentiment_score: float | None


def _is_blank_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, list):
        return len(value) == 0
    return False


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _compare_numeric(left: float | None, operator: str, right: float | None) -> bool:
    if left is None or right is None:
        return False
    if operator == RuleOperator.lt.value:
        return left < right
    if operator == RuleOperator.lte.value:
        return left <= right
    if operator == RuleOperator.eq.value:
        return left == right
    if operator == RuleOperator.gte.value:
        return left >= right
    if operator == RuleOperator.gt.value:
        return left > right
    return False


def _combine(results: list[bool], operator: str) -> bool:
    if not results:
        return False
    return any(results) if operator == "OR" else all(results)


def _parse_value_list(value: str | None) -> list[str]:
    """Deserialize a JSON-encoded list from a condition value TEXT column (used for checkbox)."""
    if value is None:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [str(v).strip() for v in parsed if str(v).strip()]
    except (json.JSONDecodeError, TypeError):
        pass
    return [value.strip()] if value.strip() else []


def _serialize_condition_value(value: str | list[str] | None) -> str | None:
    """Serialize a condition value for storage in the TEXT column."""
    if isinstance(value, list):
        return json.dumps(value)
    if isinstance(value, str):
        return value.strip()
    return value


def _deserialize_condition_value(condition: RuleConditionORM) -> str | list[str] | None:
    """Deserialize a stored condition value — returns a list for checkbox conditions."""
    if condition.condition_type == RuleConditionType.checkbox.value and condition.value is not None:
        try:
            parsed = json.loads(condition.value)
            if isinstance(parsed, list):
                return [str(v) for v in parsed]
        except (json.JSONDecodeError, TypeError):
            pass
    return condition.value


def _get_survey_or_404(db: Session, survey_id: uuid.UUID) -> SurveyORM:
    survey = (
        db.query(SurveyORM)
        .filter(
            SurveyORM.id == survey_id,
            SurveyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not survey:
        raise NotFoundError(code="SURVEY_NOT_FOUND", message="Survey not found")
    return survey


def _get_rule_or_404(db: Session, survey_id: uuid.UUID, rule_id: uuid.UUID) -> RuleORM:
    rule = (
        db.query(RuleORM)
        .options(
            joinedload(RuleORM.conditions),
            joinedload(RuleORM.groups),
        )
        .filter(
            RuleORM.id == rule_id,
            RuleORM.survey_id == survey_id,
            RuleORM.deleted_at.is_(None),
        )
        .first()
    )
    if not rule:
        raise NotFoundError(code="RULE_NOT_FOUND", message="Rule not found")
    return rule


def _get_question_rows_for_survey(db: Session, survey_id: uuid.UUID) -> dict[uuid.UUID, QuestionORM]:
    rows = (
        db.query(QuestionORM)
        .join(SurveyVersionORM, SurveyVersionORM.id == QuestionORM.survey_version_id)
        .filter(
            SurveyVersionORM.survey_id == survey_id,
            SurveyVersionORM.deleted_at.is_(None),
            QuestionORM.deleted_at.is_(None),
        )
        .all()
    )
    return {row.id: row for row in rows}


def _get_latest_question_options(db: Session, survey: SurveyORM) -> list[dict[str, Any]]:
    rows = (
        db.query(QuestionORM)
        .join(SurveyVersionORM, SurveyVersionORM.id == QuestionORM.survey_version_id)
        .filter(
            SurveyVersionORM.survey_id == survey.id,
            SurveyVersionORM.version_number == survey.latest_version,
            SurveyVersionORM.deleted_at.is_(None),
            QuestionORM.deleted_at.is_(None),
        )
        .order_by(QuestionORM.position.asc(), QuestionORM.id.asc())
        .all()
    )
    return [
        {
            "id": row.id,
            "question_key": str(row.question_key),
            "question_text": row.question_text,
            "question_type": row.question_type,
            "is_numeric": row.is_numeric,
            "position": row.position,
            "config": row.config,
        }
        for row in rows
    ]


def _validate_rule_payload(db: Session, survey_id: uuid.UUID, payload: "CreateRule") -> None:
    if not payload.name.strip():
        raise ValidationError(
            code="RULE_NAME_REQUIRED",
            message="Rule name is required",
            status_code=422,
        )
    if payload.description is not None and len(payload.description.strip()) > 240:
        raise ValidationError(
            code="RULE_DESCRIPTION_TOO_LONG",
            message="Rule description must be 240 characters or fewer",
            status_code=422,
        )

    question_by_id = _get_question_rows_for_survey(db, survey_id)
    group_ids = {group.id for group in payload.groups if group.id is not None}

    for condition in payload.conditions:
        if condition.group_id is not None and condition.group_id not in group_ids:
            raise ValidationError(
                code="RULE_GROUP_NOT_FOUND",
                message="Condition references an unknown rule group",
                status_code=422,
            )

        question = question_by_id.get(condition.question_id) if condition.question_id else None
        if condition.question_id is not None and question is None:
            raise ValidationError(
                code="RULE_INVALID_QUESTION",
                message="Condition question does not belong to this survey",
                status_code=422,
            )

        ct = condition.condition_type

        if ct == RuleConditionType.rating:
            if question is None or question.question_type not in _STAR_TYPES:
                raise ValidationError(
                    code="RULE_RATING_REQUIRES_STAR_QUESTION",
                    message="Rating conditions require a star-rating question",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value},
                )
            numeric_val = _to_float(condition.value)
            if numeric_val is None:
                raise ValidationError(
                    code="RULE_RATING_VALUE_INVALID",
                    message="Rating conditions require a numeric value",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value, "value": condition.value},
                )
            config = question.config or {}
            min_val, max_val = 1, int(config.get("starCount", 5))
            if not (min_val <= numeric_val <= max_val):
                raise ValidationError(
                    code="RULE_RATING_VALUE_OUT_OF_RANGE",
                    message=f"Rating value must be between {min_val} and {max_val}",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value, "value": condition.value, "min": min_val, "max": max_val},
                )

        elif ct == RuleConditionType.nps:
            if question is None or question.question_type not in _NPS_TYPES:
                raise ValidationError(
                    code="RULE_NPS_REQUIRES_NPS_QUESTION",
                    message="NPS conditions require a Net Promoter Score question",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value},
                )
            numeric_val = _to_float(condition.value)
            if numeric_val is None:
                raise ValidationError(
                    code="RULE_NPS_VALUE_INVALID",
                    message="NPS conditions require a numeric value",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value, "value": condition.value},
                )
            config = question.config or {}
            min_val, max_val = 0, int(config.get("max_score", 10))
            if not (min_val <= numeric_val <= max_val):
                raise ValidationError(
                    code="RULE_NPS_VALUE_OUT_OF_RANGE",
                    message=f"NPS value must be between {min_val} and {max_val}",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value, "value": condition.value, "min": min_val, "max": max_val},
                )

        elif ct == RuleConditionType.sentiment:
            if question is None or question.question_type not in _TEXT_TYPES:
                raise ValidationError(
                    code="RULE_SENTIMENT_REQUIRES_TEXT_QUESTION",
                    message="Sentiment conditions require a text or long text question",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value},
                )
            try:
                SentimentValue(str(condition.value).strip().lower())
            except ValueError as exc:
                raise ValidationError(
                    code="RULE_SENTIMENT_VALUE_INVALID",
                    message="Sentiment conditions must target positive, neutral, or negative",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value, "value": condition.value},
                ) from exc

        elif ct == RuleConditionType.multiple_choice:
            if question is None or question.question_type != "multiple_choice":
                raise ValidationError(
                    code="RULE_MULTIPLE_CHOICE_REQUIRES_MC_QUESTION",
                    message="Multiple-choice conditions require a multiple choice question",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value},
                )
            config = question.config or {}
            valid_options: set[str] = set(config.get("options", []))
            if not valid_options:
                raise ValidationError(
                    code="RULE_MULTIPLE_CHOICE_NO_OPTIONS",
                    message="Multiple-choice question has no configured options",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value},
                )
            selected_option = str(condition.value or "").strip()
            if selected_option not in valid_options:
                raise ValidationError(
                    code="RULE_MULTIPLE_CHOICE_INVALID_OPTION",
                    message="Condition value is not a valid option for this question",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value, "value": condition.value, "valid_options": sorted(valid_options)},
                )

        elif ct == RuleConditionType.checkbox:
            if question is None or question.question_type != "checkbox":
                raise ValidationError(
                    code="RULE_CHECKBOX_REQUIRES_CHECKBOX_QUESTION",
                    message="Checkbox conditions require a checkbox question",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value},
                )
            if not isinstance(condition.value, list) or len(condition.value) == 0:
                raise ValidationError(
                    code="RULE_CHECKBOX_VALUE_INVALID",
                    message="Checkbox conditions require a non-empty list of option values",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value},
                )
            config = question.config or {}
            valid_options = set(config.get("options", []))
            if not valid_options:
                raise ValidationError(
                    code="RULE_CHECKBOX_NO_OPTIONS",
                    message="Checkbox question has no configured options",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value},
                )
            invalid = [v for v in condition.value if v not in valid_options]
            if invalid:
                raise ValidationError(
                    code="RULE_CHECKBOX_INVALID_OPTIONS",
                    message="One or more checkbox condition values are not valid options for this question",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value, "invalid_values": invalid, "valid_options": sorted(valid_options)},
                )

        elif ct == RuleConditionType.yes_no:
            if question is None or question.question_type != "yes_no":
                raise ValidationError(
                    code="RULE_YES_NO_REQUIRES_YES_NO_QUESTION",
                    message="Yes/No conditions require a Yes/No question",
                    status_code=422,
                    details={"question_id": str(condition.question_id), "condition_type": ct.value},
                )


def _ensure_unique_rule_name(
    db: Session,
    survey_id: uuid.UUID,
    name: str,
    *,
    exclude_rule_id: uuid.UUID | None = None,
) -> None:
    normalized_name = name.strip().casefold()
    existing_rows = (
        db.query(RuleORM)
        .filter(
            RuleORM.survey_id == survey_id,
            RuleORM.deleted_at.is_(None),
        )
        .all()
    )
    for row in existing_rows:
        if exclude_rule_id is not None and row.id == exclude_rule_id:
            continue
        if row.name.strip().casefold() == normalized_name:
            raise ConflictError(
                code="RULE_NAME_CONFLICT",
                message="A rule with this name already exists",
            )


def _rule_to_response(rule: RuleORM) -> dict[str, Any]:
    groups = sorted(rule.groups, key=lambda item: (item.created_at, item.id))
    conditions = sorted(rule.conditions, key=lambda item: (item.created_at, item.id))
    return {
        "id": rule.id,
        "company_id": rule.company_id,
        "survey_id": rule.survey_id,
        "name": rule.name,
        "description": rule.description,
        "operator": rule.operator,
        "status": rule.status if rule.status else "active",
        "broken_reasons": rule.broken_reasons if rule.broken_reasons else [],
        "groups": [
            {
                "id": group.id,
                "operator": group.operator,
                "created_at": group.created_at,
            }
            for group in groups
        ],
        "conditions": [
            {
                "id": condition.id,
                "condition_type": condition.condition_type,
                "question_id": condition.question_id,
                "operator": condition.operator,
                "value": _deserialize_condition_value(condition),
                "group_id": condition.group_id,
                "created_at": condition.created_at,
            }
            for condition in conditions
            if condition.deleted_at is None
        ],
        "created_at": rule.created_at,
        "updated_at": rule.updated_at,
    }


def get_rule_bundle(db: Session, survey_id: uuid.UUID) -> dict[str, Any]:
    survey = _get_survey_or_404(db, survey_id)
    rules = (
        db.query(RuleORM)
        .options(
            joinedload(RuleORM.conditions),
            joinedload(RuleORM.groups),
        )
        .filter(
            RuleORM.survey_id == survey_id,
            RuleORM.deleted_at.is_(None),
        )
        .order_by(RuleORM.updated_at.desc(), RuleORM.created_at.desc())
        .all()
    )
    return {
        "survey_id": survey.id,
        "questions": _get_latest_question_options(db, survey),
        "rules": [_rule_to_response(rule) for rule in rules],
    }


def create_rule(db: Session, survey_id: uuid.UUID, payload: "CreateRule") -> dict[str, Any]:
    from .rule_validator import validate_rule as _validate_rule_status

    survey = _get_survey_or_404(db, survey_id)
    _validate_rule_payload(db, survey_id, payload)
    _ensure_unique_rule_name(db, survey_id, payload.name)

    rule = RuleORM(
        company_id=survey.company_id,
        survey_id=survey_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description and payload.description.strip() else None,
        operator=payload.operator.value,
        status="active",
        broken_reasons=[],
    )
    db.add(rule)
    db.flush()

    group_id_map: dict[uuid.UUID, uuid.UUID] = {}
    for group in payload.groups:
        row = RuleGroupORM(
            rule_id=rule.id,
            operator=group.operator.value,
        )
        db.add(row)
        db.flush()
        if group.id is not None:
            group_id_map[group.id] = row.id

    for condition in payload.conditions:
        db.add(
            RuleConditionORM(
                rule_id=rule.id,
                condition_type=condition.condition_type.value,
                question_id=condition.question_id,
                operator=condition.operator.value if condition.operator else None,
                value=_serialize_condition_value(condition.value),
                group_id=group_id_map.get(condition.group_id, condition.group_id),
            )
        )

    db.flush()

    # Validate rule against current survey version before committing
    status, broken_reasons = _validate_rule_status(rule.id, db)
    if status == "broken":
        db.rollback()
        raise RuleValidationError(broken_reasons)

    db.commit()
    db.refresh(rule)
    return _rule_to_response(_get_rule_or_404(db, survey_id, rule.id))


def update_rule(db: Session, survey_id: uuid.UUID, rule_id: uuid.UUID, payload: "UpdateRule") -> dict[str, Any]:
    from .rule_validator import validate_rule as _validate_rule_status

    _validate_rule_payload(db, survey_id, payload)
    rule = _get_rule_or_404(db, survey_id, rule_id)
    _ensure_unique_rule_name(db, survey_id, payload.name, exclude_rule_id=rule.id)

    rowcount = (
        db.query(RuleORM)
        .filter(
            RuleORM.id == rule.id,
            RuleORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update(
            {
                "name": payload.name.strip(),
                "description": payload.description.strip() if payload.description and payload.description.strip() else None,
                "operator": payload.operator.value,
            },
            synchronize_session="fetch",
        )
    )
    if rowcount == 0:
        raise StaleObjectError("Rule", str(rule.id))

    db.query(RuleConditionORM).filter(RuleConditionORM.rule_id == rule.id).delete(synchronize_session=False)
    db.query(RuleGroupORM).filter(RuleGroupORM.rule_id == rule.id).delete(synchronize_session=False)
    db.flush()

    group_id_map: dict[uuid.UUID, uuid.UUID] = {}
    for group in payload.groups:
        row = RuleGroupORM(
            rule_id=rule.id,
            operator=group.operator.value,
        )
        db.add(row)
        db.flush()
        if group.id is not None:
            group_id_map[group.id] = row.id

    for condition in payload.conditions:
        db.add(
            RuleConditionORM(
                rule_id=rule.id,
                condition_type=condition.condition_type.value,
                question_id=condition.question_id,
                operator=condition.operator.value if condition.operator else None,
                value=_serialize_condition_value(condition.value),
                group_id=group_id_map.get(condition.group_id, condition.group_id),
            )
        )

    db.flush()

    # Expire the rule so that validate_rule re-queries fresh conditions from DB.
    # The bulk deletes above used synchronize_session=False, leaving stale condition
    # objects in the session identity map. Without this, joinedload in validate_rule
    # can return the old (deleted) conditions instead of the newly written ones.
    db.expire(rule)

    # Validate updated rule against current survey version before committing
    status, broken_reasons = _validate_rule_status(rule.id, db)
    if status == "broken":
        db.rollback()
        raise RuleValidationError(broken_reasons)

    db.commit()
    return _rule_to_response(_get_rule_or_404(db, survey_id, rule.id))


def _rule_id_in_flow_branch_config(config: dict | None, rule_id: uuid.UUID) -> bool:
    if not config:
        return False
    raw_conditions = config.get("rule_conditions")
    if isinstance(raw_conditions, list):
        for rc in raw_conditions:
            if not isinstance(rc, dict) or rc.get("rule_id") is None:
                continue
            try:
                if uuid.UUID(str(rc["rule_id"])) == rule_id:
                    return True
            except (TypeError, ValueError):
                continue
    for raw_rule_id in config.get("rule_ids") or []:
        try:
            if uuid.UUID(str(raw_rule_id)) == rule_id:
                return True
        except (TypeError, ValueError):
            continue
    return False


def delete_rule(db: Session, survey_id: uuid.UUID, rule_id: uuid.UUID, updated_at) -> None:
    rule = _get_rule_or_404(db, survey_id, rule_id)
    flow_nodes = (
        db.query(FlowNodeORM)
        .join(FlowORM, FlowORM.id == FlowNodeORM.flow_id)
        .filter(
            FlowORM.survey_id == survey_id,
            FlowORM.deleted_at.is_(None),
        )
        .all()
    )
    for node in flow_nodes:
        if node.rule_id == rule.id:
            raise ConflictError(
                code="RULE_IN_USE",
                message="Cannot delete a rule that is being used by a flow.",
            )
        if node.node_type == "branch" and _rule_id_in_flow_branch_config(node.action_config, rule.id):
            raise ConflictError(
                code="RULE_IN_USE",
                message="Cannot delete a rule that is being used by a flow",
            )

    from datetime import datetime
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rowcount = (
        db.query(RuleORM)
        .filter(
            RuleORM.id == rule.id,
            RuleORM.updated_at == _strip_tz(updated_at),
        )
        .update({"deleted_at": now}, synchronize_session="fetch")
    )
    if rowcount == 0:
        raise StaleObjectError("Rule", str(rule.id))

    db.refresh(rule)
    for condition in rule.conditions:
        if condition.deleted_at is None:
            condition.deleted_at = now
    db.commit()


def get_broken_rule_count(db: Session, survey_id: uuid.UUID) -> int:
    """Return the number of broken (non-deleted) rules for a survey."""
    return (
        db.query(RuleORM)
        .filter(
            RuleORM.survey_id == survey_id,
            RuleORM.deleted_at.is_(None),
            RuleORM.status == "broken",
        )
        .count()
    )


def get_company_broken_rule_count(db: Session, company_id: uuid.UUID) -> int:
    """Return the total number of broken rules across all surveys for a company."""
    return (
        db.query(RuleORM)
        .filter(
            RuleORM.company_id == company_id,
            RuleORM.deleted_at.is_(None),
            RuleORM.status == "broken",
        )
        .count()
    )


def build_response_contexts_for_response(
    db: Session,
    survey_response: SurveyResponseORM,
) -> dict[uuid.UUID, ResponseValueContext]:
    raw_answers = survey_response.answers or {}
    response_questions = (
        db.query(QuestionORM)
        .filter(
            QuestionORM.survey_version_id == survey_response.survey_version_id,
            QuestionORM.deleted_at.is_(None),
        )
        .all()
    )
    questions_by_id = {question.id: question for question in response_questions}
    questions_by_key = {str(question.question_key): question for question in response_questions}

    normalized_answers = (
        db.query(SurveyResponseAnswerORM)
        .filter(
            SurveyResponseAnswerORM.survey_response_id == survey_response.id,
            SurveyResponseAnswerORM.deleted_at.is_(None),
        )
        .all()
    )
    answer_by_question_id = {
        answer.question_id: answer
        for answer in normalized_answers
        if answer.question_id is not None
    }

    ai_rows = (
        db.query(AIAnalysisORM)
        .filter(
            AIAnalysisORM.survey_response_id == survey_response.id,
            AIAnalysisORM.status == "completed",
            AIAnalysisORM.deleted_at.is_(None),
        )
        .all()
    )
    ai_by_question_id = {
        row.question_id: row
        for row in ai_rows
        if row.question_id is not None
    }

    contexts: dict[uuid.UUID, ResponseValueContext] = {}
    for question_id, question in questions_by_id.items():
        normalized = answer_by_question_id.get(question_id)
        ai_row = ai_by_question_id.get(question_id)
        raw_value = raw_answers.get(str(question.question_key))
        contexts[question_id] = ResponseValueContext(
            question_id=question_id,
            question_key=str(question.question_key),
            question_type=question.question_type,
            is_numeric=bool(question.is_numeric),
            raw_value=raw_value,
            numeric_value=_to_float(
                normalized.numeric_value if normalized and normalized.numeric_value is not None else raw_value
            ),
            text_value=(normalized.text_value or "").strip() if normalized and normalized.text_value else None,
            sentiment=ai_row.sentiment if ai_row else None,
            sentiment_score=ai_row.sentiment_score if ai_row else None,
        )
    return contexts


def build_response_contexts_for_mock(
    db: Session,
    survey_id: uuid.UUID,
    mock_response: dict[str, Any],
) -> dict[uuid.UUID, ResponseValueContext]:
    survey = _get_survey_or_404(db, survey_id)
    questions = (
        db.query(QuestionORM)
        .join(SurveyVersionORM, SurveyVersionORM.id == QuestionORM.survey_version_id)
        .filter(
            SurveyVersionORM.survey_id == survey.id,
            SurveyVersionORM.version_number == survey.latest_version,
            SurveyVersionORM.deleted_at.is_(None),
            QuestionORM.deleted_at.is_(None),
        )
        .all()
    )

    contexts: dict[uuid.UUID, ResponseValueContext] = {}
    for question in questions:
        raw = mock_response.get(str(question.question_key), mock_response.get(str(question.id)))
        raw_value = raw
        sentiment = None
        sentiment_score = None
        if isinstance(raw, dict):
            raw_value = raw.get("value")
            sentiment = raw.get("sentiment")
            sentiment_score = _to_float(raw.get("sentiment_score"))

        contexts[question.id] = ResponseValueContext(
            question_id=question.id,
            question_key=str(question.question_key),
            question_type=question.question_type,
            is_numeric=bool(question.is_numeric),
            raw_value=raw_value,
            numeric_value=_to_float(raw_value),
            text_value=str(raw_value).strip() if isinstance(raw_value, str) and raw_value.strip() else None,
            sentiment=sentiment,
            sentiment_score=sentiment_score,
        )
    return contexts


def evaluate_rule(rule: RuleORM, contexts: dict[uuid.UUID, ResponseValueContext]) -> bool:
    grouped_conditions: dict[uuid.UUID, list[RuleConditionORM]] = {}
    ungrouped_conditions: list[RuleConditionORM] = []
    group_operator_by_id = {group.id: group.operator for group in rule.groups}

    for condition in rule.conditions:
        if condition.deleted_at is not None:
            continue
        if condition.group_id is None:
            ungrouped_conditions.append(condition)
        else:
            grouped_conditions.setdefault(condition.group_id, []).append(condition)

    top_level_results = [
        _evaluate_condition(condition, contexts.get(condition.question_id))
        for condition in ungrouped_conditions
    ]

    for group in rule.groups:
        conditions = grouped_conditions.get(group.id, [])
        if not conditions:
            return False
        results = [
            _evaluate_condition(condition, contexts.get(condition.question_id))
            for condition in conditions
        ]
        top_level_results.append(_combine(results, group_operator_by_id[group.id]))

    return _combine(top_level_results, rule.operator)


def _evaluate_condition(
    condition: RuleConditionORM,
    context: ResponseValueContext | None,
) -> bool:
    if context is None:
        return False

    ct = condition.condition_type

    if ct == RuleConditionType.not_empty.value:
        return not _is_blank_value(context.raw_value)

    if ct == RuleConditionType.sentiment.value:
        if condition.operator != RuleOperator.is_.value:
            return False
        return (context.sentiment or "").lower() == str(condition.value or "").strip().lower()

    if ct in {RuleConditionType.rating.value, RuleConditionType.nps.value}:
        return _compare_numeric(
            context.numeric_value,
            str(condition.operator),
            _to_float(condition.value),
        )

    if ct == RuleConditionType.multiple_choice.value:
        selected = str(context.raw_value or "").strip()
        expected = str(condition.value or "").strip()
        return bool(selected and selected == expected)

    if ct == RuleConditionType.yes_no.value:
        answer = str(context.raw_value or "").strip().lower()
        expected = str(condition.value or "").strip().lower()
        return bool(answer and answer == expected)

    if ct == RuleConditionType.checkbox.value:
        if not isinstance(context.raw_value, list):
            return False
        required = _parse_value_list(condition.value)
        if not required:
            return False
        selected_set = {str(v).strip() for v in context.raw_value}
        return all(opt in selected_set for opt in required)

    return False
