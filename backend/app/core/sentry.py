"""Sentry initialisation.

Call init_sentry() exactly once, before constructing the FastAPI application,
so that the SDK can instrument all subsequent imports and middleware.
"""
import logging
from typing import Any

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from .config import settings
from .logging_config import request_id_var, user_id_var

logger = logging.getLogger(__name__)


_ERROR_LEVELS = {"error", "fatal"}


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """Drop non-error events; inject request_id and user_id into all errors.

    Returning None silently discards the event. This is the final gate that
    ensures only ERROR/FATAL events ever leave the process, regardless of how
    they were captured.
    """
    if event.get("level") not in _ERROR_LEVELS:
        return None

    req_id = request_id_var.get("")
    if req_id:
        event.setdefault("tags", {})["request_id"] = req_id

    user_id = user_id_var.get("")
    if user_id:
        event.setdefault("user", {}).setdefault("id", user_id)

    return event


def init_sentry() -> None:
    """Initialise Sentry if SENTRY_DSN is present in the environment.

    Safe to call unconditionally — does nothing when the DSN is absent,
    so local dev and test runs are completely unaffected.
    """
    if not settings.sentry_dsn:
        logger.debug("SENTRY_DSN not set — Sentry is disabled.")
        return

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        # Traces are performance data, not errors — disable entirely.
        traces_sample_rate=0.0,
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
            # Only promote ERROR+ log records to Sentry events; WARNING and
            # below are captured as breadcrumbs only (the SDK default).
            LoggingIntegration(level=logging.WARNING, event_level=logging.ERROR),
        ],
        send_default_pii=False,
        before_send=_before_send,
    )
    logger.info(
        "sentry_initialised",
        extra={
            "event_type": "sentry_initialised",
            "environment": settings.environment,
        },
    )
