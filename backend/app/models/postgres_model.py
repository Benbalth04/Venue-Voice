import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    String,
    Text,
    DateTime,
    ForeignKey,
    Enum,
    Boolean,
    Integer,
    Numeric,
    Float,
    CheckConstraint,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
import enum


class Base(DeclarativeBase):
    pass


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)


# --------------------------------------------------
# ENUMS
# --------------------------------------------------

class SurveyStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    archived = "archived"


# --------------------------------------------------
# USERS
# --------------------------------------------------
class User(SoftDeleteMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4()
    )

    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String, nullable=False)
    last_name: Mapped[str] = mapped_column(String, nullable=False)
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now()
    )

    companies = relationship("Company", back_populates="owner")


# --------------------------------------------------
# COMPANIES
# --------------------------------------------------

class Company(SoftDeleteMixin, Base):
    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4()
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    name: Mapped[str] = mapped_column(String, nullable=False)
    primary_industry: Mapped[str | None] = mapped_column(String, nullable=True)
    company_size: Mapped[str | None] = mapped_column(String, nullable=True)
    location_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    how_heard: Mapped[str | None] = mapped_column(String, nullable=True)
    thank_you_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now()
    )

    owner = relationship("User", back_populates="companies")
    locations = relationship("Location", back_populates="company")
    surveys = relationship("Survey", back_populates="company")


# --------------------------------------------------
# LOCATIONS
# --------------------------------------------------

class Location(SoftDeleteMixin, Base):
    __tablename__ = "locations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4()
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    state: Mapped[str | None] = mapped_column(String, nullable=True)
    country: Mapped[str | None] = mapped_column(String, nullable=True)
    google_business_url: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    company = relationship("Company", back_populates="locations")
    location_surveys = relationship("LocationSurvey", back_populates="location")
    notification_group_links = relationship(
        "LocationNotificationGroup",
        back_populates="location",
        cascade="all, delete-orphan",
    )


# --------------------------------------------------
# LOCATION SNAPSHOTS
# --------------------------------------------------

class LocationSnapshot(SoftDeleteMixin, Base):
    __tablename__ = "location_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4()
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    state: Mapped[str | None] = mapped_column(String, nullable=True)
    country: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# --------------------------------------------------
# SURVEYS
# --------------------------------------------------

class Survey(SoftDeleteMixin, Base):
    __tablename__ = "surveys"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4()
    )

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[SurveyStatus] = mapped_column(
        Enum(SurveyStatus),
        default=SurveyStatus.draft,
        nullable=False
    )
    latest_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    company = relationship("Company", back_populates="surveys")
    location_surveys = relationship("LocationSurvey", back_populates="survey")
    rules = relationship("Rule", back_populates="survey", cascade="all, delete-orphan")
    flows = relationship("Flow", back_populates="survey", cascade="all, delete-orphan")


# --------------------------------------------------
# SURVEY VERSIONS
# --------------------------------------------------

