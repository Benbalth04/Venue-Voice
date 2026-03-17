import json
import os
import time
import uuid
from typing import TYPE_CHECKING, Any
from urllib.request import urlopen, Request

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from sqlalchemy.orm import Session

from ..db.postgres import get_db_connection
from ..models.postgres_model import User as UserORM

bearer_scheme = HTTPBearer(auto_error=False)

_JWKS_CACHE: dict[str, Any] = {"fetched_at": 0.0, "jwks": None}
_JWKS_TTL_SECONDS = 60 * 10
_JKW_URL = os.getenv("PUBLIC_SUPABASE_JWT_URL")


def _get_supabase_url() -> str:
    url = os.getenv("PUBLIC_SUPABASE_URL")
    if not url:
        raise RuntimeError("PUBLIC_SUPABASE_URL is not set")
    return url.rstrip("/")


def _fetch_jwks() -> dict[str, Any]:
    now = time.time()
    if _JWKS_CACHE["jwks"] and (now - float(_JWKS_CACHE["fetched_at"])) < _JWKS_TTL_SECONDS:
        return _JWKS_CACHE["jwks"]

    req = Request(_JKW_URL, headers={"Accept": "application/json"})
    with urlopen(req, timeout=10) as resp:
        raw = resp.read().decode("utf-8")
        jwks = json.loads(raw)

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
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing kid")

        keys = jwks.get("keys", [])
        key = next((k for k in keys if k.get("kid") == kid), None)
        if not key:
            # refresh once in case of rotation
            _JWKS_CACHE["jwks"] = None
            jwks = _fetch_jwks()
            keys = jwks.get("keys", [])
            key = next((k for k in keys if k.get("kid") == kid), None)
        if not key:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown kid")

        audience = os.getenv("PUBLIC_SUPABASE_JWT_AUD")
        payload = jwt.decode(
            token,
            key,
            algorithms=["ES256", "RS256"],
            issuer=_issuer(),
            audience=audience,
            options={"verify_at_hash": False},
        )
        return payload
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")


def get_current_user_payload(creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),) -> dict[str, Any]:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    return verify_supabase_jwt(creds.credentials)

def _ensure_application_user(jwt_payload: dict[str, Any], db: Session,) -> UserORM:

    sub = jwt_payload.get("sub")
    email = jwt_payload.get("email")
    meta = jwt_payload.get("user_metadata") or {}

    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token: missing sub")

    user_id = uuid.UUID(str(sub))
    existing = db.query(UserORM).filter(UserORM.id == user_id).first()
    if existing:
        return existing

    first_name = str(meta.get("first_name") or "User")
    last_name = str(meta.get("last_name") or "Unknown")
    new_user = UserORM(
        id=user_id,
        email=str(email or ""),
        first_name=first_name,
        last_name=last_name,
        onboarding_complete=False,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


def get_current_user(
    jwt_payload: dict[str, Any] = Depends(get_current_user_payload), db_session = Depends(get_db_connection),):
    """Verify JWT, auto-bootstrap user if missing, return application user."""
    return _ensure_application_user(jwt_payload, db_session)

