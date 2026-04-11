"""Request logging and tracing middleware.

Generates a unique request_id for every HTTP request, propagates it via a
ContextVar so every log line within that request carries the same ID, stamps
the Sentry scope, and emits structured INFO logs at request start and end
(including latency_ms and status_code).

The X-Request-ID response header is set so clients and API gateways can
correlate their own logs with backend Loki traces.

Skipped paths
-------------
/health and OPTIONS requests are intentionally not logged to keep Loki free
of uptime-checker noise.
"""

import logging
import time
import uuid

import sentry_sdk
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from ..core.logging_config import request_id_var

logger = logging.getLogger(__name__)

_SKIP_PATHS: frozenset[str] = frozenset({"/health", "/"})


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip noisy / non-meaningful paths.
        if request.method == "OPTIONS" or request.url.path in _SKIP_PATHS:
            return await call_next(request)

        # ------------------------------------------------------------------
        # 1. Generate and propagate request_id
        # ------------------------------------------------------------------
        request_id = str(uuid.uuid4())
        request_id_var.set(request_id)

        # Stamp the current Sentry scope so every auto-captured event on this
        # request carries the same request_id — even before handlers.py runs.
        sentry_sdk.set_tag("request_id", request_id)

        # ------------------------------------------------------------------
        # 2. Log request start
        # ------------------------------------------------------------------
        logger.info(
            "request_started",
            extra={
                "event_type": "request_started",
                "method": request.method,
                "path": request.url.path,
                "query": str(request.url.query) or None,
                "user_agent": request.headers.get("user-agent"),
                "client_ip": (request.client.host if request.client else None),
            },
        )

        # ------------------------------------------------------------------
        # 3. Process request and measure latency
        # ------------------------------------------------------------------
        start = time.perf_counter()
        response = await call_next(request)
        latency_ms = round((time.perf_counter() - start) * 1000, 2)

        # ------------------------------------------------------------------
        # 4. Log request end
        # ------------------------------------------------------------------
        log_fn = logger.warning if response.status_code >= 400 else logger.info
        log_fn(
            "request_completed",
            extra={
                "event_type": "request_completed",
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "latency_ms": latency_ms,
            },
        )

        # ------------------------------------------------------------------
        # 5. Expose request_id to callers via response header
        # ------------------------------------------------------------------
        response.headers["X-Request-ID"] = request_id
        return response
