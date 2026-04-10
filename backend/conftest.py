"""pytest configuration — sets required environment variables before any module
is imported so modules that read env vars at import time do not crash."""
import os

# Provide minimal env vars so SQLAlchemy and other modules that read env vars
# at import time can initialise without a real database or external services.
_DEFAULTS = {
    "DATABASE_URL": "postgresql://test:test@localhost/test",
    "PUBLIC_SUPABASE_URL": "https://test.supabase.co",
    "PUBLIC_SUPABASE_JWT_URL": "https://test.supabase.co/auth/v1/jwks",
    "STRIPE_SECRET_KEY": "sk_test_placeholder",
    "DEFAULT_FREE_TRIAL_DAYS": "7",
    "APP_ORIGIN": "http://localhost:3000",
    "RESEND_API_KEY": "re_placeholder",
    "OPENAI_API_KEY": "sk-placeholder",
    "STARTER_PLAN_MONTHLY_PRICE_ID": "price_starter_monthly",
    "STARTER_PLAN_YEARLY_PRICE_ID": "price_starter_yearly",
    "GROWTH_PLAN_MONTHLY_PRICE_ID": "price_growth_monthly",
    "GROWTH_PLAN_YEARLY_PRICE_ID": "price_growth_yearly",
    "PRO_PLAN_MONTHLY_PRICE_ID": "price_pro_monthly",
    "PRO_PLAN_YEARLY_PRICE_ID": "price_pro_yearly",
}

for key, value in _DEFAULTS.items():
    os.environ.setdefault(key, value)
