from pydantic import BaseModel
from typing import Literal
from pydantic import EmailStr

class User(BaseModel):
    id: str
    email: str
    first_name: str
    last_name: str
    onboarding_complete: bool = False


class MeResponse(BaseModel):
    id: str
    email: str
    first_name: str
    last_name: str
    onboarding_complete: bool
    company_name: str | None = None
    user_display_name: str | None = None


class SetupAccountRequest(BaseModel):
    company_name: str
    location_name: str
    location_state: str | None = None
    location_country: str | None = None
    location_google_business_url: str | None = None
    primary_industry: str | None = None
    company_size: str | None = None
    location_count: int | None = None
    how_heard: str | None = None

class Company(BaseModel):
    id: str
    name: str
    owner_user_id: str
    primary_industry: str | None = None
    company_size: str | None = None
    location_count: int | None = None
    how_heard: str | None = None

class Location(BaseModel):
    id: str
    name: str
    company_id: str


# --------------------------------------------------
# LOCATIONS (CRUD)
# --------------------------------------------------

class LocationCreate(BaseModel):
    name: str
    state: str | None = None
    country: str | None = None
    google_business_url: str | None = None


class LocationUpdate(BaseModel):
    name: str | None = None
    state: str | None = None
    country: str | None = None
    google_business_url: str | None = None
    is_active: bool | None = None


class LocationResponse(BaseModel):
    id: str
    name: str
    is_active: bool
    state: str | None
    country: str | None
    google_business_url: str | None
    created_at: str
    updated_at: str


# --------------------------------------------------
# QR CODES (CRUD)
# --------------------------------------------------

class QRCodeCreate(BaseModel):
    slug: str
    survey_id: str
    location_id: str | None = None


class QRCodeUpdate(BaseModel):
    slug: str | None = None
    survey_id: str | None = None
    location_id: str | None = None
    is_active: bool | None = None


class QRCodeResponse(BaseModel):
    id: str
    slug: str
    survey_id: str
    location_id: str | None
    is_active: bool
    created_at: str
    updated_at: str


class SurveySummaryResponse(BaseModel):
    id: str
    name: str
    status: str

class Survey(BaseModel):
    id: str
    company_id: str
    location_id: str | None 
    name: str
    description: str | None
    status: Literal["draft", "active", "archived"]
    active_version_id: str | None
    created_by: str


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    company_name: str
    default_store_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    user: User
    company: Company | None = None


# --------------------------------------------------
# DASHBOARD
# --------------------------------------------------

class DashboardTrendPoint(BaseModel):
    label: str
    value: int


class DashboardSurveySummary(BaseModel):
    id: str
    title: str
    status: str
    question_count: int


class DashboardQRCodeSummary(BaseModel):
    id: str
    name: str
    survey_id: str
    location_id: str | None
    active: bool
    scan_count: int


class DashboardLocationSummary(BaseModel):
    id: str
    name: str


class DashboardResponseSummary(BaseModel):
    id: str
    survey_version_id: str
    location_id: str | None
    submitted_at: str


class DashboardData(BaseModel):
    company_name: str
    user_display_name: str
    total_submissions: int
    total_scans: int
    active_surveys_count: int
    active_qr_codes_count: int
    active_locations_count: int
    submission_trend: list[DashboardTrendPoint]
    scan_trend: list[DashboardTrendPoint]
    active_surveys: list[DashboardSurveySummary]
    active_qr_codes: list[DashboardQRCodeSummary]
    active_locations: list[DashboardLocationSummary]