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
    from ..db.postgres import SessionLocal
    from ..services.stripe_service import sync_subscription_from_stripe_object

    db = SessionLocal()
    synced = 0
    errors = 0

    try:
        logger.info("Stripe reconciliation job starting")

        # Page through all subscriptions in Stripe (limit 100 per page)
        params: dict = {"limit": 100, "expand": ["data.customer"]}
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

    except Exception:
        logger.exception("Unhandled error in Stripe reconciliation job")
    finally:
        db.close()
