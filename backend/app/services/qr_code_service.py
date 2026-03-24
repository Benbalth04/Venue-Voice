"""
Server-side QR generation, optional logo embedding, format conversion, and Supabase upload.

Immutability: assets are written once; storage uploads use upsert=false.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import uuid
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

import requests
import segno
from PIL import Image

from ..integrations.supabase_storage import (
    MIME_BY_FORMAT,
    delete_objects_best_effort,
    get_supabase_service_client,
    upload_qr_asset,
)
from ..core.errors.exceptions import ExternalAPIError, ValidationError

logger = logging.getLogger(__name__)

# Tunables (future: logo_size_pct, colors — keep centralized)
ERROR_CORRECTION = "h"
QUIET_ZONE_MODULES = 4
LOGO_FRACTION_MAX = 0.2
MAX_REDIRECT_URL_LEN = 2048
LOGO_FETCH_TIMEOUT_S = 20


class QRGeneratedAssets(dict[str, bytes]):
    """Maps format key -> raw bytes (svg, png, jpeg)."""

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


def _load_logo_raster(logo_url: str, max_px: int) -> Image.Image | None:
    """Download logo (SVG supported), convert coloured pixels to black, background to white."""
    try:
        resp = requests.get(logo_url, timeout=LOGO_FETCH_TIMEOUT_S)
        resp.raise_for_status()
        data = resp.content
        ctype = (resp.headers.get("Content-Type") or "").lower()

        # --- Load image ---
        if "svg" in ctype or data.strip().startswith(b"<svg"):
            try:
                import cairosvg
            except ImportError:
                logger.error("cairosvg is required to render SVG logos")
                return None

            out = io.BytesIO()
            cairosvg.svg2png(bytestring=data, write_to=out, output_width=max_px)
            out.seek(0)
            im = Image.open(out).convert("RGBA")
        else:
            im = Image.open(io.BytesIO(data)).convert("RGBA")

        # Resize
        im.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)

        # --- Key fix: use alpha channel ---
        r, g, b, a = im.split()

        # Create white background
        white_bg = Image.new("RGB", im.size, (255, 255, 255))

        # Create black foreground
        black_fg = Image.new("RGB", im.size, (0, 0, 0))

        # Use alpha as mask: only draw where logo exists
        result = Image.composite(black_fg, white_bg, a)

        return result

    except Exception as e:
        logger.exception("Logo processing failed", extra={"error": str(e), "logo_url": logo_url})
        return None


def _compose_png_with_logo(qr_png_bytes: bytes, logo: Image.Image) -> bytes:
    qr_im = Image.open(io.BytesIO(qr_png_bytes)).convert("RGBA")
    w, h = qr_im.size

    box = int(min(w, h) * LOGO_FRACTION_MAX)
    box = max(box, 8)

    # Resize logo
    logo_resized = logo.copy()
    logo_resized.thumbnail((box, box), Image.Resampling.LANCZOS)

    padding = 0   # white space around logo
    border = int(box * 0.05) # black border thickness

    inner_size = box - 2 * (padding + border)
    inner_size = max(inner_size, 1)

    logo_resized.thumbnail((inner_size, inner_size), Image.Resampling.LANCZOS)

    # --- Create layers ---
    # Base white square
    pad = Image.new("RGB", (box, box), (255, 255, 255))

    # Draw black border
    for x in range(box):
        for y in range(box):
            if (
                x < border
                or x >= box - border
                or y < border
                or y >= box - border
            ):
                pad.putpixel((x, y), (0, 0, 0))

    # Paste logo inside (centered)
    lx = (box - logo_resized.width) // 2
    ly = (box - logo_resized.height) // 2
    pad.paste(logo_resized, (lx, ly))

    # --- Composite onto QR ---
    cx = (w - box) // 2
    cy = (h - box) // 2

    base = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    base.paste(qr_im, (0, 0))
    base.paste(pad, (cx, cy))

    out = io.BytesIO()
    base.convert("RGB").save(out, format="PNG", optimize=True)
    return out.getvalue()


def generate_qr_bytes(
    *,
    redirect_url: str,
    has_logo: bool,
) -> QRGeneratedAssets:
    """
    Build svg, png, and jpeg bytes for a redirect URL.
    Logo is loaded from QR_LOGO_URL when has_logo is True; failures fall back to QR without logo.
    """
    validate_redirect_url(redirect_url)
    qr = segno.make(redirect_url, error=ERROR_CORRECTION, boost_error=True)
    scale = _pick_scale(qr, target=600)

    buf_png = io.BytesIO()
    qr.save(buf_png, kind="png", scale=scale, border=QUIET_ZONE_MODULES)
    png_bytes = buf_png.getvalue()

    logo_url = os.getenv("QR_LOGO_URL", "").strip()
    applied_logo = False
    if has_logo and logo_url:
        w, _h = qr.symbol_size(scale=scale, border=QUIET_ZONE_MODULES)
        max_logo = int(min(w, _h) * LOGO_FRACTION_MAX)
        logo_r = _load_logo_raster(logo_url, max_logo)
        if logo_r is not None:
            try:
                png_bytes = _compose_png_with_logo(png_bytes, logo_r)
                applied_logo = True
            except Exception as e:
                logger.exception(
                    "Logo compositing failed; using QR without logo",
                    extra={"error": str(e)},
                )
        else:
            logger.warning(
                "Logo unavailable; using QR without logo",
                extra={"has_logo": has_logo, "logo_configured": bool(logo_url)},
            )
    elif has_logo and not logo_url:
        logger.warning("has_logo=True but QR_LOGO_URL is not set; generating QR without logo")

    # JPEG (white background)
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    jbuf = io.BytesIO()
    im.save(jbuf, format="JPEG", quality=92, optimize=True)
    jpeg_bytes = jbuf.getvalue()

    # SVG: vector QR; if logo applied on raster, overlay matching box using PNG preview of logo area
    buf_svg = io.BytesIO()
    qr.save(buf_svg, kind="svg", scale=scale, border=QUIET_ZONE_MODULES)
    svg_str = buf_svg.getvalue().decode("utf-8")

    if applied_logo:
        svg_str = _svg_embed_logo_overlay(svg_str, png_bytes)

    return QRGeneratedAssets(
        {
            "svg": svg_str.encode("utf-8"),
            "png": png_bytes,
            "jpeg": jpeg_bytes,
        }
    )


def _svg_embed_logo_overlay(svg_xml: str, qr_png_with_logo: bytes) -> str:
    """
    Wrap the final raster (with logo) as SVG so PNG/JPEG/SVG share the same appearance.
    Pure vector SVG is used when this is not called.
    """
    try:
        root = ET.fromstring(svg_xml)
        w = root.get("width")
        h = root.get("height")
    except ET.ParseError:
        return svg_xml
    if not w or not h:
        return svg_xml
    b64 = base64.standard_b64encode(qr_png_with_logo).decode("ascii")
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}">'
        f'<image href="data:image/png;base64,{b64}" x="0" y="0" width="{w}" height="{h}" '
        'preserveAspectRatio="xMidYMid meet"/>'
        "</svg>"
    )


def storage_path_for(qr_code_id: uuid.UUID, fmt: str) -> str:
    return f"{qr_code_id}/qr.{fmt}"


def upload_qr_assets_to_supabase(
    *,
    qr_code_id: uuid.UUID,
    assets: QRGeneratedAssets,
) -> tuple[dict[str, str], list[str]]:
    """
    Upload all formats; return (format -> public_url, storage paths uploaded).
    On partial failure, removes completed uploads before raising.
    """
    client = get_supabase_service_client()
    urls: dict[str, str] = {}
    uploaded_paths: list[str] = []
    try:
        for fmt in ("svg", "png", "jpeg"):
            data = assets[fmt]
            path = storage_path_for(qr_code_id, fmt)
            url = upload_qr_asset(
                client=client,
                storage_path=path,
                data=data,
                mime_type=MIME_BY_FORMAT[fmt],
            )
            urls[fmt] = url
            uploaded_paths.append(path)
        return urls, uploaded_paths
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
