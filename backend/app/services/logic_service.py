from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from sqlalchemy.orm import Session

from ..core.errors.exceptions import LogicEvaluationError, NotFoundError, ValidationError
from ..models.postgres_model import (
    AIAnalysis as AIAnalysisORM,
    LogicCondition as LogicConditionORM,
    LogicEvent as LogicEventORM,
    LogicRule as LogicRuleORM,
    Question as QuestionORM,
    Survey as SurveyORM,
    SurveyResponse as SurveyResponseORM,
    SurveyResponseAnswer as SurveyResponseAnswerORM,
    SurveyVersion as SurveyVersionORM,
)

if TYPE_CHECKING:
    from ..schemas.pydantic_model import LogicConditionUpsert, LogicRuleCreate, LogicRuleResponse

logger = logging.getLogger(__name__)

_GROUP_OPERATOR = "group"
_NUMERIC_OPERATORS = {
    "<",
    "<=",
    ">=",
    ">",
}
_SENTIMENT_OPERATORS = {
    "sentiment_positive",
    "sentiment_negative",
}
_BLANK_OPERATORS = {
    "blank",
    "not_blank",
}
_TEXT_TYPES = {"text", "long_text"}
_CONTACT_TYPES = {"email", "phone"}


@dataclass(slots=True)
class RuntimeCondition:
    id: uuid.UUID
    question_id: uuid.UUID | None
    question_key: str | None
    question_type: str | None
    is_numeric: bool
    operator: str
    threshold_value: float | None
    logical_connector: str
    parent_condition_id: uuid.UUID | None


@dataclass(slots=True)
class ResponseValueContext:
    question_key: str | None
    question_type: str | None
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
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _compare_numeric(left: float | None, operator: str, right: float | None) -> bool:
    if left is None or right is None:
        return False
    if operator == "<":
        return left < right
    if operator == "<=":
        return left <= right
    if operator == ">=":
        return left >= right
    if operator == ">":
        return left > right
    return False


def _evaluate_leaf_condition(condition: RuntimeCondition, ctx: ResponseValueContext) -> bool:
    operator = condition.operator
    if operator == _GROUP_OPERATOR:
        return False
    if operator in _BLANK_OPERATORS:
        blank = _is_blank_value(ctx.raw_value)
        return blank if operator == "blank" else not blank

    if operator in _SENTIMENT_OPERATORS:
        if ctx.question_type not in _TEXT_TYPES:
            return False
        target = "positive" if operator == "sentiment_positive" else "negative"
        return ctx.sentiment == target

    if operator in _NUMERIC_OPERATORS:
        if ctx.is_numeric:
            return _compare_numeric(ctx.numeric_value, operator, condition.threshold_value)
        if ctx.question_type in _TEXT_TYPES:
            return _compare_numeric(ctx.sentiment_score, operator, condition.threshold_value)
        return False

    return False


def _combine(accumulator: bool, next_value: bool, connector: str) -> bool:
    return accumulator or next_value if connector == "OR" else accumulator and next_value


def _evaluate_condition_node(
    condition: RuntimeCondition,
    contexts: dict[str, ResponseValueContext],
    children_by_parent: dict[uuid.UUID | None, list[RuntimeCondition]],
    *,
    depth: int,
) -> bool:
    if depth > 1:
        raise LogicEvaluationError(
            code="LOGIC_GROUP_NESTING_TOO_DEEP",
            message="Logic condition groups can only contain one level of conditions",
        )

    if condition.operator == _GROUP_OPERATOR:
        return _evaluate_condition_group(
            children_by_parent.get(condition.id, []),
            contexts,
            children_by_parent,
            depth=depth + 1,
        )

    key = condition.question_key or ""
    ctx = contexts.get(
        key,
        ResponseValueContext(
            question_key=condition.question_key,
            question_type=condition.question_type,
            is_numeric=condition.is_numeric,
            raw_value=None,
            numeric_value=None,
            text_value=None,
            sentiment=None,
            sentiment_score=None,
        ),
    )
    return _evaluate_leaf_condition(condition, ctx)


