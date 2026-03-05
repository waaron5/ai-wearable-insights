# Project Plan

## What This App Does

this is a health debrief app. Users' wearable data (Apple Watch, Whoop, Oura, etc.) is stored and analyzed by an AI. Every week, the app generates a personalized written health narrative — what happened, what to pay attention to, what to try next — and emails it to the user. Users can also chat with an AI that knows their health history. The MVP uses seeded/manual data; the architecture supports plugging in real wearable sources later without refactoring.

## Intentional MVP Tradeoffs + Upgrade Scaffolding

The shortcuts below are intentional for MVP speed, and each includes scaffolding that is in-scope now so we can upgrade later without a full rewrite.

| Area | Intentional MVP Shortcut (Known Tradeoff) | Scaffolding Required Now | Upgrade Path Later |
|---|---|---|---|
| Auth providers | Email/password only via NextAuth Credentials | Keep auth config modular in `frontend/lib/auth.ts`; keep NextAuth `accounts` table in schema even if unused in MVP | Add OAuth providers (Google/GitHub/etc.) and account linking without schema rewrite |
| Signup flow | Signup route writes directly to Postgres from Next.js | Keep validation + password hashing isolated in one route module; keep user creation fields aligned with shared `users` model | Move signup/user creation behind a dedicated auth service or backend endpoint |
| Backend trust boundary | FastAPI trusts proxy headers plus shared `API_SECRET_KEY` | Keep all backend auth extraction in `core/auth.py` and expose a single user-context dependency to routers | Swap to signed service-to-service JWT (or mTLS) with minimal router changes |
| Scheduler | In-process APScheduler in FastAPI app | Keep scheduler as a thin trigger layer; keep debrief generation logic in service function callable from any worker | Move to external cron + queue/worker execution model |
| Data ingestion | Manual/demo data source only | Use `DataSourceAdapter` abstraction and `data_sources` table from day 1 | Add Apple/Whoop/Oura/Fitbit adapters behind same interface |
| Anonymous data lake | De-identified weekly aggregates + survey answers; HMAC-based profile IDs | `anonymous_profiles`, `anonymous_health_data`, `anonymous_survey_data` tables + `anonymous_data_service.py` from day 1; consent gate on users table | Scale lake to dedicated analytics DB or data warehouse; build aggregate insights API |
| Health surveys | Static seed questions; onboarding + periodic check-in contexts | `survey_questions` + `survey_responses` tables; `surveys` router; question catalog extensible via DB inserts | Add adaptive survey logic, A/B test question sets, ML-driven question selection |
| Chat transport | Non-streaming responses only | Keep chat API wrapper and UI state transport-agnostic | Add streaming (SSE/WebSocket) without rewriting chat persistence |
| Rate limiting | DB-count query, no Redis | Keep rate-limit check in one service boundary | Replace implementation with Redis/token bucket if throughput needs it |
| Type constraints | VARCHAR for `source_type` / `metric_type` (no DB ENUM) | Centralize validation in schemas/services | Add DB-level CHECK/ENUM constraints if needed, without contract changes |
| Seed/demo data | Seeded users/data for rapid testing | Keep seed logic isolated in `seed.py` and onboarding seed endpoint | Replace with real ingestion + backfill jobs; keep seed endpoint optional for demos |
| AI provider | Gemini Flash via Vertex AI (BAA-eligible) for cost efficiency | Build `HealthAIService` abstract interface; all AI calls go through it | Swap to Claude, GPT-4o, or any provider by implementing the interface |
| HIPAA compliance | MVP dev/test on Railway + Vercel (no BAA) | Use Vertex AI (BAA-eligible) for all AI calls from day 1; keep PII scrubbing, audit logging, and encryption-at-rest scaffolding in place; document HIPAA hosting upgrade path | Move Postgres + FastAPI to GCP Cloud Run + Cloud SQL (or AWS equivalents) with signed BAAs; move frontend to GCP-backed hosting or Vercel Enterprise (BAA available); enable Cloud SQL encryption at rest and audit logs |

---

## HIPAA & PHI Compliance

Health metrics linked to a user — even via a UUID — constitute **Protected Health Information (PHI)** under HIPAA. Every service that stores, processes, or transmits PHI must be covered by a **Business Associate Agreement (BAA)**. The architecture is designed to minimize PHI exposure and make HIPAA-compliant deployment achievable without rewriting business logic.

### PHI Boundary Map

| Component | Touches PHI? | BAA Required? | MVP Status | Production Path |
|---|---|---|---|---|
| PostgreSQL (health_metrics, user_baselines, weekly_debriefs, chat_messages, survey_responses) | Yes — stores all user health data | Yes | Railway Postgres (no BAA) | GCP Cloud SQL or AWS RDS (BAA available) |
| PostgreSQL (anonymous_profiles, anonymous_health_data, anonymous_survey_data) | **No** — de-identified via HIPAA Safe Harbor method (weekly aggregates, no PII, HMAC-derived IDs) | No (if properly de-identified) | Same DB for MVP | Separate analytics DB/warehouse for scale |
| FastAPI backend | Yes — reads/writes PHI via ORM | Yes (hosting) | Railway (no BAA) | GCP Cloud Run or AWS ECS (BAA available) |
| AI provider (Vertex AI) | Yes — receives de-identified health summaries | Yes | **Vertex AI (BAA available via GCP)** | Already compliant |
| Resend (email) | Yes — debrief email contains health summary | Yes | Resend (check BAA availability) | Switch to SES (AWS BAA) or GCP-based mail if needed |
| Next.js frontend | No — renders data client-side, no server storage of PHI | No (data passes through but is not persisted) | Vercel | Vercel Enterprise (BAA) or GCP hosting |
| NextAuth / Postgres (auth tables) | No — auth tables (accounts, sessions) contain no health data | No | Same DB | Same DB |

### De-identification Before AI Calls

The `pii_scrubber.py` module enforces a strict de-identification boundary:
- **Stripped before AI call:** name, email, notification_email, timezone, any string field that could identify the user
- **Passed to AI:** Only the `user_id` UUID (opaque identifier) + precomputed numerical summaries
- **Not passed to AI:** Raw metric rows, dates of birth, IP addresses, device identifiers
- The LLM receives a statistical summary, not a medical record. This minimizes (but does not eliminate) the HIPAA obligation on the AI provider — a BAA is still required because the health data *could* be re-linked to an individual.

### Required HIPAA Controls

| Control | Implementation | When |
|---|---|---|
| **Encryption in transit** | TLS everywhere — Railway/GCP enforce HTTPS on all endpoints; Postgres connections use SSL | MVP |
| **Encryption at rest** | GCP Cloud SQL: automatic. Railway: verify Postgres volume encryption. Local dev: not required. | Production |
| **Audit logging** | Log every PHI access: `GET /metrics`, `GET /debriefs`, `POST /chat/.../messages`, debrief generation. Log `user_id`, `endpoint`, `timestamp`, `action`. Store in a separate `audit_logs` table or structured log sink. Do NOT log PHI values. | Week 2 (scaffold), Production (full) |
| **Access controls** | Backend: `core/auth.py` enforces per-user isolation — every query is scoped to `X-User-Id`. No admin endpoint exposes bulk PHI. Frontend: NextAuth session gates all access. | MVP |
| **Minimum necessary** | AI receives only precomputed summaries (<800 tokens), not full metric history. Chat context is capped and summarized. | MVP |
| **Data retention / deletion** | Add `DELETE /users/me` endpoint: cascade-deletes all user data (metrics, debriefs, chat, baselines, feedback). Document retention period (e.g., 2 years). | Week 4 |
| **Breach notification** | Log AI call failures and unexpected data exposure. Production: configure alerting on the audit log sink. | Production |
| **BAA with AI provider** | **Vertex AI**: Sign Google Cloud BAA (covers Vertex AI Gemini models). This is why the plan uses Vertex AI, not the consumer Gemini API. | Before production launch |
| **BAA with hosting** | Sign BAAs with GCP (Cloud Run + Cloud SQL) or AWS equivalents before storing real user PHI. MVP dev/test on Railway with synthetic data only. | Before production launch |

