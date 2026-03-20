"""
Centralised OpenAI client for sentiment analysis using Responses API.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

from openai import OpenAI, APITimeoutError, APIError

from .errors.exceptions import ExternalAPIError

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a strict sentiment classification engine.\n"
    "\n"
    "Task:\n"
    "Classify the sentiment of the user text.\n"
    "\n"
    "Rules:\n"
    "- Output ONLY a valid JSON object.\n"
    "- Do NOT include markdown, explanations, or extra text.\n"
    "- Do NOT include any keys other than 'sentiment' and 'score'.\n"
    "- 'sentiment' must be exactly one of: positive, neutral, negative.\n"
    "- 'score' must be a number between -1 and 1.\n"
    "- Use negative values for negative sentiment, positive values for positive sentiment.\n"
    "- If the sentiment is mixed, unclear, or balanced, return 'neutral'.\n"
    "- Keep the score proportional to strength (e.g., strong negative ≈ -0.8 to -1, mild ≈ -0.2).\n"
    "- Always include both keys.\n"
    "- Never return null.\n"
    "\n"
    "Output format example:\n"
    '{"sentiment": "neutral", "score": 0.0}'
)

_MAX_USER_CHARS = 12_000
_DEFAULT_MODEL = "gpt-4o-mini"
_ATTEMPTS = 2
_TIMEOUT_SEC = 5.0

_client: OpenAI | None = None


def get_openai_client() -> OpenAI:
    global _client
    if _client is None:
        key = os.getenv("OPENAI_API_KEY")
        if not key:
            raise ExternalAPIError(
                service_name="openai",
                error_message="OPENAI_API_KEY is not configured",
                code="OPENAI_NOT_CONFIGURED",
                status_code=503,
            )
        _client = OpenAI(api_key=key, timeout=_TIMEOUT_SEC, max_retries=0)
    return _client


def _normalize_user_text(text: str) -> str:
    s = (text or "").strip()
    if len(s) > _MAX_USER_CHARS:
        return s[:_MAX_USER_CHARS]
    return s


def build_stored_prompt(user_text: str) -> str:
    """Full prompt text persisted with each analysis row (audit / debug)."""
    u = _normalize_user_text(user_text)
    return f"{SYSTEM_PROMPT}\n---\n{u}"


def _validate_result(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("response is not a JSON object")
    sent = data.get("sentiment")
    score = data.get("score")
    if sent not in ("positive", "neutral", "negative"):
        raise ValueError("invalid or missing sentiment")
    if not isinstance(score, (int, float)):
        raise ValueError("invalid or missing score")
    fscore = float(score)
    if fscore < -1.0 or fscore > 1.0:
        raise ValueError("score out of range")
    return {"sentiment": sent, "score": fscore}


def analyze_sentiment(text: str) -> tuple[dict[str, Any], str]:
    """
    Call OpenAI Responses API to classify sentiment.
    Enforces 5s timeout per attempt, one retry on failure.
    Returns ({"sentiment": str, "score": float}, raw_model_content).
    """
    user_content = _normalize_user_text(text)
    if not user_content or len(user_content) < 5:
        raise ValueError("text is empty or too short for analysis")

    model = os.getenv("OPENAI_SENTIMENT_MODEL", _DEFAULT_MODEL)
    client = get_openai_client()
    last_err: Exception | None = None

    prompt = build_stored_prompt(user_content)  

    for attempt in range(_ATTEMPTS):
        try:
            response = client.responses.create(
                model=model,
                input= prompt
            )
            # Convert the response to a JSON string
            response_json_str = response.model_dump_json()

            # Parse the string into a Python dictionary
            response_json = json.loads(response_json_str)

            raw_stripped = response_json["output"][0]["content"][0]["text"]
            if raw_stripped is None:
                raise ValueError("empty model content")

            # Parse the raw string into a Python dict
            try:
                raw_dict = json.loads(raw_stripped)
            except json.JSONDecodeError as e:
                raise ValueError(f"response is not a JSON object: {raw_stripped}") from e

            validated = _validate_result(raw_dict)
            return validated, json.dumps(raw_stripped)
        except APITimeoutError as e:
            last_err = e
            logger.warning("OpenAI timeout (attempt %s/%s)", attempt + 1, _ATTEMPTS)
        except APIError as e:
            last_err = e
            logger.warning(
                "OpenAI API error (attempt %s/%s): %s",
                attempt + 1,
                _ATTEMPTS,
                e,
            )
        except (json.JSONDecodeError, ValueError, KeyError, IndexError, TypeError) as e:
            last_err = e
            logger.warning(
                "Invalid OpenAI response (attempt %s/%s): %s",
                attempt + 1,
                _ATTEMPTS,
                e,
            )

    msg = str(last_err) if last_err else "unknown error"
    raise ExternalAPIError(
        service_name="openai",
        error_message=msg,
        code="OPENAI_SENTIMENT_FAILED",
        status_code=502,
    )