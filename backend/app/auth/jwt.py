import json
import os
import time
from typing import Any
from urllib.request import urlopen, Request

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt

bearer_scheme = HTTPBearer(auto_error=False)

_JWKS_CACHE: dict[str, Any] = {"fetched_at": 0.0, "jwks": None}
_JWKS_TTL_SECONDS = 60 * 10


def _get_supabase_url() -> str:
    url = os.getenv("SUPABASE_URL")
    if not url:
        raise RuntimeError("SUPABASE_URL is not set")
    return url.rstrip("/")


def _jwks_url() -> str:
    # Supabase JWKS endpoint
    return f"{_get_supabase_url()}/auth/v1/keys"


def _fetch_jwks() -> dict[str, Any]:
    now = time.time()
    if _JWKS_CACHE["jwks"] and (now - float(_JWKS_CACHE["fetched_at"])) < _JWKS_TTL_SECONDS:
        return _JWKS_CACHE["jwks"]

    req = Request(_jwks_url(), headers={"Accept": "application/json"})
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

        audience = os.getenv("SUPABASE_JWT_AUD", "authenticated")
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=_issuer(),
            audience=audience,
            options={"verify_at_hash": False},
        )
        return payload
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def get_current_user_payload(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    return verify_supabase_jwt(creds.credentials)

