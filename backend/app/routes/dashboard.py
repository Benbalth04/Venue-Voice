from datetime import date
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends, Query

from ..auth.membership import get_company_from_membership, get_current_membership
from ..auth.subscription import require_active_subscription
from ..auth.viewer_scoping import apply_location_filter, apply_survey_filter, location_ids_subquery, survey_ids_subquery
from ..auth.user_timezone import format_dt_for_user, get_user_zoneinfo
from ..core.datetime_user_tz import (
    inclusive_local_date_range_to_utc_bounds,
    naive_utc_for_sql,
    user_local_date_sql,
)
from ..db.postgres import get_db_connection
from ..models.postgres_model import (
    Company as CompanyORM,
    Location as LocationORM,
    LocationSurvey as LocationSurveyORM,
    Membership as MembershipORM,
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

router = APIRouter(dependencies=[Depends(require_active_subscription)])


@router.get("/dashboard", response_model=DashboardData)
def get_dashboard(
    membership: MembershipORM = Depends(get_current_membership),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    """Return dashboard data for the current user's company."""
    company = get_company_from_membership(membership, db)
    user = db.query(UserORM).filter(UserORM.id == membership.user_id).first()
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

    # Survey IDs for this company (scoped to viewer permissions)
    survey_sq = survey_ids_subquery(membership, db)
    location_sq = location_ids_subquery(membership, db)

    survey_query = (
        db.query(SurveyORM.id)
        .filter(
            SurveyORM.company_id == company.id,
            SurveyORM.deleted_at.is_(None),
        )
    )
    survey_query = apply_survey_filter(survey_query, survey_sq, SurveyORM.id)
    survey_ids = [s.id for s in survey_query.all()]

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

    # Total scans (scan_events for QR codes belonging to company, scoped to viewer)
    qr_q = db.query(QRCodeORM.id).filter(
        QRCodeORM.company_id == company.id,
        QRCodeORM.deleted_at.is_(None),
    )
    qr_q = apply_location_filter(qr_q, location_sq, QRCodeORM.location_id)
    qr_ids = [r[0] for r in qr_q.all()]
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

    # Active surveys (scoped to viewer permissions)
    active_surveys_q = db.query(SurveyORM).filter(
        SurveyORM.company_id == company.id,
        SurveyORM.status == SurveyStatus.active,
        SurveyORM.deleted_at.is_(None),
    )
    active_surveys_q = apply_survey_filter(active_surveys_q, survey_sq, SurveyORM.id)
    active_surveys_orm = active_surveys_q.all()
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

    # Active QR codes (with scan count, scoped to viewer permissions)
    if company:
        active_qr_q = (
            db.query(QRCodeORM)
            .join(LocationSurveyORM, LocationSurveyORM.id == QRCodeORM.location_survey_id)
            .filter(
                QRCodeORM.company_id == company.id,
                QRCodeORM.is_active.is_(True),
                QRCodeORM.deleted_at.is_(None),
            )
        )
        active_qr_q = apply_location_filter(active_qr_q, location_sq, QRCodeORM.location_id)
        active_qr_q = apply_survey_filter(active_qr_q, survey_sq, LocationSurveyORM.survey_id)
        active_qr_orm = active_qr_q.all()
    else:
        active_qr_orm = []
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

    location_query = (
        db.query(LocationORM)
        .filter(
            LocationORM.company_id == company.id,
            LocationORM.is_active.is_(True),
            LocationORM.deleted_at.is_(None),
        )
    )
    location_query = apply_location_filter(location_query, location_sq, LocationORM.id)
    locations_orm = location_query.all()
    active_locations_count = len(locations_orm)
    active_locations = [
        DashboardLocationSummary(id=l.id, name=l.name) for l in locations_orm
    ]

    sub_day = user_local_date_sql(SurveyResponseORM.completion_datetime, user_tz)
    # Submission trend (by user-local calendar date)
    submission_trend_rows = (
        db.query(
            sub_day.label("day"),
            func.count(SurveyResponseORM.id).label("cnt"),
        )
        .filter(SurveyResponseORM.survey_version_id.in_(sv_ids))
        .filter(SurveyResponseORM.deleted_at.is_(None))
        .group_by(sub_day)
        .order_by(sub_day)
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
        scan_day = user_local_date_sql(ScanEventORM.scanned_at, user_tz)
        scan_trend_rows = (
            db.query(
                scan_day.label("day"),
                func.count(ScanEventORM.id).label("cnt"),
            )
            .filter(
                ScanEventORM.qr_code_id.in_(qr_ids),
                ScanEventORM.deleted_at.is_(None),
            )
            .group_by(scan_day)
            .order_by(scan_day)
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
    date: str = Query(..., description="Date in YYYY-MM-DD format (user's saved timezone)"),
    membership: MembershipORM = Depends(get_current_membership),
    user_tz: ZoneInfo = Depends(get_user_zoneinfo),
    db: Session = Depends(get_db_connection),
):
    """Return submissions for a specific date."""
    company = get_company_from_membership(membership, db)
    survey_sq = survey_ids_subquery(membership, db)

    survey_query = (
        db.query(SurveyORM.id)
        .filter(
            SurveyORM.company_id == company.id,
            SurveyORM.deleted_at.is_(None),
        )
    )
    survey_query = apply_survey_filter(survey_query, survey_sq, SurveyORM.id)
    survey_ids = [s.id for s in survey_query.all()]
    sv_ids = [
        r[0]
        for r in db.query(SurveyVersionORM.id)
        .filter(
            SurveyVersionORM.survey_id.in_(survey_ids),
            SurveyVersionORM.deleted_at.is_(None),
        )
        .all()
    ]

    d = date.fromisoformat(date.strip()[:10])
    utc_lo, utc_hi_excl = inclusive_local_date_range_to_utc_bounds(d, d, user_tz)
    start_naive = naive_utc_for_sql(utc_lo)
    end_naive = naive_utc_for_sql(utc_hi_excl)

    responses = (
        db.query(SurveyResponseORM)
        .filter(
            SurveyResponseORM.survey_version_id.in_(sv_ids),
            SurveyResponseORM.completion_datetime >= start_naive,
            SurveyResponseORM.completion_datetime < end_naive,
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
            completion_datetime=format_dt_for_user(r.completion_datetime, user_tz) or "",
        )
        for r in responses
    ]
