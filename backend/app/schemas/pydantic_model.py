import uuid
from datetime import datetime
from enum import Enum as PyEnum

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from typing import Any, Literal


class SubscriptionStatus(str, PyEnum):
    trialing = "trialing"
    active = "active"
    pending_cancel = "pending_cancel"
    past_due = "past_due"
    canceled = "canceled"
    incomplete = "incomplete"
    incomplete_expired = "incomplete_expired"
    unpaid = "unpaid"


class PlanLimitsResponse(BaseModel):
    """Plan-tier limits returned alongside the subscription status.

    Integer fields use -1 to represent 'unlimited'.
    Frontend code should treat -1 as no cap.
    """
    max_locations: int
    max_active_surveys: int
    max_active_flows: int
    max_branch_nodes_per_flow: int
    can_use_photo_feedback: bool
    can_expand_charts: bool


class SubscriptionResponse(BaseModel):
    status: str
    trial_end: str | None = None
    current_period_end: str | None = None
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    plan_display_name: str | None = None
    billing_interval: str | None = None
    cancel_at_period_end: bool = False
    price_id: str | None = None
    is_active: bool
    plan_limits: PlanLimitsResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class SyncSubscriptionResponse(SubscriptionResponse):
    """Extends SubscriptionResponse with a flag indicating whether Stripe was reachable."""

    sync_successful: bool


class SubscriptionWarning(BaseModel):
    """A single over-limit or feature-downgrade warning for the account."""

    type: str  # "OVER_LIMIT" | "FEATURE_DOWNGRADED"
    feature: str  # "locations" | "active_surveys" | "active_flows" | "photo_feedback"
    message: str
    limit: int | None = None
    current: int | None = None


class SubscriptionStatusResponse(BaseModel):
    """Dynamic account status for the subscription warning banner.

    Computed on request — never stored. ``over_limit`` reflects whether the
    account currently holds more resources than the plan allows (e.g. after a
    downgrade). ``warnings`` is the list the frontend renders verbatim.
    """

    plan: str | None
    over_limit: dict[str, bool]  # {"locations": bool, "active_surveys": bool, "active_flows": bool}
    warnings: list[SubscriptionWarning]
    can_invite_users: bool  # False when at or over the plan's member limit
    max_company_members: int  # -1 = unlimited


class CheckoutSessionResponse(BaseModel):
    checkout_url: str


class CheckoutSessionRequest(BaseModel):
    plan: Literal["starter", "growth", "pro"]
    billing_interval: Literal["monthly", "yearly"]




class PortalSessionResponse(BaseModel):
    portal_url: str


class VerifyCheckoutSessionResponse(BaseModel):
    ok: bool = True


class DeleteRequest(BaseModel):
    updated_at: datetime


class DeleteResponseRequest(BaseModel):
    confirmation: str


class MembershipSummary(BaseModel):
    membership_id: uuid.UUID
    company_id: uuid.UUID
    company_name: str
    role: str  # 'company_owner' | 'company_admin' | 'viewer'
    all_surveys: bool
    all_locations: bool


class CompanyMemberResponse(BaseModel):
    membership_id: uuid.UUID
    user_id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    role: str
    all_surveys: bool
    all_locations: bool
    invited_by_name: str | None = None
    timezone: str
    last_login_at: datetime | None = None
    created_at: datetime


