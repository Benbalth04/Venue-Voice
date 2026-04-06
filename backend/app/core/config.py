"""Centralised application configuration loaded from environment variables.

Import the singleton ``settings`` object instead of calling ``os.getenv()``
anywhere in the application:

    from app.core.config import settings

    stripe.api_key = settings.stripe_secret_key

When running inside Docker the variables are injected by Docker Compose via
``env_file``.  When running locally outside Docker, pydantic-settings falls
back to loading ``.env.development`` (then ``.env``) from the working directory.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


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
    starter_plan_monthly_price_id: str
    starter_plan_yearly_price_id: str
    growth_plan_monthly_price_id: str
    growth_plan_yearly_price_id: str
    pro_plan_monthly_price_id: str
    pro_plan_yearly_price_id: str

    # ------------------------------------------------------------------
    # QR code
    # ------------------------------------------------------------------
    qr_logo_url: str = ""

    # ------------------------------------------------------------------
    # Redis
    # ------------------------------------------------------------------
    redis_url: str = "redis://redis:6379/0"


settings = Settings()
