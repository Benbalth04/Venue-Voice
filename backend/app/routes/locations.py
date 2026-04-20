import logging
import uuid
import urllib.request
import urllib.error
from datetime import datetime, timezone
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from ..core.errors.exceptions import ConflictError, NotFoundError, StaleObjectError, SubscriptionLimitError, ValidationError

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
    QRCode as QRCodeORM,
    Subscription as SubscriptionORM,
    Survey as SurveyORM,
    SurveyStatus,
)
from ..schemas.pydantic_model import DeleteRequest, FlowSummary, LocationCreate, LocationFlowDependencies, LocationResponse, LocationUpdate


def _count_company_locations(db: Session, company_id: uuid.UUID) -> int:
    """Non-deleted, non-archived locations (plan slot usage)."""
    return db.query(func.count(LocationORM.id)).filter(
        LocationORM.company_id == company_id,
        LocationORM.deleted_at.is_(None),
        LocationORM.archived_at.is_(None),
    ).scalar() or 0


def _check_create_limit(db: Session, company_id: uuid.UUID) -> None:
    """Block creation when total non-deleted locations >= subscription limit."""
    sub = db.query(SubscriptionORM).filter(SubscriptionORM.company_id == company_id).first()
    if sub is None or sub.location_count is None:
        return
    current = _count_company_locations(db, company_id)
    if current >= sub.location_count:
        raise SubscriptionLimitError(resource="locations", limit=sub.location_count, current=current)


def _check_activate_limit(db: Session, company_id: uuid.UUID) -> None:
    """Block activation when total non-deleted locations > subscription limit (downgrade scenario)."""
    sub = db.query(SubscriptionORM).filter(SubscriptionORM.company_id == company_id).first()
    if sub is None or sub.location_count is None:
        return
    current = _count_company_locations(db, company_id)
    if current > sub.location_count:
        raise SubscriptionLimitError(resource="locations", limit=sub.location_count, current=current)


