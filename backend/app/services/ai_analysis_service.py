"""
Runs synchronous AI sentiment analysis for a submitted survey response.
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.errors.exceptions import ExternalAPIError
from ..core.openai_client import analyze_sentiment, build_stored_prompt
from ..models.postgres_model import (
    AIAnalysis as AIAnalysisORM,
    QRCode as QRCodeORM,
    Question as QuestionORM,
    QuestionType as QuestionTypeORM,
    SurveyResponseAnswer as SurveyResponseAnswerORM,
    SurveySession as SurveySessionORM,
)

if TYPE_CHECKING:
    from ..models.postgres_model import SurveyResponse as SurveyResponseORM

logger = logging.getLogger(__name__)

_MIN_TEXT_LEN = 5
_DEFAULT_MODEL = "gpt-4o-mini"


def run_ai_analysis_for_response(db: Session, survey_response: SurveyResponseORM) -> None:
    """
    For each answer whose question type has analyse_with_ai=True, run sentiment analysis once.
    Skips empty/short text and existing rows. Never raises to callers — logs and persists failures.
    """
    if survey_response is None or survey_response.id is None:
        logger.warning("run_ai_analysis_for_response: missing survey_response")
        return

    try:
        sid = survey_response.survey_version_id
        rid = survey_response.id
    except Exception:
        logger.exception("run_ai_analysis_for_response: invalid survey_response object")
        return

    session = (
        db.query(SurveySessionORM)
        .filter(SurveySessionORM.id == survey_response.session_id)
        .first()
    )
    if not session:
        logger.warning("run_ai_analysis_for_response: session not found for response %s", rid)
        return

    qr = (
        db.query(QRCodeORM)
        .filter(QRCodeORM.id == survey_response.qr_code_id)
        .first()
    )
    company_id = session.company_id
    location_id = qr.location_id if qr else None

    ai_questions = (
        db.query(QuestionORM)
        .join(QuestionTypeORM, QuestionORM.question_type == QuestionTypeORM.type)
        .filter(
            QuestionORM.survey_version_id == sid,
            QuestionTypeORM.analyse_with_ai.is_(True),
        )
        .all()
    )
    if not ai_questions:
        return

    # Use stable_question_id to match answers (which also store stable_question_id)
    ai_qids: set[uuid.UUID] = {q.stable_question_id for q in ai_questions}

    answers = (
        db.query(SurveyResponseAnswerORM)
        .filter(SurveyResponseAnswerORM.survey_response_id == rid)
        .all()
    )

    existing_qids = {
        row[0]
        for row in db.query(AIAnalysisORM.question_id)
        .filter(
            AIAnalysisORM.survey_response_id == rid,
            AIAnalysisORM.question_id.in_(ai_qids),
        )
        .all()
        if row[0] is not None
    }

    model_name = os.getenv("OPENAI_SENTIMENT_MODEL", _DEFAULT_MODEL)

    for ans in answers:
        qid = ans.question_id
        if qid is None or qid not in ai_qids:
            continue
        if qid in existing_qids:
            continue

        text = (ans.text_value or "").strip()
        if not text or len(text) < _MIN_TEXT_LEN:
            continue

        stored_prompt = build_stored_prompt(text)
        row = AIAnalysisORM(
            company_id=company_id,
            location_id=location_id,
            survey_response_id=rid,
            question_id=qid,
            prompt=stored_prompt,
            analysis={},
            status="pending",
            analysis_version=1,
            model=model_name,
        )

        t0 = time.monotonic()
        try:
            db.add(row)
            db.flush()
        except IntegrityError:
            db.rollback()
            logger.info(
                "AI analysis skipped (duplicate): response=%s question=%s",
                rid,
                qid,
            )
            continue

        try:
            result, raw_content = analyze_sentiment(text)
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            row.raw_response = raw_content[:16000] if raw_content else None
            row.analysis = result
            row.sentiment = result["sentiment"]
            row.sentiment_score = result["score"]
            row.status = "completed"
            row.processing_time_ms = elapsed_ms
            row.error = None
            db.commit()
            existing_qids.add(qid)
        except ValueError as e:
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            row.status = "failed"
            row.processing_time_ms = elapsed_ms
            row.error = str(e)[:2000]
            row.analysis = {}
            try:
                db.commit()
            except Exception:
                db.rollback()
                logger.exception("Failed to persist AI analysis failure row")
            existing_qids.add(qid)
        except ExternalAPIError as e:
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            row.status = "failed"
            row.processing_time_ms = elapsed_ms
            row.error = (e.message or str(e))[:2000]
            row.analysis = {}
            logger.warning(
                "OpenAI sentiment failed for response=%s question=%s: %s",
                rid,
                qid,
                e.message,
            )
            try:
                db.commit()
            except Exception:
                db.rollback()
                logger.exception("Failed to persist AI analysis failure row")
            existing_qids.add(qid)
        except Exception as e:
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            db.rollback()
            logger.exception(
                "Unexpected error during AI analysis response=%s question=%s",
                rid,
                qid,
            )
            fail = AIAnalysisORM(
                company_id=company_id,
                location_id=location_id,
                survey_response_id=rid,
                question_id=qid,
                prompt=stored_prompt,
                analysis={},
                status="failed",
                analysis_version=1,
                model=model_name,
                processing_time_ms=elapsed_ms,
                error=str(e)[:2000],
            )
            try:
                db.add(fail)
                db.commit()
            except IntegrityError:
                db.rollback()
            except Exception:
                db.rollback()
                logger.exception("Could not insert failed AI analysis placeholder")
