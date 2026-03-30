import logging
import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from ..auth.jwt import get_current_user
from ..auth.subscription import require_active_subscription
from ..core.errors.exceptions import NotFoundError, PermissionError, ValidationError
from ..db.postgres import get_db_connection
from ..models.postgres_model import Company as CompanyORM
from ..models.postgres_model import Survey as SurveyORM
from ..models.postgres_model import User as UserORM
from ..schemas.pydantic_model import (
    AssignNotificationGroupToLocation,
    CreateFlow,
    CreateRule,
    DeleteRequest,
    FlowResponse,
    FlowRunResponse,
    FlowTestRequest,
    FlowTestResponse,
    LocationNotificationGroupUpdate,
    NotificationGroupCreate,
    NotificationGroupMemberCreate,
    NotificationGroupUpdate,
    NotificationGroupResponse,
    RuleListResponse,
    RuleResponse,
    SetFlowActive,
    UpdateFlow,
    UpdateRule,
)
from ..services.flow_service import (
    create_flow,
    delete_flow,
    get_flow_for_company,
    get_flow_response,
    list_company_flows,
    list_flow_runs,
    list_flows,
    set_flow_active,
    test_flow,
    update_flow,
)
from ..services.notification_group_service import (
    add_notification_group_member,
    assign_notification_group_to_location,
    create_notification_group,
    delete_notification_group,
    list_notification_groups,
    sync_location_notification_groups,
    update_notification_group,
)
from ..services.rule_service import (
    create_rule as create_rule_service,
    delete_rule as delete_rule_service,
    get_broken_rule_count,
    get_company_broken_rule_count,
    get_rule_bundle,
    update_rule as update_rule_service,
)
from ..services.flow_service import get_company_broken_flow_count

router = APIRouter(dependencies=[Depends(require_active_subscription)])


