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

CREATE INDEX idx_locations_company_id
ON locations(company_id);

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

CREATE INDEX idx_surveys_company_id
ON surveys(company_id);

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

CREATE INDEX idx_location_surveys_location_id ON location_surveys(location_id);
CREATE INDEX idx_location_surveys_survey_id ON location_surveys(survey_id);

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

CREATE INDEX idx_survey_versions_survey_id
ON survey_versions(survey_id);

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

CREATE INDEX idx_qts_question_type ON question_type_settings(question_type);

--------------------------------------------------
-- QUESTIONS
--------------------------------------------------
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_version_id UUID NOT NULL REFERENCES survey_versions(id) ON DELETE CASCADE,
    question_key TEXT NOT NULL,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL REFERENCES question_types(type) ON DELETE RESTRICT,
    config JSONB,
    position INTEGER NOT NULL,
    is_numeric BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP NULL
);

CREATE INDEX idx_questions_survey_version
ON questions(survey_version_id);

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
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

CREATE INDEX idx_qr_codes_company_id ON qr_codes(company_id);
CREATE INDEX idx_qr_codes_location_survey_id ON qr_codes(location_survey_id);
CREATE INDEX idx_qr_codes_location_id ON qr_codes(location_id);
CREATE INDEX idx_qr_codes_title ON qr_codes(title);

CREATE TABLE qr_code_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
    format TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT ck_qr_code_assets_format CHECK (format IN ('svg', 'png', 'jpeg')),
    CONSTRAINT uq_qr_code_assets_qr_code_id_format UNIQUE (qr_code_id, format)
);

CREATE INDEX idx_qr_code_assets_qr_code_id ON qr_code_assets(qr_code_id);

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

CREATE INDEX idx_location_snapshots_location_id ON location_snapshots(location_id);

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

CREATE INDEX idx_scan_events_qr_code_id ON scan_events(qr_code_id);
CREATE INDEX idx_scan_events_scanned_at ON scan_events(scanned_at);
CREATE INDEX idx_scan_events_company_id ON scan_events(company_id);
CREATE INDEX idx_scan_events_session_id ON scan_events(session_id);

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

CREATE INDEX idx_survey_sessions_scan_id ON survey_sessions(scan_id);
CREATE INDEX idx_survey_sessions_survey_version_id ON survey_sessions(survey_version_id);
CREATE INDEX idx_survey_sessions_qr_code_id ON survey_sessions(qr_code_id);
CREATE INDEX idx_survey_sessions_company_id ON survey_sessions(company_id);

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

CREATE INDEX idx_survey_responses_session_id ON survey_responses(session_id);
CREATE INDEX idx_survey_responses_survey_version_id ON survey_responses(survey_version_id);
CREATE INDEX idx_survey_responses_qr_code_id ON survey_responses(qr_code_id);

--------------------------------------------------
-- SURVEY RESPONSE ANSWERS (normalized answers for public survey flow)
--------------------------------------------------
CREATE TABLE survey_response_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_response_id UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
    text_value TEXT,
    numeric_value NUMERIC,
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL,
    CHECK (
        (text_value IS NOT NULL AND numeric_value IS NULL)
        OR (text_value IS NULL AND numeric_value IS NOT NULL)
    )
);

CREATE INDEX idx_survey_response_answers_survey_response_id
ON survey_response_answers(survey_response_id);

CREATE INDEX idx_survey_response_answers_question_id
ON survey_response_answers(question_id);

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

CREATE INDEX idx_response_reads_user_response
ON response_reads(user_id, response_id);

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
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

CREATE INDEX idx_rules_company_id ON rules(company_id);
CREATE INDEX idx_rules_survey_id ON rules(survey_id);
CREATE UNIQUE INDEX uq_rules_survey_name_active
ON rules(survey_id, LOWER(name))
WHERE deleted_at IS NULL;