def _strip_tz(dt: datetime) -> datetime:
    """Normalize a datetime for comparison with a naive TIMESTAMP column."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

router = APIRouter(dependencies=[Depends(require_active_subscription)])


def _get_active_location_or_404(location_id: str, company_id: uuid.UUID, db: Session) -> LocationORM:
    """Non-deleted, non-archived location (dashboard / mutations on active rows)."""
    try:
        uid = uuid.UUID(location_id)
    except ValueError:
        raise NotFoundError(code="LOCATION_NOT_FOUND", message="Location not found")

    loc = db.query(LocationORM).filter(
        LocationORM.id == uid,
        LocationORM.company_id == company_id,
        LocationORM.deleted_at.is_(None),
        LocationORM.archived_at.is_(None),
    ).first()
    if not loc:
        raise NotFoundError(code="LOCATION_NOT_FOUND", message="Location not found")
    return loc


def _get_location_row_or_404(location_id: str, company_id: uuid.UUID, db: Session) -> LocationORM:
    """Non-deleted location (any archive state), for archive / unarchive."""
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
        archived_at=format_dt_for_user(loc.archived_at, user_tz) if loc.archived_at else None,
    )


@router.get("/locations", response_model=list[LocationResponse])
def list_locations(
    archived: bool = Query(False, description="If true, only archived locations; if false, only non-archived."),
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
    if archived:
        query = query.filter(LocationORM.archived_at.isnot(None))
    else:
        query = query.filter(LocationORM.archived_at.is_(None))
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
    _check_create_limit(db, company.id)

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
    loc = _get_active_location_or_404(location_id, company.id, db)
    assert_location_access(membership, loc.id, db)
    return _to_response(loc, user_tz)


@router.get("/locations/{location_id}/flow-dependencies", response_model=LocationFlowDependencies)
def get_location_flow_dependencies(
    location_id: str,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
    loc = _get_active_location_or_404(location_id, company.id, db)

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
    loc = _get_active_location_or_404(location_id, company.id, db)
    was_inactive = not loc.is_active

    if payload.is_active is True and was_inactive:
        _check_activate_limit(db, company.id)

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
    loc = _get_active_location_or_404(location_id, company.id, db)

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


@router.post("/locations/{location_id}/archive", response_model=LocationResponse)
def archive_location(
    location_id: str,
    payload: DeleteRequest,
    membership: MembershipORM = Depends(require_company_admin),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
    loc = _get_location_row_or_404(location_id, company.id, db)
    assert_location_access(membership, loc.id, db)

    if loc.archived_at is not None:
        db.refresh(loc)
        return _to_response(loc, user_tz)

    rowcount = (
        db.query(LocationORM)
        .filter(
            LocationORM.id == loc.id,
            LocationORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update(
            {
                "archived_at": func.now(),
                "is_active": False,
                "updated_at": func.now(),
            },
            synchronize_session=False,
        )
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
    (
        db.query(QRCodeORM)
        .filter(
            QRCodeORM.location_id == loc.id,
            QRCodeORM.deleted_at.is_(None),
        )
        .update({"archived_at": func.now(), "updated_at": func.now()}, synchronize_session=False)
    )

    db.commit()
    db.refresh(loc)
    return _to_response(loc, user_tz)


@router.post("/locations/{location_id}/delete", status_code=204)
def soft_delete_archived_location(
    location_id: str,
    payload: DeleteRequest,
    membership: MembershipORM = Depends(require_company_admin),
    db: Session = Depends(get_db_connection),
):
    """Soft-delete an archived location when it has no non-deleted QR codes."""
    company = get_company_from_membership(membership, db)
    loc = _get_location_row_or_404(location_id, company.id, db)
    assert_location_access(membership, loc.id, db)

    if loc.archived_at is None:
        raise ValidationError(
            code="LOCATION_NOT_ARCHIVED",
            message="Archive this location before deleting it.",
            status_code=422,
        )

    qr_count = (
        db.query(func.count(QRCodeORM.id))
        .filter(
            QRCodeORM.location_id == loc.id,
            QRCodeORM.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )
    if qr_count > 0:
        raise ConflictError(
            code="LOCATION_HAS_QR_CODES",
            message="This location cannot be deleted while it still has QR codes. Remove or delete those QR codes first.",
            details={"qr_count": int(qr_count)},
        )

    rowcount = (
        db.query(LocationORM)
        .filter(
            LocationORM.id == loc.id,
            LocationORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update({"deleted_at": func.now(), "updated_at": func.now()}, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("Location", str(loc.id))

    db.commit()


@router.post("/locations/{location_id}/unarchive", response_model=LocationResponse)
def unarchive_location(
    location_id: str,
    payload: DeleteRequest,
    membership: MembershipORM = Depends(require_company_admin),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    company = get_company_from_membership(membership, db)
    loc = _get_location_row_or_404(location_id, company.id, db)
    assert_location_access(membership, loc.id, db)

    if loc.archived_at is None:
        db.refresh(loc)
        return _to_response(loc, user_tz)

    _check_create_limit(db, company.id)

    rowcount = (
        db.query(LocationORM)
        .filter(
            LocationORM.id == loc.id,
            LocationORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update(
            {
                "archived_at": None,
                "updated_at": func.now(),
            },
            synchronize_session=False,
        )
    )
    if rowcount == 0:
        raise StaleObjectError("Location", str(loc.id))

    (
        db.query(QRCodeORM)
        .filter(
            QRCodeORM.location_id == loc.id,
            QRCodeORM.deleted_at.is_(None),
        )
        .update({"archived_at": None, "updated_at": func.now()}, synchronize_session=False)
    )

    # Restore is_active on location_surveys whose linked survey is still active
    (
        db.query(LocationSurveyORM)
        .join(SurveyORM, SurveyORM.id == LocationSurveyORM.survey_id)
        .filter(
            LocationSurveyORM.location_id == loc.id,
            LocationSurveyORM.deleted_at.is_(None),
            SurveyORM.status == SurveyStatus.active,
            SurveyORM.deleted_at.is_(None),
        )
        .update({"is_active": True}, synchronize_session=False)
    )

    db.commit()
    db.refresh(loc)
    return _to_response(loc, user_tz)
