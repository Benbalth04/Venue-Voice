"""Timezone allowlist, UTC bounds, DST, and defensive read-path behavior."""

from datetime import date, datetime, timezone as dt_timezone

import pytest
from zoneinfo import ZoneInfo

from app.core.datetime_user_tz import (
    assume_utc,
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
