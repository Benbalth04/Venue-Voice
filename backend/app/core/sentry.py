"""Sentry initialisation.

Call init_sentry() exactly once, before constructing the FastAPI application,
so that the SDK can instrument all subsequent imports and middleware.
"""
import logging

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from .config import settings

logger = logging.getLogger(__name__)


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
    )
    logger.info(
        "Sentry initialised (environment=%s, traces_sample_rate=%s)",
        settings.environment,
        settings.sentry_traces_sample_rate,
    )
