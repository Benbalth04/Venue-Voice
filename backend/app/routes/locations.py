import logging
import uuid
import urllib.request
import urllib.error
from datetime import datetime, timezone
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from ..core.errors.exceptions import ConflictError, NotFoundError, StaleObjectError, ValidationError

from ..auth.membership import get_company_from_membership, get_current_membership, require_company_admin
from ..auth.subscription import require_active_subscription
from ..auth.user_timezone import format_dt_for_user, get_user_zoneinfo
from ..auth.viewer_scoping import apply_location_filter, assert_location_access, location_ids_subquery
from ..db.postgres import get_db_connection
from ..models.postgres_model import (
    Company as CompanyORM,
    Flow as FlowORM,
    FlowLocationSurvey as FlowLocationSurveyORM,
    FlowNode as FlowNodeORM,
    Location as LocationORM,
    LocationSurvey as LocationSurveyORM,
    Membership as MembershipORM,
)
from ..schemas.pydantic_model import DeleteRequest, FlowSummary, LocationCreate, LocationFlowDependencies, LocationResponse, LocationUpdate


def _strip_tz(dt: datetime) -> datetime:
    """Normalize a datetime for comparison with a naive TIMESTAMP column."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

router = APIRouter(dependencies=[Depends(require_active_subscription)])


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


def _to_response(loc: LocationORM, user_tz: ZoneInfo) -> LocationResponse:
    return LocationResponse(
        id=loc.id,
        name=loc.name,
        is_active=loc.is_active,
        state=loc.state,
        country=loc.country,
        google_business_url=loc.google_business_url,
        created_at=format_dt_for_user(loc.created_at, user_tz) or "",
        updated_at=format_dt_for_user(loc.updated_at, user_tz) or "",
    )


@router.get("/locations", response_model=list[LocationResponse])
def list_locations(
    membership: MembershipORM = Depends(get_current_membership),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
    location_sq = location_ids_subquery(membership, db)
    query = (
        db.query(LocationORM)
        .filter(
            LocationORM.company_id == company.id,
            LocationORM.deleted_at.is_(None),
        )
    )
    query = apply_location_filter(query, location_sq, LocationORM.id)
    locations = query.order_by(LocationORM.created_at.desc()).all()
    return [_to_response(loc, user_tz) for loc in locations]


@router.post("/locations", response_model=LocationResponse, status_code=201)
def create_location(
    payload: LocationCreate,
    membership: MembershipORM = Depends(require_company_admin),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)

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
        is_active=False,
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
    return _to_response(loc, user_tz)


@router.get("/locations/{location_id}", response_model=LocationResponse)
def get_location(
    location_id: str,
    membership: MembershipORM = Depends(get_current_membership),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
    loc = _get_location_or_404(location_id, company.id, db)
    assert_location_access(membership, loc.id, db)
    return _to_response(loc, user_tz)


@router.get("/locations/{location_id}/flow-dependencies", response_model=LocationFlowDependencies)
def get_location_flow_dependencies(
    location_id: str,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
    loc = _get_location_or_404(location_id, company.id, db)

    ls_ids = [
        ls.id
        for ls in db.query(LocationSurveyORM.id)
        .filter(
            LocationSurveyORM.location_id == loc.id,
            LocationSurveyORM.deleted_at.is_(None),
        )
        .all()
    ]

    if not ls_ids:
        return LocationFlowDependencies(google_business_url_flows=[], notification_group_flows=[])

    flow_ids = [
        row.flow_id
        for row in db.query(FlowLocationSurveyORM.flow_id)
        .filter(FlowLocationSurveyORM.location_survey_id.in_(ls_ids))
        .distinct()
        .all()
    ]

    if not flow_ids:
        return LocationFlowDependencies(google_business_url_flows=[], notification_group_flows=[])

    flows = (
        db.query(FlowORM)
        .filter(FlowORM.id.in_(flow_ids), FlowORM.deleted_at.is_(None))
        .all()
    )

    google_business_url_flows: list[FlowSummary] = []
    notification_group_flows: list[FlowSummary] = []

    for flow in flows:
        has_gbu = any(
            node.action_type == "redirect"
            and isinstance(node.action_config, dict)
            and node.action_config.get("target") == "google_business_url"
            for node in flow.nodes
        )
        has_lng = any(
            node.action_type == "email"
            and isinstance(node.action_config, dict)
            and node.action_config.get("target") == "location_notification_groups"
            for node in flow.nodes
        )
        summary = FlowSummary(id=str(flow.id), name=flow.name)
        if has_gbu:
            google_business_url_flows.append(summary)
        if has_lng:
            notification_group_flows.append(summary)

    return LocationFlowDependencies(
        google_business_url_flows=google_business_url_flows,
        notification_group_flows=notification_group_flows,
    )


@router.patch("/locations/{location_id}", response_model=LocationResponse)
def update_location(
    location_id: str,
    payload: LocationUpdate,
    membership: MembershipORM = Depends(require_company_admin),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
    loc = _get_location_or_404(location_id, company.id, db)
    was_inactive = not loc.is_active

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

    reactivating_location = (
        "is_active" in payload.model_fields_set
        and payload.is_active is True
        and was_inactive
    )
    if reactivating_location:
        (
            db.query(LocationSurveyORM)
            .filter(
                LocationSurveyORM.location_id == loc.id,
                LocationSurveyORM.deleted_at.is_(None),
            )
            .update({"is_active": True}, synchronize_session=False)
        )

    try:
        db.commit()
        db.refresh(loc)
    except IntegrityError:
        db.rollback()
        raise ConflictError(code="LOCATION_NAME_CONFLICT", message="A location with this name already exists")

    # Revalidate flows that target this location (separate transaction; fail-safe).
    try:
        from ..services.flow_validator import revalidate_flows_for_location
        revalidate_flows_for_location(db, loc.id)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Flow revalidation failed for location %s", loc.id)

    return _to_response(loc, user_tz)


@router.delete("/locations/{location_id}", status_code=204)
def deactivate_location(
    location_id: str,
    payload: DeleteRequest,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
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
