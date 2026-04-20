"""
Analytics query service.
All queries are company-scoped at the DB level.
No route logic lives here – only data access.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, TYPE_CHECKING
from zoneinfo import ZoneInfo

if TYPE_CHECKING:
    from ..schemas.pydantic_model import AdvancedFilterPayload

from ..core.datetime_user_tz import (
    inclusive_local_date_range_to_utc_bounds,
    local_date_start_utc,
    naive_utc_for_sql,
    to_iso8601_zoned,
)

from sqlalchemy import func, case, literal_column, and_, or_
from sqlalchemy.dialects.postgresql import array as pg_array
from sqlalchemy.orm import Session

from ..models.postgres_model import (
    AIAnalysis as AIAnalysisORM,
    Company as CompanyORM,
    Location as LocationORM,
    LocationSnapshot as LocationSnapshotORM,
    Membership as MembershipORM,
    QRCode as QRCodeORM,
    Question as QuestionORM,
    ResponseRead as ResponseReadORM,
    ScanEvent as ScanEventORM,
    Survey as SurveyORM,
    SurveyResponse as SurveyResponseORM,
    SurveyResponseAnswer as SurveyResponseAnswerORM,
    SurveyResponsePhoto as SurveyResponsePhotoORM,
    SurveySession as SurveySessionORM,
    SurveyVersion as SurveyVersionORM,
)
from ..auth.viewer_scoping import survey_ids_subquery, location_ids_subquery, assert_survey_access
from ..schemas.pydantic_model import (
    AdvancedFilterPayload,
    AnalyticsAnswerDetail,
    AnalyticsFilterOption,
    AnalyticsFiltersResponse,
    AnalyticsResponseDetail,
    AnalyticsResponseList,
    AnalyticsResponseRow,
)
from ..core.cache import cache_delete, cache_delete_pattern
from ..core.errors.app_error import AppError
from ..core.errors.error_category import ErrorCategory
from ..core.errors.exceptions import NotFoundError, PermissionError, ValidationError
from ..services.flow_service import list_flow_runs_for_response

_VALID_SORT_COLUMNS = {
    "scan_time", "time_to_complete", "questions_answered",
    "survey_name", "qr_code_name",
}


def _parse_analytics_filter_date(s: str | None) -> date | None:
    if not s or not str(s).strip():
        return None
    t = str(s).strip()
    if len(t) >= 10:
        t = t[:10]
    try:
        return date.fromisoformat(t)
    except ValueError as e:
        raise ValidationError(
            code="INVALID_DATE",
            message="date_start and date_end must be YYYY-MM-DD",
        ) from e


def get_unread_response_count(*, membership: MembershipORM, db: Session) -> int:
    """Return unread completed survey responses for the current user."""
    user_id = membership.user_id
    survey_sq = survey_ids_subquery(membership, db)
    is_viewer = membership.role == "viewer"

    read_ids_subq = (
        db.query(ResponseReadORM.response_id).filter(
            ResponseReadORM.user_id == user_id,
            ResponseReadORM.deleted_at.is_(None),
        )
    )
    q = (
        db.query(func.count(SurveyResponseORM.id))
        .join(SurveySessionORM, SurveySessionORM.id == SurveyResponseORM.session_id)
        .filter(
            SurveySessionORM.company_id == membership.company_id,
            SurveySessionORM.deleted_at.is_(None),
            SurveyResponseORM.deleted_at.is_(None),
        )
        .filter(SurveyResponseORM.id.notin_(read_ids_subq))
    )
    if survey_sq is not None or is_viewer:
        q = q.join(SurveyVersionORM, SurveyVersionORM.id == SurveyResponseORM.survey_version_id)
        if survey_sq is not None:
            q = q.filter(SurveyVersionORM.survey_id.in_(survey_sq))
        if is_viewer:
            q = q.join(SurveyORM, SurveyORM.id == SurveyVersionORM.survey_id)
            q = q.filter(SurveyORM.status == "active", SurveyORM.deleted_at.is_(None))
    unread_count = q.scalar()
    return int(unread_count or 0)


def has_unread_responses(*, membership: MembershipORM, db: Session) -> bool:
    """Return True if the user has any unread survey responses they haven't read."""
    return get_unread_response_count(membership=membership, db=db) > 0


_MAX_NOTIFICATION_LOOKBACK_MINUTES = 10
_MAX_NOTIFICATION_RESULTS = 20


