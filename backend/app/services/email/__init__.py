"""Email delivery (flow alerts + Stripe billing).

Heavy dependencies (Resend) load only when flow/Stripe helpers are accessed.
"""

from __future__ import annotations

from typing import Any

from .constants import (
    EMAIL_CATEGORY_STRIPE_BILLING,
    EMAIL_CATEGORY_SYSTEM,
    EMAIL_CATEGORY_USER_NOTIFICATION,
    STRIPE_BCC_EMAIL,
    STRIPE_FROM_EMAIL,
)

__all__ = [
    "EMAIL_CATEGORY_STRIPE_BILLING",
    "EMAIL_CATEGORY_SYSTEM",
    "EMAIL_CATEGORY_USER_NOTIFICATION",
    "STRIPE_BCC_EMAIL",
    "STRIPE_FROM_EMAIL",
    "process_pending_stripe_emails",
    "reconcile_pending_emails",
    "reconcile_stripe_billing_emails",
    "send_emails_for_flow_run",
    "send_stripe_email",
]


def __getattr__(name: str) -> Any:
    if name == "reconcile_pending_emails":
        from .email_service import reconcile_pending_emails as x

        return x
    if name == "send_emails_for_flow_run":
        from .email_service import send_emails_for_flow_run as x

        return x
    if name == "process_pending_stripe_emails":
        from .stripe_email_sender import process_pending_stripe_emails as x

        return x
    if name == "reconcile_stripe_billing_emails":
        from .stripe_email_sender import reconcile_stripe_billing_emails as x

        return x
    if name == "send_stripe_email":
        from .stripe_email_sender import send_stripe_email as x

        return x
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
