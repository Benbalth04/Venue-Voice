"""
Flow validation engine.

Checks whether a flow is still valid given the current state of its referenced
rules and trigger locations.  A flow becomes broken if:

  1. Any rule node (or branch node condition) references a rule that is itself
     broken or has been deleted.
  2. A redirect action uses target="google_business_url" and one or more of the
     flow's trigger locations have no google_business_url configured.
  3. An email action uses target="location_notification_groups" and one or more
     of the flow's trigger locations have no notification groups assigned.

Used:
  - after a new survey version is saved  (batch revalidation)
  - after a location is patched          (google_business_url may have changed)
  - after location notification groups are synced (groups may have been removed)
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified

from ..models.postgres_model import (
    Flow as FlowORM,
    FlowLocationSurvey as FlowLocationSurveyORM,
    FlowNode as FlowNodeORM,
    Location as LocationORM,
    LocationNotificationGroup as LocationNotificationGroupORM,
    LocationSurvey as LocationSurveyORM,
    Rule as RuleORM,
)

logger = logging.getLogger(__name__)

# Mirror the enum values from pydantic_model.py without importing the whole module.
_REDIRECT_ACTION = "redirect"
_EMAIL_ACTION = "email"
_RULE_NODE = "rule"
_BRANCH_NODE = "branch"
_GOOGLE_BUSINESS_URL_TARGET = "google_business_url"
_LOCATION_NOTIFICATION_GROUPS_TARGET = "location_notification_groups"


# ── Helpers ──────────────────────────────────────────────────────────────────

def _collect_rule_refs(nodes: list[FlowNodeORM]) -> list[tuple[uuid.UUID, uuid.UUID | None]]:
    """Return [(rule_id, node_id)] for every rule reference in the flow.

    Covers:
      - rule nodes (node.rule_id)
      - branch nodes (config.rule_conditions[*].rule_id and legacy config.rule_ids)
    """
    refs: list[tuple[uuid.UUID, uuid.UUID | None]] = []
    for node in nodes:
        if node.node_type == _RULE_NODE and node.rule_id is not None:
            refs.append((node.rule_id, node.id))

        if node.node_type == _BRANCH_NODE:
            cfg: dict = node.action_config or {}
            raw_conditions = cfg.get("rule_conditions")
            if isinstance(raw_conditions, list):
                for rc in raw_conditions:
                    if not isinstance(rc, dict) or rc.get("rule_id") is None:
                        continue
                    try:
                        refs.append((uuid.UUID(str(rc["rule_id"])), node.id))
                    except (TypeError, ValueError):
                        pass
            for raw_id in cfg.get("rule_ids", []):
                try:
                    refs.append((uuid.UUID(str(raw_id)), node.id))
                except (TypeError, ValueError):
                    pass
    return refs


def _collect_redirect_nodes(nodes: list[FlowNodeORM]) -> list[FlowNodeORM]:
    """Return action nodes that redirect to the location's google_business_url."""
    result = []
    for node in nodes:
        if node.action_type != _REDIRECT_ACTION:
            continue
        cfg: dict = node.action_config or {}
        target = cfg.get("target", _GOOGLE_BUSINESS_URL_TARGET)
        if target == _GOOGLE_BUSINESS_URL_TARGET:
            result.append(node)
    return result


def _collect_location_ng_email_nodes(nodes: list[FlowNodeORM]) -> list[FlowNodeORM]:
    """Return email action nodes that use the location's notification groups."""
    return [
        node
        for node in nodes
        if node.action_type == _EMAIL_ACTION
        and (node.action_config or {}).get("target") == _LOCATION_NOTIFICATION_GROUPS_TARGET
    ]


# ── Core validation ───────────────────────────────────────────────────────────

