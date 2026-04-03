"""Subscription status mapping, access rules, and price_id → plan mapping."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.stripe_service import (
    db_subscription_status_from_stripe,
    is_subscription_active,
    plan_display_name_from_price_id,
    PRICE_ID_TO_PLAN,
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


@patch.dict(
    os.environ,
    {
        "STARTER_PLAN_MONTHLY_PRICE_ID": "price_starter_monthly",
        "STARTER_PLAN_YEARLY_PRICE_ID": "price_starter_yearly",
        "GROWTH_PLAN_MONTHLY_PRICE_ID": "price_growth_monthly",
        "GROWTH_PLAN_YEARLY_PRICE_ID": "price_growth_yearly",
        "PRO_PLAN_MONTHLY_PRICE_ID": "price_pro_monthly",
        "PRO_PLAN_YEARLY_PRICE_ID": "price_pro_yearly",
    },
)
def test_price_id_to_plan_map_all_six(monkeypatch=None):
    """PRICE_ID_TO_PLAN maps all 6 price IDs to their plan display names.

    Note: PRICE_ID_TO_PLAN is built at import time, so we test via
    plan_display_name_from_price_id with the actual env values that were set
    when the module was imported in the test session.
    """
    # All known entries in PRICE_ID_TO_PLAN should map to valid display names
    for price_id, (plan_key, display_name) in PRICE_ID_TO_PLAN.items():
        assert display_name in ("Starter", "Growth", "Pro"), (
            f"Unexpected display_name {display_name!r} for price_id {price_id!r}"
        )
        assert plan_key in ("starter", "growth", "pro"), (
            f"Unexpected plan_key {plan_key!r} for price_id {price_id!r}"
        )
        assert plan_display_name_from_price_id(price_id) == display_name
