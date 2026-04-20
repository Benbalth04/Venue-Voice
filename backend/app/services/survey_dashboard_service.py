"""
Survey Dashboard aggregation service.
All aggregation is done server-side; no per-question queries in loops.
Queries are company-scoped and survey-scoped.
"""
from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, date as _date

from sqlalchemy import select, func, case, distinct, and_, or_, cast, Date
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo

from ..core.datetime_user_tz import (
    inclusive_local_date_range_to_utc_bounds,
    naive_utc_for_sql,
    to_iso8601_zoned,
    user_local_date_sql,
)

from ..models.postgres_model import (
    AIAnalysis as AIAnalysisORM,
    Location as LocationORM,
    LocationSnapshot as LocationSnapshotORM,
    LocationSurvey as LocationSurveyORM,
    QRCode as QRCodeORM,
    Question as QuestionORM,
    ScanEvent as ScanEventORM,
    Survey as SurveyORM,
    SurveyStatus,
    SurveyResponse as SurveyResponseORM,
    SurveyResponseAnswer as SurveyResponseAnswerORM,
    SurveyResponsePhoto as SurveyResponsePhotoORM,
    SurveyVersion as SurveyVersionORM,
)
from ..schemas.pydantic_model import (
    BreakdownSeries,
    ChoiceDistribution,
    DailyCompletionPoint,
    DailyDistributionPoint,
    DailyNumericPoint,
    DailySentimentPoint,
    DashboardFilterParams,
    EngagementBreakdownResponse,
    EngagementBreakdownSeries,
    EngagementData,
    OldQuestionsDashboardResponse,
    QuestionAggregation,
    QuestionBreakdownResponse,
    RatingDistribution,
    SentimentDistribution,
    SurveyDashboardResponse,
)
from ..core.errors.exceptions import NotFoundError, PermissionError, ValidationError
from ..integrations.supabase_storage import (
    get_supabase_service_client,
    generate_photo_signed_url,
)

logger = logging.getLogger(__name__)

_DEFAULT_DATE_RANGE_DAYS = 30
_NUMERIC_TYPES = frozenset({"star", "nps"})
_TEXT_TYPES = frozenset({"text", "long_text"})
_CHOICE_TYPES = frozenset({"multiple_choice", "checkbox"})
_YES_NO_TYPE = "yes_no"
_COUNT_TYPES = frozenset({"email", "phone"})
_PHOTO_TYPE = "photo"


# ── Public entry points ───────────────────────────────────────────────────────

def get_dashboard_data(
    db: Session,
    survey_id: uuid.UUID,
    company_id: uuid.UUID,
    filters: DashboardFilterParams,
    user_tz: ZoneInfo,
) -> SurveyDashboardResponse:
    survey = _verify_survey_ownership(db, survey_id, company_id)
    date_start, date_end = _resolve_date_range(filters, user_tz)
    resolved_filters = DashboardFilterParams(
        location_ids=filters.location_ids,
        qr_code_ids=filters.qr_code_ids,
        date_start=date_start,
        date_end=date_end,
        include_archived=filters.include_archived,
    )
    engagement = get_engagement_data(db, survey_id, resolved_filters, user_tz)
    active_questions = _get_active_questions(db, survey_id)
    if not active_questions:
        return SurveyDashboardResponse(
            survey_id=survey_id,
            survey_name=survey.name,
            date_start=to_iso8601_zoned(date_start, user_tz) or "",
            date_end=to_iso8601_zoned(date_end, user_tz) or "",
            questions=[],
            engagement=engagement,
        )
    question_meta: dict[uuid.UUID, QuestionORM] = {
        q.stable_question_id: q for q in active_questions
    }
    target_stable_ids = list(question_meta.keys())
    questions = _execute_aggregations(
        db, target_stable_ids, question_meta, resolved_filters, survey_id, user_tz
    )
    _attach_photo_signed_urls(questions)
    questions.sort(key=lambda q: q.position)
    return SurveyDashboardResponse(
        survey_id=survey_id,
        survey_name=survey.name,
        date_start=to_iso8601_zoned(date_start, user_tz) or "",
        date_end=to_iso8601_zoned(date_end, user_tz) or "",
        questions=questions,
        engagement=engagement,
    )


def get_old_questions_dashboard_data(
    db: Session,
    survey_id: uuid.UUID,
    company_id: uuid.UUID,
    filters: DashboardFilterParams,
    user_tz: ZoneInfo,
) -> OldQuestionsDashboardResponse:
    _verify_survey_ownership(db, survey_id, company_id)
    date_start, date_end = _resolve_date_range(filters, user_tz)
    resolved_filters = DashboardFilterParams(
        location_ids=filters.location_ids,
        qr_code_ids=filters.qr_code_ids,
        date_start=date_start,
        date_end=date_end,
        include_archived=filters.include_archived,
    )
    active_questions = _get_active_questions(db, survey_id)
    active_stable_ids = {q.stable_question_id for q in active_questions}

    responded_stable_ids = _get_stable_ids_with_responses(db, survey_id, resolved_filters)
    old_stable_ids = responded_stable_ids - active_stable_ids
    if not old_stable_ids:
        return OldQuestionsDashboardResponse(survey_id=survey_id, questions=[])

    # For old questions: use the most-recent question version's metadata
    old_question_rows = (
        db.query(QuestionORM)
        .filter(
            QuestionORM.stable_question_id.in_(old_stable_ids),
            QuestionORM.deleted_at.is_(None),
        )
        .order_by(QuestionORM.stable_question_id, QuestionORM.id.desc())
        .all()
    )
    # Deduplicate: keep first (newest) per stable_question_id
    question_meta: dict[uuid.UUID, QuestionORM] = {}
    for q in old_question_rows:
        if q.stable_question_id not in question_meta:
            question_meta[q.stable_question_id] = q

    questions = _execute_aggregations(
        db,
        list(question_meta.keys()),
        question_meta,
        resolved_filters,
        survey_id,
        user_tz,
    )
    _attach_photo_signed_urls(questions)
    # Sort by most recently responded (question with highest stable_question_id last seen)
    questions.sort(key=lambda q: q.total_responses, reverse=True)
    return OldQuestionsDashboardResponse(survey_id=survey_id, questions=questions)


