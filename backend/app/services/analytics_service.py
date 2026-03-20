"""
Analytics query service.
All queries are company-scoped at the DB level.
No route logic lives here – only data access.
"""
from __future__ import annotations

import io
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, case, literal_column, and_, or_
from sqlalchemy.orm import Session

from ..models.postgres_model import (
    Company as CompanyORM,
    Location as LocationORM,
    LocationSnapshot as LocationSnapshotORM,
    QRCode as QRCodeORM,
    Question as QuestionORM,
    ResponseRead as ResponseReadORM,
    Survey as SurveyORM,
    SurveyResponse as SurveyResponseORM,
    SurveyResponseAnswer as SurveyResponseAnswerORM,
    SurveySession as SurveySessionORM,
    SurveyVersion as SurveyVersionORM,
)
from ..schemas.pydantic_model import (
    AnalyticsAnswerDetail,
    AnalyticsFilterOption,
    AnalyticsFiltersResponse,
    AnalyticsResponseDetail,
    AnalyticsResponseList,
    AnalyticsResponseRow,
)
from ..core.errors.app_error import AppError
from ..core.errors.error_category import ErrorCategory
from ..core.errors.exceptions import NotFoundError, PermissionError, ValidationError

_VALID_SORT_COLUMNS = {
    "scan_time", "time_to_complete", "questions_answered",
    "survey_name", "qr_code_name",
}


def _get_company_or_403(user_id: uuid.UUID, db: Session) -> CompanyORM:
    company = db.query(CompanyORM).filter(CompanyORM.owner_user_id == user_id).first()
    if not company:
        raise PermissionError(code="NO_COMPANY_FOR_USER", message="No company associated with this user")
    return company


def get_unread_response_count(*, user_id: uuid.UUID, db: Session) -> int:
    """Return unread completed survey responses for the current user."""
    company = _get_company_or_403(user_id, db)
    read_ids_subq = (
        db.query(ResponseReadORM.response_id).filter(ResponseReadORM.user_id == user_id)
    )
    unread_count = (
        db.query(func.count(SurveyResponseORM.id))
        .join(SurveySessionORM, SurveySessionORM.id == SurveyResponseORM.session_id)
        .filter(SurveySessionORM.company_id == company.id)
        .filter(SurveyResponseORM.completed.is_(True))
        .filter(SurveyResponseORM.id.notin_(read_ids_subq))
        .scalar()
    )
    return int(unread_count or 0)


def has_unread_responses(*, user_id: uuid.UUID, db: Session) -> bool:
    """Return True if the user has any unread survey responses they haven't read."""
    return get_unread_response_count(user_id=user_id, db=db) > 0


def get_analytics_responses(
    *,
    user_id: uuid.UUID,
    db: Session,
    page: int = 1,
    page_size: int = 100,
    survey_id: str | None = None,
    qr_code_id: str | None = None,
    location_id: str | None = None,
    completed: bool | None = None,
    date_start: datetime | None = None,
    date_end: datetime | None = None,
    sort_column: str = "scan_time",
    sort_direction: str = "desc",
    no_location: bool = False,
) -> AnalyticsResponseList:
    company = _get_company_or_403(user_id, db)

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
        .filter(SurveySessionORM.company_id == company.id)
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

    if date_start:
        q = q.filter(SurveySessionORM.start_time >= date_start)
    if date_end:
        q = q.filter(SurveySessionORM.start_time <= date_end)

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
            scan_time=r.scan_time.isoformat() if r.scan_time else "",
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
        )
        .first()
    )
    if not existing:
        db.add(ResponseReadORM(user_id=user_id, response_id=response_id))
        db.commit()


def get_analytics_filters(*, user_id: uuid.UUID, db: Session) -> AnalyticsFiltersResponse:
    company = _get_company_or_403(user_id, db)

    surveys = (
        db.query(SurveyORM.id, SurveyORM.name)
        .filter(SurveyORM.company_id == company.id)
        .order_by(SurveyORM.name)
        .all()
    )

    qr_codes = (
        db.query(QRCodeORM.id, QRCodeORM.title)
        .filter(QRCodeORM.company_id == company.id)
        .order_by(QRCodeORM.title)
        .all()
    )

    locations = (
        db.query(LocationORM.id, LocationORM.name)
        .filter(LocationORM.company_id == company.id)
        .order_by(LocationORM.name)
        .all()
    )

    return AnalyticsFiltersResponse(
        surveys=[AnalyticsFilterOption(id=r.id, name=r.name) for r in surveys],
        qr_codes=[AnalyticsFilterOption(id=r.id, name=r.title) for r in qr_codes],
        locations=[AnalyticsFilterOption(id=r.id, name=r.name) for r in locations],
    )


