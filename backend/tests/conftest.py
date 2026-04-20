"""Ensure required Settings env vars exist when pytest imports the app (local CI without .env)."""
from __future__ import annotations

import os

_DEFAULTS: dict[str, str] = {
    "CORS_ORIGINS": "http://localhost:3000",
    "APP_ORIGIN": "http://localhost:3000",
    "BACKEND_BASE_URL": "http://localhost:5000",
    "DATABASE_URL": "postgresql+psycopg2://test:test@localhost:5432/test",
    "PUBLIC_SUPABASE_URL": "https://example.supabase.co",
    "PUBLIC_SUPABASE_JWT_URL": "https://example.supabase.co/auth/v1/.well-known/jwks.json",
    "PUBLIC_SUPABASE_JWT_AUD": "authenticated",
    "SUPABASE_SERVICE_ROLE_KEY": "test-service-role",
    "SUPABASE_JWT_SECRET": "test-jwt-secret",
    "OPENAI_API_KEY": "sk-test",
    "RESEND_API_KEY": "re_test",
    "RESEND_FROM_EMAIL": "test@example.com",
    "STRIPE_SECRET_KEY": "sk_test_dummy",
    "STRIPE_WEBHOOK_SECRET": "whsec_test",
    "STRIPE_CUSTOMER_PORTAL_ID": "bpc_test",
    "STARTER_PLAN_MONTHLY_PRICE_ID": "price_starter_m",
    "STARTER_PLAN_YEARLY_PRICE_ID": "price_starter_y",
    "GROWTH_PLAN_MONTHLY_PRICE_ID": "price_growth_m",
    "GROWTH_PLAN_YEARLY_PRICE_ID": "price_growth_y",
    "PRO_PLAN_MONTHLY_PRICE_ID": "price_pro_m",
    "PRO_PLAN_YEARLY_PRICE_ID": "price_pro_y",
    "LOCATION_MONTHLY_PRICE_ID": "price_loc_m",
    "LOCATION_YEARLY_PRICE_ID": "price_loc_y",
}

for _key, _val in _DEFAULTS.items():
    os.environ.setdefault(_key, _val)
