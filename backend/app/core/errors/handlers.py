from fastapi import Request
from fastapi.responses import JSONResponse
import traceback

from .app_error import AppError


async def app_error_handler(request: Request, exc: AppError):
    # Print structured, readable error info
    print("=" * 50)
    print("\n[AppError]")
    print(f"Path: {request.url.path}")
    print(f"Category: {exc.category}")
    print(f"Code: {exc.code}")
    print(f"Message: {exc.message}")
    print(f"Details: {exc.details}\n")
    print("=" * 50)

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


async def generic_exception_handler(request: Request, exc: Exception):
    # Print full stack trace for debugging
    print("=" * 50)
    print("\n[Unhandled Exception]")
    print(f"Path: {request.url.path}")
    traceback.print_exc()
    print("\n")
    print("=" * 50)

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