def get_new_responses_since(
    *, membership: MembershipORM, db: Session, since: datetime, limit: int = _MAX_NOTIFICATION_RESULTS
) -> list[dict]:
    """Return responses submitted after `since` for the company, for toast notifications.

    Clamps `since` to at most 10 minutes ago to prevent full-history scans.
    Respects viewer survey/location scoping.
    """
    from ..models.postgres_model import LocationSnapshot as LocationSnapshotORM

    min_since = datetime.utcnow() - timedelta(minutes=_MAX_NOTIFICATION_LOOKBACK_MINUTES)
    if since < min_since:
        since = min_since

    q = (
        db.query(
            SurveyResponseORM.id.label("response_id"),
            SurveyORM.name.label("survey_name"),
            LocationSnapshotORM.name.label("location_name"),
            QRCodeORM.title.label("qr_code_title"),
            SurveyResponseORM.completion_datetime.label("submitted_at"),
        )
        .join(SurveySessionORM, SurveySessionORM.id == SurveyResponseORM.session_id)
        .join(SurveyVersionORM, SurveyVersionORM.id == SurveySessionORM.survey_version_id)
        .join(SurveyORM, SurveyORM.id == SurveyVersionORM.survey_id)
        .join(QRCodeORM, QRCodeORM.id == SurveyResponseORM.qr_code_id)
        .outerjoin(
            LocationSnapshotORM,
            LocationSnapshotORM.id == SurveySessionORM.location_snapshot_id,
        )
        .filter(
            SurveySessionORM.company_id == membership.company_id,
            SurveyResponseORM.completion_datetime > since,
            SurveyResponseORM.deleted_at.is_(None),
            SurveySessionORM.deleted_at.is_(None),
            SurveyVersionORM.deleted_at.is_(None),
            SurveyORM.deleted_at.is_(None),
        )
    )

    survey_sq = survey_ids_subquery(membership, db)
    if survey_sq is not None:
        q = q.filter(SurveyORM.id.in_(survey_sq))

    if membership.role == "viewer":
        q = q.filter(SurveyORM.status == "active")

    rows = (
        q.order_by(SurveyResponseORM.completion_datetime.asc())
        .limit(limit)
        .all()
    )

    return [
        {
            "response_id": str(row.response_id),
            "survey_name": row.survey_name,
            "location_name": row.location_name or "Unknown location",
            "qr_code_title": row.qr_code_title,
            "submitted_at": row.submitted_at,
        }
        for row in rows
    ]


_NUMERIC_OPS = {"lt", "lte", "eq", "gte", "gt"}


