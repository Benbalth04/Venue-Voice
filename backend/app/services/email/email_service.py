from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

import resend
from sqlalchemy import update as sa_update
from sqlalchemy.orm import Session

from ...core.datetime_user_tz import format_utc_instant_for_email_datetime
from ...core.observability import track_external_call
from ...core.timezone_australia import effective_zoneinfo_for_stored_timezone
from ...integrations.supabase_storage import (
    generate_photo_signed_url,
    get_supabase_service_client,
)
from ...models.postgres_model import (
    Company as CompanyORM,
    EmailEvent as EmailEventORM,
    Flow as FlowORM,
    FlowRun as FlowRunORM,
    Location as LocationORM,
    LocationSurvey as LocationSurveyORM,
    QRCode as QRCodeORM,
    Question as QuestionORM,
    Survey as SurveyORM,
    SurveyResponse as SurveyResponseORM,
    SurveyResponseAnswer as SurveyResponseAnswerORM,
    SurveyResponsePhoto as SurveyResponsePhotoORM,
    SurveyVersion as SurveyVersionORM,
    Membership as MembershipORM,
    User as UserORM,
)
from .constants import (
    EMAIL_CATEGORY_USER_NOTIFICATION,
    format_resend_from_header,
    html_escape as _escape,
)
from .db_helpers import MAX_RETRIES, increment_email_retry, mark_email_events
from .retry import call_with_exponential_backoff
from ...core.config import settings

logger = logging.getLogger(__name__)

_RESEND_API_KEY = settings.resend_api_key
_RESEND_FROM_EMAIL = settings.resend_from_email
_FRONTEND_ORIGIN = settings.app_origin


def send_emails_for_flow_run(flow_run_id: uuid.UUID, db: Session) -> None:
    """Send a single BCC'd email for all pending recipients of a flow run.

    Uses an atomic UPDATE … RETURNING to claim events before sending, which
    prevents double-sending if the reconciliation job overlaps with the
    immediate post-submission trigger.
    """
    if not _RESEND_API_KEY or not _RESEND_FROM_EMAIL:
        logger.warning("RESEND_API_KEY or RESEND_FROM_EMAIL not configured — skipping email send")
        return

    stmt = (
        sa_update(EmailEventORM)
        .where(
            EmailEventORM.flow_run_id == flow_run_id,
            EmailEventORM.event_category == EMAIL_CATEGORY_USER_NOTIFICATION,
            EmailEventORM.status == "pending",
            EmailEventORM.retry_count < MAX_RETRIES,
        )
        .values(status="sending")
        .returning(EmailEventORM.id, EmailEventORM.recipient_email)
    )
    result = db.execute(stmt)
    rows = result.fetchall()
    db.commit()

    if not rows:
        return

    event_ids: list[uuid.UUID] = [row[0] for row in rows]
    recipient_emails: list[str] = [row[1] for row in rows if row[1]]

    if not recipient_emails:
        mark_email_events(db, event_ids, status="failed_permanent", error="No valid recipient addresses")
        return

    try:
        html = _build_email_for_flow_run(flow_run_id, db)
        subject, flow_name = _get_subject(flow_run_id, db)
        _send_via_resend(recipient_emails, subject, html)
        mark_email_events(db, event_ids, status="sent", sent_at=datetime.now(timezone.utc))
        logger.info(
            "Email sent for flow_run_id=%s to %d recipient(s)", flow_run_id, len(recipient_emails)
        )
    except Exception as exc:
        logger.exception("Failed to send email for flow_run_id=%s", flow_run_id)
        increment_email_retry(db, event_ids, error=str(exc))


def reconcile_pending_emails(db: Session) -> dict:
    """Find all pending flow email events grouped by flow_run and attempt delivery.

    Returns a dict with keys: flow_runs_found, sent, failed.
    """
    rows = (
        db.query(EmailEventORM.flow_run_id)
        .filter(
            EmailEventORM.event_category == EMAIL_CATEGORY_USER_NOTIFICATION,
            EmailEventORM.status == "pending",
            EmailEventORM.retry_count < MAX_RETRIES,
            EmailEventORM.flow_run_id.isnot(None),
        )
        .distinct()
        .all()
    )

    flow_run_ids = [row[0] for row in rows]
    if not flow_run_ids:
        return {"flow_runs_found": 0, "sent": 0, "failed": 0}

    logger.info("Reconciliation: found %d flow run(s) with pending emails", len(flow_run_ids))
    sent = 0
    failed = 0
    for frid in flow_run_ids:
        try:
            send_emails_for_flow_run(frid, db)
            sent += 1
        except Exception:
            logger.exception("Reconciliation failed for flow_run_id=%s", frid)
            failed += 1
    return {"flow_runs_found": len(flow_run_ids), "sent": sent, "failed": failed}