def _parse_uuid(value: str, *, code: str, label: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise ValidationError(code=code, message=f"Invalid {label}")


def _get_company_for_user(db: Session, current_user: UserORM) -> CompanyORM:
    company = (
        db.query(CompanyORM)
        .filter(
            CompanyORM.owner_user_id == current_user.id,
            CompanyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not company:
        raise NotFoundError(code="COMPANY_NOT_FOUND", message="Company not found for user")
    return company


def _ensure_survey_access(db: Session, current_user: UserORM, survey_id: uuid.UUID) -> CompanyORM:
    company = _get_company_for_user(db, current_user)
    survey = (
        db.query(SurveyORM)
        .filter(
            SurveyORM.id == survey_id,
            SurveyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not survey:
        raise NotFoundError(code="SURVEY_NOT_FOUND", message="Survey not found")
    if survey.company_id != company.id:
        raise PermissionError(code="ACCESS_DENIED", message="Access denied")
    return company


@router.get("/surveys/{survey_id}/rules", response_model=RuleListResponse)
def list_rules(
    survey_id: str,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey_uuid = _parse_uuid(survey_id, code="INVALID_SURVEY_ID", label="survey ID")
    _ensure_survey_access(db, current_user, survey_uuid)
    return get_rule_bundle(db, survey_uuid)


@router.get("/rules/broken-summary")
def get_company_broken_rules_summary(
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company_for_user(db, current_user)
    return {"broken_rule_count": get_company_broken_rule_count(db, company.id)}


@router.get("/flows/broken-summary")
def get_company_broken_flows_summary(
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company_for_user(db, current_user)
    return {"broken_flow_count": get_company_broken_flow_count(db, company.id)}


@router.get("/surveys/{survey_id}/rules/broken/summary")
def get_broken_rules_summary(
    survey_id: str,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey_uuid = _parse_uuid(survey_id, code="INVALID_SURVEY_ID", label="survey ID")
    _ensure_survey_access(db, current_user, survey_uuid)
    return {"broken_rule_count": get_broken_rule_count(db, survey_uuid)}


@router.post("/surveys/{survey_id}/rules", response_model=RuleResponse, status_code=201)
def create_rule(
    survey_id: str,
    payload: CreateRule,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey_uuid = _parse_uuid(survey_id, code="INVALID_SURVEY_ID", label="survey ID")
    _ensure_survey_access(db, current_user, survey_uuid)
    return create_rule_service(db, survey_uuid, payload)


@router.put("/surveys/{survey_id}/rules/{rule_id}", response_model=RuleResponse)
def update_rule(
    survey_id: str,
    rule_id: str,
    payload: UpdateRule,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey_uuid = _parse_uuid(survey_id, code="INVALID_SURVEY_ID", label="survey ID")
    rule_uuid = _parse_uuid(rule_id, code="INVALID_RULE_ID", label="rule ID")
    _ensure_survey_access(db, current_user, survey_uuid)
    result = update_rule_service(db, survey_uuid, rule_uuid, payload)
    # Rule status may have changed (active ↔ broken); revalidate all flows for this
    # survey so broken flows referencing this rule are cleared. Fail-safe — a
    # revalidation error must never fail the rule update itself.
    try:
        from ..services.flow_validator import revalidate_flows_for_survey
        revalidate_flows_for_survey(db, survey_uuid)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Flow revalidation failed for survey %s after rule update", survey_uuid)
    return result


@router.delete("/surveys/{survey_id}/rules/{rule_id}", status_code=204)
def delete_rule(
    survey_id: str,
    rule_id: str,
    payload: DeleteRequest,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey_uuid = _parse_uuid(survey_id, code="INVALID_SURVEY_ID", label="survey ID")
    rule_uuid = _parse_uuid(rule_id, code="INVALID_RULE_ID", label="rule ID")
    _ensure_survey_access(db, current_user, survey_uuid)
    delete_rule_service(db, survey_uuid, rule_uuid, payload.updated_at)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/surveys/{survey_id}/flows", response_model=list[FlowResponse])
def list_flows_route(
    survey_id: str,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey_uuid = _parse_uuid(survey_id, code="INVALID_SURVEY_ID", label="survey ID")
    company = _ensure_survey_access(db, current_user, survey_uuid)
    return list_flows(db, company.id, survey_uuid)


@router.get("/flows", response_model=list[FlowResponse])
def list_company_flows_route(
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company_for_user(db, current_user)
    return list_company_flows(db, company.id)


@router.get("/flows/{flow_id}", response_model=FlowResponse)
def get_flow_route(
    flow_id: str,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    flow_uuid = _parse_uuid(flow_id, code="INVALID_FLOW_ID", label="flow ID")
    company = _get_company_for_user(db, current_user)
    return get_flow_response(db, company.id, flow_uuid)


@router.post("/surveys/{survey_id}/flows", response_model=FlowResponse, status_code=201)
def create_flow_route(
    survey_id: str,
    payload: CreateFlow,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey_uuid = _parse_uuid(survey_id, code="INVALID_SURVEY_ID", label="survey ID")
    company = _ensure_survey_access(db, current_user, survey_uuid)
    return create_flow(db, company.id, survey_uuid, payload)


@router.put("/surveys/{survey_id}/flows/{flow_id}", response_model=FlowResponse)
def update_flow_route(
    survey_id: str,
    flow_id: str,
    payload: UpdateFlow,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey_uuid = _parse_uuid(survey_id, code="INVALID_SURVEY_ID", label="survey ID")
    flow_uuid = _parse_uuid(flow_id, code="INVALID_FLOW_ID", label="flow ID")
    company = _ensure_survey_access(db, current_user, survey_uuid)
    return update_flow(db, company.id, survey_uuid, flow_uuid, payload)


@router.patch("/surveys/{survey_id}/flows/{flow_id}/active", response_model=FlowResponse)
def set_flow_active_route(
    survey_id: str,
    flow_id: str,
    payload: SetFlowActive,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey_uuid = _parse_uuid(survey_id, code="INVALID_SURVEY_ID", label="survey ID")
    flow_uuid = _parse_uuid(flow_id, code="INVALID_FLOW_ID", label="flow ID")
    company = _ensure_survey_access(db, current_user, survey_uuid)
    return set_flow_active(db, company.id, survey_uuid, flow_uuid, is_active=payload.is_active, updated_at=payload.updated_at)


@router.delete("/surveys/{survey_id}/flows/{flow_id}", status_code=204)
def delete_flow_route(
    survey_id: str,
    flow_id: str,
    payload: DeleteRequest,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey_uuid = _parse_uuid(survey_id, code="INVALID_SURVEY_ID", label="survey ID")
    flow_uuid = _parse_uuid(flow_id, code="INVALID_FLOW_ID", label="flow ID")
    company = _ensure_survey_access(db, current_user, survey_uuid)
    delete_flow(db, company.id, survey_uuid, flow_uuid, payload.updated_at)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/flows/{flow_id}/test", response_model=FlowTestResponse)
def test_flow_route(
    flow_id: str,
    payload: FlowTestRequest,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    flow_uuid = _parse_uuid(flow_id, code="INVALID_FLOW_ID", label="flow ID")
    company = _get_company_for_user(db, current_user)
    flow = get_flow_for_company(db, company.id, flow_uuid)
    return test_flow(
        db,
        company_id=company.id,
        survey_id=flow.survey_id,
        flow_id=flow.id,
        mock_response=payload.mock_response,
        location_survey_id=payload.location_survey_id,
    )


@router.get("/notification-groups", response_model=list[NotificationGroupResponse])
def list_notification_groups_route(
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company_for_user(db, current_user)
    return list_notification_groups(db, company.id)


@router.post("/notification-groups", response_model=NotificationGroupResponse, status_code=201)
def create_notification_group_route(
    payload: NotificationGroupCreate,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company_for_user(db, current_user)
    return create_notification_group(db, company.id, payload.name)


@router.post("/notification-groups/{group_id}/members", response_model=NotificationGroupResponse, status_code=201)
def add_notification_group_member_route(
    group_id: str,
    payload: NotificationGroupMemberCreate,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company_for_user(db, current_user)
    group_uuid = _parse_uuid(group_id, code="INVALID_NOTIFICATION_GROUP_ID", label="notification group ID")
    return add_notification_group_member(
        db,
        company.id,
        group_uuid,
        name=payload.name,
        email=payload.email,
    )


@router.put("/notification-groups/{group_id}", response_model=NotificationGroupResponse)
def update_notification_group_route(
    group_id: str,
    payload: NotificationGroupUpdate,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company_for_user(db, current_user)
    group_uuid = _parse_uuid(group_id, code="INVALID_NOTIFICATION_GROUP_ID", label="notification group ID")
    return update_notification_group(
        db,
        company.id,
        group_uuid,
        name=payload.name,
        members=[{"name": member.name, "email": str(member.email)} for member in payload.members],
        updated_at=payload.updated_at,
    )


@router.post("/locations/{location_id}/notification-groups", response_model=NotificationGroupResponse)
def assign_notification_group_to_location_route(
    location_id: str,
    payload: AssignNotificationGroupToLocation,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company_for_user(db, current_user)
    location_uuid = _parse_uuid(location_id, code="INVALID_LOCATION_ID", label="location ID")
    result = assign_notification_group_to_location(
        db,
        company.id,
        location_uuid,
        payload.group_id,
    )
    # A group was added to this location; this may fix MISSING_NOTIFICATION_GROUPS
    # on flows that target it. Revalidate fail-safe in a separate transaction.
    try:
        from ..services.flow_validator import revalidate_flows_for_location
        revalidate_flows_for_location(db, location_uuid)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Flow revalidation failed for location %s after notification group assignment", location_uuid)
    return result


@router.put("/locations/{location_id}/notification-groups", response_model=list[NotificationGroupResponse])
def sync_location_notification_groups_route(
    location_id: str,
    payload: LocationNotificationGroupUpdate,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company_for_user(db, current_user)
    location_uuid = _parse_uuid(location_id, code="INVALID_LOCATION_ID", label="location ID")
    result = sync_location_notification_groups(
        db,
        company.id,
        location_uuid,
        payload.group_ids,
    )
    # Revalidate flows that target this location after notification-group changes
    # (separate transaction from the sync; fail-safe).
    try:
        from ..services.flow_validator import revalidate_flows_for_location
        revalidate_flows_for_location(db, location_uuid)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Flow revalidation failed for location %s", location_uuid)
    return result


@router.delete("/notification-groups/{group_id}", status_code=204)
def delete_notification_group_route(
    group_id: str,
    payload: DeleteRequest,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company_for_user(db, current_user)
    group_uuid = _parse_uuid(group_id, code="INVALID_NOTIFICATION_GROUP_ID", label="notification group ID")
    delete_notification_group(db, company.id, group_uuid, payload.updated_at)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/flow-runs", response_model=list[FlowRunResponse])
def list_flow_runs_route(
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    company = _get_company_for_user(db, current_user)
    return list_flow_runs(db, company.id)