def _build_advanced_filter_clause(
    payload: AdvancedFilterPayload,
    db: Session,
    response_id_col: Any,
) -> Any | None:
    """Build a correlated SQLAlchemy WHERE clause for advanced question-based filtering.

    Each condition becomes an EXISTS subquery against survey_response_answers or
    ai_analysis, correlated on response_id_col (SurveyResponseORM.id).

    Returns None when the payload carries no conditions (no additional filtering).
    Raises ValidationError for malformed UUIDs or unsupported operators.
    """
    if not payload.conditions:
        return None

    group_operator_map: dict[str, str] = {g.local_id: g.operator for g in payload.groups}

    grouped: dict[str, list] = {}
    top_standalone: list = []
    for cond in payload.conditions:
        if cond.group_local_id is None:
            top_standalone.append(cond)
        else:
            grouped.setdefault(cond.group_local_id, []).append(cond)

    def cond_to_exists(cond: Any) -> Any | None:
        try:
            q_uuid = uuid.UUID(cond.question_id)
        except (ValueError, AttributeError):
            raise ValidationError(
                code="INVALID_QUESTION_ID",
                message=f"Invalid question_id UUID in advanced filter: {cond.question_id!r}",
            )

        ct = cond.condition_type

        if ct == "not_empty":
            return (
                db.query(SurveyResponseAnswerORM.id)
                .filter(
                    SurveyResponseAnswerORM.survey_response_id == response_id_col,
                    SurveyResponseAnswerORM.question_id == q_uuid,
                    SurveyResponseAnswerORM.deleted_at.is_(None),
                )
                .exists()
            )

        if ct == "sentiment":
            if not isinstance(cond.value, str) or not cond.value:
                raise ValidationError(
                    code="INVALID_CONDITION_VALUE",
                    message="Sentiment condition requires a string value (positive/neutral/negative)",
                )
            return (
                db.query(AIAnalysisORM.id)
                .filter(
                    AIAnalysisORM.survey_response_id == response_id_col,
                    AIAnalysisORM.question_id == q_uuid,
                    AIAnalysisORM.deleted_at.is_(None),
                    AIAnalysisORM.sentiment == cond.value.strip().lower(),
                )
                .exists()
            )

        if ct in ("rating", "nps"):
            if cond.operator not in _NUMERIC_OPS:
                raise ValidationError(
                    code="INVALID_OPERATOR",
                    message=f"Numeric condition requires one of: {sorted(_NUMERIC_OPS)}",
                )
            try:
                num_val = Decimal(str(cond.value))
            except Exception:
                raise ValidationError(
                    code="INVALID_CONDITION_VALUE",
                    message="Numeric condition value must be a number",
                )
            num_col = SurveyResponseAnswerORM.numeric_value
            op = cond.operator
            if op == "lt":
                num_filter = num_col < num_val
            elif op == "lte":
                num_filter = num_col <= num_val
            elif op == "eq":
                num_filter = num_col == num_val
            elif op == "gte":
                num_filter = num_col >= num_val
            else:  # gt
                num_filter = num_col > num_val
            return (
                db.query(SurveyResponseAnswerORM.id)
                .filter(
                    SurveyResponseAnswerORM.survey_response_id == response_id_col,
                    SurveyResponseAnswerORM.question_id == q_uuid,
                    SurveyResponseAnswerORM.deleted_at.is_(None),
                    num_filter,
                )
                .exists()
            )

        if ct in ("multiple_choice", "yes_no"):
            if not isinstance(cond.value, str) or not cond.value:
                raise ValidationError(
                    code="INVALID_CONDITION_VALUE",
                    message=f"{ct} condition requires a string value",
                )
            return (
                db.query(SurveyResponseAnswerORM.id)
                .filter(
                    SurveyResponseAnswerORM.survey_response_id == response_id_col,
                    SurveyResponseAnswerORM.question_id == q_uuid,
                    SurveyResponseAnswerORM.deleted_at.is_(None),
                    SurveyResponseAnswerORM.text_value == cond.value,
                )
                .exists()
            )

        if ct == "checkbox":
            # Checkbox answers are stored as ", ".join(selected_options) in a single text_value row.
            # Use PostgreSQL string_to_array + @> (contains all) for "all of" semantics.
            values = cond.value if isinstance(cond.value, list) else ([cond.value] if cond.value else [])
            values = [v for v in values if v]
            if not values:
                raise ValidationError(
                    code="INVALID_CONDITION_VALUE",
                    message="Checkbox condition requires at least one value",
                )
            arr_col = func.string_to_array(SurveyResponseAnswerORM.text_value, ", ")
            contains_all = arr_col.op("@>")(pg_array(values))
            return (
                db.query(SurveyResponseAnswerORM.id)
                .filter(
                    SurveyResponseAnswerORM.survey_response_id == response_id_col,
                    SurveyResponseAnswerORM.question_id == q_uuid,
                    SurveyResponseAnswerORM.deleted_at.is_(None),
                    contains_all,
                )
                .exists()
            )

        raise ValidationError(
            code="INVALID_CONDITION_TYPE",
            message=f"Unknown condition type in advanced filter: {ct!r}",
        )

    # Build top-level clause elements
    top_clauses: list[Any] = []

    for cond in top_standalone:
        ex = cond_to_exists(cond)
        if ex is not None:
            top_clauses.append(ex)

    for group_local_id, group_conds in grouped.items():
        group_op = group_operator_map.get(group_local_id, "AND")
        group_clauses = [ex for cond in group_conds if (ex := cond_to_exists(cond)) is not None]
        if not group_clauses:
            continue
        top_clauses.append(or_(*group_clauses) if group_op == "OR" else and_(*group_clauses))

    if not top_clauses:
        return None

    return or_(*top_clauses) if payload.operator == "OR" else and_(*top_clauses)