def get_response_detail(
    *, response_id: uuid.UUID, user_id: uuid.UUID, db: Session
) -> AnalyticsResponseDetail:
    company = _get_company_or_403(user_id, db)

    # Verify company ownership via session
    resp = (
        db.query(SurveyResponseORM)
        .join(SurveySessionORM, SurveySessionORM.id == SurveyResponseORM.session_id)
        .filter(
            SurveyResponseORM.id == response_id,
            SurveySessionORM.company_id == company.id,
        )
        .first()
    )
    if not resp:
        raise NotFoundError(code="RESPONSE_NOT_FOUND", message="Response not found")

    # Mark as read when user views the answers
    mark_response_read(user_id=user_id, response_id=response_id, db=db)

    sv = db.query(SurveyVersionORM).filter(SurveyVersionORM.id == resp.survey_version_id).first()
    survey_name = ""
    if sv:
        s = db.query(SurveyORM).filter(SurveyORM.id == sv.survey_id).first()
        survey_name = s.name if s else ""

    # Build question lookup from normalized questions table
    questions = (
        db.query(QuestionORM)
        .filter(QuestionORM.survey_version_id == resp.survey_version_id)
        .order_by(QuestionORM.position)
        .all()
    )
    q_by_id: dict[str, QuestionORM] = {str(q.id): q for q in questions}
    q_by_key: dict[str, QuestionORM] = {q.question_key: q for q in questions}

    # Fetch normalized answers
    norm_answers = (
        db.query(SurveyResponseAnswerORM)
        .filter(SurveyResponseAnswerORM.survey_response_id == response_id)
        .all()
    )

    answer_details: list[AnalyticsAnswerDetail] = []

    if norm_answers:
        for a in norm_answers:
            q_text = "Unknown question"
            if a.question_id and str(a.question_id) in q_by_id:
                q_text = q_by_id[str(a.question_id)].question_text
            val = str(a.text_value) if a.text_value is not None else str(a.numeric_value or "")
            answer_details.append(AnalyticsAnswerDetail(question_text=q_text, answer_value=val))
    else:
        # Fall back to JSONB answers field keyed by question id/key
        raw_answers: dict = resp.answers or {}
        for q_key, val in raw_answers.items():
            q_text = "Unknown question"
            if q_key in q_by_key:
                q_text = q_by_key[q_key].question_text
            elif q_key in q_by_id:
                q_text = q_by_id[q_key].question_text
            answer_details.append(
                AnalyticsAnswerDetail(question_text=q_text, answer_value=_format_answer(val))
            )

    return AnalyticsResponseDetail(
        response_id=resp.id,
        survey_name=survey_name,
        answers=answer_details,
    )


def _format_answer(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, list):
        return ", ".join(str(v) for v in val)
    return str(val)


def build_csv_bytes(rows: list[AnalyticsResponseRow]) -> bytes:
    import csv

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Response ID", "Survey", "QR Code", "Location",
        "Scan Time", "Completed", "Time to Complete (s)", "Questions Answered",
    ])
    for r in rows:
        writer.writerow([
            str(r.response_id) if r.response_id is not None else "",
            r.survey_name,
            r.qr_code_name,
            r.location_name or "No Location",
            r.scan_time,
            "Yes" if r.completed else "No",
            r.time_to_complete_seconds if r.time_to_complete_seconds is not None else "",
            r.questions_answered,
        ])
    return buf.getvalue().encode("utf-8-sig")


def build_excel_bytes(rows: list[AnalyticsResponseRow]) -> bytes:
    try:
        import openpyxl
    except ImportError:
        raise AppError(
            category=ErrorCategory.EXTERNAL,
            code="EXCEL_EXPORT_UNAVAILABLE",
            message="Excel export unavailable: openpyxl not installed",
            status_code=500,
        )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Analytics"

    headers = [
        "Response ID", "Survey", "QR Code", "Location",
        "Scan Time", "Completed", "Time to Complete (s)", "Questions Answered",
    ]
    ws.append(headers)

    for r in rows:
        ws.append([
            str(r.response_id) if r.response_id is not None else "",
            r.survey_name,
            r.qr_code_name,
            r.location_name or "No Location",
            r.scan_time,
            "Yes" if r.completed else "No",
            r.time_to_complete_seconds,
            r.questions_answered,
        ])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
