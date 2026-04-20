"""Centralised application configuration loaded from environment variables.

Import the singleton ``settings`` object instead of calling ``os.getenv()``
anywhere in the application:

    from app.core.config import settings

    stripe.api_key = settings.stripe_secret_key

When running inside Docker the variables are injected by Docker Compose via
``env_file``.  When running locally outside Docker, pydantic-settings falls
back to loading ``.env.development`` (then ``.env``) from the working directory.

If required variables are missing or blank, importing this module raises
``RuntimeError`` with a short explanation (see ``_load_settings``).
"""

from __future__ import annotations

from typing import Self

from pydantic import ValidationError, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _format_settings_validation_error(exc: ValidationError) -> str:
    lines = [
        "Application configuration failed: required environment variables are missing, invalid, or empty.",
        "",
    ]
    for err in exc.errors():
        loc = " -> ".join(str(x) for x in err["loc"]) if err.get("loc") else "settings"
        msg = err.get("msg", "invalid")
        lines.append(f"  - {loc}: {msg}")
    lines.extend(
        [
            "",
            "Set variables in the process environment or in .env / .env.development.",
            "Names follow Pydantic Settings conventions (e.g. app_origin → APP_ORIGIN, cors_origins → CORS_ORIGINS).",
        ]
    )
    return "\n".join(lines)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Fallback chain for local dev outside Docker; real deployments use
        # container-injected env vars which always take precedence.
        env_file=(".env.development", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ------------------------------------------------------------------
    # CORS / Origins
    # ------------------------------------------------------------------
    cors_origins: str
    app_origin: str  # frontend URL — used in email links, Stripe return URLs, etc.

    # ------------------------------------------------------------------
    # Backend
    # ------------------------------------------------------------------
    backend_base_url: str

    # ------------------------------------------------------------------
    # PostgreSQL
    # ------------------------------------------------------------------
    database_url: str

    # ------------------------------------------------------------------
    # Supabase (auth + storage)
    # ------------------------------------------------------------------
    public_supabase_url: str
    public_supabase_jwt_url: str
    public_supabase_jwt_aud: str
    supabase_service_role_key: str
    supabase_jwt_secret: str

    # ------------------------------------------------------------------
    # OpenAI (sentiment analysis)
    # ------------------------------------------------------------------
    openai_api_key: str
    openai_sentiment_model: str = "gpt-4o-mini"

    # ------------------------------------------------------------------
    # Resend (email delivery)
    # ------------------------------------------------------------------
    resend_api_key: str
    resend_from_email: str

    # ------------------------------------------------------------------
    # Stripe (billing)
    # ------------------------------------------------------------------
    stripe_secret_key: str
    stripe_webhook_secret: str
    stripe_customer_portal_id: str
    default_free_trial_days: int = 14
    location_monthly_price_id: str
    location_yearly_price_id: str

    # ------------------------------------------------------------------
    # QR code
    # ------------------------------------------------------------------
    qr_logo_url: str = ""

    # ------------------------------------------------------------------
    # Redis
    # ------------------------------------------------------------------
    redis_url: str = "redis://redis:6379/0"
    survey_session_cache_ttl: int = 3600
    unread_count_cache_ttl: int = 120

    # ------------------------------------------------------------------
    # Sentry
    # ------------------------------------------------------------------
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.5
    environment: str = "production"

    @model_validator(mode="after")
    def reject_blank_env_strings(self) -> Self:
        """Treat whitespace-only env values as unset (common mistake: VAR= in .env)."""
        allow_empty: frozenset[str] = frozenset({"qr_logo_url"})
        for name in self.model_fields:
            if name in allow_empty:
                continue
            val = getattr(self, name)
            if val is None:
                continue
            if isinstance(val, str) and not val.strip():
                env_hint = name.upper()
                raise ValueError(
                    f"Environment variable {env_hint} is empty or whitespace-only; unset it or provide a value."
                )
        return self


def _load_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as e:
        raise RuntimeError(_format_settings_validation_error(e)) from e


settings = _load_settings()
