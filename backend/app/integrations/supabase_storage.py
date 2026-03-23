"""Upload helpers for Supabase Storage (qr-codes bucket)."""

from __future__ import annotations

import logging
import os
import time
from supabase import Client, create_client

from ..core.errors.exceptions import ExternalAPIError

logger = logging.getLogger(__name__)

QR_CODES_BUCKET = "qr-codes"
MAX_UPLOAD_BYTES = 8 * 1024 * 1024

MIME_BY_FORMAT: dict[str, str] = {
    "svg": "image/svg+xml",
    "png": "image/png",
    "jpeg": "image/jpeg",
}


def get_supabase_service_client() -> Client:
    url = os.getenv("PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ExternalAPIError(
            service_name="supabase",
            error_message="Supabase storage is not configured (PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
            code="SUPABASE_NOT_CONFIGURED",
            status_code=503,
        )
    return create_client(url, key)


def _public_url_for_path(client: Client, bucket: str, storage_path: str) -> str:
    return client.storage.from_(bucket).get_public_url(storage_path)


def upload_qr_asset(
    *,
    client: Client,
    storage_path: str,
    data: bytes,
    mime_type: str,
    max_retries: int = 2,
) -> str:
    if len(data) > MAX_UPLOAD_BYTES:
        raise ExternalAPIError(
            service_name="supabase",
            error_message="QR asset exceeds maximum upload size",
            code="QR_ASSET_TOO_LARGE",
            details={"size": len(data), "max": MAX_UPLOAD_BYTES},
        )

    last_err: str | None = None
    for attempt in range(max_retries):
        try:
            client.storage.from_(QR_CODES_BUCKET).upload(
                storage_path,
                data,
                file_options={
                    "content-type": mime_type,
                    "upsert": "false",
                },
            )
            url = _public_url_for_path(client, QR_CODES_BUCKET, storage_path)
            if not url:
                raise RuntimeError("empty public URL")
            return url
        except Exception as e:
            last_err = str(e)
            msg = (last_err or "").lower()
            if "duplicate" in msg or "already exists" in msg or "409" in msg:
                logger.error(
                    "Supabase upload refused: object already exists (immutability)",
                    extra={"storage_path": storage_path, "error": last_err},
                )
                raise ExternalAPIError(
                    service_name="supabase",
                    error_message="Storage object already exists; refusing overwrite",
                    code="QR_STORAGE_CONFLICT",
                    status_code=409,
                    details={"storage_path": storage_path},
                ) from e
            if attempt + 1 < max_retries:
                time.sleep(0.4 * (attempt + 1))
                continue
            logger.exception(
                "Supabase upload failed",
                extra={"storage_path": storage_path, "attempt": attempt + 1},
            )
            raise ExternalAPIError(
                service_name="supabase",
                error_message="Failed to upload QR asset",
                code="QR_STORAGE_UPLOAD_FAILED",
                details={"storage_path": storage_path, "error_message": last_err},
            ) from e

    raise ExternalAPIError(
        service_name="supabase",
        error_message="Failed to upload QR asset",
        code="QR_STORAGE_UPLOAD_FAILED",
        details={"storage_path": storage_path, "error_message": last_err},
    )


def delete_objects_best_effort(client: Client, paths: list[str]) -> None:
    """Remove uploaded objects after a failed DB commit (best-effort)."""
    if not paths:
        return
    try:
        client.storage.from_(QR_CODES_BUCKET).remove(paths)
    except Exception:
        logger.exception("Failed to remove partial uploads", extra={"paths": paths})
