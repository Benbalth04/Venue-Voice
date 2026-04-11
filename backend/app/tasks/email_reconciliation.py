"""APScheduler-based reconciliation job for unsent email events.

The scheduler is started in main.py via the FastAPI lifespan hook and runs
reconcile_pending_emails every 5 minutes to deliver any emails that were not
sent due to application crashes or transient failures.
"""
from __future__ import annotations

import logging
import uuid

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from ..core.logging_config import request_id_var

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(timezone="UTC")


def reconciliation_job() -> None:
    """Entry point called by APScheduler. Opens its own DB session."""
    from datetime import datetime, timezone

    from ..db.postgres import SessionLocal
    from ..models.postgres_model import JobRun
    from ..services.email import reconcile_pending_emails, reconcile_stripe_billing_emails

    # Give this job run a unique correlation ID so its logs can be traced in Loki.
    job_id = str(uuid.uuid4())
    request_id_var.set(job_id)

    triggered_at = datetime.now(timezone.utc)

    # Separate session for the audit record so it persists even if the job session fails.
    run_db = SessionLocal()
    run = JobRun(job_name="email_reconciliation", triggered_at=triggered_at, status="running", data={})
    run_db.add(run)
    run_db.commit()

    db = SessionLocal()
    status = "failed"
    data: dict = {}
    try:
        logger.info(
            "email_reconciliation_started",
            extra={"event_type": "email_reconciliation_started", "job_id": job_id},
        )
        flow_result = reconcile_pending_emails(db)
        stripe_result = reconcile_stripe_billing_emails(db)
        data = {"flow_emails": flow_result, "stripe_emails": stripe_result}
        status = "success"
        logger.info(
            "email_reconciliation_completed",
            extra={
                "event_type": "email_reconciliation_completed",
                "job_id": job_id,
                "flow_emails": flow_result,
                "stripe_emails": stripe_result,
            },
        )
    except Exception:
        logger.exception(
            "email_reconciliation_failed",
            extra={"event_type": "email_reconciliation_failed", "job_id": job_id},
        )
    finally:
        db.close()
        completed_at = datetime.now(timezone.utc)
        run.completed_at = completed_at
        run.duration_ms = int((completed_at - triggered_at).total_seconds() * 1000)
        run.status = status
        run.data = data
        run_db.commit()
        run_db.close()


def start_scheduler() -> None:
    """Register all recurring jobs and start the scheduler."""
    from .stripe_reconciliation import stripe_reconciliation_job

    scheduler.add_job(
        reconciliation_job,
        IntervalTrigger(minutes=5),
        id="email_reconciliation",
        replace_existing=True,
        max_instances=1,
    )

    # Stripe subscription reconciliation — daily at 12:00 AM AEST (14:00 UTC)
    scheduler.add_job(
        stripe_reconciliation_job,
        CronTrigger(hour=14, minute=0, timezone="UTC"),
        id="stripe_reconciliation",
        replace_existing=True,
        max_instances=1,
    )

    scheduler.start()
    logger.info(
        "scheduler_started",
        extra={
            "event_type": "scheduler_started",
            "jobs": ["email_reconciliation (5 min)", "stripe_reconciliation (daily 14:00 UTC)"],
        },
    )


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info(
            "scheduler_stopped",
            extra={"event_type": "scheduler_stopped"},
        )