class SurveyVersion(SoftDeleteMixin, Base):
    __tablename__ = "survey_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4()
    )
    survey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("surveys.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    schema_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    theme_settings: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# --------------------------------------------------
# QUESTION TYPES
# --------------------------------------------------
class QuestionType(SoftDeleteMixin, Base):
    __tablename__ = "question_types"

    type: Mapped[str] = mapped_column(String, primary_key=True)
    category: Mapped[str] = mapped_column(String, nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    is_numeric: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    analyse_with_ai: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


# --------------------------------------------------
# QUESTION TYPE SETTINGS (defines settings per question type)
# --------------------------------------------------
class QuestionTypeSetting(SoftDeleteMixin, Base):
    __tablename__ = "question_type_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    question_type: Mapped[str] = mapped_column(
        String,
        ForeignKey("question_types.type", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    setting_key: Mapped[str] = mapped_column(String, nullable=False)
    setting_label: Mapped[str] = mapped_column(String, nullable=False)
    setting_type: Mapped[str] = mapped_column(String, nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    default_value: Mapped[str | None] = mapped_column(String, nullable=True)
    allowed_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    validation_rules: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


# --------------------------------------------------
# QUESTIONS
# --------------------------------------------------

class Question(SoftDeleteMixin, Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4()
    )
    survey_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("survey_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    question_key: Mapped[str] = mapped_column(String, nullable=False)
    question_text: Mapped[str] = mapped_column(String, nullable=False)
    question_type: Mapped[str] = mapped_column(
        String,
        ForeignKey("question_types.type", ondelete="RESTRICT"),
        nullable=False,
    )
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    is_numeric: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    rule_conditions = relationship("RuleCondition", back_populates="question")

# --------------------------------------------------
# ANSWERS (legacy responses - one row per question)
# --------------------------------------------------
class Answer(SoftDeleteMixin, Base):
    __tablename__ = "answers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    response_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("responses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    text_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    numeric_value: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "(text_value IS NOT NULL AND numeric_value IS NULL) "
            "OR (text_value IS NULL AND numeric_value IS NOT NULL)",
            name="answers_value_check",
        ),
    )


# --------------------------------------------------
# LOCATION SURVEYS
# --------------------------------------------------
class LocationSurvey(SoftDeleteMixin, Base):
    __tablename__ = "location_surveys"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4()
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id"),
        nullable=False,
        index=True,
    )
    survey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("surveys.id"),
        nullable=False,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    start_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    end_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("location_id", "survey_id", name="unique_location_survey"),
    )

    location: Mapped["Location"] = relationship("Location", back_populates="location_surveys", lazy="joined")
    survey: Mapped["Survey"] = relationship("Survey", back_populates="location_surveys", lazy="joined")
    qr_codes = relationship("QRCode", back_populates="location_survey")
    flow_links = relationship(
        "FlowLocationSurvey",
        back_populates="location_survey",
        cascade="all, delete-orphan",
    )
    flow_runs = relationship("FlowRun", back_populates="location_survey")

    def is_effectively_active(self, now: datetime) -> bool:
        if getattr(self, "deleted_at", None) is not None:
            return False
        if not self.is_active:
            return False
        if now < self.start_date:
            return False
        if self.end_date is not None and now > self.end_date:
            return False
        return True


# --------------------------------------------------
# QR CODES
# --------------------------------------------------
class QRCode(SoftDeleteMixin, Base):
    __tablename__ = "qr_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4()
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    title: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    location_survey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("location_surveys.id"),
        nullable=False,
        index=True
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id"),
        nullable=False,
        index=True
    )
    redirect_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_logo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    location_survey: Mapped["LocationSurvey"] = relationship(
        "LocationSurvey",
        lazy="joined",
        uselist=False,
        foreign_keys=[location_survey_id],
        back_populates="qr_codes",
    )
    location: Mapped["Location"] = relationship("Location", lazy="joined", uselist=False, foreign_keys=[location_id])
    flow_runs = relationship("FlowRun", back_populates="qr_code")
    assets: Mapped[list["QRCodeAsset"]] = relationship(
        "QRCodeAsset",
        back_populates="qr_code",
        lazy="selectin",
        cascade="all, delete-orphan",
    )


