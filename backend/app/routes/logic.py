import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from ..auth.jwt import get_current_user
from ..db.postgres import get_db_connection
from ..models.postgres_model import Company as CompanyORM
from ..models.postgres_model import Survey as SurveyORM
from ..models.postgres_model import User as UserORM
from ..schemas.pydantic_model import (
    LogicRuleCreate,
    LogicRuleListResponse,
    LogicRuleResponse,
    LogicRuleUpdate,
)
from ..services.logic_service import (
    create_logic_rule,
    delete_logic_rule,
    get_logic_rule_bundle,
    update_logic_rule,
)
from ..core.errors.exceptions import NotFoundError, PermissionError, ValidationError

router = APIRouter()


def _parse_uuid(value: str, *, code: str, label: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise ValidationError(code=code, message=f"Invalid {label}")


def _get_company_for_user(db: Session, current_user: UserORM) -> CompanyORM:
    company = db.query(CompanyORM).filter(CompanyORM.owner_user_id == current_user.id).first()
    if not company:
        raise NotFoundError(code="COMPANY_NOT_FOUND", message="Company not found for user")
    return company


def _ensure_survey_access(db: Session, current_user: UserORM, survey_id: uuid.UUID) -> None:
    company = _get_company_for_user(db, current_user)
    survey = db.query(SurveyORM).filter(SurveyORM.id == survey_id).first()
    if not survey:
        raise NotFoundError(code="SURVEY_NOT_FOUND", message="Survey not found")
    if survey.company_id != company.id:
        raise PermissionError(code="ACCESS_DENIED", message="Access denied")


@router.get("/surveys/{survey_id}/logic-rules", response_model=LogicRuleListResponse)
def list_logic_rules(
    survey_id: str,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey_uuid = _parse_uuid(survey_id, code="INVALID_SURVEY_ID", label="survey ID")
    _ensure_survey_access(db, current_user, survey_uuid)
    return get_logic_rule_bundle(db, survey_uuid)


@router.post("/surveys/{survey_id}/logic-rules", response_model=LogicRuleResponse, status_code=201)
def create_rule(
    survey_id: str,
    payload: LogicRuleCreate,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey_uuid = _parse_uuid(survey_id, code="INVALID_SURVEY_ID", label="survey ID")
    _ensure_survey_access(db, current_user, survey_uuid)
    return create_logic_rule(db, survey_uuid, payload)


@router.put("/surveys/{survey_id}/logic-rules/{rule_id}", response_model=LogicRuleResponse)
def update_rule(
    survey_id: str,
    rule_id: str,
    payload: LogicRuleUpdate,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey_uuid = _parse_uuid(survey_id, code="INVALID_SURVEY_ID", label="survey ID")
    rule_uuid = _parse_uuid(rule_id, code="INVALID_LOGIC_RULE_ID", label="logic rule ID")
    _ensure_survey_access(db, current_user, survey_uuid)
    return update_logic_rule(db, survey_uuid, rule_uuid, payload)


@router.delete("/surveys/{survey_id}/logic-rules/{rule_id}", status_code=204)
def delete_rule(
    survey_id: str,
    rule_id: str,
    current_user: UserORM = Depends(get_current_user),
    db: Session = Depends(get_db_connection),
):
    survey_uuid = _parse_uuid(survey_id, code="INVALID_SURVEY_ID", label="survey ID")
    rule_uuid = _parse_uuid(rule_id, code="INVALID_LOGIC_RULE_ID", label="logic rule ID")
    _ensure_survey_access(db, current_user, survey_uuid)
    delete_logic_rule(db, survey_uuid, rule_uuid)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