def get_engagement_data(
    db: Session,
    survey_id: uuid.UUID,
    filters: DashboardFilterParams,
    user_tz: ZoneInfo,
) -> EngagementData:
    """Return scan/completion totals and daily completion rate for a survey."""
    scan_day = user_local_date_sql(ScanEventORM.scanned_at, user_tz)
    # ── Daily scans: ScanEvent → QRCode → LocationSurvey scoped to survey ──
    scans_stmt = (
        select(
            scan_day.label("scan_date"),
            func.count(ScanEventORM.id).label("cnt"),
        )
        .join(QRCodeORM, QRCodeORM.id == ScanEventORM.qr_code_id)
        .join(LocationSurveyORM, LocationSurveyORM.id == QRCodeORM.location_survey_id)
        .join(SurveyORM, SurveyORM.id == LocationSurveyORM.survey_id)
        .join(LocationORM, LocationORM.id == QRCodeORM.location_id)
        .where(
            LocationSurveyORM.survey_id == survey_id,
            ScanEventORM.deleted_at.is_(None),
            QRCodeORM.deleted_at.is_(None),
            LocationSurveyORM.deleted_at.is_(None),
            LocationORM.deleted_at.is_(None),
            ScanEventORM.scanned_at >= filters.date_start,
            ScanEventORM.scanned_at < filters.date_end,
        )
    )
    if not filters.include_archived:
        scans_stmt = scans_stmt.where(
            QRCodeORM.archived_at.is_(None),
            LocationORM.archived_at.is_(None),
            SurveyORM.status != SurveyStatus.archived,
        )
    if filters.qr_code_ids is not None:
        scans_stmt = scans_stmt.where(ScanEventORM.qr_code_id.in_(filters.qr_code_ids))
    if filters.location_ids is not None:
        scans_stmt = scans_stmt.where(QRCodeORM.location_id.in_(filters.location_ids))
    scans_stmt = scans_stmt.group_by(scan_day)

    scan_rows = db.execute(scans_stmt).fetchall()
    daily_scans: dict[_date, int] = {row.scan_date: int(row.cnt) for row in scan_rows}
    total_scans = sum(daily_scans.values())

    # ── Daily completions: reuse filtered responses subquery ──
    fr_sq = _build_filtered_responses_subquery(db, survey_id, filters)
    comp_day = user_local_date_sql(fr_sq.c.completion_datetime, user_tz)
    comp_rows = db.execute(
        select(
            comp_day.label("comp_date"),
            func.count(fr_sq.c.id).label("cnt"),
        ).group_by(comp_day)
    ).fetchall()
    daily_completions: dict[_date, int] = {row.comp_date: int(row.cnt) for row in comp_rows}
    total_completions = sum(daily_completions.values())

    # ── Merge by date and compute rate ──
    all_dates = sorted(daily_scans.keys() | daily_completions.keys())
    daily_points: list[DailyCompletionPoint] = []
    for d in all_dates:
        scans = daily_scans.get(d, 0)
        completions = daily_completions.get(d, 0)
        rate = round(completions / scans, 4) if scans > 0 else None
        daily_points.append(
            DailyCompletionPoint(date=d, scans=scans, completions=completions, rate=rate)
        )

    return EngagementData(
        total_scans=total_scans,
        total_completions=total_completions,
        daily_completion_rate=daily_points,
    )


def get_question_breakdown(
    db: Session,
    survey_id: uuid.UUID,
    company_id: uuid.UUID,
    stable_question_id: uuid.UUID,
    breakdown_by: str,
    filters: DashboardFilterParams,
    user_tz: ZoneInfo,
) -> QuestionBreakdownResponse:
    """Return per-location or per-QR-code aggregations for a single question."""
    _verify_survey_ownership(db, survey_id, company_id)
    date_start, date_end = _resolve_date_range(filters, user_tz)
    resolved_filters = DashboardFilterParams(
        location_ids=filters.location_ids,
        qr_code_ids=filters.qr_code_ids,
        date_start=date_start,
        date_end=date_end,
        include_archived=filters.include_archived,
    )

    # Look up the most recent question row for this stable_question_id in this survey
    question_meta_row = (
        db.query(QuestionORM)
        .join(SurveyVersionORM, SurveyVersionORM.id == QuestionORM.survey_version_id)
        .filter(
            SurveyVersionORM.survey_id == survey_id,
            QuestionORM.stable_question_id == stable_question_id,
            SurveyVersionORM.deleted_at.is_(None),
            QuestionORM.deleted_at.is_(None),
        )
        .order_by(QuestionORM.id.desc())
        .first()
    )
    if not question_meta_row:
        raise ValidationError(
            code="QUESTION_NOT_FOUND",
            message="Question not found in this survey",
            details={"stable_question_id": str(stable_question_id)},
        )

    # Find distinct entities (locations or QR codes) with ≥1 answer for this question
    if breakdown_by == "location":
        entity_rows = _get_question_entities_by_location(
            db, survey_id, stable_question_id, resolved_filters
        )
    else:
        entity_rows = _get_question_entities_by_qr_code(
            db, survey_id, stable_question_id, resolved_filters
        )

    # For each entity, run aggregation with a narrowed filter
    series: list[BreakdownSeries] = []
    question_meta_map = {question_meta_row.stable_question_id: question_meta_row}

    for entity_id, entity_name in entity_rows:
        if breakdown_by == "location":
            entity_filter = DashboardFilterParams(
                location_ids=[entity_id],
                qr_code_ids=resolved_filters.qr_code_ids,
                date_start=resolved_filters.date_start,
                date_end=resolved_filters.date_end,
                include_archived=resolved_filters.include_archived,
            )
        else:
            entity_filter = DashboardFilterParams(
                location_ids=resolved_filters.location_ids,
                qr_code_ids=[entity_id],
                date_start=resolved_filters.date_start,
                date_end=resolved_filters.date_end,
                include_archived=resolved_filters.include_archived,
            )
        aggs = _execute_aggregations(
            db,
            [stable_question_id],
            question_meta_map,
            entity_filter,
            survey_id,
            user_tz,
        )
        if aggs:
            series.append(
                BreakdownSeries(
                    series_id=entity_id,
                    series_name=entity_name,
                    aggregation=aggs[0],
                )
            )

    return QuestionBreakdownResponse(
        stable_question_id=str(stable_question_id),
        breakdown_by=breakdown_by,
        series=series,
    )


