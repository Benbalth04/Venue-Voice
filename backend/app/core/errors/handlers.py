import logging

import sentry_sdk
from fastapi import Request
from fastapi.responses import JSONResponse

from .app_error import AppError
from ..logging_config import request_id_var, user_id_var

logger = logging.getLogger(__name__)

# AppErrors with status_code at or above this threshold are unexpected server
# failures and should be reported to Sentry. All 4xx errors are user-caused
# and are intentionally excluded to keep Sentry noise low.
_SERVER_ERROR_THRESHOLD = 500


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    req_id = request_id_var.get("") or None
    user_id = user_id_var.get("") or None

    if exc.status_code >= _SERVER_ERROR_THRESHOLD:
        logger.error(
            "app_error",
            extra={
                "event_type": "app_error",
                "request_id": req_id,
                "user_id": user_id,
                "path": request.url.path,
                "method": request.method,
                "error_category": str(exc.category),
                "error_code": exc.code,
                "status_code": exc.status_code,
                "error_message": exc.message,
                "details": exc.details,
            },
        )
        # Capture server-side AppErrors (5xx) with full context so they
        # appear in Sentry with meaningful tags for triage and can be
        # correlated to Loki via the shared request_id.
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("request_id", req_id or "")
            scope.set_tag("error.category", str(exc.category))
            scope.set_tag("error.code", exc.code)
            if user_id:
                scope.set_user({"id": user_id})
            scope.set_context("app_error", {
                "path": request.url.path,
                "method": request.method,
                "category": str(exc.category),
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
                "request_id": req_id,
            })
            sentry_sdk.capture_exception(exc)
    else:
        # 4xx errors are expected/user-caused — log at WARNING, skip Sentry.
        logger.warning(
            "app_error",
            extra={
                "event_type": "app_error",
                "request_id": req_id,
                "user_id": user_id,
                "path": request.url.path,
                "method": request.method,
                "error_category": str(exc.category),
                "error_code": exc.code,
                "status_code": exc.status_code,
                "error_message": exc.message,
            },
        )

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "category": exc.category,
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            }
        },
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    req_id = request_id_var.get("") or None
    user_id = user_id_var.get("") or None

    logger.error(
        "unhandled_exception",
        extra={
            "event_type": "unhandled_exception",
            "request_id": req_id,
            "user_id": user_id,
            "path": request.url.path,
            "method": request.method,
            "exception_type": type(exc).__name__,
        },
        exc_info=True,
    )

    # All unhandled exceptions reaching this handler are unexpected — capture
    # every one with request context to aid debugging in Sentry.
    with sentry_sdk.push_scope() as scope:
        scope.set_tag("request_id", req_id or "")
        if user_id:
            scope.set_user({"id": user_id})
        scope.set_context("request_info", {
            "path": request.url.path,
            "method": request.method,
            "request_id": req_id,
        })
        sentry_sdk.capture_exception(exc)

    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "category": "unknown",
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Something went wrong",
                "details": {},
            }
        },
    )
