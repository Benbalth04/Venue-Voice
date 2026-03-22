from datetime import datetime
from sqlalchemy import func
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends, Query

from ..auth.jwt import get_current_user
from ..db.postgres import get_db_connection
from ..models.postgres_model import (
    Company as CompanyORM,
    Location as LocationORM,
    LocationSurvey as LocationSurveyORM,
    QRCode as QRCodeORM,
    SurveyResponse as SurveyResponseORM,
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
    return (
        db.query(CompanyORM)
        .filter(
            CompanyORM.owner_user_id == user.id,
            CompanyORM.deleted_at.is_(None),
        )
        .first()
    )


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
    survey_ids = [
        s.id
        for s in db.query(SurveyORM.id)
        .filter(
            SurveyORM.company_id == company.id,
            SurveyORM.deleted_at.is_(None),
        )
        .all()
    ]

    # Survey version IDs for these surveys
    sv_ids = (
        [
            r[0]
            for r in db.query(SurveyVersionORM.id)
            .filter(
                SurveyVersionORM.survey_id.in_(survey_ids),
                SurveyVersionORM.deleted_at.is_(None),
            )
            .all()
        ]
        if survey_ids
        else []
    )

    # Total submissions (responses for company's surveys)
    total_submissions = (
        db.query(func.count(SurveyResponseORM.id))
        .filter(
            SurveyResponseORM.survey_version_id.in_(sv_ids),
            SurveyResponseORM.deleted_at.is_(None),
        )
        .scalar()
        if sv_ids
        else 0
    ) or 0

    # Total scans (scan_events for QR codes belonging to company)
    qr_ids = [
        r[0]
        for r in db.query(QRCodeORM.id)
        .filter(
            QRCodeORM.company_id == company.id,
            QRCodeORM.deleted_at.is_(None),
        )
        .all()
    ]
    total_scans = (
        db.query(func.count(ScanEventORM.id))
        .filter(
            ScanEventORM.qr_code_id.in_(qr_ids),
            ScanEventORM.deleted_at.is_(None),
        )
        .scalar()
        if qr_ids
        else 0
    )

    # Active surveys
    active_surveys_orm = (
        db.query(SurveyORM)
        .filter(
            SurveyORM.company_id == company.id,
            SurveyORM.status == SurveyStatus.active,
            SurveyORM.deleted_at.is_(None),
        )
        .all()
    )
    active_surveys_count = len(active_surveys_orm)

    # Question count per survey (from survey_versions -> questions)
    from ..models.postgres_model import Question as QuestionORM

    def _question_count(survey_id):
        count = (
            db.query(func.count(QuestionORM.id))
            .join(SurveyVersionORM, QuestionORM.survey_version_id == SurveyVersionORM.id)
            .filter(
                SurveyVersionORM.survey_id == survey_id,
                SurveyVersionORM.deleted_at.is_(None),
                QuestionORM.deleted_at.is_(None),
            )
            .scalar()
        )
        return count or 0

    active_surveys = [
        DashboardSurveySummary(
            id=s.id,
            title=s.name,
            status=str(s.status.value),
            question_count=_question_count(s.id),
        )
        for s in active_surveys_orm
    ]

    # Active QR codes (with scan count)
    active_qr_orm = (
        db.query(QRCodeORM)
        .join(LocationSurveyORM, LocationSurveyORM.id == QRCodeORM.location_survey_id)
        .filter(
            QRCodeORM.company_id == company.id,
            QRCodeORM.is_active.is_(True),
            QRCodeORM.deleted_at.is_(None),
            LocationSurveyORM.deleted_at.is_(None),
        )
        .all()
        if company
        else []
    )
    active_qr_codes_count = len(active_qr_orm)

    def _scan_count(qr_id):
        return (
            db.query(func.count(ScanEventORM.id))
            .filter(
                ScanEventORM.qr_code_id == qr_id,
                ScanEventORM.deleted_at.is_(None),
            )
            .scalar()
            or 0
        )

    active_qr_codes = [
        DashboardQRCodeSummary(
            id=q.id,
            title=q.title,
            survey_id=q.location_survey.survey_id,
            location_id=q.location_id,
            is_active=q.is_active,
            scan_count=_scan_count(q.id),
        )
        for q in active_qr_orm
    ]

    locations_orm = (
        db.query(LocationORM)
        .filter(
            LocationORM.company_id == company.id,
            LocationORM.is_active.is_(True),
            LocationORM.deleted_at.is_(None),
        )
        .all()
    )
    active_locations_count = len(locations_orm)
    active_locations = [
        DashboardLocationSummary(id=l.id, name=l.name) for l in locations_orm
    ]

    # Submission trend (by date)
    submission_trend_rows = (
        db.query(
            func.date(SurveyResponseORM.completion_datetime).label("day"),
            func.count(SurveyResponseORM.id).label("cnt"),
        )
        .filter(SurveyResponseORM.survey_version_id.in_(sv_ids))
        .filter(SurveyResponseORM.deleted_at.is_(None))
        .group_by(func.date(SurveyResponseORM.completion_datetime))
        .order_by(func.date(SurveyResponseORM.completion_datetime))
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
            .filter(
                ScanEventORM.qr_code_id.in_(qr_ids),
                ScanEventORM.deleted_at.is_(None),
            )
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

    survey_ids = [
        s.id
        for s in db.query(SurveyORM.id)
        .filter(
            SurveyORM.company_id == company.id,
            SurveyORM.deleted_at.is_(None),
        )
        .all()
    ]
    sv_ids = [
        r[0]
        for r in db.query(SurveyVersionORM.id)
        .filter(
            SurveyVersionORM.survey_id.in_(survey_ids),
            SurveyVersionORM.deleted_at.is_(None),
        )
        .all()
    ]

    start = datetime.strptime(date, "%Y-%m-%d")
    end = start.replace(hour=23, minute=59, second=59, microsecond=999999)

    responses = (
        db.query(SurveyResponseORM)
        .filter(
            SurveyResponseORM.survey_version_id.in_(sv_ids),
            SurveyResponseORM.completion_datetime >= start,
            SurveyResponseORM.completion_datetime <= end,
            SurveyResponseORM.deleted_at.is_(None),
        )
        .order_by(SurveyResponseORM.completion_datetime)
        .all()
    )

    return [
        DashboardResponseSummary(
            id=r.id,
            survey_version_id=r.survey_version_id,
            location_id=r.location_snapshot_id,
            completion_datetime=r.completion_datetime.isoformat(),
        )
        for r in responses
    ]
