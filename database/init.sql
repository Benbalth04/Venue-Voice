-- Enable UUID support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

--------------------------------------------------
-- USERS
--------------------------------------------------

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    onboarding_complete BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
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
    created_at TIMESTAMP DEFAULT NOW()
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
    UNIQUE(company_id, name)
);

CREATE INDEX idx_surveys_company_id
ON surveys(company_id);

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
    analyse_with_ai BOOLEAN NOT NULL DEFAULT FALSE
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
    is_numeric BOOLEAN NOT NULL DEFAULT FALSE
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
    survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_qr_codes_company_id ON qr_codes(company_id);
CREATE INDEX idx_qr_codes_survey_id ON qr_codes(survey_id);
CREATE INDEX idx_qr_codes_location_id ON qr_codes(location_id);
CREATE INDEX idx_qr_codes_title ON qr_codes(title);

--------------------------------------------------
-- LOCATION SNAPSHOTS
--------------------------------------------------

CREATE TABLE location_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    state TEXT,
    country TEXT,
    created_at TIMESTAMP DEFAULT NOW()
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
    session_id UUID
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
    hashed_ip_address TEXT
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
    created_at TIMESTAMP DEFAULT NOW()
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
    hashed_ip_address TEXT
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
    UNIQUE(user_id, response_id)
);

CREATE INDEX idx_response_reads_user_response
ON response_reads(user_id, response_id);

--------------------------------------------------
-- ALERT RULES
--------------------------------------------------
CREATE TABLE alert_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
    operator TEXT NOT NULL,
    threshold_value TEXT,
    notification_email TEXT,
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

INSERT INTO users (id, email, first_name, last_name, onboarding_complete, created_at) VALUES
('8567b7dc-6049-415e-97d8-740a6483c1b6', 'benbalthes@gmail.com', 'Ben', 'Balthes', true, '2026-03-15 05:56:39.091809');

INSERT INTO companies (id, owner_user_id, name, primary_industry, company_size, location_count, how_heard, thank_you_message, created_at) VALUES
('02238978-8b23-408a-a5e4-a0399578229a', '8567b7dc-6049-415e-97d8-740a6483c1b6', 'Test Company', NULL, NULL, 3, NULL, NULL, '2026-03-15 05:56:49.03126');

INSERT INTO locations (id, company_id, name, is_active, state, country, google_business_url, created_at, updated_at) VALUES
('87ff1d9a-d62a-425f-a378-06bab8438eb7', '02238978-8b23-408a-a5e4-a0399578229a', 'Test Venue', true, NULL, NULL, NULL, '2026-03-15 05:56:49.03126', '2026-03-15 05:56:49.03126');

INSERT INTO surveys (id, company_id, name, status, latest_version, created_at, updated_at) VALUES
('edb799f1-4d75-4e0e-992f-179d6b97e7f7', '02238978-8b23-408a-a5e4-a0399578229a', 'Survey 1', 'active', 1, '2026-03-15 05:56:49.03126', '2026-03-15 05:56:49.03126');

INSERT INTO qr_codes (id, company_id, title, is_active, survey_id, location_id, created_at, updated_at) VALUES
('0837b563-de15-46de-9bfa-b6d5d3269511', '02238978-8b23-408a-a5e4-a0399578229a', 'Default QR Code', true, 'edb799f1-4d75-4e0e-992f-179d6b97e7f7', '87ff1d9a-d62a-425f-a378-06bab8438eb7', '2026-03-15 05:56:49.03126', '2026-03-15 05:56:49.03126');

INSERT INTO survey_versions (id, survey_id, version_number, schema_json, created_by, created_at, theme_settings) VALUES
(
'1ce6fe24-05bc-48c1-a055-a15a91491706',
'edb799f1-4d75-4e0e-992f-179d6b97e7f7',
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
  "version": 1,
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
  "questions": []
}
$$::jsonb,
'8567b7dc-6049-415e-97d8-740a6483c1b6',
'2026-03-15 05:56:49.03126',
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
    '40a0545f-9d6b-41ef-bd1c-305ea28a62df',
    '1ce6fe24-05bc-48c1-a055-a15a91491706', 
    '1829ab7e-9cb3-40e6-a2c9-6f36a21629af', 
    'Did you enjoy your time at the restaurant today?', 'text', 
    $${
        "optional": false,
        "text_size": "medium",
        "placeholder": "Type your answer...",
        "title_alignment": "inherit",
        "action_alignment": "left"
    }$$::jsonb,
    1, 
    true
);