def get_analytics_responses(
    *,
    membership: MembershipORM,
    db: Session,
    user_tz: ZoneInfo,
    page: int = 1,
    page_size: int = 100,
    survey_id: str | None = None,
    qr_code_id: str | None = None,
    location_id: str | None = None,
    completed: bool | None = None,
    date_start: str | None = None,
    date_end: str | None = None,
    sort_column: str = "scan_time",
    sort_direction: str = "desc",
    no_location: bool = False,
    advanced_filter: AdvancedFilterPayload | None = None,
) -> AnalyticsResponseList:
    user_id = membership.user_id

    if page < 1:
        raise ValidationError(code="INVALID_PAGE", message="page must be >= 1")
    if not 1 <= page_size <= 500:
        raise ValidationError(code="INVALID_PAGE_SIZE", message="page_size must be between 1 and 500")
    if sort_column not in _VALID_SORT_COLUMNS:
        raise ValidationError(
            code="INVALID_SORT_COLUMN",
            message=f"Invalid sort_column. Valid: {sorted(_VALID_SORT_COLUMNS)}",
        )
    if sort_direction not in ("asc", "desc"):
        raise ValidationError(code="INVALID_SORT_DIRECTION", message="sort_direction must be 'asc' or 'desc'")

    # ------------------------------------------------------------------
    # Answer count sub-query (avoid N+1): count per session
    # ------------------------------------------------------------------
    answer_count_sq = (
        db.query(
            SurveyResponseORM.session_id.label("session_id"),
            func.count(SurveyResponseAnswerORM.id).label("answer_count"),
        )
        .outerjoin(
            SurveyResponseAnswerORM,
            SurveyResponseAnswerORM.survey_response_id == SurveyResponseORM.id,
        )
        .filter(
            SurveyResponseORM.deleted_at.is_(None),
            or_(
                SurveyResponseAnswerORM.id.is_(None),
                SurveyResponseAnswerORM.deleted_at.is_(None),
            ),
        )
        .group_by(SurveyResponseORM.session_id)
        .subquery()
    )

    # ------------------------------------------------------------------
    # Base query – always company-scoped
    # ------------------------------------------------------------------
    q = (
        db.query(
            SurveySessionORM.id.label("session_id"),
            SurveySessionORM.start_time.label("scan_time"),
            SurveySessionORM.time_taken_seconds
            if hasattr(SurveySessionORM, "time_taken_seconds")
            else literal_column("NULL").label("time_taken_seconds"),
            SurveyORM.name.label("survey_name"),
            QRCodeORM.title.label("qr_code_name"),
            LocationSnapshotORM.name.label("location_name"),
            LocationSnapshotORM.location_id.label("snap_location_id"),
            # completed = session has a survey_response row
            case(
                (SurveyResponseORM.id.isnot(None), True),
                else_=False,
            ).label("completed"),
            SurveyResponseORM.time_taken_seconds.label("time_to_complete"),
            SurveyResponseORM.id.label("response_id"),
            SurveyResponseORM.survey_version_id.label("survey_version_id"),
            func.coalesce(answer_count_sq.c.answer_count, 0).label("questions_answered"),
        )
        .filter(SurveySessionORM.company_id == membership.company_id)
        .filter(
            SurveySessionORM.deleted_at.is_(None),
            QRCodeORM.deleted_at.is_(None),
            SurveyVersionORM.deleted_at.is_(None),
            SurveyORM.deleted_at.is_(None),
            or_(LocationSnapshotORM.id.is_(None), LocationSnapshotORM.deleted_at.is_(None)),
            or_(SurveyResponseORM.id.is_(None), SurveyResponseORM.deleted_at.is_(None)),
        )
        .join(QRCodeORM, QRCodeORM.id == SurveySessionORM.qr_code_id)
        .join(SurveyVersionORM, SurveyVersionORM.id == SurveySessionORM.survey_version_id)
        .join(SurveyORM, SurveyORM.id == SurveyVersionORM.survey_id)
        .outerjoin(
            LocationSnapshotORM,
            LocationSnapshotORM.id == SurveySessionORM.location_snapshot_id,
        )
        .outerjoin(
            SurveyResponseORM,
            SurveyResponseORM.session_id == SurveySessionORM.id,
        )
        .outerjoin(
            answer_count_sq,
            answer_count_sq.c.session_id == SurveySessionORM.id,
        )
    )

    # ------------------------------------------------------------------
    # Viewer scoping — restrict to permitted surveys / locations
    # ------------------------------------------------------------------
    _survey_sq = survey_ids_subquery(membership, db)
    if _survey_sq is not None:
        q = q.filter(SurveyORM.id.in_(_survey_sq))

    _location_sq = location_ids_subquery(membership, db)
    if _location_sq is not None:
        q = q.filter(LocationSnapshotORM.location_id.in_(_location_sq))

    if membership.role == "viewer":
        q = q.filter(SurveyORM.status == "active")
        q = q.outerjoin(LocationORM, LocationORM.id == LocationSnapshotORM.location_id)
        q = q.filter(or_(LocationSnapshotORM.location_id.is_(None), LocationORM.is_active == True))

    # ------------------------------------------------------------------
    # Optional filters (all AND logic, all company-scoped already)
    # ------------------------------------------------------------------
    if survey_id:
        try:
            sid = uuid.UUID(survey_id)
        except ValueError:
            raise ValidationError(code="INVALID_SURVEY_ID", message="Invalid survey_id UUID")
        q = q.filter(SurveyORM.id == sid)

    if qr_code_id:
        try:
            qid = uuid.UUID(qr_code_id)
        except ValueError:
            raise ValidationError(code="INVALID_QR_CODE_ID", message="Invalid qr_code_id UUID")
        q = q.filter(SurveySessionORM.qr_code_id == qid)

    if location_id == "__none__" or no_location:
        q = q.filter(SurveySessionORM.location_snapshot_id.is_(None))
    elif location_id:
        try:
            lid = uuid.UUID(location_id)
        except ValueError:
            raise ValidationError(code="INVALID_LOCATION_ID", message="Invalid location_id UUID")
        q = q.filter(LocationSnapshotORM.location_id == lid)

    if completed is True:
        q = q.filter(SurveyResponseORM.id.isnot(None))
    elif completed is False:
        q = q.filter(SurveyResponseORM.id.is_(None))

    ds = _parse_analytics_filter_date(date_start)
    de = _parse_analytics_filter_date(date_end)
    if ds and de and ds > de:
        raise ValidationError(code="INVALID_DATE_RANGE", message="date_start must be before date_end")
    if ds is not None and de is not None:
        utc_lo, utc_hi_excl = inclusive_local_date_range_to_utc_bounds(ds, de, user_tz)
        q = q.filter(SurveySessionORM.start_time >= naive_utc_for_sql(utc_lo))
        q = q.filter(SurveySessionORM.start_time < naive_utc_for_sql(utc_hi_excl))
    elif ds is not None:
        q = q.filter(SurveySessionORM.start_time >= naive_utc_for_sql(local_date_start_utc(ds, user_tz)))
    elif de is not None:
        q = q.filter(
            SurveySessionORM.start_time
            < naive_utc_for_sql(local_date_start_utc(de + timedelta(days=1), user_tz))
        )

    # ------------------------------------------------------------------
    # Advanced filter — question-based conditions
    # ------------------------------------------------------------------
    if advanced_filter is not None:
        adv_clause = _build_advanced_filter_clause(advanced_filter, db, SurveyResponseORM.id)
        if adv_clause is not None:
            q = q.filter(adv_clause)

    # ------------------------------------------------------------------
    # Sorting
    # ------------------------------------------------------------------
    _col_map: dict[str, Any] = {
        "scan_time": SurveySessionORM.start_time,
        "time_to_complete": SurveyResponseORM.time_taken_seconds,
        "survey_name": SurveyORM.name,
        "qr_code_name": QRCodeORM.title,
        "questions_answered": answer_count_sq.c.answer_count,
    }
    sort_expr = _col_map[sort_column]
    if sort_direction == "desc":
        sort_expr = sort_expr.desc().nulls_last()
    else:
        sort_expr = sort_expr.asc().nulls_last()
    q = q.order_by(sort_expr)

    # ------------------------------------------------------------------
    # Count before pagination (reuse same filters)
    # ------------------------------------------------------------------
    total_count: int = q.count()

    # ------------------------------------------------------------------
    # Pagination
    # ------------------------------------------------------------------
    offset = (page - 1) * page_size
    rows = q.offset(offset).limit(page_size).all()

    # Fetch read status for completed responses in this page
    response_ids = [r.response_id for r in rows if r.response_id]
    read_response_ids: set[uuid.UUID] = set()
    if response_ids:
        read_rows = (
            db.query(ResponseReadORM.response_id)
            .filter(
                ResponseReadORM.user_id == user_id,
                ResponseReadORM.response_id.in_(response_ids),
                ResponseReadORM.deleted_at.is_(None),
            )
            .all()
        )
        read_response_ids = {r[0] for r in read_rows}

    result_rows = [
        AnalyticsResponseRow(
            response_id=r.response_id,
            session_id=r.session_id,
            survey_name=r.survey_name or "",
            qr_code_name=r.qr_code_name or "",
            location_name=r.location_name,
            scan_time=to_iso8601_zoned(r.scan_time, user_tz) or "",
            completed=bool(r.completed),
            time_to_complete_seconds=r.time_to_complete,
            questions_answered=int(r.questions_answered or 0),
            survey_version_id=r.survey_version_id,
            unread=bool(r.completed and r.response_id is not None and r.response_id not in read_response_ids),
        )
        for r in rows
    ]

    return AnalyticsResponseList(
        rows=result_rows,
        total_count=total_count,
        page=page,
        page_size=page_size,
    )


