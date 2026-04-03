# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Venue Voice is a QR-based customer feedback platform for physical venues. Customers scan QR codes at locations, complete surveys, and the system automatically evaluates responses via a rule engine and triggers automated flows (email alerts, redirects, etc.).

## Development Commands

### Start everything (recommended)
```bash
docker compose up
```
This starts PostgreSQL (port 5432), Redis (port 6379), FastAPI backend (port 5000), and Next.js frontend (port 3000).

### Frontend only (outside Docker)
```bash
cd frontend
npm run dev      # Start dev server on port 3000
npm run build    # Production build
npm run lint     # ESLint
```

### Backend only (outside Docker)
```bash
cd backend
uvicorn app.main:app --reload --port 5000
```

### Backend tests
```bash
cd backend
pytest                                      # Run all tests
pytest tests/test_rule_service.py           # Run a single test file
```

Tests live in `backend/tests/`. There are no frontend tests.

### Database
Schema lives entirely in `database/init.sql` — no active migrations (Alembic was removed). To reset the database, restart the `database` Docker service with the volume removed.

## Architecture

### Stack
- **Frontend**: Next.js (App Router), React 19, TypeScript, Tailwind CSS 4
- **Backend**: FastAPI (Python), SQLAlchemy ORM, Pydantic v2
- **Database**: PostgreSQL (local Docker container)
- **Auth + Storage**: Supabase (JWT auth + object storage for QR codes/photos)
- **AI**: OpenAI for text sentiment analysis

### Key Architectural Concepts

**LocationSurvey** — the central join entity. A `Survey` can be deployed at multiple `Location`s. Each deployment creates a `LocationSurvey`. All QR codes, responses, analytics, and flow executions are scoped to a `LocationSurvey`, not just a survey. This is the most important entity to understand.

**QR Code scan flow:**
1. QR encodes `/r/{qr_id}`
2. Backend logs `ScanEvent`, resolves `qr_id → location_survey`
3. User is redirected to `/survey?sessionId=...&locationSurveyId=...`
4. Survey submitted (no auth required)
5. Rules evaluated → Flows triggered if conditions match

**Rules vs Flows:**
- **Rules** = IF (condition evaluation on responses — rating, sentiment, field presence)
- **Flows** = THEN (actions — send email, redirect, etc.)
- Rules are scoped to a survey; Flows reference rules and are scoped to location_surveys

### Backend Layout
```
backend/app/
├── main.py                  # FastAPI app, router registration
├── routes/                  # HTTP handlers (thin layer)
│   ├── survey_public.py     # Public endpoints — no auth required
│   └── ...
├── services/                # Business logic
│   ├── flow_service.py      # Flow execution engine (largest service)
│   ├── rule_service.py      # Recursive rule/condition evaluation
│   ├── analytics_service.py # Response analytics
│   └── ...
├── models/postgres_model.py # All SQLAlchemy ORM models (single file)
├── schemas/pydantic_model.py # All Pydantic request/response schemas (single file)
├── auth/jwt.py              # Supabase JWT verification
├── db/postgres.py           # SQLAlchemy engine + session
└── integrations/supabase_storage.py  # File uploads
```

### Frontend Layout
```
frontend/
├── app/                     # Next.js App Router pages
│   ├── r/[qrCodeId]/        # QR redirect handler (public)
│   ├── survey/              # Public survey page (no auth)
│   └── dashboard/           # Protected admin UI
├── components/
│   ├── survey/              # Survey renderer + question components
│   ├── flow-editor/         # XYFlow-based visual flow builder
│   └── ui/                  # Reusable UI primitives
├── lib/
│   ├── api/client.ts        # Centralized API client (all backend calls here)
│   └── survey/types.ts      # Survey/question TypeScript types
└── contexts/AuthContext.tsx  # Global auth state
```

