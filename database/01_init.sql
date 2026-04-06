-- Enable UUID support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--------------------------------------------------
-- USERS
--------------------------------------------------

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    onboarding_complete BOOLEAN DEFAULT FALSE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Australia/Brisbane',
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

--------------------------------------------------
-- COMPANIES
--------------------------------------------------

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    primary_industry TEXT,
    company_size TEXT,
    location_count INTEGER,
    how_heard TEXT,
    thank_you_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

--------------------------------------------------
-- LOCATIONS
--------------------------------------------------

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    state TEXT,
    country TEXT,
    google_business_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL,
    UNIQUE(company_id, name)
);

--------------------------------------------------
-- SURVEYS
--------------------------------------------------

CREATE TABLE surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('draft','active','archived')
    ) DEFAULT 'draft',
    latest_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL,
    UNIQUE(company_id, name)
);

--------------------------------------------------
-- SURVEY VERSIONS
--------------------------------------------------

CREATE TABLE location_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id),
    survey_id UUID NOT NULL REFERENCES surveys(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    start_date TIMESTAMP NOT NULL DEFAULT NOW(),
    end_date TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL,
    CONSTRAINT unique_location_survey UNIQUE (location_id, survey_id)
);

--------------------------------------------------
-- SURVEY VERSIONS
--------------------------------------------------

CREATE TABLE survey_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    schema_json JSONB NOT NULL,
    created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    theme_settings JSONB,
    deleted_at TIMESTAMP NULL,
    UNIQUE(survey_id, version_number)
);

--------------------------------------------------
-- QUESTION TYPES
--------------------------------------------------
CREATE TABLE question_types (
    type TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    label TEXT NOT NULL,
    is_numeric BOOLEAN NOT NULL DEFAULT FALSE, 
    analyse_with_ai BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP NULL
);

--------------------------------------------------
-- QUESTION TYPE SETTINGS
--------------------------------------------------
CREATE TABLE IF NOT EXISTS question_type_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_type TEXT NOT NULL REFERENCES question_types(type) ON DELETE CASCADE,
    setting_key TEXT NOT NULL,
    setting_label TEXT NOT NULL,
    setting_type TEXT NOT NULL,
    required BOOLEAN NOT NULL DEFAULT FALSE,
    default_value TEXT,
    allowed_values JSONB,
    validation_rules JSONB,
    deleted_at TIMESTAMP NULL,
    UNIQUE(question_type, setting_key)
);

--------------------------------------------------
-- QUESTIONS
--------------------------------------------------
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stable_question_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    survey_version_id UUID NOT NULL REFERENCES survey_versions(id) ON DELETE CASCADE,
    question_key TEXT NOT NULL,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL REFERENCES question_types(type) ON DELETE RESTRICT,
    config JSONB,
    position INTEGER NOT NULL,
    is_numeric BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP NULL
);
CREATE INDEX idx_questions_stable_question_id ON questions(stable_question_id);

--------------------------------------------------
-- QR CODES
--------------------------------------------------
CREATE TABLE qr_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    location_survey_id UUID NOT NULL REFERENCES location_surveys(id),
    location_id UUID NOT NULL REFERENCES locations(id),
    redirect_url TEXT NULL,
    has_logo BOOLEAN DEFAULT TRUE NOT NULL,
    color TEXT NOT NULL DEFAULT '#000000',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);


--------------------------------------------------
-- STATIC QR CODE ASSETS (metadata about QR codes stored in Supabase)
--------------------------------------------------
CREATE TABLE qr_code_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
    format TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT ck_qr_code_assets_format CHECK (format IN ('svg', 'png')),
    CONSTRAINT uq_qr_code_assets_qr_code_id_format UNIQUE (qr_code_id, format)
);

--------------------------------------------------
-- LOCATION SNAPSHOTS
--------------------------------------------------
CREATE TABLE location_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    state TEXT,
    country TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

--------------------------------------------------
-- SCAN EVENTS
--------------------------------------------------

CREATE TABLE scan_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    location_snapshot_id UUID REFERENCES location_snapshots(id) ON DELETE SET NULL,
    scanned_at TIMESTAMP DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT,
    session_id UUID,
    deleted_at TIMESTAMP NULL
);

--------------------------------------------------
-- SURVEY SESSIONS
--------------------------------------------------

CREATE TABLE survey_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scan_id UUID NOT NULL REFERENCES scan_events(id) ON DELETE CASCADE,
    survey_version_id UUID NOT NULL REFERENCES survey_versions(id) ON DELETE CASCADE,
    qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE SET NULL,
    location_snapshot_id UUID REFERENCES location_snapshots(id) ON DELETE SET NULL,
    start_time TIMESTAMP NOT NULL DEFAULT NOW(),
    end_time TIMESTAMP,
    abandoned BOOLEAN NOT NULL DEFAULT FALSE,
    device_type TEXT,
    browser TEXT,
    hashed_ip_address TEXT,
    deleted_at TIMESTAMP NULL
);