### Rules for PHI in Code

1. **Never log PHI values.** Log `user_id`, `metric_type`, `action` — never `value`, `narrative`, `message content`.
2. **Never store raw AI prompts.** Only the final AI output (narrative + highlights) is persisted.
3. **Never send PII to the AI provider.** The `pii_scrubber` is a mandatory pipeline step, not optional.
4. **Never expose bulk PHI.** All API endpoints are scoped to the authenticated user. No admin bulk-export endpoints in MVP.
5. **Never include PHI in error responses.** Exception handlers must sanitize before returning.
6. **Never store PII in the anonymous data lake.** The `anonymous_profiles`, `anonymous_health_data`, and `anonymous_survey_data` tables must contain zero PII — no names, emails, timezones, or any field that could identify a user. The only link is the HMAC-derived anonymous profile ID, which is irreversible without the `ANONYMOUS_ID_SECRET`.
7. **Anonymous lake stores only weekly aggregates.** Raw daily health values are never written to the anonymous tables. Only statistical summaries (avg, min, max, std_dev, sample_count) per metric per week.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI (Python) |
| Database | PostgreSQL via SQLAlchemy ORM |
| Migrations | Alembic |
| Scheduling | APScheduler |
| AI | Gemini Flash via Vertex AI (BAA-eligible; swappable `HealthAIService` interface) |
| Auth | NextAuth (Auth.js) in Next.js |
| Email | Resend |
| Frontend | Next.js 14 (App Router) |
| Styling | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| Backend Hosting | Railway |
| Frontend Hosting | Vercel |

### Auth Architecture

**Provider:** NextAuth Credentials provider (email + password) for MVP. OAuth providers (Google, GitHub) can be added later with zero architecture changes.

**Database adapter:** `@auth/pg-adapter` — connects NextAuth directly to the PostgreSQL database. This adapter does NOT auto-create tables — all tables must exist before NextAuth runs.

**User table sharing:** NextAuth and the app share ONE `users` table. It contains both NextAuth's required columns (`id`, `name`, `email`, `emailVerified`, `image`) and app-specific columns (`hashed_password`, `timezone`, `notification_email`, `email_notifications_enabled`, `onboarded_at`). All columns are created by Alembic in a single migration.

**Password handling:** The Credentials provider does NOT handle password storage or hashing automatically. A `hashed_password` column exists on the `users` table. Signup: a custom `/api/auth/signup` Next.js API route hashes the password (bcrypt) and inserts the user. Login: NextAuth's `authorize()` callback queries the user by email and compares the password hash with bcrypt. The signup route is NOT proxied to FastAPI — it runs entirely in Next.js and writes directly to PostgreSQL via the `pg` driver.

**Session strategy:** Use JWT sessions (`session: { strategy: "jwt" }`), NOT database sessions. The Credentials provider does not trigger the database session flow — using `strategy: "database"` with Credentials is a known NextAuth footgun where `getServerSession()` returns null. Configure a `jwt` callback to embed `user.id` into the token, and a `session` callback to expose `session.user.id` from the token. The catch-all proxy route reads the user ID from `session.user.id` via `getServerSession()`.

**User creation flow:** When a user signs up via the custom signup route, a row is inserted into `users` with `email`, `name`, `hashed_password`, and defaults for app fields. The onboarding flow (frontend) then calls `PATCH /users/me` to set `timezone` and `onboarded_at`.

**Proxy pattern:** The FastAPI backend is **not** publicly exposed. Next.js API routes act as an authenticated proxy:

1. Client makes request to Next.js API route
2. NextAuth middleware verifies the session
3. Next.js API route forwards the request to FastAPI with `X-User-Id` and `X-User-Email` headers
4. FastAPI trusts these headers (enforced via a shared `API_SECRET_KEY` in the `X-API-Key` header — FastAPI rejects requests without a matching key)

FastAPI has zero auth logic. It receives a verified user ID on every request.

### Project Structure

```
/
├── backend/          # FastAPI Python app
├── frontend/         # Next.js app
└── docker-compose.yml
```

**Local dev setup:** `docker-compose.yml` runs PostgreSQL and FastAPI (with hot-reload via volume mount). The Next.js frontend runs separately via `npm run dev` in `/frontend`, with `BACKEND_URL=http://localhost:8000` pointing to the Dockerized FastAPI. No CORS is needed on FastAPI — all requests come server-to-server from Next.js API routes, not from the browser.

**Migrations:** Run `alembic upgrade head` after `docker-compose up` to initialize/update the schema. For Railway, configure Alembic migrations as a release command that runs before the web process starts.

### Environment Variables

```
# Backend (.env in /backend)
DATABASE_URL=postgresql://vitalview:vitalview@localhost:5432/vitalview
GCP_PROJECT_ID=your-gcp-project-id
GCP_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json
AI_PROVIDER=vertexai
AI_MODEL=gemini-2.0-flash
RESEND_API_KEY=re_...
API_SECRET_KEY=shared-secret-between-nextjs-and-fastapi
ANONYMOUS_ID_SECRET=separate-secret-for-hmac-de-identification
FRONTEND_URL=http://localhost:3000

# Frontend (.env.local in /frontend)
NEXTAUTH_SECRET=random-32-char-secret
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL=postgresql://vitalview:vitalview@localhost:5432/vitalview
BACKEND_URL=http://localhost:8000
API_SECRET_KEY=shared-secret-between-nextjs-and-fastapi
```

---

## Database Schema

8 app tables + 5 anonymous/survey tables + 3 NextAuth tables (accounts, sessions, verification_tokens) = 16 total. All managed by Alembic. All IDs are UUID. All tables have `created_at TIMESTAMP`. Use VARCHAR (not ENUM) for all type fields — validated at the application level.

### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK — used as `X-User-Id` everywhere |
| email | VARCHAR | Unique, indexed |
| name | VARCHAR | |
| hashed_password | VARCHAR | bcrypt hash — set during signup, verified by NextAuth `authorize()` |
| emailVerified | TIMESTAMP | Managed by NextAuth |
| image | VARCHAR | Managed by NextAuth |
| timezone | VARCHAR | Default `America/New_York` — set during onboarding |
| notification_email | VARCHAR | Nullable, defaults to email if unset |
| email_notifications_enabled | BOOLEAN | Default true |
| data_sharing_consent | BOOLEAN | Default false — explicit opt-in for anonymous data lake |
| data_sharing_consented_at | TIMESTAMP | Set when consent is granted, cleared when revoked |
| onboarded_at | TIMESTAMP | Null until onboarding complete |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Alembic creates this table in full (both NextAuth-required and app-specific columns), plus the NextAuth `accounts`, `sessions`, and `verification_tokens` tables matching the `@auth/pg-adapter` schema.

