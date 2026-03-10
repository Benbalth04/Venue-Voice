-- Enable UUID support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

--------------------------------------------------
-- COMPANIES
--------------------------------------------------

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

--------------------------------------------------
-- STORES
--------------------------------------------------

CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    location TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_stores_company_id
ON stores(company_id);

--------------------------------------------------
-- USERS
--------------------------------------------------

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

--------------------------------------------------
-- COMPANY USERS (MULTI-TENANT ROLES)
--------------------------------------------------

CREATE TABLE company_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('dev', 'admin', 'viewer')),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_company_users_user_id
ON company_users(user_id);

--------------------------------------------------
-- SURVEYS
--------------------------------------------------

CREATE TABLE surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    active_version_id UUID,
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
    store_id UUID REFERENCES stores(id),
    submitted_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_responses_store
ON responses(store_id);

CREATE INDEX idx_responses_time
ON responses(submitted_at);

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
    store_id UUID REFERENCES stores(id),
    period_start DATE,
    period_end DATE,
    summary TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ai_summaries_store
ON ai_summaries(store_id);
