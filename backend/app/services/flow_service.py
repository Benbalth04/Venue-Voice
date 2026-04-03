from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..core.datetime_user_tz import to_iso8601_zoned
from ..core.errors.exceptions import (
    ConflictError,
    FlowExecutionError,
    NotFoundError,
    StaleObjectError,
    SubscriptionLimitError,
    ValidationError,
    suggest_upgrade_plan,
)
from ..db.postgres import SessionLocal
from ..services.email.constants import EMAIL_CATEGORY_USER_NOTIFICATION
from ..models.postgres_model import (
    Flow as FlowORM,
    FlowLocationSurvey as FlowLocationSurveyORM,
    FlowNode as FlowNodeORM,
    FlowRun as FlowRunORM,
    FlowRunAction as FlowRunActionORM,
    Location as LocationORM,
    LocationNotificationGroup as LocationNotificationGroupORM,
    LocationSurvey as LocationSurveyORM,
    NotificationGroup as NotificationGroupORM,
    NotificationGroupMember as NotificationGroupMemberORM,
    QRCode as QRCodeORM,
    Rule as RuleORM,
    RuleCondition as RuleConditionORM,
    Survey as SurveyORM,
    SurveyResponse as SurveyResponseORM,
    SurveyVersion as SurveyVersionORM,
    EmailEvent as EmailEventORM,
)
from ..schemas.pydantic_model import (
    FLOW_RULE_DUPLICATE_ON_PATH_MESSAGE,
    FlowActionType,
    FlowBranchMatchType,
    FlowBranchType,
    FlowEmailTargetType,
    FlowNodeType,
    FlowRedirectTargetType,
    RuleConditionType,
    assert_flow_rule_survey_ids_unique_per_path,
)
from .rule_service import (
    build_response_contexts_for_mock,
    build_response_contexts_for_response,
    evaluate_rule,
)

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class FlowAction:
    type: str
    url: str | None = None
    notification_group_id: uuid.UUID | None = None
    recipient_email: str | None = None
    email_target: str | None = None
    review_title: str | None = None
    review_subtitle: str | None = None
    confirm_button_label: str | None = None
    decline_button_label: str | None = None


@dataclass(slots=True)
class FlowEvaluationResult:
    flow: FlowORM
    trace: dict[str, Any]
    actions: list[FlowAction]
    runtime_ms: int