def _evaluate_condition_group(
    conditions: list[RuntimeCondition],
    contexts: dict[str, ResponseValueContext],
    children_by_parent: dict[uuid.UUID | None, list[RuntimeCondition]],
    *,
    depth: int = 0,
) -> bool:
    if not conditions:
        return False

    result = _evaluate_condition_node(
        conditions[0],
        contexts,
        children_by_parent,
        depth=depth,
    )
    for condition in conditions[1:]:
        next_value = _evaluate_condition_node(
            condition,
            contexts,
            children_by_parent,
            depth=depth,
        )
        result = _combine(result, next_value, condition.logical_connector)
    return result


def _get_survey_or_404(db: Session, survey_id: uuid.UUID) -> SurveyORM:
    survey = db.query(SurveyORM).filter(SurveyORM.id == survey_id).first()
    if not survey:
        raise NotFoundError(code="SURVEY_NOT_FOUND", message="Survey not found")
    return survey


def _get_rule_or_404(db: Session, survey_id: uuid.UUID, rule_id: uuid.UUID) -> LogicRuleORM:
    rule = (
        db.query(LogicRuleORM)
        .filter(
            LogicRuleORM.id == rule_id,
            LogicRuleORM.survey_id == survey_id,
        )
        .first()
    )
    if not rule:
        raise NotFoundError(code="LOGIC_RULE_NOT_FOUND", message="Logic rule not found")
    return rule


def _get_question_rows_for_survey(db: Session, survey_id: uuid.UUID) -> dict[uuid.UUID, QuestionORM]:
    rows = (
        db.query(QuestionORM)
        .join(SurveyVersionORM, SurveyVersionORM.id == QuestionORM.survey_version_id)
        .filter(SurveyVersionORM.survey_id == survey_id)
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
        }
        for row in rows
    ]


def _validate_condition_payload(
    condition: "LogicConditionUpsert",
    question_by_id: dict[uuid.UUID, QuestionORM],
    *,
    depth: int,
) -> None:
    operator = condition.operator.value
    if operator == _GROUP_OPERATOR:
        if condition.question_id is not None:
            raise ValidationError(
                code="LOGIC_GROUP_QUESTION_NOT_ALLOWED",
                message="Condition groups cannot be linked to a survey question",
                status_code=422,
            )
        if condition.threshold_value is not None:
            raise ValidationError(
                code="LOGIC_GROUP_THRESHOLD_NOT_ALLOWED",
                message="Condition groups cannot have a threshold value",
                status_code=422,
            )
        if depth > 0:
            raise ValidationError(
                code="LOGIC_GROUP_NESTING_TOO_DEEP",
                message="Condition groups can only exist at the top level of a rule",
                status_code=422,
            )
        if not condition.children:
            raise ValidationError(
                code="LOGIC_GROUP_CONDITIONS_REQUIRED",
                message="Condition groups must contain at least one condition",
                status_code=422,
            )
        for child in condition.children:
            if child.operator.value == _GROUP_OPERATOR:
                raise ValidationError(
                    code="LOGIC_GROUP_NESTING_TOO_DEEP",
                    message="Condition groups cannot contain other condition groups",
                    status_code=422,
                )
            _validate_condition_payload(child, question_by_id, depth=depth + 1)
        return

    question = question_by_id.get(condition.question_id)
    if not question:
        raise ValidationError(
            code="LOGIC_INVALID_QUESTION",
            message="Condition question does not belong to this survey",
            status_code=422,
        )

    allowed_operators: set[str]
    if question.is_numeric:
        allowed_operators = _NUMERIC_OPERATORS
    elif question.question_type in _TEXT_TYPES:
        allowed_operators = _NUMERIC_OPERATORS | _SENTIMENT_OPERATORS | _BLANK_OPERATORS
    elif question.question_type in _CONTACT_TYPES:
        allowed_operators = _BLANK_OPERATORS
    else:
        raise ValidationError(
            code="LOGIC_UNSUPPORTED_QUESTION_TYPE",
            message=f"Question type '{question.question_type}' is not supported by logic rules",
            status_code=422,
        )

    if operator not in allowed_operators:
        raise ValidationError(
            code="LOGIC_INVALID_OPERATOR",
            message=f"Operator '{operator}' is not valid for question type '{question.question_type}'",
            status_code=422,
        )

    if operator in _NUMERIC_OPERATORS and condition.threshold_value is None:
        raise ValidationError(
            code="LOGIC_THRESHOLD_REQUIRED",
            message="A numeric threshold is required for this operator",
            status_code=422,
        )
    if operator not in _NUMERIC_OPERATORS and condition.threshold_value is not None:
        raise ValidationError(
            code="LOGIC_THRESHOLD_NOT_ALLOWED",
            message="This operator does not accept a threshold value",
            status_code=422,
        )

    if depth > 1:
        raise ValidationError(
            code="LOGIC_GROUP_NESTING_TOO_DEEP",
            message="Condition groups can only contain one level of conditions",
            status_code=422,
        )
    if condition.children:
        raise ValidationError(
            code="LOGIC_GROUP_CHILDREN_NOT_ALLOWED",
            message="Only condition groups can contain nested conditions",
            status_code=422,
        )