def mark_response_read(*, user_id: uuid.UUID, response_id: uuid.UUID, db: Session) -> None:
    """Record that the user has viewed this response's answers. Idempotent."""
    existing = (
        db.query(ResponseReadORM)
        .filter(
            ResponseReadORM.user_id == user_id,
            ResponseReadORM.response_id == response_id,
            ResponseReadORM.deleted_at.is_(None),
        )
        .first()
    )
    if not existing:
        db.add(ResponseReadORM(user_id=user_id, response_id=response_id))
        db.commit()


def get_analytics_filters(*, membership: MembershipORM, db: Session) -> AnalyticsFiltersResponse:
    survey_sq = survey_ids_subquery(membership, db)
    location_sq = location_ids_subquery(membership, db)
    is_viewer = membership.role == "viewer"

    survey_q = (
        db.query(SurveyORM.id, SurveyORM.name)
        .filter(
            SurveyORM.company_id == membership.company_id,
            SurveyORM.deleted_at.is_(None),
        )
    )
    if survey_sq is not None:
        survey_q = survey_q.filter(SurveyORM.id.in_(survey_sq))
    if is_viewer:
        survey_q = survey_q.filter(SurveyORM.status == "active")
    surveys = survey_q.order_by(SurveyORM.name).all()

    qr_codes = (
        db.query(QRCodeORM.id, QRCodeORM.title)
        .filter(
            QRCodeORM.company_id == membership.company_id,
            QRCodeORM.deleted_at.is_(None),
        )
        .order_by(QRCodeORM.title)
        .all()
    )

    location_q = (
        db.query(LocationORM.id, LocationORM.name)
        .filter(
            LocationORM.company_id == membership.company_id,
            LocationORM.deleted_at.is_(None),
        )
    )
    if location_sq is not None:
        location_q = location_q.filter(LocationORM.id.in_(location_sq))
    if is_viewer:
        location_q = location_q.filter(LocationORM.is_active == True)
    locations = location_q.order_by(LocationORM.name).all()

    return AnalyticsFiltersResponse(
        surveys=[AnalyticsFilterOption(id=r.id, name=r.name) for r in surveys],
        qr_codes=[AnalyticsFilterOption(id=r.id, name=r.title) for r in qr_codes],
        locations=[AnalyticsFilterOption(id=r.id, name=r.name) for r in locations],
    )