def validate_flow(flow_id: uuid.UUID, db: Session) -> tuple[str, list[dict]]:
    """
    Validate a flow against the current state of its rules and trigger locations.

    Returns:
        (status, broken_reasons)
        status         — 'active' | 'broken'
        broken_reasons — list[dict], empty when status == 'active'
    """
    flow = (
        db.query(FlowORM)
        .options(
            joinedload(FlowORM.nodes),
            joinedload(FlowORM.location_surveys),
        )
        .filter(FlowORM.id == flow_id, FlowORM.deleted_at.is_(None))
        .populate_existing()
        .first()
    )
    if not flow:
        return "broken", [
            {
                "type": "FLOW_NOT_FOUND",
                "message": "Flow no longer exists",
            }
        ]

    broken_reasons: list[dict] = []
    nodes = flow.nodes or []

    # ── 1. Rule references ────────────────────────────────────────────────────
    rule_refs = _collect_rule_refs(nodes)
    if rule_refs:
        unique_rule_ids = {ref[0] for ref in rule_refs}
        rule_rows = (
            db.query(RuleORM)
            .filter(
                RuleORM.id.in_(unique_rule_ids),
                RuleORM.deleted_at.is_(None),
            )
            .all()
        )
        rule_map: dict[uuid.UUID, RuleORM] = {row.id: row for row in rule_rows}

        seen_rule_broken: set[uuid.UUID] = set()
        seen_rule_missing: set[uuid.UUID] = set()

        for rule_id, node_id in rule_refs:
            rule = rule_map.get(rule_id)
            if rule is None:
                if rule_id not in seen_rule_missing:
                    seen_rule_missing.add(rule_id)
                    broken_reasons.append(
                        {
                            "type": "RULE_MISSING",
                            "node_id": str(node_id) if node_id else None,
                            "rule_id": str(rule_id),
                            "message": "A referenced rule no longer exists",
                        }
                    )
            elif getattr(rule, "status", "active") == "broken":
                if rule_id not in seen_rule_broken:
                    seen_rule_broken.add(rule_id)
                    broken_reasons.append(
                        {
                            "type": "RULE_BROKEN",
                            "node_id": str(node_id) if node_id else None,
                            "rule_id": str(rule_id),
                            "message": f"Rule '{rule.name}' is broken and cannot run",
                        }
                    )

    # ── 2. Location-dependent action checks ───────────────────────────────────
    redirect_nodes = _collect_redirect_nodes(nodes)
    ng_email_nodes = _collect_location_ng_email_nodes(nodes)

    if redirect_nodes or ng_email_nodes:
        location_survey_ids = [link.location_survey_id for link in flow.location_surveys]

        if location_survey_ids:
            rows = (
                db.query(LocationSurveyORM, LocationORM)
                .join(LocationORM, LocationORM.id == LocationSurveyORM.location_id)
                .filter(
                    LocationSurveyORM.id.in_(location_survey_ids),
                    LocationSurveyORM.deleted_at.is_(None),
                    LocationORM.deleted_at.is_(None),
                )
                .all()
            )
            location_survey_map: dict[uuid.UUID, tuple[LocationSurveyORM, LocationORM]] = {
                ls.id: (ls, loc) for ls, loc in rows
            }

            # ── 2a. Redirect → google_business_url ────────────────────────────
            if redirect_nodes:
                for ls_id in location_survey_ids:
                    pair = location_survey_map.get(ls_id)
                    if pair is None:
                        continue
                    _, loc = pair
                    if not (loc.google_business_url or "").strip():
                        broken_reasons.append(
                            {
                                "type": "MISSING_GOOGLE_BUSINESS_URL",
                                "location_survey_id": str(ls_id),
                                "location_id": str(loc.id),
                                "message": f"Location '{loc.name}' has no Google Business URL configured",
                            }
                        )

            # ── 2b. Email → location_notification_groups ──────────────────────
            if ng_email_nodes:
                # Load which locations have at least one notification group.
                location_ids = [loc.id for _, (_, loc) in location_survey_map.items()]
                if location_ids:
                    ng_rows = (
                        db.query(LocationNotificationGroupORM.location_id)
                        .filter(LocationNotificationGroupORM.location_id.in_(location_ids))
                        .distinct()
                        .all()
                    )
                    locations_with_ng: set[uuid.UUID] = {row[0] for row in ng_rows}

                    for ls_id in location_survey_ids:
                        pair = location_survey_map.get(ls_id)
                        if pair is None:
                            continue
                        _, loc = pair
                        if loc.id not in locations_with_ng:
                            broken_reasons.append(
                                {
                                    "type": "MISSING_NOTIFICATION_GROUPS",
                                    "location_survey_id": str(ls_id),
                                    "location_id": str(loc.id),
                                    "message": f"Location '{loc.name}' has no notification groups configured",
                                }
                            )

    status = "broken" if broken_reasons else "active"
    return status, broken_reasons


# ── Batch revalidation ────────────────────────────────────────────────────────

def revalidate_flows_for_survey(db: Session, survey_id: uuid.UUID) -> None:
    """
    Revalidate every non-deleted flow for a survey.

    - Runs synchronously inside the caller's transaction.
    - One flow failing must not stop others (fail-safe per flow).
    - Does NOT commit — caller is responsible.
    """
    flows = (
        db.query(FlowORM)
        .filter(FlowORM.survey_id == survey_id, FlowORM.deleted_at.is_(None))
        .all()
    )
    for flow in flows:
        try:
            status, broken_reasons = validate_flow(flow.id, db)
        except Exception:
            logger.exception("Unexpected error validating flow %s", flow.id)
            status = "broken"
            broken_reasons = [
                {
                    "type": "VALIDATION_ERROR",
                    "message": "Flow validation failed unexpectedly",
                }
            ]
        flow.status = status
        flow.broken_reasons = broken_reasons
        flag_modified(flow, "broken_reasons")


def revalidate_flows_for_location(db: Session, location_id: uuid.UUID) -> None:
    """
    Revalidate every non-deleted flow whose trigger locations include the given
    location (via FlowLocationSurvey → LocationSurvey → Location).

    - Does NOT commit — caller is responsible.
    """
    # Find all location_survey IDs for this location.
    ls_ids_rows = (
        db.query(LocationSurveyORM.id)
        .filter(
            LocationSurveyORM.location_id == location_id,
            LocationSurveyORM.deleted_at.is_(None),
        )
        .all()
    )
    ls_ids = [row[0] for row in ls_ids_rows]
    if not ls_ids:
        return

    # Find unique flow IDs linked to those location surveys.
    flow_id_rows = (
        db.query(FlowLocationSurveyORM.flow_id)
        .filter(FlowLocationSurveyORM.location_survey_id.in_(ls_ids))
        .distinct()
        .all()
    )
    flow_ids = [row[0] for row in flow_id_rows]
    if not flow_ids:
        return

    flows = (
        db.query(FlowORM)
        .filter(FlowORM.id.in_(flow_ids), FlowORM.deleted_at.is_(None))
        .all()
    )
    for flow in flows:
        try:
            status, broken_reasons = validate_flow(flow.id, db)
        except Exception:
            logger.exception("Unexpected error validating flow %s", flow.id)
            status = "broken"
            broken_reasons = [
                {
                    "type": "VALIDATION_ERROR",
                    "message": "Flow validation failed unexpectedly",
                }
            ]
        flow.status = status
        flow.broken_reasons = broken_reasons
        flag_modified(flow, "broken_reasons")
