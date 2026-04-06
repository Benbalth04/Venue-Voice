"""
Server-side QR generation, format conversion, and Supabase upload.

Immutability: assets are written once; storage uploads use upsert=false.
"""

from __future__ import annotations

import io
import logging
import os
import uuid
from urllib.parse import urlparse

import segno

from ..integrations.supabase_storage import (
    MIME_BY_FORMAT,
    delete_objects_best_effort,
    get_supabase_service_client,
    upload_qr_asset,
)
from ..core.errors.exceptions import ExternalAPIError, ValidationError

logger = logging.getLogger(__name__)

ERROR_CORRECTION = "h"
QUIET_ZONE_MODULES = 4
MAX_REDIRECT_URL_LEN = 2048
DEFAULT_QR_COLOR = "#000000"


class QRGeneratedAssets(dict[str, bytes]):
    """Maps format key -> raw bytes (svg, png)."""

    pass


def validate_redirect_url(redirect_url: str) -> None:
    if not redirect_url or len(redirect_url) > MAX_REDIRECT_URL_LEN:
        raise ValidationError(
            code="INVALID_REDIRECT_URL",
            message=f"redirect_url must be non-empty and at most {MAX_REDIRECT_URL_LEN} characters",
            status_code=422,
        )
    parsed = urlparse(redirect_url)
    if parsed.scheme not in ("http", "https"):
        raise ValidationError(
            code="INVALID_REDIRECT_URL",
            message="redirect_url must use http or https",
            status_code=422,
        )
    if not parsed.netloc:
        raise ValidationError(
            code="INVALID_REDIRECT_URL",
            message="redirect_url must include a host",
            status_code=422,
        )


def _pick_scale(qr: segno.QRCode, target: int = 600) -> int:
    scale = 4
    while scale < 80:
        w, _h = qr.symbol_size(scale=scale, border=QUIET_ZONE_MODULES)
        if w >= target:
            return scale
        scale += 1
    return 80


def generate_qr_bytes(*, redirect_url: str, color: str = DEFAULT_QR_COLOR) -> QRGeneratedAssets:
    """
    Build svg and png bytes for a redirect URL.
    Both formats use a transparent background; modules are rendered in `color` (hex).
    """
    validate_redirect_url(redirect_url)
    qr = segno.make(redirect_url, error=ERROR_CORRECTION, boost_error=True)
    scale = _pick_scale(qr, target=600)

    buf_png = io.BytesIO()
    qr.save(buf_png, kind="png", scale=scale, border=QUIET_ZONE_MODULES, dark=color, light=None)
    png_bytes = buf_png.getvalue()

    buf_svg = io.BytesIO()
    qr.save(buf_svg, kind="svg", scale=scale, border=QUIET_ZONE_MODULES, dark=color, light=None)
    svg_bytes = buf_svg.getvalue()

    return QRGeneratedAssets(
        {
            "svg": svg_bytes,
            "png": png_bytes,
        }
    )


def storage_path_for(qr_code_id: uuid.UUID, fmt: str) -> str:
    return f"{qr_code_id}/qr.{fmt}"


def upload_qr_assets_to_supabase(
    *,
    qr_code_id: uuid.UUID,
    assets: QRGeneratedAssets,
) -> tuple[dict[str, str], list[str]]:
    """
    Upload all formats; return (format -> storage_path, storage paths uploaded).
    On partial failure, removes completed uploads before raising.
    """
    client = get_supabase_service_client()
    paths: dict[str, str] = {}
    uploaded_paths: list[str] = []
    try:
        for fmt in ("svg", "png"):
            data = assets[fmt]
            path = storage_path_for(qr_code_id, fmt)
            upload_qr_asset(
                client=client,
                storage_path=path,
                data=data,
                mime_type=MIME_BY_FORMAT[fmt],
            )
            paths[fmt] = path
            uploaded_paths.append(path)
        return paths, uploaded_paths
    except Exception:
        delete_objects_best_effort(client, uploaded_paths)
        raise


def default_redirect_url_for_qr_id(qr_id: uuid.UUID) -> str:
    origin = os.getenv("FRONTEND_ORIGIN", "").rstrip("/")
    if not origin:
        raise ExternalAPIError(
            service_name="config",
            error_message="FRONTEND_ORIGIN is not configured",
            code="SERVER_MISCONFIGURATION",
            status_code=503,
        )
    return f"{origin}/r/{qr_id}"


def delete_storage_paths(paths: list[str]) -> None:
    """Best-effort removal after a failed DB transaction (uploads already succeeded)."""
    if not paths:
        return
    try:
        client = get_supabase_service_client()
        delete_objects_best_effort(client, paths)
    except Exception:
        logger.exception("Storage cleanup failed", extra={"paths": paths})
