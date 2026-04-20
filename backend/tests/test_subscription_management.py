"""Subscription status mapping and access rules."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.stripe_service import (
    db_subscription_status_from_stripe,
    is_subscription_active,
    plan_display_name_from_price_id,
)


def test_db_status_pending_cancel_for_active_scheduled():
    sub = SimpleNamespace(status="active", cancel_at_period_end=True)
    assert db_subscription_status_from_stripe(sub) == "pending_cancel"


def test_db_status_pending_cancel_for_trialing_scheduled():
    sub = SimpleNamespace(status="trialing", cancel_at_period_end=True)
    assert db_subscription_status_from_stripe(sub) == "pending_cancel"


def test_db_status_active_when_not_scheduled():
    sub = SimpleNamespace(status="active", cancel_at_period_end=False)
    assert db_subscription_status_from_stripe(sub) == "active"


def test_db_status_canceled_even_if_cancel_at_flag_stripe_inconsistent():
    sub = SimpleNamespace(status="canceled", cancel_at_period_end=True)
    assert db_subscription_status_from_stripe(sub) == "canceled"


def test_is_active_pending_cancel_until_period_end():
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=10)
    sub = SimpleNamespace(
        status="pending_cancel",
        trial_end=None,
        current_period_end=end,
    )
    assert is_subscription_active(sub) is True


def test_is_active_pending_cancel_false_after_period_end():
    now = datetime.now(timezone.utc)
    end = now - timedelta(days=1)
    sub = SimpleNamespace(
        status="pending_cancel",
        trial_end=None,
        current_period_end=end,
    )
    assert is_subscription_active(sub) is False


def test_is_active_pending_cancel_while_trial_running():
    now = datetime.now(timezone.utc)
    trial = now + timedelta(days=3)
    sub = SimpleNamespace(
        status="pending_cancel",
        trial_end=trial,
        current_period_end=now - timedelta(days=1),
    )
    assert is_subscription_active(sub) is True


def test_plan_display_name_from_price_id_none():
    assert plan_display_name_from_price_id(None) is None


def test_plan_display_name_from_price_id_unknown():
    assert plan_display_name_from_price_id("price_unknown_xyz") is None


def test_plan_display_name_always_none_for_location_pricing():
    """Location-based pricing has no named tiers — plan_display_name_from_price_id always returns None."""
    assert plan_display_name_from_price_id("price_location_monthly") is None
    assert plan_display_name_from_price_id("price_location_yearly") is None