def get_engagement_breakdown(
    db: Session,
    survey_id: uuid.UUID,
    company_id: uuid.UUID,
    breakdown_by: str,
    filters: DashboardFilterParams,
    user_tz: ZoneInfo,
) -> EngagementBreakdownResponse:
    """Return per-location or per-QR-code engagement data for a survey."""
    _verify_survey_ownership(db, survey_id, company_id)
    date_start, date_end = _resolve_date_range(filters, user_tz)
    resolved_filters = DashboardFilterParams(
        location_ids=filters.location_ids,
        qr_code_ids=filters.qr_code_ids,
        date_start=date_start,
        date_end=date_end,
        include_archived=filters.include_archived,
    )

    if breakdown_by == "location":
        entity_rows = _get_engagement_entities_by_location(db, survey_id, resolved_filters)
    else:
        entity_rows = _get_engagement_entities_by_qr_code(db, survey_id, resolved_filters)

    series: list[EngagementBreakdownSeries] = []
    for entity_id, entity_name in entity_rows:
        if breakdown_by == "location":
            entity_filter = DashboardFilterParams(
                location_ids=[entity_id],
                qr_code_ids=resolved_filters.qr_code_ids,
                date_start=resolved_filters.date_start,
                date_end=resolved_filters.date_end,
                include_archived=resolved_filters.include_archived,
            )
        else:
            entity_filter = DashboardFilterParams(
                location_ids=resolved_filters.location_ids,
                qr_code_ids=[entity_id],
                date_start=resolved_filters.date_start,
                date_end=resolved_filters.date_end,
                include_archived=resolved_filters.include_archived,
            )
        engagement = get_engagement_data(db, survey_id, entity_filter, user_tz)
        series.append(
            EngagementBreakdownSeries(
                series_id=entity_id,
                series_name=entity_name,
                total_scans=engagement.total_scans,
                total_completions=engagement.total_completions,
                daily_completion_rate=engagement.daily_completion_rate,
            )
        )

    return EngagementBreakdownResponse(breakdown_by=breakdown_by, series=series)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _get_question_entities_by_location(
    db: Session,
    survey_id: uuid.UUID,
    stable_question_id: uuid.UUID,
    filters: DashboardFilterParams,
) -> list[tuple[uuid.UUID, str]]:
    """Distinct locations with ≥1 answer for the given question in the filter window."""
    stmt = (
        select(LocationSnapshotORM.location_id, LocationORM.name)
        .select_from(SurveyResponseAnswerORM)
        .join(SurveyResponseORM, SurveyResponseORM.id == SurveyResponseAnswerORM.survey_response_id)
        .join(SurveyVersionORM, SurveyVersionORM.id == SurveyResponseORM.survey_version_id)
        .join(SurveyORM, SurveyORM.id == SurveyVersionORM.survey_id)
        .join(QRCodeORM, QRCodeORM.id == SurveyResponseORM.qr_code_id)
        .join(LocationSnapshotORM, LocationSnapshotORM.id == SurveyResponseORM.location_snapshot_id)
        .join(LocationORM, LocationORM.id == LocationSnapshotORM.location_id)
        .where(
            SurveyVersionORM.survey_id == survey_id,
            SurveyResponseAnswerORM.question_id == stable_question_id,
            SurveyResponseORM.deleted_at.is_(None),
            SurveyResponseAnswerORM.deleted_at.is_(None),
            SurveyResponseORM.completion_datetime >= filters.date_start,
            SurveyResponseORM.completion_datetime < filters.date_end,
        )
        .group_by(LocationSnapshotORM.location_id, LocationORM.name)
        .order_by(LocationORM.name)
    )
    if not filters.include_archived:
        stmt = stmt.where(
            QRCodeORM.archived_at.is_(None),
            LocationORM.archived_at.is_(None),
            SurveyORM.status != SurveyStatus.archived,
        )
    if filters.location_ids is not None:
        stmt = stmt.where(LocationSnapshotORM.location_id.in_(filters.location_ids))
    if filters.qr_code_ids is not None:
        stmt = stmt.where(SurveyResponseORM.qr_code_id.in_(filters.qr_code_ids))
    rows = db.execute(stmt).fetchall()
    return [(row[0], row[1]) for row in rows]


def _get_question_entities_by_qr_code(
    db: Session,
    survey_id: uuid.UUID,
    stable_question_id: uuid.UUID,
    filters: DashboardFilterParams,
) -> list[tuple[uuid.UUID, str]]:
    """Distinct QR codes with ≥1 answer for the given question in the filter window."""
    stmt = (
        select(SurveyResponseORM.qr_code_id, QRCodeORM.title)
        .select_from(SurveyResponseAnswerORM)
        .join(SurveyResponseORM, SurveyResponseORM.id == SurveyResponseAnswerORM.survey_response_id)
        .join(SurveyVersionORM, SurveyVersionORM.id == SurveyResponseORM.survey_version_id)
        .join(SurveyORM, SurveyORM.id == SurveyVersionORM.survey_id)
        .join(QRCodeORM, QRCodeORM.id == SurveyResponseORM.qr_code_id)
        .join(LocationORM, LocationORM.id == QRCodeORM.location_id)
        .where(
            SurveyVersionORM.survey_id == survey_id,
            SurveyResponseAnswerORM.question_id == stable_question_id,
            SurveyResponseORM.deleted_at.is_(None),
            SurveyResponseAnswerORM.deleted_at.is_(None),
            SurveyResponseORM.completion_datetime >= filters.date_start,
            SurveyResponseORM.completion_datetime < filters.date_end,
        )
        .group_by(SurveyResponseORM.qr_code_id, QRCodeORM.title)
        .order_by(QRCodeORM.title)
    )
    if not filters.include_archived:
        stmt = stmt.where(
            QRCodeORM.archived_at.is_(None),
            LocationORM.archived_at.is_(None),
            SurveyORM.status != SurveyStatus.archived,
        )
    if filters.qr_code_ids is not None:
        stmt = stmt.where(SurveyResponseORM.qr_code_id.in_(filters.qr_code_ids))
    if filters.location_ids is not None:
        stmt = (
            stmt
            .join(
                LocationSnapshotORM,
                LocationSnapshotORM.id == SurveyResponseORM.location_snapshot_id,
            )
            .where(LocationSnapshotORM.location_id.in_(filters.location_ids))
        )
    rows = db.execute(stmt).fetchall()
    return [(row[0], row[1]) for row in rows]