def _validate_rule_payload(db: Session, survey_id: uuid.UUID, payload: "LogicRuleCreate") -> None:
    if not payload.name.strip():
        raise ValidationError(
            code="LOGIC_RULE_NAME_REQUIRED",
            message="Rule name is required",
            status_code=422,
        )
    if payload.description is not None and len(payload.description.strip()) > 240:
        raise ValidationError(
            code="LOGIC_RULE_DESCRIPTION_TOO_LONG",
            message="Rule description must be 240 characters or fewer",
            status_code=422,
        )
    if not payload.conditions:
        raise ValidationError(
            code="LOGIC_RULE_CONDITIONS_REQUIRED",
            message="At least one condition is required",
            status_code=422,
        )

    question_by_id = _get_question_rows_for_survey(db, survey_id)
    for condition in payload.conditions:
        _validate_condition_payload(condition, question_by_id, depth=0)


def _insert_condition_rows(
    db: Session,
    *,
    rule_id: uuid.UUID,
    conditions: list["LogicConditionUpsert"],
    parent_condition_id: uuid.UUID | None = None,
) -> None:
    for index, condition in enumerate(conditions):
        row = LogicConditionORM(
            rule_id=rule_id,
            question_id=condition.question_id,
            operator=condition.operator.value,
            threshold_value=condition.threshold_value,
            logical_connector=condition.logical_connector.value,
            parent_condition_id=parent_condition_id,
            position=index,
        )
        db.add(row)
        db.flush()
        if condition.children:
            _insert_condition_rows(
                db,
                rule_id=rule_id,
                conditions=condition.children,
                parent_condition_id=row.id,
            )


def _build_rule_responses(db: Session, survey_id: uuid.UUID) -> list[dict[str, Any]]:
    rules = (
        db.query(LogicRuleORM)
        .filter(LogicRuleORM.survey_id == survey_id)
        .order_by(LogicRuleORM.updated_at.desc(), LogicRuleORM.created_at.desc())
        .all()
    )
    if not rules:
        return []

    rule_ids = [rule.id for rule in rules]
    condition_rows = (
        db.query(LogicConditionORM, QuestionORM.question_text, QuestionORM.question_type)
        .outerjoin(QuestionORM, QuestionORM.id == LogicConditionORM.question_id)
        .filter(LogicConditionORM.rule_id.in_(rule_ids))
        .order_by(
            LogicConditionORM.rule_id.asc(),
            LogicConditionORM.parent_condition_id.asc(),
            LogicConditionORM.position.asc(),
            LogicConditionORM.id.asc(),
        )
        .all()
    )

    conditions_by_rule: dict[uuid.UUID, list[tuple[LogicConditionORM, str | None, str | None]]] = defaultdict(list)
    for condition, question_text, question_type in condition_rows:
        conditions_by_rule[condition.rule_id].append((condition, question_text, question_type))

    responses: list[LogicRuleResponse] = []
    for rule in rules:
        nodes: dict[uuid.UUID, dict[str, Any]] = {}
        children_by_parent: dict[uuid.UUID | None, list[dict[str, Any]]] = defaultdict(list)

        for condition, question_text, question_type in conditions_by_rule.get(rule.id, []):
            node = {
                "id": condition.id,
                "question_id": condition.question_id,
                "operator": condition.operator,
                "threshold_value": condition.threshold_value,
                "logical_connector": condition.logical_connector,
                "parent_condition_id": condition.parent_condition_id,
                "position": condition.position,
                "question_text": question_text,
                "question_type": question_type,
                "children": [],
            }
            nodes[condition.id] = node
            children_by_parent[condition.parent_condition_id].append(node)

        for parent_id, children in children_by_parent.items():
            if parent_id is None:
                continue
            parent = nodes.get(parent_id)
            if parent:
                parent["children"] = children

        responses.append(
            {
                "id": rule.id,
                "survey_id": rule.survey_id,
                "name": rule.name,
                "description": rule.description,
                "enabled": rule.enabled,
                "action_type": rule.action_type,
                "conditions": children_by_parent.get(None, []),
                "created_at": rule.created_at,
                "updated_at": rule.updated_at,
            }
        )
    return responses


