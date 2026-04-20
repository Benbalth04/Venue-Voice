"""Tests for survey archive QR cascade hooks and soft-delete archived survey."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.core.errors.exceptions import ConflictError, ValidationError
from app.models.postgres_model import Survey as SurveyORM
from app.models.postgres_model import SurveyStatus
from app.routes.surveys import soft_delete_archived_survey
from app.schemas.pydantic_model import DeleteRequest


def _archived_survey():
    s = MagicMock(spec=SurveyORM)
    s.id = uuid.uuid4()
    s.status = SurveyStatus.archived
    s.updated_at = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
    s.archived_at = datetime(2026, 1, 14, 12, 0, 0, tzinfo=timezone.utc)
    return s


def _qr_count_chain(scalar_val: int):
    c = MagicMock()
    c.join.return_value.filter.return_value.scalar.return_value = scalar_val
    return c


def _response_count_chain(scalar_val: int):
    c = MagicMock()
    c.join.return_value.filter.return_value.scalar.return_value = scalar_val
    return c


def _scan_count_chain(scalar_val: int):
    c = MagicMock()
    c.join.return_value.join.return_value.filter.return_value.scalar.return_value = scalar_val
    return c


class TestSoftDeleteArchivedSurvey:
    def test_rejects_when_not_archived(self):
        survey = _archived_survey()
        survey.status = SurveyStatus.draft
        payload = DeleteRequest(updated_at=survey.updated_at)
        db = MagicMock()

        with patch("app.routes.surveys._get_survey_or_404", return_value=survey):
            with patch("app.routes.surveys._get_user_company", return_value=MagicMock()):
                with pytest.raises(ValidationError) as exc:
                    soft_delete_archived_survey(str(survey.id), payload, MagicMock(), db)
        assert exc.value.code == "SURVEY_NOT_ARCHIVED"

    def test_rejects_when_qr_codes_exist(self):
        survey = _archived_survey()
        payload = DeleteRequest(updated_at=survey.updated_at)
        db = MagicMock()
        db.query.return_value = _qr_count_chain(3)

        with patch("app.routes.surveys._get_survey_or_404", return_value=survey):
            with patch("app.routes.surveys._get_user_company", return_value=MagicMock()):
                with pytest.raises(ConflictError) as exc:
                    soft_delete_archived_survey(str(survey.id), payload, MagicMock(), db)
        assert exc.value.code == "SURVEY_HAS_QR_CODES"

    def test_rejects_when_responses_exist(self):
        survey = _archived_survey()
        payload = DeleteRequest(updated_at=survey.updated_at)
        db = MagicMock()
        db.query.side_effect = [_qr_count_chain(0), _response_count_chain(2)]

        with patch("app.routes.surveys._get_survey_or_404", return_value=survey):
            with patch("app.routes.surveys._get_user_company", return_value=MagicMock()):
                with pytest.raises(ConflictError) as exc:
                    soft_delete_archived_survey(str(survey.id), payload, MagicMock(), db)
        assert exc.value.code == "SURVEY_HAS_RESPONSES"

    def test_rejects_when_scans_exist(self):
        survey = _archived_survey()
        payload = DeleteRequest(updated_at=survey.updated_at)
        db = MagicMock()
        db.query.side_effect = [
            _qr_count_chain(0),
            _response_count_chain(0),
            _scan_count_chain(7),
        ]

        with patch("app.routes.surveys._get_survey_or_404", return_value=survey):
            with patch("app.routes.surveys._get_user_company", return_value=MagicMock()):
                with pytest.raises(ConflictError) as exc:
                    soft_delete_archived_survey(str(survey.id), payload, MagicMock(), db)
        assert exc.value.code == "SURVEY_HAS_SCANS"

    def test_succeeds_and_soft_deletes_rows(self):
        survey = _archived_survey()
        payload = DeleteRequest(updated_at=survey.updated_at)
        db = MagicMock()

        survey_update = MagicMock()
        survey_update.filter.return_value.update.return_value = 1

        ls_update = MagicMock()
        ls_update.filter.return_value.update.return_value = 1

        rule_update = MagicMock()
        rule_update.filter.return_value.update.return_value = 1

        flow_update = MagicMock()
        flow_update.filter.return_value.update.return_value = 1

        db.query.side_effect = [
            _qr_count_chain(0),
            _response_count_chain(0),
            _scan_count_chain(0),
            survey_update,
            ls_update,
            rule_update,
            flow_update,
        ]

        with patch("app.routes.surveys._get_survey_or_404", return_value=survey):
            with patch("app.routes.surveys._get_user_company", return_value=MagicMock()):
                soft_delete_archived_survey(str(survey.id), payload, MagicMock(), db)

        db.commit.assert_called_once()
        survey_update.filter.return_value.update.assert_called_once()
        ls_update.filter.return_value.update.assert_called_once()
        rule_update.filter.return_value.update.assert_called_once()
        flow_update.filter.return_value.update.assert_called_once()