def _get_engagement_entities_by_location(
    db: Session,
    survey_id: uuid.UUID,
    filters: DashboardFilterParams,
) -> list[tuple[uuid.UUID, str]]:
    """Distinct locations with scan or completion activity for this survey."""
    # Locations from completions
    comp_stmt = (
        select(LocationSnapshotORM.location_id, LocationORM.name)
        .select_from(SurveyResponseORM)
        .join(SurveyVersionORM, SurveyVersionORM.id == SurveyResponseORM.survey_version_id)
        .join(SurveyORM, SurveyORM.id == SurveyVersionORM.survey_id)
        .join(QRCodeORM, QRCodeORM.id == SurveyResponseORM.qr_code_id)
        .join(LocationSnapshotORM, LocationSnapshotORM.id == SurveyResponseORM.location_snapshot_id)
        .join(LocationORM, LocationORM.id == LocationSnapshotORM.location_id)
        .where(
            SurveyVersionORM.survey_id == survey_id,
            SurveyResponseORM.deleted_at.is_(None),
            SurveyResponseORM.completion_datetime >= filters.date_start,
            SurveyResponseORM.completion_datetime < filters.date_end,
            LocationSnapshotORM.deleted_at.is_(None),
            LocationORM.deleted_at.is_(None),
        )
        .group_by(LocationSnapshotORM.location_id, LocationORM.name)
    )
    if not filters.include_archived:
        comp_stmt = comp_stmt.where(
            QRCodeORM.archived_at.is_(None),
            LocationORM.archived_at.is_(None),
            SurveyORM.status != SurveyStatus.archived,
        )
    if filters.location_ids is not None:
        comp_stmt = comp_stmt.where(LocationSnapshotORM.location_id.in_(filters.location_ids))
    if filters.qr_code_ids is not None:
        comp_stmt = comp_stmt.where(SurveyResponseORM.qr_code_id.in_(filters.qr_code_ids))

    # Locations from scans
    scan_stmt = (
        select(QRCodeORM.location_id, LocationORM.name)
        .select_from(ScanEventORM)
        .join(QRCodeORM, QRCodeORM.id == ScanEventORM.qr_code_id)
        .join(LocationSurveyORM, LocationSurveyORM.id == QRCodeORM.location_survey_id)
        .join(SurveyORM, SurveyORM.id == LocationSurveyORM.survey_id)
        .join(LocationORM, LocationORM.id == QRCodeORM.location_id)
        .where(
            LocationSurveyORM.survey_id == survey_id,
            ScanEventORM.deleted_at.is_(None),
            QRCodeORM.deleted_at.is_(None),
            LocationSurveyORM.deleted_at.is_(None),
            LocationORM.deleted_at.is_(None),
            ScanEventORM.scanned_at >= filters.date_start,
            ScanEventORM.scanned_at < filters.date_end,
        )
        .group_by(QRCodeORM.location_id, LocationORM.name)
    )
    if not filters.include_archived:
        scan_stmt = scan_stmt.where(
            QRCodeORM.archived_at.is_(None),
            LocationORM.archived_at.is_(None),
            SurveyORM.status != SurveyStatus.archived,
        )
    if filters.location_ids is not None:
        scan_stmt = scan_stmt.where(QRCodeORM.location_id.in_(filters.location_ids))
    if filters.qr_code_ids is not None:
        scan_stmt = scan_stmt.where(ScanEventORM.qr_code_id.in_(filters.qr_code_ids))

    seen: dict[uuid.UUID, str] = {}
    for row in db.execute(comp_stmt).fetchall() + db.execute(scan_stmt).fetchall():
        if row[0] not in seen:
            seen[row[0]] = row[1]
    return sorted(seen.items(), key=lambda x: x[1])


