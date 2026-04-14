"""Lightweight observability helpers for tracking external API call latency."""
from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from typing import Generator

logger = logging.getLogger(__name__)


@contextmanager
def track_external_call(service: str, operation: str) -> Generator[None, None, None]:
    """Context manager that logs latency and status for an external API call.

    Emits a structured log line with event_type="external_api_call" on exit,
    whether the block succeeds or raises.

    Usage::

        with track_external_call("openai", "sentiment_analysis"):
            result = client.responses.create(...)
    """
    start = time.perf_counter()
    status = "success"
    try:
        yield
    except Exception:
        status = "error"
        raise
    finally:
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.info(
            "external_api_call",
            extra={
                "event_type": "external_api_call",
                "api_service": service,
                "api_operation": operation,
                "latency_ms": latency_ms,
                "status": status,
            },
        )
