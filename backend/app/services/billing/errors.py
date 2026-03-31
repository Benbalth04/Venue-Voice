"""Billing / Stripe email pipeline errors (internal; webhook still returns 200)."""


class StripeWebhookProcessingError(Exception):
    """Non-fatal processing error inside Stripe webhook pipeline."""


class StripeEmailEnqueueError(Exception):
    """Failed to persist a queued billing email row."""