def _get_engagement_entities_by_qr_code(
    db: Session,
    survey_id: uuid.UUID,
    filters: DashboardFilterParams,
) -> list[tuple[uuid.UUID, str]]:
    """Distinct QR codes with scan or completion activity for this survey."""
    # QR codes from completions
    comp_stmt = (
        select(SurveyResponseORM.qr_code_id, QRCodeORM.title)
        .select_from(SurveyResponseORM)
        .join(SurveyVersionORM, SurveyVersionORM.id == SurveyResponseORM.survey_version_id)
        .join(SurveyORM, SurveyORM.id == SurveyVersionORM.survey_id)
        .join(QRCodeORM, QRCodeORM.id == SurveyResponseORM.qr_code_id)
        .join(LocationORM, LocationORM.id == QRCodeORM.location_id)
        .where(
            SurveyVersionORM.survey_id == survey_id,
            SurveyResponseORM.deleted_at.is_(None),
            SurveyResponseORM.completion_datetime >= filters.date_start,
            SurveyResponseORM.completion_datetime < filters.date_end,
            QRCodeORM.deleted_at.is_(None),
            LocationORM.deleted_at.is_(None),
        )
        .group_by(SurveyResponseORM.qr_code_id, QRCodeORM.title)
    )
    if not filters.include_archived:
        comp_stmt = comp_stmt.where(
            QRCodeORM.archived_at.is_(None),
            LocationORM.archived_at.is_(None),
            SurveyORM.status != SurveyStatus.archived,
        )
    if filters.qr_code_ids is not None:
        comp_stmt = comp_stmt.where(SurveyResponseORM.qr_code_id.in_(filters.qr_code_ids))

    # QR codes from scans
    scan_stmt = (
        select(ScanEventORM.qr_code_id, QRCodeORM.title)
        .select_from(ScanEventORM)
        .join(QRCodeORM, QRCodeORM.id == ScanEventORM.qr_code_id)
        .join(LocationSurveyORM, LocationSurveyORM.id == QRCodeORM.location_survey_id)
        .join(SurveyORM, SurveyORM.id == LocationSurveyORM.survey_id)
        .join(LocationORM, LocationORM.id == QRCodeORM.location_id)
        .where(
            LocationSurveyORM.survey_id == survey_id,
            ScanEventORM.deleted_at.is_(None),
            QRCodeORM.deleted_at.is_(None),
            LocationSurveyORM.deleted_at.is_(None),
            LocationORM.deleted_at.is_(None),
            ScanEventORM.scanned_at >= filters.date_start,
            ScanEventORM.scanned_at < filters.date_end,
        )
        .group_by(ScanEventORM.qr_code_id, QRCodeORM.title)
    )
    if not filters.include_archived:
        scan_stmt = scan_stmt.where(
            QRCodeORM.archived_at.is_(None),
            LocationORM.archived_at.is_(None),
            SurveyORM.status != SurveyStatus.archived,
        )
    if filters.qr_code_ids is not None:
        scan_stmt = scan_stmt.where(ScanEventORM.qr_code_id.in_(filters.qr_code_ids))
    if filters.location_ids is not None:
        scan_stmt = scan_stmt.where(QRCodeORM.location_id.in_(filters.location_ids))

    seen: dict[uuid.UUID, str] = {}
    for row in db.execute(comp_stmt).fetchall() + db.execute(scan_stmt).fetchall():
        if row[0] not in seen:
            seen[row[0]] = row[1]
    return sorted(seen.items(), key=lambda x: x[1])


def _verify_survey_ownership(
    db: Session, survey_id: uuid.UUID, company_id: uuid.UUID
) -> SurveyORM:
    survey = (
        db.query(SurveyORM)
        .filter(SurveyORM.id == survey_id, SurveyORM.deleted_at.is_(None))
        .first()
    )
    if not survey:
        raise NotFoundError(
            code="SURVEY_NOT_FOUND",
            message="Survey not found",
            details={"survey_id": str(survey_id)},
        )
    if survey.company_id != company_id:
        raise PermissionError(
            code="ACCESS_DENIED",
            message="You do not have access to this survey",
            details={},
        )
    return survey


def _get_active_questions(db: Session, survey_id: uuid.UUID) -> list[QuestionORM]:
    """Return questions from the latest survey version, ordered by position."""
    survey = (
        db.query(SurveyORM)
        .filter(SurveyORM.id == survey_id, SurveyORM.deleted_at.is_(None))
        .first()
    )
    if not survey:
        return []
    version = (
        db.query(SurveyVersionORM)
        .filter(
            SurveyVersionORM.survey_id == survey_id,
            SurveyVersionORM.version_number == survey.latest_version,
            SurveyVersionORM.deleted_at.is_(None),
        )
        .first()
    )
    if not version:
        return []
    return (
        db.query(QuestionORM)
        .filter(
            QuestionORM.survey_version_id == version.id,
            QuestionORM.deleted_at.is_(None),
        )
        .order_by(QuestionORM.position)
        .all()
    )


def _get_stable_ids_with_responses(
    db: Session,
    survey_id: uuid.UUID,
    filters: DashboardFilterParams,
) -> set[uuid.UUID]:
    """Return all stable_question_ids that have at least one answer in the filter window."""
    fr_sq = _build_filtered_responses_subquery(db, survey_id, filters)
    rows = db.execute(
        select(distinct(QuestionORM.stable_question_id))
        .select_from(SurveyResponseAnswerORM)
        .join(fr_sq, fr_sq.c.id == SurveyResponseAnswerORM.survey_response_id)
        .join(QuestionORM, QuestionORM.stable_question_id == SurveyResponseAnswerORM.question_id)
        .where(
            SurveyResponseAnswerORM.deleted_at.is_(None),
            QuestionORM.deleted_at.is_(None),
        )
    ).fetchall()
    return {row[0] for row in rows}


def _resolve_date_range(
    filters: DashboardFilterParams, user_tz: ZoneInfo
) -> tuple[datetime, datetime]:
    if filters.date_start is not None and filters.date_end is not None:
        return filters.date_start, filters.date_end

    end_d = datetime.now(user_tz).date()
    start_d = end_d - timedelta(days=_DEFAULT_DATE_RANGE_DAYS)
    utc_lo, utc_hi = inclusive_local_date_range_to_utc_bounds(start_d, end_d, user_tz)
    return naive_utc_for_sql(utc_lo), naive_utc_for_sql(utc_hi)


