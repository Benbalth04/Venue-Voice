"""Stripe webhook endpoint.

This endpoint is intentionally NOT protected by JWT auth — Stripe calls it
directly.  Instead, every request is authenticated via the Stripe-Signature
header using our STRIPE_WEBHOOK_SECRET.

CLI → Production migration
---------------------------
During local development you use:
    stripe listen --forward-to http://localhost:5000/api/v1/webhooks/stripe

The CLI prints a signing secret (whsec_...) — put that in STRIPE_WEBHOOK_SECRET.

For production, register this URL in the Stripe Dashboard under
Developers → Webhooks and copy the signing secret from there into
STRIPE_WEBHOOK_SECRET.  No code changes required.
"""
from __future__ import annotations

import logging
import os

import stripe
from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..db.postgres import get_db_connection
from ..services.stripe_service import sync_subscription_from_stripe_object
from fastapi import Depends

logger = logging.getLogger(__name__)

router = APIRouter()

_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

# ---------------------------------------------------------------------------
# Events we care about — all others are acknowledged and ignored
# ---------------------------------------------------------------------------
_HANDLED_EVENTS = {
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.trial_will_end",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
}


@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="stripe-signature"),
    db: Session = Depends(get_db_connection),
):
    """Receive and process Stripe webhook events.

    Always returns 200 to Stripe as quickly as possible so it doesn't retry.
    Errors are logged but do not surface as non-200 responses unless the
    payload itself is invalid/unsigned (400).
    """
    payload = await request.body()

    print(f"[STRIPE WEBHOOK] Incoming request — payload size={len(payload)} has_sig={bool(stripe_signature)}")

    if not _WEBHOOK_SECRET:
        print("[STRIPE WEBHOOK] ERROR: STRIPE_WEBHOOK_SECRET is not configured")
        logger.error("STRIPE_WEBHOOK_SECRET is not configured — rejecting webhook")
        raise HTTPException(status_code=400, detail="Webhook secret not configured")

    if not stripe_signature:
        print("[STRIPE WEBHOOK] ERROR: Missing Stripe-Signature header")
        logger.warning("Stripe webhook received without Stripe-Signature header")
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=stripe_signature,
            secret=_WEBHOOK_SECRET,
        )
    except stripe.errors.SignatureVerificationError as exc:
        print(f"[STRIPE WEBHOOK] ERROR: Signature verification failed: {exc}")
        logger.warning("Stripe webhook signature verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except Exception as exc:
        print(f"[STRIPE WEBHOOK] ERROR: Failed to parse payload: {exc}")
        logger.exception("Failed to parse Stripe webhook payload: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid webhook payload")

    event_type: str = event["type"]
    event_id: str = event["id"]

    print(f"[STRIPE WEBHOOK] Received event type={event_type} id={event_id}")

    if event_type not in _HANDLED_EVENTS:
        print(f"[STRIPE WEBHOOK] Ignoring unhandled event type={event_type}")
        logger.info("Ignoring unhandled Stripe event type: %s", event_type)
        return JSONResponse({"received": True})

    print(f"[STRIPE WEBHOOK] Dispatching event type={event_type} id={event_id}")
    logger.info("Processing Stripe event: %s id=%s", event_type, event_id)

    try:
        _dispatch_event(event_type, event["data"]["object"], db)
        print(f"[STRIPE WEBHOOK] Successfully processed event type={event_type} id={event_id}")
    except Exception as exc:
        # Log but do NOT re-raise — returning 200 prevents Stripe retry spam.
        # The reconciliation job will catch any resulting inconsistency.
        print(f"[STRIPE WEBHOOK] ERROR processing event type={event_type} id={event_id}: {exc}")
        logger.exception(
            "Unhandled error processing Stripe event %s id=%s",
            event_type,
            event_id,
        )

    return JSONResponse({"received": True})


# ---------------------------------------------------------------------------
# Event dispatchers
# ---------------------------------------------------------------------------

def _dispatch_event(event_type: str, obj: dict, db: Session) -> None:
    if event_type == "checkout.session.completed":
        _handle_checkout_session_completed(obj, db)

    elif event_type in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "customer.subscription.trial_will_end",
    ):
        _handle_subscription_event(obj, db)

    elif event_type == "invoice.payment_succeeded":
        _handle_invoice_payment_succeeded(obj, db)

    elif event_type == "invoice.payment_failed":
        _handle_invoice_payment_failed(obj, db)


