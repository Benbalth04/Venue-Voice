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
    CONSTRAINT ck_qr_code_assets_format CHECK (format IN ('svg', 'png', 'jpeg')),
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
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_survey_response_photos_response_id ON survey_response_photos(survey_response_id);

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
    created_at TIMESTAMP DEFAULT NOW()
);

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
('phone', 'placeholder', 'Placeholder', 'string', FALSE, '+61 400 000 000', NULL, NULL),

('photo', 'optional', 'Optional question', 'boolean', TRUE, 'false', NULL, NULL),
('photo', 'title_alignment', 'Title alignment', 'select', FALSE, 'inherit', '["left","center","right","inherit"]'::jsonb, NULL),
('photo', 'action_alignment', 'Action alignment', 'select', FALSE, 'left', '["left","center","right","inherit"]'::jsonb, NULL),
('photo', 'text_size', 'Text size', 'select', FALSE, 'medium', '["small","medium","large","extra_large"]'::jsonb, NULL)
ON CONFLICT (question_type, setting_key) DO NOTHING;

INSERT INTO users (id, email, first_name, last_name, onboarding_complete, email_verified, created_at, deleted_at) VALUES
('8567b7dc-6049-415e-97d8-740a6483c1b6', 'benbalthes@gmail.com', 'Ben', 'Balthes', true, true, '2026-03-15 05:56:39.091809', NULL);

INSERT INTO companies (id, owner_user_id, name, primary_industry, company_size, location_count, how_heard, thank_you_message, created_at, deleted_at) VALUES
('02238978-8b23-408a-a5e4-a0399578229a', '8567b7dc-6049-415e-97d8-740a6483c1b6', 'Test Company', NULL, NULL, 3, NULL, NULL, '2026-03-15 05:56:49.03126', NULL);

INSERT INTO locations (id, company_id, name, is_active, state, country, google_business_url, created_at, updated_at, deleted_at) VALUES 
('87ff1d9a-d62a-425f-a378-06bab8438eb7', '02238978-8b23-408a-a5e4-a0399578229a', 'Main Venue', true, NULL, NULL, 'https://youtube.com.au', '2026-03-15 05:56:49.03126', '2026-03-27 05:21:23.422119', NULL);

INSERT INTO surveys (id, company_id, name, status, latest_version, created_at, updated_at, deleted_at) VALUES 
('3bf0df79-f109-4975-a40a-4f0bb4e128af', '02238978-8b23-408a-a5e4-a0399578229a', 'Survey 1', 'active', 2, '2026-03-27 05:17:51.882525', '2026-03-27 05:18:54.263651', NULL);

INSERT INTO location_surveys (id, location_id, survey_id, is_active, start_date, end_date, created_at, updated_at, deleted_at) VALUES 
('6491b89d-bba6-4226-878d-adbc585b3f5e', '87ff1d9a-d62a-425f-a378-06bab8438eb7', '3bf0df79-f109-4975-a40a-4f0bb4e128af', true, '2026-03-27 05:21:00', NULL, '2026-03-27 05:21:31.497525', '2026-03-27 05:21:31.497525', NULL);

INSERT INTO qr_codes (id, company_id, title, is_active, location_survey_id, location_id, redirect_url, has_logo, created_at, updated_at, deleted_at) VALUES 
('9b32692f-3ed4-4c48-89fa-f076b57e42c3', '02238978-8b23-408a-a5e4-a0399578229a', 'Main Venue QR Code 1', true, '6491b89d-bba6-4226-878d-adbc585b3f5e', '87ff1d9a-d62a-425f-a378-06bab8438eb7', 'http://localhost:3000/r/9b32692f-3ed4-4c48-89fa-f076b57e42c3', true, '2026-03-27 05:21:41.657327', '2026-03-27 05:21:41.657327', NULL);

