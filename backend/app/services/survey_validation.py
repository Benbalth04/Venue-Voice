"""
Centralised survey validation service.
Validates theme settings and question settings against database-driven schemas.
"""
from __future__ import annotations

import re
from typing import Any

from ..schemas.pydantic_model import (
    SurveyValidationError,
    SurveyValidationResult,
)

_HEX_COLOR = re.compile(r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$")
_ALLOWED_ALIGNMENT = {"left", "center", "right", "inherit"}
_ALLOWED_TEXT_SIZE = {"small", "medium", "large", "extra_large"}
_ALLOWED_FONTS = {"Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Source Sans Pro"}


def _sanitize_html(text: str) -> str:
    """Allow only <b> and <u> tags. Strip others."""
    if not text or not isinstance(text, str):
        return ""
    # Remove any tags except b and u
    cleaned = re.sub(r"<(?!\/?b\b)(?!\/?u\b)[^>]+>", "", text)
    return cleaned


def sanitize_rich_text(value: Any) -> str:
    """Sanitize rich text field. Returns plain text if not a string."""
    if value is None:
        return ""
    if isinstance(value, dict):
        text = value.get("text", "")
        return _sanitize_html(str(text)) if text else ""
    return _sanitize_html(str(value))


def validate_hex_color(value: Any, field: str) -> str | None:
    """Return error message if invalid, else None."""
    if value is None or value == "":
        return None
    s = str(value).strip()
    if not s:
        return None
    if not _HEX_COLOR.match(s):
        return f"{field} must be a valid hex color (e.g. #7C3AED)"
    return None


def validate_theme_settings(theme: dict[str, Any] | None) -> list[SurveyValidationError]:
    """Validate survey theme/settings. Returns list of errors."""
    errors: list[SurveyValidationError] = []
    if not theme:
        return errors

    t = theme if isinstance(theme, dict) else {}

    # font
    font = t.get("font") or t.get("fontFamily")
    if font and str(font) not in _ALLOWED_FONTS:
        errors.append(SurveyValidationError(setting="font", message=f"Font must be one of: {', '.join(sorted(_ALLOWED_FONTS))}"))

    # content_alignment / contentAlign
    align = t.get("content_alignment") or t.get("contentAlign")
    if align and str(align).lower() not in _ALLOWED_ALIGNMENT:
        errors.append(SurveyValidationError(setting="content_alignment", message=f"Alignment must be one of: {', '.join(_ALLOWED_ALIGNMENT)}"))

    # primary_color / primaryColor
    err = validate_hex_color(t.get("primary_color") or t.get("primaryColor"), "Primary color")
    if err:
        errors.append(SurveyValidationError(setting="primary_color", message=err))

    # background_color / backgroundColor
    err = validate_hex_color(t.get("background_color") or t.get("backgroundColor"), "Background color")
    if err:
        errors.append(SurveyValidationError(setting="background_color", message=err))

    # show_progress_bar / showProgressBar
    show_pb = t.get("show_progress_bar", t.get("showProgressBar"))
    if show_pb is not None and not isinstance(show_pb, bool):
        errors.append(SurveyValidationError(setting="show_progress_bar", message="show_progress_bar must be true or false"))

    # progress_bar_color / progressBarColor
    err = validate_hex_color(t.get("progress_bar_color") or t.get("progressBarColor"), "Progress bar color")
    if err:
        errors.append(SurveyValidationError(setting="progress_bar_color", message=err))

    return errors


def validate_question_settings(
    question_id: str,
    question_type: str,
    settings: dict[str, Any] | None,
    schema_defs: list[dict[str, Any]],
) -> list[SurveyValidationError]:
    """Validate a single question's settings against schema definitions."""
    errors: list[SurveyValidationError] = []
    settings = settings or {}

    for defn in schema_defs:
        key = defn.get("setting_key") or defn.get("key")
        if not key:
            continue
        required = defn.get("required", False)
        allowed = defn.get("allowed_values")
        val_type = defn.get("setting_type") or defn.get("type")
        rules = defn.get("validation_rules") or {}

        value = settings.get(key)

        if required and (value is None or value == ""):
            if key == "options" and isinstance(value, list) and len(value) == 0:
                errors.append(SurveyValidationError(question_id=question_id, setting=key, message=f"{key} is required"))
            elif key != "options":
                errors.append(SurveyValidationError(question_id=question_id, setting=key, message=f"{key} is required"))
            continue

        if value is None and not required:
            continue

        # allowed_values
        if allowed is not None and isinstance(allowed, list):
            if str(value) not in [str(v) for v in allowed]:
                errors.append(SurveyValidationError(question_id=question_id, setting=key, message=f"{key} must be one of: {allowed}"))

        # type-specific validation
        if val_type == "integer" and value is not None:
            try:
                n = int(value)
                if "min" in rules and n < rules["min"]:
                    errors.append(SurveyValidationError(question_id=question_id, setting=key, message=f"{key} must be at least {rules['min']}"))
                if "max" in rules and n > rules["max"]:
                    errors.append(SurveyValidationError(question_id=question_id, setting=key, message=f"{key} must be at most {rules['max']}"))
            except (TypeError, ValueError):
                errors.append(SurveyValidationError(question_id=question_id, setting=key, message=f"{key} must be an integer"))

        # NPS: min_score always 0, max_score must be 1-10
        if question_type == "nps":
            max_s = settings.get("max_score")
            if max_s is not None:
                try:
                    ma = int(max_s)
                    if ma < 1 or ma > 10:
                        errors.append(SurveyValidationError(question_id=question_id, setting="max_score", message="max_score must be between 1 and 10"))
                except (TypeError, ValueError):
                    errors.append(SurveyValidationError(question_id=question_id, setting="max_score", message="max_score must be an integer"))

        # options: min_options
        if key == "options" and isinstance(value, list):
            min_opts = rules.get("min_options", 1)
            if len(value) < min_opts:
                errors.append(SurveyValidationError(question_id=question_id, setting=key, message=f"At least {min_opts} option(s) required"))

        # color
        if val_type == "color" and value:
            err = validate_hex_color(value, key)
            if err:
                errors.append(SurveyValidationError(question_id=question_id, setting=key, message=err))

    return errors


def validate_survey_schema(
    schema: dict[str, Any],
    valid_question_types: set[str],
    question_type_schemas: dict[str, list[dict[str, Any]]],
) -> SurveyValidationResult:
    """
    Full survey validation: title, theme, questions.
    question_type_schemas: { "nps": [ {...}, ... ], "star": [...], ... }
    """
    errors: list[SurveyValidationError] = []

    # Title
    title = schema.get("title")
    if not title:
        errors.append(SurveyValidationError(message="Survey title is required"))
    elif isinstance(title, dict):
        text = title.get("text", "")
        if not str(text).strip():
            errors.append(SurveyValidationError(message="Survey title text cannot be empty"))
    elif not str(title).strip():
        errors.append(SurveyValidationError(message="Survey title text cannot be empty"))

    # Theme (merge theme + settings from schema)
    theme = {**(schema.get("theme") or {}), **(schema.get("settings") or {})}
    errors.extend(validate_theme_settings(theme))

    # Questions
    questions = schema.get("questions")
    if questions is None:
        errors.append(SurveyValidationError(message="Survey must contain a 'questions' array"))
        return SurveyValidationResult(valid=False, errors=errors)
    if not isinstance(questions, list):
        errors.append(SurveyValidationError(message="'questions' must be an array"))
        return SurveyValidationResult(valid=False, errors=errors)

    seen_ids: set[str] = set()
    for i, q in enumerate(questions):
        if not isinstance(q, dict):
            continue
        pos = f"Question {i + 1}"
        q_id = q.get("id")
        q_type = q.get("type")
        q_title = q.get("title")

        if not q_id:
            errors.append(SurveyValidationError(question_id=pos, message="missing 'id'"))
        elif q_id in seen_ids:
            errors.append(SurveyValidationError(question_id=str(q_id), message=f"duplicate id '{q_id}'"))
        else:
            seen_ids.add(str(q_id))

        if not q_type:
            errors.append(SurveyValidationError(question_id=str(q_id) if q_id else pos, message="missing 'type'"))
        elif q_type not in valid_question_types:
            errors.append(SurveyValidationError(question_id=str(q_id) if q_id else pos, message=f"unsupported type '{q_type}'"))
        else:
            # Validate question settings (merge question-level optional into settings for validation)
            settings = dict(q.get("settings") or {})
            if "optional" not in settings:
                settings["optional"] = q.get("optional", False)
            defs = question_type_schemas.get(q_type, [])
            defs_dict = [
                {
                    "setting_key": d.get("setting_key"),
                    "key": d.get("setting_key"),
                    "required": d.get("required"),
                    "allowed_values": d.get("allowed_values"),
                    "setting_type": d.get("setting_type"),
                    "validation_rules": d.get("validation_rules"),
                }
                for d in defs
            ]
            errors.extend(validate_question_settings(str(q_id) if q_id else pos, q_type, settings, defs_dict))

        if not q_title:
            errors.append(SurveyValidationError(question_id=str(q_id) if q_id else pos, message="missing 'title'"))

    return SurveyValidationResult(valid=len(errors) == 0, errors=errors)