--------------------------------------------------
-- SURVEY REDIRECT IDEMPOTENCY (prevent duplicate sessions per scan)
--------------------------------------------------
CREATE TABLE IF NOT EXISTS survey_redirect_idempotency (
    idempotency_key TEXT PRIMARY KEY,
    scan_id UUID NOT NULL REFERENCES scan_events(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES survey_sessions(id) ON DELETE CASCADE,
    redirect_url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

--------------------------------------------------
-- SURVEY RESPONSES
--------------------------------------------------
CREATE TABLE survey_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_version_id UUID NOT NULL REFERENCES survey_versions(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES survey_sessions(id) ON DELETE CASCADE,
    qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
    location_snapshot_id UUID REFERENCES location_snapshots(id) ON DELETE SET NULL,
    answers JSONB NOT NULL DEFAULT '{}',
    completion_datetime TIMESTAMP NOT NULL DEFAULT NOW(),
    time_taken_seconds INTEGER,
    device_type TEXT,
    browser TEXT,
    hashed_ip_address TEXT,
    deleted_at TIMESTAMP NULL
);

--------------------------------------------------
-- SURVEY RESPONSE ANSWERS (normalized answers for public survey flow)
--------------------------------------------------
CREATE TABLE survey_response_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_response_id UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
    question_id UUID NULL,
    text_value TEXT,
    numeric_value NUMERIC,
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL,
    CHECK (
        (text_value IS NOT NULL AND numeric_value IS NULL)
        OR (text_value IS NULL AND numeric_value IS NOT NULL)
    )
);

--------------------------------------------------
-- SURVEY RESPONSE PHOTOS (metadata for uploaded photos in survey responses)
--------------------------------------------------
CREATE TABLE survey_response_photos (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_response_id  UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
    question_id         UUID NULL,
    storage_path        TEXT NOT NULL,
    mime_type           TEXT NOT NULL,
    file_size_bytes     INTEGER NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ NULL
);
CREATE INDEX idx_survey_response_photos_response_id ON survey_response_photos(survey_response_id);
CREATE INDEX idx_survey_response_photos_response_nodeletion
    ON survey_response_photos(survey_response_id)
    WHERE deleted_at IS NULL;

--------------------------------------------------
-- RESPONSE READS (track which responses each user has viewed)
--------------------------------------------------
CREATE TABLE response_reads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response_id UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
    read_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL,
    UNIQUE(user_id, response_id)
);

--------------------------------------------------
-- RULES
--------------------------------------------------
CREATE TABLE rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description VARCHAR(240),
    operator TEXT NOT NULL DEFAULT 'AND' CHECK (operator IN ('AND', 'OR')),
    survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'broken')),
    broken_reasons JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

--------------------------------------------------
-- Rule Groups
--------------------------------------------------
CREATE TABLE rule_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    operator TEXT NOT NULL CHECK (operator IN ('AND', 'OR')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

--------------------------------------------------
-- RULE CONDITIONS
--------------------------------------------------
CREATE TABLE rule_conditions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    condition_type TEXT NOT NULL CHECK (condition_type IN ('rating', 'nps', 'sentiment', 'not_empty', 'checkbox', 'multiple_choice', 'yes_no')),
    question_id UUID NULL,
    operator TEXT NULL CHECK (operator IS NULL OR operator IN ('lt', 'lte', 'eq', 'gte', 'gt', 'is')),
    value TEXT NULL,
    group_id UUID NULL REFERENCES rule_groups(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

--------------------------------------------------
-- NOTIFICATION GROUPS
--------------------------------------------------
CREATE TABLE notification_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

--------------------------------------------------
-- NOTIFCATION GROUP MEMBERS
--------------------------------------------------
CREATE TABLE notification_group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES notification_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

--------------------------------------------------
-- LOCATION NOTIFICATION GROUPS (i.e. mapping notificaton groups to locations)
--------------------------------------------------
CREATE TABLE location_notification_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES notification_groups(id) ON DELETE CASCADE,
    UNIQUE(location_id, group_id)
);

--------------------------------------------------
-- FLOWS
--------------------------------------------------
CREATE TABLE flows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description VARCHAR(240),
    is_active BOOLEAN DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'broken')),
    broken_reasons JSONB DEFAULT '[]'::jsonb,
    survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

