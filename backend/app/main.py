import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.users import router as users_router
from .routes.dashboard import router as dashboard_router
from .routes.locations import router as locations_router
from .routes.distribution import router as distribution_router, public_router as qr_public_router
from .routes.surveys import router as surveys_router
from .routes.survey_public import router as survey_public_router
from .routes.analytics import router as analytics_router

app = FastAPI()
app.include_router(users_router, prefix="/api/v1", tags=["users"])
app.include_router(dashboard_router, prefix="/api/v1", tags=["dashboard"])
app.include_router(locations_router, prefix="/api/v1", tags=["locations"])
app.include_router(distribution_router, prefix="/api/v1", tags=["distribution"])
app.include_router(surveys_router, prefix="/api/v1", tags=["surveys"])
app.include_router(qr_public_router, prefix="/q", tags=["qr-redirect"])
app.include_router(survey_public_router, prefix="/api/v1", tags=["survey-public"])
app.include_router(analytics_router, prefix="/api/v1", tags=["analytics"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/health")
async def healthcheck():
    return {"status": "ok"}