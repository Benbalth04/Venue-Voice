"""Unit tests for flow_service._validate_nodes guard rails."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from sqlalchemy.orm import Session

from app.core.errors.exceptions import ValidationError
from app.schemas.pydantic_model import FlowNodeCreate, FlowNodeType
from app.services.flow_service import _validate_nodes


def test_validate_nodes_requires_at_least_one_action() -> None:
    db = MagicMock(spec=Session)
    company_id = uuid.uuid4()
    survey_id = uuid.uuid4()
    rule_id = uuid.uuid4()
    nid_rule = uuid.uuid4()
    nid_term = uuid.uuid4()
    nodes = [
        FlowNodeCreate(
            id=nid_rule,
            parent_id=None,
            node_type=FlowNodeType.rule,
            position=0,
            rule_id=rule_id,
        ),
        FlowNodeCreate(
            id=nid_term,
            parent_id=nid_rule,
            node_type=FlowNodeType.terminate,
            position=0,
        ),
    ]
    with pytest.raises(ValidationError) as exc_info:
        _validate_nodes(db, company_id, survey_id, nodes)
    assert exc_info.value.code == "FLOW_REQUIRES_ACTION"
