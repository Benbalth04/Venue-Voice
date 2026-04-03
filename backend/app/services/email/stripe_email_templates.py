"""Plain HTML transactional templates for Stripe billing (inline CSS, mobile-friendly)."""

from __future__ import annotations

from typing import Any

from ..billing.stripe_billing_display import normalize_legacy_billing_context
from .constants import html_escape as _esc

PRIMARY = "#7c3aed"
PRIMARY_LIGHT = "#ede9fe"
TEXT_MUTED = "#6b7280"
TEXT_BODY = "#111827"
BORDER = "#e5e7eb"
BG_PAGE = "#f3f4f6"

# Template names must match ``StripeEmailJob.template`` / DB ``template_name``.
STRIPE_TEMPLATE_TRIAL_STARTED = "trial_started"
STRIPE_TEMPLATE_TRIAL_ENDING_SOON = "trial_ending_soon"
STRIPE_TEMPLATE_SUBSCRIPTION_ACTIVATED = "subscription_activated"
STRIPE_TEMPLATE_SUBSCRIPTION_CANCELED = "subscription_canceled"
STRIPE_TEMPLATE_SUBSCRIPTION_ENDED = "subscription_ended"
STRIPE_TEMPLATE_PLAN_UPGRADED = "plan_upgraded"
STRIPE_TEMPLATE_PLAN_DOWNGRADED = "plan_downgraded"
STRIPE_TEMPLATE_BILLING_INTERVAL_CHANGED = "billing_interval_changed"
STRIPE_TEMPLATE_PAYMENT_SUCCESS = "payment_success"
STRIPE_TEMPLATE_PAYMENT_FAILED = "payment_failed"
STRIPE_TEMPLATE_PAYMENT_RETRYING = "payment_retrying"
STRIPE_TEMPLATE_SUBSCRIPTION_PAST_DUE = "subscription_past_due"
STRIPE_TEMPLATE_SUBSCRIPTION_CANCELED_DUE_TO_FAILURE = "subscription_canceled_due_to_failure"
STRIPE_TEMPLATE_REFUND_ISSUED = "refund_issued"
STRIPE_TEMPLATE_REACTIVATION = "reactivation"

ALL_STRIPE_TEMPLATES: frozenset[str] = frozenset(
    {
        STRIPE_TEMPLATE_TRIAL_STARTED,
        STRIPE_TEMPLATE_TRIAL_ENDING_SOON,
        STRIPE_TEMPLATE_SUBSCRIPTION_ACTIVATED,
        STRIPE_TEMPLATE_SUBSCRIPTION_CANCELED,
        STRIPE_TEMPLATE_SUBSCRIPTION_ENDED,
        STRIPE_TEMPLATE_PLAN_UPGRADED,
        STRIPE_TEMPLATE_PLAN_DOWNGRADED,
        STRIPE_TEMPLATE_BILLING_INTERVAL_CHANGED,
        STRIPE_TEMPLATE_PAYMENT_SUCCESS,
        STRIPE_TEMPLATE_PAYMENT_FAILED,
        STRIPE_TEMPLATE_PAYMENT_RETRYING,
        STRIPE_TEMPLATE_SUBSCRIPTION_PAST_DUE,
        STRIPE_TEMPLATE_SUBSCRIPTION_CANCELED_DUE_TO_FAILURE,
        STRIPE_TEMPLATE_REFUND_ISSUED,
        STRIPE_TEMPLATE_REACTIVATION,
    }
)


def _btn(href: str, label: str, *, primary: bool = True) -> str:
    bg = PRIMARY if primary else "#ffffff"
    fg = "#ffffff" if primary else PRIMARY
    border = "none" if primary else f"2px solid {PRIMARY}"
    return f"""<a href="{_esc(href)}" style="display:inline-block;background:{bg};color:{fg};
      font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;
      border:{border};margin:4px 8px 4px 0;">{_esc(label)}</a>"""


def _row(label: str, value: str) -> str:
    return f"""<tr>
      <td style="padding:10px 14px;font-weight:600;color:{TEXT_MUTED};border-bottom:1px solid {BORDER};
        background:{PRIMARY_LIGHT};width:38%;">{_esc(label)}</td>
      <td style="padding:10px 14px;color:{TEXT_BODY};border-bottom:1px solid {BORDER};">{value}</td>
    </tr>"""


