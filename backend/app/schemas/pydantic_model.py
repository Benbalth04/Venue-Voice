import uuid
from datetime import datetime
from enum import Enum as PyEnum

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from typing import Any, Literal


class User(BaseModel):
    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    onboarding_complete: bool = False


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    onboarding_complete: bool
    company_name: str | None = None
    user_display_name: str | None = None


class SetupAccountRequest(BaseModel):
    company_name: str
    location_name: str
    location_state: str | None = None
    location_country: str | None = None
    location_google_business_url: str | None = None
    primary_industry: str | None = None
    company_size: str | None = None
    location_count: int | None = None
    how_heard: str | None = None

class Company(BaseModel):
    id: uuid.UUID
    name: str
    owner_user_id: uuid.UUID
    primary_industry: str | None = None
    company_size: str | None = None
    location_count: int | None = None
    how_heard: str | None = None

class Location(BaseModel):
    id: uuid.UUID
    name: str
    company_id: uuid.UUID


# --------------------------------------------------
# LOCATIONS (CRUD)
# --------------------------------------------------

class LocationCreate(BaseModel):
    name: str
    state: str | None = None
    country: str | None = None
    google_business_url: str | None = None


class LocationUpdate(BaseModel):
    name: str | None = None
    state: str | None = None
    country: str | None = None
    google_business_url: str | None = None
    is_active: bool | None = None


