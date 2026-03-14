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
    owner_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    primary_industry TEXT,
    company_size TEXT,
    location_count INTEGER,
    how_heard TEXT,
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
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_locations_company_id
ON locations(company_id);


--------------------------------------------------
-- SURVEYS
--------------------------------------------------

CREATE TABLE surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    location_id UUID REFERENCES locations(id),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK (
        status IN ('draft','active','archived')
    ) DEFAULT 'draft',
    active_version_id UUID,
    created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
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
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_survey_versions_survey_id
ON survey_versions(survey_id);

--------------------------------------------------
-- QUESTIONS
--------------------------------------------------

CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_version_id UUID NOT NULL REFERENCES survey_versions(id) ON DELETE CASCADE,
    question_key TEXT NOT NULL,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL CHECK (
        question_type IN ('rating','multiple_choice','text','yes_no','single_select')
    ),
    config JSONB,
    position INTEGER NOT NULL
);

CREATE INDEX idx_questions_survey_version
ON questions(survey_version_id);

--------------------------------------------------
-- RESPONSES
--------------------------------------------------
CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_version_id UUID NOT NULL REFERENCES survey_versions(id),
    location_id UUID REFERENCES locations(id),
    submitted_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_responses_location
ON responses(location_id);

CREATE INDEX idx_responses_time
ON responses(submitted_at);

--------------------------------------------------
-- QR CODES
--------------------------------------------------
CREATE TABLE qr_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_qr_codes_company_id ON qr_codes(company_id);
CREATE INDEX idx_qr_codes_survey_id ON qr_codes(survey_id);
CREATE INDEX idx_qr_codes_location_id ON qr_codes(location_id);
CREATE INDEX idx_qr_codes_slug ON qr_codes(slug);

--------------------------------------------------
-- SCAN EVENTS
--------------------------------------------------
CREATE TABLE scan_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
    scanned_at TIMESTAMP DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT
);

CREATE INDEX idx_scan_events_qr_code_id ON scan_events(qr_code_id);
CREATE INDEX idx_scan_events_scanned_at ON scan_events(scanned_at);

--------------------------------------------------
-- ANSWERS
--------------------------------------------------
CREATE TABLE answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    response_id UUID NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id),
    value TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_answers_response
ON answers(response_id);

CREATE INDEX idx_answers_question
ON answers(question_id);

--------------------------------------------------
-- ALERT RULES
--------------------------------------------------
CREATE TABLE alert_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id),
    operator TEXT NOT NULL,
    threshold_value TEXT,
    notification_email TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

--------------------------------------------------
-- AI SUMMARIES
--------------------------------------------------
CREATE TABLE ai_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id),
    location_id UUID REFERENCES locations(id),
    period_start DATE,
    period_end DATE,
    summary TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ai_summaries_location
ON ai_summaries(location_id);