class InviteUserRequest(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    role: str = "viewer"  # 'viewer' | 'company_admin'; only company_owner may invite admins


class SetViewerPermissionsRequest(BaseModel):
    all_surveys: bool
    all_locations: bool
    survey_ids: list[uuid.UUID] = []
    location_ids: list[uuid.UUID] = []


class ViewerPermissionsResponse(BaseModel):
    membership_id: uuid.UUID
    all_surveys: bool
    all_locations: bool
    survey_ids: list[uuid.UUID]
    location_ids: list[uuid.UUID]


class User(BaseModel):
    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    onboarding_complete: bool = False
    email_verified: bool = False


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    onboarding_complete: bool
    invite_pending: bool = False
    email_verified: bool
    timezone: str
    subscription_plan_name: str | None = None
    company_name: str | None = None
    user_display_name: str | None = None
    memberships: list[MembershipSummary] = []


def _sanitize_optional_text(v: Any, max_len: int) -> str | None:
    """Strip, cap length, drop NULs. Used for onboarding free-text (ORM uses bound params; this limits abuse)."""
    if v is None:
        return None
    if not isinstance(v, str):
        raise ValueError("Must be a string")
    s = v.replace("\x00", "").strip()
    if not s:
        return None
    return s[:max_len]


class SetupAccountRequest(BaseModel):
    company_name: str
    location_name: str
    timezone: str
    location_state: str | None = None
    location_country: str | None = None
    location_google_business_url: str | None = None
    primary_industry: str | None = None
    company_size: str | None = None
    location_count: int | None = None
    how_heard: str | None = None

    @field_validator("company_name", mode="before")
    @classmethod
    def sanitize_company_name(cls, v: Any) -> str:
        if not isinstance(v, str):
            raise ValueError("Company name must be a string")
        s = v.replace("\x00", "").strip()
        if not s:
            raise ValueError("Company name is required")
        return s[:500]

    @field_validator("location_name", mode="before")
    @classmethod
    def sanitize_location_name(cls, v: Any) -> str:
        if not isinstance(v, str):
            raise ValueError("Location name must be a string")
        s = v.replace("\x00", "").strip()
        if not s:
            raise ValueError("Location name is required")
        return s[:500]

    @field_validator("location_state", "location_country", mode="before")
    @classmethod
    def sanitize_location_fields(cls, v: Any) -> str | None:
        return _sanitize_optional_text(v, 200)

    @field_validator("location_google_business_url", mode="before")
    @classmethod
    def sanitize_google_url(cls, v: Any) -> str | None:
        return _sanitize_optional_text(v, 2000)

    @field_validator("primary_industry", "company_size", "how_heard", mode="before")
    @classmethod
    def sanitize_company_metadata_strings(cls, v: Any) -> str | None:
        return _sanitize_optional_text(v, 2000)


class UpdateUserTimezoneRequest(BaseModel):
    timezone: str


class CompleteInviteRequest(BaseModel):
    first_name: str
    last_name: str
    timezone: str


class Company(BaseModel):
    id: uuid.UUID
    name: str
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
    updated_at: datetime


class LocationResponse(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    state: str | None
    country: str | None
    google_business_url: str | None
    created_at: str
    updated_at: str


class FlowSummary(BaseModel):
    id: str
    name: str


class LocationFlowDependencies(BaseModel):
    google_business_url_flows: list[FlowSummary]
    notification_group_flows: list[FlowSummary]


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
    updated_at: datetime

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
    status: str = Field(
        description="Assignment lifecycle: active, scheduled, inactive, or deleted (independent of QR codes).",
    )
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
    location_id: uuid.UUID
    survey_id: uuid.UUID
    redirect_url: str | None = Field(
        default=None,
        description="URL encoded in the QR image. If omitted, defaults to {APP_ORIGIN}/r/{id}.",
    )
    color: str = Field(default="#000000", description="Hex color for QR modules, e.g. #000000.")


class QRCodeUpdate(BaseModel):
    title: str | None = None
    location_id: uuid.UUID | None = None
    survey_id: uuid.UUID | None = None
    is_active: bool | None = None
    color: str | None = None
    updated_at: datetime


class QRCodeAssetUrls(BaseModel):
    svg: str
    png: str


class QRCodeResponse(BaseModel):
    id: uuid.UUID
    title: str
    location_survey_id: uuid.UUID
    survey_id: uuid.UUID
    survey_title: str | None
    qr_status: str = Field(description="QR code only: active, inactive, or deleted.")
    location_survey_status: str = Field(
        description="Linked location–survey assignment: active, scheduled, inactive, or deleted.",
    )
    accepting_submissions_by_survey_and_location: bool = Field(
        description="True when the linked survey is published (active, not deleted) and the location is active (not deleted).",
    )
    location_id: uuid.UUID
    location_name: str | None
    start_date: str | None = None
    end_date: str | None = None
    is_active: bool
    redirect_url: str | None = None
    color: str = "#000000"
    assets: QRCodeAssetUrls | None = None
    created_at: str
    updated_at: str
    # Deprecated: use location_survey_status / qr_status instead
    location_status: str | None = None
    assignment_status: str | None = None


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


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str


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
    updated_at: datetime


class SurveyStatusTransition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    updated_at: datetime


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
    has_photo: bool = False
    question_id: str | None = None
    position: int
    question_type: str | None = None
    sentiment: str | None = None


class AnalyticsResponseDetail(BaseModel):
    response_id: uuid.UUID
    survey_name: str
    answers: list[AnalyticsAnswerDetail]
    flow_runs: list["FlowRunResponse"] = Field(default_factory=list)


class PhotoSignedUrlResponse(BaseModel):
    signed_url: str
    expires_in_seconds: int


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
    nps = "nps"
    sentiment = "sentiment"
    not_empty = "not_empty"
    checkbox = "checkbox"
    multiple_choice = "multiple_choice"
    yes_no = "yes_no"


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
    terminate = "terminate"


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
    config: dict[str, Any] | None = None


class RuleGroupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = None
    operator: RuleGroupOperator


_NUMERIC_OPERATORS = {RuleOperator.lt, RuleOperator.lte, RuleOperator.eq, RuleOperator.gte, RuleOperator.gt}


class RuleConditionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = None
    condition_type: RuleConditionType
    question_id: uuid.UUID | None = None
    operator: RuleOperator | None = None
    value: str | list[str] | None = None
    group_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_shape(self):
        ct = self.condition_type

        # not_empty: presence check only — no operator or value
        if ct == RuleConditionType.not_empty:
            if self.question_id is None:
                raise ValueError("not_empty conditions require question_id")
            if self.operator is not None or self.value is not None:
                raise ValueError("not_empty conditions cannot define operator or value")
            return self

        # All remaining types require question_id
        if self.question_id is None:
            raise ValueError("condition question_id is required")

        # Numeric comparison: rating (star), nps
        if ct in {RuleConditionType.rating, RuleConditionType.nps}:
            if self.operator not in _NUMERIC_OPERATORS:
                raise ValueError(f"{ct.value} conditions require a numeric comparison operator (lt/lte/eq/gte/gt)")
            if self.value is None or isinstance(self.value, list) or not str(self.value).strip():
                raise ValueError(f"{ct.value} conditions require a numeric value")
            try:
                float(str(self.value).strip())
            except ValueError as exc:
                raise ValueError(f"{ct.value} conditions require a numeric value") from exc
            return self

        # Sentiment: is operator + allowed enum value
        if ct == RuleConditionType.sentiment:
            if self.operator != RuleOperator.is_:
                raise ValueError("sentiment conditions require the 'is' operator")
            if self.value is None or isinstance(self.value, list) or not str(self.value).strip():
                raise ValueError("sentiment conditions require a value")
            try:
                SentimentValue(str(self.value).strip().lower())
            except ValueError as exc:
                raise ValueError("sentiment conditions must target positive, neutral, or negative") from exc
            return self

        # Multiple choice: single string option, is operator
        if ct == RuleConditionType.multiple_choice:
            if self.operator != RuleOperator.is_:
                raise ValueError("multiple_choice conditions require the 'is' operator")
            if self.value is None or isinstance(self.value, list) or not str(self.value).strip():
                raise ValueError("multiple_choice conditions require a single option value")
            return self

        # Yes/No: strictly "yes" or "no", is operator
        if ct == RuleConditionType.yes_no:
            if self.operator != RuleOperator.is_:
                raise ValueError("yes_no conditions require the 'is' operator")
            if self.value is None or isinstance(self.value, list):
                raise ValueError("yes_no conditions require a value of 'yes' or 'no'")
            if str(self.value).strip().lower() not in {"yes", "no"}:
                raise ValueError("yes_no conditions require value 'yes' or 'no'")
            return self

        # Checkbox: non-empty list of option strings, is operator
        if ct == RuleConditionType.checkbox:
            if self.operator != RuleOperator.is_:
                raise ValueError("checkbox conditions require the 'is' operator")
            if not isinstance(self.value, list) or len(self.value) == 0:
                raise ValueError("checkbox conditions require a non-empty list of option values")
            if not all(isinstance(v, str) and v.strip() for v in self.value):
                raise ValueError("checkbox condition values must be non-empty strings")
            return self

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
    updated_at: datetime


class RuleGroupResponse(BaseModel):
    id: uuid.UUID
    operator: RuleGroupOperator
    created_at: str


class RuleConditionResponse(BaseModel):
    id: uuid.UUID
    condition_type: RuleConditionType
    question_id: uuid.UUID | None
    operator: RuleOperator | None
    value: str | list[str] | None
    group_id: uuid.UUID | None
    created_at: str


class RuleResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    survey_id: uuid.UUID
    name: str
    description: str | None = None
    operator: RuleGroupOperator
    status: str = "active"
    broken_reasons: list[dict] = Field(default_factory=list)
    groups: list[RuleGroupResponse] = Field(default_factory=list)
    conditions: list[RuleConditionResponse] = Field(default_factory=list)
    created_at: str
    updated_at: str


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
    updated_at: datetime

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
    created_at: str


class NotificationGroupResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    created_at: str
    updated_at: str
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

        if self.node_type == FlowNodeType.terminate:
            if self.rule_id is not None:
                raise ValueError("terminate nodes cannot define rule_id")
            if self.action_type is not None:
                raise ValueError("terminate nodes cannot define action_type")
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


FLOW_RULE_DUPLICATE_ON_PATH_MESSAGE = (
    "The same survey rule cannot be used on more than one Rule step on a single path "
    "from the start of the flow. Add a branch so each path only includes that rule once."
)


def assert_flow_rule_survey_ids_unique_per_path(
    node_key_map: dict[uuid.UUID, FlowNodeCreate],
    children_by_parent: dict[uuid.UUID | None, list[tuple[uuid.UUID, FlowNodeCreate]]],
    root_id: uuid.UUID,
) -> None:
    """Raise ValueError if the same survey rule_id appears on more than one rule node along one root-to-leaf path."""

    def walk(node_id: uuid.UUID, path_rule_ids: frozenset[uuid.UUID]) -> None:
        node = node_key_map[node_id]
        if node.node_type == FlowNodeType.rule:
            rid = node.rule_id
            if rid is not None:
                if rid in path_rule_ids:
                    raise ValueError(FLOW_RULE_DUPLICATE_ON_PATH_MESSAGE)
                next_path = path_rule_ids.union({rid})
            else:
                next_path = path_rule_ids
            for child_id, _ in children_by_parent.get(node_id, []):
                walk(child_id, next_path)
            return
        if node.node_type == FlowNodeType.branch:
            for child_id, _ in children_by_parent.get(node_id, []):
                walk(child_id, path_rule_ids)
            return
        if node.node_type == FlowNodeType.action:
            ch = children_by_parent.get(node_id, [])
            if not ch:
                return
            walk(ch[0][0], path_rule_ids)
            return
        if node.node_type == FlowNodeType.terminate:
            return

    walk(root_id, frozenset())


class CreateFlow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=240)
    is_active: bool = False
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
            if node.node_type == FlowNodeType.terminate:
                if len(children) > 0:
                    raise ValueError("terminate nodes cannot have children")
            elif node.node_type == FlowNodeType.action:
                if len(children) > 1:
                    raise ValueError("action nodes can have at most one child")
                if len(children) == 1:
                    child_id, child = children[0]
                    if child.node_type not in (FlowNodeType.action, FlowNodeType.terminate) or child.branch_type is not None:
                        raise ValueError("action nodes may only chain to another action or terminate node")
            if node.node_type == FlowNodeType.rule:
                if len(children) != 1:
                    raise ValueError("rule nodes must have exactly one child")
                if children[0][1].branch_type is not None:
                    raise ValueError("rule node children cannot define branch_type")
            elif node.node_type == FlowNodeType.branch:
                if len(children) != 2:
                    if len(children) > 2:
                        raise ValueError(
                            "branch nodes must have exactly two children (one TRUE, one FALSE); "
                            "extra children often mean a step was inserted on an edge without preserving True/False"
                        )
                    raise ValueError("branch nodes must define both TRUE and FALSE children")
                branch_values = [child.branch_type for _, child in children]
                if sorted(branch_values) != [FlowBranchType.FALSE, FlowBranchType.TRUE]:
                    raise ValueError(
                        "branch children must set branch_type to TRUE or FALSE (one of each); "
                        "steps directly under a branch cannot omit branch_type"
                    )
            else:
                for _, child in children:
                    if child.branch_type is not None:
                        raise ValueError("only branch node children can define branch_type")

        def branch_condition_rule_uuids(branch_node: FlowNodeCreate) -> list[uuid.UUID]:
            config = branch_node.config or {}
            raw_conditions = config.get("rule_conditions")
            out: list[uuid.UUID] = []
            if isinstance(raw_conditions, list):
                for rc in raw_conditions:
                    if isinstance(rc, dict) and rc.get("rule_id") is not None:
                        out.append(uuid.UUID(str(rc["rule_id"])))
                return out
            raw_rule_ids = config.get("rule_ids")
            if isinstance(raw_rule_ids, list):
                for x in raw_rule_ids:
                    out.append(uuid.UUID(str(x)))
            return out

        root_id = roots[0].id or uuid.uuid5(uuid.NAMESPACE_URL, "flow-root")
        assert_flow_rule_survey_ids_unique_per_path(node_key_map, children_by_parent, root_id)

        for _, branch_node in node_key_map.items():
            if branch_node.node_type != FlowNodeType.branch:
                continue
            allowed_upstream: set[uuid.UUID] = set()
            ancestor_id = branch_node.parent_id
            while ancestor_id is not None:
                ancestor = node_key_map[ancestor_id]
                if ancestor.node_type == FlowNodeType.rule and ancestor.rule_id is not None:
                    allowed_upstream.add(ancestor.rule_id)
                ancestor_id = ancestor.parent_id
            for cond_rule_id in branch_condition_rule_uuids(branch_node):
                if cond_rule_id not in allowed_upstream:
                    raise ValueError(
                        "branch checks may only reference rules from rule nodes above the branch in the flow"
                    )

        def walk_redirect_limit(node_id: uuid.UUID, redirects_seen: int) -> None:
            node = node_key_map[node_id]
            if node.node_type == FlowNodeType.terminate:
                return
            if node.node_type == FlowNodeType.rule:
                children = children_by_parent.get(node_id, [])
                if len(children) != 1:
                    return
                walk_redirect_limit(children[0][0], redirects_seen)
                return
            if node.node_type == FlowNodeType.branch:
                for child_id, _ in children_by_parent.get(node_id, []):
                    walk_redirect_limit(child_id, redirects_seen)
                return
            if node.node_type == FlowNodeType.action:
                next_count = redirects_seen + (
                    1 if node.action_type == FlowActionType.redirect else 0
                )
                if next_count > 1:
                    raise ValueError(
                        "each path through the flow may include at most one webpage redirect action"
                    )
                children = children_by_parent.get(node_id, [])
                if not children:
                    return
                walk_redirect_limit(children[0][0], next_count)
                return

        def walk(node_id: uuid.UUID) -> None:
            node = node_key_map[node_id]
            children = children_by_parent.get(node_id, [])
            if node.node_type == FlowNodeType.terminate:
                return
            if node.node_type == FlowNodeType.action:
                if not children:
                    return
                if len(children) != 1:
                    raise ValueError("action chains must be linear")
                walk(children[0][0])
                return
            if not children:
                raise ValueError("every flow path must end with an action or terminate node")
            for child_id, _ in children:
                walk(child_id)

        walk_redirect_limit(root_id, 0)
        walk(root_id)
        return self


class UpdateFlow(CreateFlow):
    updated_at: datetime


class SetFlowActive(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_active: bool
    updated_at: datetime


class FlowNodeResponse(BaseModel):
    id: uuid.UUID
    parent_id: uuid.UUID | None
    node_type: FlowNodeType
    rule_id: uuid.UUID | None
    branch_type: FlowBranchType | None
    action_type: FlowActionType | None
    config: dict[str, Any] | None
    position: int
    created_at: str


class FlowResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    survey_id: uuid.UUID
    survey_name: str
    name: str
    description: str | None = None
    is_active: bool
    status: str = "active"
    broken_reasons: list[dict] = Field(default_factory=list)
    location_survey_ids: list[uuid.UUID] = Field(default_factory=list)
    nodes: list[FlowNodeResponse] = Field(default_factory=list)
    created_at: str
    updated_at: str


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
    actions: list[FlowActionResult] = Field(default_factory=list)


class FlowRunActionResponse(BaseModel):
    id: uuid.UUID
    action_type: str
    config: dict[str, Any]
    created_at: str


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
    location_id: uuid.UUID | None = None
    location_name: str | None = None
    qr_code_id: uuid.UUID | None
    qr_code_title: str | None = None
    actions: list[FlowRunActionResponse] = Field(default_factory=list)
    runtime_ms: int | None = None
    execution_trace: dict[str, Any]
    created_at: str


class FlowRunListResponse(BaseModel):
    items: list[FlowRunResponse]
    total: int
    page: int
    page_size: int


AnalyticsResponseDetail.model_rebuild()


# ── Survey Dashboard ──────────────────────────────────────────────────────────

from datetime import date as _date  # noqa: E402 — local alias to avoid shadowing datetime


class DashboardFilterParams(BaseModel):
    location_ids: list[uuid.UUID] | None = None
    qr_code_ids: list[uuid.UUID] | None = None
    date_start: datetime | None = None
    date_end: datetime | None = None


class DailyNumericPoint(BaseModel):
    date: _date
    avg_value: float | None
    count: int


class DailySentimentPoint(BaseModel):
    date: _date
    positive: int
    neutral: int
    negative: int
    total: int


class DailyDistributionPoint(BaseModel):
    date: _date
    distribution: dict[str, float]  # option_key → % of daily total
    total: int


class RatingDistribution(BaseModel):
    buckets: dict[str, int]  # "1"–"5" → count
    total: int


class ChoiceDistribution(BaseModel):
    buckets: dict[str, int]  # option_key → count
    total: int


class SentimentDistribution(BaseModel):
    positive: int
    neutral: int
    negative: int
    total: int


class QuestionAggregation(BaseModel):
    stable_question_id: uuid.UUID
    question_text: str
    question_type: str
    config: dict | None = None
    position: int
    total_responses: int
    # star
    rating_distribution: RatingDistribution | None = None
    daily_avg: list[DailyNumericPoint] | None = None
    # nps
    daily_nps_avg: list[DailyNumericPoint] | None = None
    # text / long_text
    sentiment_distribution: SentimentDistribution | None = None
    daily_sentiment: list[DailySentimentPoint] | None = None
    # multiple_choice / checkbox
    choice_distribution: ChoiceDistribution | None = None
    daily_choices: list[DailyDistributionPoint] | None = None
    # yes_no
    yes_no_distribution: ChoiceDistribution | None = None
    daily_yes_pct: list[DailyNumericPoint] | None = None
    # email / phone
    daily_count: list[DailyNumericPoint] | None = None
    # photo
    photo_count: int | None = None
    photo_urls: list[str] | None = None


class DailyCompletionPoint(BaseModel):
    date: _date  # serialised to "YYYY-MM-DD"
    scans: int
    completions: int
    rate: float | None  # None when scans == 0


class EngagementData(BaseModel):
    total_scans: int
    total_completions: int
    daily_completion_rate: list[DailyCompletionPoint]


class SurveyDashboardResponse(BaseModel):
    survey_id: uuid.UUID
    survey_name: str
    date_start: str
    date_end: str
    questions: list[QuestionAggregation]
    engagement: EngagementData


class OldQuestionsDashboardResponse(BaseModel):
    survey_id: uuid.UUID
    questions: list[QuestionAggregation]


# ── Breakdown (expanded chart drill-down) ─────────────────────────────────────


class BreakdownSeries(BaseModel):
    series_id: uuid.UUID
    series_name: str
    aggregation: QuestionAggregation


class QuestionBreakdownResponse(BaseModel):
    stable_question_id: str
    breakdown_by: Literal["location", "qr_code"]
    series: list[BreakdownSeries]


class EngagementBreakdownSeries(BaseModel):
    series_id: uuid.UUID
    series_name: str
    total_scans: int
    total_completions: int
    daily_completion_rate: list[DailyCompletionPoint]


class EngagementBreakdownResponse(BaseModel):
    breakdown_by: Literal["location", "qr_code"]
    series: list[EngagementBreakdownSeries]


class NewResponseNotification(BaseModel):
    response_id: str
    survey_name: str
    location_name: str
    submitted_at: datetime


class NewResponsesResponse(BaseModel):
    responses: list[NewResponseNotification]