def _build_rule_response(db: Session, survey_id: uuid.UUID, rule_id: uuid.UUID) -> dict[str, Any]:
    for item in _build_rule_responses(db, survey_id):
        if item["id"] == rule_id:
            return item
    raise NotFoundError(code="LOGIC_RULE_NOT_FOUND", message="Logic rule not found")


def get_logic_rule_bundle(db: Session, survey_id: uuid.UUID) -> dict[str, Any]:
    survey = _get_survey_or_404(db, survey_id)
    return {
        "survey_id": survey.id,
        "questions": _get_latest_question_options(db, survey),
        "rules": _build_rule_responses(db, survey.id),
    }


def create_logic_rule(db: Session, survey_id: uuid.UUID, payload: "LogicRuleCreate") -> dict[str, Any]:
    _get_survey_or_404(db, survey_id)
    _validate_rule_payload(db, survey_id, payload)

    rule = LogicRuleORM(
        survey_id=survey_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description and payload.description.strip() else None,
        enabled=payload.enabled,
        action_type=payload.action_type.value,
    )
    db.add(rule)
    db.flush()
    _insert_condition_rows(db, rule_id=rule.id, conditions=payload.conditions)
    db.commit()
    return _build_rule_response(db, survey_id, rule.id)


def update_logic_rule(
    db: Session,
    survey_id: uuid.UUID,
    rule_id: uuid.UUID,
    payload: "LogicRuleCreate",
) -> dict[str, Any]:
    _validate_rule_payload(db, survey_id, payload)
    rule = _get_rule_or_404(db, survey_id, rule_id)

    rule.name = payload.name.strip()
    rule.description = payload.description.strip() if payload.description and payload.description.strip() else None
    rule.enabled = payload.enabled
    rule.action_type = payload.action_type.value
    db.query(LogicConditionORM).filter(LogicConditionORM.rule_id == rule.id).delete(synchronize_session=False)
    db.flush()
    _insert_condition_rows(db, rule_id=rule.id, conditions=payload.conditions)
    db.commit()
    return _build_rule_response(db, survey_id, rule.id)


def delete_logic_rule(db: Session, survey_id: uuid.UUID, rule_id: uuid.UUID) -> None:
    rule = _get_rule_or_404(db, survey_id, rule_id)
    db.delete(rule)
    db.commit()


def _build_runtime_conditions_for_rule(
    db: Session,
    rule_id: uuid.UUID,
) -> dict[uuid.UUID | None, list[RuntimeCondition]]:
    rows = (
        db.query(LogicConditionORM, QuestionORM)
        .outerjoin(QuestionORM, QuestionORM.id == LogicConditionORM.question_id)
        .filter(LogicConditionORM.rule_id == rule_id)
        .order_by(
            LogicConditionORM.parent_condition_id.asc(),
            LogicConditionORM.position.asc(),
            LogicConditionORM.id.asc(),
        )
        .all()
    )

    children_by_parent: dict[uuid.UUID | None, list[RuntimeCondition]] = defaultdict(list)
    for condition, question in rows:
        runtime = RuntimeCondition(
            id=condition.id,
            question_id=condition.question_id,
            question_key=str(question.question_key) if question else None,
            question_type=question.question_type if question else None,
            is_numeric=bool(question.is_numeric) if question else False,
            operator=condition.operator,
            threshold_value=condition.threshold_value,
            logical_connector=condition.logical_connector,
            parent_condition_id=condition.parent_condition_id,
        )
        children_by_parent[runtime.parent_condition_id].append(runtime)
    return children_by_parent


