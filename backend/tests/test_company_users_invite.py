"""Tests for company user invite duplicate detection."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.core.errors import ConflictError
from app.models.postgres_model import Membership as MembershipORM
from app.models.postgres_model import User as UserORM
from app.routes.company_users import invite_company_user
from app.schemas.pydantic_model import InviteUserRequest


def _db_mock_existing_member():
    """Session where invite email matches an active user with active same-company membership."""
    existing_user = MagicMock()
    existing_user.id = uuid.uuid4()
    existing_membership = MagicMock()

    def query(model):
        q = MagicMock()
        if model is UserORM:
            q.filter.return_value.first.return_value = existing_user
        elif model is MembershipORM:
            q.filter.return_value.first.return_value = existing_membership
        else:
            q.filter.return_value.first.return_value = None
        return q

    db = MagicMock()
    db.query.side_effect = query
    return db


@patch("app.routes.company_users.invite_user_by_email")
@patch("app.routes.company_users.assert_can_invite_user")
@patch("app.routes.company_users.check_user_rate_limit")
@patch("app.routes.company_users.get_company_from_membership")
def test_invite_blocks_when_already_member_same_company(
    mock_get_company,
    mock_rate_limit,
    mock_assert_can_invite,
    mock_invite_supabase,
):
    company_id = uuid.uuid4()
    company = MagicMock()
    company.id = company_id
    mock_get_company.return_value = company

    inviter = MagicMock()
    inviter.user_id = uuid.uuid4()
    inviter.company_id = company_id
    inviter.role = "company_owner"

    db = _db_mock_existing_member()

    payload = InviteUserRequest(
        email="member@example.com",
        first_name="Test",
        last_name="User",
        role="viewer",
    )

    with pytest.raises(ConflictError) as exc:
        invite_company_user(
            payload=payload,
            request=MagicMock(),
            membership=inviter,
            db=db,
        )

    assert exc.value.code == "ALREADY_MEMBER"
    assert "already a member" in exc.value.message.lower()
    mock_invite_supabase.assert_not_called()
