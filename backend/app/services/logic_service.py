from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from ..core.errors.exceptions import LogicEvaluationError

_GROUP_OPERATOR = "group"
_NUMERIC_OPERATORS = {"<", "<=", ">=", ">"}
_SENTIMENT_OPERATORS = {"sentiment_positive", "sentiment_negative"}
_BLANK_OPERATORS = {"blank", "not_blank"}
_TEXT_TYPES = {"text", "long_text"}


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

    ctx = contexts.get(
        condition.question_key or "",
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
        result = _combine(
            result,
            _evaluate_condition_node(
                condition,
                contexts,
                children_by_parent,
                depth=depth,
            ),
            condition.logical_connector,
        )
    return result


def evaluate_logic(db: Session, survey_response_id: uuid.UUID) -> list[dict[str, Any]]:
    # Compatibility shim: legacy logic events were replaced by the new flow engine.
    return []
