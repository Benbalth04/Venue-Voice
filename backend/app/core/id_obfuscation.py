"""
Reversible opaque IDs for API JSON and URL segments.

Raw UUIDs in responses are replaced with signed URL-safe tokens so clients never
see internal database IDs. Incoming tokens are verified and expanded back to
UUIDs before routing and handlers run.

This is signing (HMAC), not one-way hashing — the server must be able to recover
the original UUID.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import parse_qsl, urlencode

from itsdangerous import BadSignature, URLSafeSerializer

# Standard UUID string form (any version / variant hex)
UUID_STRING_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z",
    re.IGNORECASE,
)

SERIALIZER_SALT = "venue-voice-api-public-id-v1"


def _serializer(secret: str) -> URLSafeSerializer:
    return URLSafeSerializer(secret, salt=SERIALIZER_SALT)


def encode_public_id(secret: str, uuid_str: str) -> str:
    """Turn a canonical UUID string into an opaque public token."""
    return _serializer(secret).dumps(uuid_str.lower())


def decode_public_id(secret: str, token: str) -> str | None:
    """Verify token and return lowercase UUID string, or None if invalid."""
    try:
        raw = _serializer(secret).loads(token)
    except BadSignature:
        return None
    if not isinstance(raw, str) or not UUID_STRING_RE.match(raw):
        return None
    return raw.lower()


def _transform_json_uuid_strings_only(data: Any, fn) -> Any:
    if isinstance(data, dict):
        return {k: _transform_json_uuid_strings_only(v, fn) for k, v in data.items()}
    if isinstance(data, list):
        return [_transform_json_uuid_strings_only(item, fn) for item in data]
    if isinstance(data, str) and UUID_STRING_RE.match(data):
        return fn(data)
    return data


def _transform_json_all_strings(data: Any, fn) -> Any:
    if isinstance(data, dict):
        return {k: _transform_json_all_strings(v, fn) for k, v in data.items()}
    if isinstance(data, list):
        return [_transform_json_all_strings(item, fn) for item in data]
    if isinstance(data, str):
        return fn(data)
    return data


def obfuscate_json_tree(secret: str, data: Any) -> Any:
    """Replace UUID-looking strings with signed tokens (outbound)."""

    def enc(s: str) -> str:
        return encode_public_id(secret, s)

    return _transform_json_uuid_strings_only(data, enc)


def reveal_json_tree(secret: str, data: Any) -> Any:
    """Replace signed tokens with UUID strings where valid (inbound)."""

    def dec(s: str) -> str:
        if UUID_STRING_RE.match(s):
            return s.lower()
        revealed = decode_public_id(secret, s)
        return revealed if revealed is not None else s

    return _transform_json_all_strings(data, dec)


def rewrite_path(path: str, secret: str) -> str:
    if not path or path == "/":
        return path
    parts = path.split("/")
    out: list[str] = []
    for segment in parts:
        if not segment:
            out.append(segment)
            continue
        if UUID_STRING_RE.match(segment):
            out.append(segment)
            continue
        revealed = decode_public_id(secret, segment)
        out.append(revealed if revealed is not None else segment)
    return "/".join(out)


def rewrite_query_string(qs: bytes, secret: str) -> bytes:
    if not qs:
        return qs
    try:
        text = qs.decode("latin-1")
    except UnicodeDecodeError:
        return qs
    pairs = parse_qsl(text, keep_blank_values=True)
    if not pairs:
        return qs
    new_pairs: list[tuple[str, str]] = []
    for key, value in pairs:
        if UUID_STRING_RE.match(value):
            new_pairs.append((key, value))
        else:
            revealed = decode_public_id(secret, value)
            new_pairs.append((key, revealed if revealed is not None else value))
    return urlencode(new_pairs, doseq=True).encode("latin-1")


def maybe_parse_transform_json_body(body: bytes, secret: str) -> bytes:
    if not body:
        return body
    try:
        text = body.decode("utf-8")
        parsed = json.loads(text)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return body
    transformed = reveal_json_tree(secret, parsed)
    new_text = json.dumps(transformed, separators=(",", ":"), ensure_ascii=False)
    return new_text.encode("utf-8")


def maybe_transform_json_response_body(body: bytes, secret: str) -> bytes:
    if not body:
        return body
    try:
        text = body.decode("utf-8")
        parsed = json.loads(text)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return body
    transformed = obfuscate_json_tree(secret, parsed)
    new_text = json.dumps(transformed, separators=(",", ":"), ensure_ascii=False)
    return new_text.encode("utf-8")
