"""
ASGI middleware: obfuscate UUIDs in JSON responses and path/query/body on the way in.
"""

from __future__ import annotations

import logging
import os
from typing import Callable

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from ..core.id_obfuscation import (
    maybe_parse_transform_json_body,
    maybe_transform_json_response_body,
    rewrite_path,
    rewrite_query_string,
)

logger = logging.getLogger(__name__)


def _obfuscation_config() -> tuple[bool, str | None]:
    secret = (os.getenv("API_ID_SIGNING_SECRET") or "").strip()
    env_flag = os.getenv("API_ID_OBFUSCATION_ENABLED", "").strip().lower()
    if env_flag in ("0", "false", "no", "off"):
        return False, secret or None
    if env_flag in ("1", "true", "yes", "on"):
        if not secret:
            logger.warning("API_ID_OBFUSCATION_ENABLED=true but API_ID_SIGNING_SECRET is empty; skipping")
            return False, None
        return True, secret
    if secret:
        return True, secret
    return False, None


class IDObfuscationMiddleware:
    """Encode UUIDs in JSON responses; decode opaque tokens in path, query, and JSON body."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.enabled, self.secret = _obfuscation_config()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not self.enabled or not self.secret:
            await self.app(scope, receive, send)
            return

        scope = dict(scope)
        path = scope.get("path") or ""
        if path:
            scope["path"] = rewrite_path(path, self.secret)
        qs = scope.get("query_string") or b""
        if qs:
            scope["query_string"] = rewrite_query_string(qs, self.secret)

        receive_ = self._wrap_receive(receive, scope)
        send_ = self._wrap_send(send)
        await self.app(scope, receive_, send_)

    def _wrap_receive(self, receive: Receive, scope: Scope) -> Receive:
        method = scope.get("method", "GET").upper()
        if method not in ("POST", "PUT", "PATCH", "DELETE"):
            return receive

        headers = Headers(scope=scope)
        content_type = headers.get("content-type", "")
        if "application/json" not in content_type.lower():
            return receive

        consumed = False

        async def receive_wrapper() -> Message:
            nonlocal consumed
            if consumed:
                return {"type": "http.disconnect"}
            consumed = True
            body = b""
            while True:
                message = await receive()
                if message["type"] != "http.request":
                    return message
                body += message.get("body", b"")
                if not message.get("more_body", False):
                    break
            if body and self.secret:
                body = maybe_parse_transform_json_body(body, self.secret)
            return {"type": "http.request", "body": body, "more_body": False}

        return receive_wrapper

    def _wrap_send(self, send: Send) -> Send:
        start_msg: Message | None = None
        body_buf: list[bytes] = []

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                nonlocal start_msg
                start_msg = message
                return
            if message["type"] == "http.response.body":
                body_buf.append(message.get("body", b""))
                if message.get("more_body", False):
                    return
                assert start_msg is not None
                raw = b"".join(body_buf)
                headers = MutableHeaders(scope=start_msg)
                ct = headers.get("content-type", "")
                new_body = raw
                if raw and "application/json" in ct.lower():
                    new_body = maybe_transform_json_response_body(raw, self.secret)
                    if "content-length" in headers:
                        headers["content-length"] = str(len(new_body))
                await send(start_msg)
                await send({"type": "http.response.body", "body": new_body, "more_body": False})
                return
            await send(message)

        return send_wrapper