_ORPHAN_POSITION_BASE = 10_000


def _answer_value_from_norm_answer(a: SurveyResponseAnswerORM, *, has_photo: bool) -> str:
    """String value for display; preserves numeric 0 (Decimal(0) is falsy — do not use `or`)."""
    if has_photo:
        return "Photo uploaded"
    if a.text_value is not None:
        return str(a.text_value)
    if a.numeric_value is not None:
        return str(a.numeric_value)
    return ""


def get_response_detail(
    *,
    response_id: uuid.UUID,
    membership: MembershipORM,
    db: Session,
    user_tz: ZoneInfo,
) -> AnalyticsResponseDetail:
    user_id = membership.user_id

    # Verify company ownership via session
    resp = (
        db.query(SurveyResponseORM)
        .join(SurveySessionORM, SurveySessionORM.id == SurveyResponseORM.session_id)
        .filter(
            SurveyResponseORM.id == response_id,
            SurveySessionORM.company_id == membership.company_id,
            SurveyResponseORM.deleted_at.is_(None),
            SurveySessionORM.deleted_at.is_(None),
        )
        .first()
    )
    if not resp:
        raise NotFoundError(code="RESPONSE_NOT_FOUND", message="Response not found")

    # Mark as read when user views the answers
    mark_response_read(user_id=user_id, response_id=response_id, db=db)
    cache_delete(f"unread_count:{user_id}:{membership.company_id}")

    sv = (
        db.query(SurveyVersionORM)
        .filter(
            SurveyVersionORM.id == resp.survey_version_id,
            SurveyVersionORM.deleted_at.is_(None),
        )
        .first()
    )
    survey_name = ""
    if sv:
        s = (
            db.query(SurveyORM)
            .filter(
                SurveyORM.id == sv.survey_id,
                SurveyORM.deleted_at.is_(None),
            )
            .first()
        )
        survey_name = s.name if s else ""
        if membership.role == "viewer":
            assert_survey_access(membership, sv.survey_id, db)
            if not s or s.status != "active":
                raise NotFoundError(code="RESPONSE_NOT_FOUND", message="Response not found")

    # Build question lookup from normalized questions table
    questions = (
        db.query(QuestionORM)
        .filter(
            QuestionORM.survey_version_id == resp.survey_version_id,
            QuestionORM.deleted_at.is_(None),
        )
        .order_by(QuestionORM.position)
        .all()
    )
    # q_by_id is keyed by stable_question_id (what answer.question_id stores)
    q_by_id: dict[str, QuestionORM] = {str(q.stable_question_id): q for q in questions}
    q_by_key: dict[str, QuestionORM] = {q.question_key: q for q in questions}

    # Fetch normalized answers
    norm_answers = (
        db.query(SurveyResponseAnswerORM)
        .filter(
            SurveyResponseAnswerORM.survey_response_id == response_id,
            SurveyResponseAnswerORM.deleted_at.is_(None),
        )
        .all()
    )

    # Fetch photo metadata so we can flag photo answers in the detail response
    photo_rows = (
        db.query(SurveyResponsePhotoORM)
        .filter(
            SurveyResponsePhotoORM.survey_response_id == response_id,
        )
        .all()
    )
    # Map of question_id (str) -> True for questions that have a photo
    photo_question_ids: set[str] = {
        str(p.question_id) for p in photo_rows if p.question_id is not None
    }

    sentiment_rows = (
        db.query(AIAnalysisORM.question_id, AIAnalysisORM.sentiment)
        .filter(
            AIAnalysisORM.survey_response_id == response_id,
            AIAnalysisORM.deleted_at.is_(None),
        )
        .all()
    )
    sentiment_by_qid: dict[str, str] = {}
    for qid, sent in sentiment_rows:
        if qid is not None and sent:
            sentiment_by_qid[str(qid)] = sent

    answer_details: list[AnalyticsAnswerDetail] = []

    if norm_answers:
        answers_by_qid: dict[str, SurveyResponseAnswerORM] = {}
        for a in norm_answers:
            if a.question_id is not None:
                answers_by_qid[str(a.question_id)] = a

        consumed_qids: set[str] = set()
        for q in questions:
            sid = str(q.stable_question_id)
            if sid not in answers_by_qid:
                continue
            consumed_qids.add(sid)
            a = answers_by_qid[sid]
            has_photo = sid in photo_question_ids
            answer_details.append(
                AnalyticsAnswerDetail(
                    question_text=q.question_text,
                    answer_value=_answer_value_from_norm_answer(a, has_photo=has_photo),
                    has_photo=has_photo,
                    question_id=sid,
                    position=q.position,
                    question_type=q.question_type,
                    sentiment=sentiment_by_qid.get(sid),
                )
            )

        orphan_i = 0
        for a in norm_answers:
            q_id_str = str(a.question_id) if a.question_id else None
            if q_id_str and q_id_str in consumed_qids:
                continue
            orphan_i += 1
            pos = _ORPHAN_POSITION_BASE + orphan_i
            q_text = "Unknown question"
            q_type: str | None = None
            if q_id_str and q_id_str in q_by_id:
                oq = q_by_id[q_id_str]
                q_text = oq.question_text
                q_type = oq.question_type
            has_photo = q_id_str is not None and q_id_str in photo_question_ids
            answer_details.append(
                AnalyticsAnswerDetail(
                    question_text=q_text,
                    answer_value=_answer_value_from_norm_answer(a, has_photo=has_photo),
                    has_photo=has_photo,
                    question_id=q_id_str,
                    position=pos,
                    question_type=q_type,
                    sentiment=sentiment_by_qid.get(q_id_str) if q_id_str else None,
                )
            )
    else:
        # Fall back to JSONB answers field keyed by question id/key
        raw_answers: dict = resp.answers or {}
        consumed_raw_keys: set[str] = set()

        for q in questions:
            sid = str(q.stable_question_id)
            val = None
            if q.question_key in raw_answers:
                val = raw_answers[q.question_key]
                consumed_raw_keys.add(q.question_key)
            elif sid in raw_answers:
                val = raw_answers[sid]
                consumed_raw_keys.add(sid)
            else:
                continue

            has_photo = sid in photo_question_ids
            display = _format_answer(val)
            if has_photo:
                display = "Photo uploaded"
            answer_details.append(
                AnalyticsAnswerDetail(
                    question_text=q.question_text,
                    answer_value=display,
                    has_photo=has_photo,
                    question_id=sid,
                    position=q.position,
                    question_type=q.question_type,
                    sentiment=sentiment_by_qid.get(sid),
                )
            )

        orphan_i = 0
        for raw_key, val in raw_answers.items():
            if raw_key in consumed_raw_keys:
                continue
            orphan_i += 1
            pos = _ORPHAN_POSITION_BASE + orphan_i
            q_text = "Unknown question"
            q_type: str | None = None
            q_stable: str | None = None
            if raw_key in q_by_key:
                oq = q_by_key[raw_key]
                q_text = oq.question_text
                q_type = oq.question_type
                q_stable = str(oq.stable_question_id)
            elif raw_key in q_by_id:
                oq = q_by_id[raw_key]
                q_text = oq.question_text
                q_type = oq.question_type
                q_stable = raw_key

            has_photo = q_stable is not None and q_stable in photo_question_ids
            display = _format_answer(val)
            if has_photo:
                display = "Photo uploaded"
            answer_details.append(
                AnalyticsAnswerDetail(
                    question_text=q_text,
                    answer_value=display,
                    has_photo=has_photo,
                    question_id=q_stable,
                    position=pos,
                    question_type=q_type,
                    sentiment=sentiment_by_qid.get(q_stable) if q_stable else None,
                )
            )

    # Viewers may review answers but must not receive flow automation audit data.
    if membership.role in ("company_owner", "company_admin"):
        flow_run_payloads = list_flow_runs_for_response(db, membership.company_id, response_id, user_tz)
    else:
        flow_run_payloads = []

    return AnalyticsResponseDetail(
        response_id=resp.id,
        survey_name=survey_name,
        answers=answer_details,
        flow_runs=flow_run_payloads,
    )