--------------------------------------------------
-- Rule Groups
--------------------------------------------------
CREATE TABLE rule_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    operator TEXT NOT NULL CHECK (operator IN ('AND', 'OR')),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rule_groups_rule_id ON rule_groups(rule_id);

--------------------------------------------------
-- RULE CONDITIONS
--------------------------------------------------
CREATE TABLE rule_conditions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    condition_type TEXT NOT NULL CHECK (condition_type IN ('rating', 'sentiment', 'not_empty')),
    question_id UUID NULL REFERENCES questions(id) ON DELETE SET NULL,
    operator TEXT NULL CHECK (operator IS NULL OR operator IN ('lt', 'lte', 'eq', 'gte', 'gt', 'is')),
    value TEXT NULL,
    group_id UUID NULL REFERENCES rule_groups(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

CREATE INDEX idx_rule_conditions_rule_id ON rule_conditions(rule_id);
CREATE INDEX idx_rule_conditions_question_id ON rule_conditions(question_id);
CREATE INDEX idx_rule_conditions_group_id ON rule_conditions(group_id);

--------------------------------------------------
-- NOTIFICATION GROUPS
--------------------------------------------------
CREATE TABLE notification_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

CREATE INDEX idx_notification_groups_company_id ON notification_groups(company_id);
CREATE UNIQUE INDEX uq_notification_groups_company_name_active
ON notification_groups(company_id, LOWER(name))
WHERE deleted_at IS NULL;

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

CREATE INDEX idx_notification_group_members_group_id ON notification_group_members(group_id);

--------------------------------------------------
-- LOCATION NOTIFICATION GROUPS (i.e. mapping notificaton groups to locations)
--------------------------------------------------
CREATE TABLE location_notification_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES notification_groups(id) ON DELETE CASCADE,
    UNIQUE(location_id, group_id)
);

CREATE INDEX idx_location_notification_groups_location_id ON location_notification_groups(location_id);
CREATE INDEX idx_location_notification_groups_group_id ON location_notification_groups(group_id);

--------------------------------------------------
-- FLOWS
--------------------------------------------------
CREATE TABLE flows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description VARCHAR(240),
    is_active BOOLEAN DEFAULT TRUE,
    survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

CREATE INDEX idx_flows_company_id ON flows(company_id);
CREATE INDEX idx_flows_survey_id ON flows(survey_id);
CREATE UNIQUE INDEX uq_flows_company_name_active
ON flows(company_id, LOWER(name))
WHERE deleted_at IS NULL;

--------------------------------------------------
-- FLOW LOCATION SURVEYS (map flows to location surveys for execution)
--------------------------------------------------
CREATE TABLE flow_location_surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    location_survey_id UUID NOT NULL REFERENCES location_surveys(id) ON DELETE CASCADE,
    UNIQUE(flow_id, location_survey_id)
);

CREATE INDEX idx_flow_location_surveys_flow_id ON flow_location_surveys(flow_id);
CREATE INDEX idx_flow_location_surveys_location_survey_id ON flow_location_surveys(location_survey_id);

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

CREATE INDEX idx_flow_nodes_flow_id ON flow_nodes(flow_id);
CREATE INDEX idx_flow_nodes_parent_id ON flow_nodes(parent_id);
CREATE INDEX idx_flow_nodes_rule_id ON flow_nodes(rule_id);

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
    action_executed TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_flow_runs_company_id ON flow_runs(company_id);
CREATE INDEX idx_flow_runs_flow_id ON flow_runs(flow_id);
CREATE INDEX idx_flow_runs_location_survey_id ON flow_runs(location_survey_id);

--------------------------------------------------
-- EMAIL EVENTS
--------------------------------------------------
CREATE TABLE email_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    flow_run_id UUID NULL REFERENCES flow_runs(id) ON DELETE SET NULL,
    recipient_email TEXT,
    status TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_events_company_id ON email_events(company_id);
CREATE INDEX idx_email_events_flow_run_id ON email_events(flow_run_id);

