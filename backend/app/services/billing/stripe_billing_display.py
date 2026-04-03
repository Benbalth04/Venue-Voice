"""Human-readable plan names and billing intervals for Stripe billing emails."""

from __future__ import annotations

import re
from typing import Any


def coerce_stripe_unix_timestamp(ts: Any) -> int | None:
    """Parse Stripe Unix timestamps from API/webhook dicts (int, float, or numeric string)."""
    if ts is None:
        return None
    if isinstance(ts, bool):
        return None
    if isinstance(ts, (int, float)):
        try:
            i = int(ts)
        except (TypeError, ValueError, OverflowError):
            return None
        return i if i > 0 else None
    if isinstance(ts, str):
        s = ts.strip()
        if not s or not s.isdigit():
            return None
        try:
            i = int(s)
        except ValueError:
            return None
        return i if i > 0 else None
    return None

_PRICE_ID_RE = re.compile(r"^price_[A-Za-z0-9]+$")


def plan_display_name_from_price(price: dict[str, Any]) -> str:
    """Prefer price nickname, then expanded Product name, else a short fallback."""
    if not isinstance(price, dict):
        return "Your plan"

    nickname = price.get("nickname")
    if isinstance(nickname, str) and nickname.strip():
        return nickname.strip()

    prod = price.get("product")
    if isinstance(prod, dict):
        name = prod.get("name")
        if isinstance(name, str) and name.strip():
            return name.strip()

    pid = price.get("id")
    if isinstance(pid, str) and pid.strip():
        return pid.strip()

    return "Your plan"


def format_billing_interval(recurring: dict[str, Any] | None) -> str:
    """Stripe ``interval`` + ``interval_count`` → e.g. Monthly, Yearly."""
    if not isinstance(recurring, dict):
        return "—"

    interval = str(recurring.get("interval") or "").strip().lower()
    try:
        count = int(recurring.get("interval_count") or 1)
    except (TypeError, ValueError):
        count = 1

    if interval == "month" and count == 1:
        return "Monthly"
    if interval == "year" and count == 1:
        return "Yearly"
    if interval == "week" and count == 1:
        return "Weekly"
    if interval == "day" and count == 1:
        return "Daily"

    if interval == "month":
        return f"Every {count} months" if count != 1 else "Monthly"
    if interval == "year":
        return f"Every {count} years" if count != 1 else "Yearly"
    if interval == "week":
        return f"Every {count} weeks" if count != 1 else "Weekly"
    if interval == "day":
        return f"Every {count} days" if count != 1 else "Daily"

    if interval:
        label = interval[:1].upper() + interval[1:] if len(interval) > 1 else interval.upper()
        return f"{label} (×{count})" if count != 1 else label

    return "—"


def normalize_legacy_billing_context(context: dict[str, Any]) -> dict[str, Any]:
    """Best-effort fix for queued emails that only stored raw Stripe interval strings."""
    out = dict(context)
    raw = out.get("billing_interval")
    if isinstance(raw, str) and raw.strip().lower() in ("month", "year", "week", "day"):
        out["billing_interval"] = format_billing_interval(
            {"interval": raw.strip().lower(), "interval_count": 1}
        )
    pname = out.get("plan_name")
    if isinstance(pname, str) and _PRICE_ID_RE.match(pname.strip()):
        out["plan_name"] = "Your plan"
    return out
