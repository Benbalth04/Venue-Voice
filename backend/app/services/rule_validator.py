"""
Rule validation engine.

Checks whether each condition in a rule is still valid against the current
(latest) survey version.  Used:
  - after a new survey version is saved  (batch revalidation)
  - before a rule is created / updated   (save-time guard)
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified

from ..models.postgres_model import (
    Question as QuestionORM,
    Rule as RuleORM,
    Survey as SurveyORM,
    SurveyVersion as SurveyVersionORM,
)

logger = logging.getLogger(__name__)

# ── Type sets (mirrors rule_service.py) ──────────────────────────────────────
_STAR_TYPES = {"star"}
_NPS_TYPES = {"nps"}
_TEXT_TYPES = {"text", "long_text"}
_CHOICE_TYPES = {"multiple_choice", "checkbox", "yes_no"}
_PRESENCE_TYPES = {"email", "phone", "photo"}
_VALID_SENTIMENT = {"positive", "neutral", "negative"}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_value_list(value: str | None) -> list[str]:
    if value is None:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [str(v).strip() for v in parsed if str(v).strip()]
    except (json.JSONDecodeError, TypeError):
        pass
    return [value.strip()] if value.strip() else []


def _get_latest_questions(db: Session, survey_id: uuid.UUID) -> dict[uuid.UUID, QuestionORM]:
    """Return questions from the latest version of the survey, keyed by stable_question_id."""
    survey = (
        db.query(SurveyORM)
        .filter(SurveyORM.id == survey_id, SurveyORM.deleted_at.is_(None))
        .first()
    )
    if not survey:
        return {}

    rows = (
        db.query(QuestionORM)
        .join(SurveyVersionORM, SurveyVersionORM.id == QuestionORM.survey_version_id)
        .filter(
            SurveyVersionORM.survey_id == survey_id,
            SurveyVersionORM.version_number == survey.latest_version,
            SurveyVersionORM.deleted_at.is_(None),
            QuestionORM.deleted_at.is_(None),
        )
        .all()
    )
    return {row.stable_question_id: row for row in rows}


# ── Core validation ───────────────────────────────────────────────────────────

def validate_rule(rule_id: uuid.UUID, db: Session) -> tuple[str, list[dict]]:
    """
    Validate a rule against the current survey version.

    Returns:
        (status, broken_reasons)
        status          — 'active' | 'broken'
        broken_reasons  — list[dict], empty when status == 'active'
    """
    rule = (
        db.query(RuleORM)
        .options(joinedload(RuleORM.conditions))
        .filter(RuleORM.id == rule_id, RuleORM.deleted_at.is_(None))
        .populate_existing()
        .first()
    )
    if not rule:
        return "broken", [
            {
                "type": "RULE_NOT_FOUND",
                "condition_id": None,
                "question_id": None,
                "message": "Rule no longer exists",
            }
        ]

    try:
        question_map = _get_latest_questions(db, rule.survey_id)
    except Exception:
        logger.exception("Failed to load questions for survey %s during rule validation", rule.survey_id)
        return "broken", [
            {
                "type": "VALIDATION_ERROR",
                "condition_id": None,
                "question_id": None,
                "message": "Could not load survey questions for validation",
            }
        ]

    broken_reasons: list[dict] = []

    for condition in rule.conditions:
        if condition.deleted_at is not None:
            continue

        cid = str(condition.id)
        ct = condition.condition_type

        # ── question must be present ────────────────────────────────────────
        question_id = condition.question_id
        if question_id is None:
            broken_reasons.append(
                {
                    "type": "QUESTION_MISSING",
                    "condition_id": cid,
                    "question_id": None,
                    "message": "Condition has no question assigned",
                }
            )
            continue

        qid_str = str(question_id)
        question = question_map.get(question_id)

        if question is None:
            broken_reasons.append(
                {
                    "type": "QUESTION_DELETED",
                    "condition_id": cid,
                    "question_id": qid_str,
                    "message": "Question no longer exists in the current survey version",
                }
            )
            continue

        qt = question.question_type
        config: dict = question.config or {}

        # ── rating (star) ───────────────────────────────────────────────────
        if ct == "rating":
            if qt not in _STAR_TYPES:
                broken_reasons.append(
                    {
                        "type": "TYPE_MISMATCH",
                        "condition_id": cid,
                        "question_id": qid_str,
                        "message": f"Rating condition requires a star question, but question is '{qt}'",
                    }
                )
            else:
                max_val = int(config.get("starCount", 5))
                numeric_val = _to_float(condition.value)
                if numeric_val is None or not (1 <= numeric_val <= max_val):
                    broken_reasons.append(
                        {
                            "type": "INVALID_THRESHOLD",
                            "condition_id": cid,
                            "question_id": qid_str,
                            "message": f"Rating threshold must be between 1 and {max_val}",
                        }
                    )

        # ── nps ─────────────────────────────────────────────────────────────
        elif ct == "nps":
            if qt not in _NPS_TYPES:
                broken_reasons.append(
                    {
                        "type": "TYPE_MISMATCH",
                        "condition_id": cid,
                        "question_id": qid_str,
                        "message": f"NPS condition requires an NPS question, but question is '{qt}'",
                    }
                )
            else:
                max_val = int(config.get("max_score", 10))
                numeric_val = _to_float(condition.value)
                if numeric_val is None or not (0 <= numeric_val <= max_val):
                    broken_reasons.append(
                        {
                            "type": "INVALID_THRESHOLD",
                            "condition_id": cid,
                            "question_id": qid_str,
                            "message": f"NPS threshold must be between 0 and {max_val}",
                        }
                    )

        # ── sentiment ────────────────────────────────────────────────────────
        elif ct == "sentiment":
            if qt not in _TEXT_TYPES:
                broken_reasons.append(
                    {
                        "type": "TYPE_MISMATCH",
                        "condition_id": cid,
                        "question_id": qid_str,
                        "message": f"Sentiment condition requires a text question, but question is '{qt}'",
                    }
                )
            else:
                val = str(condition.value or "").strip().lower()
                if val not in _VALID_SENTIMENT:
                    broken_reasons.append(
                        {
                            "type": "INVALID_SENTIMENT_VALUE",
                            "condition_id": cid,
                            "question_id": qid_str,
                            "message": "Sentiment value must be positive, neutral, or negative",
                        }
                    )

        # ── multiple_choice ──────────────────────────────────────────────────
        elif ct == "multiple_choice":
            if qt != "multiple_choice":
                broken_reasons.append(
                    {
                        "type": "TYPE_MISMATCH",
                        "condition_id": cid,
                        "question_id": qid_str,
                        "message": f"Multiple-choice condition requires a multiple_choice question, but question is '{qt}'",
                    }
                )
            else:
                valid_options: set[str] = set(config.get("options", []))
                selected = str(condition.value or "").strip()
                if not valid_options or selected not in valid_options:
                    broken_reasons.append(
                        {
                            "type": "INVALID_OPTION",
                            "condition_id": cid,
                            "question_id": qid_str,
                            "message": "Selected option no longer exists in the question's choices",
                        }
                    )

        # ── checkbox ─────────────────────────────────────────────────────────
        elif ct == "checkbox":
            if qt != "checkbox":
                broken_reasons.append(
                    {
                        "type": "TYPE_MISMATCH",
                        "condition_id": cid,
                        "question_id": qid_str,
                        "message": f"Checkbox condition requires a checkbox question, but question is '{qt}'",
                    }
                )
            else:
                valid_options = set(config.get("options", []))
                selected = _parse_value_list(condition.value)
                invalid = [v for v in selected if v not in valid_options]
                if not valid_options or not selected or invalid:
                    broken_reasons.append(
                        {
                            "type": "INVALID_OPTION",
                            "condition_id": cid,
                            "question_id": qid_str,
                            "message": "One or more selected checkbox options no longer exist",
                        }
                    )

        # ── yes_no ────────────────────────────────────────────────────────────
        elif ct == "yes_no":
            if qt != "yes_no":
                broken_reasons.append(
                    {
                        "type": "TYPE_MISMATCH",
                        "condition_id": cid,
                        "question_id": qid_str,
                        "message": f"Yes/No condition requires a yes_no question, but question is '{qt}'",
                    }
                )

        # ── not_empty (presence check — email, phone, photo, etc.) ───────────
        elif ct == "not_empty":
            # question existence already confirmed above; no further checks needed
            pass

    status = "broken" if broken_reasons else "active"
    return status, broken_reasons


# ── Batch revalidation ────────────────────────────────────────────────────────

def revalidate_rules_for_survey(db: Session, survey_id: uuid.UUID) -> None:
    """
    Revalidate every active rule for a survey after a new version is created.

    - Runs synchronously inside the caller's transaction.
    - One rule failing must not stop others (fail-safe per rule).
    - Does NOT commit — caller is responsible.
    """
    rules = (
        db.query(RuleORM)
        .filter(RuleORM.survey_id == survey_id, RuleORM.deleted_at.is_(None))
        .all()
    )
    for rule in rules:
        try:
            status, broken_reasons = validate_rule(rule.id, db)
        except Exception:
            logger.exception("Unexpected error validating rule %s", rule.id)
            status = "broken"
            broken_reasons = [
                {
                    "type": "VALIDATION_ERROR",
                    "condition_id": None,
                    "question_id": None,
                    "message": "Validation failed unexpectedly",
                }
            ]
        rule.status = status
        rule.broken_reasons = broken_reasons
        flag_modified(rule, "broken_reasons")