INSERT INTO survey_versions (id, survey_id, version_number, schema_json, created_by, created_at, theme_settings, deleted_at) VALUES 
('7efc9d9c-9b40-49cf-aa0b-efa9da6ac69b', '3bf0df79-f109-4975-a40a-4f0bb4e128af', 1, '{"theme": {"textColor": "#1E1E1E", "fontFamily": "Inter", "primaryColor": "#7C3AED", "backgroundColor": "#FFFFFF"}, "title": {"text": "Customer Feedback", "style": {"size": "h1"}}, "version": 1, "settings": {"contentAlign": "left", "showProgressBar": true, "progressBarColor": "#7C3AED"}, "subtitle": {"text": "Tell us about your experience", "style": {"size": "body"}}, "questions": []}', '8567b7dc-6049-415e-97d8-740a6483c1b6', '2026-03-27 05:17:51.882525', '{"font": "Inter", "primary_color": "#7C3AED", "background_color": "#FFFFFF", "content_alignment": "left", "show_progress_bar": true, "progress_bar_color": "#7C3AED"}', NULL),
('b73b405c-a8f0-4e76-ab9c-bc119fb10ac2', '3bf0df79-f109-4975-a40a-4f0bb4e128af', 2, '{"theme": {"textColor": "#1E1E1E", "fontFamily": "Inter", "primaryColor": "#7C3AED", "backgroundColor": "#FFFFFF"}, "title": {"text": "Customer Feedback", "style": {"size": "h1"}}, "version": 143, "settings": {"contentAlign": "left", "showProgressBar": true, "progressBarColor": "#7C3AED"}, "subtitle": {"text": "Tell us about your experience", "style": {"size": "body"}}, "questions": [{"id": "ca07b7a6-8ecd-4917-adad-97abda063a20", "type": "star", "title": {"text": "How would you rate your experience today?", "style": {"size": "h2"}}, "version": 52, "optional": false, "settings": {"optional": false, "starCount": 5, "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}, {"id": "89159a1b-7694-47ef-90cb-673aa24d465c", "type": "nps", "title": {"text": "How likely are you to recommend us?", "style": {"size": "h2"}}, "version": 50, "optional": false, "settings": {"optional": false, "max_label": "Extremely likely", "max_score": 10, "min_label": "Not likely", "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}, {"id": "1a942a63-9662-4c3f-96f1-6011f61834ca", "type": "text", "title": {"text": "Anything else you would like to add?", "style": {"size": "h2"}}, "version": 40, "optional": true, "settings": {"optional": false, "text_size": "medium", "placeholder": "Type your answer...", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}]}', '8567b7dc-6049-415e-97d8-740a6483c1b6', '2026-03-27 05:18:51.146895', '{"font": "Inter", "primary_color": "#7C3AED", "background_color": "#FFFFFF", "content_alignment": "left", "show_progress_bar": true, "progress_bar_color": "#7C3AED"}', NULL);

INSERT INTO flows (id, company_id, name, description, is_active, status, broken_reasons, survey_id, created_at, updated_at, deleted_at) VALUES 
('f1a7d3be-4d74-4e95-a647-96dc0e54a268', '02238978-8b23-408a-a5e4-a0399578229a', 'Check for negative review', NULL, true, 'active', '[]', '3bf0df79-f109-4975-a40a-4f0bb4e128af', '2026-03-27 05:22:31.155757', '2026-03-27 05:22:31.155757', NULL);

INSERT INTO flow_location_surveys (id, flow_id, location_survey_id) VALUES 
('5d7e64b7-835b-4edc-8a03-afc591a9808e', 'f1a7d3be-4d74-4e95-a647-96dc0e54a268', '6491b89d-bba6-4226-878d-adbc585b3f5e');

INSERT INTO rules (id, company_id, name, description, operator, survey_id, status, broken_reasons, created_at, updated_at, deleted_at) VALUES 
('3ce94644-e658-429b-b64a-6ed6d0ae39f4', '02238978-8b23-408a-a5e4-a0399578229a', 'Poor Experience', 'Experience rating less than 3, or NPS less than 5, or negative text sentiment', 'OR', '3bf0df79-f109-4975-a40a-4f0bb4e128af', 'active', '[]', '2026-03-27 05:20:33.236423', '2026-03-27 05:20:33.236423', NULL);

INSERT INTO flow_nodes (id, flow_id, parent_id, node_type, rule_id, branch_type, action_type, action_config, "position", created_at) VALUES 
('89ddc043-613b-41ba-912c-3430228ae1e3', 'f1a7d3be-4d74-4e95-a647-96dc0e54a268', NULL, 'rule', '3ce94644-e658-429b-b64a-6ed6d0ae39f4', NULL, NULL, 'null', 0, '2026-03-27 05:22:31.155757'),
('197d214e-e0b5-4d2c-a7d6-26a81c090308', 'f1a7d3be-4d74-4e95-a647-96dc0e54a268', '89ddc043-613b-41ba-912c-3430228ae1e3', 'branch', NULL, NULL, NULL, '{"match_type": "all", "rule_conditions": [{"rule_id": "3ce94644-e658-429b-b64a-6ed6d0ae39f4", "expected": true}]}', 1, '2026-03-27 05:22:31.155757'),
('6433248c-7d5f-4c08-a05f-9c3518642bf1', 'f1a7d3be-4d74-4e95-a647-96dc0e54a268', '197d214e-e0b5-4d2c-a7d6-26a81c090308', 'action', NULL, 'TRUE', 'email', '{"target": "location_notification_groups"}', 2, '2026-03-27 05:22:31.155757'),
('b1927031-aac3-4dc7-95b6-3fda92d1bc61', 'f1a7d3be-4d74-4e95-a647-96dc0e54a268', '197d214e-e0b5-4d2c-a7d6-26a81c090308', 'action', NULL, 'FALSE', 'redirect', '{"target": "google_business_url"}', 3, '2026-03-27 05:22:31.155757');

INSERT INTO notification_groups (id, company_id, name, created_at, updated_at, deleted_at) VALUES 
('6a9b031b-be96-4a88-9568-34dccf998245', '02238978-8b23-408a-a5e4-a0399578229a', 'Poor reviews notification group', '2026-03-27 05:20:55.499181', '2026-03-27 05:20:55.536055', NULL);