def _build_response_contexts(
    db: Session,
    survey_response: SurveyResponseORM,
) -> dict[str, ResponseValueContext]:
    raw_answers = survey_response.answers or {}
    response_questions = (
        db.query(QuestionORM)
        .filter(QuestionORM.survey_version_id == survey_response.survey_version_id)
        .all()
    )
    response_questions_by_key = {str(question.question_key): question for question in response_questions}

    normalized_answers = (
        db.query(SurveyResponseAnswerORM)
        .filter(SurveyResponseAnswerORM.survey_response_id == survey_response.id)
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
        )
        .all()
    )
    ai_by_question_id = {
        row.question_id: row
        for row in ai_rows
        if row.question_id is not None
    }

    contexts: dict[str, ResponseValueContext] = {}
    for question_key, question in response_questions_by_key.items():
        normalized = answer_by_question_id.get(question.id)
        ai_row = ai_by_question_id.get(question.id)
        raw_value = raw_answers.get(question_key)
        contexts[question_key] = ResponseValueContext(
            question_key=question_key,
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


def evaluate_logic(db: Session, survey_response_id: uuid.UUID) -> list[dict[str, Any]]:
    survey_response = (
        db.query(SurveyResponseORM)
        .filter(SurveyResponseORM.id == survey_response_id)
        .first()
    )
    if not survey_response:
        raise LogicEvaluationError(
            code="LOGIC_RESPONSE_NOT_FOUND",
            message="Survey response not found for logic evaluation",
            details={"survey_response_id": str(survey_response_id)},
        )

    survey_version = (
        db.query(SurveyVersionORM)
        .filter(SurveyVersionORM.id == survey_response.survey_version_id)
        .first()
    )
    if not survey_version:
        raise LogicEvaluationError(
            code="LOGIC_SURVEY_VERSION_NOT_FOUND",
            message="Survey version not found for logic evaluation",
            details={"survey_response_id": str(survey_response_id)},
        )

    rules = (
        db.query(LogicRuleORM)
        .filter(
            LogicRuleORM.survey_id == survey_version.survey_id,
            LogicRuleORM.enabled.is_(True),
        )
        .order_by(LogicRuleORM.created_at.asc(), LogicRuleORM.id.asc())
        .all()
    )
    if not rules:
        return []

    contexts = _build_response_contexts(db, survey_response)
    existing_rule_ids = {
        row[0]
        for row in db.query(LogicEventORM.rule_id)
        .filter(LogicEventORM.survey_response_id == survey_response.id)
        .all()
    }

    created_rows: list[LogicEventORM] = []
    for rule in rules:
        children_by_parent = _build_runtime_conditions_for_rule(db, rule.id)
        top_level_conditions = children_by_parent.get(None, [])
        matched = _evaluate_condition_group(top_level_conditions, contexts, children_by_parent)
        logger.info(
            "Evaluated logic rule",
            extra={
                "rule_id": str(rule.id),
                "survey_response_id": str(survey_response.id),
                "matched": matched,
                "action_type": rule.action_type,
            },
        )
        if matched and rule.id not in existing_rule_ids:
            row = LogicEventORM(
                survey_response_id=survey_response.id,
                rule_id=rule.id,
                action_type=rule.action_type,
            )
            db.add(row)
            db.flush()
            created_rows.append(row)
            existing_rule_ids.add(rule.id)

    if created_rows:
        db.commit()
        for row in created_rows:
            db.refresh(row)

    return [
        {
            "id": row.id,
            "survey_response_id": row.survey_response_id,
            "rule_id": row.rule_id,
            "action_type": row.action_type,
            "created_at": row.created_at,
        }
        for row in created_rows
    ]
