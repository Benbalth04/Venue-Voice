"""Stripe subscription reconciliation job.

Runs daily at 12:00 AM AEST (14:00 UTC) via APScheduler.

Purpose
-------
If our server was down or a webhook was missed, local subscription records can
drift out of sync with Stripe.  This job pages through every subscription in
Stripe and upserts any discrepancies into the database, ensuring eventual
consistency without relying solely on webhooks.

This job is registered in main.py alongside the email reconciliation job.
It is intentionally NOT exposed as a public HTTP endpoint.
"""
from __future__ import annotations

import logging

import stripe

logger = logging.getLogger(__name__)


def stripe_reconciliation_job() -> None:
    """Entry point called by APScheduler.  Opens its own DB session."""
    from datetime import datetime, timezone

    from ..db.postgres import SessionLocal
    from ..models.postgres_model import JobRun
    from ..services.stripe_service import sync_subscription_from_stripe_object

    triggered_at = datetime.now(timezone.utc)

    # Separate session for the audit record so it persists even if the job session fails.
    run_db = SessionLocal()
    run = JobRun(job_name="stripe_reconciliation", triggered_at=triggered_at, status="running", data={})
    run_db.add(run)
    run_db.commit()

    db = SessionLocal()
    synced = 0
    errors = 0
    status = "failed"

    try:
        logger.info("Stripe reconciliation job starting")

        # Page through all subscriptions in Stripe (limit 100 per page)
        params: dict = {"limit": 100, "expand": ["data.customer", "data.items.data.price"]}
        has_more = True
        starting_after: str | None = None

        while has_more:
            if starting_after:
                params["starting_after"] = starting_after

            try:
                page = stripe.Subscription.list(**params)
            except stripe.StripeError as exc:
                logger.error("Stripe API error during reconciliation: %s", exc)
                break

            for stripe_sub in page.data:
                try:
                    sync_subscription_from_stripe_object(stripe_sub, db)
                    synced += 1
                except Exception:
                    logger.exception(
                        "Failed to reconcile subscription %s", stripe_sub.id
                    )
                    errors += 1

            has_more = page.has_more
            if has_more and page.data:
                starting_after = page.data[-1].id

        logger.info(
            "Stripe reconciliation complete — synced=%d errors=%d",
            synced,
            errors,
        )
        status = "success"

    except Exception:
        logger.exception("Unhandled error in Stripe reconciliation job")
    finally:
        db.close()
        completed_at = datetime.now(timezone.utc)
        run.completed_at = completed_at
        run.duration_ms = int((completed_at - triggered_at).total_seconds() * 1000)
        run.status = status
        run.data = {"subscriptions_synced": synced, "subscriptions_failed": errors}
        run_db.commit()
        run_db.close()
