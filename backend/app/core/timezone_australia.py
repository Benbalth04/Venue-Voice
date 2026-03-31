"""Australian IANA timezones allowed for user profiles (onboarding + settings)."""

from __future__ import annotations

import logging
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .errors.exceptions import ValidationError

logger = logging.getLogger(__name__)

DEFAULT_USER_TIMEZONE = "Australia/Sydney"

# Curated Australian zones (IANA). Keep in sync with frontend/lib/timezone/australia.ts
AUSTRALIA_TIMEZONE_IDS: frozenset[str] = frozenset(
    {
        "Australia/Sydney",
        "Australia/Melbourne",
        "Australia/Brisbane",
        "Australia/Perth",
        "Australia/Adelaide",
        "Australia/Darwin",
        "Australia/Hobart",
        "Australia/Broken_Hill",
        "Australia/Eucla",
        "Australia/Lord_Howe",
        "Australia/Lindeman",
        "Australia/Currie",
    }
)


def assert_allowed_timezone_string(tz_name: str) -> str:
    """Return stripped tz_name if allowlisted; raises ValidationError otherwise."""
    cleaned = (tz_name or "").strip()
    if cleaned not in AUSTRALIA_TIMEZONE_IDS:
        raise ValidationError(
            code="INVALID_TIMEZONE",
            message="Timezone must be one of the supported Australian regions.",
            details={"allowed_sample": sorted(AUSTRALIA_TIMEZONE_IDS)[:5]},
        )
    return cleaned


def resolve_zoneinfo(tz_name: str) -> ZoneInfo:
    """Validate allowlist and construct ZoneInfo."""
    cleaned = assert_allowed_timezone_string(tz_name)
    try:
        return ZoneInfo(cleaned)
    except ZoneInfoNotFoundError as e:
        raise ValidationError(
            code="INVALID_TIMEZONE",
            message=f"Unknown timezone: {cleaned}",
        ) from e


def effective_zoneinfo_for_stored_timezone(stored: str | None) -> ZoneInfo:
    """Read path: never raise; fall back to default if missing or invalid."""
    if stored and stored.strip() in AUSTRALIA_TIMEZONE_IDS:
        try:
            return ZoneInfo(stored.strip())
        except ZoneInfoNotFoundError:
            pass
    if stored and stored.strip():
        logger.warning("Invalid user timezone %r, using %s", stored, DEFAULT_USER_TIMEZONE)
    return ZoneInfo(DEFAULT_USER_TIMEZONE)
