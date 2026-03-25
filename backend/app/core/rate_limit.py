"""Redis-based rate limiting helpers for public endpoints."""

import os
import logging

import redis as redis_lib
from fastapi import Request

from .errors.exceptions import RateLimitExceededError

logger = logging.getLogger(__name__)

_redis_client: redis_lib.Redis | None = None


def get_redis() -> redis_lib.Redis:
    global _redis_client
    if _redis_client is None:
        url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        _redis_client = redis_lib.from_url(url, decode_responses=True)
    return _redis_client


def _get_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def check_rate_limit(request: Request, endpoint: str, limit: int, window: int) -> None:
    """
    Enforce `limit` requests per `window` seconds for the caller's IP on `endpoint`.
    Raises RateLimitExceededError (HTTP 429) when the limit is exceeded.
    """
    ip = _get_ip(request)
    key = f"rate_limit:{endpoint}:{ip}"
    r = get_redis()
    count = r.incr(key)
    if count == 1:
        r.expire(key, window)
    if count > limit:
        raise RateLimitExceededError()


def check_qr_rate_limit(request: Request, qr_id: str) -> None:
    """
    Enforce max 10 scans per minute per QR code per IP.
    Raises RateLimitExceededError (HTTP 429) when the limit is exceeded.
    """
    ip = _get_ip(request)
    key = f"qr_scan:{qr_id}:{ip}"
    r = get_redis()
    count = r.incr(key)
    if count == 1:
        r.expire(key, 60)
    if count > 10:
        raise RateLimitExceededError()
