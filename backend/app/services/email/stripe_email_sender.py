"""Send queued Stripe billing emails via Resend (retries, logging)."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

import resend
from sqlalchemy import update as sa_update
from sqlalchemy.orm import Session

from ...models.postgres_model import EmailEvent as EmailEventORM
from .constants import (
    EMAIL_CATEGORY_STRIPE_BILLING,
    STRIPE_BCC_EMAIL,
    STRIPE_FROM_EMAIL,
    format_resend_from_header,
)
from .db_helpers import MAX_RETRIES, increment_email_retry, mark_email_events
from .retry import call_with_exponential_backoff
from .stripe_email_templates import ALL_STRIPE_TEMPLATES, render_stripe_template

logger = logging.getLogger(__name__)

_RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")


def send_stripe_email(
    *,
    to_email: str,
    template: str,
    context: dict[str, Any],
) -> None:
    """Send one transactional billing email (always from info@venuevoice.com.au, BCC ops)."""
    if not _RESEND_API_KEY:
        logger.error("RESEND_API_KEY not configured — cannot send Stripe email template=%s", template)
        raise RuntimeError("RESEND_API_KEY not configured")

    if template not in ALL_STRIPE_TEMPLATES:
        raise ValueError(f"Invalid template: {template!r}")

    to_email = (to_email or "").strip().lower()
    if not to_email or "@" not in to_email:
        raise ValueError("Invalid recipient email")

    subject, html = render_stripe_template(template, context)

    def _send() -> None:
        resend.api_key = _RESEND_API_KEY
        params: resend.Emails.SendParams = {
            "from": format_resend_from_header(STRIPE_FROM_EMAIL),
            "to": [to_email],
            "bcc": [STRIPE_BCC_EMAIL],
            "subject": subject,
            "html": html,
        }
        resend.Emails.send(params)

    call_with_exponential_backoff(_send, operation_name=f"Resend Stripe template={template}")
    logger.info("Stripe billing email sent template=%s to=%s", template, to_email)


def process_pending_stripe_emails(db: Session, *, limit: int = 50) -> None:
    """Claim pending stripe_billing rows and send one Resend message per row."""
    if not _RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured — skipping Stripe email queue")
        return

    id_rows = (
        db.query(EmailEventORM.id)
        .filter(
            EmailEventORM.event_category == EMAIL_CATEGORY_STRIPE_BILLING,
            EmailEventORM.status == "pending",
            EmailEventORM.retry_count < MAX_RETRIES,
            EmailEventORM.flow_run_id.is_(None),
        )
        .limit(limit)
        .all()
    )
    claim_ids = [r[0] for r in id_rows]
    if not claim_ids:
        return

    stmt = (
        sa_update(EmailEventORM)
        .where(EmailEventORM.id.in_(claim_ids))
        .values(status="sending")
        .returning(
            EmailEventORM.id,
            EmailEventORM.recipient_email,
            EmailEventORM.template_name,
            EmailEventORM.context_json,
        )
        .execution_options(synchronize_session=False)
    )
    rows = db.execute(stmt).fetchall()
    db.commit()

    if not rows:
        return

    processed = 0
    for row in rows:
        eid, recipient, template, ctx = row[0], row[1], row[2], row[3] or {}
        if not recipient or not template:
            mark_email_events(
                db, [eid], status="failed_permanent", error="Missing recipient or template_name"
            )
            continue
        try:
            send_stripe_email(to_email=recipient, template=template, context=dict(ctx))
            mark_email_events(db, [eid], status="sent", sent_at=datetime.now(timezone.utc))
            processed += 1
            logger.info("Stripe email queue processed email_event_id=%s template=%s", eid, template)
        except Exception as exc:
            logger.exception(
                "Stripe email send failed email_event_id=%s template=%s",
                eid,
                template,
            )
            increment_email_retry(db, [eid], error=str(exc))

    if processed:
        logger.info("Stripe email queue: sent %d message(s)", processed)


def reconcile_stripe_billing_emails(db: Session) -> None:
    """Scheduler entry: drain pending Stripe billing emails."""
    try:
        process_pending_stripe_emails(db, limit=100)
    except Exception:
        logger.exception("reconcile_stripe_billing_emails failed")
