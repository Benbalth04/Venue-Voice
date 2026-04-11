import json
import time
import urllib.error
import uuid
from typing import TYPE_CHECKING, Any
from urllib.request import urlopen, Request

import sentry_sdk
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.logging_config import user_id_var
from ..db.postgres import get_db_connection
from ..models.postgres_model import User as UserORM
from ..core.errors.exceptions import AuthError, ExternalAPIError

bearer_scheme = HTTPBearer(auto_error=False)

_JWKS_CACHE: dict[str, Any] = {"fetched_at": 0.0, "jwks": None}
_JWKS_TTL_SECONDS = 60 * 10
_JKW_URL = settings.public_supabase_jwt_url


def _get_supabase_url() -> str:
    return settings.public_supabase_url.rstrip("/")


def _fetch_jwks() -> dict[str, Any]:
    now = time.time()
    if _JWKS_CACHE["jwks"] and (now - float(_JWKS_CACHE["fetched_at"])) < _JWKS_TTL_SECONDS:
        return _JWKS_CACHE["jwks"]

    req = Request(_JKW_URL, headers={"Accept": "application/json"})
    try:
        with urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
    except (urllib.error.URLError, OSError, TimeoutError) as e:
        raise ExternalAPIError(
            service_name="supabase_jwks",
            error_message=f"Could not reach Supabase JWKS endpoint: {e}",
            code="JWKS_FETCH_FAILED",
            status_code=503,
        ) from e

    try:
        jwks = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ExternalAPIError(
            service_name="supabase_jwks",
            error_message="JWKS response was not valid JSON",
            code="JWKS_PARSE_FAILED",
            status_code=503,
        ) from e

    _JWKS_CACHE["jwks"] = jwks
    _JWKS_CACHE["fetched_at"] = now
    return jwks


def _issuer() -> str:
    # Supabase sets iss = {SUPABASE_URL}/auth/v1
    return f"{_get_supabase_url()}/auth/v1"


def verify_supabase_jwt(token: str) -> dict[str, Any]:
    try:
        jwks = _fetch_jwks()
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if not kid:
            raise AuthError(code="MISSING_KID", message="Missing kid")

        keys = jwks.get("keys", [])
        key = next((k for k in keys if k.get("kid") == kid), None)
        if not key:
            # refresh once in case of rotation
            _JWKS_CACHE["jwks"] = None
            jwks = _fetch_jwks()
            keys = jwks.get("keys", [])
            key = next((k for k in keys if k.get("kid") == kid), None)
        if not key:
            raise AuthError(code="UNKNOWN_KID", message="Unknown kid")

        audience = settings.public_supabase_jwt_aud
        payload = jwt.decode(
            token,
            key,
            algorithms=["ES256", "RS256"],
            issuer=_issuer(),
            audience=audience,
            options={"verify_at_hash": False},
        )
        return payload
    except AuthError:
        raise
    except ExternalAPIError:
        raise
    except Exception as e:
        raise AuthError(code="INVALID_TOKEN", message=f"Invalid token: {e}")


def get_current_user_payload(creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),) -> dict[str, Any]:
    if not creds or not creds.credentials:
        raise AuthError(code="MISSING_BEARER_TOKEN", message="Missing bearer token")
    return verify_supabase_jwt(creds.credentials)

def _ensure_application_user(jwt_payload: dict[str, Any], db: Session,) -> UserORM:

    sub = jwt_payload.get("sub")
    email = jwt_payload.get("email")
    meta = jwt_payload.get("user_metadata") or {}
    is_verified = bool(jwt_payload.get("email_confirmed_at"))

    if not sub:
        raise AuthError(code="INVALID_TOKEN", message="Invalid token: missing sub")

    user_id = uuid.UUID(str(sub))
    existing = db.query(UserORM).filter(UserORM.id == user_id).first()

    if not existing and email:
        # Fallback: same email already exists under a different Supabase sub
        existing = db.query(UserORM).filter(UserORM.email == str(email)).first()

    if existing:
        # Sync email_verified status if it changed
        if is_verified and not existing.email_verified:
            existing.email_verified = True
            db.commit()
            db.refresh(existing)
        return existing

    first_name = str(meta.get("first_name") or "User")
    last_name = str(meta.get("last_name") or "Unknown")
    new_user = UserORM(
        id=user_id,
        email=str(email or ""),
        first_name=first_name,
        last_name=last_name,
        onboarding_complete=False,
        email_verified=is_verified,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


def get_current_user(
    jwt_payload: dict[str, Any] = Depends(get_current_user_payload), db_session = Depends(get_db_connection),):
    """Verify JWT, auto-bootstrap user if missing, return application user."""
    user = _ensure_application_user(jwt_payload, db_session)
    # Propagate the resolved user_id into the logging and Sentry contexts so
    # every subsequent log call within this request includes user_id.
    user_id_str = str(user.id)
    user_id_var.set(user_id_str)
    sentry_sdk.set_user({"id": user_id_str})
    return user
