"""Structured JSON logging configuration.

Call configure_logging() once at application startup (before Sentry init and
before the FastAPI app is created) to attach a JSON formatter to the root
logger. After that, every logger.info / warning / error call in any module
will emit a single JSON object to stdout — ready for Fluent Bit ingestion into
Loki/Grafana.

Context propagation
-------------------
Two ContextVars carry per-request metadata across the async call stack:

    request_id_var  — UUID set by RequestLoggingMiddleware on every HTTP request
                      (or a job_id set by background scheduled tasks)
    user_id_var     — Supabase user UUID set after successful JWT verification

Because Python copies the contextvars context into child coroutines and tasks
(PEP 567 / asyncio.create_task semantics), background tasks spawned via
FastAPI's BackgroundTasks within a request automatically inherit the same IDs.

Usage
-----
    from app.core.logging_config import request_id_var, user_id_var
    request_id_var.set("some-uuid")  # done by middleware
    user_id_var.set("usr_abc")       # done by auth layer
"""

import json
import logging
import sys
import traceback
from contextvars import ContextVar
from datetime import datetime, timezone

from .config import settings

# ---------------------------------------------------------------------------
# Context variables — propagated across the async request lifecycle
# ---------------------------------------------------------------------------

request_id_var: ContextVar[str] = ContextVar("request_id", default="")
user_id_var: ContextVar[str] = ContextVar("user_id", default="")

# ---------------------------------------------------------------------------
# Internal constants
# ---------------------------------------------------------------------------

_SERVICE_NAME = "venue-voice-backend"

# Standard LogRecord attributes we do NOT want to copy into the JSON payload
# as top-level extra fields (they are noise or already represented).
_STANDARD_LOG_ATTRS: frozenset[str] = frozenset(
    {
        "args",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "message",
        "module",
        "msecs",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "taskName",
        "thread",
        "threadName",
    }
)


# ---------------------------------------------------------------------------
# JSON formatter
# ---------------------------------------------------------------------------


class JSONFormatter(logging.Formatter):
    """Emit one JSON object per line, compatible with Loki label extraction."""

    def format(self, record: logging.LogRecord) -> str:
        # Resolve the human-readable message first (handles % formatting).
        record.message = record.getMessage()

        entry: dict = {
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "message": record.message,
            "service": _SERVICE_NAME,
            "environment": settings.environment,
            "logger": record.name,
            "request_id": request_id_var.get("") or None,
            "user_id": user_id_var.get("") or None,
        }

        # Merge any extra={} fields passed at the call site.
        for key, val in record.__dict__.items():
            if key not in _STANDARD_LOG_ATTRS and not key.startswith("_") and key not in entry:
                entry[key] = val

        # Attach a compact exception summary when present.  Full stack traces
        # live in Sentry; we keep logs concise to avoid Loki ingest bloat.
        if record.exc_info:
            entry["exception"] = traceback.format_exception_only(
                record.exc_info[0], record.exc_info[1]
            )[0].strip()
            # Include a short traceback (last 3 frames) so logs are still
            # useful standalone without requiring a Sentry lookup.
            entry["traceback_summary"] = "".join(
                traceback.format_tb(record.exc_info[2])[-3:]
            ).strip()

        return json.dumps(entry, default=str)


# ---------------------------------------------------------------------------
# Setup function
# ---------------------------------------------------------------------------


def configure_logging() -> None:
    """Attach the JSON formatter to the root logger.

    Should be called exactly once at startup, before Sentry is initialised and
    before the FastAPI application object is constructed.
    """
    log_level = logging.DEBUG if settings.environment == "development" else logging.INFO

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())

    root = logging.getLogger()
    root.setLevel(log_level)

    # Replace any existing handlers (e.g. uvicorn's default plain-text ones)
    # so we get a single, clean JSON stream.
    root.handlers.clear()
    root.addHandler(handler)

    # Silence noisy third-party loggers that would otherwise flood Loki.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.WARNING)