def _build_filtered_responses_subquery(
    db: Session,
    survey_id: uuid.UUID,
    filters: DashboardFilterParams,
):
    """Build a subquery of response IDs matching the survey + filters."""
    stmt = (
        select(
            SurveyResponseORM.id,
            SurveyResponseORM.completion_datetime,
        )
        .join(
            SurveyVersionORM,
            SurveyVersionORM.id == SurveyResponseORM.survey_version_id,
        )
        .join(SurveyORM, SurveyORM.id == SurveyVersionORM.survey_id)
        .join(QRCodeORM, QRCodeORM.id == SurveyResponseORM.qr_code_id)
        .outerjoin(
            LocationSnapshotORM,
            LocationSnapshotORM.id == SurveyResponseORM.location_snapshot_id,
        )
        .outerjoin(LocationORM, LocationORM.id == LocationSnapshotORM.location_id)
        .where(
            SurveyVersionORM.survey_id == survey_id,
            SurveyResponseORM.deleted_at.is_(None),
            SurveyResponseORM.completion_datetime >= filters.date_start,
            SurveyResponseORM.completion_datetime < filters.date_end,
        )
    )
    if not filters.include_archived:
        stmt = stmt.where(
            QRCodeORM.archived_at.is_(None),
            or_(LocationSnapshotORM.location_id.is_(None), LocationORM.archived_at.is_(None)),
            SurveyORM.status != SurveyStatus.archived,
        )
    if filters.qr_code_ids is not None:
        stmt = stmt.where(SurveyResponseORM.qr_code_id.in_(filters.qr_code_ids))
    if filters.location_ids is not None:
        stmt = stmt.where(LocationSnapshotORM.location_id.in_(filters.location_ids))
    return stmt.subquery()


def _build_answer_base_subquery(
    fr_sq,
    target_stable_ids: list[uuid.UUID],
    question_orm_ids: list[uuid.UUID],
    user_tz: ZoneInfo,
):
    """Build answer_base subquery from a filtered_responses subquery.

    survey_response_answers.question_id stores stable_question_id (not questions.id).
    We join QuestionORM on stable_question_id and constrain to the specific ORM
    row IDs from question_meta to avoid duplicating rows across question versions.
    """
    response_date_col = user_local_date_sql(fr_sq.c.completion_datetime, user_tz).label("response_date")
    return (
        select(
            QuestionORM.stable_question_id,
            QuestionORM.question_type,
            response_date_col,
            SurveyResponseAnswerORM.numeric_value,
            SurveyResponseAnswerORM.text_value,
            fr_sq.c.id.label("response_id"),
        )
        .select_from(SurveyResponseAnswerORM)
        .join(fr_sq, fr_sq.c.id == SurveyResponseAnswerORM.survey_response_id)
        .join(
            QuestionORM,
            and_(
                QuestionORM.stable_question_id == SurveyResponseAnswerORM.question_id,
                QuestionORM.id.in_(question_orm_ids),
            ),
        )
        .where(
            SurveyResponseAnswerORM.deleted_at.is_(None),
            QuestionORM.deleted_at.is_(None),
            QuestionORM.stable_question_id.in_(target_stable_ids),
        )
    ).subquery()