def _get_subject(flow_run_id: uuid.UUID, db: Session) -> tuple[str, str]:
    flow_run = db.query(FlowRunORM).filter_by(id=flow_run_id).first()
    if not flow_run:
        return "Alert: survey flow triggered", "Unknown Flow"
    flow = db.query(FlowORM).filter_by(id=flow_run.flow_id).first()
    flow_name = flow.name if flow else "Unknown Flow"
    return f"Alert: {flow_name} triggered", flow_name


def _build_email_for_flow_run(flow_run_id: uuid.UUID, db: Session) -> str:
    flow_run = db.query(FlowRunORM).filter_by(id=flow_run_id).first()

    flow_name = "Unknown Flow"
    survey_name = "Unknown Survey"
    location_name = "Unknown Location"
    qr_title = "Unknown QR Code"
    submitted_at: datetime | None = None
    answers: list[dict[str, Any]] = []

    # One BCC email for all recipients: use company owner timezone (not per-recipient).
    user_tz = effective_zoneinfo_for_stored_timezone(None)
    if flow_run:
        company = db.query(CompanyORM).filter_by(id=flow_run.company_id).first()
        if company:
            owner_membership = (
                db.query(MembershipORM)
                .filter_by(company_id=company.id, role="company_owner")
                .first()
            )
            if owner_membership:
                owner = db.query(UserORM).filter_by(id=owner_membership.user_id).first()
                if owner:
                    user_tz = effective_zoneinfo_for_stored_timezone(owner.timezone)

    if flow_run:
        flow = db.query(FlowORM).filter_by(id=flow_run.flow_id).first()
        if flow:
            flow_name = flow.name

        if flow_run.location_survey_id:
            ls = db.query(LocationSurveyORM).filter_by(id=flow_run.location_survey_id).first()
            if ls:
                survey = db.query(SurveyORM).filter_by(id=ls.survey_id).first()
                if survey:
                    survey_name = survey.name
                location = db.query(LocationORM).filter_by(id=ls.location_id).first()
                if location:
                    location_name = location.name

        if flow_run.qr_code_id:
            qr = db.query(QRCodeORM).filter_by(id=flow_run.qr_code_id).first()
            if qr:
                qr_title = qr.title

        if flow_run.response_id:
            response = (
                db.query(SurveyResponseORM)
                .filter(
                    SurveyResponseORM.id == flow_run.response_id,
                    SurveyResponseORM.deleted_at.is_(None),
                )
                .first()
            )
            if response:
                submitted_at = response.completion_datetime
                answers = _get_ordered_answers(response.id, response.survey_version_id, db)

    view_url = f"{_FRONTEND_ORIGIN}/dashboard/analytics/view_responses"
    return _build_email_html(
        flow_name=flow_name,
        survey_name=survey_name,
        location_name=location_name,
        qr_title=qr_title,
        submitted_at=submitted_at,
        submitted_at_tz=user_tz,
        answers=answers,
        view_url=view_url,
    )


def _get_ordered_answers(
    response_id: uuid.UUID,
    survey_version_id: uuid.UUID,
    db: Session,
) -> list[dict[str, Any]]:
    sv = (
        db.query(SurveyVersionORM)
        .filter_by(id=survey_version_id)
        .first()
    )
    if not sv:
        return []

    questions_schema: list[dict] = sv.schema_json.get("questions", [])
    if not questions_schema:
        return []

    questions_orm = (
        db.query(QuestionORM)
        .filter(
            QuestionORM.survey_version_id == survey_version_id,
            QuestionORM.deleted_at.is_(None),
        )
        .all()
    )
    by_key: dict[str, QuestionORM] = {q.question_key: q for q in questions_orm}

    answers_orm = (
        db.query(SurveyResponseAnswerORM)
        .filter(
            SurveyResponseAnswerORM.survey_response_id == response_id,
            SurveyResponseAnswerORM.deleted_at.is_(None),
        )
        .all()
    )
    answers_by_stable_id: dict[str, SurveyResponseAnswerORM] = {
        str(a.question_id): a for a in answers_orm if a.question_id
    }

    photos_orm = (
        db.query(SurveyResponsePhotoORM)
        .filter(SurveyResponsePhotoORM.survey_response_id == response_id)
        .all()
    )
    photos_by_stable_id: dict[str, str] = {
        str(p.question_id): p.storage_path for p in photos_orm if p.question_id
    }

    result: list[dict[str, Any]] = []
    for sq in questions_schema:
        q_key = str(sq.get("id", ""))
        q_orm = by_key.get(q_key)
        if not q_orm:
            continue

        q_stable = str(q_orm.stable_question_id)

        title_raw = sq.get("title") or q_orm.question_text
        if isinstance(title_raw, dict):
            title = title_raw.get("text") or q_orm.question_text
        else:
            title = str(title_raw)

        storage_path = photos_by_stable_id.get(q_stable)
        photo_url: str | None = None
        if storage_path:
            try:
                client = get_supabase_service_client()
                photo_url = generate_photo_signed_url(
                    client=client, storage_path=storage_path, expires_in=604800
                )
            except Exception:
                logger.warning(
                    "Could not generate signed URL for photo (storage_path=%s) — link omitted",
                    storage_path,
                )
        if photo_url:
            result.append({"title": title, "answer": None, "photo_url": photo_url})
        else:
            ans = answers_by_stable_id.get(q_stable)
            if ans:
                answer_val = (
                    ans.text_value
                    if ans.text_value is not None
                    else (str(ans.numeric_value) if ans.numeric_value is not None else None)
                )
            else:
                answer_val = None
            result.append({"title": title, "answer": answer_val, "photo_url": None})

    return result


