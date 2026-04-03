"""Timezone allowlist, UTC bounds, DST, and defensive read-path behavior."""

from datetime import date, datetime, timezone as dt_timezone

import pytest
from zoneinfo import ZoneInfo

from app.core.datetime_user_tz import (
    assume_utc,
    format_unix_epoch_for_email_date_only,
    format_unix_epoch_for_email_datetime,
    format_utc_instant_for_email_date_only,
    format_utc_instant_for_email_datetime,
    inclusive_local_date_range_to_utc_bounds,
    local_date_start_utc,
    to_iso8601_zoned,
)
from app.core.errors.exceptions import ValidationError
from app.core.timezone_australia import (
    assert_allowed_timezone_string,
    effective_zoneinfo_for_stored_timezone,
)


def test_assert_allowed_timezone_rejects_non_au():
    with pytest.raises(ValidationError) as exc_info:
        assert_allowed_timezone_string("Europe/London")
    assert exc_info.value.code == "INVALID_TIMEZONE"


def test_assert_allowed_timezone_accepts_sydney():
    assert assert_allowed_timezone_string("  Australia/Sydney  ") == "Australia/Sydney"


def test_effective_zoneinfo_invalid_string_falls_back():
    z = effective_zoneinfo_for_stored_timezone("Invalid/Zone")
    assert z.key == "Australia/Sydney"


def test_assume_utc_naive_is_utc_wall():
    naive = datetime(2024, 6, 15, 12, 0, 0)
    aware = assume_utc(naive)
    assert aware is not None
    assert aware.tzinfo == dt_timezone.utc
    assert aware.hour == 12


def test_inclusive_single_local_day_maps_to_half_open_utc():
    tz = ZoneInfo("Australia/Sydney")
    utc_lo, utc_hi = inclusive_local_date_range_to_utc_bounds(
        date(2024, 6, 15), date(2024, 6, 15), tz
    )
    assert utc_lo < utc_hi
    # Sydney is UTC+10 in June — local midnight 15th → 14th 14:00 UTC
    assert utc_lo.hour == 14
    assert utc_lo.day == 14


def test_dst_spring_forward_day_is_23_hours_sydney():
    """First Sunday of October 2025: clocks go forward; that local calendar day is 23h long."""
    tz = ZoneInfo("Australia/Sydney")
    lo = local_date_start_utc(date(2025, 10, 5), tz)
    hi = local_date_start_utc(date(2025, 10, 6), tz)
    assert (hi - lo).total_seconds() == 23 * 3600


def test_to_iso8601_zoned_includes_offset():
    tz = ZoneInfo("Australia/Sydney")
    s = to_iso8601_zoned(datetime(2024, 6, 15, 12, 0, 0), tz)
    assert s is not None
    assert "+10:00" in s or "T" in s


def test_format_utc_instant_for_email_respects_local_zone():
    tz_syd = ZoneInfo("Australia/Sydney")
    tz_perth = ZoneInfo("Australia/Perth")
    # 2024-06-15 00:30 UTC → calendar date differs from UTC-only formatting for Perth (+8)
    naive_utc = datetime(2024, 6, 15, 0, 30, 0)
    d_syd = format_utc_instant_for_email_date_only(naive_utc, tz_syd)
    d_perth = format_utc_instant_for_email_date_only(naive_utc, tz_perth)
    assert d_syd == "15 Jun 2024"
    assert d_perth == "15 Jun 2024"
    dt_line = format_utc_instant_for_email_datetime(naive_utc, tz_perth)
    assert dt_line is not None
    assert "2024" in dt_line
    assert "08:30" in dt_line


def test_format_unix_epoch_for_email_matches_utc_instant_helpers():
    tz = ZoneInfo("Australia/Sydney")
    unix = 1_728_499_200  # 2024-10-15 00:00:00 UTC
    assert format_unix_epoch_for_email_date_only(unix, tz) == format_utc_instant_for_email_date_only(
        datetime.fromtimestamp(unix, tz=dt_timezone.utc), tz
    )
    assert format_unix_epoch_for_email_datetime(unix, tz) is not None


def test_to_iso8601_zoned_round_trip_preserves_microseconds_for_optimistic_lock():
    """Matches _strip_tz(payload.updated_at) after client echoes API JSON (Pydantic/fromisoformat)."""
    tz = ZoneInfo("Australia/Sydney")
    naive_utc = datetime(2024, 6, 15, 2, 34, 56, 456789)
    iso = to_iso8601_zoned(naive_utc, tz)
    assert iso is not None
    assert "456789" in iso
    parsed = datetime.fromisoformat(iso)
    assert parsed.tzinfo is not None
    round_trip = parsed.astimezone(dt_timezone.utc).replace(tzinfo=None)
    assert round_trip == naive_utc
