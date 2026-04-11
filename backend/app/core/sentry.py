"""Sentry initialisation.

Call init_sentry() exactly once, before constructing the FastAPI application,
so that the SDK can instrument all subsequent imports and middleware.
"""
import logging
from typing import Any

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from .config import settings
from .logging_config import request_id_var, user_id_var

logger = logging.getLogger(__name__)


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """Inject request_id and user_id into every outbound Sentry event.

    This acts as a failsafe: even when the error is auto-captured by the SDK
    (rather than going through our handlers.py), the event will still carry
    the request_id needed to correlate it with Loki logs.
    """
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
        traces_sample_rate=settings.sentry_traces_sample_rate,
        integrations=[
            # StarletteIntegration instruments the ASGI request lifecycle;
            # FastApiIntegration adds FastAPI-specific span/transaction naming.
            StarletteIntegration(),
            FastApiIntegration(),
        ],
        # Never auto-attach PII (emails, IPs) — add user context explicitly
        # via push_scope() in the handlers if/when needed.
        send_default_pii=False,
        # Stamp every event with request_id so Sentry events are always
        # traceable to a Loki log stream via the shared request_id field.
        before_send=_before_send,
    )
    logger.info(
        "sentry_initialised",
        extra={
            "event_type": "sentry_initialised",
            "environment": settings.environment,
            "traces_sample_rate": settings.sentry_traces_sample_rate,
        },
    )
