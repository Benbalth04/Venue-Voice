import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.users import router as users_router
from .routes.dashboard import router as dashboard_router
from .routes.locations import router as locations_router
from .routes.distribution import router as distribution_router, public_router as qr_public_router

app = FastAPI()
app.include_router(users_router, prefix="/api/v1", tags=["users"])
app.include_router(dashboard_router, prefix="/api/v1", tags=["dashboard"])
app.include_router(locations_router, prefix="/api/v1", tags=["locations"])
app.include_router(distribution_router, prefix="/api/v1", tags=["distribution"])
app.include_router(qr_public_router, prefix="/q", tags=["qr-redirect"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")],
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