### `data_sources`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users |
| source_type | VARCHAR | `manual`, `apple_health`, `garmin`, `fitbit`, `whoop`, `oura` |
| config | JSONB | Source-specific config |
| last_synced_at | TIMESTAMP | |
| is_active | BOOLEAN | Default true |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

MVP only uses `manual` source type.

### `health_metrics`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users |
| source_id | UUID | FK → data_sources, nullable |
| date | DATE | |
| metric_type | VARCHAR | `sleep_hours`, `hrv`, `resting_hr`, `steps` (MVP metric types — more can be added later with no migration) |
| value | FLOAT | |
| created_at | TIMESTAMP | |

**Constraints & Indexes:**
- `(user_id, date, metric_type)` — unique constraint; `POST /metrics` and seed scripts use upsert (ON CONFLICT UPDATE) to prevent duplicates
- `(user_id, date)` — index for range queries

### `weekly_debriefs`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users |
| week_start | DATE | |
| week_end | DATE | |
| narrative | TEXT | AI-generated debrief narrative. Only the final AI output is stored — raw prompts and input payloads are never persisted. |
| highlights | JSONB | Key stats array |
| status | VARCHAR | `pending`, `generating`, `generated`, `sent`, `failed` |
| email_sent_at | TIMESTAMP | Null until email sent |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Indexes:**
- `(user_id, week_start)` — unique constraint, one debrief per user per week

### `chat_sessions`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users |
| title | VARCHAR | Default: first 50 characters of the user's first message. No AI call needed. |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `chat_messages`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| session_id | UUID | FK → chat_sessions |
| user_id | UUID | FK → users |
| role | VARCHAR | `user`, `assistant` |
| content | TEXT | |
| created_at | TIMESTAMP | |

**Indexes:**
- `(session_id, created_at)` — ordered retrieval

### `debrief_feedback`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| debrief_id | UUID | FK → weekly_debriefs |
| user_id | UUID | FK → users |
| rating | SMALLINT | 1–5 |
| comment | TEXT | Optional |
| created_at | TIMESTAMP | |

**Constraints:**
- `(debrief_id, user_id)` — unique constraint; submitting feedback for the same debrief upserts (replaces previous rating/comment)

### `user_baselines`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users |
| metric_type | VARCHAR | Same values as health_metrics.metric_type |
| baseline_value | FLOAT | Rolling 30-day average |
| std_deviation | FLOAT | For detecting significant deviations |
| calculated_at | TIMESTAMP | |

**Indexes:**
- `(user_id, metric_type)` — fast lookup during debrief generation

### `survey_questions`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| category | VARCHAR | `diet`, `exercise`, `sleep`, `stress`, `lifestyle` |
| question_text | TEXT | The question displayed to the user |
| response_type | VARCHAR | `scale`, `single_choice`, `multi_choice`, `free_text` |
| options | JSONB | For choice-type questions, e.g. `{"choices": ["Never","Sometimes","Often","Always"]}` |
| display_order | INTEGER | Controls question ordering in the UI |
| is_active | BOOLEAN | Default true — soft-delete for retired questions |
| created_at | TIMESTAMP | |

### `survey_responses`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK -> users |
| question_id | UUID | FK -> survey_questions |
| response_value | TEXT | The user's answer |
| survey_context | VARCHAR | `onboarding` or `periodic_checkin` |
| responded_at | TIMESTAMP | |

**Indexes:**
- `(user_id, question_id)` — fast lookup for user's answers

### `anonymous_profiles`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK — HMAC-SHA256(user_id, ANONYMOUS_ID_SECRET) truncated to UUID. **No FK to users.** |
| demographic_bucket | VARCHAR | Optional coarse bucket, e.g. `"30-39_M"` |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

This table has **no foreign key** to `users`. The connection exists only via a one-way HMAC derivation at runtime. Without the `ANONYMOUS_ID_SECRET`, the mapping is irreversible.

### `anonymous_survey_data`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| anonymous_profile_id | UUID | FK -> anonymous_profiles |
| question_id | UUID | FK -> survey_questions |
| response_value | TEXT | De-identified copy of the user's answer |
| collected_at | TIMESTAMP | |

**Indexes:**
- `(anonymous_profile_id, question_id)` — lookup by profile

### `anonymous_health_data`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| anonymous_profile_id | UUID | FK -> anonymous_profiles |
| metric_type | VARCHAR | `sleep_hours`, `hrv`, `resting_hr`, `steps` |
| period_start | DATE | Always a Monday (weekly granularity only) |
| period_end | DATE | Always the following Sunday |
| avg_value | FLOAT | Weekly average |
| min_value | FLOAT | Weekly minimum |
| max_value | FLOAT | Weekly maximum |
| std_deviation | FLOAT | Weekly standard deviation |
| sample_count | INTEGER | Days with data (0-7) |
| collected_at | TIMESTAMP | |

**Constraints & Indexes:**
- `(anonymous_profile_id, metric_type, period_start)` — unique constraint; prevents duplicate snapshots
- `(anonymous_profile_id, period_start)` — index for range queries

**Key design rule:** Only weekly statistical summaries are stored — never raw daily values. This reduces re-identification risk per the HIPAA Safe Harbor de-identification standard.

---

## Backend (FastAPI)

```
backend/
├── app/
│   ├── routers/
│   │   ├── metrics.py       # GET/POST health metrics
│   │   ├── debriefs.py      # GET debriefs, GET weekly-summary, POST feedback, POST trigger
│   │   ├── chat.py          # POST message, GET sessions, GET messages
│   │   ├── sources.py       # GET/POST data sources
│   │   ├── users.py         # GET/PATCH /users/me
│   │   ├── baselines.py     # GET /baselines
│   │   ├── onboarding.py    # POST /onboarding/seed-demo
│   │   └── surveys.py       # GET questions, POST responses, PATCH consent
│   ├── services/
│   │   ├── ai/
│   │   │   ├── base.py              # Abstract HealthAIService interface
│   │   │   ├── gemini_service.py    # Gemini Flash via Vertex AI implementation (default, BAA-eligible)
│   │   │   └── factory.py           # Provider factory: returns HealthAIService based on AI_PROVIDER env
│   │   ├── metrics_engine.py        # Deterministic code engine: trends, z-scores, scoring heuristics
│   │   ├── pii_scrubber.py          # Strip all PII before AI call (name, email → user_id only)
│   │   ├── safety_guardrails.py     # Pre-LLM emergency filter + post-LLM diagnosis stripper
│   │   ├── debrief_service.py       # Orchestrator: engine → scrub → AI → filter → store
│   │   ├── chat_service.py          # Orchestrator: emergency check → context → AI → filter → store
│   │   ├── notification_service.py  # Resend email delivery
│   │   ├── baseline_service.py      # Rolling 30-day avg + std deviation calc
│   │   ├── anonymous_data_service.py # HMAC de-identification + anonymous lake writes
│   │   └── ingestion/
│   │       ├── base.py              # Abstract DataSourceAdapter interface
│   │       └── manual.py            # Manual/seed data adapter
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic request/response schemas
│   ├── core/
│   │   ├── config.py        # pydantic-settings: env vars, API keys, AI_PROVIDER
│   │   ├── database.py      # Engine, session, Base
│   │   └── auth.py          # Dependency: extract user_id from X-User-Id header, verify X-API-Key
│   ├── scheduler.py         # APScheduler: weekly debrief cron job
│   ├── seed.py              # Generate 90 days of mock data for 3 users
│   └── main.py              # App init, router registration, scheduler start
├── templates/
│   └── debrief_email.html   # Jinja2 email template for weekly debrief notification
├── alembic/
├── alembic.ini
├── requirements.txt
└── Dockerfile
```

