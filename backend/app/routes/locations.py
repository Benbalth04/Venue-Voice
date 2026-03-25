import uuid
import urllib.request
import urllib.error
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from ..core.errors.exceptions import ConflictError, NotFoundError, StaleObjectError, ValidationError

from ..auth.jwt import get_current_user
from ..db.postgres import get_db_connection
from ..models.postgres_model import (
    Company as CompanyORM,
    Location as LocationORM,
    LocationSurvey as LocationSurveyORM,
    User as UserORM,
)
from ..schemas.pydantic_model import DeleteRequest, LocationCreate, LocationResponse, LocationUpdate


def _strip_tz(dt: datetime) -> datetime:
    """Normalize a datetime for comparison with a naive TIMESTAMP column."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

router = APIRouter()


def _get_company(user: UserORM, db: Session) -> CompanyORM:
    company = (
        db.query(CompanyORM)
        .filter(
            CompanyORM.owner_user_id == user.id,
            CompanyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not company:
        raise NotFoundError(code="COMPANY_NOT_FOUND", message="Company not found")
    return company


def _get_location_or_404(location_id: str, company_id: uuid.UUID, db: Session) -> LocationORM:
    try:
        uid = uuid.UUID(location_id)
    except ValueError:
        raise NotFoundError(code="LOCATION_NOT_FOUND", message="Location not found")

    loc = db.query(LocationORM).filter(
        LocationORM.id == uid,
        LocationORM.company_id == company_id,
        LocationORM.deleted_at.is_(None),
    ).first()
    if not loc:
        raise NotFoundError(code="LOCATION_NOT_FOUND", message="Location not found")
    return loc


def _validate_google_business_url(url: str | None) -> None:
    """Validate that a business URL is reachable. Raises ValidationError if not."""
    if not url or not url.strip():
        return
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise ValidationError(
            code="INVALID_URL",
            message="URL must use http or https",
            status_code=422,
        )
    full_url = url.strip()
    try:
        req = urllib.request.Request(full_url, method="HEAD")
        req.add_header("User-Agent", "VenueVoice/1.0")
        with urllib.request.urlopen(req, timeout=5) as _:
            pass
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 308):
            return  # Redirect is OK
        raise ValidationError(
            code="URL_NOT_REACHABLE",
            message=f"URL returned status {e.code}. Please check the link.",
            status_code=422,
        )
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise ValidationError(
            code="URL_NOT_REACHABLE",
            message="URL could not be reached. Please check the link is valid.",
            status_code=422,
        )


def _to_response(loc: LocationORM) -> LocationResponse:
    return LocationResponse(
        id=loc.id,
        name=loc.name,
        is_active=loc.is_active,
        state=loc.state,
        country=loc.country,
        google_business_url=loc.google_business_url,
        created_at=loc.created_at.isoformat(),
        updated_at=loc.updated_at.isoformat(),
    )


@router.get("/locations", response_model=list[LocationResponse])
def list_locations(
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
    locations = (
        db.query(LocationORM)
        .filter(
            LocationORM.company_id == company.id,
            LocationORM.deleted_at.is_(None),
        )
        .order_by(LocationORM.created_at.desc())
        .all()
    )
    return [_to_response(loc) for loc in locations]


@router.post("/locations", response_model=LocationResponse, status_code=201)
def create_location(
    payload: LocationCreate,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)

    name = payload.name.strip()
    if not name:
        raise ValidationError(code="INVALID_NAME", message="Location name cannot be empty", status_code=422)

    existing = (
        db.query(LocationORM)
        .filter(
            LocationORM.company_id == company.id,
            LocationORM.name == name,
            LocationORM.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        raise ConflictError(code="LOCATION_NAME_CONFLICT", message="A location with this name already exists")

    if payload.google_business_url:
        _validate_google_business_url(payload.google_business_url)

    loc = LocationORM(
        company_id=company.id,
        name=name,
        is_active=True,
        state=payload.state,
        country=payload.country,
        google_business_url=payload.google_business_url,
    )
    db.add(loc)
    try:
        db.commit()
        db.refresh(loc)
    except IntegrityError:
        db.rollback()
        raise ConflictError(code="LOCATION_NAME_CONFLICT", message="A location with this name already exists")
    return _to_response(loc)


@router.get("/locations/{location_id}", response_model=LocationResponse)
def get_location(
    location_id: str,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
    return _to_response(_get_location_or_404(location_id, company.id, db))


@router.patch("/locations/{location_id}", response_model=LocationResponse)
def update_location(
    location_id: str,
    payload: LocationUpdate,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
    loc = _get_location_or_404(location_id, company.id, db)

    update_values: dict = {"updated_at": func.now()}

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise ValidationError(code="INVALID_NAME", message="Location name cannot be empty", status_code=422)
        existing = (
            db.query(LocationORM)
            .filter(
                LocationORM.company_id == company.id,
                LocationORM.name == name,
                LocationORM.id != loc.id,
                LocationORM.deleted_at.is_(None),
            )
            .first()
        )
        if existing:
            raise ConflictError(code="LOCATION_NAME_CONFLICT", message="A location with this name already exists")
        update_values["name"] = name

    if payload.google_business_url is not None and payload.google_business_url:
        _validate_google_business_url(payload.google_business_url)

    for field, value in payload.model_dump(exclude_unset=True).items():
        if field not in ("name", "updated_at"):
            update_values[field] = value

    rowcount = (
        db.query(LocationORM)
        .filter(
            LocationORM.id == loc.id,
            LocationORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update(update_values, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("Location", str(loc.id))

    if payload.is_active is False:
        (
            db.query(LocationSurveyORM)
            .filter(
                LocationSurveyORM.location_id == loc.id,
                LocationSurveyORM.deleted_at.is_(None),
            )
            .update({"is_active": False}, synchronize_session=False)
        )

    try:
        db.commit()
        db.refresh(loc)
    except IntegrityError:
        db.rollback()
        raise ConflictError(code="LOCATION_NAME_CONFLICT", message="A location with this name already exists")
    return _to_response(loc)


@router.delete("/locations/{location_id}", status_code=204)
def deactivate_location(
    location_id: str,
    payload: DeleteRequest,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
    loc = _get_location_or_404(location_id, company.id, db)

    rowcount = (
        db.query(LocationORM)
        .filter(
            LocationORM.id == loc.id,
            LocationORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update({"is_active": False, "updated_at": func.now()}, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("Location", str(loc.id))

    (
        db.query(LocationSurveyORM)
        .filter(
            LocationSurveyORM.location_id == loc.id,
            LocationSurveyORM.deleted_at.is_(None),
        )
        .update({"is_active": False}, synchronize_session=False)
    )
    db.commit()
