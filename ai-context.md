```markdown
# Venue Voice — System Overview

Venue Voice is a feedback and engagement platform designed for physical venues (e.g. cafés, retail stores, hospitality) to collect structured customer insights via QR codes and dynamically trigger actions through rules and flows. The system is optimised for multi-location management, but can also be used for single locations to collect feedback.

The system is built to be flexible, scalable, and automation-ready, enabling businesses to capture feedback, segment customers, and act on insights in real time.

---

# 1. Core Concepts

## 1.1 Surveys
A **Survey** is a collection of questions presented to a customer.

- Scoped to a specific venue or context
- Contains multiple **Questions**
- Questions have types (e.g. rating, text, email, phone)
- Responses are stored and later evaluated by rules

---

## 1.2 Questions
Each survey consists of structured questions:

- **Rating** (e.g. 1–5)
- **Text** (freeform, supports sentiment analysis)
- **Email / Phone** (contact capture)
- An multiple other types

Questions are critical because:
- Rules depend on question types
- UI dynamically renders inputs based on question schema

---

## 1.3 Responses
A **Response** represents a completed survey submission.

- Linked to a survey
- Contains answers per question
- May include metadata:
  - Timestamp
  - Location
  - Device/session identifiers

---

# 2. Entity Relationships

## 2.1 High-Level ER Structure

```

Company
└── Location
└── LocationSurvey
├── Survey
│     ├── Questions
│     └── Responses
└── QR Code

Survey
└── Rules
└── Flows

```

---

## 2.2 Key Entities

### Company
- Top-level organisation (e.g. brand or company)

### Location
- Physical site (e.g. individual store)
- A company can have multiple locations

---

### Survey
- Defines the feedback structure
- Can be reused across locations

---

### LocationSurvey (IMPORTANT)
This is a **join entity** that enables:

- A survey to be deployed at a specific location(s)
- Tracking of where responses originate
- Unique QR codes per location-survey pair

---

### QR Code
- Can be assigned to a `location_survey`
- Encodes a URL pointing to a redirect endpoint
- Enables scan tracking before survey access

---

### Rule
- Defines **conditions** on survey responses

---

### Flow
- Defines **actions** triggered when rules pass

---

# 3. Rules vs Flows

## 3.1 Rules (Decision Layer)

Rules evaluate survey responses and determine whether certain conditions are met.

### Characteristics:
- Scoped to a **single survey**
- Built using:
  - **Conditions**
  - **Condition Groups**

### Examples:
- Rating < 3
- Sentiment = negative
- Email is not empty

### Structure:
```

Rule
├── Condition Group (AND / OR)
│     ├── Condition
│     ├── Condition
│
└── Condition Group

```

### Purpose:
Rules answer:
> "Did something happen that we care about?"

---

## 3.2 Flows (Action Layer)

Flows define what happens when rules evaluate to true.

### Characteristics:
- Can use multiple rules
- Can be reused across survey (a location_survey can only be triggered in one flow)
- Represent business logic automation

### Examples:
- Send alert to staff
- Tag customer as "at risk"
- Trigger follow-up email
- Log internal incident

---

## 3.3 Key Distinction

| Component | Responsibility |
|----------|--------------|
| Rule     | Evaluation (logic / conditions) |
| Flow     | Execution (actions / outcomes) |

Think:
- **Rules = IF**
- **Flows = THEN**

---

# 4. Location Surveys & QR Code Forwarding

## 4.1 Problem Solved

You need to:
- Track which location a survey response came from
- Use the same survey across multiple locations
- Capture scan analytics before survey completion

---

## 4.2 Solution: LocationSurvey + Redirect Layer

### Flow:

1. QR Code is generated and asigned to a `location_survey`
2. QR encodes a URL like:

```

/r/{qr_id}

```

3. User scans QR → hits redirect endpoint
4. Backend:
   - Logs scan event
   - Resolves `qr_id → location_survey`
   - Redirects user to survey:

```

/survey/{survey_id}?locationSurveyId=xyz

```

---

## 4.3 Benefits

- **Scan Tracking**
  - Number of scans vs completions
- **Location Attribution**
  - Every response tied to a physical location
- **Flexibility**
  - Same survey reused across many locations
- **Analytics**
  - Conversion rates per QR code/location

---

# 5. Architecture

## 5.1 Overview

```

Frontend (Next.js)
↓
Backend API (FastAPI)
↓
PostgreSQL (Core Data)
+
Supabase (Auth + Object Storage)

```

---

## 5.2 Frontend — Next.js

### Responsibilities:
- Admin dashboard (rules, flows, surveys)
- Survey rendering (public-facing)
- QR code management UI
- Data visualisation

### Key Features:
- Dynamic forms based on question types
- Rule builder UI (conditions + groups)
- Flow configuration interface

---

## 5.3 Backend — FastAPI

### Responsibilities:
- Business logic execution
- Rule evaluation engine
- Flow triggering
- QR redirect handling
- API layer for frontend

### Key Components:
- Rule engine (evaluates responses)
- Flow executor (runs actions)
- Middleware (potential for UUID encryption if needed)

---

## 5.4 Database — PostgreSQL (Local)

### Stores:
- Surveys
- Questions
- Responses
- Rules
- Flows
- Locations
- LocationSurveys

### Why Postgres:
- Strong relational integrity
- Complex querying (analytics, segmentation)
- Structured rule storage

---

## 5.5 Supabase

### Used For:

#### Authentication
- User accounts (admin/staff)
- Secure access to dashboard

#### Object Storage
- QR code images (SVG, PNG, JPEG)
- Uploaded assets (logos, media)

---

## 5.6 Data Flow Example

1. User scans QR
2. FastAPI logs scan
3. User completes survey (Next.js)
4. Response sent to FastAPI
5. Backend:
   - Stores response
   - Evaluates rules
   - Triggers flows
6. Actions executed (alerts, tagging, etc.)

---

# 6. QR Code Asset Generation

Each QR code supports multiple formats:

- SVG (vector, scalable)
- PNG (web-friendly)
- JPEG (compatibility)

### Storage:
- Files generated and uploaded to Supabase Storage
- Metadata stored in PostgreSQL

---

# 7. Rule Engine Design (Important)

## 7.1 Condition Types

- Rating comparisons
- Sentiment classification (for text)
- Field presence (email/phone not empty)

---

## 7.2 Extensibility

The system is designed to support:
- New condition types
- Custom operators
- Cross-question logic

---

## 7.3 Evaluation Strategy

- Evaluate per response
- Traverse condition groups recursively
- Short-circuit evaluation for performance

---

# 8. Future Enhancements

## 8.1 AI Integration
- Automated insight generation
- Smart rule suggestions
- Customer segmentation

---

## 8.2 Analytics Layer
- Dashboarding (e.g. Power BI integration)
- Location performance comparisons
- Customer lifetime value tracking

---

## 8.3 Automation Expansion
- CRM integrations
- Email/SMS workflows
- Loyalty system integration

---

# 9. Key Design Principles

- **Modularity** — Rules and flows decoupled
- **Reusability** — Surveys across locations
- **Observability** — QR tracking and response analytics
- **Scalability** — API-first architecture
- **Extensibility** — Easy addition of new rule types and flows

---

# 10. Summary

Venue Voice is a structured feedback and automation platform that:

- Captures customer insights via QR-based surveys
- Uses a rule engine to interpret responses
- Executes flows to automate business actions
- Provides location-aware analytics
- Leverages a modern stack (Next.js + FastAPI + Postgres + Supabase)

It is designed not just as a survey tool, but as a **decision and action engine for physical venues**.
```
