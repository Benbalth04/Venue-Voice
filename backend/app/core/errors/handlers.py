import logging

import sentry_sdk
from fastapi import Request
from fastapi.responses import JSONResponse

from .app_error import AppError

logger = logging.getLogger(__name__)

# AppErrors with status_code at or above this threshold are unexpected server
# failures and should be reported to Sentry. All 4xx errors are user-caused
# and are intentionally excluded to keep Sentry noise low.
_SERVER_ERROR_THRESHOLD = 500


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    if exc.status_code >= _SERVER_ERROR_THRESHOLD:
        logger.error(
            "[AppError] path=%s category=%s code=%s message=%s details=%s",
            request.url.path,
            exc.category,
            exc.code,
            exc.message,
            exc.details,
        )
        # Capture server-side AppErrors (5xx) with full context so they
        # appear in Sentry with meaningful tags for triage.
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("error.category", str(exc.category))
            scope.set_tag("error.code", exc.code)
            scope.set_context("app_error", {
                "path": request.url.path,
                "category": str(exc.category),
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            })
            sentry_sdk.capture_exception(exc)
    else:
        # 4xx errors are expected/user-caused — log at WARNING, skip Sentry.
        logger.warning(
            "[AppError] path=%s category=%s code=%s message=%s",
            request.url.path,
            exc.category,
            exc.code,
            exc.message,
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
    # logger.exception() logs at ERROR level and appends the full traceback,
    # matching the previous traceback.print_exc() behaviour.
    logger.exception("[Unhandled Exception] path=%s", request.url.path)

    # All unhandled exceptions reaching this handler are unexpected — capture
    # every one with request context to aid debugging.
    with sentry_sdk.push_scope() as scope:
        scope.set_context("request_info", {
            "path": request.url.path,
            "method": request.method,
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
