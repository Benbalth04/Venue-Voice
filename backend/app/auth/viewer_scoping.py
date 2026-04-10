"""Viewer permission scoping helpers.

These functions produce SQLAlchemy scalar subqueries that filter data to only
what a viewer is permitted to see. All filtering happens at the SQL query level
(not post-processing) to correctly handle pagination and counts.

Usage
-----
    from ..auth.viewer_scoping import survey_ids_subquery, apply_survey_filter

    survey_sq = survey_ids_subquery(membership, db)
    query = apply_survey_filter(query, survey_sq, SurveyORM.id)

For company_admin or viewers with all_surveys=True, the returned subquery is
None and no filter is applied. For viewers with specific access, the filter
restricts to allowed IDs.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from ..models.postgres_model import Membership, ViewerPermission


def survey_ids_subquery(membership: Membership, db: Session):
    """Return a scalar subquery of permitted survey UUIDs, or None (unrestricted)."""
    if membership.role in ("company_admin", "company_owner") or membership.all_surveys:
        return None
    return (
        db.query(ViewerPermission.survey_id)
        .filter(
            ViewerPermission.membership_id == membership.id,
            ViewerPermission.survey_id.isnot(None),
        )
        .scalar_subquery()
    )


def location_ids_subquery(membership: Membership, db: Session):
    """Return a scalar subquery of permitted location UUIDs, or None (unrestricted)."""
    if membership.role in ("company_admin", "company_owner") or membership.all_locations:
        return None
    return (
        db.query(ViewerPermission.location_id)
        .filter(
            ViewerPermission.membership_id == membership.id,
            ViewerPermission.location_id.isnot(None),
        )
        .scalar_subquery()
    )


def apply_survey_filter(query: Any, survey_sq: Any, survey_column: Any) -> Any:
    """Append a survey scope filter to a SQLAlchemy query if needed."""
    if survey_sq is not None:
        query = query.filter(survey_column.in_(survey_sq))
    return query


def apply_location_filter(query: Any, location_sq: Any, location_column: Any) -> Any:
    """Append a location scope filter to a SQLAlchemy query if needed."""
    if location_sq is not None:
        query = query.filter(location_column.in_(location_sq))
    return query


def assert_survey_access(membership: Membership, survey_id: uuid.UUID, db: Session) -> None:
    """Raise PermissionError if the viewer does not have access to survey_id."""
    from ..core.errors.exceptions import PermissionError

    if membership.role in ("company_admin", "company_owner") or membership.all_surveys:
        return
    exists = (
        db.query(ViewerPermission)
        .filter(
            ViewerPermission.membership_id == membership.id,
            ViewerPermission.survey_id == survey_id,
        )
        .first()
    )
    if not exists:
        raise PermissionError(
            code="SURVEY_ACCESS_DENIED",
            message="You do not have permission to access this survey.",
        )


def assert_location_access(membership: Membership, location_id: uuid.UUID, db: Session) -> None:
    """Raise PermissionError if the viewer does not have access to location_id."""
    from ..core.errors.exceptions import PermissionError

    if membership.role in ("company_admin", "company_owner") or membership.all_locations:
        return
    exists = (
        db.query(ViewerPermission)
        .filter(
            ViewerPermission.membership_id == membership.id,
            ViewerPermission.location_id == location_id,
        )
        .first()
    )
    if not exists:
        raise PermissionError(
            code="LOCATION_ACCESS_DENIED",
            message="You do not have permission to access this location.",
        )
