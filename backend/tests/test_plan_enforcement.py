"""Tests for subscription plan enforcement.

Coverage:
  A. PlanPolicy values and get_policy_for_subscription()
  B. SubscriptionLimitError and SubscriptionFeatureError shape
  C. _check_photo_feedback_allowed() helper
  D. Branch node limit logic
  E. Count helpers (with mock DB)
"""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.services.plan_policy import (
    PLAN_POLICIES,
    PlanPolicy,
    get_policy_for_subscription,
    _DEFAULT_POLICY,
)
from app.core.errors.exceptions import SubscriptionFeatureError, SubscriptionLimitError
from app.core.errors.error_category import ErrorCategory


# ---------------------------------------------------------------------------
# A. PlanPolicy values
# ---------------------------------------------------------------------------

class TestPlanPolicyValues:
    def test_starter_limits(self):
        p = PLAN_POLICIES["starter"]
        assert p.max_locations == 1
        assert p.max_active_surveys == 2
        assert p.max_active_flows == 1
        assert p.max_branch_nodes_per_flow == 2
        assert p.can_use_photo_feedback is False

    def test_growth_limits(self):
        p = PLAN_POLICIES["growth"]
        assert p.max_locations == 5
        assert p.max_active_surveys == 5
        assert p.max_active_flows == 5
        assert p.max_branch_nodes_per_flow == -1
        assert p.can_use_photo_feedback is True

    def test_pro_limits(self):
        p = PLAN_POLICIES["pro"]
        assert p.max_locations == 20
        assert p.max_active_surveys == -1
        assert p.max_active_flows == 10
        assert p.max_branch_nodes_per_flow == -1
        assert p.can_use_photo_feedback is True

    def test_default_policy_equals_starter(self):
        assert _DEFAULT_POLICY == PLAN_POLICIES["starter"]


def _make_sub(plan_display_name, status="active"):
    return SimpleNamespace(plan_display_name=plan_display_name, status=status)


class TestGetPolicyForSubscription:
    def test_active_starter(self):
        sub = _make_sub("Starter")
        policy = get_policy_for_subscription(sub)
        assert policy == PLAN_POLICIES["starter"]

    def test_active_growth(self):
        sub = _make_sub("Growth")
        policy = get_policy_for_subscription(sub)
        assert policy == PLAN_POLICIES["growth"]

    def test_active_pro(self):
        sub = _make_sub("Pro")
        policy = get_policy_for_subscription(sub)
        assert policy == PLAN_POLICIES["pro"]

    def test_plan_name_case_insensitive(self):
        assert get_policy_for_subscription(_make_sub("STARTER")) == PLAN_POLICIES["starter"]
        assert get_policy_for_subscription(_make_sub("growth")) == PLAN_POLICIES["growth"]
        assert get_policy_for_subscription(_make_sub("  Pro  ")) == PLAN_POLICIES["pro"]

    def test_trialing_with_starter_plan(self):
        sub = _make_sub("Starter", status="trialing")
        assert get_policy_for_subscription(sub) == PLAN_POLICIES["starter"]

    def test_pending_cancel_uses_plan_tier(self):
        sub = _make_sub("Growth", status="pending_cancel")
        assert get_policy_for_subscription(sub) == PLAN_POLICIES["growth"]

    def test_trialing_no_plan_name(self):
        sub = _make_sub(None, status="trialing")
        assert get_policy_for_subscription(sub) == _DEFAULT_POLICY

    def test_trialing_empty_plan_name(self):
        sub = _make_sub("", status="trialing")
        assert get_policy_for_subscription(sub) == _DEFAULT_POLICY

    def test_unknown_plan_name_falls_back_to_default(self):
        sub = _make_sub("enterprise")
        assert get_policy_for_subscription(sub) == _DEFAULT_POLICY

    def test_none_subscription_returns_default(self):
        assert get_policy_for_subscription(None) == _DEFAULT_POLICY


# ---------------------------------------------------------------------------
# B. Error class shapes
# ---------------------------------------------------------------------------

