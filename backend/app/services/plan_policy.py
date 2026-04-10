from __future__ import annotations

from pydantic import BaseModel


class PlanPolicy(BaseModel):
    max_locations: int            # -1 = unlimited
    max_active_surveys: int       # -1 = unlimited
    max_active_flows: int         # -1 = unlimited
    max_branch_nodes_per_flow: int  # -1 = unlimited
    max_company_members: int      # -1 = unlimited; 0 = owner only (no invites)
    can_use_photo_feedback: bool
    can_expand_charts: bool


PLAN_POLICIES: dict[str, PlanPolicy] = {
    "starter": PlanPolicy(
        max_locations=1,
        max_active_surveys=2,
        max_active_flows=1,
        max_branch_nodes_per_flow=2,
        max_company_members=0,
        can_use_photo_feedback=False,
        can_expand_charts=False,
    ),
    "growth": PlanPolicy(
        max_locations=5,
        max_active_surveys=5,
        max_active_flows=5,
        max_branch_nodes_per_flow=-1,
        max_company_members=5,
        can_use_photo_feedback=True,
        can_expand_charts=True,
    ),
    "pro": PlanPolicy(
        max_locations=20,
        max_active_surveys=-1,
        max_active_flows=10,
        max_branch_nodes_per_flow=-1,
        max_company_members=20,
        can_use_photo_feedback=True,
        can_expand_charts=True,
    ),
}

# Fallback applied when subscription is None, trialing with no plan, or unrecognised plan name.
# Equivalent to Starter limits so trial users experience the base tier.
_DEFAULT_POLICY = PLAN_POLICIES["starter"]


def get_policy_for_subscription(sub) -> PlanPolicy:
    """Translate a Subscription ORM row into a PlanPolicy.

    This is the single entry point that maps billing state to plan limits.
    Future migration to org-level billing requires changing only this function.

    Rules:
    - sub is None                 → Starter limits (fail-safe default)
    - trialing with no plan name  → Starter limits
    - recognised plan name        → matching PLAN_POLICIES entry
    - unrecognised plan name      → Starter limits (fail-safe)
    """
    if sub is None:
        return _DEFAULT_POLICY
    plan_key = (sub.plan_display_name or "").strip().lower()
    return PLAN_POLICIES.get(plan_key, _DEFAULT_POLICY)
