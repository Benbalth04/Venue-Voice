import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.core.errors.exceptions import ValidationError
from app.models.postgres_model import LocationSurvey, SurveyStatus
from app.services.location_survey_service import (
    derive_location_survey_status,
    derive_qr_code_status,
    find_duplicate_location_ids,
    validate_qr_scan_access,
)


def make_location(*, is_active: bool = True, deleted_at=None, archived_at=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        is_active=is_active,
        deleted_at=deleted_at,
        archived_at=archived_at,
        name="Venue",
    )


def make_survey(*, status: SurveyStatus = SurveyStatus.active, deleted_at=None):
    return SimpleNamespace(id=uuid.uuid4(), status=status, deleted_at=deleted_at, name="Survey")


def make_location_survey(
    *,
    is_active: bool = True,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    deleted_at=None,
    location=None,
    survey=None,
):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=uuid.uuid4(),
        is_active=is_active,
        start_date=start_date or now - timedelta(days=1),
        end_date=end_date,
        deleted_at=deleted_at,
        location=location or make_location(),
        survey=survey or make_survey(),
    )


def make_qr(*, is_active: bool = True, location_survey=None, deleted_at=None, archived_at=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        is_active=is_active,
        location_survey=location_survey,
        deleted_at=deleted_at,
        archived_at=archived_at,
    )


class LocationSurveyServiceTests(unittest.TestCase):
    def test_location_survey_model_effective_active(self):
        now = datetime.now(timezone.utc)
        location_survey = LocationSurvey(
            location_id=uuid.uuid4(),
            survey_id=uuid.uuid4(),
            is_active=True,
            start_date=now - timedelta(hours=1),
            end_date=now + timedelta(hours=1),
        )
        self.assertTrue(location_survey.is_effectively_active(now))

    def test_cannot_assign_same_survey_twice(self):
        requested = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
        duplicates = find_duplicate_location_ids(requested, [requested[1]])
        self.assertEqual(duplicates, [requested[1]])

    def test_derive_status_not_started(self):
        now = datetime.now(timezone.utc)
        location_survey = make_location_survey(start_date=now + timedelta(hours=2))
        status = derive_location_survey_status(
            location_survey,
            location_survey.location,
            location_survey.survey,
            now,
        )
        self.assertEqual(status, "scheduled")

    def test_derive_status_expired(self):
        now = datetime.now(timezone.utc)
        location_survey = make_location_survey(end_date=now - timedelta(minutes=1))
        status = derive_location_survey_status(
            location_survey,
            location_survey.location,
            location_survey.survey,
            now,
        )
        self.assertEqual(status, "inactive")

    def test_derive_status_inactive_survey(self):
        now = datetime.now(timezone.utc)
        survey = make_survey(status=SurveyStatus.draft)
        location_survey = make_location_survey(survey=survey)
        status = derive_location_survey_status(location_survey, location_survey.location, survey, now)
        self.assertEqual(status, "inactive")

    def test_derive_status_deleted_assignment(self):
        now = datetime.now(timezone.utc)
        location_survey = make_location_survey(deleted_at=now)
        status = derive_location_survey_status(
            location_survey,
            location_survey.location,
            location_survey.survey,
            now,
        )
        self.assertEqual(status, "deleted")

    def test_derive_status_archived_location(self):
        now = datetime.now(timezone.utc)
        location = make_location(archived_at=now)
        location_survey = make_location_survey(location=location)
        status = derive_location_survey_status(location_survey, location, location_survey.survey, now)
        self.assertEqual(status, "inactive")

    def test_derive_qr_code_status(self):
        self.assertEqual(derive_qr_code_status(make_qr()), "active")
        self.assertEqual(derive_qr_code_status(make_qr(is_active=False)), "inactive")
        self.assertEqual(derive_qr_code_status(make_qr(archived_at=datetime.now(timezone.utc))), "archived")
        self.assertEqual(derive_qr_code_status(make_qr(deleted_at=datetime.now(timezone.utc))), "deleted")

    def test_qr_scan_fails_for_archived_qr(self):
        qr = make_qr(archived_at=datetime.now(timezone.utc), location_survey=make_location_survey())
        with self.assertRaises(ValidationError) as ctx:
            validate_qr_scan_access(qr, datetime.now(timezone.utc))
        self.assertEqual(ctx.exception.message, "QR code is inactive")

    def test_qr_scan_fails_for_archived_location(self):
        location = make_location(archived_at=datetime.now(timezone.utc))
        location_survey = make_location_survey(location=location)
        qr = make_qr(location_survey=location_survey)
        with self.assertRaises(ValidationError) as ctx:
            validate_qr_scan_access(qr, datetime.now(timezone.utc))
        self.assertEqual(ctx.exception.message, "This location is not active")

    def test_qr_scan_allows_inactive_assignment_flag_when_qr_active(self):
        qr = make_qr(location_survey=make_location_survey(is_active=False))

        location_survey, location, survey = validate_qr_scan_access(qr, datetime.now(timezone.utc))
        self.assertIs(location_survey, qr.location_survey)
        self.assertIs(location, qr.location_survey.location)
        self.assertIs(survey, qr.location_survey.survey)

    def test_qr_scan_fails_for_expired_assignment(self):
        qr = make_qr(
            location_survey=make_location_survey(
                end_date=datetime.now(timezone.utc) - timedelta(minutes=1),
            )
        )

        with self.assertRaises(ValidationError) as ctx:
            validate_qr_scan_access(qr, datetime.now(timezone.utc))

        self.assertEqual(ctx.exception.message, "This survey is not currently running")

    def test_qr_scan_fails_for_inactive_location(self):
        location = make_location(is_active=False)
        location_survey = make_location_survey(location=location)
        qr = make_qr(location_survey=location_survey)

        with self.assertRaises(ValidationError) as ctx:
            validate_qr_scan_access(qr, datetime.now(timezone.utc))

        self.assertEqual(ctx.exception.message, "This location is not active")

    def test_qr_scan_fails_for_unpublished_survey(self):
        survey = make_survey(status=SurveyStatus.draft)
        location_survey = make_location_survey(survey=survey)
        qr = make_qr(location_survey=location_survey)

        with self.assertRaises(ValidationError) as ctx:
            validate_qr_scan_access(qr, datetime.now(timezone.utc))

        self.assertEqual(ctx.exception.message, "This survey is not published")


if __name__ == "__main__":
    unittest.main()