def _execute_aggregations(
    db: Session,
    target_stable_ids: list[uuid.UUID],
    question_meta: dict[uuid.UUID, QuestionORM],
    filters: DashboardFilterParams,
    survey_id: uuid.UUID,
    user_tz: ZoneInfo,
) -> list[QuestionAggregation]:
    if not target_stable_ids:
        return []

    question_orm_ids = [q.id for q in question_meta.values()]
    fr_sq = _build_filtered_responses_subquery(db, survey_id, filters)
    ab_sq = _build_answer_base_subquery(fr_sq, target_stable_ids, question_orm_ids, user_tz)

    # Total responses per stable_question_id (distinct response_ids)
    total_rows = db.execute(
        select(
            ab_sq.c.stable_question_id,
            func.count(distinct(ab_sq.c.response_id)).label("total"),
        ).group_by(ab_sq.c.stable_question_id)
    ).fetchall()
    totals: dict[uuid.UUID, int] = {row.stable_question_id: row.total for row in total_rows}

    # 1. Numeric aggregation (star, nps)
    numeric_types = [t for t in _NUMERIC_TYPES]
    numeric_rows = db.execute(
        select(
            ab_sq.c.stable_question_id,
            ab_sq.c.response_date,
            func.count().label("answer_count"),
            func.avg(ab_sq.c.numeric_value).label("avg_value"),
            func.sum(case((ab_sq.c.numeric_value == 1, 1), else_=0)).label("c1"),
            func.sum(case((ab_sq.c.numeric_value == 2, 1), else_=0)).label("c2"),
            func.sum(case((ab_sq.c.numeric_value == 3, 1), else_=0)).label("c3"),
            func.sum(case((ab_sq.c.numeric_value == 4, 1), else_=0)).label("c4"),
            func.sum(case((ab_sq.c.numeric_value == 5, 1), else_=0)).label("c5"),
        )
        .where(ab_sq.c.question_type.in_(numeric_types))
        .group_by(ab_sq.c.stable_question_id, ab_sq.c.response_date)
        .order_by(ab_sq.c.stable_question_id, ab_sq.c.response_date)
    ).fetchall()
    numeric_by_sq: dict[uuid.UUID, list] = defaultdict(list)
    for row in numeric_rows:
        numeric_by_sq[row.stable_question_id].append(row)

    # 2. Sentiment aggregation (text, long_text via ai_analysis)
    text_types = list(_TEXT_TYPES)
    sentiment_rows = db.execute(
        select(
            ab_sq.c.stable_question_id,
            ab_sq.c.response_date,
            func.count().label("total"),
            func.sum(
                case((AIAnalysisORM.sentiment == "positive", 1), else_=0)
            ).label("pos"),
            func.sum(
                case((AIAnalysisORM.sentiment == "neutral", 1), else_=0)
            ).label("neu"),
            func.sum(
                case((AIAnalysisORM.sentiment == "negative", 1), else_=0)
            ).label("neg"),
        )
        .select_from(ab_sq)
        .outerjoin(
            AIAnalysisORM,
            and_(
                AIAnalysisORM.survey_response_id == ab_sq.c.response_id,
                AIAnalysisORM.question_id == ab_sq.c.stable_question_id,
                AIAnalysisORM.deleted_at.is_(None),
            ),
        )
        .where(ab_sq.c.question_type.in_(text_types))
        .group_by(ab_sq.c.stable_question_id, ab_sq.c.response_date)
        .order_by(ab_sq.c.stable_question_id, ab_sq.c.response_date)
    ).fetchall()
    sentiment_by_sq: dict[uuid.UUID, list] = defaultdict(list)
    for row in sentiment_rows:
        sentiment_by_sq[row.stable_question_id].append(row)

    # 3. Choice aggregation (multiple_choice, checkbox, yes_no)
    choice_types = list(_CHOICE_TYPES | {_YES_NO_TYPE})
    choice_rows = db.execute(
        select(
            ab_sq.c.stable_question_id,
            ab_sq.c.response_date,
            ab_sq.c.text_value.label("choice_value"),
            func.count().label("cnt"),
        )
        .where(ab_sq.c.question_type.in_(choice_types))
        .group_by(
            ab_sq.c.stable_question_id,
            ab_sq.c.response_date,
            ab_sq.c.text_value,
        )
        .order_by(ab_sq.c.stable_question_id, ab_sq.c.response_date)
    ).fetchall()
    choice_by_sq: dict[uuid.UUID, list] = defaultdict(list)
    for row in choice_rows:
        choice_by_sq[row.stable_question_id].append(row)

    # 4. Count aggregation (email, phone)
    count_types = list(_COUNT_TYPES)
    count_rows = db.execute(
        select(
            ab_sq.c.stable_question_id,
            ab_sq.c.response_date,
            func.count().label("answer_count"),
        )
        .where(ab_sq.c.question_type.in_(count_types))
        .group_by(ab_sq.c.stable_question_id, ab_sq.c.response_date)
        .order_by(ab_sq.c.stable_question_id, ab_sq.c.response_date)
    ).fetchall()
    count_by_sq: dict[uuid.UUID, list] = defaultdict(list)
    for row in count_rows:
        count_by_sq[row.stable_question_id].append(row)

    # 5. Photo counts
    photo_rows = db.execute(
        select(
            ab_sq.c.stable_question_id,
            func.count(distinct(SurveyResponsePhotoORM.id)).label("cnt"),
        )
        .select_from(ab_sq)
        .join(
            SurveyResponsePhotoORM,
            SurveyResponsePhotoORM.survey_response_id == ab_sq.c.response_id,
        )
        .where(ab_sq.c.question_type == _PHOTO_TYPE)
        .group_by(ab_sq.c.stable_question_id)
    ).fetchall()
    photo_by_sq: dict[uuid.UUID, int] = {
        row.stable_question_id: row.cnt for row in photo_rows
    }

    # 5b. Photo storage paths for gallery (last 10 per question, most recent first)
    photo_path_rows = db.execute(
        select(
            ab_sq.c.stable_question_id,
            SurveyResponsePhotoORM.storage_path,
            SurveyResponsePhotoORM.created_at,
        )
        .select_from(ab_sq)
        .join(
            SurveyResponsePhotoORM,
            SurveyResponsePhotoORM.survey_response_id == ab_sq.c.response_id,
        )
        .where(ab_sq.c.question_type == _PHOTO_TYPE)
        .order_by(ab_sq.c.stable_question_id, SurveyResponsePhotoORM.created_at.desc())
    ).fetchall()
    photo_paths_by_sq: dict[uuid.UUID, list[str]] = defaultdict(list)
    for row in photo_path_rows:
        paths = photo_paths_by_sq[row.stable_question_id]
        if len(paths) < 10:
            paths.append(row.storage_path)

    # Assemble results
    results: list[QuestionAggregation] = []
    for stable_id, meta in question_meta.items():
        total = totals.get(stable_id, 0)
        qtype = meta.question_type

        if qtype in _NUMERIC_TYPES:
            agg = _assemble_numeric(meta, numeric_by_sq[stable_id], total)
        elif qtype in _TEXT_TYPES:
            agg = _assemble_text(meta, sentiment_by_sq[stable_id], total)
        elif qtype in _CHOICE_TYPES:
            agg = _assemble_choice(meta, choice_by_sq[stable_id], total)
        elif qtype == _YES_NO_TYPE:
            agg = _assemble_yes_no(meta, choice_by_sq[stable_id], total)
        elif qtype in _COUNT_TYPES:
            agg = _assemble_count(meta, count_by_sq[stable_id], total)
        elif qtype == _PHOTO_TYPE:
            agg = _assemble_photo(meta, photo_by_sq.get(stable_id, 0), total, photo_paths_by_sq.get(stable_id, []))
        else:
            # Unknown type — emit minimal aggregation
            agg = QuestionAggregation(
                stable_question_id=stable_id,
                question_text=meta.question_text,
                question_type=qtype,
                config=meta.config,
                position=meta.position,
                total_responses=total,
            )
        results.append(agg)
    return results


# ── Assembly functions ────────────────────────────────────────────────────────

def _assemble_numeric(
    meta: QuestionORM, rows: list, total: int
) -> QuestionAggregation:
    """Handles star and nps question types."""
    daily: list[DailyNumericPoint] = []
    all_counts = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
    for row in rows:
        avg = float(row.avg_value) if row.avg_value is not None else None
        daily.append(
            DailyNumericPoint(date=row.response_date, avg_value=avg, count=row.answer_count)
        )
        all_counts["1"] += int(row.c1 or 0)
        all_counts["2"] += int(row.c2 or 0)
        all_counts["3"] += int(row.c3 or 0)
        all_counts["4"] += int(row.c4 or 0)
        all_counts["5"] += int(row.c5 or 0)

    if meta.question_type == "star":
        dist_total = sum(all_counts.values())
        return QuestionAggregation(
            stable_question_id=meta.stable_question_id,
            question_text=meta.question_text,
            question_type=meta.question_type,
            config=meta.config,
            position=meta.position,
            total_responses=total,
            rating_distribution=RatingDistribution(buckets=all_counts, total=dist_total),
            daily_avg=daily,
        )
    else:  # nps
        return QuestionAggregation(
            stable_question_id=meta.stable_question_id,
            question_text=meta.question_text,
            question_type=meta.question_type,
            config=meta.config,
            position=meta.position,
            total_responses=total,
            daily_nps_avg=daily,
        )


