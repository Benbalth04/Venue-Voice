from __future__ import annotations

import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, joinedload

from ..core.datetime_user_tz import to_iso8601_zoned
from ..core.errors.exceptions import ConflictError, NotFoundError, StaleObjectError, ValidationError
from ..models.postgres_model import (
    FlowNode as FlowNodeORM,
    Location as LocationORM,
    LocationNotificationGroup as LocationNotificationGroupORM,
    NotificationGroup as NotificationGroupORM,
    NotificationGroupMember as NotificationGroupMemberORM,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _strip_tz(dt: datetime) -> datetime:
    """Normalize a datetime for comparison with a naive TIMESTAMP column."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _get_notification_group_or_404(
    db: Session,
    company_id: uuid.UUID,
    group_id: uuid.UUID,
) -> NotificationGroupORM:
    group = (
        db.query(NotificationGroupORM)
        .options(joinedload(NotificationGroupORM.members), joinedload(NotificationGroupORM.location_links))
        .filter(
            NotificationGroupORM.id == group_id,
            NotificationGroupORM.company_id == company_id,
            NotificationGroupORM.deleted_at.is_(None),
        )
        .first()
    )
    if not group:
        raise NotFoundError(
            code="NOTIFICATION_GROUP_NOT_FOUND",
            message="Notification group not found",
        )
    return group


def _to_response(group: NotificationGroupORM, user_tz: ZoneInfo) -> dict:
    return {
        "id": group.id,
        "company_id": group.company_id,
        "name": group.name,
        "created_at": to_iso8601_zoned(group.created_at, user_tz) or "",
        "updated_at": to_iso8601_zoned(group.updated_at, user_tz) or "",
        "members": [
            {
                "id": member.id,
                "name": member.name,
                "email": member.email,
                "created_at": to_iso8601_zoned(member.created_at, user_tz) or "",
            }
            for member in group.members
            if member.deleted_at is None
        ],
        "location_ids": [link.location_id for link in group.location_links],
    }


def _ensure_unique_notification_group_name(
    db: Session,
    company_id: uuid.UUID,
    name: str,
    *,
    exclude_group_id: uuid.UUID | None = None,
) -> None:
    normalized_name = name.strip().casefold()
    existing_rows = (
        db.query(NotificationGroupORM)
        .filter(
            NotificationGroupORM.company_id == company_id,
            NotificationGroupORM.deleted_at.is_(None),
        )
        .all()
    )
    for row in existing_rows:
        if exclude_group_id is not None and row.id == exclude_group_id:
            continue
        if row.name.strip().casefold() == normalized_name:
            raise ConflictError(
                code="NOTIFICATION_GROUP_NAME_CONFLICT",
                message="Notification group name must be unique within your company",
            )


def list_notification_groups(db: Session, company_id: uuid.UUID, user_tz: ZoneInfo) -> list[dict]:
    rows = (
        db.query(NotificationGroupORM)
        .options(joinedload(NotificationGroupORM.members), joinedload(NotificationGroupORM.location_links))
        .filter(
            NotificationGroupORM.company_id == company_id,
            NotificationGroupORM.deleted_at.is_(None),
        )
        .order_by(NotificationGroupORM.created_at.desc(), NotificationGroupORM.id.desc())
        .all()
    )
    return [_to_response(row, user_tz) for row in rows]


def create_notification_group(
    db: Session, company_id: uuid.UUID, name: str, user_tz: ZoneInfo
) -> dict:
    _ensure_unique_notification_group_name(db, company_id, name)
    group = NotificationGroupORM(
        company_id=company_id,
        name=name.strip(),
    )
    db.add(group)
    db.commit()
    return _to_response(_get_notification_group_or_404(db, company_id, group.id), user_tz)


def update_notification_group(
    db: Session,
    company_id: uuid.UUID,
    group_id: uuid.UUID,
    *,
    name: str,
    members: list[dict[str, str]],
    updated_at,
    user_tz: ZoneInfo,
) -> dict:
    group = _get_notification_group_or_404(db, company_id, group_id)
    normalized_name = name.strip()
    if not normalized_name:
        raise ValidationError(
            code="NOTIFICATION_GROUP_NAME_REQUIRED",
            message="Notification group name is required",
            status_code=422,
        )
    _ensure_unique_notification_group_name(
        db,
        company_id,
        normalized_name,
        exclude_group_id=group.id,
    )

    normalized_emails = [member["email"].strip().lower() for member in members]
    if not members:
        raise ValidationError(
            code="NOTIFICATION_GROUP_MEMBERS_REQUIRED",
            message="Notification group must have at least one member",
            status_code=422,
        )
    if len(set(normalized_emails)) != len(normalized_emails):
        raise ValidationError(
            code="NOTIFICATION_GROUP_MEMBER_DUPLICATE",
            message="Notification group member emails must be unique",
            status_code=422,
        )

    rowcount = (
        db.query(NotificationGroupORM)
        .filter(
            NotificationGroupORM.id == group.id,
            NotificationGroupORM.updated_at == _strip_tz(updated_at),
        )
        .update({"name": normalized_name, "updated_at": _now()}, synchronize_session="fetch")
    )
    if rowcount == 0:
        raise StaleObjectError("NotificationGroup", str(group.id))

    db.refresh(group)
    deleted_at = _now()
    for member in group.members:
        if member.deleted_at is None:
            member.deleted_at = deleted_at

    for member in members:
        db.add(
            NotificationGroupMemberORM(
                group_id=group.id,
                name=member["name"].strip(),
                email=member["email"].strip().lower(),
            )
        )

    db.commit()
    return _to_response(_get_notification_group_or_404(db, company_id, group.id), user_tz)


def add_notification_group_member(
    db: Session,
    company_id: uuid.UUID,
    group_id: uuid.UUID,
    *,
    name: str,
    email: str,
    user_tz: ZoneInfo,
) -> dict:
    group = _get_notification_group_or_404(db, company_id, group_id)
    member = NotificationGroupMemberORM(
        group_id=group.id,
        name=name.strip(),
        email=email.strip().lower(),
    )
    db.add(member)
    db.commit()
    return _to_response(_get_notification_group_or_404(db, company_id, group.id), user_tz)


def assign_notification_group_to_location(
    db: Session,
    company_id: uuid.UUID,
    location_id: uuid.UUID,
    group_id: uuid.UUID,
    user_tz: ZoneInfo,
) -> dict:
    location = (
        db.query(LocationORM)
        .filter(
            LocationORM.id == location_id,
            LocationORM.company_id == company_id,
            LocationORM.deleted_at.is_(None),
            LocationORM.archived_at.is_(None),
        )
        .first()
    )
    if not location:
        raise NotFoundError(code="LOCATION_NOT_FOUND", message="Location not found")

    group = _get_notification_group_or_404(db, company_id, group_id)
    exists = (
        db.query(LocationNotificationGroupORM)
        .filter(
            LocationNotificationGroupORM.location_id == location.id,
            LocationNotificationGroupORM.group_id == group.id,
        )
        .first()
    )
    if not exists:
        db.add(
            LocationNotificationGroupORM(
                location_id=location.id,
                group_id=group.id,
            )
        )
        db.commit()
    return _to_response(_get_notification_group_or_404(db, company_id, group.id), user_tz)


def sync_location_notification_groups(
    db: Session,
    company_id: uuid.UUID,
    location_id: uuid.UUID,
    group_ids: list[uuid.UUID],
    user_tz: ZoneInfo,
    location_updated_at: datetime,
) -> list[dict]:
    location = (
        db.query(LocationORM)
        .filter(
            LocationORM.id == location_id,
            LocationORM.company_id == company_id,
            LocationORM.deleted_at.is_(None),
            LocationORM.archived_at.is_(None),
        )
        .first()
    )
    if not location:
        raise NotFoundError(code="LOCATION_NOT_FOUND", message="Location not found")

    rowcount = (
        db.query(LocationORM)
        .filter(
            LocationORM.id == location_id,
            LocationORM.updated_at == _strip_tz(location_updated_at),
        )
        .update({"updated_at": _now()}, synchronize_session="fetch")
    )
    if rowcount == 0:
        raise StaleObjectError("Location", str(location_id))

    unique_group_ids = list(dict.fromkeys(group_ids))
    if unique_group_ids:
        rows = (
            db.query(NotificationGroupORM.id)
            .filter(
                NotificationGroupORM.id.in_(unique_group_ids),
                NotificationGroupORM.company_id == company_id,
                NotificationGroupORM.deleted_at.is_(None),
            )
            .all()
        )
        found = {row[0] for row in rows}
        missing = [group_id for group_id in unique_group_ids if group_id not in found]
        if missing:
            raise NotFoundError(
                code="NOTIFICATION_GROUP_NOT_FOUND",
                message="One or more notification groups were not found",
                details={"group_ids": [str(group_id) for group_id in missing]},
            )

    existing_links = (
        db.query(LocationNotificationGroupORM)
        .filter(LocationNotificationGroupORM.location_id == location_id)
        .all()
    )
    existing_group_ids = {link.group_id for link in existing_links}
    next_group_ids = set(unique_group_ids)

    for link in existing_links:
        if link.group_id not in next_group_ids:
            db.delete(link)

    for group_id in unique_group_ids:
        if group_id not in existing_group_ids:
            db.add(LocationNotificationGroupORM(location_id=location_id, group_id=group_id))

    db.commit()
    return list_notification_groups(db, company_id, user_tz)


def delete_notification_group(db: Session, company_id: uuid.UUID, group_id: uuid.UUID, updated_at) -> None:
    group = _get_notification_group_or_404(db, company_id, group_id)

    assigned_to_location = (
        db.query(LocationNotificationGroupORM)
        .filter(LocationNotificationGroupORM.group_id == group.id)
        .all()
    )

    if assigned_to_location:
        raise ConflictError(
            code="NOTIFICATION_GROUP_ASSIGNED_TO_LOCATION",
            message=f"Cannot delete a notification group that is assigned to a location. This notification group is currently assigned to {len(assigned_to_location)} location{('s' if len(assigned_to_location) > 1 else '')}.",
            details={"Assigned location_ids": [str(link.location_id) for link in assigned_to_location]},
        )

    in_flow = (
        db.query(FlowNodeORM.id)
        .filter(
            FlowNodeORM.action_type == "email",
            FlowNodeORM.action_config["notification_group_id"].astext == str(group.id),
        )
        .all()
    )

    if in_flow:
        raise ConflictError(
            code="NOTIFICATION_GROUP_IN_USE",
            message=f"Cannot delete a notification group that is used by a flow. This notification group is currently used by {len(in_flow)} flow node{('s' if len(in_flow) > 1 else '')}.",
            details={"Assigned flow_node_ids": [str(node_id) for node_id in in_flow]},
        )

    now = _now()
    rowcount = (
        db.query(NotificationGroupORM)
        .filter(
            NotificationGroupORM.id == group.id,
            NotificationGroupORM.updated_at == _strip_tz(updated_at),
        )
        .update({"deleted_at": now, "updated_at": now}, synchronize_session="fetch")
    )
    if rowcount == 0:
        raise StaleObjectError("NotificationGroup", str(group.id))

    db.refresh(group)
    for member in group.members:
        if member.deleted_at is None:
            member.deleted_at = now
    db.commit()
