import unittest
import uuid

from app.models.postgres_model import Rule as RuleORM
from app.models.postgres_model import RuleCondition as RuleConditionORM
from app.models.postgres_model import RuleGroup as RuleGroupORM
from app.services.rule_service import ResponseValueContext, evaluate_rule


def make_context(*, raw_value, numeric_value=None, sentiment=None):
    question_id = uuid.uuid4()
    return question_id, ResponseValueContext(
        question_id=question_id,
        question_key=str(question_id),
        question_type="text" if sentiment is not None else "nps",
        is_numeric=sentiment is None,
        raw_value=raw_value,
        numeric_value=numeric_value,
        text_value=str(raw_value) if isinstance(raw_value, str) else None,
        sentiment=sentiment,
        sentiment_score=None,
    )


class RuleServiceTests(unittest.TestCase):
    def test_top_level_or_succeeds_when_any_condition_matches(self) -> None:
        first_question_id, first_context = make_context(raw_value=4, numeric_value=4.0)
        second_question_id, second_context = make_context(raw_value=9, numeric_value=9.0)
        rule = RuleORM(name="score rule", operator="OR", company_id=uuid.uuid4(), survey_id=uuid.uuid4())
        rule.conditions = [
            RuleConditionORM(
                condition_type="rating",
                question_id=first_question_id,
                operator="gte",
                value="8",
            ),
            RuleConditionORM(
                condition_type="rating",
                question_id=second_question_id,
                operator="gte",
                value="8",
            ),
        ]
        rule.groups = []

        self.assertTrue(
            evaluate_rule(
                rule,
                {
                    first_question_id: first_context,
                    second_question_id: second_context,
                },
            )
        )

    def test_group_or_contributes_single_top_level_result(self) -> None:
        standalone_question_id, standalone_context = make_context(raw_value=10, numeric_value=10.0)
        group_question_one_id, group_context_one = make_context(raw_value=2, numeric_value=2.0)
        group_question_two_id, group_context_two = make_context(raw_value="bad", sentiment="negative")
        group = RuleGroupORM(id=uuid.uuid4(), operator="OR")
        rule = RuleORM(name="mixed rule", operator="AND", company_id=uuid.uuid4(), survey_id=uuid.uuid4())
        rule.groups = [group]
        rule.conditions = [
            RuleConditionORM(
                condition_type="rating",
                question_id=standalone_question_id,
                operator="gte",
                value="8",
            ),
            RuleConditionORM(
                condition_type="rating",
                question_id=group_question_one_id,
                operator="gte",
                value="8",
                group_id=group.id,
            ),
            RuleConditionORM(
                condition_type="sentiment",
                question_id=group_question_two_id,
                operator="is",
                value="negative",
                group_id=group.id,
            ),
        ]

        self.assertTrue(
            evaluate_rule(
                rule,
                {
                    standalone_question_id: standalone_context,
                    group_question_one_id: group_context_one,
                    group_question_two_id: group_context_two,
                },
            )
        )


if __name__ == "__main__":
    unittest.main()