def _assemble_text(
    meta: QuestionORM, rows: list, total: int
) -> QuestionAggregation:
    """Handles text and long_text question types via AI sentiment."""
    daily: list[DailySentimentPoint] = []
    overall = {"positive": 0, "neutral": 0, "negative": 0}
    for row in rows:
        pos, neu, neg = int(row.pos or 0), int(row.neu or 0), int(row.neg or 0)
        daily.append(
            DailySentimentPoint(
                date=row.response_date,
                positive=pos,
                neutral=neu,
                negative=neg,
                total=int(row.total or 0),
            )
        )
        overall["positive"] += pos
        overall["neutral"] += neu
        overall["negative"] += neg

    dist_total = sum(overall.values())
    return QuestionAggregation(
        stable_question_id=meta.stable_question_id,
        question_text=meta.question_text,
        question_type=meta.question_type,
        config=meta.config,
        position=meta.position,
        total_responses=total,
        sentiment_distribution=SentimentDistribution(
            positive=overall["positive"],
            neutral=overall["neutral"],
            negative=overall["negative"],
            total=dist_total,
        ),
        daily_sentiment=daily,
    )


def _assemble_choice(
    meta: QuestionORM, rows: list, total: int
) -> QuestionAggregation:
    """Handles multiple_choice and checkbox question types."""
    is_checkbox = meta.question_type == "checkbox"
    overall: dict[str, int] = defaultdict(int)
    daily_map: dict[_date, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for row in rows:
        raw_key = row.choice_value or ""
        cnt = int(row.cnt or 0)

        if is_checkbox:
            # Checkbox values are stored as comma-separated strings (e.g. "opt1, opt2")
            # by the _to_text helper in survey_public.py — split to count each option.
            options = [o.strip() for o in raw_key.split(",") if o.strip()]
            for option in options:
                if option:
                    overall[option] += cnt
                    daily_map[row.response_date][option] += cnt
            # _total counts responses (not individual option selections)
            daily_map[row.response_date]["_total"] += cnt
        else:
            overall[raw_key] += cnt
            daily_map[row.response_date][raw_key] += cnt
            daily_map[row.response_date]["_total"] += cnt

    # Build daily distribution (% per option)
    daily: list[DailyDistributionPoint] = []
    for d in sorted(daily_map.keys()):
        day_data = daily_map[d]
        day_total = day_data.pop("_total", 0)
        dist = {
            k: round(v / day_total * 100, 1) if day_total > 0 else 0.0
            for k, v in day_data.items()
        }
        daily.append(DailyDistributionPoint(date=d, distribution=dist, total=day_total))

    return QuestionAggregation(
        stable_question_id=meta.stable_question_id,
        question_text=meta.question_text,
        question_type=meta.question_type,
        config=meta.config,
        position=meta.position,
        total_responses=total,
        choice_distribution=ChoiceDistribution(
            buckets=dict(overall), total=sum(overall.values())
        ),
        daily_choices=daily,
    )


def _assemble_yes_no(
    meta: QuestionORM, rows: list, total: int
) -> QuestionAggregation:
    """Handles yes_no question type."""
    overall: dict[str, int] = defaultdict(int)
    # {date: (yes_count, total_count)}
    daily_map: dict[_date, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for row in rows:
        key = (row.choice_value or "").lower()
        cnt = int(row.cnt or 0)
        overall[key] += cnt
        daily_map[row.response_date][key] += cnt
        daily_map[row.response_date]["_total"] += cnt

    # Daily % yes
    daily: list[DailyNumericPoint] = []
    for d in sorted(daily_map.keys()):
        day_data = daily_map[d]
        day_total = day_data.get("_total", 0)
        yes_count = day_data.get("yes", 0)
        pct_yes = round(yes_count / day_total * 100, 1) if day_total > 0 else None
        daily.append(DailyNumericPoint(date=d, avg_value=pct_yes, count=day_total))

    return QuestionAggregation(
        stable_question_id=meta.stable_question_id,
        question_text=meta.question_text,
        question_type=meta.question_type,
        config=meta.config,
        position=meta.position,
        total_responses=total,
        yes_no_distribution=ChoiceDistribution(
            buckets=dict(overall), total=sum(overall.values())
        ),
        daily_yes_pct=daily,
    )


def _assemble_count(
    meta: QuestionORM, rows: list, total: int
) -> QuestionAggregation:
    """Handles email and phone question types (count over time)."""
    daily: list[DailyNumericPoint] = [
        DailyNumericPoint(
            date=row.response_date,
            avg_value=None,
            count=int(row.answer_count or 0),
        )
        for row in rows
    ]
    return QuestionAggregation(
        stable_question_id=meta.stable_question_id,
        question_text=meta.question_text,
        question_type=meta.question_type,
        config=meta.config,
        position=meta.position,
        total_responses=total,
        daily_count=daily,
    )


def _assemble_photo(
    meta: QuestionORM,
    photo_count: int,
    total: int,
    storage_paths: list[str] | None = None,
) -> QuestionAggregation:
    """Handles photo question type."""
    return QuestionAggregation(
        stable_question_id=meta.stable_question_id,
        question_text=meta.question_text,
        question_type=meta.question_type,
        config=meta.config,
        position=meta.position,
        total_responses=total,
        photo_count=photo_count,
        photo_urls=storage_paths or [],
    )


def _attach_photo_signed_urls(questions: list[QuestionAggregation]) -> None:
    """Replace storage paths in photo questions with signed URLs (best-effort)."""
    photo_questions = [
        q for q in questions if q.question_type == _PHOTO_TYPE and q.photo_urls
    ]
    if not photo_questions:
        return
    try:
        client = get_supabase_service_client()
    except Exception:
        logger.warning("Supabase client unavailable; photo signed URLs will not be generated")
        for q in photo_questions:
            q.photo_urls = []
        return
    for q in photo_questions:
        signed_urls: list[str] = []
        for path in (q.photo_urls or []):
            try:
                signed_urls.append(
                    generate_photo_signed_url(client=client, storage_path=path, expires_in=3600)
                )
            except Exception:
                logger.warning("Failed to generate signed URL for photo path %s; skipping", path)
        q.photo_urls = signed_urls
