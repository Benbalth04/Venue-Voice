import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth.jwt import get_current_user
from ..db.postgres import get_db_connection
from ..models.postgres_model import Company as CompanyORM, Location as LocationORM, User as UserORM
from ..schemas.pydantic_model import LocationCreate, LocationResponse, LocationUpdate

router = APIRouter()


def _get_company(user: UserORM, db: Session) -> CompanyORM:
    company = db.query(CompanyORM).filter(CompanyORM.owner_user_id == user.id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return company


def _get_location_or_404(location_id: str, company_id: uuid.UUID, db: Session) -> LocationORM:
    try:
        uid = uuid.UUID(location_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    loc = db.query(LocationORM).filter(
        LocationORM.id == uid,
        LocationORM.company_id == company_id,
    ).first()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return loc


def _to_response(loc: LocationORM) -> LocationResponse:
    return LocationResponse(
        id=str(loc.id),
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
        .filter(LocationORM.company_id == company.id)
        .order_by(LocationORM.created_at.desc())
        .all()
    )
    return [_to_response(loc) for loc in locations]


@router.post("/locations", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
def create_location(
    payload: LocationCreate,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
    loc = LocationORM(
        company_id=company.id,
        name=payload.name,
        is_active=True,
        state=payload.state,
        country=payload.country,
        google_business_url=payload.google_business_url,
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
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

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(loc, field, value)

    db.commit()
    db.refresh(loc)
    return _to_response(loc)


@router.delete("/locations/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_location(
    location_id: str,
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company(user, db)
    loc = _get_location_or_404(location_id, company.id, db)
    loc.is_active = False
    db.commit()
