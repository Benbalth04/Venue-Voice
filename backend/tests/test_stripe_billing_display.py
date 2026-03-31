from app.services.billing.stripe_billing_display import (
    format_billing_interval,
    normalize_legacy_billing_context,
    plan_display_name_from_price,
)


def test_format_billing_interval_monthly_yearly():
    assert format_billing_interval({"interval": "month", "interval_count": 1}) == "Monthly"
    assert format_billing_interval({"interval": "year", "interval_count": 1}) == "Yearly"


def test_plan_name_prefers_nickname_over_product():
    price = {
        "id": "price_x",
        "nickname": "Custom label",
        "product": {"name": "Product Name"},
    }
    assert plan_display_name_from_price(price) == "Custom label"


def test_normalize_legacy_raw_month():
    ctx = normalize_legacy_billing_context({"billing_interval": "month", "plan_name": "price_abc"})
    assert ctx["billing_interval"] == "Monthly"
    assert ctx["plan_name"] == "Your plan"