def _layout(
    *,
    headline: str,
    subline: str,
    inner_html: str,
    manage_url: str,
    dashboard_url: str,
    extra_buttons_html: str = "",
) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Venue Voice — {_esc(headline)}</title>
</head>
<body style="margin:0;padding:0;background:{BG_PAGE};
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:{BG_PAGE};padding:28px 12px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:{PRIMARY};border-radius:10px 10px 0 0;padding:22px 28px;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.12em;color:#ddd6fe;
                text-transform:uppercase;">Venue Voice</p>
              <h1 style="margin:6px 0 0;font-size:21px;font-weight:700;color:#ffffff;line-height:1.3;">
                {_esc(headline)}</h1>
              <p style="margin:10px 0 0;font-size:14px;color:#ede9fe;line-height:1.5;">{_esc(subline)}</p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:28px;border:1px solid {BORDER};border-top:none;">
              {inner_html}
              <p style="margin:24px 0 12px;font-size:13px;color:{TEXT_MUTED};">Quick links</p>
              <div style="text-align:left;">
                {_btn(manage_url, "Manage subscription")}
                {_btn(dashboard_url, "Open dashboard", primary=False)}
                {extra_buttons_html}
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#fafafa;border:1px solid {BORDER};border-top:none;border-radius:0 0 10px 10px;
              padding:16px 28px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
                You are receiving this email because of activity on your Venue Voice account.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _detail_table(rows: list[tuple[str, str]]) -> str:
    body = "".join(_row(l, v) for l, v in rows)
    return f"""<table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid {BORDER};border-radius:8px;border-collapse:collapse;margin:0 0 20px;">
      {body}</table>"""


def _optional_links(ctx: dict[str, Any]) -> str:
    parts: list[str] = []
    inv = ctx.get("invoice_url")
    if inv:
        parts.append(_btn(str(inv), "View invoice", primary=False))
    rec = ctx.get("receipt_url")
    if rec:
        parts.append(_btn(str(rec), "View receipt", primary=False))
    return "".join(parts)


def render_stripe_template(template: str, context: dict[str, Any]) -> tuple[str, str]:
    """Return (subject, html). ``context`` must include ``manage_subscription_url`` and ``dashboard_url``."""
    fn = _RENDERERS.get(template)
    if not fn:
        raise ValueError(f"Unknown Stripe email template: {template!r}")
    ctx = normalize_legacy_billing_context(context)
    return fn(ctx)


def _base_ctx(context: dict[str, Any]) -> dict[str, Any]:
    name = context.get("first_name") or context.get("customer_name") or "there"
    return {"greet": str(name)}