def _handle_checkout_session_completed(session_dict, db: Session) -> None:
    """On checkout completion, sync the created subscription immediately."""
    subscription_id = getattr(session_dict, "subscription", None) or (session_dict.get("subscription") if isinstance(session_dict, dict) else None)
    customer_id = getattr(session_dict, "customer", None) or (session_dict.get("customer") if isinstance(session_dict, dict) else None)
    print(f"[STRIPE WEBHOOK] checkout.session.completed — subscription_id={subscription_id} customer_id={customer_id}")
    if not subscription_id:
        print("[STRIPE WEBHOOK] checkout.session.completed has no subscription — skipping")
        return
    try:
        stripe_sub = stripe.Subscription.retrieve(subscription_id)
        sync_subscription_from_stripe_object(stripe_sub, db)
    except stripe.StripeError as exc:
        logger.error("Failed to retrieve Stripe subscription %s after checkout: %s", subscription_id, exc)
        raise


def _handle_subscription_event(stripe_sub_dict: dict, db: Session) -> None:
    """Sync the full subscription object into our database."""
    subscription_id: str = stripe_sub_dict["id"]
    print(f"[STRIPE WEBHOOK] _handle_subscription_event subscription_id={subscription_id}")
    try:
        stripe_sub = stripe.Subscription.retrieve(subscription_id)
        sync_subscription_from_stripe_object(stripe_sub, db)
    except stripe.StripeError as exc:
        print(f"[STRIPE WEBHOOK] ERROR retrieving subscription {subscription_id}: {exc}")
        logger.error("Failed to retrieve Stripe subscription %s: %s", subscription_id, exc)
        raise


def _handle_invoice_payment_succeeded(invoice_dict, db: Session) -> None:
    """On successful payment, re-sync the associated subscription."""
    subscription_id = getattr(invoice_dict, "subscription", None) or (invoice_dict.get("subscription") if isinstance(invoice_dict, dict) else None)
    print(f"[STRIPE WEBHOOK] _handle_invoice_payment_succeeded subscription_id={subscription_id}")
    if not subscription_id:
        print("[STRIPE WEBHOOK] invoice.payment_succeeded has no subscription — skipping")
        return
    try:
        stripe_sub = stripe.Subscription.retrieve(subscription_id)
        sync_subscription_from_stripe_object(stripe_sub, db)
    except stripe.StripeError as exc:
        print(f"[STRIPE WEBHOOK] ERROR syncing subscription after payment success {subscription_id}: {exc}")
        logger.error(
            "Failed to sync subscription after payment success %s: %s",
            subscription_id,
            exc,
        )
        raise


def _handle_invoice_payment_failed(invoice_dict, db: Session) -> None:
    """On failed payment, re-sync the associated subscription."""
    subscription_id = getattr(invoice_dict, "subscription", None) or (invoice_dict.get("subscription") if isinstance(invoice_dict, dict) else None)
    print(f"[STRIPE WEBHOOK] _handle_invoice_payment_failed subscription_id={subscription_id}")
    if not subscription_id:
        print("[STRIPE WEBHOOK] invoice.payment_failed has no subscription — skipping")
        return
    try:
        stripe_sub = stripe.Subscription.retrieve(subscription_id)
        sync_subscription_from_stripe_object(stripe_sub, db)
    except stripe.StripeError as exc:
        print(f"[STRIPE WEBHOOK] ERROR syncing subscription after payment failure {subscription_id}: {exc}")
        logger.error(
            "Failed to sync subscription after payment failure %s: %s",
            subscription_id,
            exc,
        )
        raise
