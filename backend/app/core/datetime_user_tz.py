"""UTC-naive DB instants → user timezone for JSON and local calendar bounds for queries.

Naive datetimes from the ORM are treated as UTC wall time (see project conventions).
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, literal_column
from sqlalchemy.sql import func

from .timezone_australia import AUSTRALIA_TIMEZONE_IDS, DEFAULT_USER_TIMEZONE


def assume_utc(dt: datetime | None) -> datetime | None:
    """Normalize to timezone-aware UTC. Naive values are interpreted as UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=dt_timezone.utc)
    return dt.astimezone(dt_timezone.utc)


def to_iso8601_zoned(dt: datetime | None, tz: ZoneInfo) -> str | None:
    """Format instant in the user's zone with numeric offset (for JSON)."""
    if dt is None:
        return None
    utc = assume_utc(dt)
    if utc is None:
        return None
    local = utc.astimezone(tz)
    # Preserve microseconds so optimistic-lock fields (e.g. updated_at) round-trip
    # through JSON without StaleObjectError when DB timestamps have sub-second precision.
    return local.isoformat(timespec="microseconds")


def local_date_start_utc(d: date, tz: ZoneInfo) -> datetime:
    """Start of calendar day `d` in `tz`, as aware UTC."""
    local_midnight = datetime.combine(d, time.min, tzinfo=tz)
    return local_midnight.astimezone(dt_timezone.utc)


def local_date_end_exclusive_utc(d: date, tz: ZoneInfo) -> datetime:
    """Start of the *next* calendar day in `tz`, as aware UTC (half-open range end)."""
    return local_date_start_utc(d + timedelta(days=1), tz)


def inclusive_local_date_range_to_utc_bounds(
    start: date,
    end: date,
    tz: ZoneInfo,
) -> tuple[datetime, datetime]:
    """Half-open UTC range [utc_start, utc_end) covering inclusive local dates start..end."""
    if end < start:
        raise ValueError("end date before start date")
    utc_start = local_date_start_utc(start, tz)
    utc_end_excl = local_date_start_utc(end + timedelta(days=1), tz)
    return utc_start, utc_end_excl


def naive_utc_for_sql(dt: datetime) -> datetime:
    """Strip tz for comparing to TIMESTAMP WITHOUT TIME ZONE columns storing UTC."""
    aware = assume_utc(dt)
    if aware is None:
        raise ValueError("datetime required")
    return aware.astimezone(dt_timezone.utc).replace(tzinfo=None)


def _zone_abbreviation(local_dt: datetime, zone: ZoneInfo) -> str:
    """Best-effort short zone label for transactional email copy."""
    abbr = (local_dt.strftime("%Z") or "").strip()
    if abbr:
        return abbr
    return zone.key.split("/")[-1].replace("_", " ")


def format_utc_instant_for_email_datetime(dt: datetime | None, tz: ZoneInfo) -> str | None:
    """Format a UTC instant (naive = UTC wall) as local date, time, and zone abbrev."""
    utc = assume_utc(dt)
    if utc is None:
        return None
    local = utc.astimezone(tz)
    abbr = _zone_abbreviation(local, tz)
    return f"{local.strftime('%d %b %Y, %H:%M')} {abbr}"


def format_utc_instant_for_email_date_only(dt: datetime | None, tz: ZoneInfo) -> str | None:
    """Format a UTC instant as the calendar date in ``tz`` (avoids UTC day-boundary skew)."""
    utc = assume_utc(dt)
    if utc is None:
        return None
    local = utc.astimezone(tz)
    return local.strftime("%d %b %Y")


def format_unix_epoch_for_email_datetime(unix_ts: int | None, tz: ZoneInfo) -> str | None:
    """Unix epoch seconds (Stripe-style) → local datetime string for emails."""
    if unix_ts is None or unix_ts <= 0:
        return None
    try:
        dt_utc = datetime.fromtimestamp(unix_ts, tz=dt_timezone.utc)
    except (OSError, ValueError, OverflowError):
        return None
    return format_utc_instant_for_email_datetime(dt_utc, tz)


def format_unix_epoch_for_email_date_only(unix_ts: int | None, tz: ZoneInfo) -> str | None:
    """Unix epoch seconds → local calendar date string for emails."""
    if unix_ts is None or unix_ts <= 0:
        return None
    try:
        dt_utc = datetime.fromtimestamp(unix_ts, tz=dt_timezone.utc)
    except (OSError, ValueError, OverflowError):
        return None
    return format_utc_instant_for_email_date_only(dt_utc, tz)


def user_local_date_sql(column: ColumnElement[Any], tz: ZoneInfo) -> ColumnElement[Any]:
    """PostgreSQL expression: calendar date in user's zone for a column stored as UTC-naive."""
    k = tz.key
    if k not in AUSTRALIA_TIMEZONE_IDS:
        k = DEFAULT_USER_TIMEZONE
    return func.date(
        func.timezone(
            k,
            column.op("AT TIME ZONE")(literal_column("'UTC'")),
        )
    )
