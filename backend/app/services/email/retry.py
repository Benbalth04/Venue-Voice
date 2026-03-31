from __future__ import annotations

import logging
import time
from typing import Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

DEFAULT_MAX_ATTEMPTS = 5
DEFAULT_BASE_DELAY_SEC = 1.0


def call_with_exponential_backoff(
    fn: Callable[[], T],
    *,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    base_delay_sec: float = DEFAULT_BASE_DELAY_SEC,
    operation_name: str = "operation",
) -> T:
    """Run ``fn``; on failure retry with delays base_delay * 2**attempt (1s, 2s, 4s, 8s, …)."""
    last_exc: BaseException | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except BaseException as exc:
            last_exc = exc
            if attempt >= max_attempts:
                break
            delay = base_delay_sec * (2 ** (attempt - 1))
            logger.warning(
                "%s failed attempt %d/%d: %s — retrying in %.1fs",
                operation_name,
                attempt,
                max_attempts,
                exc,
                delay,
            )
            time.sleep(delay)
    assert last_exc is not None
    raise last_exc