def _send_via_resend(recipient_emails: list[str], subject: str, html: str) -> None:
    """Send one email via Resend with all recipients in BCC."""

    def _send() -> None:
        resend.api_key = _RESEND_API_KEY
        from_header = format_resend_from_header(_RESEND_FROM_EMAIL)
        params: resend.Emails.SendParams = {
            "from": from_header,
            "to": [from_header],
            "bcc": recipient_emails,
            "subject": subject,
            "html": html,
        }
        with track_external_call("resend", "send_email"):
            resend.Emails.send(params)

    call_with_exponential_backoff(_send, operation_name="Resend flow alert email")


def _build_email_html(
    *,
    flow_name: str,
    survey_name: str,
    location_name: str,
    qr_title: str,
    submitted_at: datetime | None,
    submitted_at_tz: ZoneInfo,
    answers: list[dict[str, Any]],
    view_url: str,
) -> str:
    submitted_str = (
        format_utc_instant_for_email_datetime(submitted_at, submitted_at_tz)
        if submitted_at
        else None
    ) or "—"

    context_rows = "".join(
        f"""
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#374151;white-space:nowrap;
                     border-bottom:1px solid #e5e7eb;background:#f9fafb;">{label}</td>
          <td style="padding:8px 12px;color:#111827;border-bottom:1px solid #e5e7eb;">{value}</td>
        </tr>"""
        for label, value in [
            ("Survey", _escape(survey_name)),
            ("Location", _escape(location_name)),
            ("QR Code", _escape(qr_title)),
            ("Flow", _escape(flow_name)),
            ("Submitted At", submitted_str),
        ]
    )

    answer_rows_html = ""
    if answers:
        for row in answers:
            title = _escape(row["title"])
            if row.get("photo_url"):
                cell = (
                    f'<a href="{_escape(row["photo_url"])}" '
                    f'style="color:#4f46e5;text-decoration:underline;">View Photo</a>'
                )
            else:
                cell = _escape(row["answer"]) if row.get("answer") is not None else '<span style="color:#9ca3af;">—</span>'
            answer_rows_html += f"""
        <tr>
          <td style="padding:8px 12px;color:#374151;border-bottom:1px solid #e5e7eb;
                     vertical-align:top;width:40%;">{title}</td>
          <td style="padding:8px 12px;color:#111827;border-bottom:1px solid #e5e7eb;
                     vertical-align:top;">{cell}</td>
        </tr>"""
    else:
        answer_rows_html = """
        <tr>
          <td colspan="2" style="padding:12px;color:#9ca3af;text-align:center;">
            No responses recorded.
          </td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Venue Voice Alert: {_escape(flow_name)} triggered</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <tr>
            <td style="background:#4f46e5;border-radius:8px 8px 0 0;padding:24px 32px;">
              <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:0.1em;
                         color:#c7d2fe;text-transform:uppercase;">Venue Voice</p>
              <h1 style="margin:4px 0 0;font-size:22px;font-weight:700;color:#ffffff;">
                Alert: {_escape(flow_name)} triggered
              </h1>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:32px;">

              <h2 style="margin:0 0 12px;font-size:14px;font-weight:600;
                          color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">
                Submission Details
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border:1px solid #e5e7eb;border-radius:6px;border-collapse:collapse;margin-bottom:32px;">
                {context_rows}
              </table>

              <h2 style="margin:0 0 12px;font-size:14px;font-weight:600;
                          color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">
                Survey Responses
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border:1px solid #e5e7eb;border-radius:6px;border-collapse:collapse;margin-bottom:32px;">
                <tr style="background:#f9fafb;">
                  <th style="padding:10px 12px;text-align:left;font-size:12px;
                              font-weight:600;color:#6b7280;text-transform:uppercase;
                              letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Question</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;
                              font-weight:600;color:#6b7280;text-transform:uppercase;
                              letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Answer</th>
                </tr>
                {answer_rows_html}
              </table>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="{_escape(view_url)}"
                       style="display:inline-block;background:#4f46e5;color:#ffffff;
                              font-size:14px;font-weight:600;text-decoration:none;
                              padding:12px 28px;border-radius:6px;">
                      View All Responses
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;
                        border-radius:0 0 8px 8px;padding:16px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                This alert was sent by Venue Voice because a flow action was triggered
                during a survey submission.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