--------------------------------------------------
-- FLOW LOCATION SURVEYS (map flows to location surveys for execution)
--------------------------------------------------
CREATE TABLE flow_location_surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    location_survey_id UUID NOT NULL REFERENCES location_surveys(id) ON DELETE CASCADE,
    UNIQUE(flow_id, location_survey_id)
);

--------------------------------------------------
-- FLOW NODES
--------------------------------------------------
CREATE TABLE flow_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    parent_id UUID NULL REFERENCES flow_nodes(id) ON DELETE CASCADE,
    node_type TEXT NOT NULL CHECK (node_type IN ('rule', 'branch', 'action', 'terminate')),
    rule_id UUID NULL REFERENCES rules(id) ON DELETE RESTRICT,
    branch_type TEXT NULL CHECK (branch_type IS NULL OR branch_type IN ('TRUE', 'FALSE')),
    action_type TEXT NULL CHECK (action_type IS NULL OR action_type IN ('redirect', 'email')),
    action_config JSONB NULL,
    position INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

--------------------------------------------------
-- FLOW RUNS
--------------------------------------------------
CREATE TABLE flow_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    response_id UUID NULL REFERENCES survey_responses(id) ON DELETE SET NULL,
    success BOOLEAN NOT NULL,
    location_survey_id UUID NULL REFERENCES location_surveys(id) ON DELETE SET NULL,
    qr_code_id UUID NULL REFERENCES qr_codes(id) ON DELETE SET NULL,
    execution_trace JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uqflow UNIQUE (flow_id, response_id)
);

--------------------------------------------------
-- FLOW RUN ACTIONS
--------------------------------------------------
CREATE TABLE flow_run_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flow_run_id UUID NOT NULL REFERENCES flow_runs(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (action_type IN ('redirect', 'email')),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

--------------------------------------------------
-- STRIPE WEBHOOK IDEMPOTENCY
--------------------------------------------------
CREATE TABLE stripe_webhook_events (
    stripe_event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    received_at TIMESTAMP NOT NULL DEFAULT NOW()
);

--------------------------------------------------
-- EMAIL EVENTS
--------------------------------------------------
CREATE TABLE email_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    flow_run_id UUID NULL REFERENCES flow_runs(id) ON DELETE SET NULL,
    recipient_email TEXT,
    status TEXT,
    sent_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    event_category TEXT NOT NULL DEFAULT 'user_notification'
        CHECK (event_category IN ('stripe_billing', 'user_notification', 'system')),
    template_name TEXT,
    stripe_event_id TEXT,
    idempotency_key TEXT,
    context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_email_events_idempotency_key UNIQUE (idempotency_key)
);
CREATE INDEX idx_email_events_event_category ON email_events(event_category);
CREATE INDEX idx_email_events_stripe_event_id ON email_events(stripe_event_id) WHERE stripe_event_id IS NOT NULL;

--------------------------------------------------
-- JOB RUNS
--------------------------------------------------
CREATE TABLE job_runs (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_name       TEXT NOT NULL,
    triggered_at   TIMESTAMP NOT NULL,
    completed_at   TIMESTAMP,
    duration_ms    INTEGER,
    status         TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    data           JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_job_runs_job_name     ON job_runs(job_name);
CREATE INDEX idx_job_runs_triggered_at ON job_runs(triggered_at);

--------------------------------------------------
-- AI ANALYSIS
--------------------------------------------------
CREATE TABLE ai_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    company_id UUID REFERENCES companies(id),
    location_id UUID REFERENCES locations(id),

    survey_response_id UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
    question_id UUID NULL,

    -- raw input/output
    prompt TEXT NOT NULL,
    raw_response TEXT,

    -- structured output (empty object until completed)
    analysis JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- key fields (denormalised for speed); NULL when pending or failed
    sentiment TEXT CHECK (sentiment IS NULL OR sentiment IN ('positive', 'neutral', 'negative')),
    sentiment_score FLOAT,

    -- versioning
    model TEXT,
    model_version TEXT,
    analysis_version INTEGER NOT NULL DEFAULT 1,

    -- processing metadata
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    processing_time_ms INTEGER,
    error TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL,

    UNIQUE (survey_response_id, question_id)
);


--------------------------------------------------
-- REDIRECT CONFIRMATIONS
--------------------------------------------------
CREATE TABLE redirect_confirmations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_response_id UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (survey_response_id)
);
CREATE INDEX idx_redirect_confirmations_response_id ON redirect_confirmations(survey_response_id);

--------------------------------------------------
-- SUBSCRIPTIONS
--------------------------------------------------
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT NOT NULL UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'trialing' CHECK (
        status IN (
            'trialing',
            'active',
            'pending_cancel',
            'past_due',
            'canceled',
            'incomplete',
            'incomplete_expired',
            'unpaid'
        )
    ),
    trial_end TIMESTAMP NULL,
    current_period_end TIMESTAMP NULL,
    plan_display_name TEXT NULL,
    billing_interval TEXT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    price_id TEXT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