class QRCodeAsset(Base):
    __tablename__ = "qr_code_assets"
    __table_args__ = (
        UniqueConstraint("qr_code_id", "format", name="uq_qr_code_assets_qr_code_id_format"),
        CheckConstraint(
            "format IN ('svg', 'png', 'jpeg')",
            name="ck_qr_code_assets_format",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    qr_code_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("qr_codes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    format: Mapped[str] = mapped_column(String(8), nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    public_url: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    qr_code: Mapped["QRCode"] = relationship("QRCode", back_populates="assets")


# --------------------------------------------------
# SCAN EVENTS
# --------------------------------------------------

class ScanEvent(SoftDeleteMixin, Base):
    __tablename__ = "scan_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4()
    )
    qr_code_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("qr_codes.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    location_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("location_snapshots.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    scanned_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    ip_address: Mapped[str | None] = mapped_column(String, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String, nullable=True)
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)


class SurveySession(SoftDeleteMixin, Base):
    __tablename__ = "survey_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4()
    )
    scan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scan_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    survey_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("survey_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    qr_code_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("qr_codes.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    location_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("location_snapshots.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    start_time: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    end_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    abandoned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    device_type: Mapped[str | None] = mapped_column(String, nullable=True)
    browser: Mapped[str | None] = mapped_column(String, nullable=True)
    hashed_ip_address: Mapped[str | None] = mapped_column(String, nullable=True)


class SurveyResponse(SoftDeleteMixin, Base):
    __tablename__ = "survey_responses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4()
    )
    survey_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("survey_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("survey_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    qr_code_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("qr_codes.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    location_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("location_snapshots.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    answers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    completion_datetime: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    time_taken_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    device_type: Mapped[str | None] = mapped_column(String, nullable=True)
    browser: Mapped[str | None] = mapped_column(String, nullable=True)
    hashed_ip_address: Mapped[str | None] = mapped_column(String, nullable=True)

    flow_runs = relationship("FlowRun", back_populates="response")


# --------------------------------------------------
# SURVEY RESPONSE ANSWERS (normalized answers for public survey flow)
# --------------------------------------------------
class SurveyResponseAnswer(SoftDeleteMixin, Base):
    __tablename__ = "survey_response_answers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    survey_response_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("survey_responses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    text_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    numeric_value: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "(text_value IS NOT NULL AND numeric_value IS NULL) "
            "OR (text_value IS NULL AND numeric_value IS NOT NULL)",
            name="survey_response_answers_value_check",
        ),
    )


# --------------------------------------------------
# SURVEY RESPONSE PHOTOS (metadata for uploaded photos)
# --------------------------------------------------
class SurveyResponsePhoto(Base):
    __tablename__ = "survey_response_photos"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    survey_response_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("survey_responses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# --------------------------------------------------
# AI ANALYSIS (sentiment per survey answer)
# --------------------------------------------------
class AIAnalysis(SoftDeleteMixin, Base):
    __tablename__ = "ai_analysis"
    __table_args__ = (
        UniqueConstraint(
            "survey_response_id",
            "question_id",
            name="uq_ai_analysis_response_question",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
    )
    survey_response_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("survey_responses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questions.id", ondelete="SET NULL"),
        nullable=True,
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    raw_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    analysis: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    sentiment: Mapped[str | None] = mapped_column(String, nullable=True)
    sentiment_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    model: Mapped[str | None] = mapped_column(String, nullable=True)
    model_version: Mapped[str | None] = mapped_column(String, nullable=True)
    analysis_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )
    status: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default="pending",
        server_default="pending",
    )
    processing_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
    )


# --------------------------------------------------
# RULES / FLOWS / NOTIFICATION GROUPS
# --------------------------------------------------
class Rule(SoftDeleteMixin, Base):
    __tablename__ = "rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String(240), nullable=True)
    operator: Mapped[str] = mapped_column(String, nullable=False, default="AND", server_default="AND")
    status: Mapped[str] = mapped_column(String, nullable=False, default="active", server_default="active")
    broken_reasons: Mapped[list] = mapped_column(JSONB, nullable=True, default=list, server_default="[]")
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    survey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("surveys.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    survey = relationship("Survey", back_populates="rules")
    conditions = relationship("RuleCondition", back_populates="rule", cascade="all, delete-orphan")
    groups = relationship("RuleGroup", back_populates="rule", cascade="all, delete-orphan")
    flow_nodes = relationship("FlowNode", back_populates="rule")


class RuleGroup(Base):
    __tablename__ = "rule_groups"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    operator: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    rule = relationship("Rule", back_populates="groups")
    conditions = relationship("RuleCondition", back_populates="group")


class RuleCondition(SoftDeleteMixin, Base):
    __tablename__ = "rule_conditions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    condition_type: Mapped[str] = mapped_column(String, nullable=False)
    question_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    operator: Mapped[str | None] = mapped_column(String, nullable=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rule_groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    rule = relationship("Rule", back_populates="conditions")
    group = relationship("RuleGroup", back_populates="conditions")
    question = relationship("Question", back_populates="rule_conditions")


class NotificationGroup(SoftDeleteMixin, Base):
    __tablename__ = "notification_groups"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    members = relationship(
        "NotificationGroupMember",
        back_populates="group",
        cascade="all, delete-orphan",
    )
    location_links = relationship(
        "LocationNotificationGroup",
        back_populates="group",
        cascade="all, delete-orphan",
    )


class NotificationGroupMember(SoftDeleteMixin, Base):
    __tablename__ = "notification_group_members"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notification_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    group = relationship("NotificationGroup", back_populates="members")


class LocationNotificationGroup(Base):
    __tablename__ = "location_notification_groups"
    __table_args__ = (
        UniqueConstraint("location_id", "group_id", name="uq_location_notification_group"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notification_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    location = relationship("Location", back_populates="notification_group_links")
    group = relationship("NotificationGroup", back_populates="location_links")


class Flow(SoftDeleteMixin, Base):
    __tablename__ = "flows"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String(240), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    survey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("surveys.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    survey = relationship("Survey", back_populates="flows")
    location_surveys = relationship(
        "FlowLocationSurvey",
        back_populates="flow",
        cascade="all, delete-orphan",
    )
    nodes = relationship("FlowNode", back_populates="flow", cascade="all, delete-orphan")
    runs = relationship("FlowRun", back_populates="flow")


class FlowLocationSurvey(Base):
    __tablename__ = "flow_location_surveys"
    __table_args__ = (
        UniqueConstraint("flow_id", "location_survey_id", name="uq_flow_location_survey"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    flow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("flows.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_survey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("location_surveys.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    flow = relationship("Flow", back_populates="location_surveys")
    location_survey = relationship("LocationSurvey", back_populates="flow_links")


class FlowNode(Base):
    __tablename__ = "flow_nodes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    flow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("flows.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("flow_nodes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    node_type: Mapped[str] = mapped_column(String, nullable=False)
    rule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rules.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    branch_type: Mapped[str | None] = mapped_column(String, nullable=True)
    action_type: Mapped[str | None] = mapped_column(String, nullable=True)
    action_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    flow = relationship("Flow", back_populates="nodes")
    parent = relationship("FlowNode", remote_side=[id], back_populates="children")
    children = relationship("FlowNode", back_populates="parent", cascade="all, delete-orphan")
    rule = relationship("Rule", back_populates="flow_nodes")


class FlowRun(Base):
    __tablename__ = "flow_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    flow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("flows.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    response_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("survey_responses.id", ondelete="SET NULL"),
        nullable=True,
    )
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    location_survey_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("location_surveys.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    qr_code_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("qr_codes.id", ondelete="SET NULL"),
        nullable=True,
    )
    execution_trace: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    action_executed: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    flow = relationship("Flow", back_populates="runs")
    response = relationship("SurveyResponse", back_populates="flow_runs")
    location_survey = relationship("LocationSurvey", back_populates="flow_runs")
    qr_code = relationship("QRCode", back_populates="flow_runs")
    email_events = relationship("EmailEvent", back_populates="flow_run")


class EmailEvent(Base):
    __tablename__ = "email_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    flow_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("flow_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    recipient_email: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    flow_run = relationship("FlowRun", back_populates="email_events")


# --------------------------------------------------
# RESPONSE READS (user has viewed response answers)
# --------------------------------------------------
class ResponseRead(SoftDeleteMixin, Base):
    __tablename__ = "response_reads"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    response_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("survey_responses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    read_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())