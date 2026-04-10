"""Tests for PATCH /surveys/{id} title updates: draft-only rename and duplicate names."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.core.errors.exceptions import ConflictError, PermissionError
from app.models.postgres_model import Survey as SurveyORM
from app.models.postgres_model import SurveyStatus
from app.models.postgres_model import User as UserORM
from app.routes.surveys import _require_draft_for_survey_rename, update_survey_meta
from app.schemas.pydantic_model import SurveyUpdateMeta


class TestRequireDraftForSurveyRename:
    def test_allows_draft(self):
        survey = MagicMock()
        survey.status = SurveyStatus.draft
        _require_draft_for_survey_rename(survey)

    def test_rejects_active(self):
        survey = MagicMock()
        survey.status = SurveyStatus.active
        with pytest.raises(PermissionError) as exc_info:
            _require_draft_for_survey_rename(survey)
        assert exc_info.value.code == "SURVEY_RENAME_NOT_ALLOWED"

    def test_rejects_archived(self):
        survey = MagicMock()
        survey.status = SurveyStatus.archived
        with pytest.raises(PermissionError) as exc_info:
            _require_draft_for_survey_rename(survey)
        assert exc_info.value.code == "SURVEY_RENAME_NOT_ALLOWED"


def _draft_survey():
    s = MagicMock()
    s.id = uuid.uuid4()
    s.status = SurveyStatus.draft
    s.name = "Alpha"
    s.company_id = uuid.uuid4()
    s.updated_at = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
    s.latest_version = 1
    s.created_at = s.updated_at
    return s


class TestUpdateSurveyMetaTitle:
    def test_active_survey_title_patch_raises(self):
        survey = _draft_survey()
        survey.status = SurveyStatus.active
        payload = SurveyUpdateMeta(title="New Title", updated_at=survey.updated_at)
        membership = MagicMock()
        membership.user_id = uuid.uuid4()

        user_q = MagicMock()
        user_q.filter.return_value.first.return_value = MagicMock()
        db = MagicMock()
        db.query.return_value = user_q

        company = MagicMock()
        company.id = survey.company_id

        with patch("app.routes.surveys._get_user_company", return_value=company):
            with patch("app.routes.surveys._get_survey_or_404", return_value=survey):
                with pytest.raises(PermissionError) as exc_info:
                    update_survey_meta(
                        survey_id=str(survey.id),
                        payload=payload,
                        membership=membership,
                        db=db,
                    )
                assert exc_info.value.code == "SURVEY_RENAME_NOT_ALLOWED"

    def test_archived_survey_title_patch_raises(self):
        survey = _draft_survey()
        survey.status = SurveyStatus.archived
        payload = SurveyUpdateMeta(title="New Title", updated_at=survey.updated_at)
        membership = MagicMock()
        membership.user_id = uuid.uuid4()

        user_q = MagicMock()
        user_q.filter.return_value.first.return_value = MagicMock()
        db = MagicMock()
        db.query.return_value = user_q

        company = MagicMock()
        company.id = survey.company_id

        with patch("app.routes.surveys._get_user_company", return_value=company):
            with patch("app.routes.surveys._get_survey_or_404", return_value=survey):
                with pytest.raises(PermissionError) as exc_info:
                    update_survey_meta(
                        survey_id=str(survey.id),
                        payload=payload,
                        membership=membership,
                        db=db,
                    )
                assert exc_info.value.code == "SURVEY_RENAME_NOT_ALLOWED"

    def test_draft_duplicate_title_raises_conflict(self):
        survey = _draft_survey()
        payload = SurveyUpdateMeta(title="Taken Name", updated_at=survey.updated_at)
        membership = MagicMock()
        membership.user_id = uuid.uuid4()
        company = MagicMock()
        company.id = survey.company_id

        user_row = MagicMock()
        conflict_row = MagicMock()

        def query_side(model):
            q = MagicMock()
            if model is UserORM:
                q.filter.return_value.first.return_value = user_row
            elif model is SurveyORM:
                q.filter.return_value.first.return_value = conflict_row
            else:
                q.filter.return_value.first.return_value = None
            return q

        db = MagicMock()
        db.query.side_effect = query_side

        with patch("app.routes.surveys._get_user_company", return_value=company):
            with patch("app.routes.surveys._get_survey_or_404", return_value=survey):
                with pytest.raises(ConflictError) as exc_info:
                    update_survey_meta(
                        survey_id=str(survey.id),
                        payload=payload,
                        membership=membership,
                        db=db,
                    )
                assert exc_info.value.code == "SURVEY_TITLE_CONFLICT"