### Data Normalization & Ingestion

#### Problem: Each Wearable Speaks a Different Language

Apple Watch, Whoop, Oura, Garmin, and Fitbit all report health data in different formats, units, field names, granularity, and time zones. The app must normalize everything into a single consistent schema before any downstream processing (baselines, metrics engine, AI).

#### Normalization Contract

Every `DataSourceAdapter.sync()` must write rows into `health_metrics` using these exact conventions:

| Metric Type | Canonical Unit | Source Variations Handled |
|---|---|---|
| `sleep_hours` | Hours (float, 1 decimal) | Apple Health: minutes → ÷60. Whoop: ms → ÷3,600,000. Oura: seconds → ÷3600. |
| `hrv` | Milliseconds (float, RMSSD) | Apple Health: ms (native). Whoop: ms (native). Oura: ms (native). Garmin: ms but may use different algorithm — document as-is. |
| `resting_hr` | BPM (integer stored as float) | All sources report BPM natively. Some report multiple daily readings — use the **lowest** daily value (consistent with clinical convention). |
| `steps` | Count (integer stored as float) | All sources report daily totals natively. Apple Health may split across multiple entries per day — **sum** all entries for the same date. |

#### Adapter Responsibilities

Each adapter (e.g., `ingestion/apple_health.py`, `ingestion/whoop.py`) must:
1. **Read** raw data from the external source (API, file import, webhook)
2. **Normalize** values to canonical units per the table above
3. **De-duplicate** by date: if multiple readings exist for the same `(user_id, date, metric_type)`, apply the source-specific aggregation rule (lowest for resting HR, sum for steps, last-recorded for HRV, total for sleep)
4. **Time zone handling:** Convert all timestamps to the user's configured `timezone` before extracting the `date`. A sleep session that starts at 11 PM and ends at 7 AM counts as the **start** date.
5. **Upsert** into `health_metrics` using `ON CONFLICT (user_id, date, metric_type) DO UPDATE` — same as the manual adapter and `POST /metrics`
6. **Update** `data_sources.last_synced_at` on success

#### Canonical Data Flow

```
Wearable API / File Import
    ↓
DataSourceAdapter.sync()
    ↓ normalize units, aggregate daily, handle timezone
health_metrics table (canonical format)
    ↓
baseline_service → user_baselines (30-day rolling stats)
    ↓
metrics_engine → {z_scores, composites, trends, notable_days}
    ↓
pii_scrubber → compact JSON summary (<800 tokens)
    ↓
HealthAIService → narrative text
```

All downstream services (baselines, metrics engine, AI) consume `health_metrics` rows in canonical format. They never know or care which wearable the data came from. This is why normalization happens at the adapter boundary — not in the metrics engine or AI layer.

#### MVP Scope

MVP uses only the `ManualAdapter` (data inserted via `POST /metrics` or `seed.py`). The adapter interface and normalization contract are defined now so that adding real wearable adapters later requires zero changes to baselines, metrics engine, AI, or any router.

### AI Architecture & Data Flow

#### Core Principle: Code Does Math, AI Does Narrative

All numerical analysis (trends, z-scores, scoring) happens in deterministic Python code (`metrics_engine.py`). The LLM never sees raw data — it receives only a compact, precomputed JSON summary (<800 tokens) and generates narrative text. This boundary is strict and non-negotiable.

#### HealthAIService Interface

All AI calls go through an abstract `HealthAIService` interface (`services/ai/base.py`). The default implementation uses **Gemini Flash via Vertex AI** (`services/ai/gemini_service.py`) — not the consumer Gemini API — because Vertex AI is covered under Google Cloud's BAA, which is required for HIPAA compliance when processing health data. A factory (`services/ai/factory.py`) returns the correct implementation based on the `AI_PROVIDER` env var. To swap providers (Claude, GPT-4o, etc.), implement the interface and register it in the factory — zero changes to business logic.

**Interface contract:**
```python
class HealthAIService(ABC):
    @abstractmethod
    async def generate_debrief(self, summary: dict) -> dict:
        """Receives precomputed summary, returns {narrative, highlights}."""

    @abstractmethod
    async def chat_response(self, system_prompt: str, messages: list[dict], user_message: str) -> str:
        """Receives system prompt + message history + new message, returns response text."""
```

#### Deterministic Metrics Engine (`metrics_engine.py`)

All math runs in Python before any AI call. This is the central data processing pipeline — it reads raw DB rows, aggregates them, handles gaps, scores them, and outputs a structured summary dict consumed by both the AI prompt builder and directly by API endpoints (e.g., `GET /debriefs/weekly-summary`).

**Step 1 — Read & Validate Raw Data:**
- Input: `user_id`, `week_start` (Monday), `week_end` (Sunday)
- Query `health_metrics` for all rows where `date BETWEEN week_start AND week_end` for this user
- Query `health_metrics` for the prior week (for week-over-week comparison)
- Query `user_baselines` for the user's current baseline values + std deviations
- Validate: if fewer than 3 days of data exist for the current week, flag `insufficient_data: true` on the output and skip composite scoring (the AI will receive a note that data is sparse)

**Step 2 — Daily Aggregation & Gap Handling:**
- Group raw metrics by `(date, metric_type)` — there should be exactly 1 row per day per metric (enforced by DB unique constraint)
- Build a 7-day matrix: `{date → {metric_type → value}}` for Mon–Sun
- Missing days: mark as `null` in the matrix. Do NOT impute/fill gaps — the engine counts actual `days_with_data` per metric and reports it alongside averages
- Per metric, compute: `current_avg` (mean of non-null days), `current_min`, `current_max`, `days_with_data` (out of 7)

**Step 3 — Statistical Analysis:**
- **Z-scores:** Per metric, per day: `(value - baseline_mean) / std_deviation`. If `std_deviation` is 0 or baseline is missing, z-score = 0 (safe default).
- **Weekly z-score:** `(current_avg - baseline_mean) / std_deviation` — a single number per metric for the whole week.
- **Percent change vs baseline:** `((current_avg - baseline_mean) / baseline_mean) * 100` per metric. Guard against division by zero.
- **Week-over-week delta:** `((current_avg - prior_week_avg) / prior_week_avg) * 100` per metric. If prior week has insufficient data, omit this field.
- **Trend direction:** Classify each metric as `"improving"`, `"declining"`, `"stable"` based on: (a) week-over-week delta magnitude (>5% = improving/declining, ≤5% = stable), and (b) for resting HR, *lower* is improving (inverted polarity).

**Step 4 — Composite Scoring (heuristic, not AI):**
- **Recovery Score** (0–100): Weighted composite of normalized z-scores: HRV (40%), resting HR inverted (30%), sleep hours (30%). Formula: map each z-score to [0, 100] range via `clamp(50 + z_score * 15, 0, 100)`, then weighted average. Higher = better recovery.
- **Sleep Score** (0–100): Based on (a) sleep hours relative to 7–9h optimal range: `100 - abs(avg_sleep - 8) * 20`, clamped to [0, 100]; and (b) consistency penalty: subtract `std_deviation_of_sleep_this_week * 5`, clamped at 0.
- **Activity Score** (0–100): Steps relative to baseline: `clamp((current_avg_steps / baseline_steps) * 80, 0, 100)`, with a trend bonus of +10 if improving, -10 if declining.
- If `insufficient_data` is true, scores are null.