def _format_answer(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, list):
        return ", ".join(str(v) for v in val)
    return str(val)


def delete_response(
    db: Session,
    response_id: uuid.UUID,
    membership: MembershipORM,
    confirmation: str,
) -> None:
    """Soft-delete a survey response and all its child records.

    Cascades deleted_at to: survey_response_answers, ai_analysis,
    response_reads, survey_response_photos.
    """
    if membership.role == "viewer":
        raise PermissionError(
            code="ACCESS_DENIED",
            message="Viewers cannot delete survey responses.",
        )

    if confirmation != "delete now":
        raise ValidationError(
            code="INVALID_CONFIRMATION",
            message="Confirmation text must be exactly 'delete now'.",
        )

    response = (
        db.query(SurveyResponseORM)
        .join(SurveySessionORM, SurveyResponseORM.session_id == SurveySessionORM.id)
        .filter(
            SurveyResponseORM.id == response_id,
            SurveySessionORM.company_id == membership.company_id,
            SurveyResponseORM.deleted_at.is_(None),
        )
        .first()
    )
    if not response:
        raise NotFoundError("Response", response_id)

    session = db.query(SurveySessionORM).filter(SurveySessionORM.id == response.session_id).first()

    now = datetime.utcnow()
    response.deleted_at = now

    child_targets: list[tuple[Any, Any]] = [
        (SurveyResponseAnswerORM, SurveyResponseAnswerORM.survey_response_id),
        (AIAnalysisORM, AIAnalysisORM.survey_response_id),
        (ResponseReadORM, ResponseReadORM.response_id),
        (SurveyResponsePhotoORM, SurveyResponsePhotoORM.survey_response_id),
    ]
    for model, fk_col in child_targets:
        db.query(model).filter(
            fk_col == response.id,
            model.deleted_at.is_(None),
        ).update({"deleted_at": now}, synchronize_session=False)

    if session:
        db.query(ScanEventORM).filter(
            ScanEventORM.id == session.scan_id,
            ScanEventORM.deleted_at.is_(None),
        ).update({"deleted_at": now}, synchronize_session=False)

    db.commit()
    cache_delete_pattern(f"unread_count:*:{membership.company_id}")
