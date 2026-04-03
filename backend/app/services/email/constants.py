"""Categories for ``email_events.event_category`` (matches DB CHECK)."""

from typing import Any

EMAIL_CATEGORY_STRIPE_BILLING = "stripe_billing"
EMAIL_CATEGORY_USER_NOTIFICATION = "user_notification"
EMAIL_CATEGORY_SYSTEM = "system"

STRIPE_FROM_EMAIL = "info@venuevoice.com.au"
STRIPE_BCC_EMAIL = "info@venuevoice.com.au"

# Shown in inbox "From" (Gmail etc.); must match a domain verified in Resend.
SENDER_DISPLAY_NAME = "Venue Voice"


def format_resend_from_header(mailbox: str) -> str:
    """Build RFC 5322 From so clients show the brand name, not only the local part."""
    addr = (mailbox or "").strip()
    if not addr:
        return addr
    if "<" in addr and ">" in addr:
        return addr
    return f"{SENDER_DISPLAY_NAME} <{addr}>"


def html_escape(value: Any) -> str:
    """Escape a value for safe inclusion in HTML. Returns '—' for None."""
    if value is None:
        return "—"
    s = str(value)
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#x27;")
    )
