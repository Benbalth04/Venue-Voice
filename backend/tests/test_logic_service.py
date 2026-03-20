import unittest
import uuid

from app.core.errors.exceptions import LogicEvaluationError
from app.services.logic_service import (
    ResponseValueContext,
    RuntimeCondition,
    _evaluate_condition_group,
    _evaluate_leaf_condition,
)


def make_condition(
    *,
    operator: str,
    threshold: float | None = None,
    connector: str = "AND",
    parent_condition_id: uuid.UUID | None = None,
    question_type: str = "nps",
    is_numeric: bool = True,
) -> RuntimeCondition:
    return RuntimeCondition(
        id=uuid.uuid4(),
        question_id=uuid.uuid4(),
        question_key="q1",
        question_type=question_type,
        is_numeric=is_numeric,
        operator=operator,
        threshold_value=threshold,
        logical_connector=connector,
        parent_condition_id=parent_condition_id,
    )


class LogicServiceTests(unittest.TestCase):
    def test_numeric_condition_uses_threshold(self) -> None:
        condition = make_condition(operator=">=", threshold=8)
        ctx = ResponseValueContext(
            question_key="q1",
            question_type="nps",
            is_numeric=True,
            raw_value=9,
            numeric_value=9.0,
            text_value=None,
            sentiment=None,
            sentiment_score=None,
        )
        self.assertTrue(_evaluate_leaf_condition(condition, ctx))

    def test_text_sentiment_condition(self) -> None:
        condition = make_condition(
            operator="sentiment_negative",
            question_type="text",
            is_numeric=False,
        )
        ctx = ResponseValueContext(
            question_key="q1",
            question_type="text",
            is_numeric=False,
            raw_value="slow service",
            numeric_value=None,
            text_value="slow service",
            sentiment="negative",
            sentiment_score=-0.7,
        )
        self.assertTrue(_evaluate_leaf_condition(condition, ctx))

    def test_contact_blank_condition(self) -> None:
        condition = make_condition(
            operator="blank",
            question_type="email",
            is_numeric=False,
        )
        ctx = ResponseValueContext(
            question_key="q1",
            question_type="email",
            is_numeric=False,
            raw_value="",
            numeric_value=None,
            text_value=None,
            sentiment=None,
            sentiment_score=None,
        )
        self.assertTrue(_evaluate_leaf_condition(condition, ctx))

    def test_condition_group_combines_children(self) -> None:
        group = RuntimeCondition(
            id=uuid.uuid4(),
            question_id=None,
            question_key=None,
            question_type=None,
            is_numeric=False,
            operator="group",
            threshold_value=None,
            logical_connector="AND",
            parent_condition_id=None,
        )
        child_one = make_condition(operator=">=", threshold=8, question_type="nps", is_numeric=True)
        child_one.parent_condition_id = group.id
        child_one.question_key = "q1"
        child_two = RuntimeCondition(
            id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            question_key="q2",
            question_type="email",
            is_numeric=False,
            operator="not_blank",
            threshold_value=None,
            logical_connector="AND",
            parent_condition_id=group.id,
        )
        contexts = {
            "q1": ResponseValueContext("q1", "nps", True, 9, 9.0, None, None, None),
            "q2": ResponseValueContext("q2", "email", False, "guest@example.com", None, "guest@example.com", None, None),
        }
        result = _evaluate_condition_group(
            [group],
            contexts,
            {None: [group], group.id: [child_one, child_two]},
        )
        self.assertTrue(result)

    def test_condition_group_rejects_second_nested_level(self) -> None:
        group = RuntimeCondition(
            id=uuid.uuid4(),
            question_id=None,
            question_key=None,
            question_type=None,
            is_numeric=False,
            operator="group",
            threshold_value=None,
            logical_connector="AND",
            parent_condition_id=None,
        )
        child_group = RuntimeCondition(
            id=uuid.uuid4(),
            question_id=None,
            question_key=None,
            question_type=None,
            is_numeric=False,
            operator="group",
            threshold_value=None,
            logical_connector="AND",
            parent_condition_id=group.id,
        )
        grandchild = RuntimeCondition(
            id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            question_key="q3",
            question_type="phone",
            is_numeric=False,
            operator="not_blank",
            threshold_value=None,
            logical_connector="AND",
            parent_condition_id=child_group.id,
        )
        contexts = {
            "q1": ResponseValueContext("q1", "nps", True, 9, 9.0, None, None, None),
            "q3": ResponseValueContext("q3", "phone", False, "0400000000", None, "0400000000", None, None),
        }
        with self.assertRaises(LogicEvaluationError):
            _evaluate_condition_group(
                [group],
                contexts,
                {None: [group], group.id: [child_group], child_group.id: [grandchild]},
            )


if __name__ == "__main__":
    unittest.main()