**Step 5 — Notable Day Detection:**
- Scan all daily z-scores. Any day where a metric's z-score > +2σ or < -2σ is flagged.
- Output: `[{date, metric_type, value, z_score, flag: "high" | "low"}]`
- Cap at 5 notable days to keep the output compact.

**Step 6 — Assemble Output Dict:**
```python
{
    "week": "2024-01-15 to 2024-01-21",
    "insufficient_data": False,
    "composite_scores": {
        "recovery": 72,
        "sleep": 58,
        "activity": 85
    },
    "per_metric": [
        {
            "type": "sleep_hours",
            "current_avg": 6.8,
            "current_min": 4.5,
            "current_max": 8.2,
            "days_with_data": 7,
            "baseline": 7.4,
            "std_deviation": 0.8,
            "delta_pct_vs_baseline": -8.1,
            "weekly_z_score": -1.2,
            "wow_delta_pct": -3.5,
            "trend": "declining"
        }
    ],
    "notable_days": [
        {"date": "2024-01-17", "metric_type": "sleep_hours", "value": 4.5, "z_score": -2.8, "flag": "low"}
    ],
    "prior_week_avgs": {
        "sleep_hours": 7.1, "hrv": 55, "resting_hr": 62, "steps": 9500
    }
}
```

This dict is consumed by three paths:
1. **`GET /debriefs/weekly-summary`** — returned directly to the frontend (no AI call)
2. **`pii_scrubber.py` → `HealthAIService.generate_debrief()`** — trimmed to <800 tokens and sent to the LLM
3. **Chat context builder** — excerpted for chat context alongside latest debrief narrative

#### PII Scrubbing (`pii_scrubber.py`)

Before any data leaves the backend for an AI call:
- User name, email, and all identifying fields are stripped
- Only `user_id` (UUID) is used as a reference — the LLM never sees who the person is
- The scrubber runs on the assembled prompt payload and returns a clean copy

**Rule:** Raw prompts are never stored in the database. Only the final AI-generated JSON output (narrative + highlights) is persisted in `weekly_debriefs`.

#### Safety Guardrails (`safety_guardrails.py`)

**Pre-LLM Emergency Filter (rules-based, no AI):**
- Before any chat message reaches the LLM, a keyword detector scans the user's message for emergency terms: `chest pain`, `can't breathe`, `suicidal`, `heart attack`, `overdose`, `seizure`, `unconscious`, `stroke symptoms`, etc.
- If triggered: bypass the LLM entirely. Return a hardcoded emergency response with specific guidance ("Call 911 or your local emergency number immediately") and relevant hotline numbers.
- This filter runs in `chat_service.py` before the AI call. It is deterministic and has zero latency.

**Post-LLM Diagnosis Stripper:**
- After every AI response (debrief or chat), a filter scans the output for:
  - Medical diagnoses ("you have [condition]", "this indicates [disease]")
  - Treatment plans ("you should take [medication]", "start [treatment]")
  - Medication instructions
- Matches are flagged and the offending sentences are removed or replaced with a redirect to a healthcare professional.
- Uses pattern matching + a curated blocked-phrases list (not another AI call).

**Mandatory Disclaimer:**
- Every AI-generated response (debrief narrative, chat message) includes a disclaimer field: `"disclaimer": "This is not medical advice. Consult a healthcare professional for medical concerns."`
- The disclaimer is appended server-side, not by the LLM. It is non-negotiable and cannot be prompt-injected away.

#### Data Flow: Debrief Generation

```
health_metrics (DB)
    ↓
metrics_engine.py → {z_scores, trends, composite_scores, notable_days}
    ↓
pii_scrubber.py → stripped compact JSON summary (<800 tokens)
    ↓
HealthAIService.generate_debrief(summary)
    ↓
safety_guardrails.post_filter(ai_response)
    ↓
Store final {narrative, highlights, disclaimer} in weekly_debriefs
    ↓
notification_service → email with summary + disclaimer
```

#### Data Flow: Chat Message

```
user_message
    ↓
safety_guardrails.emergency_check(user_message)
    → if emergency: return hardcoded response immediately (skip LLM)
    ↓
