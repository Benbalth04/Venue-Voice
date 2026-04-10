"""Redis-based rate limiting helpers for public endpoints."""

import logging

import redis as redis_lib
from fastapi import Request

from .config import settings
from .errors.exceptions import RateLimitExceededError

logger = logging.getLogger(__name__)

_redis_client: redis_lib.Redis | None = None


def get_redis() -> redis_lib.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis_lib.from_url(settings.redis_url, decode_responses=True)
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


def check_user_rate_limit(user_id: str, endpoint: str, limit: int, window: int) -> None:
    """
    Enforce `limit` requests per `window` seconds for `user_id` on `endpoint`.
    Raises RateLimitExceededError (HTTP 429) when the limit is exceeded.

    Use for authenticated admin actions where per-user rather than per-IP
    limiting is appropriate (shared offices, proxies, load balancers).
    """
    key = f"rate_limit_user:{endpoint}:{user_id}"
    r = get_redis()
    count = r.incr(key)
    if count == 1:
        r.expire(key, window)
    if count > limit:
        raise RateLimitExceededError()
