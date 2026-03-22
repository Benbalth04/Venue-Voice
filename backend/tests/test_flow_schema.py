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
        branch_id = uuid.uuid4()
        true_action_id = uuid.uuid4()
        false_action_id = uuid.uuid4()

        flow = CreateFlow(
            name="Branch flow",
            location_survey_ids=[uuid.uuid4()],
            nodes=[
                node(
                    node_id=branch_id,
                    parent_id=None,
                    node_type="branch",
                    position=0,
                    config={"rule_ids": [str(uuid.uuid4())], "match_type": "all", "negate": False},
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

        self.assertEqual(flow.nodes[0].node_type.value, "branch")

    def test_rejects_branch_without_both_outcomes(self) -> None:
        branch_id = uuid.uuid4()
        true_action_id = uuid.uuid4()

        with self.assertRaises(ValidationError):
            CreateFlow(
                name="Missing false branch",
                location_survey_ids=[uuid.uuid4()],
                nodes=[
                    node(
                        node_id=branch_id,
                        parent_id=None,
                        node_type="branch",
                        position=0,
                        config={"rule_ids": [str(uuid.uuid4())], "match_type": "all", "negate": False},
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


if __name__ == "__main__":
    unittest.main()
