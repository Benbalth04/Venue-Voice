from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.users import router as users_router
from .routes.dashboard import router as dashboard_router
from .routes.locations import router as locations_router
from .routes.location_surveys import router as location_surveys_router
from .routes.distribution import router as distribution_router, public_router as qr_public_router
from .routes.surveys import router as surveys_router
from .routes.logic import router as logic_router
from .routes.survey_public import router as survey_public_router
from .routes.analytics import router as analytics_router
from .routes.survey_dashboard import router as survey_dashboard_router
from .routes.billing import router as billing_router
from .routes.stripe_webhook import router as stripe_webhook_router
from .routes.company_users import router as company_users_router
from .routes.contact import router as contact_router
from .core.config import settings
from .core.errors.app_error import AppError
from .core.errors.handlers import app_error_handler, generic_exception_handler
from .core.logging_config import configure_logging
from .core.sentry import init_sentry
from .middleware.request_logging import RequestLoggingMiddleware
from .tasks.email_reconciliation import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


# 1. Configure structured JSON logging first — must run before any logger is
#    used so that all subsequent log calls (including Sentry init) are JSON.
configure_logging()

# 2. Initialise Sentry after logging so the SDK's own log output is also JSON.
init_sentry()

app = FastAPI(lifespan=lifespan)
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(Exception, generic_exception_handler)
app.include_router(users_router, prefix="/api/v1", tags=["users"])
app.include_router(dashboard_router, prefix="/api/v1", tags=["dashboard"])
app.include_router(locations_router, prefix="/api/v1", tags=["locations"])
app.include_router(location_surveys_router, prefix="/api/v1", tags=["location-surveys"])
app.include_router(distribution_router, prefix="/api/v1", tags=["distribution"])
app.include_router(surveys_router, prefix="/api/v1", tags=["surveys"])
app.include_router(logic_router, prefix="/api/v1", tags=["logic"])
app.include_router(qr_public_router, prefix="/q", tags=["qr-redirect"])
app.include_router(survey_public_router, prefix="/api/v1", tags=["survey-public"])
app.include_router(analytics_router, prefix="/api/v1", tags=["analytics"])
app.include_router(survey_dashboard_router, prefix="/api/v1", tags=["survey-dashboard"])
app.include_router(billing_router, prefix="/api/v1", tags=["billing"])
app.include_router(company_users_router, prefix="/api/v1", tags=["company-users"])
# Webhook endpoint has no JWT auth — Stripe-Signature header is used instead
app.include_router(stripe_webhook_router, prefix="/api/v1", tags=["stripe-webhook"])
app.include_router(contact_router, prefix="/api/v1", tags=["contact"])

# Inner: transforms IDs; outer: CORS (runs first on the request).
origins = settings.cors_origins.split(",")
origins = [o.strip() for o in settings.cors_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Company-ID"],
)
# RequestLoggingMiddleware runs inside CORS (added after) so it sees the
# authenticated request with all headers already processed.
app.add_middleware(RequestLoggingMiddleware)

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/health")
async def healthcheck():
    return {"status": "ok"}