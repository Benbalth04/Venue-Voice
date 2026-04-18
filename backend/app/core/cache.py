"""Redis cache helpers. All functions swallow Redis errors so cache failures never break requests."""

import logging

from .rate_limit import get_redis

logger = logging.getLogger(__name__)


def cache_get(key: str) -> str | None:
    try:
        return get_redis().get(key)
    except Exception:
        logger.warning("cache_get failed key=%s", key, exc_info=True)
        return None


def cache_set(key: str, value: str, ttl: int) -> None:
    try:
        get_redis().setex(key, ttl, value)
    except Exception:
        logger.warning("cache_set failed key=%s", key, exc_info=True)


def cache_delete(key: str) -> None:
    try:
        get_redis().delete(key)
    except Exception:
        logger.warning("cache_delete failed key=%s", key, exc_info=True)


def cache_delete_pattern(pattern: str) -> None:
    """Delete all keys matching pattern using SCAN (safe for production)."""
    try:
        r = get_redis()
        cursor = 0
        to_delete: list[str] = []
        while True:
            cursor, keys = r.scan(cursor, match=pattern, count=100)
            to_delete.extend(keys)
            if cursor == 0:
                break
        if to_delete:
            r.delete(*to_delete)
    except Exception:
        logger.warning("cache_delete_pattern failed pattern=%s", pattern, exc_info=True)