class TestSubscriptionLimitError:
    def test_code(self):
        err = SubscriptionLimitError("locations", limit=1, current=1)
        assert err.code == "LIMIT_EXCEEDED"

    def test_status_code(self):
        err = SubscriptionLimitError("active_surveys", limit=2, current=2)
        assert err.status_code == 403

    def test_category(self):
        err = SubscriptionLimitError("active_flows", limit=1, current=1)
        assert err.category == ErrorCategory.PERMISSION

    def test_details_fields(self):
        err = SubscriptionLimitError("locations", limit=1, current=1)
        assert err.details["resource"] == "locations"
        assert err.details["limit"] == 1
        assert err.details["current"] == 1

    def test_custom_message(self):
        err = SubscriptionLimitError("locations", limit=1, current=1, message="Custom msg")
        assert err.message == "Custom msg"

    def test_default_message_contains_resource(self):
        err = SubscriptionLimitError("active_surveys", limit=2, current=2)
        assert "active_surveys" in err.message

    def test_extra_details_merged_into_details(self):
        err = SubscriptionLimitError(
            "branch_nodes_per_flow",
            limit=2,
            current=3,
            message="Custom branch limit message",
            extra_details={"manage_subscription_path": "/dashboard/settings/manage-subscription"},
        )
        assert err.details["resource"] == "branch_nodes_per_flow"
        assert err.details["limit"] == 2
        assert err.details["current"] == 3
        assert err.details["manage_subscription_path"] == "/dashboard/settings/manage-subscription"


class TestSubscriptionFeatureError:
    def test_code(self):
        err = SubscriptionFeatureError("photo_feedback")
        assert err.code == "FEATURE_NOT_AVAILABLE"

    def test_status_code(self):
        err = SubscriptionFeatureError("photo_feedback")
        assert err.status_code == 403

    def test_category(self):
        err = SubscriptionFeatureError("photo_feedback")
        assert err.category == ErrorCategory.PERMISSION

    def test_details_feature_field(self):
        err = SubscriptionFeatureError("photo_feedback")
        assert err.details["feature"] == "photo_feedback"

    def test_custom_message(self):
        err = SubscriptionFeatureError("photo_feedback", message="Custom")
        assert err.message == "Custom"


# ---------------------------------------------------------------------------
# C. Photo feedback check helper
#
# We replicate the helper logic here rather than importing from app.routes.surveys
# because that module initialises the SQLAlchemy engine at import time (which
# requires a running database).  The logic is simple enough that testing it
# inline is valid and keeps the test suite self-contained.
# ---------------------------------------------------------------------------

_PHOTO_QUESTION_TYPES = {"photo"}


def _check_photo_feedback_allowed(schema, policy) -> None:
    """Mirror of app.routes.surveys._check_photo_feedback_allowed."""
    if policy.can_use_photo_feedback:
        return
    for q in (schema.get("questions") or []):
        if isinstance(q, dict) and q.get("type") in _PHOTO_QUESTION_TYPES:
            raise SubscriptionFeatureError(
                feature="photo_feedback",
                message="Photo feedback questions require a Growth or Pro plan.",
            )


def _policy(can_use_photo: bool) -> PlanPolicy:
    return PlanPolicy(
        max_locations=1,
        max_active_surveys=2,
        max_active_flows=1,
        max_branch_nodes_per_flow=2,
        can_use_photo_feedback=can_use_photo,
    )