--------------------------------------------------
-- AI ANALYSIS
--------------------------------------------------
CREATE TABLE ai_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    company_id UUID REFERENCES companies(id),
    location_id UUID REFERENCES locations(id),

    survey_response_id UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE SET NULL,

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

CREATE INDEX idx_ai_analysis_survey_response_id ON ai_analysis(survey_response_id);
CREATE INDEX idx_ai_analysis_company_id ON ai_analysis(company_id);

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
('phone', 'customer_details', 'Phone', FALSE, FALSE);

INSERT INTO question_type_settings (question_type, setting_key, setting_label, setting_type, required, default_value, allowed_values, validation_rules) VALUES
('star', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('star', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('star', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('star', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('star', 'starCount', 'Number of stars', 'integer', TRUE, '5', NULL, '{"min":1,"max":10}'::jsonb),
('star', 'selected_colour', 'Selected colour', 'color', FALSE, '#7C3AED', NULL, NULL),


('nps', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('nps', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('nps', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('nps', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('nps', 'max_score', 'Maximum score', 'integer', TRUE, '10', NULL, '{"min":1,"max":10}'::jsonb),
('nps', 'min_label', 'Min label', 'string', FALSE, 'Not likely', NULL, NULL),
('nps', 'max_label', 'Max label', 'string', FALSE, 'Extremely likely', NULL, NULL),
('nps', 'selected_colour', 'Selected colour', 'color', FALSE, '#7C3AED', NULL, NULL),

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
('multiple_choice', 'selected_colour', 'Selected colour', 'color', FALSE, '#7C3AED', NULL, NULL),


('checkbox', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('checkbox', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('checkbox', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('checkbox', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('checkbox', 'options', 'Options', 'options', TRUE, NULL, NULL, '{"min_options":1}'::jsonb),
('checkbox', 'selected_colour', 'Selected colour', 'color', FALSE, '#7C3AED', NULL, NULL),

('yes_no', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('yes_no', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('yes_no', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('yes_no', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('yes_no', 'yesLabel', 'Yes label', 'string', FALSE, 'Yes', NULL, NULL),
('yes_no', 'noLabel', 'No label', 'string', FALSE, 'No', NULL, NULL),
('yes_no', 'selected_colour', 'Selected colour', 'color', FALSE, '#7C3AED', NULL, NULL),

('email', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('email', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('email', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('email', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('email', 'placeholder', 'Placeholder', 'string', FALSE, 'your@email.com', NULL, NULL),

('phone', 'optional', 'Optional question', 'boolean', FALSE, 'false', NULL, NULL),
('phone', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('phone', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('phone', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL),
('phone', 'placeholder', 'Placeholder', 'string', FALSE, '+61 400 000 000', NULL, NULL)
ON CONFLICT (question_type, setting_key) DO NOTHING;

INSERT INTO users (id, email, first_name, last_name, onboarding_complete, created_at, deleted_at) VALUES
('8567b7dc-6049-415e-97d8-740a6483c1b6', 'benbalthes@gmail.com', 'Ben', 'Balthes', true, '2026-03-15 05:56:39.091809', NULL);

INSERT INTO companies (id, owner_user_id, name, primary_industry, company_size, location_count, how_heard, thank_you_message, created_at, deleted_at) VALUES
('02238978-8b23-408a-a5e4-a0399578229a', '8567b7dc-6049-415e-97d8-740a6483c1b6', 'Test Company', NULL, NULL, 3, NULL, NULL, '2026-03-15 05:56:49.03126', NULL);

INSERT INTO locations (id, company_id, name, is_active, state, country, google_business_url, created_at, updated_at, deleted_at) VALUES
('87ff1d9a-d62a-425f-a378-06bab8438eb7', '02238978-8b23-408a-a5e4-a0399578229a', 'Test Venue', true, NULL, NULL, NULL, '2026-03-15 05:56:49.03126', '2026-03-15 05:56:49.03126', NULL);

INSERT INTO surveys (id, company_id, name, status, latest_version, created_at, updated_at, deleted_at) VALUES
('a3be873f-0271-48e4-84a1-ba8b26f15d14', '02238978-8b23-408a-a5e4-a0399578229a', 'Survey 1', 'active', 1, '2026-03-15 05:56:49.03126', '2026-03-15 05:56:49.03126', NULL);

INSERT INTO location_surveys (id, location_id, survey_id, is_active, start_date, end_date, created_at, updated_at, deleted_at) VALUES
('bf0c4580-ebee-4a2e-a7f0-14663d3316c0', '87ff1d9a-d62a-425f-a378-06bab8438eb7', 'a3be873f-0271-48e4-84a1-ba8b26f15d14', true, '2026-03-15 05:56:49.03126', NULL, '2026-03-15 05:56:49.03126', '2026-03-15 05:56:49.03126', NULL);

INSERT INTO qr_codes (id, company_id, title, is_active, location_survey_id, location_id, created_at, updated_at, deleted_at) VALUES
('c172ef94-9f1d-4308-aa11-715d668a8686', '02238978-8b23-408a-a5e4-a0399578229a', 'Default QR Code', true, 'bf0c4580-ebee-4a2e-a7f0-14663d3316c0', '87ff1d9a-d62a-425f-a378-06bab8438eb7', '2026-03-15 05:56:49.03126', '2026-03-15 05:56:49.03126', NULL);

INSERT INTO survey_versions (id, survey_id, version_number, schema_json, created_by, created_at, theme_settings) VALUES
(
'9d781c15-9b16-4920-bfee-9577fd19320b',
'a3be873f-0271-48e4-84a1-ba8b26f15d14',
1,
$$
{
  "theme": {
    "textColor": "#1E1E1E",
    "fontFamily": "Inter",
    "primaryColor": "#7C3AED",
    "backgroundColor": "#FFFFFF"
  },
  "title": {
    "text": "Customer Feedback",
    "style": {
      "size": "h1"
    }
  },
  "version": 57,
  "settings": {
    "contentAlign": "left",
    "showProgressBar": true,
    "progressBarColor": "#7C3AED"
  },
  "subtitle": {
    "text": "Tell us about your experience",
    "style": {
      "size": "body"
    }
  },
  "questions": [
    {
      "id": "53fc5573-5d03-4ca1-8c15-0f70bc0b177f",
      "type": "star",
      "title": {
        "text": "How would you rate our service?",
        "style": {
          "size": "h2"
        }
      },
      "version": 56,
      "optional": false,
      "settings": {
        "optional": false,
        "starCount": 5,
        "text_size": "medium",
        "selected_colour": "#7C3AED",
        "title_alignment": "inherit",
        "action_alignment": "left"
      },
      "description": {
        "text": "",
        "style": {
          "size": "body"
        }
      }
    }
  ]
}
$$::jsonb,
'8567b7dc-6049-415e-97d8-740a6483c1b6',
'2026-03-20 04:50:57.021003',
$$
{
  "font": "Inter",
  "primary_color": "#7C3AED",
  "background_color": "#FFFFFF",
  "content_alignment": "left",
  "show_progress_bar": true,
  "progress_bar_color": "#7C3AED"
}
$$::jsonb
);

INSERT INTO questions (id, survey_version_id, question_key, question_text, question_type, config, position, is_numeric) VALUES
(
    '80b07b18-1d33-424d-a73d-37eeb06139f8',
    '9d781c15-9b16-4920-bfee-9577fd19320b', 
    '53fc5573-5d03-4ca1-8c15-0f70bc0b177f', 
    'How would you rate our service?',
    'star', 
    $$
    {
    "optional": false,
    "starCount": 5,
    "text_size": "medium",
    "selected_colour": "#7C3AED",
    "title_alignment": "inherit",
    "action_alignment": "left"
    }
    $$::jsonb,
    0, 
    true
);