-- Survey Dashboard performance indexes
CREATE INDEX IF NOT EXISTS idx_survey_responses_version_datetime
    ON survey_responses(survey_version_id, completion_datetime)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_survey_responses_qr_code_dashboard
    ON survey_responses(qr_code_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_location_snapshots_location_id
    ON location_snapshots(location_id);

CREATE INDEX IF NOT EXISTS idx_survey_response_answers_response_nodeletion
    ON survey_response_answers(survey_response_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_questions_stable_version
    ON questions(stable_question_id, survey_version_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_analysis_response_question_nodeletion
    ON ai_analysis(survey_response_id, question_id)
    WHERE deleted_at IS NULL;


--------------------------------------------------
-- STRIPE WEBHOOKS
--------------------------------------------------
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    stripe_event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    received_at TIMESTAMP NOT NULL DEFAULT NOW()
);


--------------------------------------------------
-- Seed Data
--------------------------------------------------
INSERT INTO question_types (type, category, label, is_numeric, analyse_with_ai) VALUES
('star', 'rating', 'Star Rating', TRUE, FALSE),
('nps', 'rating', 'Net Promoter Score', TRUE, FALSE),
('text', 'text', 'Short Text', FALSE, TRUE),
('long_text', 'text', 'Long Text', FALSE, TRUE),
('multiple_choice', 'choice', 'Multiple Choice', FALSE, FALSE),
('checkbox', 'choice', 'Checkboxes', FALSE, FALSE),
('yes_no', 'choice', 'Yes / No', FALSE, FALSE),
('email', 'customer_details', 'Email', FALSE, FALSE),
('phone', 'customer_details', 'Phone', FALSE, FALSE),
('photo', 'media', 'Photo Upload', FALSE, FALSE);

INSERT INTO question_type_settings (question_type, setting_key, setting_label, setting_type, required, default_value, allowed_values, validation_rules) VALUES
('star', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('star', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('star', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('star', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('star', 'starCount', 'Number of stars', 'integer', TRUE, '5', NULL, '{"min":1,"max":10}'::jsonb),
('star', 'selected_colour', 'Selected colour', 'color', FALSE, NULL, NULL, NULL),


('nps', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('nps', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('nps', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('nps', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('nps', 'max_score', 'Maximum score', 'integer', TRUE, '10', NULL, '{"min":1,"max":10}'::jsonb),
('nps', 'min_label', 'Min label', 'string', FALSE, 'Not likely', NULL, NULL),
('nps', 'max_label', 'Max label', 'string', FALSE, 'Extremely likely', NULL, NULL),
('nps', 'selected_colour', 'Selected colour', 'color', FALSE, NULL, NULL, NULL),

('text', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('text', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('text', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('text', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('text', 'placeholder', 'Placeholder', 'string', FALSE, 'Type your answer...', NULL, NULL),

('long_text', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('long_text', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('long_text', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('long_text', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('long_text', 'placeholder', 'Placeholder', 'string', FALSE, 'Type your answer...', NULL, NULL),

('multiple_choice', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('multiple_choice', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('multiple_choice', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('multiple_choice', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('multiple_choice', 'options', 'Options', 'options', TRUE, NULL, NULL, '{"min_options":1}'::jsonb),
('multiple_choice', 'selected_colour', 'Selected colour', 'color', FALSE, NULL, NULL, NULL),


('checkbox', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('checkbox', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('checkbox', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('checkbox', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('checkbox', 'options', 'Options', 'options', TRUE, NULL, NULL, '{"min_options":1}'::jsonb),
('checkbox', 'selected_colour', 'Selected colour', 'color', FALSE, NULL, NULL, NULL),

('yes_no', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('yes_no', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('yes_no', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('yes_no', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('yes_no', 'yesLabel', 'Yes label', 'string', FALSE, 'Yes', NULL, NULL),
('yes_no', 'noLabel', 'No label', 'string', FALSE, 'No', NULL, NULL),
('yes_no', 'selected_colour', 'Selected colour', 'color', FALSE, NULL, NULL, NULL),

('email', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('email', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('email', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('email', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('email', 'placeholder', 'Placeholder', 'string', FALSE, 'your@email.com', NULL, NULL),

('phone', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('phone', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('phone', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('phone', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('phone', 'placeholder', 'Placeholder', 'string', FALSE, '+61 400 000 000', NULL, NULL),

('photo', 'optional', 'Optional question', 'boolean', FALSE, 'true', NULL, NULL),
('photo', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('photo', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('photo', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL)
ON CONFLICT (question_type, setting_key) DO NOTHING;