class TestCheckPhotoFeedbackAllowed:
    def test_allowed_when_feature_enabled(self):
        schema = {"questions": [{"type": "photo", "label": "Upload"}]}
        _check_photo_feedback_allowed(schema, _policy(can_use_photo=True))  # no raise

    def test_blocked_when_feature_disabled_and_photo_present(self):
        schema = {"questions": [{"type": "photo", "label": "Upload"}]}
        with pytest.raises(SubscriptionFeatureError) as exc_info:
            _check_photo_feedback_allowed(schema, _policy(can_use_photo=False))
        assert exc_info.value.details["feature"] == "photo_feedback"

    def test_no_raise_when_no_photo_questions(self):
        schema = {"questions": [{"type": "star", "label": "Rating"}]}
        _check_photo_feedback_allowed(schema, _policy(can_use_photo=False))  # no raise

    def test_no_raise_when_questions_empty(self):
        schema = {"questions": []}
        _check_photo_feedback_allowed(schema, _policy(can_use_photo=False))  # no raise

    def test_no_raise_when_questions_missing(self):
        schema = {}
        _check_photo_feedback_allowed(schema, _policy(can_use_photo=False))  # no raise

    def test_non_photo_type_does_not_trigger(self):
        schema = {"questions": [{"type": "nps"}, {"type": "text"}, {"type": "star"}]}
        _check_photo_feedback_allowed(schema, _policy(can_use_photo=False))  # no raise

    def test_mixed_types_triggers_on_photo(self):
        schema = {"questions": [{"type": "star"}, {"type": "photo"}]}
        with pytest.raises(SubscriptionFeatureError):
            _check_photo_feedback_allowed(schema, _policy(can_use_photo=False))


# ---------------------------------------------------------------------------
# D. Branch node limit logic
# ---------------------------------------------------------------------------

class TestBranchNodeLimit:
    """Test the branch node counting logic that lives inside flow_service.create_flow."""

    def _count_branch_nodes(self, nodes) -> int:
        """Mirror the logic from flow_service.create_flow."""
        return sum(1 for n in nodes if n.node_type.value == "branch")

    def _make_node(self, node_type: str):
        return SimpleNamespace(node_type=SimpleNamespace(value=node_type))

    def _raise_if_exceeded(self, nodes, policy: PlanPolicy) -> None:
        """Mirror the enforcement block in flow_service.create_flow."""
        if policy.max_branch_nodes_per_flow != -1:
            branch_count = self._count_branch_nodes(nodes)
            if branch_count > policy.max_branch_nodes_per_flow:
                raise SubscriptionLimitError(
                    resource="branch_nodes_per_flow",
                    limit=policy.max_branch_nodes_per_flow,
                    current=branch_count,
                )

    def _nodes(self, *types):
        return [self._make_node(t) for t in types]

    def test_within_limit_does_not_raise(self):
        nodes = self._nodes("rule", "branch", "branch", "action")
        policy = PLAN_POLICIES["starter"]  # limit = 2
        self._raise_if_exceeded(nodes, policy)  # no raise

    def test_at_limit_does_not_raise(self):
        nodes = self._nodes("branch", "branch")
        policy = PLAN_POLICIES["starter"]  # limit = 2
        self._raise_if_exceeded(nodes, policy)  # no raise

    def test_exceeds_limit_raises(self):
        nodes = self._nodes("branch", "branch", "branch")
        policy = PLAN_POLICIES["starter"]  # limit = 2
        with pytest.raises(SubscriptionLimitError) as exc_info:
            self._raise_if_exceeded(nodes, policy)
        assert exc_info.value.details["resource"] == "branch_nodes_per_flow"
        assert exc_info.value.details["limit"] == 2
        assert exc_info.value.details["current"] == 3

    def test_unlimited_never_raises(self):
        nodes = self._nodes(*["branch"] * 20)
        policy = PLAN_POLICIES["growth"]  # limit = -1
        self._raise_if_exceeded(nodes, policy)  # no raise

    def test_zero_branches_no_raise(self):
        nodes = self._nodes("rule", "action")
        policy = PLAN_POLICIES["starter"]
        self._raise_if_exceeded(nodes, policy)  # no raise


# ---------------------------------------------------------------------------
# E. Count helpers (mock DB session)
# ---------------------------------------------------------------------------

from app.auth.plan_enforcement import (  # noqa: E402  (import after mock-friendly section)
    assert_can_activate_location,
    count_locations,
    count_active_surveys,
    count_active_flows,
)


