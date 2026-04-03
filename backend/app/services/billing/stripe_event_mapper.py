"""Map Stripe webhook ``Event`` payloads to internal billing email jobs."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .stripe_billing_display import (
    coerce_stripe_unix_timestamp,
    format_billing_interval,
    plan_display_name_from_price,
)


@dataclass
class StripeEmailJob:
    """One queued transactional email."""

    template: str
    context: dict[str, Any] = field(default_factory=dict)


def _g(d: Any, *keys: str, default: Any = None) -> Any:
    cur: Any = d
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
        if cur is None:
            return default
    return cur


def _line_from_subscription(sub: dict[str, Any]) -> dict[str, Any]:
    data = _g(sub, "items", "data", default=[]) or []
    if not data or not isinstance(data, list):
        return {"plan_name": "Your plan", "billing_interval": "—", "unit_amount": None, "price_id": None}
    item0 = data[0] if isinstance(data[0], dict) else {}
    price = item0.get("price") if isinstance(item0.get("price"), dict) else {}
    recurring = price.get("recurring") if isinstance(price.get("recurring"), dict) else {}
    return {
        "plan_name": plan_display_name_from_price(price),
        "billing_interval": format_billing_interval(recurring),
        "unit_amount": price.get("unit_amount"),
        "price_id": price.get("id"),
    }


def _money_display(amount: Any, currency: Any) -> str | None:
    if amount is None or currency is None:
        return None
    try:
        major = int(amount) / 100.0
        cur = str(currency).upper()
        return f"{cur} {major:.2f}"
    except (TypeError, ValueError):
        return None


def _attach_trial_and_period_unix(ctx: dict[str, Any], sub: dict[str, Any]) -> None:
    """Raw Stripe unix fields for handler-side localization (popped before persist)."""
    te = coerce_stripe_unix_timestamp(sub.get("trial_end"))
    if te is not None:
        ctx["trial_end_unix"] = te
    cpe = coerce_stripe_unix_timestamp(sub.get("current_period_end"))
    if cpe is not None:
        ctx["current_period_end_unix"] = cpe


def map_stripe_event(
    event: dict[str, Any],
    *,
    subscription: dict[str, Any] | None = None,
    invoice: dict[str, Any] | None = None,
) -> list[StripeEmailJob]:
    """Return zero or more email jobs for this webhook event.

    ``subscription`` / ``invoice`` are optional fresh API objects (dict-like) the handler
    may pass in addition to ``event['data']['object']``.

    Date/time rows in emails are driven by ``*_unix`` keys; the webhook handler localizes
    them to ``*_display`` using the subscriber's timezone before queueing.
    """
    etype = str(event.get("type") or "")
    obj = event.get("data", {})
    obj = obj.get("object") if isinstance(obj, dict) else None
    obj = obj if isinstance(obj, dict) else {}
    prev = event.get("data", {})
    prev = prev.get("previous_attributes") if isinstance(prev, dict) else None
    prev = prev if isinstance(prev, dict) else {}

    if subscription is None and etype.startswith("customer.subscription"):
        subscription = obj
    if invoice is None and etype.startswith("invoice."):
        invoice = obj

    jobs: list[StripeEmailJob] = []

    if etype == "checkout.session.completed":
        sub = subscription or {}
        if not sub:
            return jobs
        status = str(sub.get("status") or "")
        line = _line_from_subscription(sub)
        ctx = {**line}
        _attach_trial_and_period_unix(ctx, sub)
        if status == "trialing":
            jobs.append(StripeEmailJob("trial_started", ctx))
        elif status in ("active", "past_due"):
            jobs.append(StripeEmailJob("subscription_activated", ctx))
        return jobs

    if etype == "customer.subscription.created":
        sub = subscription or obj
        status = str(sub.get("status") or "")
        line = _line_from_subscription(sub)
        ctx = {**line}
        _attach_trial_and_period_unix(ctx, sub)
        if status == "trialing":
            jobs.append(StripeEmailJob("trial_started", ctx))
        elif status == "active":
            jobs.append(StripeEmailJob("subscription_activated", ctx))
        return jobs

    if etype == "customer.subscription.trial_will_end":
        sub = subscription or obj
        line = _line_from_subscription(sub)
        ctx = {**line}
        te = coerce_stripe_unix_timestamp(sub.get("trial_end"))
        if te is not None:
            ctx["trial_end_unix"] = te
        jobs.append(StripeEmailJob("trial_ending_soon", ctx))
        return jobs

    if etype == "customer.subscription.deleted":
        sub = subscription or obj
        line = _line_from_subscription(sub)
        cancel_details = sub.get("cancellation_details") if isinstance(sub.get("cancellation_details"), dict) else {}
        reason = str(cancel_details.get("reason") or "")
        if reason in ("payment_failed", "collection_unpaid"):
            jobs.append(StripeEmailJob("subscription_canceled_due_to_failure", {**line}))
        else:
            jobs.append(StripeEmailJob("subscription_ended", {**line}))
        return jobs

    if etype == "customer.subscription.updated":
        sub = subscription or obj
        line = _line_from_subscription(sub)
        status = str(sub.get("status") or "")
        prev_status = str(prev.get("status") or "") if "status" in prev else ""
        cancel_at_end = bool(sub.get("cancel_at_period_end"))

        if status == "past_due" and prev_status != "past_due":
            jobs.append(StripeEmailJob("subscription_past_due", {**line}))
            return jobs

        if "status" in prev and prev_status == "canceled" and status in ("active", "trialing"):
            ctx = {**line}
            cpe = coerce_stripe_unix_timestamp(sub.get("current_period_end"))
            if cpe is not None:
                ctx["current_period_end_unix"] = cpe
            jobs.append(StripeEmailJob("reactivation", ctx))
            return jobs

        # Only when Stripe reports the flag turning on (avoid duplicate emails on unrelated updates).
        if (
            cancel_at_end
            and "cancel_at_period_end" in prev
            and not bool(prev.get("cancel_at_period_end"))
        ):
            end_ts = coerce_stripe_unix_timestamp(sub.get("current_period_end"))
            if end_ts is None:
                end_ts = coerce_stripe_unix_timestamp(sub.get("cancel_at"))
            cancel_ctx = {**line}
            if end_ts is not None:
                cancel_ctx["access_until_unix"] = end_ts
            jobs.append(StripeEmailJob("subscription_canceled", cancel_ctx))
            return jobs

        if "items" in prev:
            p_line = _line_from_subscription({**sub, "items": prev.get("items")})
            n_line = line
            if p_line.get("price_id") != n_line.get("price_id") or p_line.get("unit_amount") != n_line.get(
                "unit_amount"
            ):
                pu, nu = p_line.get("unit_amount"), n_line.get("unit_amount")
                try:
                    if pu is not None and nu is not None and int(nu) > int(pu):
                        ctx = {**n_line}
                        cpe = coerce_stripe_unix_timestamp(sub.get("current_period_end"))
                        if cpe is not None:
                            ctx["current_period_end_unix"] = cpe
                        jobs.append(StripeEmailJob("plan_upgraded", ctx))
                        return jobs
                    if pu is not None and nu is not None and int(nu) < int(pu):
                        ctx = {**n_line}
                        cpe = coerce_stripe_unix_timestamp(sub.get("current_period_end"))
                        if cpe is not None:
                            ctx["current_period_end_unix"] = cpe
                        jobs.append(StripeEmailJob("plan_downgraded", ctx))
                        return jobs
                except (TypeError, ValueError):
                    pass
            p_int = p_line.get("billing_interval")
            n_int = n_line.get("billing_interval")
            if p_int and n_int and p_int != n_int:
                ctx = {**n_line}
                cpe = coerce_stripe_unix_timestamp(sub.get("current_period_end"))
                if cpe is not None:
                    ctx["current_period_end_unix"] = cpe
                jobs.append(StripeEmailJob("billing_interval_changed", ctx))
                return jobs

        cancel_details = sub.get("cancellation_details") if isinstance(sub.get("cancellation_details"), dict) else {}
        if status == "canceled" and str(cancel_details.get("reason") or "") in (
            "payment_failed",
            "collection_unpaid",
        ):
            jobs.append(StripeEmailJob("subscription_canceled_due_to_failure", {**line}))
            return jobs

        return jobs

    if etype == "invoice.payment_succeeded":
        inv = invoice or obj
        sub = subscription
        line = _line_from_subscription(sub) if sub else {"plan_name": "Your plan", "billing_interval": "—"}
        amount = inv.get("amount_paid")
        currency = inv.get("currency")
        ctx = {
            **line,
            "amount_display": _money_display(amount, currency) or "—",
            "invoice_url": inv.get("hosted_invoice_url"),
            "receipt_url": inv.get("receipt_url") or inv.get("hosted_invoice_url"),
        }
        if sub:
            cpe = coerce_stripe_unix_timestamp(sub.get("current_period_end"))
            if cpe is not None:
                ctx["current_period_end_unix"] = cpe
        if not inv.get("subscription"):
            return jobs
        jobs.append(StripeEmailJob("payment_success", ctx))
        return jobs

    if etype == "invoice.payment_failed":
        inv = invoice or obj
        sub = subscription
        line = _line_from_subscription(sub) if sub else {"plan_name": "Your plan", "billing_interval": "—"}
        next_retry = inv.get("next_payment_attempt")
        amount_due = inv.get("amount_due")
        currency = inv.get("currency")
        ctx = {
            **line,
            "amount_due_display": _money_display(amount_due, currency),
            "invoice_url": inv.get("hosted_invoice_url"),
        }
        if next_retry:
            nr = coerce_stripe_unix_timestamp(next_retry)
            if nr is not None:
                ctx["next_retry_unix"] = nr
            jobs.append(StripeEmailJob("payment_retrying", ctx))
        else:
            jobs.append(StripeEmailJob("payment_failed", ctx))
        return jobs

    if etype == "charge.refunded":
        ch = obj
        amount = ch.get("amount_refunded") or ch.get("amount")
        currency = ch.get("currency")
        ctx = {
            "amount_display": _money_display(amount, currency) or "—",
            "reason": ch.get("refund_reason") or ch.get("description"),
        }
        jobs.append(StripeEmailJob("refund_issued", ctx))
        return jobs

    return jobs
