"""Unit tests for Stripe → billing email mapping (dict-shaped webhook payloads)."""

from __future__ import annotations

from app.services.billing.stripe_event_mapper import map_stripe_event


def _evt(etype: str, obj: dict, prev: dict | None = None) -> dict:
    data: dict = {"object": obj}
    if prev is not None:
        data["previous_attributes"] = prev
    return {"id": "evt_test", "type": etype, "data": data}


def test_trial_started_on_subscription_created_trialing():
    sub = {
        "id": "sub_1",
        "status": "trialing",
        "customer": "cus_1",
        "trial_end": 1_700_000_000,
        "current_period_end": 1_701_000_000,
        "items": {"data": [{"price": {"nickname": "Pro", "recurring": {"interval": "month"}}}]},
    }
    jobs = map_stripe_event(_evt("customer.subscription.created", sub))
    assert len(jobs) == 1
    assert jobs[0].template == "trial_started"
    assert jobs[0].context.get("plan_name") == "Pro"
    assert jobs[0].context.get("billing_interval") == "Monthly"


def test_payment_retrying_when_next_payment_attempt_set():
    inv = {
        "subscription": "sub_1",
        "next_payment_attempt": 1_700_000_100,
        "amount_due": 4900,
        "currency": "aud",
        "hosted_invoice_url": "https://invoice.stripe.com/i",
    }
    sub = {
        "items": {"data": [{"price": {"nickname": "Starter", "recurring": {"interval": "month"}}}]},
    }
    jobs = map_stripe_event(
        _evt("invoice.payment_failed", inv),
        subscription=sub,
    )
    assert len(jobs) == 1
    assert jobs[0].template == "payment_retrying"


def test_plan_upgraded_when_unit_amount_increases():
    sub = {
        "id": "sub_1",
        "status": "active",
        "current_period_end": 1_701_000_000,
        "items": {
            "data": [
                {
                    "price": {
                        "id": "price_new",
                        "nickname": "Growth",
                        "unit_amount": 9900,
                        "recurring": {"interval": "month"},
                    }
                }
            ]
        },
    }
    prev_items = {
        "data": [
            {
                "price": {
                    "id": "price_old",
                    "nickname": "Starter",
                    "unit_amount": 4900,
                    "recurring": {"interval": "month"},
                }
            }
        ]
    }
    jobs = map_stripe_event(
        _evt("customer.subscription.updated", sub, prev={"items": prev_items}),
        subscription=sub,
    )
    assert len(jobs) == 1
    assert jobs[0].template == "plan_upgraded"


def test_plan_name_from_expanded_product_when_no_nickname():
    sub = {
        "id": "sub_1",
        "status": "trialing",
        "customer": "cus_1",
        "trial_end": 1_700_000_000,
        "current_period_end": 1_701_000_000,
        "items": {
            "data": [
                {
                    "price": {
                        "id": "price_abc123",
                        "recurring": {"interval": "year", "interval_count": 1},
                        "product": {"id": "prod_x", "name": "Venue Voice Growth"},
                    }
                }
            ]
        },
    }
    jobs = map_stripe_event(_evt("customer.subscription.created", sub))
    assert jobs[0].context.get("plan_name") == "Venue Voice Growth"
    assert jobs[0].context.get("billing_interval") == "Yearly"


def test_charge_refunded():
    ch = {"amount": 1000, "currency": "aud", "customer": "cus_1", "amount_refunded": 1000}
    jobs = map_stripe_event(_evt("charge.refunded", ch))
    assert len(jobs) == 1
    assert jobs[0].template == "refund_issued"
