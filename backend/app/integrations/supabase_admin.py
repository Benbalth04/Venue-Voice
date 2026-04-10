"""Supabase Admin API integration for user management.

Uses the service role key to call privileged Supabase auth endpoints.
The service role key is already present in settings as supabase_service_role_key.

Supabase invite flow:
  POST /auth/v1/invite  →  creates a new auth user (or returns existing) and
  sends a magic-link / invite email. The response includes the user's UUID.

Edge cases handled:
  - If the email already exists in Supabase auth, the endpoint returns the
    existing user (no new account created, invite email still sent).
  - On HTTP error the function raises ExternalAPIError so the route layer
    returns a consistent 502 response.
"""
from __future__ import annotations

import json
import logging
from collections.abc import Iterable

import httpx

from ..core.config import settings
from ..core.errors.exceptions import ConflictError, ExternalAPIError

logger = logging.getLogger(__name__)


def _admin_headers() -> dict[str, str]:
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }


def invite_user_by_email(
    *,
    email: str,
    first_name: str,
    last_name: str,
) -> dict:
    """Invite a user via the Supabase Admin API.

    Returns the Supabase user dict (always includes 'id': UUID string).
    Raises ExternalAPIError on non-2xx responses.
    """
    url = f"{settings.public_supabase_url}/auth/v1/invite"
    headers = _admin_headers()
    redirect_to = f"{settings.app_origin}/auth/callback?type=invite"
    payload = {
        "email": email,
        "data": {
            "first_name": first_name,
            "last_name": last_name,
        },
        "redirect_to": redirect_to,
    }

    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=15.0)
    except httpx.RequestError as exc:
        raise ExternalAPIError(
            service_name="Supabase Admin",
            error_message=f"Network error contacting Supabase: {exc}",
        )

    if response.status_code == 422:
        # Supabase returns 422 when the email is already registered
        # and an active invite is pending — treat as a re-invite (return existing user)
        try:
            data = response.json()
        except json.JSONDecodeError:
            logger.warning("Supabase returned non-JSON 422 response: %s", response.text[:200])
            data = {}
        # If it's a "user already registered" scenario, we still get back user data
        # Some Supabase versions return 200 for existing users; handle both
        if "id" in data:
            return data

    if not response.is_success:
        raise ExternalAPIError(
            service_name="Supabase Admin",
            error_message=(
                f"Supabase invite failed with status {response.status_code}: "
                f"{response.text[:200]}"
            ),
        )

    try:
        data = response.json()
    except json.JSONDecodeError as e:
        raise ExternalAPIError(
            service_name="Supabase Admin",
            error_message="Non-JSON response from Supabase invite endpoint",
            code="SUPABASE_PARSE_ERROR",
        ) from e
    if "id" not in data:
        raise ExternalAPIError(
            service_name="Supabase Admin",
            error_message="Unexpected Supabase response: missing 'id' field.",
        )

    return data


def revoke_user_sessions(user_id: str) -> None:
    """Sign out all active sessions for a Supabase user (best-effort).

    Uses POST /auth/v1/admin/users/{user_id}/logout with scope=global.
    Logs a warning on failure but does NOT raise — membership deletion
    is already committed by the time this is called.
    """
    url = f"{settings.public_supabase_url}/auth/v1/admin/users/{user_id}/logout"
    headers = _admin_headers()
    try:
        response = httpx.post(url, json={"scope": "global"}, headers=headers, timeout=10.0)
        if not response.is_success:
            logger.warning(
                "Supabase session revocation failed for user %s: %s %s",
                user_id,
                response.status_code,
                response.text[:200],
            )
    except httpx.RequestError as exc:
        logger.warning(
            "Supabase session revocation network error for user %s: %s",
            user_id,
            exc,
        )


def send_password_reset_email(email: str) -> None:
    """Send a Supabase password recovery email via the Admin API.

    Uses the service role key so the request is not rate-limited by anon key quotas.
    Supabase returns 200 for both known and unknown emails — we never disclose existence.
    Raises ExternalAPIError on non-2xx responses.
    """
    url = f"{settings.public_supabase_url}/auth/v1/recover"
    redirect_to = f"{settings.app_origin}/auth/callback?type=recovery"
    headers = _admin_headers()

    try:
        response = httpx.post(
            url,
            json={"email": email},
            params={"redirect_to": redirect_to},
            headers=headers,
            timeout=15.0,
        )
    except httpx.RequestError as exc:
        raise ExternalAPIError(
            service_name="Supabase Admin",
            error_message=f"Network error contacting Supabase: {exc}",
        ) from exc

    if not response.is_success:
        raise ExternalAPIError(
            service_name="Supabase Admin",
            error_message=(
                f"Supabase recovery request failed with status {response.status_code}: "
                f"{response.text[:200]}"
            ),
        )


def get_last_sign_in_map(user_ids: Iterable[str]) -> dict[str, str | None]:
    """Return Supabase last_sign_in_at keyed by user_id.

    This is best-effort: failures are logged and missing entries return None.
    """
    ids = {str(uid).strip() for uid in user_ids if str(uid).strip()}
    if not ids:
        return {}

    base_url = f"{settings.public_supabase_url}/auth/v1/admin/users"
    headers = _admin_headers()
    result: dict[str, str | None] = {uid: None for uid in ids}

    try:
        with httpx.Client(timeout=10.0) as client:
            for uid in ids:
                try:
                    response = client.get(f"{base_url}/{uid}", headers=headers)
                except httpx.RequestError as exc:
                    logger.warning("Supabase user lookup network error for %s: %s", uid, exc)
                    continue

                if not response.is_success:
                    logger.warning(
                        "Supabase user lookup failed for %s: %s %s",
                        uid,
                        response.status_code,
                        response.text[:200],
                    )
                    continue

                try:
                    payload = response.json()
                except json.JSONDecodeError:
                    logger.warning("Supabase returned non-JSON response for user %s", uid)
                    continue
                # GoTrue returns the user either nested under "user" or as the top-level object
                # (same as auth-js _userResponse: data.user ?? data).
                user_data: dict | None = None
                if isinstance(payload, dict):
                    nested = payload.get("user")
                    if isinstance(nested, dict):
                        user_data = nested
                    elif isinstance(payload.get("id"), str):
                        user_data = payload
                if isinstance(user_data, dict):
                    result[uid] = user_data.get("last_sign_in_at")
    except Exception as exc:  # defensive: keep list users endpoint resilient
        logger.warning("Supabase last_sign_in map failed: %s", exc)

    return result
