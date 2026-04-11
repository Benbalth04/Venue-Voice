"""Request logging and tracing middleware.

Generates a unique request_id for every HTTP request, propagates it via a
ContextVar so every log line within that request carries the same ID, stamps
the Sentry scope, and emits structured INFO logs at request start and end
(including latency_ms and status_code).

The X-Request-ID response header is set so clients and API gateways can
correlate their own logs with backend Loki traces.

Skipped paths
-------------
/health and / requests are intentionally not logged to keep Loki free of
uptime-checker noise. OPTIONS preflight requests are handled separately
(see below) — they get their own trace log without generating a request_id.

Middleware layers
-----------------
RequestLoggingMiddleware  — outermost; sees every request before CORS runs.
                            Logs event_type=cors_preflight_arrived for OPTIONS,
                            event_type=request_started for everything else.

CORSMiddleware            — Starlette built-in; short-circuits OPTIONS and
                            returns 400 when the origin is not in allow_origins.

PostCORSMiddleware        — innermost; only reached when CORS has passed.
                            Logs event_type=request_passed_cors so you can
                            confirm the request made it through CORS.
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
        # ------------------------------------------------------------------
        # OPTIONS preflight: log before and after CORS handling so we can
        # see exactly what arrives and whether CORS accepted or rejected it.
        # No request_id is generated — preflights are stateless probes.
        # ------------------------------------------------------------------
        if request.method == "OPTIONS":
            logger.info(
                "cors_preflight_arrived",
                extra={
                    "event_type": "cors_preflight_arrived",
                    "layer": "pre_cors",
                    "method": "OPTIONS",
                    "path": request.url.path,
                    "origin": request.headers.get("origin"),
                    "access_control_request_method": request.headers.get("access-control-request-method"),
                    "access_control_request_headers": request.headers.get("access-control-request-headers"),
                },
            )
            response = await call_next(request)
            cors_rejected = response.status_code == 400
            log_fn = logger.warning if cors_rejected else logger.info
            log_fn(
                "cors_preflight_response",
                extra={
                    "event_type": "cors_preflight_response",
                    "layer": "pre_cors",
                    "method": "OPTIONS",
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "cors_rejected": cors_rejected,
                    "allow_origin": response.headers.get("access-control-allow-origin"),
                    "allow_methods": response.headers.get("access-control-allow-methods"),
                    "allow_headers": response.headers.get("access-control-allow-headers"),
                },
            )
            return response

        # Skip health-check noise.
        if request.url.path in _SKIP_PATHS:
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
                "layer": "pre_cors",
                "method": request.method,
                "path": request.url.path,
                "query": str(request.url.query) or None,
                "origin": request.headers.get("origin"),
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


class PostCORSMiddleware(BaseHTTPMiddleware):
    """Sits between CORSMiddleware and the route handlers.

    A log entry here means the request survived CORS validation. If you see
    cors_preflight_arrived but no request_passed_cors, CORS rejected the
    request before it reached this layer.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        logger.info(
            "request_passed_cors",
            extra={
                "event_type": "request_passed_cors",
                "layer": "post_cors",
                "method": request.method,
                "path": request.url.path,
                "origin": request.headers.get("origin"),
            },
        )
        return await call_next(request)
