"""
Survey Dashboard aggregation service.
All aggregation is done server-side; no per-question queries in loops.
Queries are company-scoped and survey-scoped.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timedelta, date as _date

from sqlalchemy import select, func, case, distinct, and_, cast, Date
from sqlalchemy.orm import Session

from ..models.postgres_model import (
    AIAnalysis as AIAnalysisORM,
    LocationSnapshot as LocationSnapshotORM,
    Question as QuestionORM,
    Survey as SurveyORM,
    SurveyResponse as SurveyResponseORM,
    SurveyResponseAnswer as SurveyResponseAnswerORM,
    SurveyResponsePhoto as SurveyResponsePhotoORM,
    SurveyVersion as SurveyVersionORM,
)
from ..schemas.pydantic_model import (
    ChoiceDistribution,
    DailyDistributionPoint,
    DailyNumericPoint,
    DailySentimentPoint,
    DashboardFilterParams,
    OldQuestionsDashboardResponse,
    QuestionAggregation,
    RatingDistribution,
    SentimentDistribution,
    SurveyDashboardResponse,
)
from ..core.errors.exceptions import NotFoundError, PermissionError

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
) -> SurveyDashboardResponse:
    survey = _verify_survey_ownership(db, survey_id, company_id)
    date_start, date_end = _resolve_date_range(filters)
    active_questions = _get_active_questions(db, survey_id)
    if not active_questions:
        return SurveyDashboardResponse(
            survey_id=survey_id,
            survey_name=survey.name,
            date_start=date_start,
            date_end=date_end,
            questions=[],
        )
    question_meta: dict[uuid.UUID, QuestionORM] = {
        q.stable_question_id: q for q in active_questions
    }
    target_stable_ids = list(question_meta.keys())
    resolved_filters = DashboardFilterParams(
        location_ids=filters.location_ids,
        qr_code_ids=filters.qr_code_ids,
        date_start=date_start,
        date_end=date_end,
    )
    questions = _execute_aggregations(
        db, target_stable_ids, question_meta, resolved_filters, survey_id
    )
    questions.sort(key=lambda q: q.position)
    return SurveyDashboardResponse(
        survey_id=survey_id,
        survey_name=survey.name,
        date_start=date_start,
        date_end=date_end,
        questions=questions,
    )


def get_old_questions_dashboard_data(
    db: Session,
    survey_id: uuid.UUID,
    company_id: uuid.UUID,
    filters: DashboardFilterParams,
) -> OldQuestionsDashboardResponse:
    _verify_survey_ownership(db, survey_id, company_id)
    date_start, date_end = _resolve_date_range(filters)
    resolved_filters = DashboardFilterParams(
        location_ids=filters.location_ids,
        qr_code_ids=filters.qr_code_ids,
        date_start=date_start,
        date_end=date_end,
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
    )
    # Sort by most recently responded (question with highest stable_question_id last seen)
    questions.sort(key=lambda q: q.total_responses, reverse=True)
    return OldQuestionsDashboardResponse(survey_id=survey_id, questions=questions)


# ── Internal helpers ──────────────────────────────────────────────────────────

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


def _resolve_date_range(filters: DashboardFilterParams) -> tuple[datetime, datetime]:
    date_end = filters.date_end or datetime.utcnow()
    date_start = filters.date_start or (
        date_end - timedelta(days=_DEFAULT_DATE_RANGE_DAYS)
    )
    return date_start, date_end


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
        .outerjoin(
            LocationSnapshotORM,
            LocationSnapshotORM.id == SurveyResponseORM.location_snapshot_id,
        )
        .where(
            SurveyVersionORM.survey_id == survey_id,
            SurveyResponseORM.deleted_at.is_(None),
            SurveyResponseORM.completion_datetime >= filters.date_start,
            SurveyResponseORM.completion_datetime < filters.date_end,
        )
    )
    if filters.qr_code_ids:
        stmt = stmt.where(SurveyResponseORM.qr_code_id.in_(filters.qr_code_ids))
    if filters.location_ids:
        stmt = stmt.where(LocationSnapshotORM.location_id.in_(filters.location_ids))
    return stmt.subquery()


def _build_answer_base_subquery(
    fr_sq,
    target_stable_ids: list[uuid.UUID],
    question_orm_ids: list[uuid.UUID],
):
    """Build answer_base subquery from a filtered_responses subquery.

    survey_response_answers.question_id stores stable_question_id (not questions.id).
    We join QuestionORM on stable_question_id and constrain to the specific ORM
    row IDs from question_meta to avoid duplicating rows across question versions.
    """
    return (
        select(
            QuestionORM.stable_question_id,
            QuestionORM.question_type,
            cast(fr_sq.c.completion_datetime, Date).label("response_date"),
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
) -> list[QuestionAggregation]:
    if not target_stable_ids:
        return []

    question_orm_ids = [q.id for q in question_meta.values()]
    fr_sq = _build_filtered_responses_subquery(db, survey_id, filters)
    ab_sq = _build_answer_base_subquery(fr_sq, target_stable_ids, question_orm_ids)

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
            agg = _assemble_photo(meta, photo_by_sq.get(stable_id, 0), total)
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
    # Overall distribution
    overall: dict[str, int] = defaultdict(int)
    # Daily: {date: {choice: count, _total: int}}
    daily_map: dict[_date, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for row in rows:
        key = row.choice_value or ""
        cnt = int(row.cnt or 0)
        overall[key] += cnt
        daily_map[row.response_date][key] += cnt
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
    meta: QuestionORM, photo_count: int, total: int
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
    )