INSERT INTO location_notification_groups (id, location_id, group_id) VALUES 
('3e6c40fe-6456-4ffa-b965-ef1e3d5c6558', '87ff1d9a-d62a-425f-a378-06bab8438eb7', '6a9b031b-be96-4a88-9568-34dccf998245');

INSERT INTO notification_group_members (id, group_id, name, email, created_at, deleted_at) VALUES 
('62630fa2-78cc-47d1-81a4-a37fe973b758', '6a9b031b-be96-4a88-9568-34dccf998245', 'Ben 1', 'benbalthes@gmail.com', '2026-03-27 05:20:55.522992', NULL),
('1cac56d8-47e2-4b35-bcc2-13e06f5bc424', '6a9b031b-be96-4a88-9568-34dccf998245', 'Ben 2', 'benbalthess@gmail.com', '2026-03-27 05:20:55.522992', NULL);

INSERT INTO qr_code_assets (id, qr_code_id, format, storage_path, public_url, created_at) VALUES 
('ca7d0afe-71c5-45f1-ba66-5ae343b38796', '9b32692f-3ed4-4c48-89fa-f076b57e42c3', 'svg', '9b32692f-3ed4-4c48-89fa-f076b57e42c3/qr.svg', 'https://hriennuneldnfctmvjbu.supabase.co/storage/v1/object/public/qr_codes/9b32692f-3ed4-4c48-89fa-f076b57e42c3/qr.svg', '2026-03-27 05:21:41.657327'),
 ('1eb01e44-203a-489a-ab32-e21ab7195038', '9b32692f-3ed4-4c48-89fa-f076b57e42c3', 'png', '9b32692f-3ed4-4c48-89fa-f076b57e42c3/qr.png', 'https://hriennuneldnfctmvjbu.supabase.co/storage/v1/object/public/qr_codes/9b32692f-3ed4-4c48-89fa-f076b57e42c3/qr.png', '2026-03-27 05:21:41.657327'),
 ('d1161adf-0d3d-4bd8-b600-45c74949fd5b', '9b32692f-3ed4-4c48-89fa-f076b57e42c3', 'jpeg', '9b32692f-3ed4-4c48-89fa-f076b57e42c3/qr.jpeg', 'https://hriennuneldnfctmvjbu.supabase.co/storage/v1/object/public/qr_codes/9b32692f-3ed4-4c48-89fa-f076b57e42c3/qr.jpeg', '2026-03-27 05:21:41.657327');

INSERT INTO questions (id, stable_question_id, survey_version_id, question_key, question_text, question_type, config, "position", is_numeric, deleted_at) VALUES 
('7fd86603-d3b0-41a1-879f-803f68474f2c', 'b2644512-4db1-429c-a433-93549285ba20', 'b73b405c-a8f0-4e76-ab9c-bc119fb10ac2', 'ca07b7a6-8ecd-4917-adad-97abda063a20', 'How would you rate your experience today?', 'star', '{"optional": false, "starCount": 5, "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}', 0, true, NULL),
('934f5d3c-89f2-4d5b-9d9a-ed91220910c5', '3707bc0f-558f-48a7-afd7-b205eb26ca47', 'b73b405c-a8f0-4e76-ab9c-bc119fb10ac2', '89159a1b-7694-47ef-90cb-673aa24d465c', 'How likely are you to recommend us?', 'nps', '{"optional": false, "max_label": "Extremely likely", "max_score": 10, "min_label": "Not likely", "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}', 1, true, NULL),
('edf8937b-473f-4005-acb1-0c2dfbba75dc', 'ffea322b-be78-4e65-b282-3e7ea72ecf92', 'b73b405c-a8f0-4e76-ab9c-bc119fb10ac2', '1a942a63-9662-4c3f-96f1-6011f61834ca', 'Anything else you would like to add?', 'text', '{"optional": false, "text_size": "medium", "placeholder": "Type your answer...", "title_alignment": "inherit", "action_alignment": "left"}', 2, false, NULL);

INSERT INTO rule_conditions (id, rule_id, condition_type, question_id, operator, value, group_id, created_at, updated_at, deleted_at) VALUES 
('10f0e9f4-3c9a-4521-af58-c7c0d32d4f4f', '3ce94644-e658-429b-b64a-6ed6d0ae39f4', 'rating', 'b2644512-4db1-429c-a433-93549285ba20', 'lt', '3', NULL, '2026-03-27 05:20:33.236423', '2026-03-27 05:20:33.236423', NULL),
('ace15df7-59a6-4165-b722-4b45d069fb7e', '3ce94644-e658-429b-b64a-6ed6d0ae39f4', 'nps', '3707bc0f-558f-48a7-afd7-b205eb26ca47', 'lt', '5', NULL, '2026-03-27 05:20:33.236423', '2026-03-27 05:20:33.236423', NULL),
('54113335-740b-47ad-9216-0d34eace8ec1', '3ce94644-e658-429b-b64a-6ed6d0ae39f4', 'sentiment', 'ffea322b-be78-4e65-b282-3e7ea72ecf92', 'is', 'negative', NULL, '2026-03-27 05:20:33.236423', '2026-03-27 05:20:33.236423', NULL);