class LocationResponse(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    state: str | None
    country: str | None
    google_business_url: str | None
    created_at: str
    updated_at: str


# --------------------------------------------------
# LOCATION SURVEYS
# --------------------------------------------------

class LocationSurveyCreate(BaseModel):
    location_id: uuid.UUID
    survey_id: uuid.UUID
    start_date: datetime
    end_date: datetime | None = None

    @model_validator(mode="after")
    def validate_date_range(self):
        if self.end_date is not None and self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class LocationSurveyBulkAssignCreate(BaseModel):
    survey_id: uuid.UUID
    location_ids: list[uuid.UUID] = Field(min_length=1)
    start_date: datetime
    end_date: datetime | None = None

    @model_validator(mode="after")
    def validate_date_range(self):
        if len(set(self.location_ids)) != len(self.location_ids):
            raise ValueError("location_ids must be unique")
        if self.end_date is not None and self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class LocationSurveyUpdate(BaseModel):
    is_active: bool | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None

    @model_validator(mode="after")
    def validate_date_range(self):
        if self.start_date is not None and self.end_date is not None and self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class LocationSurveyResponse(BaseModel):
    id: uuid.UUID
    location_id: uuid.UUID
    location_name: str
    location_google_business_url: str | None = None
    location_is_active: bool
    survey_id: uuid.UUID
    survey_name: str
    survey_is_published: bool
    is_active: bool
    start_date: str
    end_date: str | None
    status: str
    created_at: str
    updated_at: str


class LocationNotificationGroupUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    group_ids: list[uuid.UUID] = Field(default_factory=list)


# --------------------------------------------------
# QR CODES (CRUD)
# --------------------------------------------------

class QRCodeCreate(BaseModel):
    title: str
    location_survey_id: uuid.UUID


class QRCodeUpdate(BaseModel):
    title: str | None = None
    location_survey_id: uuid.UUID | None = None
    is_active: bool | None = None


class QRCodeResponse(BaseModel):
    id: uuid.UUID
    title: str
    location_survey_id: uuid.UUID
    survey_id: uuid.UUID
    survey_title: str | None
    location_status: str | None = None
    location_id: uuid.UUID
    location_name: str | None
    start_date: str | None = None
    end_date: str | None = None
    assignment_status: str | None = None
    is_active: bool
    created_at: str
    updated_at: str


class SurveySummaryResponse(BaseModel):
    id: uuid.UUID
    name: str
    status: str

class Survey(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    location_id: uuid.UUID | None
    name: str
    description: str | None
    status: Literal["draft", "active", "archived"]
    active_version_id: uuid.UUID | None
    created_by: uuid.UUID


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    company_name: str
    default_store_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    user: User
    company: Company | None = None


# --------------------------------------------------
# DASHBOARD
# --------------------------------------------------

class DashboardTrendPoint(BaseModel):
    label: str
    value: int


class DashboardSurveySummary(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    question_count: int


class DashboardQRCodeSummary(BaseModel):
    id: uuid.UUID
    title: str
    survey_id: uuid.UUID
    location_id: uuid.UUID | None
    is_active: bool
    scan_count: int


class DashboardLocationSummary(BaseModel):
    id: uuid.UUID
    name: str


class DashboardResponseSummary(BaseModel):
    id: uuid.UUID
    survey_version_id: uuid.UUID
    location_id: uuid.UUID | None
    completion_datetime: str


# --------------------------------------------------
# SURVEYS (CRUD)
# --------------------------------------------------

class SurveyCreate(BaseModel):
    title: str
    survey_schema_json: dict[str, Any]


class SurveySaveVersion(BaseModel):
    survey_schema_json: dict[str, Any]
    version: int


class SurveyUpdateMeta(BaseModel):
    title: str | None = None
    status: Literal["draft", "active", "archived"] | None = None


class SurveyListItem(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    latest_version: int
    created_at: str
    updated_at: str
    last_edited_by: str | None

class SurveyWithSchema(SurveyListItem):
    survey_schema_json: dict[str, Any]


class QuestionTypeResponse(BaseModel):
    type: str
    category: str
    label: str
    is_numeric: bool


# --------------------------------------------------
# ANALYTICS
# --------------------------------------------------

class AnalyticsResponseRow(BaseModel):
    response_id: uuid.UUID | None = None
    session_id: uuid.UUID
    survey_name: str
    qr_code_name: str
    location_name: str | None
    scan_time: str           # ISO-8601 datetime string
    completed: bool
    time_to_complete_seconds: int | None
    questions_answered: int
    survey_version_id: uuid.UUID | None = None
    unread: bool = True      # True if user has not viewed this response's answers


class AnalyticsResponseList(BaseModel):
    rows: list[AnalyticsResponseRow]
    total_count: int
    page: int
    page_size: int


class AnalyticsFilterOption(BaseModel):
    id: uuid.UUID
    name: str


class AnalyticsFiltersResponse(BaseModel):
    surveys: list[AnalyticsFilterOption]
    qr_codes: list[AnalyticsFilterOption]
    locations: list[AnalyticsFilterOption]


class AnalyticsAnswerDetail(BaseModel):
    question_text: str
    answer_value: str


class AnalyticsResponseDetail(BaseModel):
    response_id: uuid.UUID
    survey_name: str
    answers: list[AnalyticsAnswerDetail]


# --------------------------------------------------
# SURVEY SETTINGS SCHEMA (centralised)
# --------------------------------------------------

class QuestionSettingDefinition(BaseModel):
    key: str
    label: str
    type: str  # boolean, select, integer, string, color, options
    required: bool = False
    default_value: Any = None
    allowed_values: list[Any] | None = None
    validation_rules: dict[str, Any] | None = None


class QuestionTypeSettingsSchema(BaseModel):
    question_type: str
    settings: list[QuestionSettingDefinition]


class SettingsSchemaResponse(BaseModel):
    question_types: list[QuestionTypeSettingsSchema]


class ThemeSettingDefinition(BaseModel):
    key: str
    label: str
    type: str
    default_value: Any = None
    allowed_values: list[Any] | None = None


class ThemeSettingsSchemaResponse(BaseModel):
    settings: list[ThemeSettingDefinition]


class SurveyThemeSettings(BaseModel):
    font: str = "Inter"
    content_alignment: str = "left"
    primary_color: str = "#7C3AED"
    background_color: str = "#FFFFFF"
    show_progress_bar: bool = True
    progress_bar_color: str = "#7C3AED"


class SurveyValidationError(BaseModel):
    question_id: str | None = None
    setting: str | None = None
    message: str


class SurveyValidationResult(BaseModel):
    valid: bool
    errors: list[SurveyValidationError] = []


class DashboardData(BaseModel):
    company_name: str
    user_display_name: str
    total_submissions: int
    total_scans: int
    active_surveys_count: int
    active_qr_codes_count: int
    active_locations_count: int
    submission_trend: list[DashboardTrendPoint]
    scan_trend: list[DashboardTrendPoint]
    active_surveys: list[DashboardSurveySummary]
    active_qr_codes: list[DashboardQRCodeSummary]
    active_locations: list[DashboardLocationSummary]


# --------------------------------------------------
# AI ANALYSIS
# --------------------------------------------------


class AISentiment(str, PyEnum):
    positive = "positive"
    neutral = "neutral"
    negative = "negative"


class AIAnalysisBase(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    company_id: uuid.UUID | None = None
    location_id: uuid.UUID | None = None
    survey_response_id: uuid.UUID
    question_id: uuid.UUID | None = None
    prompt: str
    raw_response: str | None = None
    analysis: dict[str, Any]
    sentiment: AISentiment | None = None
    sentiment_score: float | None = Field(default=None, ge=-1.0, le=1.0)
    model: str | None = None
    analysis_version: int = 1
    status: Literal["pending", "completed", "failed"]
    processing_time_ms: int | None = None
    error: str | None = None


class AIAnalysisCreate(AIAnalysisBase):
    """Payload shape for creating an analysis row (internal / future API use)."""

    pass


class AIAnalysisResponse(AIAnalysisBase):
    id: uuid.UUID
    created_at: datetime


# --------------------------------------------------
# RULES / FLOWS / NOTIFICATION GROUPS
# --------------------------------------------------
class RuleConditionType(str, PyEnum):
    rating = "rating"
    sentiment = "sentiment"
    not_empty = "not_empty"


class RuleGroupOperator(str, PyEnum):
    AND = "AND"
    OR = "OR"


class RuleOperator(str, PyEnum):
    lt = "lt"
    lte = "lte"
    eq = "eq"
    gte = "gte"
    gt = "gt"
    is_ = "is"


class SentimentValue(str, PyEnum):
    positive = "positive"
    neutral = "neutral"
    negative = "negative"


class FlowNodeType(str, PyEnum):
    rule = "rule"
    branch = "branch"
    action = "action"


class FlowBranchType(str, PyEnum):
    TRUE = "TRUE"
    FALSE = "FALSE"


class FlowActionType(str, PyEnum):
    redirect = "redirect"
    email = "email"


class FlowBranchMatchType(str, PyEnum):
    all = "all"
    any = "any"


class FlowRedirectTargetType(str, PyEnum):
    google_business_url = "google_business_url"
    custom_url = "custom_url"


class FlowEmailTargetType(str, PyEnum):
    custom_email = "custom_email"
    notification_group = "notification_group"
    location_notification_groups = "location_notification_groups"


class RuleQuestionOption(BaseModel):
    id: uuid.UUID
    question_key: str
    question_text: str
    question_type: str
    is_numeric: bool
    position: int


class RuleGroupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = None
    operator: RuleGroupOperator


class RuleConditionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = None
    condition_type: RuleConditionType
    question_id: uuid.UUID | None = None
    operator: RuleOperator | None = None
    value: str | None = None
    group_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_shape(self):
        if self.condition_type == RuleConditionType.not_empty:
            if self.question_id is None:
                raise ValueError("not_empty conditions require question_id")
            if self.operator is not None or self.value is not None:
                raise ValueError("not_empty conditions cannot define operator or value")
            return self

        if self.question_id is None:
            raise ValueError("condition question_id is required")
        if self.operator is None:
            raise ValueError("condition operator is required")
        if self.value is None or not str(self.value).strip():
            raise ValueError("condition value is required")

        if self.condition_type == RuleConditionType.rating:
            if self.operator not in {
                RuleOperator.lt,
                RuleOperator.lte,
                RuleOperator.eq,
                RuleOperator.gte,
                RuleOperator.gt,
            }:
                raise ValueError("rating conditions require a numeric comparison operator")
        elif self.condition_type == RuleConditionType.sentiment:
            if self.operator != RuleOperator.is_:
                raise ValueError("sentiment conditions require the 'is' operator")
            try:
                SentimentValue(str(self.value).strip().lower())
            except ValueError as exc:
                raise ValueError("sentiment conditions must target positive, neutral, or negative") from exc

        return self


class CreateRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=240)
    operator: RuleGroupOperator = RuleGroupOperator.AND
    groups: list[RuleGroupCreate] = Field(default_factory=list)
    conditions: list[RuleConditionCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_groups(self):
        group_ids = {group.id for group in self.groups if group.id is not None}
        seen_group_ids: set[uuid.UUID] = set()
        for condition in self.conditions:
            if condition.group_id is None:
                continue
            if condition.group_id not in group_ids:
                raise ValueError("condition references an unknown rule group")
            seen_group_ids.add(condition.group_id)
        if len(seen_group_ids) != len(group_ids):
            raise ValueError("each rule group must contain at least one condition")
        if not self.conditions:
            raise ValueError("at least one condition is required")
        return self


class UpdateRule(CreateRule):
    pass


class RuleGroupResponse(BaseModel):
    id: uuid.UUID
    operator: RuleGroupOperator
    created_at: datetime


class RuleConditionResponse(BaseModel):
    id: uuid.UUID
    condition_type: RuleConditionType
    question_id: uuid.UUID | None
    operator: RuleOperator | None
    value: str | None
    group_id: uuid.UUID | None
    created_at: datetime


class RuleResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    survey_id: uuid.UUID
    name: str
    description: str | None = None
    operator: RuleGroupOperator
    groups: list[RuleGroupResponse] = Field(default_factory=list)
    conditions: list[RuleConditionResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class RuleListResponse(BaseModel):
    survey_id: uuid.UUID
    questions: list[RuleQuestionOption] = Field(default_factory=list)
    rules: list[RuleResponse] = Field(default_factory=list)


class NotificationGroupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)


class NotificationGroupMemberCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    email: EmailStr


class NotificationGroupUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    members: list[NotificationGroupMemberCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_member_emails(self):
        normalized_emails = [str(member.email).strip().lower() for member in self.members]
        if len(set(normalized_emails)) != len(normalized_emails):
            raise ValueError("notification group member emails must be unique")
        return self


class AssignNotificationGroupToLocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    group_id: uuid.UUID


class NotificationGroupMemberResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    created_at: datetime


class NotificationGroupResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    created_at: datetime
    members: list[NotificationGroupMemberResponse] = Field(default_factory=list)
    location_ids: list[uuid.UUID] = Field(default_factory=list)


class FlowNodeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    node_type: FlowNodeType
    rule_id: uuid.UUID | None = None
    branch_type: FlowBranchType | None = None
    action_type: FlowActionType | None = None
    config: dict[str, Any] | None = None
    position: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_shape(self):
        if self.node_type == FlowNodeType.rule:
            if self.rule_id is None:
                raise ValueError("rule nodes require rule_id")
            if self.action_type is not None:
                raise ValueError("rule nodes cannot define action_type")
            return self

        if self.node_type == FlowNodeType.branch:
            if self.rule_id is not None or self.action_type is not None:
                raise ValueError("branch nodes cannot define rule_id or action_type")
            config = self.config or {}
            match_type = config.get("match_type")
            if match_type not in {FlowBranchMatchType.all.value, FlowBranchMatchType.any.value}:
                raise ValueError("branch nodes require config.match_type of 'all' or 'any'")
            # New format: rule_conditions [{rule_id, expected}]
            raw_conditions = config.get("rule_conditions")
            if isinstance(raw_conditions, list):
                if not raw_conditions:
                    raise ValueError("branch nodes require at least one rule condition")
                for rc in raw_conditions:
                    if not isinstance(rc, dict) or "rule_id" not in rc:
                        raise ValueError("each branch rule_condition must have a rule_id")
                    try:
                        uuid.UUID(str(rc["rule_id"]))
                    except (TypeError, ValueError) as exc:
                        raise ValueError("branch rule_condition.rule_id must be a valid UUID") from exc
                    if "expected" in rc and not isinstance(rc.get("expected"), bool):
                        raise ValueError("branch rule_condition.expected must be a boolean")
            else:
                # Legacy format: rule_ids + negate (kept for backwards compatibility)
                raw_rule_ids = config.get("rule_ids")
                if not isinstance(raw_rule_ids, list) or not raw_rule_ids:
                    raise ValueError("branch nodes require config.rule_conditions or config.rule_ids")
                for raw_rule_id in raw_rule_ids:
                    try:
                        uuid.UUID(str(raw_rule_id))
                    except (TypeError, ValueError) as exc:
                        raise ValueError("branch config.rule_ids must contain valid rule IDs") from exc
                negate = config.get("negate", False)
                if not isinstance(negate, bool):
                    raise ValueError("branch nodes require config.negate to be a boolean")
            return self

        if self.action_type is None:
            raise ValueError("action nodes require action_type")
        if self.rule_id is not None:
            raise ValueError("action nodes cannot define rule_id")
        config = self.config or {}
        if self.action_type == FlowActionType.redirect:
            target = config.get("target", FlowRedirectTargetType.google_business_url.value)
            if target not in {
                FlowRedirectTargetType.google_business_url.value,
                FlowRedirectTargetType.custom_url.value,
            }:
                raise ValueError("redirect actions require a valid config.target")
            if target == FlowRedirectTargetType.custom_url.value:
                url = config.get("url")
                if not isinstance(url, str) or not url.strip():
                    raise ValueError("custom redirect actions require config.url")
        if self.action_type == FlowActionType.email:
            target = config.get("target")
            if target == FlowEmailTargetType.custom_email.value:
                email = config.get("email")
                if not isinstance(email, str) or not email.strip():
                    raise ValueError("custom email actions require config.email")
            elif target == FlowEmailTargetType.notification_group.value:
                group_id = config.get("notification_group_id")
                if not group_id:
                    raise ValueError("notification-group email actions require config.notification_group_id")
            elif target != FlowEmailTargetType.location_notification_groups.value:
                raise ValueError("email actions require a valid config.target")
        return self


class CreateFlow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=240)
    is_active: bool = True
    location_survey_ids: list[uuid.UUID] = Field(default_factory=list)
    nodes: list[FlowNodeCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_structure(self):
        node_ids = [node.id for node in self.nodes if node.id is not None]
        if len(node_ids) != len(set(node_ids)):
            raise ValueError("flow node ids must be unique")

        parent_ids = {node.id for node in self.nodes if node.id is not None}
        roots = [node for node in self.nodes if node.parent_id is None]
        if len(roots) != 1:
            raise ValueError("flows must contain exactly one root node")
        node_key_map: dict[uuid.UUID, FlowNodeCreate] = {}
        for index, node in enumerate(self.nodes):
            node_id = node.id or uuid.uuid5(uuid.NAMESPACE_URL, f"flow-node-{index}")
            node_key_map[node_id] = node
            if node.parent_id is not None and node.parent_id not in parent_ids:
                raise ValueError("flow nodes cannot reference a missing parent")

        total_rules = sum(1 for node in self.nodes if node.node_type == FlowNodeType.rule)
        if total_rules > 10:
            raise ValueError("flows can contain at most 10 rule nodes")

        children_by_parent: dict[uuid.UUID | None, list[tuple[uuid.UUID, FlowNodeCreate]]] = {}
        for index, node in enumerate(self.nodes):
            node_id = node.id or uuid.uuid5(uuid.NAMESPACE_URL, f"flow-node-{index}")
            children_by_parent.setdefault(node.parent_id, []).append((node_id, node))

        for children in children_by_parent.values():
            children.sort(key=lambda item: item[1].position)

        for node_id, node in node_key_map.items():
            children = children_by_parent.get(node_id, [])
            if node.parent_id is None and node.branch_type is not None:
                raise ValueError("root nodes cannot define branch_type")
            if node.node_type == FlowNodeType.action and children:
                raise ValueError("action nodes cannot have children")
            if node.node_type == FlowNodeType.rule:
                if len(children) != 1:
                    raise ValueError("rule nodes must have exactly one child")
                if children[0][1].branch_type is not None:
                    raise ValueError("rule node children cannot define branch_type")
            elif node.node_type == FlowNodeType.branch:
                if len(children) != 2:
                    raise ValueError("branch nodes must define both TRUE and FALSE children")
                branch_values = [child.branch_type for _, child in children]
                if sorted(branch_values) != [FlowBranchType.FALSE, FlowBranchType.TRUE]:
                    raise ValueError("branch nodes must define one TRUE and one FALSE child")
            else:
                for _, child in children:
                    if child.branch_type is not None:
                        raise ValueError("only branch node children can define branch_type")

        def walk(node_id: uuid.UUID) -> None:
            node = node_key_map[node_id]
            children = children_by_parent.get(node_id, [])
            if node.node_type == FlowNodeType.action:
                return
            if not children:
                raise ValueError("every flow path must end with an action node")
            for child_id, _ in children:
                walk(child_id)

        root_id = roots[0].id or uuid.uuid5(uuid.NAMESPACE_URL, "flow-root")
        walk(root_id)
        return self


class UpdateFlow(CreateFlow):
    pass


class FlowNodeResponse(BaseModel):
    id: uuid.UUID
    parent_id: uuid.UUID | None
    node_type: FlowNodeType
    rule_id: uuid.UUID | None
    branch_type: FlowBranchType | None
    action_type: FlowActionType | None
    config: dict[str, Any] | None
    position: int
    created_at: datetime


class FlowResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    survey_id: uuid.UUID
    survey_name: str
    name: str
    description: str | None = None
    is_active: bool
    location_survey_ids: list[uuid.UUID] = Field(default_factory=list)
    nodes: list[FlowNodeResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class FlowActionResult(BaseModel):
    type: FlowActionType
    url: str | None = None
    notification_group_id: uuid.UUID | None = None
    recipient_email: str | None = None


class FlowTestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mock_response: dict[str, Any] = Field(default_factory=dict)
    location_survey_id: uuid.UUID
    qr_code_id: uuid.UUID | None = None


class FlowTestResponse(BaseModel):
    execution_trace: dict[str, Any]
    action: FlowActionResult | None = None


class FlowRunResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    flow_id: uuid.UUID
    flow_name: str
    survey_id: uuid.UUID
    survey_name: str
    response_id: uuid.UUID | None
    success: bool
    location_survey_id: uuid.UUID | None
    location_name: str | None = None
    qr_code_id: uuid.UUID | None
    qr_code_title: str | None = None
    action_executed: str | None
    runtime_ms: int | None = None
    execution_trace: dict[str, Any]
    created_at: datetime