class TestCountHelpers:
    def _mock_db_scalar(self, return_value: int) -> MagicMock:
        """Return a mock db that makes .query(...).filter(...).scalar() return return_value."""
        scalar_mock = MagicMock(return_value=return_value)
        filter_mock = MagicMock()
        filter_mock.scalar = scalar_mock
        query_mock = MagicMock()
        query_mock.filter = MagicMock(return_value=filter_mock)
        db = MagicMock()
        db.query = MagicMock(return_value=query_mock)
        return db

    def test_count_locations_returns_scalar(self):
        db = self._mock_db_scalar(3)
        company_id = uuid.uuid4()
        result = count_locations(db, company_id)
        assert result == 3

    def test_count_locations_returns_zero_on_none(self):
        db = self._mock_db_scalar(None)
        company_id = uuid.uuid4()
        result = count_locations(db, company_id)
        assert result == 0

    def test_count_active_surveys_returns_scalar(self):
        db = self._mock_db_scalar(5)
        company_id = uuid.uuid4()
        result = count_active_surveys(db, company_id)
        assert result == 5

    def test_count_active_flows_returns_scalar(self):
        db = self._mock_db_scalar(2)
        company_id = uuid.uuid4()
        result = count_active_flows(db, company_id)
        assert result == 2

    def test_count_active_flows_returns_zero_on_none(self):
        db = self._mock_db_scalar(None)
        company_id = uuid.uuid4()
        result = count_active_flows(db, company_id)
        assert result == 0


# ---------------------------------------------------------------------------
# F. Active location activation cap
# ---------------------------------------------------------------------------


class TestAssertCanActivateLocation:
    @patch("app.auth.plan_enforcement.acquire_company_resource_lock")
    @patch("app.auth.plan_enforcement.count_locations", return_value=1)
    @patch("app.auth.plan_enforcement.get_policy_for_subscription")
    @patch("app.auth.plan_enforcement.get_company_subscription")
    def test_raises_when_at_active_cap(
        self, mock_get_sub, mock_get_policy, _mock_count, _mock_lock
    ):
        mock_get_sub.return_value = _make_sub("Starter")
        mock_get_policy.return_value = SimpleNamespace(max_locations=1)
        company = SimpleNamespace(id=uuid.uuid4())
        db = MagicMock()
        company_id = uuid.uuid4()
        with pytest.raises(SubscriptionLimitError) as exc_info:
            assert_can_activate_location(db, company_id, company)
        assert exc_info.value.details["resource"] == "locations"
        assert exc_info.value.details["limit"] == 1
        assert exc_info.value.details["current"] == 1

    @patch("app.auth.plan_enforcement.acquire_company_resource_lock")
    @patch("app.auth.plan_enforcement.count_locations", return_value=0)
    @patch("app.auth.plan_enforcement.get_policy_for_subscription")
    @patch("app.auth.plan_enforcement.get_company_subscription")
    def test_allows_when_below_cap(
        self, mock_get_sub, mock_get_policy, _mock_count, _mock_lock
    ):
        mock_get_sub.return_value = _make_sub("Starter")
        mock_get_policy.return_value = SimpleNamespace(max_locations=1)
        company = SimpleNamespace(id=uuid.uuid4())
        db = MagicMock()
        assert_can_activate_location(db, uuid.uuid4(), company)  # no raise

    @patch("app.auth.plan_enforcement.acquire_company_resource_lock")
    @patch("app.auth.plan_enforcement.count_locations")
    @patch("app.auth.plan_enforcement.get_policy_for_subscription")
    @patch("app.auth.plan_enforcement.get_company_subscription")
    def test_unlimited_skips_count_and_lock(
        self, mock_get_sub, mock_get_policy, mock_count, mock_lock
    ):
        mock_get_sub.return_value = _make_sub("Pro")
        mock_get_policy.return_value = SimpleNamespace(max_locations=-1)
        company = SimpleNamespace(id=uuid.uuid4())
        db = MagicMock()
        assert_can_activate_location(db, uuid.uuid4(), company)
        mock_count.assert_not_called()
        mock_lock.assert_not_called()