def _r_trial_started(ctx: dict[str, Any]) -> tuple[str, str]:
    b = _base_ctx(ctx)
    rows = [
        ("Plan", _esc(ctx.get("plan_name"))),
        ("Billing", _esc(ctx.get("billing_interval"))),
        ("Trial ends", _esc(ctx.get("trial_end_display"))),
    ]
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(b['greet'])}, your free trial for <strong>{_esc(ctx.get('plan_name'))}</strong> is now active.</p>
      {_detail_table(rows)}"""
    return (
        "Your Venue Voice trial has started",
        _layout(
            headline="Trial Started",
            subline="Explore Venue Voice on your trial — we will email you before it ends.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


def _r_trial_ending_soon(ctx: dict[str, Any]) -> tuple[str, str]:
    rows = [
        ("Plan", _esc(ctx.get("plan_name"))),
        ("Trial ends", _esc(ctx.get("trial_end_display"))),
    ]
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(_base_ctx(ctx)['greet'])}, your trial is ending soon. Update your payment method if needed
      so your subscription continues without interruption.</p>
      {_detail_table(rows)}"""
    return (
        "Your Venue Voice trial is ending soon",
        _layout(
            headline="Trial Ending Soon",
            subline="Stripe notified us your trial period is almost over.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


def _r_subscription_activated(ctx: dict[str, Any]) -> tuple[str, str]:
    rows = [
        ("Plan", _esc(ctx.get("plan_name"))),
        ("Billing", _esc(ctx.get("billing_interval"))),
        ("Next billing", _esc(ctx.get("next_billing_display"))),
    ]
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(_base_ctx(ctx)['greet'])}, your Venue Voice subscription is now active.</p>
      {_detail_table(rows)}"""
    return (
        "Your Venue Voice subscription is active",
        _layout(
            headline="Subscription Activated",
            subline="Thank you for subscribing.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


def _r_subscription_canceled(ctx: dict[str, Any]) -> tuple[str, str]:
    rows = [
        ("Plan", _esc(ctx.get("plan_name"))),
        ("Access until", _esc(ctx.get("access_until_display"))),
    ]
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(_base_ctx(ctx)['greet'])}, your subscription is scheduled to cancel at the end of the
      current billing period. You will retain access until then.</p>
      {_detail_table(rows)}"""
    return (
        "Your subscription cancellation is scheduled",
        _layout(
            headline="Subscription Canceled",
            subline="You can reactivate anytime before the period ends.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


def _r_subscription_ended(ctx: dict[str, Any]) -> tuple[str, str]:
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(_base_ctx(ctx)['greet'])}, your Venue Voice subscription has ended. You can resubscribe
      anytime from your account.</p>
      {_detail_table([("Previous plan", _esc(ctx.get("plan_name")))])}"""
    return (
        "Your Venue Voice subscription has ended",
        _layout(
            headline="Subscription Ended",
            subline="We are sorry to see you go.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


def _r_plan_upgraded(ctx: dict[str, Any]) -> tuple[str, str]:
    rows = [
        ("New plan", _esc(ctx.get("plan_name"))),
        ("Billing", _esc(ctx.get("billing_interval"))),
        ("Next billing", _esc(ctx.get("next_billing_display"))),
    ]
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(_base_ctx(ctx)['greet'])}, your plan has been upgraded.</p>
      {_detail_table(rows)}"""
    return (
        "Your Venue Voice plan was upgraded",
        _layout(
            headline="Plan upgraded",
            subline="Your Subscription Has Been Updated.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


def _r_plan_downgraded(ctx: dict[str, Any]) -> tuple[str, str]:
    rows = [
        ("New plan", _esc(ctx.get("plan_name"))),
        ("Billing", _esc(ctx.get("billing_interval"))),
        ("Next billing", _esc(ctx.get("next_billing_display"))),
    ]
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(_base_ctx(ctx)['greet'])}, your plan has been changed to a lower tier.</p>
      {_detail_table(rows)}"""
    return (
        "Your Venue Voice plan was updated",
        _layout(
            headline="Plan Updated",
            subline="Your subscription reflects the new plan.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


def _r_billing_interval_changed(ctx: dict[str, Any]) -> tuple[str, str]:
    rows = [
        ("Plan", _esc(ctx.get("plan_name"))),
        ("Billing interval", _esc(ctx.get("billing_interval"))),
        ("Next billing", _esc(ctx.get("next_billing_display"))),
    ]
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(_base_ctx(ctx)['greet'])}, your billing interval has been updated.</p>
      {_detail_table(rows)}"""
    return (
        "Your billing interval changed",
        _layout(
            headline="Billing Interval Updated",
            subline="Future invoices will follow the new schedule.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


def _r_payment_success(ctx: dict[str, Any]) -> tuple[str, str]:
    rows = [
        ("Amount", _esc(ctx.get("amount_display"))),
        ("Plan", _esc(ctx.get("plan_name"))),
        ("Next billing", _esc(ctx.get("next_billing_display"))),
    ]
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(_base_ctx(ctx)['greet'])}, we received your payment. Thank you.</p>
      {_detail_table(rows)}"""
    return (
        "Payment received — Venue Voice",
        _layout(
            headline="Payment Successful",
            subline="Your subscription payment went through.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


def _r_payment_failed(ctx: dict[str, Any]) -> tuple[str, str]:
    rows = [("Plan", _esc(ctx.get("plan_name")))]
    if ctx.get("amount_due_display"):
        rows.append(("Amount due", _esc(ctx.get("amount_due_display"))))
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(_base_ctx(ctx)['greet'])}, we could not process your latest payment. Please update your
      payment method to avoid interruption.</p>
      {_detail_table(rows)}"""
    return (
        "Payment failed — action needed",
        _layout(
            headline="Payment Failed",
            subline="Update your billing details to keep your subscription active.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


def _r_payment_retrying(ctx: dict[str, Any]) -> tuple[str, str]:
    rows = [
        ("Plan", _esc(ctx.get("plan_name"))),
        ("Next retry", _esc(ctx.get("next_retry_display"))),
    ]
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(_base_ctx(ctx)['greet'])}, a payment attempt failed, but Stripe will automatically retry.
      You can update your payment method now to avoid service interruption.</p>
      {_detail_table(rows)}"""
    return (
        "Payment retry scheduled",
        _layout(
            headline="Payment Retrying",
            subline="We will attempt to charge your payment method again.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


def _r_subscription_past_due(ctx: dict[str, Any]) -> tuple[str, str]:
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(_base_ctx(ctx)['greet'])}, your subscription is past due. Please pay the open invoice
      or update your payment method.</p>
      {_detail_table([("Plan", _esc(ctx.get("plan_name")))])}"""
    return (
        "Your subscription is past due",
        _layout(
            headline="Subscription Past Due",
            subline="Resolve billing to maintain access.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


def _r_subscription_canceled_due_to_failure(ctx: dict[str, Any]) -> tuple[str, str]:
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(_base_ctx(ctx)['greet'])}, your subscription was canceled after repeated failed payment
      attempts. You can resubscribe anytime.</p>
      {_detail_table([("Previous plan", _esc(ctx.get("plan_name")))])}"""
    return (
        "Subscription canceled — payment failure",
        _layout(
            headline="Subscription Canceled",
            subline="We could not collect payment after multiple attempts.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


def _r_refund_issued(ctx: dict[str, Any]) -> tuple[str, str]:
    rows = [("Amount", _esc(ctx.get("amount_display")))]
    if ctx.get("reason"):
        rows.append(("Note", _esc(ctx.get("reason"))))
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(_base_ctx(ctx)['greet'])}, a refund has been issued to your original payment method.</p>
      {_detail_table(rows)}"""
    return (
        "Refund issued — Venue Voice",
        _layout(
            headline="Refund Issued",
            subline="It may take a few business days to appear on your statement.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


def _r_reactivation(ctx: dict[str, Any]) -> tuple[str, str]:
    rows = [
        ("Plan", _esc(ctx.get("plan_name"))),
        ("Billing", _esc(ctx.get("billing_interval"))),
        ("Next billing", _esc(ctx.get("next_billing_display"))),
    ]
    inner = f"""<p style="margin:0 0 16px;font-size:15px;color:{TEXT_BODY};line-height:1.6;">
      Hi {_esc(_base_ctx(ctx)['greet'])}, welcome back — your Venue Voice subscription is active again.</p>
      {_detail_table(rows)}"""
    return (
        "Your Venue Voice subscription is active again",
        _layout(
            headline="Subscription Reactivated",
            subline="Thanks for continuing with Venue Voice.",
            inner_html=inner,
            manage_url=str(ctx["manage_subscription_url"]),
            dashboard_url=str(ctx["dashboard_url"]),
            extra_buttons_html=_optional_links(ctx),
        ),
    )


_RENDERERS: dict[str, Any] = {
    STRIPE_TEMPLATE_TRIAL_STARTED: _r_trial_started,
    STRIPE_TEMPLATE_TRIAL_ENDING_SOON: _r_trial_ending_soon,
    STRIPE_TEMPLATE_SUBSCRIPTION_ACTIVATED: _r_subscription_activated,
    STRIPE_TEMPLATE_SUBSCRIPTION_CANCELED: _r_subscription_canceled,
    STRIPE_TEMPLATE_SUBSCRIPTION_ENDED: _r_subscription_ended,
    STRIPE_TEMPLATE_PLAN_UPGRADED: _r_plan_upgraded,
    STRIPE_TEMPLATE_PLAN_DOWNGRADED: _r_plan_downgraded,
    STRIPE_TEMPLATE_BILLING_INTERVAL_CHANGED: _r_billing_interval_changed,
    STRIPE_TEMPLATE_PAYMENT_SUCCESS: _r_payment_success,
    STRIPE_TEMPLATE_PAYMENT_FAILED: _r_payment_failed,
    STRIPE_TEMPLATE_PAYMENT_RETRYING: _r_payment_retrying,
    STRIPE_TEMPLATE_SUBSCRIPTION_PAST_DUE: _r_subscription_past_due,
    STRIPE_TEMPLATE_SUBSCRIPTION_CANCELED_DUE_TO_FAILURE: _r_subscription_canceled_due_to_failure,
    STRIPE_TEMPLATE_REFUND_ISSUED: _r_refund_issued,
    STRIPE_TEMPLATE_REACTIVATION: _r_reactivation,
}