@dataclass(slots=True)
class FlowExecutionMetadata:
    """Describes the characteristics of active flows for a location survey submission."""
    has_active_flow: bool
    has_redirect_action: bool
    requires_ai_sentiment: bool


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _strip_tz(dt: datetime) -> datetime:
    """Normalize a datetime for comparison with a naive TIMESTAMP column."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _get_survey_or_404(db: Session, company_id: uuid.UUID, survey_id: uuid.UUID) -> SurveyORM:
    survey = (
        db.query(SurveyORM)
        .filter(
            SurveyORM.id == survey_id,
            SurveyORM.company_id == company_id,
            SurveyORM.deleted_at.is_(None),
        )
        .first()
    )
    if not survey:
        raise NotFoundError(code="SURVEY_NOT_FOUND", message="Survey not found")
    return survey


def _get_flow_or_404(
    db: Session,
    company_id: uuid.UUID,
    survey_id: uuid.UUID,
    flow_id: uuid.UUID,
) -> FlowORM:
    flow = (
        db.query(FlowORM)
        .options(
            joinedload(FlowORM.nodes),
            joinedload(FlowORM.location_surveys),
            joinedload(FlowORM.survey),
        )
        .filter(
            FlowORM.id == flow_id,
            FlowORM.company_id == company_id,
            FlowORM.survey_id == survey_id,
            FlowORM.deleted_at.is_(None),
        )
        .first()
    )
    if not flow:
        raise NotFoundError(code="FLOW_NOT_FOUND", message="Flow not found")
    return flow


def get_flow_for_company(db: Session, company_id: uuid.UUID, flow_id: uuid.UUID) -> FlowORM:
    flow = (
        db.query(FlowORM)
        .options(
            joinedload(FlowORM.nodes),
            joinedload(FlowORM.location_surveys),
            joinedload(FlowORM.survey),
        )
        .filter(
            FlowORM.id == flow_id,
            FlowORM.company_id == company_id,
            FlowORM.deleted_at.is_(None),
        )
        .first()
    )
    if not flow:
        raise NotFoundError(code="FLOW_NOT_FOUND", message="Flow not found")
    return flow


def get_flow_response(
    db: Session, company_id: uuid.UUID, flow_id: uuid.UUID, user_tz: ZoneInfo
) -> dict[str, Any]:
    """Return a single flow as a serialised response dict (consistent with create/update)."""
    return _flow_to_response(get_flow_for_company(db, company_id, flow_id), user_tz)


def _flow_to_response(flow: FlowORM, user_tz: ZoneInfo) -> dict[str, Any]:
    return {
        "id": flow.id,
        "company_id": flow.company_id,
        "survey_id": flow.survey_id,
        "survey_name": flow.survey.name if flow.survey else "",
        "name": flow.name,
        "description": flow.description,
        "is_active": flow.is_active,
        "location_survey_ids": [link.location_survey_id for link in flow.location_surveys],
        "nodes": [
            {
                "id": node.id,
                "parent_id": node.parent_id,
                "node_type": node.node_type,
                "rule_id": node.rule_id,
                "branch_type": node.branch_type,
                "action_type": node.action_type,
                "config": node.action_config,
                "position": node.position,
                "created_at": to_iso8601_zoned(node.created_at, user_tz) or "",
            }
            for node in sorted(flow.nodes, key=lambda row: (row.position, row.created_at, row.id))
        ],
        "status": getattr(flow, "status", "active") or "active",
        "broken_reasons": getattr(flow, "broken_reasons", None) or [],
        "created_at": to_iso8601_zoned(flow.created_at, user_tz) or "",
        "updated_at": to_iso8601_zoned(flow.updated_at, user_tz) or "",
    }


def _validate_location_survey_ids(
    db: Session,
    company_id: uuid.UUID,
    survey_id: uuid.UUID,
    location_survey_ids: list[uuid.UUID],
    *,
    exclude_flow_id: uuid.UUID | None = None,
) -> None:
    if not location_survey_ids:
        raise ValidationError(
            code="FLOW_LOCATION_SURVEYS_REQUIRED",
            message="At least one location survey is required",
            status_code=422,
        )
    rows = (
        db.query(LocationSurveyORM.id)
        .join(LocationORM, LocationORM.id == LocationSurveyORM.location_id)
        .filter(
            LocationSurveyORM.id.in_(location_survey_ids),
            LocationSurveyORM.survey_id == survey_id,
            LocationSurveyORM.deleted_at.is_(None),
            LocationORM.company_id == company_id,
            LocationORM.deleted_at.is_(None),
        )
        .all()
    )
    found_ids = {row[0] for row in rows}
    missing = [item for item in location_survey_ids if item not in found_ids]
    if missing:
        raise ValidationError(
            code="FLOW_LOCATION_SURVEY_INVALID",
            message="Flow location survey must belong to the same survey and company",
            details={"location_survey_ids": [str(item) for item in missing]},
            status_code=422,
        )

    assigned_rows = (
        db.query(FlowLocationSurveyORM.location_survey_id, FlowORM.id)
        .join(FlowORM, FlowORM.id == FlowLocationSurveyORM.flow_id)
        .filter(
            FlowLocationSurveyORM.location_survey_id.in_(location_survey_ids),
            FlowORM.company_id == company_id,
            FlowORM.deleted_at.is_(None),
        )
        .all()
    )
    conflicting_ids = [
        location_survey_id
        for location_survey_id, flow_id in assigned_rows
        if exclude_flow_id is None or flow_id != exclude_flow_id
    ]
    if conflicting_ids:
        raise ConflictError(
            code="FLOW_LOCATION_SURVEY_CONFLICT",
            message="A location survey can only be assigned to one flow",
            details={"location_survey_ids": [str(item) for item in conflicting_ids]},
        )


def _ensure_unique_flow_name(
    db: Session,
    company_id: uuid.UUID,
    name: str,
    *,
    exclude_flow_id: uuid.UUID | None = None,
) -> None:
    rows = (
        db.query(FlowORM)
        .filter(
            FlowORM.company_id == company_id,
            FlowORM.deleted_at.is_(None),
        )
        .all()
    )
    normalized_name = name.strip().casefold()
    for flow in rows:
        if exclude_flow_id is not None and flow.id == exclude_flow_id:
            continue
        if flow.name.strip().casefold() == normalized_name:
            raise ConflictError(
                code="FLOW_NAME_CONFLICT",
                message="Flow title must be unique within your company",
            )


def _preorder_flow_nodes_for_persist(nodes: list) -> list:
    """Order nodes parent-before-child so INSERTs satisfy flow_nodes.parent_id FK constraints.

    The API accepts nodes in arbitrary list order; the client often appends newly inserted nodes at the end,
    which can place deep descendants before their parents and cause save failures or inconsistent rows.
    """
    from uuid import NAMESPACE_URL, uuid5

    node_by_id: dict[uuid.UUID, Any] = {}
    children_by_parent: dict[uuid.UUID | None, list[uuid.UUID]] = {}
    for index, node in enumerate(nodes):
        nid = node.id if node.id is not None else uuid5(NAMESPACE_URL, f"flow-node-{index}")
        node_by_id[nid] = node
        children_by_parent.setdefault(node.parent_id, []).append(nid)
    roots = children_by_parent.get(None) or []
    if len(roots) != 1 or len(node_by_id) != len(nodes):
        return list(nodes)
    for child_ids in children_by_parent.values():
        child_ids.sort(key=lambda cid: (node_by_id[cid].position, str(cid)))
    ordered: list[Any] = []

    def walk(nid: uuid.UUID) -> None:
        ordered.append(node_by_id[nid])
        for cid in children_by_parent.get(nid, []):
            walk(cid)

    walk(roots[0])
    if len(ordered) != len(nodes):
        return list(nodes)
    return ordered


_MANAGE_SUBSCRIPTION_PATH = "/dashboard/settings/manage-subscription"


def _assert_flow_rule_ids_unique_per_root_path(nodes: list) -> None:
    """Same path rule check as CreateFlow (id resolution must match validate_structure)."""
    roots = [n for n in nodes if n.parent_id is None]
    if len(roots) != 1:
        return
    node_key_map: dict[uuid.UUID, Any] = {}
    for index, node in enumerate(nodes):
        node_id = node.id or uuid.uuid5(uuid.NAMESPACE_URL, f"flow-node-{index}")
        node_key_map[node_id] = node
    children_by_parent: dict[uuid.UUID | None, list[tuple[uuid.UUID, Any]]] = {}
    for index, node in enumerate(nodes):
        node_id = node.id or uuid.uuid5(uuid.NAMESPACE_URL, f"flow-node-{index}")
        children_by_parent.setdefault(node.parent_id, []).append((node_id, node))
    for ch in children_by_parent.values():
        ch.sort(key=lambda item: item[1].position)
    root_id = roots[0].id or uuid.uuid5(uuid.NAMESPACE_URL, "flow-root")
    try:
        assert_flow_rule_survey_ids_unique_per_path(node_key_map, children_by_parent, root_id)
    except ValueError as exc:
        raise ValidationError(
            code="FLOW_RULE_DUPLICATE_ON_PATH",
            message=FLOW_RULE_DUPLICATE_ON_PATH_MESSAGE,
            status_code=422,
        ) from exc


def _validate_nodes(
    db: Session,
    company_id: uuid.UUID,
    survey_id: uuid.UUID,
    nodes: list,
) -> None:
    if sum(1 for node in nodes if node.node_type == FlowNodeType.action) < 1:
        raise ValidationError(
            code="FLOW_REQUIRES_ACTION",
            message="Flows must include at least one action step (for example, send email or redirect).",
            status_code=422,
        )

    _assert_flow_rule_ids_unique_per_root_path(nodes)

    rule_ids = sorted({node.rule_id for node in nodes if node.rule_id is not None})
    branch_rule_ids: list[uuid.UUID] = []
    if rule_ids:
        rows = (
            db.query(RuleORM.id)
            .filter(
                RuleORM.id.in_(rule_ids),
                RuleORM.company_id == company_id,
                RuleORM.survey_id == survey_id,
                RuleORM.deleted_at.is_(None),
            )
            .all()
        )
        found = {row[0] for row in rows}
        if len(found) != len(rule_ids):
            raise ValidationError(
                code="FLOW_RULE_SURVEY_MISMATCH",
                message="Every rule in the flow must belong to the same survey",
                status_code=422,
            )

    for node in nodes:
        if node.node_type == FlowNodeType.branch:
            config = node.config or {}
            # New format: rule_conditions [{rule_id, expected}]
            raw_conditions = config.get("rule_conditions")
            if isinstance(raw_conditions, list):
                id_sources = [rc.get("rule_id") for rc in raw_conditions if isinstance(rc, dict)]
            else:
                # Legacy: rule_ids list
                id_sources = config.get("rule_ids", [])
            for raw_rule_id in id_sources:
                try:
                    branch_rule_ids.append(uuid.UUID(str(raw_rule_id)))
                except (TypeError, ValueError) as exc:
                    raise ValidationError(
                        code="FLOW_BRANCH_RULE_INVALID",
                        message="Branch nodes require valid rule IDs",
                        status_code=422,
                    ) from exc

    all_rule_ids = sorted(set(rule_ids + branch_rule_ids))
    if all_rule_ids:
        rows = (
            db.query(RuleORM.id)
            .filter(
                RuleORM.id.in_(all_rule_ids),
                RuleORM.company_id == company_id,
                RuleORM.survey_id == survey_id,
                RuleORM.deleted_at.is_(None),
            )
            .all()
        )
        found = {row[0] for row in rows}
        if len(found) != len(all_rule_ids):
            raise ValidationError(
                code="FLOW_RULE_SURVEY_MISMATCH",
                message="Every rule in the flow must belong to the same survey",
                status_code=422,
            )

    notification_group_ids: list[uuid.UUID] = []
    for node in nodes:
        if node.action_type != FlowActionType.email:
            continue
        config = node.config or {}
        if config.get("target") != FlowEmailTargetType.notification_group.value:
            continue
        raw_group_id = config.get("notification_group_id")
        try:
            notification_group_ids.append(uuid.UUID(str(raw_group_id)))
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                code="FLOW_NOTIFICATION_GROUP_INVALID",
                message="Email actions require a valid notification_group_id",
                status_code=422,
            ) from exc

    if notification_group_ids:
        rows = (
            db.query(NotificationGroupORM.id)
            .filter(
                NotificationGroupORM.id.in_(notification_group_ids),
                NotificationGroupORM.company_id == company_id,
                NotificationGroupORM.deleted_at.is_(None),
            )
            .all()
        )
        found = {row[0] for row in rows}
        if len(found) != len(set(notification_group_ids)):
            raise ValidationError(
                code="FLOW_NOTIFICATION_GROUP_NOT_FOUND",
                message="Email actions must reference a notification group in the same company",
                status_code=422,
            )


def list_flows(
    db: Session, company_id: uuid.UUID, survey_id: uuid.UUID, user_tz: ZoneInfo
) -> list[dict[str, Any]]:
    _get_survey_or_404(db, company_id, survey_id)
    rows = (
        db.query(FlowORM)
        .options(joinedload(FlowORM.nodes), joinedload(FlowORM.location_surveys), joinedload(FlowORM.survey))
        .filter(
            FlowORM.company_id == company_id,
            FlowORM.survey_id == survey_id,
            FlowORM.deleted_at.is_(None),
        )
        .order_by(FlowORM.updated_at.desc(), FlowORM.created_at.desc())
        .all()
    )
    return [_flow_to_response(row, user_tz) for row in rows]


def list_company_flows(db: Session, company_id: uuid.UUID, user_tz: ZoneInfo) -> list[dict[str, Any]]:
    rows = (
        db.query(FlowORM)
        .options(joinedload(FlowORM.nodes), joinedload(FlowORM.location_surveys), joinedload(FlowORM.survey))
        .filter(
            FlowORM.company_id == company_id,
            FlowORM.deleted_at.is_(None),
        )
        .order_by(FlowORM.updated_at.desc(), FlowORM.created_at.desc())
        .all()
    )
    return [_flow_to_response(row, user_tz) for row in rows]


def create_flow(
    db: Session, company_id: uuid.UUID, survey_id: uuid.UUID, payload, user_tz: ZoneInfo,
    *, policy=None, plan_key: str | None = None,
) -> dict[str, Any]:
    _get_survey_or_404(db, company_id, survey_id)
    _ensure_unique_flow_name(db, company_id, payload.name)
    _validate_location_survey_ids(db, company_id, survey_id, payload.location_survey_ids)
    _validate_nodes(db, company_id, survey_id, payload.nodes)

    if policy is not None:
        # Active flow limit — only applies when the new flow starts active
        if payload.is_active:
            from ..auth.plan_enforcement import acquire_company_resource_lock, count_active_flows
            acquire_company_resource_lock(db, company_id, "active_flows")
            current = count_active_flows(db, company_id)
            if policy.max_active_flows != -1 and current >= policy.max_active_flows:
                raise SubscriptionLimitError(
                    resource="active_flows",
                    limit=policy.max_active_flows,
                    current=current,
                    is_over_limit=(current > policy.max_active_flows),
                    plan=plan_key,
                    upgrade_to=suggest_upgrade_plan(plan_key),
                )

        # Branch node limit per flow
        if policy.max_branch_nodes_per_flow != -1:
            branch_count = sum(
                1 for n in payload.nodes
                if n.node_type.value == "branch"
            )
            if branch_count > policy.max_branch_nodes_per_flow:
                lim = policy.max_branch_nodes_per_flow
                raise SubscriptionLimitError(
                    resource="branch_nodes_per_flow",
                    limit=lim,
                    current=branch_count,
                    message=(
                        f"This flow has {branch_count} branch steps, but your plan allows at most {lim} per flow. "
                        "Remove branch steps or upgrade your plan."
                    ),
                    plan=plan_key,
                    upgrade_to=suggest_upgrade_plan(plan_key),
                    extra_details={"manage_subscription_path": _MANAGE_SUBSCRIPTION_PATH},
                )

    flow = FlowORM(
        company_id=company_id,
        survey_id=survey_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description and payload.description.strip() else None,
        is_active=payload.is_active,
    )
    db.add(flow)
    db.flush()

    for location_survey_id in payload.location_survey_ids:
        db.add(FlowLocationSurveyORM(flow_id=flow.id, location_survey_id=location_survey_id))
    for node in _preorder_flow_nodes_for_persist(list(payload.nodes)):
        db.add(
            FlowNodeORM(
                id=node.id or uuid.uuid4(),
                flow_id=flow.id,
                parent_id=node.parent_id,
                node_type=node.node_type.value,
                rule_id=node.rule_id,
                branch_type=node.branch_type.value if node.branch_type else None,
                action_type=node.action_type.value if node.action_type else None,
                action_config=node.config,
                position=node.position,
            )
        )

    db.commit()
    return _flow_to_response(_get_flow_or_404(db, company_id, survey_id, flow.id), user_tz)


def set_flow_active(
    db: Session,
    company_id: uuid.UUID,
    survey_id: uuid.UUID,
    flow_id: uuid.UUID,
    *,
    is_active: bool,
    updated_at,
    user_tz: ZoneInfo,
    policy=None,
    plan_key: str | None = None,
) -> dict[str, Any]:
    flow = _get_flow_or_404(db, company_id, survey_id, flow_id)

    if is_active and policy is not None:
        from ..auth.plan_enforcement import acquire_company_resource_lock, count_active_flows
        acquire_company_resource_lock(db, company_id, "active_flows")
        current = count_active_flows(db, company_id)
        if policy.max_active_flows != -1 and current >= policy.max_active_flows:
            raise SubscriptionLimitError(
                resource="active_flows",
                limit=policy.max_active_flows,
                current=current,
                is_over_limit=(current > policy.max_active_flows),
                plan=plan_key,
                upgrade_to=suggest_upgrade_plan(plan_key),
            )

    rowcount = (
        db.query(FlowORM)
        .filter(
            FlowORM.id == flow.id,
            FlowORM.updated_at == _strip_tz(updated_at),
        )
        .update({"is_active": is_active, "updated_at": _now()}, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("Flow", str(flow.id))

    db.commit()
    return _flow_to_response(_get_flow_or_404(db, company_id, survey_id, flow_id), user_tz)


def update_flow(
    db: Session,
    company_id: uuid.UUID,
    survey_id: uuid.UUID,
    flow_id: uuid.UUID,
    payload,
    user_tz: ZoneInfo,
    *, policy=None, plan_key: str | None = None,
) -> dict[str, Any]:
    flow = _get_flow_or_404(db, company_id, survey_id, flow_id)
    _ensure_unique_flow_name(db, company_id, payload.name, exclude_flow_id=flow.id)
    _validate_location_survey_ids(
        db,
        company_id,
        survey_id,
        payload.location_survey_ids,
        exclude_flow_id=flow.id,
    )
    _validate_nodes(db, company_id, survey_id, payload.nodes)

    # Branch node limit — applies on edit because user could add branch nodes.
    # We always block if the submitted node count exceeds the plan limit, whether
    # the account is exactly at-limit (normal) or over-limit (post-downgrade).
    if policy is not None and policy.max_branch_nodes_per_flow != -1:
        branch_count = sum(
            1 for n in payload.nodes
            if n.node_type.value == "branch"
        )
        if branch_count > policy.max_branch_nodes_per_flow:
            lim = policy.max_branch_nodes_per_flow
            raise SubscriptionLimitError(
                resource="branch_nodes_per_flow",
                limit=lim,
                current=branch_count,
                is_over_limit=True,  # edit path: user is actively trying to worsen a violation
                plan=plan_key,
                upgrade_to=suggest_upgrade_plan(plan_key),
                message=(
                    f"This flow has {branch_count} branch steps, but your plan allows at most {lim} per flow. "
                    "Remove branch steps or upgrade your plan."
                ),
                extra_details={"manage_subscription_path": _MANAGE_SUBSCRIPTION_PATH},
            )

    rowcount = (
        db.query(FlowORM)
        .filter(
            FlowORM.id == flow.id,
            FlowORM.updated_at == _strip_tz(payload.updated_at),
        )
        .update(
            {
                "name": payload.name.strip(),
                "description": payload.description.strip() if payload.description and payload.description.strip() else None,
                "is_active": payload.is_active,
                "updated_at": _now(),
            },
            synchronize_session="fetch",
        )
    )
    if rowcount == 0:
        raise StaleObjectError("Flow", str(flow.id))

    db.query(FlowLocationSurveyORM).filter(FlowLocationSurveyORM.flow_id == flow.id).delete(synchronize_session=False)
    # Use 'fetch' so deleted FlowNodeORM rows are removed from the session identity map.
    # With synchronize_session=False, stale instances can remain keyed by the same PKs; re-adding
    # nodes with those ids on update then fails to INSERT (or merges incorrectly), dropping nodes.
    db.query(FlowNodeORM).filter(FlowNodeORM.flow_id == flow.id).delete(synchronize_session="fetch")
    db.flush()
    db.expire(flow, ["nodes"])

    for location_survey_id in payload.location_survey_ids:
        db.add(FlowLocationSurveyORM(flow_id=flow.id, location_survey_id=location_survey_id))
    for node in _preorder_flow_nodes_for_persist(list(payload.nodes)):
        db.add(
            FlowNodeORM(
                id=node.id or uuid.uuid4(),
                flow_id=flow.id,
                parent_id=node.parent_id,
                node_type=node.node_type.value,
                rule_id=node.rule_id,
                branch_type=node.branch_type.value if node.branch_type else None,
                action_type=node.action_type.value if node.action_type else None,
                action_config=node.config,
                position=node.position,
            )
        )

    db.commit()
    return _flow_to_response(_get_flow_or_404(db, company_id, survey_id, flow.id), user_tz)


def delete_flow(db: Session, company_id: uuid.UUID, survey_id: uuid.UUID, flow_id: uuid.UUID, updated_at) -> None:
    flow = _get_flow_or_404(db, company_id, survey_id, flow_id)

    rowcount = (
        db.query(FlowORM)
        .filter(
            FlowORM.id == flow.id,
            FlowORM.updated_at == _strip_tz(updated_at),
        )
        .update({"deleted_at": _now(), "updated_at": _now()}, synchronize_session=False)
    )
    if rowcount == 0:
        raise StaleObjectError("Flow", str(flow.id))

    db.commit()


def _load_flow_rules(db: Session, flow: FlowORM) -> dict[uuid.UUID, RuleORM]:
    rule_ids = {node.rule_id for node in flow.nodes if node.rule_id is not None}
    for node in flow.nodes:
        if node.node_type != FlowNodeType.branch.value:
            continue
        cfg = node.action_config or {}
        raw_conditions = cfg.get("rule_conditions")
        if isinstance(raw_conditions, list):
            for rc in raw_conditions:
                if not isinstance(rc, dict) or rc.get("rule_id") is None:
                    continue
                try:
                    rule_ids.add(uuid.UUID(str(rc["rule_id"])))
                except (TypeError, ValueError):
                    continue
        for raw_rule_id in cfg.get("rule_ids", []):
            try:
                rule_ids.add(uuid.UUID(str(raw_rule_id)))
            except (TypeError, ValueError):
                continue
    rule_ids = sorted(rule_ids)
    if not rule_ids:
        return {}
    rows = (
        db.query(RuleORM)
        .options(joinedload(RuleORM.conditions), joinedload(RuleORM.groups))
        .filter(
            RuleORM.id.in_(rule_ids),
            RuleORM.deleted_at.is_(None),
        )
        .all()
    )
    return {row.id: row for row in rows}


def _build_tree(flow: FlowORM) -> tuple[dict[uuid.UUID, FlowNodeORM], dict[uuid.UUID | None, list[FlowNodeORM]], FlowNodeORM]:
    nodes_by_id = {node.id: node for node in flow.nodes}
    children_by_parent: dict[uuid.UUID | None, list[FlowNodeORM]] = {}
    for node in flow.nodes:
        children_by_parent.setdefault(node.parent_id, []).append(node)
    for children in children_by_parent.values():
        children.sort(key=lambda item: (item.position, item.created_at, item.id))
    roots = children_by_parent.get(None, [])
    if len(roots) != 1:
        raise ValidationError(
            code="FLOW_ROOT_INVALID",
            message="Flow must contain exactly one root node",
            status_code=422,
        )
    return nodes_by_id, children_by_parent, roots[0]


def _get_location_runtime_context(
    db: Session,
    *,
    company_id: uuid.UUID,
    location_survey_id: uuid.UUID,
) -> dict[str, Any]:
    row = (
        db.query(LocationSurveyORM, LocationORM)
        .join(LocationORM, LocationORM.id == LocationSurveyORM.location_id)
        .filter(
            LocationSurveyORM.id == location_survey_id,
            LocationSurveyORM.deleted_at.is_(None),
            LocationORM.company_id == company_id,
            LocationORM.deleted_at.is_(None),
        )
        .first()
    )
    if not row:
        raise NotFoundError(code="LOCATION_SURVEY_NOT_FOUND", message="Location survey not found")
    location_survey, location = row
    return {
        "location_id": location.id,
        "location_name": location.name,
        "location_google_business_url": location.google_business_url,
        "location_survey_id": location_survey.id,
    }


def _select_single_child(
    node_id: uuid.UUID,
    children_by_parent: dict[uuid.UUID | None, list[FlowNodeORM]],
) -> FlowNodeORM | None:
    children = children_by_parent.get(node_id, [])
    return children[0] if children else None


def _select_branch_child(
    node_id: uuid.UUID,
    branch_type: str,
    children_by_parent: dict[uuid.UUID | None, list[FlowNodeORM]],
) -> FlowNodeORM | None:
    return next(
        (child for child in children_by_parent.get(node_id, []) if child.branch_type == branch_type),
        None,
    )


def _evaluate_flow_node(
    node: FlowNodeORM,
    *,
    children_by_parent: dict[uuid.UUID | None, list[FlowNodeORM]],
    rule_map: dict[uuid.UUID, RuleORM],
    contexts: dict[uuid.UUID, Any],
    runtime_context: dict[str, Any],
    trace_nodes: list[dict[str, Any]],
) -> list[FlowAction]:
    if node.node_type == FlowNodeType.terminate.value:
        trace_nodes.append(
            {
                "id": str(node.id),
                "type": node.node_type,
                "executed": False,
                "reason": "terminated",
            }
        )
        return []

    if node.node_type == FlowNodeType.rule.value:
        rule = rule_map.get(node.rule_id)
        if rule is None:
            raise ValidationError(
                code="FLOW_RULE_NOT_FOUND",
                message="Flow references a missing rule",
                status_code=422,
            )
        if getattr(rule, "status", "active") == "broken":
            from ..core.errors.exceptions import RuleBrokenError
            raise RuleBrokenError()
        result = evaluate_rule(rule, contexts)
        trace_nodes.append(
            {
                "id": str(node.id),
                "type": node.node_type,
                "rule_id": str(node.rule_id),
                "result": result,
            }
        )
        child = _select_single_child(node.id, children_by_parent)
        if child is None:
            return []
        return _evaluate_flow_node(
            child,
            children_by_parent=children_by_parent,
            rule_map=rule_map,
            contexts=contexts,
            runtime_context=runtime_context,
            trace_nodes=trace_nodes,
        )

    if node.node_type == FlowNodeType.branch.value:
        config = node.action_config or {}
        match_type = config.get("match_type", FlowBranchMatchType.all.value)
        rule_results: list[dict[str, Any]] = []

        raw_conditions = config.get("rule_conditions")
        if isinstance(raw_conditions, list):
            # New format: [{rule_id, expected}]
            for rc in raw_conditions:
                if not isinstance(rc, dict):
                    continue
                rule_uuid = uuid.UUID(str(rc["rule_id"]))
                expected = bool(rc.get("expected", True))
                rule = rule_map.get(rule_uuid)
                if rule is None:
                    raise ValidationError(
                        code="FLOW_RULE_NOT_FOUND",
                        message="Flow references a missing rule",
                        status_code=422,
                    )
                actual = evaluate_rule(rule, contexts)
                rule_results.append({"rule_id": str(rule_uuid), "expected": expected, "result": actual, "match": actual == expected})
        else:
            # Legacy format: rule_ids + negate
            negate = bool(config.get("negate", False))
            for raw_rule_id in config.get("rule_ids", []):
                rule_uuid = uuid.UUID(str(raw_rule_id))
                rule = rule_map.get(rule_uuid)
                if rule is None:
                    raise ValidationError(
                        code="FLOW_RULE_NOT_FOUND",
                        message="Flow references a missing rule",
                        status_code=422,
                    )
                actual = evaluate_rule(rule, contexts)
                rule_results.append({"rule_id": str(rule_uuid), "expected": not negate, "result": actual, "match": actual == (not negate)})

        matches = [item["match"] for item in rule_results]
        if match_type == FlowBranchMatchType.any.value:
            combined = any(matches) if matches else False
        else:
            combined = all(matches) if matches else False

        trace_nodes.append(
            {
                "id": str(node.id),
                "type": node.node_type,
                "match_type": match_type,
                "rules": rule_results,
                "result": combined,
            }
        )
        child = _select_branch_child(
            node.id,
            FlowBranchType.TRUE.value if combined else FlowBranchType.FALSE.value,
            children_by_parent,
        )
        if child is None:
            return []
        return _evaluate_flow_node(
            child,
            children_by_parent=children_by_parent,
            rule_map=rule_map,
            contexts=contexts,
            runtime_context=runtime_context,
            trace_nodes=trace_nodes,
        )

    action = FlowAction(type=node.action_type or "")
    config = node.action_config or {}
    if node.action_type == FlowActionType.redirect.value:
        target = config.get("target", FlowRedirectTargetType.google_business_url.value)
        if target == FlowRedirectTargetType.google_business_url.value:
            action.url = str(runtime_context.get("location_google_business_url") or "").strip() or None
        else:
            action.url = str(config.get("url") or "").strip() or None
        raw_title = config.get("review_title")
        raw_subtitle = config.get("review_subtitle")
        action.review_title = str(raw_title).strip() if isinstance(raw_title, str) and raw_title.strip() else None
        action.review_subtitle = str(raw_subtitle).strip() if isinstance(raw_subtitle, str) and raw_subtitle.strip() else None
        raw_confirm = config.get("confirm_button_label")
        raw_decline = config.get("decline_button_label")
        action.confirm_button_label = str(raw_confirm).strip() if isinstance(raw_confirm, str) and raw_confirm.strip() else None
        action.decline_button_label = str(raw_decline).strip() if isinstance(raw_decline, str) and raw_decline.strip() else None
        if not action.url:
            trace_nodes.append(
                {
                    "id": str(node.id),
                    "type": node.node_type,
                    "action_type": node.action_type,
                    "executed": False,
                    "reason": "missing_redirect_url",
                }
            )
            return []
    elif node.action_type == FlowActionType.email.value:
        target = str(config.get("target") or "")
        action.email_target = target
        if target == FlowEmailTargetType.custom_email.value:
            action.recipient_email = str(config.get("email") or "").strip() or None
        elif target == FlowEmailTargetType.notification_group.value:
            raw_group_id = config.get("notification_group_id")
            action.notification_group_id = uuid.UUID(str(raw_group_id))
    trace_nodes.append(
        {
            "id": str(node.id),
            "type": node.node_type,
            "action_type": node.action_type,
            "executed": True,
        }
    )
    out: list[FlowAction] = [action]
    chain_child = _select_single_child(node.id, children_by_parent)
    if chain_child is not None and chain_child.node_type in (FlowNodeType.action.value, FlowNodeType.terminate.value):
        out.extend(
            _evaluate_flow_node(
                chain_child,
                children_by_parent=children_by_parent,
                rule_map=rule_map,
                contexts=contexts,
                runtime_context=runtime_context,
                trace_nodes=trace_nodes,
            )
        )
    return out


def _evaluate_single_flow(
    db: Session,
    flow: FlowORM,
    contexts: dict[uuid.UUID, Any],
    *,
    runtime_context: dict[str, Any],
) -> FlowEvaluationResult:
    started = time.perf_counter()
    _, children_by_parent, root = _build_tree(flow)
    rule_map = _load_flow_rules(db, flow)
    trace_nodes: list[dict[str, Any]] = []
    actions = _evaluate_flow_node(
        root,
        children_by_parent=children_by_parent,
        rule_map=rule_map,
        contexts=contexts,
        runtime_context=runtime_context,
        trace_nodes=trace_nodes,
    )
    runtime_ms = int((time.perf_counter() - started) * 1000)
    return FlowEvaluationResult(
        flow=flow,
        trace={
            "flow_id": str(flow.id),
            "flow_name": flow.name,
            "runtime_ms": runtime_ms,
            "nodes": trace_nodes,
        },
        actions=actions,
        runtime_ms=runtime_ms,
    )


def _persist_flow_run(
    db: Session,
    *,
    company_id: uuid.UUID,
    flow: FlowORM,
    response_id: uuid.UUID | None,
    location_survey_id: uuid.UUID,
    qr_code_id: uuid.UUID | None,
    execution_trace: dict[str, Any],
    actions: list[FlowAction],
) -> FlowRunORM:
    # Idempotency guard — never create a duplicate run for the same (flow, response) pair.
    if response_id is not None:
        existing = (
            db.query(FlowRunORM)
            .filter(
                FlowRunORM.flow_id == flow.id,
                FlowRunORM.response_id == response_id,
            )
            .first()
        )
        if existing is not None:
            logger.info(
                "Flow run already exists for flow_id=%s response_id=%s — skipping (idempotent)",
                flow.id,
                response_id,
            )
            return existing

    row = FlowRunORM(
        company_id=company_id,
        flow_id=flow.id,
        response_id=response_id,
        success=len(actions) > 0,
        location_survey_id=location_survey_id,
        qr_code_id=qr_code_id,
        execution_trace=execution_trace,
    )
    db.add(row)
    db.flush()

    for action in actions:
        # Persist one FlowRunAction row per action taken.
        action_config: dict[str, Any] = {}
        if action.type == FlowActionType.redirect.value:
            action_config = {"url": action.url}
        elif action.type == FlowActionType.email.value:
            action_config = {
                "email_target": action.email_target,
                "recipient_email": action.recipient_email,
                "notification_group_id": str(action.notification_group_id) if action.notification_group_id else None,
            }
        db.add(FlowRunActionORM(flow_run_id=row.id, action_type=action.type, config=action_config))

        # For email actions also create EmailEvent rows for delivery tracking.
        if action.type != FlowActionType.email.value:
            continue
        recipient_emails: list[str] = []
        if action.email_target == FlowEmailTargetType.custom_email.value and action.recipient_email:
            recipient_emails = [action.recipient_email]
        elif action.email_target == FlowEmailTargetType.notification_group.value and action.notification_group_id:
            members = (
                db.query(NotificationGroupMemberORM)
                .join(NotificationGroupORM, NotificationGroupORM.id == NotificationGroupMemberORM.group_id)
                .filter(
                    NotificationGroupORM.id == action.notification_group_id,
                    NotificationGroupORM.company_id == company_id,
                    NotificationGroupORM.deleted_at.is_(None),
                    NotificationGroupMemberORM.deleted_at.is_(None),
                )
                .all()
            )
            recipient_emails = [member.email for member in members]
        elif action.email_target == FlowEmailTargetType.location_notification_groups.value:
            members = (
                db.query(NotificationGroupMemberORM.email)
                .join(NotificationGroupORM, NotificationGroupORM.id == NotificationGroupMemberORM.group_id)
                .join(LocationNotificationGroupORM, LocationNotificationGroupORM.group_id == NotificationGroupORM.id)
                .join(LocationSurveyORM, LocationSurveyORM.id == location_survey_id)
                .filter(
                    LocationNotificationGroupORM.location_id == LocationSurveyORM.location_id,
                    NotificationGroupORM.company_id == company_id,
                    NotificationGroupORM.deleted_at.is_(None),
                    NotificationGroupMemberORM.deleted_at.is_(None),
                )
                .all()
            )
            recipient_emails = [email for email, in members]
        for email in sorted({email.strip().lower() for email in recipient_emails if email}):
            db.add(
                EmailEventORM(
                    company_id=company_id,
                    flow_run_id=row.id,
                    recipient_email=email,
                    status="pending",
                    event_category=EMAIL_CATEGORY_USER_NOTIFICATION,
                )
            )

    return row


def get_flow_execution_metadata(
    db: Session,
    company_id: uuid.UUID,
    survey_id: uuid.UUID,
    location_survey_id: uuid.UUID,
) -> FlowExecutionMetadata:
    """
    Single-query metadata check run before survey submission processing.
    Returns which execution branch to take based on the characteristics of
    active, non-broken flows assigned to this location survey.
    """
    flow_id_rows = (
        db.query(FlowORM.id)
        .join(FlowLocationSurveyORM, FlowLocationSurveyORM.flow_id == FlowORM.id)
        .filter(
            FlowORM.company_id == company_id,
            FlowORM.survey_id == survey_id,
            FlowORM.is_active.is_(True),
            FlowORM.status == "active",
            FlowORM.deleted_at.is_(None),
            FlowLocationSurveyORM.location_survey_id == location_survey_id,
        )
        .all()
    )
    if not flow_id_rows:
        return FlowExecutionMetadata(has_active_flow=False, has_redirect_action=False, requires_ai_sentiment=False)

    flow_ids = [row.id for row in flow_id_rows]

    has_redirect = (
        db.query(FlowNodeORM.id)
        .filter(
            FlowNodeORM.flow_id.in_(flow_ids),
            FlowNodeORM.action_type == FlowActionType.redirect.value,
        )
        .first()
    ) is not None

    has_sentiment = (
        db.query(RuleConditionORM.id)
        .join(RuleORM, RuleORM.id == RuleConditionORM.rule_id)
        .join(FlowNodeORM, FlowNodeORM.rule_id == RuleORM.id)
        .filter(
            FlowNodeORM.flow_id.in_(flow_ids),
            RuleConditionORM.condition_type == RuleConditionType.sentiment.value,
            RuleConditionORM.deleted_at.is_(None),
        )
        .first()
    ) is not None

    return FlowExecutionMetadata(
        has_active_flow=True,
        has_redirect_action=has_redirect,
        requires_ai_sentiment=has_sentiment,
    )


def execute_flows_for_response(
    db: Session,
    *,
    company_id: uuid.UUID,
    survey_id: uuid.UUID,
    survey_response_id: uuid.UUID,
    location_survey_id: uuid.UUID,
    qr_code_id: uuid.UUID | None,
) -> dict[str, Any] | None:
    response = (
        db.query(SurveyResponseORM)
        .filter(
            SurveyResponseORM.id == survey_response_id,
            SurveyResponseORM.deleted_at.is_(None),
        )
        .first()
    )
    if not response:
        raise NotFoundError(code="SURVEY_RESPONSE_NOT_FOUND", message="Survey response not found")

    flows = (
        db.query(FlowORM)
        .options(joinedload(FlowORM.nodes), joinedload(FlowORM.location_surveys))
        .join(FlowLocationSurveyORM, FlowLocationSurveyORM.flow_id == FlowORM.id)
        .filter(
            FlowORM.company_id == company_id,
            FlowORM.survey_id == survey_id,
            FlowORM.is_active.is_(True),
            FlowORM.status == "active",
            FlowORM.deleted_at.is_(None),
            FlowLocationSurveyORM.location_survey_id == location_survey_id,
        )
        .order_by(FlowORM.created_at.asc(), FlowORM.id.asc())
        .all()
    )
    if not flows:
        return None

    contexts = build_response_contexts_for_response(db, response)
    runtime_context = _get_location_runtime_context(
        db,
        company_id=company_id,
        location_survey_id=location_survey_id,
    )
    first_action: dict[str, Any] | None = None

    persisted_flow_runs: list[FlowRunORM] = []
    for flow in flows:
        result = _evaluate_single_flow(db, flow, contexts, runtime_context=runtime_context)
        actions = result.actions
        flow_run = _persist_flow_run(
            db,
            company_id=company_id,
            flow=flow,
            response_id=response.id,
            location_survey_id=location_survey_id,
            qr_code_id=qr_code_id,
            execution_trace=result.trace,
            actions=actions,
        )
        persisted_flow_runs.append(flow_run)
        if actions and first_action is None:
            redirect_action = next(
                (a for a in actions if a.type == FlowActionType.redirect.value and a.url),
                None,
            )
            chosen = redirect_action or actions[0]
            first_action = {
                "type": chosen.type,
                "url": chosen.url,
                "notification_group_id": str(chosen.notification_group_id) if chosen.notification_group_id else None,
                "recipient_email": chosen.recipient_email,
                "review_title": chosen.review_title,
                "review_subtitle": chosen.review_subtitle,
                "confirm_button_label": chosen.confirm_button_label,
                "decline_button_label": chosen.decline_button_label,
            }
            break

    db.commit()

    # Attempt immediate email delivery. Failures are logged and left in
    # "pending" status so the reconciliation job can retry them.
    from .email import send_emails_for_flow_run
    for flow_run in persisted_flow_runs:
        try:
            send_emails_for_flow_run(flow_run.id, db)
        except Exception:
            logger.exception(
                "Immediate email send failed for flow_run_id=%s — reconciliation will retry",
                flow_run.id,
            )

    return first_action


def run_flow_background(
    *,
    company_id: uuid.UUID,
    survey_id: uuid.UUID,
    survey_response_id: uuid.UUID,
    location_survey_id: uuid.UUID,
    qr_code_id: uuid.UUID | None,
) -> None:
    """Background task: execute flows only (no AI needed)."""
    db = SessionLocal()
    try:
        execute_flows_for_response(
            db,
            company_id=company_id,
            survey_id=survey_id,
            survey_response_id=survey_response_id,
            location_survey_id=location_survey_id,
            qr_code_id=qr_code_id,
        )
    except Exception:
        logger.exception(
            "Background flow execution failed for response_id=%s", survey_response_id
        )
    finally:
        db.close()


def run_ai_then_flow_background(
    *,
    company_id: uuid.UUID,
    survey_id: uuid.UUID,
    survey_response_id: uuid.UUID,
    location_survey_id: uuid.UUID,
    qr_code_id: uuid.UUID | None,
) -> None:
    """Background task: run AI analysis first, then execute flows (scenario b)."""
    from .ai_analysis_service import run_ai_analysis_for_response  # local import to avoid circular

    db = SessionLocal()
    try:
        response = (
            db.query(SurveyResponseORM)
            .filter(
                SurveyResponseORM.id == survey_response_id,
                SurveyResponseORM.deleted_at.is_(None),
            )
            .first()
        )
        if response is None:
            raise FlowExecutionError(
                code="RESPONSE_NOT_FOUND",
                message=f"Survey response {survey_response_id} not found in background AI+flow task",
            )
        run_ai_analysis_for_response(db, response)
        execute_flows_for_response(
            db,
            company_id=company_id,
            survey_id=survey_id,
            survey_response_id=survey_response_id,
            location_survey_id=location_survey_id,
            qr_code_id=qr_code_id,
        )
    except Exception:
        logger.exception(
            "Background AI+flow execution failed for response_id=%s", survey_response_id
        )
    finally:
        db.close()


def run_ai_background(*, survey_response_id: uuid.UUID) -> None:
    """Background task: run AI analysis only (scenario c — no-wait AI for flows with redirect)."""
    from .ai_analysis_service import run_ai_analysis_for_response  # local import to avoid circular

    db = SessionLocal()
    try:
        response = (
            db.query(SurveyResponseORM)
            .filter(
                SurveyResponseORM.id == survey_response_id,
                SurveyResponseORM.deleted_at.is_(None),
            )
            .first()
        )
        if response is not None:
            run_ai_analysis_for_response(db, response)
        else:
            logger.warning(
                "Background AI analysis: response_id=%s not found, skipping", survey_response_id
            )
    except Exception:
        logger.exception(
            "Background AI analysis failed for response_id=%s", survey_response_id
        )
    finally:
        db.close()


def test_flow(
    db: Session,
    *,
    company_id: uuid.UUID,
    survey_id: uuid.UUID,
    flow_id: uuid.UUID,
    mock_response: dict[str, Any],
    location_survey_id: uuid.UUID,
) -> dict[str, Any]:
    flow = _get_flow_or_404(db, company_id, survey_id, flow_id)
    contexts = build_response_contexts_for_mock(db, survey_id, mock_response)
    runtime_context = _get_location_runtime_context(
        db,
        company_id=company_id,
        location_survey_id=location_survey_id,
    )
    result = _evaluate_single_flow(db, flow, contexts, runtime_context=runtime_context)
    actions = result.actions
    redirect_action = next((a for a in actions if a.type == FlowActionType.redirect.value and a.url), None)
    primary = redirect_action or (actions[0] if actions else None)
    action_payloads = [
        {
            "type": a.type,
            "url": a.url,
            "notification_group_id": a.notification_group_id,
            "recipient_email": a.recipient_email,
        }
        for a in actions
    ]
    return {
        "execution_trace": result.trace,
        "action": (
            {
                "type": primary.type,
                "url": primary.url,
                "notification_group_id": primary.notification_group_id,
                "recipient_email": primary.recipient_email,
            }
            if primary
            else None
        ),
        "actions": action_payloads,
    }


def _flow_run_to_response_dict(
    run: FlowRunORM,
    flow: FlowORM,
    survey: SurveyORM,
    location: LocationORM | None,
    qr: QRCodeORM | None,
    user_tz: ZoneInfo,
) -> dict[str, Any]:
    trace = run.execution_trace if isinstance(run.execution_trace, dict) else {}
    return {
        "id": run.id,
        "company_id": run.company_id,
        "flow_id": run.flow_id,
        "flow_name": flow.name,
        "survey_id": survey.id,
        "survey_name": survey.name,
        "response_id": run.response_id,
        "success": run.success,
        "location_survey_id": run.location_survey_id,
        "location_id": location.id if location else None,
        "location_name": location.name if location else None,
        "qr_code_id": run.qr_code_id,
        "qr_code_title": qr.title if qr else None,
        "actions": [
            {
                "id": a.id,
                "action_type": a.action_type,
                "config": a.config,
                "created_at": to_iso8601_zoned(a.created_at, user_tz) or "",
            }
            for a in sorted(run.flow_run_actions, key=lambda a: a.created_at)
        ],
        "runtime_ms": int(trace.get("runtime_ms"))
        if trace.get("runtime_ms") is not None
        else None,
        "execution_trace": trace,
        "created_at": to_iso8601_zoned(run.created_at, user_tz) or "",
    }


def list_flow_runs_for_response(
    db: Session,
    company_id: uuid.UUID,
    response_id: uuid.UUID,
    user_tz: ZoneInfo,
) -> list[dict[str, Any]]:
    rows = (
        db.query(FlowRunORM, FlowORM, SurveyORM, LocationORM, QRCodeORM)
        .options(joinedload(FlowRunORM.flow_run_actions))
        .join(FlowORM, FlowORM.id == FlowRunORM.flow_id)
        .join(SurveyORM, SurveyORM.id == FlowORM.survey_id)
        .outerjoin(LocationSurveyORM, LocationSurveyORM.id == FlowRunORM.location_survey_id)
        .outerjoin(LocationORM, LocationORM.id == LocationSurveyORM.location_id)
        .outerjoin(QRCodeORM, QRCodeORM.id == FlowRunORM.qr_code_id)
        .filter(FlowRunORM.company_id == company_id)
        .filter(FlowRunORM.response_id == response_id)
        .order_by(FlowRunORM.created_at.desc(), FlowRunORM.id.desc())
        .all()
    )
    return [
        _flow_run_to_response_dict(run, flow, survey, location, qr, user_tz)
        for run, flow, survey, location, qr in rows
    ]


def list_flow_runs(
    db: Session,
    company_id: uuid.UUID,
    user_tz: ZoneInfo,
    *,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 20
    if page_size > 20:
        page_size = 20

    total = (
        db.query(func.count(FlowRunORM.id))
        .select_from(FlowRunORM)
        .filter(FlowRunORM.company_id == company_id)
        .scalar()
        or 0
    )

    offset = (page - 1) * page_size
    rows = (
        db.query(FlowRunORM, FlowORM, SurveyORM, LocationORM, QRCodeORM)
        .options(joinedload(FlowRunORM.flow_run_actions))
        .join(FlowORM, FlowORM.id == FlowRunORM.flow_id)
        .join(SurveyORM, SurveyORM.id == FlowORM.survey_id)
        .outerjoin(LocationSurveyORM, LocationSurveyORM.id == FlowRunORM.location_survey_id)
        .outerjoin(LocationORM, LocationORM.id == LocationSurveyORM.location_id)
        .outerjoin(QRCodeORM, QRCodeORM.id == FlowRunORM.qr_code_id)
        .filter(FlowRunORM.company_id == company_id)
        .order_by(FlowRunORM.created_at.desc(), FlowRunORM.id.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )
    items = [
        _flow_run_to_response_dict(run, flow, survey, location, qr, user_tz)
        for run, flow, survey, location, qr in rows
    ]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def get_company_broken_flow_count(db: Session, company_id: uuid.UUID) -> int:
    return (
        db.query(FlowORM)
        .filter(
            FlowORM.company_id == company_id,
            FlowORM.deleted_at.is_(None),
            FlowORM.status == "broken",
        )
        .count()
    )
