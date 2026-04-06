"""Upload helpers for Supabase Storage (qr-codes and survey-photos buckets)."""

from __future__ import annotations

import logging
import time
from supabase import Client, create_client

from ..core.config import settings
from ..core.errors.exceptions import ExternalAPIError, ValidationError

logger = logging.getLogger(__name__)

QR_CODES_BUCKET = "qr_codes"
SURVEY_PHOTOS_BUCKET = "survey_photos"
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_PHOTO_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_PHOTO_MIME_TYPES = frozenset({"image/jpeg", "image/png", "image/webp", "image/heic"})

MIME_BY_FORMAT: dict[str, str] = {
    "svg": "image/svg+xml",
    "png": "image/png",
    "jpeg": "image/jpeg",
}


def get_supabase_service_client() -> Client:
    return create_client(settings.public_supabase_url, settings.supabase_service_role_key)


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


def upload_survey_photo(
    *,
    client: Client,
    storage_path: str,
    data: bytes,
    mime_type: str,
    max_retries: int = 2,
) -> str:
    """Upload a survey response photo to the private survey-photos bucket.

    Returns the storage_path (not a public URL — bucket is private).
    Raises ValidationError if the file exceeds the size or MIME type limits.
    Raises ExternalAPIError on Supabase failures.
    """
    if mime_type not in ALLOWED_PHOTO_MIME_TYPES:
        raise ValidationError(
            code="INVALID_PHOTO_TYPE",
            message=f"Unsupported photo type '{mime_type}'. Allowed: JPEG, PNG, WebP, HEIC.",
            status_code=422,
        )
    if len(data) > MAX_PHOTO_BYTES:
        raise ValidationError(
            code="PHOTO_TOO_LARGE",
            message="Photo exceeds the 10 MB size limit.",
            details={"size_bytes": len(data), "max_bytes": MAX_PHOTO_BYTES},
            status_code=422,
        )

    last_err: str | None = None
    for attempt in range(max_retries):
        try:
            client.storage.from_(SURVEY_PHOTOS_BUCKET).upload(
                storage_path,
                data,
                file_options={
                    "content-type": mime_type,
                    "upsert": "false",
                },
            )
            return storage_path
        except Exception as e:
            last_err = str(e)
            msg = (last_err or "").lower()
            if "duplicate" in msg or "already exists" in msg or "409" in msg:
                logger.error(
                    "Supabase photo upload refused: object already exists",
                    extra={"storage_path": storage_path, "error": last_err},
                )
                raise ExternalAPIError(
                    service_name="supabase",
                    error_message="Storage object already exists; refusing overwrite",
                    code="PHOTO_STORAGE_CONFLICT",
                    status_code=409,
                    details={"storage_path": storage_path},
                ) from e
            if attempt + 1 < max_retries:
                time.sleep(0.4 * (attempt + 1))
                continue
            logger.exception(
                "Supabase photo upload failed",
                extra={"storage_path": storage_path, "attempt": attempt + 1},
            )
            raise ExternalAPIError(
                service_name="supabase",
                error_message="Failed to upload survey photo",
                code="PHOTO_STORAGE_UPLOAD_FAILED",
                details={"storage_path": storage_path, "error_message": last_err},
            ) from e

    raise ExternalAPIError(
        service_name="supabase",
        error_message="Failed to upload survey photo",
        code="PHOTO_STORAGE_UPLOAD_FAILED",
        details={"storage_path": storage_path, "error_message": last_err},
    )


def generate_photo_signed_url(
    *,
    client: Client,
    storage_path: str,
    expires_in: int = 3600,
) -> str:
    """Generate a short-lived signed URL for a private survey photo.

    Returns the signed URL string.
    Raises ExternalAPIError on Supabase failures.
    """
    try:
        result = client.storage.from_(SURVEY_PHOTOS_BUCKET).create_signed_url(
            storage_path, expires_in
        )
        signed_url = result.get("signedURL") or result.get("signedUrl") or ""
        if not signed_url:
            raise RuntimeError(f"Empty signed URL returned for path: {storage_path}")
        return signed_url
    except Exception as e:
        logger.exception(
            "Failed to generate signed URL for survey photo",
            extra={"storage_path": storage_path},
        )
        raise ExternalAPIError(
            service_name="supabase",
            error_message="Failed to generate signed URL for survey photo",
            code="PHOTO_SIGNED_URL_FAILED",
            details={"storage_path": storage_path, "error_message": str(e)},
        ) from e


def delete_survey_photos_best_effort(client: Client, paths: list[str]) -> None:
    """Remove uploaded survey photos after a failed DB commit (best-effort)."""
    if not paths:
        return
    try:
        client.storage.from_(SURVEY_PHOTOS_BUCKET).remove(paths)
    except Exception:
        logger.exception("Failed to remove partial survey photo uploads", extra={"paths": paths})