Build summarized context (baselines, this week's engine output, latest debrief)
    ↓
pii_scrubber.py → strip PII from context
    ↓
HealthAIService.chat_response(system_prompt, history, message)
    ↓
safety_guardrails.post_filter(ai_response)
    ↓
Store {user_message, assistant_response} in chat_messages
    ↓
Return {answer, citations, disclaimer}
```

#### Prompt Strategy

- **System prompt** (static, cacheable): Persona definition, tone instructions, output format rules, safety constraints. Separated from user data so the AI provider can cache it across calls.
- **User prompt** (dynamic): The compact precomputed JSON summary from the metrics engine. Never raw metric rows.
- **Max tokens:** Capped at a provider-appropriate limit (e.g., 1024 for debrief, 512 for chat) to control cost and prevent runaway responses.
- **Temperature:** Low (0.3–0.4) for debriefs (consistency), moderate (0.5–0.6) for chat (conversational).

### Anonymous Data Lake & Health Surveys (Moat Architecture)

#### Problem: Health Data Is the Moat, But It Must Be HIPAA-Safe

Anyone can build AI that analyzes wearable data. The competitive advantage is having a growing corpus of anonymized health data coupled with self-reported user context (diet, exercise, sleep habits, stress levels). This corpus — the "data lake" — enables population-level insights, benchmarking, and eventually ML models that no competitor can replicate without the same data volume.

However, the data lake MUST be de-identified per HIPAA Safe Harbor to avoid creating a second PHI store that requires its own BAA chain. The architecture below ensures the lake contains zero PII and only statistical aggregates.

#### De-identification Strategy: HMAC Safe Harbor

- **One-way HMAC mapping:** `HMAC-SHA256(user_id, ANONYMOUS_ID_SECRET)` → `anonymous_profile_id` (UUID). The `ANONYMOUS_ID_SECRET` is a separate env var, never shared with any other system. The same user always maps to the same profile (for longitudinal tracking), but the mapping is irreversible without the secret.
- **No foreign key to users:** The `anonymous_profiles` table has NO FK to `users`. The link exists only as a runtime HMAC computation in `anonymous_data_service.py`.
- **Weekly aggregates only:** The anonymous health data stores only `(avg, min, max, std_deviation, sample_count)` per metric per week. Raw daily values never enter the lake.
- **No PII in lake tables:** No names, emails, timezones, IP addresses, or device IDs. Only the opaque HMAC-derived UUID + coarse optional demographic bucket (e.g., `"30-39_M"`).
- **Explicit opt-in consent:** Users must grant `data_sharing_consent` before any data flows to the lake. Revoking consent stops future writes but does not retroactively delete anonymous data (since it's already de-identified and unlinkable without the secret).

#### Survey System

Health habit surveys provide the qualitative context that makes wearable data uniquely valuable:

- **Onboarding survey:** 5-8 questions about diet, exercise, sleep habits, stress, etc. Presented during the onboarding flow after timezone selection.
- **Periodic check-ins:** Every ~4 weeks (triggered after debrief generation), users are prompted to update their health habits. This captures lifestyle changes over time.
- **Question catalog:** Stored in `survey_questions` table. Questions are extensible via DB inserts — no code changes needed to add/modify questions.
- **Dual storage:** User answers are stored in `survey_responses` (linked to user_id for personalization) AND copied de-identified to `anonymous_survey_data` (linked to anonymous profile, if consented).

#### Data Flow: Anonymous Lake

```
Debrief generation completes
    ↓
Check user.data_sharing_consent == true
    ↓ (if consented)
anonymous_data_service.snapshot_weekly_health_data()
    ↓ derive HMAC anonymous_profile_id
    ↓ aggregate week's health_metrics → (avg, min, max, std_dev, sample_count)
    ↓ upsert into anonymous_health_data (idempotent on profile+metric+period)
anonymous data lake (de-identified, no PII)
```

```
User submits survey answers (onboarding or check-in)
    ↓
Store in survey_responses (linked to user_id)
    ↓
Check user.data_sharing_consent == true
    ↓ (if consented)
anonymous_data_service.copy_survey_to_anonymous_lake()
    ↓ derive HMAC anonymous_profile_id
    ↓ copy answers without PII to anonymous_survey_data
anonymous data lake (de-identified, no PII)
```

### API Endpoints

All endpoints receive `X-User-Id` and `X-API-Key` headers from the Next.js proxy. All list endpoints accept `limit` (default 20, max 100) and `offset` (default 0) query params and return `{items: [...], total: int}`.

**Metrics:**
- `GET /metrics?start_date=&end_date=&metric_type=` — returns metrics for authenticated user
- `POST /metrics` — create metric entries (body: array of `{date, metric_type, value}`)

**Debriefs:**
- `GET /debriefs?limit=20&offset=0` — paginated list, newest first
- `GET /debriefs/current` — get this week's debrief (narrative + highlights + disclaimer)
- `GET /debriefs/weekly-summary` — returns the deterministic metrics engine output for the current week: `{composite_scores: {recovery, sleep, activity}, per_metric: [{metric_type, current_avg, baseline, delta_pct, z_score, trend}], notable_days: [...], disclaimer}`. No AI call — pure computed data.
- `POST /debriefs/trigger` — manually trigger debrief generation (dev/testing)
- `POST /debriefs/{id}/feedback` — submit rating + optional comment

**Chat:**
- `GET /chat/sessions?limit=20&offset=0` — paginated list of user's chat sessions
- `POST /chat/sessions` — create new session
- `GET /chat/sessions/{id}/messages?limit=50&offset=0` — paginated messages in session
- `POST /chat/sessions/{id}/messages` — send message; runs emergency keyword check first (bypasses AI if triggered), then AI response. Returns `{answer, citations, disclaimer}` or `{emergency: true, message, hotlines, disclaimer}` if emergency detected.

**Sources:**
- `GET /sources` — list user's data sources
- `POST /sources` — register a data source

**Users:**
- `PATCH /users/me` — update user settings (accepts `{timezone, notification_email, email_notifications_enabled}`)
- `GET /users/me` — get current user profile with app-specific fields

**Baselines:**
- `GET /baselines` — returns current baselines for the authenticated user (all metric types)

**Onboarding:**
- `POST /onboarding/seed-demo` — generates 90 days of demo health data for the authenticated user, creates a `manual` data source, calculates baselines, and generates one sample debrief. Called during the onboarding flow when user selects "start with demo data."

**Surveys:**
- `GET /surveys/questions?category=&context=` — returns active survey questions, optionally filtered by category
- `POST /surveys/responses` — submit a batch of survey answers (body: `{answers: [{question_id, response_value}], survey_context: "onboarding"|"periodic_checkin"}`). If user has data-sharing consent, answers are also copied (de-identified) to the anonymous data lake.
- `GET /surveys/responses?survey_context=` — returns the authenticated user's survey responses
- `PATCH /surveys/consent` — update the user's anonymous data-sharing consent (body: `{data_sharing_consent: true|false}`)

### Debrief Generation Pipeline

Triggered weekly by APScheduler or manually via `/debriefs/trigger`. For each user:

Scheduler must only trigger `debrief_service` entrypoints; generation must be idempotent using the unique `(user_id, week_start)` constraint and status transitions.

**Week definition:** A week runs Monday through Sunday. `week_start` = that Monday. `week_end` = that Sunday. "Past 7 days" = Monday 00:00 through Sunday 23:59 in the user's timezone.

**Scheduler approach:** APScheduler runs an interval job every hour. Each tick queries for users where the current UTC time ≥ Sunday 21:00 in the user's timezone AND no `weekly_debriefs` row exists for that `(user_id, week_start)`. For each match, it calls `debrief_service.generate_weekly_debrief()`. The idempotent upsert on `(user_id, week_start)` prevents duplicates on overlap or retry.

1. Idempotently create or fetch the `weekly_debriefs` row for `(user_id, week_start)` with status `pending`, then set to `generating`
2. Query past 7 days of raw metrics from `health_metrics`
3. Query `user_baselines` for current baselines + std deviations
4. Query previous 3 weeks of weekly averages per metric for trend context
5. **Run `metrics_engine.py`**: Compute z-scores, percent deltas, week-over-week trends, composite scores (Recovery/Sleep/Activity), notable days. All math happens here — deterministic Python, no AI.
6. **Run `pii_scrubber.py`**: Assemble the engine output into a compact JSON summary (<800 tokens). Strip any PII (name, email). Only `user_id` UUID remains as identifier.
7. **Call `HealthAIService.generate_debrief(summary)`**: The LLM receives only the precomputed summary and returns `{narrative, highlights}`. It never sees raw metric rows.
8. **Run `safety_guardrails.post_filter()`**: Scan AI output for medical diagnoses, treatment plans, medication instructions. Strip or replace offending content. Append mandatory disclaimer.
9. Store final `{narrative, highlights}` in `weekly_debriefs` with status `generated`. **Never store the raw prompt or input payload** — only the AI's final output.
10. Send email via Resend with Jinja2 HTML template: 2–3 sentence summary + link to app + medical disclaimer + unsubscribe link
11. Update status to `sent`, set `email_sent_at`
12. On failure: set status to `failed`, log error

### Baseline Calculation

Runs after debrief generation (or on demand). For each user, for each metric type:
1. Query last 30 days of values from `health_metrics`
2. Calculate mean → `baseline_value`
3. Calculate standard deviation → `std_deviation`
4. Upsert into `user_baselines`

### Chat Implementation

Non-streaming for MVP. Per message:
1. **Emergency keyword check** (`safety_guardrails.emergency_check`): Scan the user's message for emergency terms (chest pain, suicidal, can't breathe, etc.). If triggered, bypass the LLM entirely — return a hardcoded emergency response with hotline numbers and `{emergency: true}`. Store the user message and the emergency response in `chat_messages`. Done.
2. Load last 10 messages from the current session
3. Build summarized health context (~800 tokens max, not raw data):
   - Current baselines with z-scores from this week's `metrics_engine` output
   - This week's composite scores (Recovery/Sleep/Activity)
   - Per-metric delta vs. baseline (percent change + trend direction)
   - Most recent debrief narrative (truncated if needed)
4. **PII scrub**: Strip name/email from context — only `user_id` UUID
5. Send to `HealthAIService.chat_response()` with static system prompt + history + user message
6. **Post-filter** (`safety_guardrails.post_filter`): Strip diagnoses, treatment plans, medication instructions from AI response. Append mandatory disclaimer.
7. Store both user message and assistant response in `chat_messages`
8. Return `{answer, citations, disclaimer}`

Rate limit: 20 messages per user per day. Enforced via a single rate-limit service function (DB count query for MVP, swappable to Redis later).

### Prompt Spec

**Strict boundary:** The LLM never receives raw metric rows or PII. It receives only a precomputed JSON summary from the metrics engine + PII scrubber. System prompts are static and separated from dynamic data for provider-level caching.

**Debrief system prompt (static, cacheable):**
- Persona: health data analyst, warm but scientific tone
- Output format: JSON object with `narrative` (string, 3–4 paragraphs) and `highlights` (array)
- Constraints: never diagnose medical conditions; recommend consulting a doctor if concerning patterns are present; reference the user's actual numbers; prioritize what changed or stands out; end with 1–2 concrete suggestions
- Max output tokens: 1024
- Temperature: 0.3

**Debrief user prompt (dynamic, <800 tokens):**
The compact precomputed JSON summary from `metrics_engine.py`, structured as:
```json
{
  "week": "2024-01-15 to 2024-01-21",
  "composite_scores": {
    "recovery": 72,
    "sleep": 58,
    "activity": 85
  },
  "metrics": [
    {
      "type": "sleep_hours",
      "current_avg": 6.8,
      "baseline": 7.4,
      "delta_pct": -8.1,
      "z_score": -1.2,
      "trend": "declining",
      "notable_days": [
        {"date": "2024-01-17", "value": 4.5, "z_score": -2.8, "flag": "low"}
      ]
    }
  ],
  "prior_week_trends": [
    {"week": "2024-01-08", "sleep_hours_avg": 7.1, "hrv_avg": 55, "resting_hr_avg": 62, "steps_avg": 9500}
  ]
}
```

**Example `highlights` JSON the AI must return:**
```json
[
  {"label": "Avg Sleep", "value": "6.8 hrs", "delta_vs_baseline": "-8%"},
  {"label": "Avg HRV", "value": "52 ms", "delta_vs_baseline": "+12%"},
  {"label": "Avg Resting HR", "value": "61 bpm", "delta_vs_baseline": "+3%"},
  {"label": "Avg Steps", "value": "9,241", "delta_vs_baseline": "-5%"}
]
```

**Chat system prompt (static, cacheable):**
- Persona: same as debrief persona
- Constraints: answer questions about the user's health data specifically; never diagnose; recommend professional consultation for medical concerns; keep responses conversational and concise
- Max output tokens: 512
- Temperature: 0.5

**Chat user context (dynamic, <800 tokens):**
- This week's composite scores + per-metric deltas (from metrics engine)
- Current baselines with z-scores
- Most recent debrief narrative (truncated to ~200 tokens if needed)
- No raw data, no PII

### Seed Data Spec

`seed.py` creates 3 test users with 90 days of data each. Each user has distinct patterns. These users are inserted directly into the database for backend API testing via Swagger — they do NOT have password hashes and cannot log in via the frontend. For frontend testing, use the normal signup flow + the onboarding demo data seeder.

**User 1 (consistent):** Sleep 7–8h, HRV 55–70ms, RHR 58–64bpm, Steps 8k–12k
**User 2 (poor sleep):** Sleep 4.5–6.5h with bad stretches, HRV 35–55ms, RHR 62–72bpm, Steps 5k–9k
**User 3 (active):** Sleep 6.5–8h, HRV 60–85ms, RHR 48–58bpm, Steps 10k–18k

All 4 metric types (`sleep_hours`, `hrv`, `resting_hr`, `steps`) are generated for each user, each day. All metrics include realistic day-to-day variance and weekday/weekend patterns. Each user gets a `manual` data source entry.

---

## Frontend (Next.js)

```
frontend/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   ├── [...nextauth]/route.ts  # NextAuth handler
│   │   │   └── signup/route.ts         # Custom signup: hash password (bcrypt), insert user, return session
│   │   └── [...path]/route.ts          # Catch-all proxy: forwards to FastAPI with X-User-Id + X-API-Key headers
│   ├── (app)/                  # Protected layout
│   │   ├── layout.tsx          # Nav, dark mode, disclaimer footer
│   │   ├── page.tsx            # Dashboard
│   │   ├── chat/page.tsx
│   │   ├── history/page.tsx
│   │   └── settings/page.tsx
│   ├── onboarding/page.tsx
│   ├── layout.tsx              # Root layout, NextAuth provider, theme provider
│   └── globals.css
├── components/
│   ├── debrief-card.tsx        # Narrative display + feedback widget
│   ├── sparkline-chart.tsx     # 30-day metric sparkline (Recharts)
│   ├── highlights-strip.tsx    # Key numbers with delta arrows
│   ├── chat-interface.tsx      # Message list + input
│   ├── nav.tsx                 # Sidebar/top nav with dark mode toggle
│   └── skeletons.tsx           # Loading states
├── lib/
│   ├── api.ts                  # Typed fetch wrapper for proxy routes
│   └── auth.ts                 # NextAuth config
├── next.config.js
├── tailwind.config.ts
└── package.json
```

### Screens

**Onboarding** (shown once, before `onboarded_at` is set):
- Welcome step: brief explanation of VitalView
- Timezone selection (auto-detected, user can override)
- Data sharing consent: explain the anonymous data lake and ask for opt-in ("Help improve health insights for everyone"). Clear, non-coercive language. Users can skip without penalty.
- Health habit survey (if consented): 5-8 questions about diet, exercise, sleep, stress. Calls `POST /surveys/responses` with `survey_context: "onboarding"`.
- Demo data option: seed user with sample data so app isn't empty
- Confirmation: "Your first debrief arrives Sunday" with countdown

**Dashboard** (main screen):
- This week's debrief as a typeset narrative card
- Feedback widget: thumbs up/down + optional comment
- 4 sparkline charts: sleep, HRV, steps, resting HR (30-day)
- Highlights strip: key numbers with delta arrows vs. baseline
- Empty state for new users: sample debrief + prompt to add data
- Loading skeleton while debrief generates
- Footer: "VitalView provides wellness insights, not medical advice."

**Chat:**
- Simple chat interface, non-streaming for MVP (full responses appear at once)
- Session list sidebar: new session button + past sessions
- Suggested starter questions in empty state
- Rate limit display: "X messages remaining today"

**History:**
- Scrollable list of past debriefs, newest first
- Each card: week range, highlights, expandable narrative, feedback given
- Date range filter

**Settings:**
- Timezone preference
- Email notification on/off
- Data sharing consent toggle (on/off) with clear explanation of what's shared and how it's anonymized
- Connected data sources list ("coming soon" badges for unimplemented)
- Current baseline values per metric with trend indicators
- Account management (NextAuth)

### UI Requirements
- Dark mode toggle in nav, defaults to system preference
- Mobile responsive on all screens
- Loading skeletons on every data-dependent component
- Proper empty states on every screen
- shadcn/ui components throughout for consistency

---

## 4-Week Roadmap

### Week 1 — Backend Foundation + Data Layer
- [ ] Repo setup: monorepo with `/backend` and `/frontend` directories
- [ ] `docker-compose.yml`: Postgres + FastAPI with hot-reload (frontend runs separately via `npm run dev`)
- [ ] `.env` files created per Environment Variables spec above
- [ ] SQLAlchemy models for all 11 tables with indexes (8 app tables + 3 NextAuth tables: accounts, sessions, verification_tokens)
- [ ] Alembic init + first migration (ALL tables: users with NextAuth + app columns + hashed_password, accounts, sessions, verification_tokens, data_sources, health_metrics, weekly_debriefs, chat_sessions, chat_messages, debrief_feedback, user_baselines)
- [ ] `core/config.py`: pydantic-settings loading all backend env vars
- [ ] `core/database.py`: engine, session, Base
- [ ] `core/auth.py`: dependency to extract user ID from `X-User-Id` header + verify `X-API-Key`
- [ ] Enforce auth boundary pattern: routers consume authenticated user dependency only (no direct header parsing in routers)
- [ ] `ingestion/base.py`: abstract `DataSourceAdapter` interface
- [ ] `ingestion/manual.py`: manual data adapter
- [ ] Keep signup validation/password hashing isolated in one Next.js route module as scaffolding for future auth-service migration
- [ ] `seed.py`: 90 days of data for 3 test users (see Seed Data Spec)
- [ ] `routers/metrics.py`: GET and POST endpoints
- [ ] `routers/sources.py`: GET and POST endpoints
- [ ] `routers/users.py`: GET /users/me + PATCH /users/me
- [ ] `routers/onboarding.py`: POST /onboarding/seed-demo
- [ ] `services/baseline_service.py`: rolling 30-day average + std deviation
- [ ] `routers/baselines.py`: GET /baselines
- [ ] Verify: seed data, query metrics, view baselines, update user settings all work via Swagger docs

### Week 2 — AI Layer + Safety + Notifications + Anonymous Data Lake
- [ ] `services/ai/base.py`: Abstract `HealthAIService` interface with `generate_debrief()` and `chat_response()` methods
- [ ] `services/ai/gemini_service.py`: Gemini Flash via Vertex AI implementation of `HealthAIService` (BAA-eligible)
- [ ] `services/ai/factory.py`: Provider factory returning correct implementation based on `AI_PROVIDER` env var
- [ ] `services/metrics_engine.py`: Deterministic code engine — z-scores, percent deltas, week-over-week trends, composite scores (Recovery/Sleep/Activity), notable day detection
- [ ] `services/pii_scrubber.py`: Strip name, email, all PII from AI payloads — only `user_id` UUID passes through
- [ ] `services/safety_guardrails.py`: Pre-LLM emergency keyword detector (bypass AI, return hardcoded emergency response) + post-LLM diagnosis stripper (pattern match + blocked phrases) + mandatory disclaimer injection
- [ ] `services/debrief_service.py`: Full pipeline orchestrator (query data → metrics engine → PII scrub → AI call → post-filter → store final JSON only → anonymous health data snapshot)
- [ ] `routers/debriefs.py`: GET list, GET current, GET weekly-summary (deterministic engine output, no AI), POST trigger, POST feedback
- [ ] `scheduler.py`: APScheduler hourly interval job — scans for users due for Sunday 9 PM debrief per their timezone
- [ ] `debrief_service` idempotency: enforce one debrief per `(user_id, week_start)` and safe status transitions for retries
- [ ] `services/notification_service.py`: Resend email integration
- [ ] `templates/debrief_email.html`: Jinja2 email template (summary + CTA link + disclaimer + unsubscribe)
- [ ] Full pipeline test: trigger → engine → AI → filter → store → email → status update → anonymous snapshot
- [ ] `services/chat_service.py`: Orchestrator with emergency check → context builder → PII scrub → AI call → post-filter → store
- [ ] `routers/chat.py`: sessions CRUD + POST message endpoint (returns `{answer, citations, disclaimer}` or `{emergency: true, message, hotlines}`)
- [ ] Chat context builder: summarized engine output + baselines + latest debrief (~800 tokens, no raw data)
- [ ] DB-based rate limiting (20 messages/day) via a replaceable rate-limit service boundary
- [ ] Alembic migration for survey + anonymous data lake tables (`survey_questions`, `survey_responses`, `anonymous_profiles`, `anonymous_survey_data`, `anonymous_health_data`) + `data_sharing_consent`/`data_sharing_consented_at` columns on users
- [ ] `services/anonymous_data_service.py`: HMAC-based anonymous profile derivation, survey-to-lake copy, weekly health data snapshot (integrated into debrief pipeline)
- [ ] `routers/surveys.py`: GET /surveys/questions, POST /surveys/responses (with automatic anonymous lake copy if consented), GET /surveys/responses, PATCH /surveys/consent
- [ ] `schemas/surveys.py`: Pydantic schemas for survey questions, answers, consent
- [ ] Seed initial survey questions into `survey_questions` table (5-8 health habit questions covering diet, exercise, sleep, stress)
- [ ] Verify: trigger debrief via API, receive email, anonymous health data snapshot written (if consented), survey flow works end-to-end, chat with health-aware AI, emergency keywords bypass AI correctly, post-filter strips diagnoses

### Week 3 — Frontend
- [ ] Next.js project init: Tailwind + shadcn/ui + dark mode + theme provider
- [ ] NextAuth config: Credentials provider (email/password), `@auth/pg-adapter`, JWT session strategy, custom `jwt`/`session` callbacks exposing `user.id`, custom `authorize()` with bcrypt verify, custom `/api/auth/signup` route with bcrypt hash, login/signup pages, protected routes
- [ ] API proxy: single catch-all route `/app/api/[...path]/route.ts` forwarding to FastAPI with `X-User-Id` + `X-API-Key` headers
- [ ] `lib/api.ts`: typed fetch wrapper
- [ ] Onboarding flow: welcome → timezone → data sharing consent → health habit survey (if consented) → demo data (calls `POST /onboarding/seed-demo`) → redirect to dashboard
- [ ] Dashboard: debrief card + feedback + sparklines + highlights + empty state
- [ ] Chat: session list + message interface + starters + rate limit display
- [ ] History: debrief feed + expand/collapse + date filter
- [ ] Settings: timezone, email prefs (calls `PATCH /users/me`), data sharing consent toggle (calls `PATCH /surveys/consent`), sources, baselines (calls `GET /baselines`), account
- [ ] Nav component with dark mode toggle
- [ ] Loading skeletons + empty states on all screens
- [ ] Mobile responsive pass
- [ ] Verify: full user flow works end-to-end against local backend

### Week 4 — Deploy + Polish
- [ ] Backend deployed to Railway (FastAPI + Postgres) — synthetic/demo data only; Railway does not offer BAAs
- [ ] Alembic migrations configured as Railway release command (runs before web process)
- [ ] Environment variables set in Railway per env var spec (DB URL, GCP project/location for Vertex AI, Resend key, API secret, Frontend URL)
- [ ] Frontend deployed to Vercel with env vars (NextAuth secret/URL, DB URL, Backend URL, API secret)
- [ ] Proxy configured for production URLs (BACKEND_URL points to Railway)
- [ ] End-to-end test on production: signup → onboard → demo debrief → trigger real debrief → email → chat → feedback
- [ ] Error handling: debrief generation retry on failure, API error states in UI
- [ ] `DELETE /users/me` endpoint: cascade-delete all user data (metrics, debriefs, chat, baselines, feedback) for HIPAA data deletion compliance
- [ ] Audit logging scaffold: log PHI access events (endpoint, user_id, timestamp, action) — no PHI values in logs
- [ ] README: architecture overview, local setup instructions, env var list, HIPAA compliance notes
- [ ] Document post-MVP upgrade hooks in README (signed service auth, external scheduler/queue, streaming chat, Redis rate limits, wearable adapters, HIPAA hosting migration to GCP/AWS with BAAs)
- [ ] Stretch: Apple Health XML import adapter (proof of concept)
- [ ] Stretch: chart hover with natural language metric summaries
