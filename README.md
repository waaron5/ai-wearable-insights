# VitalView

Your personal health narrative — AI-powered weekly debriefs from your wearable data.

VitalView reads sleep, HRV, resting heart rate, and step data from Apple HealthKit, generates weekly AI health narratives, and lets you chat with an AI health assistant about your trends.

## Architecture

```
React Native iOS App (Expo)
  → FastAPI backend (validates JWT)
    → PostgreSQL
    → Vertex AI (Gemini)
    → APNs (push notifications)
    → Resend (email, optional)

React Native iOS App
  → Apple HealthKit (on-device)
    → Syncs normalized data to backend
```

## Project Structure

```
/
├── backend/                  # FastAPI + PostgreSQL + AI pipeline
├── mobile/                   # React Native (Expo) iOS app
├── docker-compose.yml        # Postgres + FastAPI (local dev)
├── plan.md                   # Original project plan
├── migration-plan.md         # Web → iOS migration plan
└── frontend-web-archive/     # Archived Next.js web frontend
```

## Quick Start

### Prerequisites

- macOS with Xcode installed
- Docker Desktop
- Node.js 20+
- Python 3.12+
- Physical iPhone (HealthKit requires a real device)
- Apple ID (free is sufficient for development)

### 1. Start the Backend

```bash
docker compose up -d
```

This starts PostgreSQL on port **5433** and the FastAPI backend on port **8000**. Alembic migrations run automatically on startup.

### 2. Configure Environment

Copy the example env file and fill in your credentials:

```bash
cp backend/.env.example backend/.env
```

Required variables:
- `DATABASE_URL` — set automatically by Docker (`postgresql://vitalview:vitalview@db:5432/vitalview`)
- `JWT_SECRET_KEY` — change from default in production

Optional:
- `GCP_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS` — for Vertex AI debrief generation
- `RESEND_API_KEY` — for email notifications
- `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_AUTH_KEY_PATH` — for push notifications (requires paid Apple Developer account)

### 3. Run the Mobile App

```bash
cd mobile
npm install
```

Update the API URL in `mobile/constants/config.ts` with your Mac's local network IP:

```typescript
export const API_URL = "http://192.168.x.x:8000";
```

Then build and run on your iPhone:

```bash
npx expo prebuild --platform ios
npx expo run:ios --device
```

> **Note:** `localhost` on a physical iPhone refers to the phone itself. You must use your Mac's LAN IP address.

### 4. Seed Demo Data

After signing up and completing onboarding, the app offers to load 90 days of simulated health data so you can explore all features immediately.

## API Documentation

With the backend running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Key Features

- **Weekly AI Debriefs** — personalized health narratives generated from your wearable data
- **Health Chat** — conversational AI assistant with safety guardrails and crisis detection
- **HealthKit Integration** — automatic sync from Apple Watch and compatible wearables
- **Push Notifications** — get notified when your weekly debrief is ready
- **Anonymous Data Lake** — opt-in anonymized data sharing with PII scrubbing
- **Dark Mode** — full light/dark theme support

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native (Expo SDK 55), TypeScript, expo-router |
| Backend | FastAPI, SQLAlchemy 2.0, Alembic, Python 3.12 |
| Database | PostgreSQL 16 |
| AI | Google Vertex AI (Gemini 2.0 Flash) |
| Auth | JWT (python-jose), Sign in with Apple |
| Push | APNs HTTP/2 (token-based auth) |
| Email | Resend |
