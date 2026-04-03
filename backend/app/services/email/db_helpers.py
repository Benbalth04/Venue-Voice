"""Shared DB helpers for email event lifecycle (mark status, retry logic)."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import update as sa_update
from sqlalchemy.orm import Session

from ...models.postgres_model import EmailEvent as EmailEventORM

logger = logging.getLogger(__name__)

MAX_RETRIES = 3


def mark_email_events(
    db: Session,
    event_ids: list[uuid.UUID],
    *,
    status: str,
    sent_at: datetime | None = None,
    error: str | None = None,
) -> None:
    values: dict[str, Any] = {"status": status}
    if sent_at is not None:
        values["sent_at"] = sent_at
    if error is not None:
        values["error_message"] = error[:2000]
    db.execute(
        sa_update(EmailEventORM)
        .where(EmailEventORM.id.in_(event_ids))
        .values(**values)
    )
    db.commit()


def increment_email_retry(
    db: Session,
    event_ids: list[uuid.UUID],
    *,
    error: str,
) -> None:
    events = db.query(EmailEventORM).filter(EmailEventORM.id.in_(event_ids)).all()
    for ev in events:
        new_count = (ev.retry_count or 0) + 1
        ev.retry_count = new_count
        ev.error_message = error[:2000]
        ev.status = "pending" if new_count < MAX_RETRIES else "failed_permanent"
        if ev.status == "failed_permanent":
            logger.warning(
                "Email event %s permanently failed after %d retries", ev.id, new_count
            )
    db.commit()
