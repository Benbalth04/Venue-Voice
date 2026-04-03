import unittest
import uuid

from pydantic import ValidationError

from app.schemas.pydantic_model import CreateFlow


def node(*, node_id, parent_id, node_type, position, rule_id=None, branch_type=None, action_type=None, config=None):
    return {
        "id": node_id,
        "parent_id": parent_id,
        "node_type": node_type,
        "position": position,
        "rule_id": rule_id,
        "branch_type": branch_type,
        "action_type": action_type,
        "config": config,
    }


class FlowSchemaTests(unittest.TestCase):
    def test_accepts_branch_with_true_and_false_children(self) -> None:
        rule_uuid = uuid.uuid4()
        rule_node_id = uuid.uuid4()
        branch_id = uuid.uuid4()
        true_action_id = uuid.uuid4()
        false_action_id = uuid.uuid4()

        flow = CreateFlow(
            name="Branch flow",
            location_survey_ids=[uuid.uuid4()],
            nodes=[
                node(
                    node_id=rule_node_id,
                    parent_id=None,
                    node_type="rule",
                    position=0,
                    rule_id=str(rule_uuid),
                ),
                node(
                    node_id=branch_id,
                    parent_id=rule_node_id,
                    node_type="branch",
                    position=0,
                    config={"rule_ids": [str(rule_uuid)], "match_type": "all", "negate": False},
                ),
                node(
                    node_id=true_action_id,
                    parent_id=branch_id,
                    node_type="action",
                    position=0,
                    branch_type="TRUE",
                    action_type="redirect",
                    config={"target": "google_business_url"},
                ),
                node(
                    node_id=false_action_id,
                    parent_id=branch_id,
                    node_type="action",
                    position=1,
                    branch_type="FALSE",
                    action_type="email",
                    config={"target": "location_notification_groups"},
                ),
            ],
        )

        self.assertEqual(flow.nodes[1].node_type.value, "branch")

    def test_accepts_branch_with_rule_conditions_config(self) -> None:
        rule_uuid = uuid.uuid4()
        rule_node_id = uuid.uuid4()
        branch_id = uuid.uuid4()
        flow = CreateFlow(
            name="Branch flow",
            location_survey_ids=[uuid.uuid4()],
            nodes=[
                node(
                    node_id=rule_node_id,
                    parent_id=None,
                    node_type="rule",
                    position=0,
                    rule_id=str(rule_uuid),
                ),
                node(
                    node_id=branch_id,
                    parent_id=rule_node_id,
                    node_type="branch",
                    position=0,
                    config={
                        "rule_conditions": [{"rule_id": str(rule_uuid), "expected": True}],
                        "match_type": "all",
                    },
                ),
                node(
                    node_id=uuid.uuid4(),
                    parent_id=branch_id,
                    node_type="action",
                    position=1,
                    branch_type="TRUE",
                    action_type="redirect",
                    config={"target": "google_business_url"},
                ),
                node(
                    node_id=uuid.uuid4(),
                    parent_id=branch_id,
                    node_type="action",
                    position=2,
                    branch_type="FALSE",
                    action_type="email",
                    config={"target": "location_notification_groups"},
                ),
            ],
        )
        self.assertEqual(flow.nodes[1].node_type.value, "branch")

    def test_rejects_branch_with_three_children(self) -> None:
        rule_uuid = uuid.uuid4()
        rule_node_id = uuid.uuid4()
        branch_id = uuid.uuid4()
        with self.assertRaises(ValidationError) as ctx:
            CreateFlow(
                name="Too many branch children",
                location_survey_ids=[uuid.uuid4()],
                nodes=[
                    node(
                        node_id=rule_node_id,
                        parent_id=None,
                        node_type="rule",
                        position=0,
                        rule_id=str(rule_uuid),
                    ),
                    node(
                        node_id=branch_id,
                        parent_id=rule_node_id,
                        node_type="branch",
                        position=0,
                        config={"rule_ids": [str(rule_uuid)], "match_type": "all", "negate": False},
                    ),
                    node(
                        node_id=uuid.uuid4(),
                        parent_id=branch_id,
                        node_type="terminate",
                        position=0,
                        branch_type=None,
                    ),
                    node(
                        node_id=uuid.uuid4(),
                        parent_id=branch_id,
                        node_type="action",
                        position=1,
                        branch_type="TRUE",
                        action_type="redirect",
                        config={"target": "google_business_url"},
                    ),
                    node(
                        node_id=uuid.uuid4(),
                        parent_id=branch_id,
                        node_type="action",
                        position=2,
                        branch_type="FALSE",
                        action_type="email",
                        config={"target": "location_notification_groups"},
                    ),
                ],
            )
        err = str(ctx.exception).lower()
        self.assertIn("exactly two children", err)

    def test_rejects_branch_without_both_outcomes(self) -> None:
        rule_uuid = uuid.uuid4()
        rule_node_id = uuid.uuid4()
        branch_id = uuid.uuid4()
        true_action_id = uuid.uuid4()

        with self.assertRaises(ValidationError):
            CreateFlow(
                name="Missing false branch",
                location_survey_ids=[uuid.uuid4()],
                nodes=[
                    node(
                        node_id=rule_node_id,
                        parent_id=None,
                        node_type="rule",
                        position=0,
                        rule_id=str(rule_uuid),
                    ),
                    node(
                        node_id=branch_id,
                        parent_id=rule_node_id,
                        node_type="branch",
                        position=0,
                        config={"rule_ids": [str(rule_uuid)], "match_type": "all", "negate": False},
                    ),
                    node(
                        node_id=true_action_id,
                        parent_id=branch_id,
                        node_type="action",
                        position=0,
                        branch_type="TRUE",
                        action_type="redirect",
                        config={"target": "google_business_url"},
                    ),
                ],
            )

    def test_rejects_duplicate_rule_id_on_two_rule_nodes(self) -> None:
        shared = uuid.uuid4()
        r1 = uuid.uuid4()
        r2 = uuid.uuid4()
        term = uuid.uuid4()
        with self.assertRaises(ValidationError) as ctx:
            CreateFlow(
                name="Dup rules",
                location_survey_ids=[uuid.uuid4()],
                nodes=[
                    node(
                        node_id=r1,
                        parent_id=None,
                        node_type="rule",
                        position=0,
                        rule_id=str(shared),
                    ),
                    node(
                        node_id=r2,
                        parent_id=r1,
                        node_type="rule",
                        position=0,
                        rule_id=str(shared),
                    ),
                    node(
                        node_id=term,
                        parent_id=r2,
                        node_type="terminate",
                        position=0,
                    ),
                ],
            )
        self.assertIn("single path", str(ctx.exception).lower())

    def test_accepts_same_rule_on_separate_branch_paths(self) -> None:
        rid_b = uuid.uuid4()
        rid_a = uuid.uuid4()
        n_root = uuid.uuid4()
        n_branch = uuid.uuid4()
        n_rule_true = uuid.uuid4()
        n_term_true = uuid.uuid4()
        n_rule_false = uuid.uuid4()
        n_term_false = uuid.uuid4()
        flow = CreateFlow(
            name="Reuse rule A on two arms",
            location_survey_ids=[uuid.uuid4()],
            nodes=[
                node(
                    node_id=n_root,
                    parent_id=None,
                    node_type="rule",
                    position=0,
                    rule_id=str(rid_b),
                ),
                node(
                    node_id=n_branch,
                    parent_id=n_root,
                    node_type="branch",
                    position=0,
                    config={
                        "rule_conditions": [{"rule_id": str(rid_b), "expected": True}],
                        "match_type": "all",
                    },
                ),
                node(
                    node_id=n_rule_true,
                    parent_id=n_branch,
                    node_type="rule",
                    position=0,
                    branch_type="TRUE",
                    rule_id=str(rid_a),
                ),
                node(
                    node_id=n_term_true,
                    parent_id=n_rule_true,
                    node_type="terminate",
                    position=0,
                ),
                node(
                    node_id=n_rule_false,
                    parent_id=n_branch,
                    node_type="rule",
                    position=1,
                    branch_type="FALSE",
                    rule_id=str(rid_a),
                ),
                node(
                    node_id=n_term_false,
                    parent_id=n_rule_false,
                    node_type="terminate",
                    position=0,
                ),
            ],
        )
        self.assertEqual(
            sum(1 for n in flow.nodes if n.node_type.value == "rule" and n.rule_id == rid_a),
            2,
        )

    def test_rejects_branch_check_when_rule_only_below_branch(self) -> None:
        branch_id = uuid.uuid4()
        checked = uuid.uuid4()
        rule_under_true = uuid.uuid4()
        term1 = uuid.uuid4()
        term2 = uuid.uuid4()
        with self.assertRaises(ValidationError) as ctx:
            CreateFlow(
                name="Rule not upstream",
                location_survey_ids=[uuid.uuid4()],
                nodes=[
                    node(
                        node_id=branch_id,
                        parent_id=None,
                        node_type="branch",
                        position=0,
                        config={
                            "rule_conditions": [{"rule_id": str(checked), "expected": True}],
                            "match_type": "all",
                        },
                    ),
                    node(
                        node_id=rule_under_true,
                        parent_id=branch_id,
                        node_type="rule",
                        position=0,
                        branch_type="TRUE",
                        rule_id=str(checked),
                    ),
                    node(
                        node_id=term1,
                        parent_id=rule_under_true,
                        node_type="terminate",
                        position=0,
                    ),
                    node(
                        node_id=term2,
                        parent_id=branch_id,
                        node_type="terminate",
                        position=1,
                        branch_type="FALSE",
                    ),
                ],
            )
        self.assertIn("above the branch", str(ctx.exception).lower())

    def test_rejects_action_without_required_email_target_data(self) -> None:
        action_id = uuid.uuid4()

        with self.assertRaises(ValidationError):
            CreateFlow(
                name="Invalid email action",
                location_survey_ids=[uuid.uuid4()],
                nodes=[
                    node(
                        node_id=action_id,
                        parent_id=None,
                        node_type="action",
                        position=0,
                        action_type="email",
                        config={"target": "custom_email"},
                    ),
                ],
            )

    def test_rejects_second_redirect_on_same_path(self) -> None:
        rule_uuid = uuid.uuid4()
        rule_node_id = uuid.uuid4()
        redirect_a = uuid.uuid4()
        redirect_b = uuid.uuid4()
        term_id = uuid.uuid4()
        with self.assertRaises(ValidationError) as ctx:
            CreateFlow(
                name="Two redirects one path",
                location_survey_ids=[uuid.uuid4()],
                nodes=[
                    node(
                        node_id=rule_node_id,
                        parent_id=None,
                        node_type="rule",
                        position=0,
                        rule_id=str(rule_uuid),
                    ),
                    node(
                        node_id=redirect_a,
                        parent_id=rule_node_id,
                        node_type="action",
                        position=0,
                        action_type="redirect",
                        config={"target": "google_business_url"},
                    ),
                    node(
                        node_id=redirect_b,
                        parent_id=redirect_a,
                        node_type="action",
                        position=0,
                        action_type="redirect",
                        config={"target": "google_business_url"},
                    ),
                    node(
                        node_id=term_id,
                        parent_id=redirect_b,
                        node_type="terminate",
                        position=0,
                    ),
                ],
            )
        self.assertIn("redirect", str(ctx.exception).lower())

    def test_accepts_one_redirect_per_branch_side(self) -> None:
        rule_uuid = uuid.uuid4()
        rule_node_id = uuid.uuid4()
        branch_id = uuid.uuid4()
        true_action = uuid.uuid4()
        false_action = uuid.uuid4()
        term_true = uuid.uuid4()
        term_false = uuid.uuid4()
        CreateFlow(
            name="Branch two sides two redirects",
            location_survey_ids=[uuid.uuid4()],
            nodes=[
                node(
                    node_id=rule_node_id,
                    parent_id=None,
                    node_type="rule",
                    position=0,
                    rule_id=str(rule_uuid),
                ),
                node(
                    node_id=branch_id,
                    parent_id=rule_node_id,
                    node_type="branch",
                    position=0,
                    config={
                        "rule_conditions": [{"rule_id": str(rule_uuid), "expected": True}],
                        "match_type": "all",
                    },
                ),
                node(
                    node_id=true_action,
                    parent_id=branch_id,
                    node_type="action",
                    position=0,
                    branch_type="TRUE",
                    action_type="redirect",
                    config={"target": "google_business_url"},
                ),
                node(
                    node_id=false_action,
                    parent_id=branch_id,
                    node_type="action",
                    position=1,
                    branch_type="FALSE",
                    action_type="redirect",
                    config={"target": "google_business_url"},
                ),
                node(
                    node_id=term_true,
                    parent_id=true_action,
                    node_type="terminate",
                    position=0,
                ),
                node(
                    node_id=term_false,
                    parent_id=false_action,
                    node_type="terminate",
                    position=0,
                ),
            ],
        )


if __name__ == "__main__":
    unittest.main()
