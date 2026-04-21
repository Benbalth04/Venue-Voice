"""Public contact-form endpoint — no auth required."""

from __future__ import annotations

import logging
import re

import resend
from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..core.config import settings
from ..core.errors.exceptions import ExternalAPIError, ValidationError
from ..core.rate_limit import check_rate_limit
from ..services.email.constants import STRIPE_FROM_EMAIL, format_resend_from_header, html_escape

logger = logging.getLogger(__name__)

router = APIRouter()

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_CONTACT_TO = "info@venuevoice.com.au"


class ContactFormRequest(BaseModel):
    name: str
    company: str
    email: str
    phone: str | None = None
    num_locations: int
    message: str


def _build_contact_email_html(data: ContactFormRequest) -> str:
    rows = [
        ("Name", data.name),
        ("Company", data.company),
        ("Email", data.email),
        ("Phone", data.phone),
        ("Number of locations", data.num_locations),
        ("Message", data.message),
    ]
    rows_html = "".join(
        f"""
        <tr>
          <td style="padding:10px 16px;font-weight:600;color:#3f3f46;background:#f4f4f5;
                     border-bottom:1px solid #e4e4e7;white-space:nowrap;width:160px;">
            {html_escape(label)}
          </td>
          <td style="padding:10px 16px;color:#18181b;border-bottom:1px solid #e4e4e7;
                     white-space:pre-wrap;word-break:break-word;">
            {html_escape(value)}
          </td>
        </tr>"""
        for label, value in rows
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;
             background:#ffffff;border-radius:12px;overflow:hidden;
             box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#7c3aed;padding:28px 32px;">
            <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
              Venue Voice
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px;">
            <h1 style="margin:0 0 6px;font-size:18px;font-weight:600;color:#18181b;">
              New enquiry received
            </h1>
            <p style="margin:0;font-size:14px;color:#71717a;">
              Someone submitted the contact form on venuevoice.com.au
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;font-size:14px;">
              {rows_html}
            </table>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


@router.post("/contact")
def submit_contact_form(payload: ContactFormRequest, request: Request) -> dict:
    check_rate_limit(request, "contact", limit=5, window=3600)

    if not _EMAIL_RE.match((payload.email or "").strip()):
        raise ValidationError(code="INVALID_EMAIL", message="Please enter a valid email address.")
    if payload.num_locations < 1:
        raise ValidationError(code="INVALID_NUM_LOCATIONS", message="Number of locations must be at least 1.")
    if not payload.name.strip() or not payload.company.strip() or not payload.message.strip():
        raise ValidationError(code="MISSING_REQUIRED_FIELDS", message="Please fill in all required fields.")

    if not settings.resend_api_key:
        logger.error("RESEND_API_KEY not configured — cannot send contact form email")
        raise ExternalAPIError(
            service_name="resend",
            error_message="RESEND_API_KEY not configured",
            code="RESEND_NOT_CONFIGURED",
            status_code=503,
        )

    subject = f"New enquiry from {payload.name.strip()} — {payload.company.strip()}"
    html = _build_contact_email_html(payload)

    try:
        resend.api_key = settings.resend_api_key
        resend.Emails.send({
            "from": format_resend_from_header(STRIPE_FROM_EMAIL),
            "to": [_CONTACT_TO],
            "subject": subject,
            "html": html,
        })
    except Exception as exc:
        logger.exception("Failed to send contact form email name=%s", payload.name)
        raise ExternalAPIError(
            service_name="resend",
            error_message=str(exc),
            code="EMAIL_SEND_FAILED",
        ) from exc

    logger.info("Contact form email sent from=%s company=%s", payload.email, payload.company)
    return {"ok": True}