### Authentication
- Supabase handles login/signup on the frontend
- Frontend passes Supabase JWT as `Authorization: Bearer <token>` to backend
- Backend verifies JWT via `auth/jwt.py` using Supabase JWKS endpoint
- On first login, user is auto-bootstrapped into the local PostgreSQL `users` table

### Environment Variables
Backend reads from `.env`. Frontend env vars must be prefixed `NEXT_PUBLIC_` and are injected at build time via Docker build args:
- `NEXT_PUBLIC_BACKEND_BASE_URL` — backend API URL
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase client
- `NEXT_PUBLIC_APP_ORIGIN` — for QR code URL generation

### Database Schema Conventions
- UUID primary keys using `uuid_generate_v4()`
- Soft deletes via `deleted_at` timestamp (not hard deletes)
- JSONB used for flexible config: `survey_versions.content`, `questions.config`, `flow_nodes.config`
- All ORM models are in the single file `backend/app/models/postgres_model.py`

### Flow Execution Engine

Flows are directed acyclic graphs (DAGs) stored as a tree of `flow_nodes`. Three node types:
- **`rule`** — evaluates a condition
- **`branch`** — routes to true/false children based on rule evaluation (`match_type`: "any"/"all", `negate` flag)
- **`action`** — terminal node; performs redirect, sends email, or requests a review

Execution (`flow_service.py → _evaluate_single_flow`):
1. Builds node tree with parent-child relationships
2. Builds response context from survey answers + AI analysis
3. Traverses tree, evaluating branch conditions
4. Collects all triggered actions and persists a `FlowRun` + `FlowRunAction` audit trail

Key constraints: each flow must have exactly one root node; nodes are persisted in preorder (parent before child) to satisfy FK constraints. Each `LocationSurvey` can be assigned to at most one flow.

### Background Tasks

APScheduler runs inside the FastAPI process (started in the lifespan hook):
- **Email reconciliation** — every 5 minutes; retries pending Resend emails
- **Stripe reconciliation** — daily at 14:00 UTC; syncs subscription status

Flow execution is async: `execute_flows_for_response()` dispatches either `run_flow_background()` (no AI) or `run_ai_then_flow_background()` (OpenAI sentiment first, then flow).

### Error Handling

Centralized error hierarchy in `backend/app/core/errors/exceptions.py`. All errors extend `AppError` (category, code, message, HTTP status, details) and are converted to a consistent JSON shape by `app_error_handler`.

**Optimistic concurrency**: update requests include `updated_at`; backend raises `StaleObjectError` (409) if the row has been modified since. The frontend normalizes all API errors via `normalizeApiError()` in `lib/api/client.ts`.

### Subscription Enforcement

The `require_active_subscription` FastAPI dependency (in `auth/subscription.py`) is applied to all protected routes and raises 403 when no active Stripe subscription exists. Public routes (`/survey-public`, `/q`, `/stripe-webhook`) are exempt.

### LocationSurvey Status Derivation

A `LocationSurvey` status is computed from four independent factors: `location_survey.is_active`, the `start_date`/`end_date` window, the linked `survey.status` (must be `active`), and `location.is_active`. This logic lives in `location_survey_service.py → derive_location_survey_status()`. QR status (`qr_status`) is tracked separately from assignment status.

### Integrations
- **Email**: Resend API (`RESEND_API_KEY`). Email delivery is tracked as `EmailEvent` rows (pending → sent) with retry logic.
- **Payments**: Stripe with three plan tiers (Starter / Growth / Pro), each with monthly + yearly price IDs. Webhook endpoint at `/api/v1/stripe-webhook` uses `Stripe-Signature` header instead of JWT.
- **AI**: OpenAI (`gpt-4o-mini` by default via `OPENAI_SENTIMENT_MODEL`) for sentiment analysis; results stored in `ai_analysis` table and used as rule conditions.
- **QR generation**: `segno` + `cairosvg`; assets uploaded to Supabase Storage.
