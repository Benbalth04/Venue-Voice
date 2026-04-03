"""Billing email context: unix → localized display (subscriber timezone)."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock
from uuid import uuid4

from zoneinfo import ZoneInfo

from app.core.datetime_user_tz import (
    format_unix_epoch_for_email_date_only,
    format_unix_epoch_for_email_datetime,
)
from app.models.postgres_model import Subscription
from app.services.billing.stripe_event_handler import apply_user_timezone_to_billing_context


def test_apply_billing_context_strips_unix_and_sets_displays():
    user = MagicMock()
    user.timezone = "Australia/Sydney"
    user.id = uuid4()
    merged = {
        "first_name": "Sam",
        "trial_end_unix": 1_700_000_000,
        "current_period_end_unix": 1_701_000_000,
    }
    db = MagicMock()
    apply_user_timezone_to_billing_context(db, user, merged, template="trial_started")
    assert "trial_end_unix" not in merged
    assert "current_period_end_unix" not in merged
    tz = ZoneInfo("Australia/Sydney")
    assert merged["trial_end_display"] == format_unix_epoch_for_email_date_only(1_700_000_000, tz)
    assert merged["next_billing_display"] == format_unix_epoch_for_email_date_only(1_701_000_000, tz)
    db.query.assert_not_called()


def test_apply_billing_context_next_retry_datetime():
    user = MagicMock()
    user.timezone = "Australia/Perth"
    user.id = uuid4()
    merged = {"next_retry_unix": 1_700_000_100}
    db = MagicMock()
    apply_user_timezone_to_billing_context(db, user, merged, template="payment_retrying")
    assert "next_retry_unix" not in merged
    expected = format_unix_epoch_for_email_datetime(1_700_000_100, ZoneInfo("Australia/Perth"))
    assert merged["next_retry_display"] == expected


def test_apply_subscription_canceled_db_fallback_when_no_unix():
    user = MagicMock()
    user.timezone = "Australia/Sydney"
    user.id = uuid4()
    merged: dict = {}

    sub = MagicMock()
    sub.current_period_end = datetime(2024, 6, 15, 14, 30, 0)

    sub_q = MagicMock()
    sub_q.filter.return_value.first.return_value = sub
    db = MagicMock()
    db.query.return_value = sub_q

    apply_user_timezone_to_billing_context(db, user, merged, template="subscription_canceled")
    db.query.assert_called_once_with(Subscription)
    assert "access_until_unix" not in merged
    assert merged.get("access_until_display")
