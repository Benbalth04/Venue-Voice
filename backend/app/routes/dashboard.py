from datetime import datetime
from sqlalchemy import func
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends, Query

from ..auth.jwt import get_current_user
from ..db.postgres import get_db_connection
from ..models.postgres_model import (
    Company as CompanyORM,
    Location as LocationORM,
    QRCode as QRCodeORM,
    Response as ResponseORM,
    ScanEvent as ScanEventORM,
    Survey as SurveyORM,
    SurveyStatus,
    SurveyVersion as SurveyVersionORM,
    User as UserORM,
)
from ..schemas.pydantic_model import (
    DashboardData,
    DashboardLocationSummary,
    DashboardQRCodeSummary,
    DashboardResponseSummary,
    DashboardSurveySummary,
    DashboardTrendPoint,
)

router = APIRouter()


def _get_user_company(user: UserORM, db: Session) -> CompanyORM | None:
    return db.query(CompanyORM).filter(CompanyORM.owner_user_id == user.id).first()


@router.get("/dashboard", response_model=DashboardData)
def get_dashboard(
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Return dashboard data for the current user's company."""
    company = _get_user_company(user, db)
    if not company:
        return DashboardData(
            company_name="",
            user_display_name=f"{user.first_name} {user.last_name}".strip() or "User",
            total_submissions=0,
            total_scans=0,
            active_surveys_count=0,
            active_qr_codes_count=0,
            active_locations_count=0,
            submission_trend=[],
            scan_trend=[],
            active_surveys=[],
            active_qr_codes=[],
            active_locations=[],
        )

    # Survey IDs for this company
    survey_ids = [s.id for s in db.query(SurveyORM.id).filter(SurveyORM.company_id == company.id).all()]

    # Survey version IDs for these surveys
    sv_ids = (
        [r[0] for r in db.query(SurveyVersionORM.id).filter(SurveyVersionORM.survey_id.in_(survey_ids)).all()]
        if survey_ids
        else []
    )

    # Total submissions (responses for company's surveys)
    total_submissions = (
        db.query(func.count(ResponseORM.id)).filter(ResponseORM.survey_version_id.in_(sv_ids)).scalar()
        if sv_ids
        else 0
    ) or 0

    # Total scans (scan_events for QR codes belonging to company's surveys)
    qr_ids = [
        r[0]
        for r in db.query(QRCodeORM.id).filter(QRCodeORM.survey_id.in_(survey_ids)).all()
    ]
    total_scans = (
        db.query(func.count(ScanEventORM.id)).filter(ScanEventORM.qr_code_id.in_(qr_ids)).scalar()
        if qr_ids
        else 0
    )

    # Active surveys
    active_surveys_orm = (
        db.query(SurveyORM)
        .filter(SurveyORM.company_id == company.id, SurveyORM.status == SurveyStatus.active)
        .all()
    )
    active_surveys_count = len(active_surveys_orm)

    # Question count per survey (from survey_versions -> questions)
    from ..models.postgres_model import Question as QuestionORM

    def _question_count(survey_id):
        count = (
            db.query(func.count(QuestionORM.id))
            .join(SurveyVersionORM, QuestionORM.survey_version_id == SurveyVersionORM.id)
            .filter(SurveyVersionORM.survey_id == survey_id)
            .scalar()
        )
        return count or 0

    active_surveys = [
        DashboardSurveySummary(
            id=str(s.id),
            title=s.name,
            status=str(s.status.value),
            question_count=_question_count(s.id),
        )
        for s in active_surveys_orm
    ]

    # Active QR codes (with scan count)
    active_qr_orm = (
        db.query(QRCodeORM)
        .filter(QRCodeORM.survey_id.in_(survey_ids), QRCodeORM.active.is_(True))
        .all()
        if survey_ids
        else []
    )
    active_qr_codes_count = len(active_qr_orm)

    def _scan_count(qr_id):
        return (
            db.query(func.count(ScanEventORM.id)).filter(ScanEventORM.qr_code_id == qr_id).scalar()
            or 0
        )

    active_qr_codes = [
        DashboardQRCodeSummary(
            id=str(q.id),
            name=q.name,
            survey_id=str(q.survey_id),
            location_id=str(q.location_id) if q.location_id else None,
            active=q.active,
            scan_count=_scan_count(q.id),
        )
        for q in active_qr_orm
    ]

    # Active locations (all locations for company - no active flag in schema)
    locations_orm = db.query(LocationORM).filter(LocationORM.company_id == company.id).all()
    active_locations_count = len(locations_orm)
    active_locations = [
        DashboardLocationSummary(id=str(l.id), name=l.name) for l in locations_orm
    ]

    # Submission trend (by date)
    submission_trend_rows = (
        db.query(
            func.date(ResponseORM.submitted_at).label("day"),
            func.count(ResponseORM.id).label("cnt"),
        )
        .filter(ResponseORM.survey_version_id.in_(sv_ids))
        .group_by(func.date(ResponseORM.submitted_at))
        .order_by(func.date(ResponseORM.submitted_at))
        .all()
        if sv_ids
        else []
    )
    submission_trend = [
        DashboardTrendPoint(label=str(r.day), value=r.cnt) for r in submission_trend_rows
    ]

    # Scan trend (by date)
    scan_trend_rows = []
    if qr_ids:
        scan_trend_rows = (
            db.query(
                func.date(ScanEventORM.scanned_at).label("day"),
                func.count(ScanEventORM.id).label("cnt"),
            )
            .filter(ScanEventORM.qr_code_id.in_(qr_ids))
            .group_by(func.date(ScanEventORM.scanned_at))
            .order_by(func.date(ScanEventORM.scanned_at))
            .all()
        )
    scan_trend = [DashboardTrendPoint(label=str(r.day), value=r.cnt) for r in scan_trend_rows]

    return DashboardData(
        company_name=company.name,
        user_display_name=f"{user.first_name} {user.last_name}".strip() or "User",
        total_submissions=total_submissions,
        total_scans=total_scans,
        active_surveys_count=active_surveys_count,
        active_qr_codes_count=active_qr_codes_count,
        active_locations_count=active_locations_count,
        submission_trend=submission_trend,
        scan_trend=scan_trend,
        active_surveys=active_surveys,
        active_qr_codes=active_qr_codes,
        active_locations=active_locations,
    )


@router.get("/dashboard/submissions", response_model=list[DashboardResponseSummary])
def get_dashboard_submissions_by_date(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    """Return submissions for a specific date."""
    company = _get_user_company(user, db)
    if not company:
        return []

    survey_ids = [s.id for s in db.query(SurveyORM.id).filter(SurveyORM.company_id == company.id).all()]
    sv_ids = [
        r[0]
        for r in db.query(SurveyVersionORM.id)
        .filter(SurveyVersionORM.survey_id.in_(survey_ids))
        .all()
    ]

    start = datetime.strptime(date, "%Y-%m-%d")
    end = start.replace(hour=23, minute=59, second=59, microsecond=999999)

    responses = (
        db.query(ResponseORM)
        .filter(
            ResponseORM.survey_version_id.in_(sv_ids),
            ResponseORM.submitted_at >= start,
            ResponseORM.submitted_at <= end,
        )
        .order_by(ResponseORM.submitted_at)
        .all()
    )

    return [
        DashboardResponseSummary(
            id=str(r.id),
            survey_version_id=str(r.survey_version_id),
            location_id=str(r.location_id) if r.location_id else None,
            submitted_at=r.submitted_at.isoformat(),
        )
        for r in responses
    ]
