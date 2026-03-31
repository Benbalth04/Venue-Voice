"""Map Stripe webhook ``Event`` payloads to internal billing email jobs."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .stripe_billing_display import format_billing_interval, plan_display_name_from_price


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


def _ts_display(ts: Any) -> str | None:
    if ts is None:
        return None
    try:
        if isinstance(ts, (int, float)):
            dt = datetime.fromtimestamp(int(ts), tz=timezone.utc)
            return dt.strftime("%d %b %Y %H:%M UTC")
    except (OSError, ValueError, OverflowError):
        return None
    return None


def _date_display(ts: Any) -> str | None:
    if ts is None:
        return None
    try:
        if isinstance(ts, (int, float)):
            dt = datetime.fromtimestamp(int(ts), tz=timezone.utc)
            return dt.strftime("%d %b %Y")
    except (OSError, ValueError, OverflowError):
        return None
    return None


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


def map_stripe_event(
    event: dict[str, Any],
    *,
    subscription: dict[str, Any] | None = None,
    invoice: dict[str, Any] | None = None,
) -> list[StripeEmailJob]:
    """Return zero or more email jobs for this webhook event.

    ``subscription`` / ``invoice`` are optional fresh API objects (dict-like) the handler
    may pass in addition to ``event['data']['object']``.
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
        trial_end = _date_display(sub.get("trial_end"))
        next_bill = _date_display(sub.get("current_period_end"))
        ctx = {
            **line,
            "trial_end_display": trial_end or "—",
            "next_billing_display": next_bill or "—",
        }
        if status == "trialing":
            jobs.append(StripeEmailJob("trial_started", ctx))
        elif status in ("active", "past_due"):
            jobs.append(StripeEmailJob("subscription_activated", ctx))
        return jobs

    if etype == "customer.subscription.created":
        sub = subscription or obj
        status = str(sub.get("status") or "")
        line = _line_from_subscription(sub)
        trial_end = _date_display(sub.get("trial_end"))
        next_bill = _date_display(sub.get("current_period_end"))
        ctx = {
            **line,
            "trial_end_display": trial_end or "—",
            "next_billing_display": next_bill or "—",
        }
        if status == "trialing":
            jobs.append(StripeEmailJob("trial_started", ctx))
        elif status == "active":
            jobs.append(StripeEmailJob("subscription_activated", ctx))
        return jobs

    if etype == "customer.subscription.trial_will_end":
        sub = subscription or obj
        line = _line_from_subscription(sub)
        jobs.append(
            StripeEmailJob(
                "trial_ending_soon",
                {
                    **line,
                    "trial_end_display": _date_display(sub.get("trial_end")) or "—",
                },
            )
        )
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
            jobs.append(
                StripeEmailJob(
                    "reactivation",
                    {
                        **line,
                        "next_billing_display": _date_display(sub.get("current_period_end")) or "—",
                    },
                )
            )
            return jobs

        # Only when Stripe reports the flag turning on (avoid duplicate emails on unrelated updates).
        if (
            cancel_at_end
            and "cancel_at_period_end" in prev
            and not bool(prev.get("cancel_at_period_end"))
        ):
            jobs.append(
                StripeEmailJob(
                    "subscription_canceled",
                    {
                        **line,
                        "access_until_display": _date_display(sub.get("current_period_end")) or "—",
                    },
                )
            )
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
                        jobs.append(
                            StripeEmailJob(
                                "plan_upgraded",
                                {
                                    **n_line,
                                    "next_billing_display": _date_display(sub.get("current_period_end")) or "—",
                                },
                            )
                        )
                        return jobs
                    if pu is not None and nu is not None and int(nu) < int(pu):
                        jobs.append(
                            StripeEmailJob(
                                "plan_downgraded",
                                {
                                    **n_line,
                                    "next_billing_display": _date_display(sub.get("current_period_end")) or "—",
                                },
                            )
                        )
                        return jobs
                except (TypeError, ValueError):
                    pass
            p_int = p_line.get("billing_interval")
            n_int = n_line.get("billing_interval")
            if p_int and n_int and p_int != n_int:
                jobs.append(
                    StripeEmailJob(
                        "billing_interval_changed",
                        {
                            **n_line,
                            "next_billing_display": _date_display(sub.get("current_period_end")) or "—",
                        },
                    )
                )
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
        next_ts = None
        if sub:
            next_ts = sub.get("current_period_end")
        ctx = {
            **line,
            "amount_display": _money_display(amount, currency) or "—",
            "next_billing_display": _date_display(next_ts) or "—",
            "invoice_url": inv.get("hosted_invoice_url"),
            "receipt_url": inv.get("receipt_url") or inv.get("hosted_invoice_url"),
        }
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
            "next_retry_display": _ts_display(next_retry) or "—",
        }
        if next_retry:
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
