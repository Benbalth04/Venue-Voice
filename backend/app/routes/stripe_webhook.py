"""Stripe webhook endpoint.

Authenticated via Stripe-Signature + STRIPE_WEBHOOK_SECRET. Valid signatures
that fail processing still receive 200; subscription reconciliation and
queued emails catch up via scheduled jobs.

Enable these events in the Stripe Dashboard webhook:
checkout.session.completed,
customer.subscription.created, customer.subscription.updated,
customer.subscription.deleted, customer.subscription.trial_will_end,
invoice.payment_succeeded, invoice.payment_failed,
charge.refunded.
"""
from __future__ import annotations

import logging
from typing import Any

import stripe
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..core.config import settings
from ..db.postgres import SessionLocal, get_db_connection
from ..services.billing.stripe_event_handler import (
    handle_stripe_webhook_event,
    try_record_stripe_webhook_idempotency,
)
from ..services.email import process_pending_stripe_emails

logger = logging.getLogger(__name__)

router = APIRouter()

_WEBHOOK_SECRET = settings.stripe_webhook_secret

_HANDLED_EVENTS = frozenset(
    {
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "customer.subscription.trial_will_end",
        "invoice.payment_succeeded",
        "invoice.payment_failed",
        "charge.refunded",
    }
)


def _event_to_dict(event: Any) -> dict[str, Any]:
    if isinstance(event, dict):
        return event
    try:
        if hasattr(event, "to_dict_recursive"):
            out = event.to_dict_recursive()
            if isinstance(out, dict):
                return out
    except Exception:
        pass
    try:
        out = event.to_dict()  # type: ignore[union-attr]
        if isinstance(out, dict):
            return out
    except Exception:
        pass
    try:
        return dict(event)
    except Exception:
        return {}


def _stripe_webhook_worker(event_dict: dict[str, Any]) -> None:
    db = SessionLocal()
    try:
        handle_stripe_webhook_event(db, event_dict)
        process_pending_stripe_emails(db, limit=50)
    except Exception:
        logger.exception(
            "Stripe webhook background worker failed event_id=%s type=%s",
            event_dict.get("id"),
            event_dict.get("type"),
        )
    finally:
        db.close()


@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    stripe_signature: str | None = Header(default=None, alias="stripe-signature"),
    db: Session = Depends(get_db_connection),
):
    """Verify signature, record idempotency, queue processing, return 200 quickly."""
    payload = await request.body()

    logger.debug(
        "Stripe webhook received payload_bytes=%s has_signature=%s",
        len(payload),
        bool(stripe_signature),
    )

    if not _WEBHOOK_SECRET:
        logger.error("STRIPE_WEBHOOK_SECRET is not configured — rejecting webhook")
        raise HTTPException(status_code=400, detail="Webhook secret not configured")

    if not stripe_signature:
        logger.warning("Stripe webhook received without Stripe-Signature header")
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=stripe_signature,
            secret=_WEBHOOK_SECRET,
        )
    except stripe.errors.SignatureVerificationError as exc:
        logger.warning("Stripe webhook signature verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except Exception as exc:
        logger.exception("Failed to parse Stripe webhook payload: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid webhook payload")

    event_dict = _event_to_dict(event)
    event_type = str(event_dict.get("type") or "")
    event_id = str(event_dict.get("id") or "")

    logger.info("Stripe webhook event type=%s id=%s", event_type, event_id)

    if event_type not in _HANDLED_EVENTS:
        logger.info("Ignoring unhandled Stripe event type: %s", event_type)
        return JSONResponse({"received": True})

    if not event_id:
        logger.error("Stripe event missing id — rejecting")
        raise HTTPException(status_code=400, detail="Invalid event payload")

    if not try_record_stripe_webhook_idempotency(
        db, stripe_event_id=event_id, event_type=event_type
    ):
        return JSONResponse({"received": True})

    background_tasks.add_task(_stripe_webhook_worker, event_dict)
    return JSONResponse({"received": True})
