"""APScheduler-based reconciliation job for unsent email events.

The scheduler is started in main.py via the FastAPI lifespan hook and runs
reconcile_pending_emails every 5 minutes to deliver any emails that were not
sent due to application crashes or transient failures.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(timezone="UTC")


def reconciliation_job() -> None:
    """Entry point called by APScheduler. Opens its own DB session."""
    from ..db.postgres import SessionLocal
    from ..services.email_service import reconcile_pending_emails

    db = SessionLocal()
    try:
        logger.debug("Email reconciliation job starting")
        reconcile_pending_emails(db)
        logger.debug("Email reconciliation job complete")
    except Exception:
        logger.exception("Unhandled error in email reconciliation job")
    finally:
        db.close()


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
        "Scheduler started: email_reconciliation (5 min), "
        "stripe_reconciliation (daily 14:00 UTC / 12:00 AM AEST)"
    )


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Email reconciliation scheduler stopped")
