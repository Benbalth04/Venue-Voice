"""FastAPI dependency: resolved ZoneInfo for the authenticated user."""

from __future__ import annotations

from zoneinfo import ZoneInfo

from fastapi import Depends

from ..core.datetime_user_tz import to_iso8601_zoned
from ..core.timezone_australia import effective_zoneinfo_for_stored_timezone
from ..models.postgres_model import User as UserORM
from .jwt import get_current_user


def get_user_zoneinfo(user: UserORM = Depends(get_current_user)) -> ZoneInfo:
    return effective_zoneinfo_for_stored_timezone(user.timezone)


def format_dt_for_user(dt, user_tz: ZoneInfo) -> str | None:
    """Serialize ORM datetime for authenticated JSON responses."""
    return to_iso8601_zoned(dt, user_tz)
