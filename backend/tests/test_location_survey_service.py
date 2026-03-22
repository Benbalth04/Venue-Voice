import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.core.errors.exceptions import ValidationError
from app.models.postgres_model import LocationSurvey, SurveyStatus
from app.services.location_survey_service import (
    derive_location_survey_status,
    find_duplicate_location_ids,
    validate_qr_scan_access,
)


def make_location(*, is_active: bool = True, deleted_at=None):
    return SimpleNamespace(id=uuid.uuid4(), is_active=is_active, deleted_at=deleted_at, name="Venue")


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


def make_qr(*, is_active: bool = True, location_survey=None):
    return SimpleNamespace(id=uuid.uuid4(), is_active=is_active, location_survey=location_survey)


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
        self.assertEqual(status, "not_started")

    def test_derive_status_expired(self):
        now = datetime.now(timezone.utc)
        location_survey = make_location_survey(end_date=now - timedelta(minutes=1))
        status = derive_location_survey_status(
            location_survey,
            location_survey.location,
            location_survey.survey,
            now,
        )
        self.assertEqual(status, "expired")

    def test_derive_status_inactive_survey(self):
        now = datetime.now(timezone.utc)
        survey = make_survey(status=SurveyStatus.draft)
        location_survey = make_location_survey(survey=survey)
        status = derive_location_survey_status(location_survey, location_survey.location, survey, now)
        self.assertEqual(status, "inactive_survey")

    def test_qr_scan_fails_for_inactive_assignment(self):
        qr = make_qr(location_survey=make_location_survey(is_active=False))

        with self.assertRaises(ValidationError) as ctx:
            validate_qr_scan_access(qr, datetime.now(timezone.utc))

        self.assertEqual(ctx.exception.message, "This survey is not available right now")

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
