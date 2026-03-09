# iOS Migration Plan — VitalView → React Native + HealthKit

## Overview

This plan converts VitalView from a Next.js web app to an iOS mobile app using React Native (via Expo). The backend (FastAPI + PostgreSQL) remains largely intact. The major changes are:

1. **Frontend:** Next.js → React Native (Expo) with iOS-native navigation, UI, and storage
2. **Auth:** NextAuth (server-side) → JWT-based auth issued directly by FastAPI
3. **Health Data:** Custom `DataSourceAdapter` with manual data → Apple HealthKit as the primary data source, read natively on-device
4. **Notifications:** Resend email → Apple Push Notifications (APNs) as primary, email as optional
5. **Proxy removal:** The Next.js API proxy layer is eliminated; the React Native app communicates directly with FastAPI

### What Stays the Same

- FastAPI backend (routers, services, models, schemas) — ~90% unchanged
- PostgreSQL schema and Alembic migrations
- AI pipeline (metrics engine → PII scrubber → Vertex AI → safety guardrails)
- Anonymous data lake architecture
- Survey system
- Chat service logic
- Debrief generation pipeline
- Docker Compose for local development

### What Gets Simplified

- **No more Next.js proxy layer** — the mobile app talks directly to FastAPI
- **No more NextAuth** — FastAPI issues JWTs itself (one auth system instead of two)
- **No more `API_SECRET_KEY` header trust** — replaced with proper signed JWT verification
- **No more 3 NextAuth DB tables** (`accounts`, `sessions`, `verification_tokens`) — can be dropped
- **No more custom data normalizer per wearable** — HealthKit already normalizes data from Apple Watch, Oura, Whoop, Garmin (if synced to Apple Health). One adapter replaces many.
- **No more server-side rendering concerns** — everything is client-rendered in React Native

---

## Architecture Changes

### Before (Web)

```
Browser
  → Next.js (SSR + API proxy + NextAuth)
    → FastAPI (trusts X-User-Id header)
      → PostgreSQL
      → Vertex AI
      → Resend (email)
```

### After (iOS)

```
React Native iOS App
  → FastAPI (validates JWT directly)
    → PostgreSQL
    → Vertex AI
    → APNs (push notifications)
    → Resend (email, optional)

React Native iOS App
  → Apple HealthKit (on-device, native bridge)
    → Syncs normalized data to FastAPI
```

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Expo (managed workflow)** | Faster development, OTA updates, EAS Build for CI/CD. Eject to bare workflow later if needed |
| **React Native (not SwiftUI)** | Maximize code reuse from existing TypeScript/React codebase. Business logic, API types, and component structure carry over |
| **FastAPI issues JWTs** | Eliminates the dual-auth complexity of NextAuth + API proxy. One auth system, simpler trust boundary |
| **HealthKit as primary data source** | iOS users get automatic wearable data from Apple Watch + any app that writes to HealthKit (Whoop, Oura, Garmin Connect). This replaces the need for individual wearable API adapters |
| **Keep FastAPI backend** | Proven, working backend. Only auth changes needed. All AI/data/safety logic untouched |
| **APNs for push notifications** | Native iOS push for debrief alerts. Email becomes secondary/optional |

---

## What the Developer Must Do (Non-Automatable Setup)

These are steps that require developer accounts, physical devices, or Apple portal actions that an AI agent cannot perform.

### 1. Apple ID Setup (Free — For Initial Development)

You do **not** need a paid Apple Developer account ($99/year) to build and run the app on your iPhone. A **free Apple ID** ("Personal Team" in Xcode) is sufficient for initial development. Xcode auto-manages code signing.

**What works with a free Apple ID:**
- ✅ Build and install the app on your iPhone via USB (`npx expo run:ios --device`)
- ✅ All screens: auth, dashboard, chat, history, settings, onboarding
- ✅ Backend API integration (JWT auth, debriefs, metrics, etc.)
- ✅ Seed/demo data for testing without real wearable data
- ✅ Dark mode, haptics, navigation, all UI components
- ✅ Hot reload via Expo dev client

**What requires the paid Apple Developer Program ($99/year) — deferred until you're ready:**
- ❌ HealthKit (reading wearable data from Apple Watch/Health app)
- ❌ Push Notifications (APNs for debrief alerts)
- ❌ Sign in with Apple
- ❌ TestFlight / App Store distribution
- ❌ EAS cloud builds with ad-hoc provisioning

> The code for HealthKit, APNs, and Sign in with Apple will be **built during migration** so everything is ready — but these features will be **dormant** until you enroll in the paid program and configure the entitlements. The app gracefully falls back to seed data and email/password auth in the meantime.

**Limitations of free signing:**
- Apps expire after **7 days** and must be re-installed (just re-run `npx expo run:ios --device`)
- Maximum of **3 apps** simultaneously installed on your device via free signing
- No distribution to other devices (your iPhone only)

**Setup:**
- [ ] Sign into your Apple ID in Xcode → Settings → Accounts → Add Apple ID
- [ ] When Xcode prompts to select a team, choose your **Personal Team** (your Apple ID name)
- [ ] Xcode will auto-manage signing and create a free provisioning profile

### 2. Paid Apple Developer Account (Later — When Ready for HealthKit/APNs/App Store)

When you're satisfied with the core app and ready to enable HealthKit + push notifications:

- [ ] Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
- [ ] Create an App ID in the Apple Developer Portal with capabilities: **HealthKit**, **Push Notifications**, **Sign in with Apple**
- [ ] Update the `bundleIdentifier` in `app.config.ts` to match the registered App ID
- [ ] Create a provisioning profile (Development) tied to this App ID
- [ ] Generate an APNs authentication key (`.p8` file) in the Apple Developer Portal → Keys section. Save the Key ID, Team ID, and `.p8` file
- [ ] Rebuild the app: `npx expo prebuild --clean --platform ios && npx expo run:ios --device`
- [ ] HealthKit, APNs, and Sign in with Apple will now work on-device

### 3. Xcode & Development Environment

- [ ] Install Xcode (latest stable) from the Mac App Store
- [ ] Install Xcode Command Line Tools: `xcode-select --install`
- [ ] Install CocoaPods via Homebrew: `brew install cocoapods` (needed for native iOS dependencies — avoid `sudo gem install cocoapods` which often breaks on Apple Silicon Macs due to Ruby version conflicts)
- [ ] Ensure you have Node.js 18+ and the Expo CLI: `npx expo --version`
- [ ] Ensure Watchman is installed: `brew install watchman` (used by Metro bundler for fast file watching)

### 4. HealthKit Entitlements & Privacy (Requires Paid Developer Account)

> **Skip this section until you enroll in the paid Apple Developer Program.** The code will be written during migration, but the entitlements won't activate until you have a paid account and a properly configured App ID.

- [ ] In the Xcode project (after Expo prebuild), verify the HealthKit entitlement is present in the `.entitlements` file
- [ ] Review the `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription` privacy strings in `app.config.ts` (Apple rejects vague descriptions)
- [ ] HealthKit data types to request read access for:
  - `HKQuantityTypeIdentifierStepCount`
  - `HKQuantityTypeIdentifierHeartRateVariabilitySDNN`
  - `HKQuantityTypeIdentifierRestingHeartRate`
  - `HKCategoryTypeIdentifierSleepAnalysis`
- [ ] **Test on a physical device** — HealthKit does not work in the iOS Simulator. You need an iPhone (ideally paired with an Apple Watch) for integration testing

### 5. App Store Preparation (When Ready to Ship)

- [ ] Create the app listing in [App Store Connect](https://appstoreconnect.apple.com/)
- [ ] Prepare App Store screenshots (6.7", 6.1", iPad if applicable)
- [ ] Write App Store description, keywords, privacy policy URL, support URL
- [ ] Complete the App Privacy questionnaire in App Store Connect (declare HealthKit data collection, health data usage)
- [ ] Submit for App Review — expect scrutiny on:
  - HealthKit usage justification (must demonstrate clear user benefit)
  - Medical disclaimer language (already implemented server-side)
  - Data privacy practices (HIPAA compliance documentation helps)

### 6. Expo / EAS Setup

> **⚠️ Critical: Expo Go will NOT work for this project.** `react-native-health` (HealthKit) is a custom native module that Expo Go's sandbox cannot load. You must use an **Expo development build** — a custom `.app` built via `npx expo run:ios --device` (local Xcode build) or EAS cloud build — for all development and testing.

**For initial development (free Apple ID, local builds):**
- [ ] Install `expo-dev-client` in the mobile project: `npx expo install expo-dev-client`
  - This turns the app into a custom development build that supports arbitrary native modules. It replaces Expo Go entirely.
- [ ] Build locally: `npx expo prebuild --platform ios && npx expo run:ios --device` — this uses Xcode with your free Personal Team to sign and install on your iPhone. No EAS account needed.

**For later (paid developer account, cloud builds, distribution):**
- [ ] Create an Expo account at [expo.dev](https://expo.dev) if you don't have one
- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] Run `eas login` and `eas build:configure` in the project
- [ ] Link your Apple Developer account in EAS for automated code signing
- [ ] Create `eas.json` with the following build profiles:

```json
{
  "cli": {
    "version": ">= 7.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "buildConfiguration": "Release"
      }
    },
    "production": {
      "distribution": "store"
    }
  },
  "submit": {
    "production": {}
  }
}
```

  - **`development`** — Debug build with dev menu and fast refresh. Distributed directly to registered devices (no App Store). Used during active development.
  - **`preview`** — Release-mode build distributed internally via EAS (ad-hoc provisioning). No dev menu. Used for realistic end-to-end testing.
  - **`production`** — App Store / TestFlight build.

### 7. Installing on iPhone Without the App Store

There are three ways to get the app onto your iPhone for testing — none require an App Store submission or App Store review.

#### Option A — Local Build via Xcode (Recommended — Works With Free Apple ID)

This is the **recommended option for solo development** — builds directly from your Mac to your iPhone via USB, no cloud build wait time, no paid developer account required.

1. Connect your iPhone to your Mac via USB (or configure wireless debugging in Xcode → Window → Devices and Simulators)
2. Ensure your iPhone is registered as a development device in Xcode (Xcode auto-prompts to trust the device)
3. When prompted for a signing team, select your **Personal Team** (free Apple ID)
4. Generate the native iOS project:
   ```bash
   cd mobile
   npx expo prebuild --platform ios
   ```
5. Build and install directly on your iPhone:
   ```bash
   npx expo run:ios --device
   ```
   Expo/Xcode will compile the native code (~2-5 min on first build, incremental builds much faster) and install directly on your phone. This includes `expo-dev-client` and all native modules. HealthKit entitlements will be included in the code but won't activate until you have a paid developer account.
6. Start the local dev server:
   ```bash
   npx expo start --dev-client
   ```
7. The app on your iPhone connects to the Metro dev server on your Mac (auto-discovered on the same WiFi network) for **hot reload** — code changes appear on your phone instantly without rebuilding.

> You only need to re-run `npx expo run:ios --device` when native dependencies change (e.g., adding a new native module). For all TypeScript/React changes, the dev server hot-reloads automatically.

> **Free signing note:** The app expires every 7 days. Just re-run `npx expo run:ios --device` to re-install. This limitation goes away with a paid developer account.

#### Option B — EAS Cloud Build (Requires Paid Developer Account)

> **Skip this option until you have a paid Apple Developer account.** EAS cloud builds require proper code signing which needs a paid developer membership.

1. Register your iPhone with EAS (handles provisioning automatically):
   ```bash
   eas device:create
   ```
   EAS prints a URL/QR code — open it on your iPhone and follow the prompt to install a configuration profile. This registers your device UDID without you needing to touch the Apple Developer Portal manually.
2. Build the development client in the cloud:
   ```bash
   eas build --platform ios --profile development
   ```
3. When the build finishes (~10–15 min), EAS provides a direct install link. Open it on your iPhone — tap **Install** to sideload the `.ipa` without the App Store.
4. Start the local dev server:
   ```bash
   npx expo start --dev-client
   ```
5. Open the installed app on your iPhone — it connects to your Mac's dev server for live reload.

> Ad-hoc provisioning supports up to **100 registered devices** per Apple Developer account per year.

#### Option C — EAS Preview Build (Requires Paid Developer Account)

For testing a fully built release version (closest to what users will run):

```bash
eas build --platform ios --profile preview
```

EAS signs the build with an ad-hoc provisioning profile and provides a QR code / direct link. Any registered device can install it instantly — no Xcode, no USB cable, no App Store.

#### Option D — TestFlight (Requires Paid Developer Account)

TestFlight is Apple's official beta platform and does **not** require a full App Store review or public listing:

1. Create the app entry in [App Store Connect](https://appstoreconnect.apple.com/) (bundle ID and name only — no screenshots, no metadata required)
2. Build for TestFlight:
   ```bash
   eas build --platform ios --profile production
   ```
3. Submit to TestFlight:
   ```bash
   eas submit --platform ios
   ```
4. Add **Internal Testers** in App Store Connect → instant access, up to 100 testers, **no Apple review required**
5. Testers install via the TestFlight app on their iPhone

> Add External Testers (up to 10,000) if needed — these go through Apple's Beta App Review (~1–2 days), but this is a much lighter process than full App Store review.

#### Which Option to Use

| Situation | Apple Account Needed | Use |
|-----------|---------------------|-----|
| Daily development on your own iPhone (fastest) | Free Apple ID ✅ | **Option A** — Local Xcode build |
| Can't build locally / need cloud build | Paid ($99/year) | **Option B** — EAS development build |
| Testing release behavior / full app flow | Paid ($99/year) | **Option C** — EAS preview build |
| Sharing with other testers, pre-launch QA | Paid ($99/year) | **Option D** — TestFlight |
| HealthKit + APNs testing (requires physical device) | Paid ($99/year) | Any of the above |

> **For your current situation:** Use **Option A** exclusively. Everything else becomes available when you enroll in the paid program.

**Checklist:**
- [ ] Connect iPhone to Mac via USB and trust the device in Xcode
- [ ] Ensure Xcode is using your **Personal Team** (free Apple ID) for signing
- [ ] Generate native project: `npx expo prebuild --platform ios` (in `mobile/`)
- [ ] Build and install on device: `npx expo run:ios --device`
- [ ] Start dev server: `npx expo start --dev-client` — verify hot reload works
- [ ] Start Docker backend: `docker-compose up` from project root
- [ ] Verify app connects to backend at `http://<your-mac-ip>:8000` on the same WiFi network
- [ ] Test full app flow with seed data: signup → onboard → dashboard → chat → history → settings
- [ ] If app expires after 7 days, re-run `npx expo run:ios --device` to re-install
- [ ] When ready for HealthKit/APNs (after paid enrollment): rebuild with `npx expo prebuild --clean --platform ios && npx expo run:ios --device`

---

## Day-to-Day iPhone Development Workflow

This section describes the routine for developing and testing on your physical iPhone. **You do NOT need the App Store, TestFlight, or EAS cloud builds for daily development.**

### Network Setup (One-Time)

Your iPhone must be able to reach both the **Expo dev server** (for hot reload) and the **FastAPI backend** (for API calls). Both run on your Mac.

1. **Same WiFi network** — your iPhone and Mac must be on the same local network
2. **Find your Mac's local IP:**
   ```bash
   ipconfig getifaddr en0
   ```
   This returns something like `192.168.1.42`. This is the IP your iPhone uses to reach the backend.
3. **Backend URL:** Set `API_URL=http://192.168.1.42:8000` in the mobile app's environment config (see `mobile/constants/config.ts`). During development, this is your Mac's LAN IP. For production, it's the deployed backend URL.
4. **Expo dev server** — Expo automatically handles LAN discovery. When you run `npx expo start --dev-client`, it broadcasts on the local network and the app on your iPhone finds it automatically.
5. **iOS App Transport Security (ATS):** Development builds created via `expo-dev-client` automatically allow HTTP (non-HTTPS) connections for `localhost` and LAN IPs. No extra ATS configuration is needed for dev builds. Production builds enforce HTTPS.

> **Tip:** If your Mac's IP changes (e.g., different WiFi network), update the `API_URL`. Alternatively, use `npx expo start --tunnel` which creates an ngrok tunnel — but this only tunnels the Expo dev server, not the backend. For a stable setup, consider deploying the backend to Railway and using that URL even during development.

### Daily Routine

```
1. Start the backend:
   $ docker-compose up                     # Starts Postgres + FastAPI on port 8000

2. Start the Expo dev server:
   $ cd mobile
   $ npx expo start --dev-client           # Metro bundler + LAN broadcast

3. Open the app on your iPhone:
   - If already installed via prior local build → launch the app, it auto-connects to Metro
   - If native code changed → rebuild: npx expo run:ios --device

4. Develop:
   - Edit TypeScript/React code → hot reload appears on phone instantly
   - Edit native config (app.config.ts, add native module) → re-run npx expo run:ios --device
   - Backend changes → FastAPI auto-reloads via Docker volume mount (--reload flag)

5. Test HealthKit:
   - Wear Apple Watch throughout the day → data flows to iOS Health app
   - Open VitalView app → HealthKit sync pulls latest data → sends to backend
   - Or manually add data: iOS Settings → Health → Browse → (select metric) → Add Data
```

### When to Rebuild the Native App

You only need to re-run `npx expo run:ios --device` when:
- Adding/removing a native dependency (e.g., new Expo module)
- Changing `app.config.ts` values that affect the native build (entitlements, permissions, bundle ID)
- Updating `react-native-health` or `expo-notifications` versions

For all other changes (screens, components, services, styles), hot reload handles it.

---

## Migration Tasks

### Phase 1: Backend Auth Migration (FastAPI Issues JWTs)

**Goal:** Replace the NextAuth + proxy trust model with FastAPI-native JWT authentication. The mobile app will authenticate directly with FastAPI.

#### Task 1.1 — Add JWT Auth to FastAPI

**Files to create/modify:**
- `backend/app/core/jwt.py` (new) — JWT creation and verification utilities
- `backend/app/core/auth.py` (modify) — add JWT-based `get_current_user` dependency alongside existing header-based auth
- `backend/app/routers/auth.py` (new) — `/auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/me` endpoints
- `backend/app/core/config.py` (modify) — add `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`

**Details:**
- Use `python-jose[cryptography]` or `PyJWT` for JWT encoding/decoding
- Access tokens: short-lived (15-30 min), contain `user_id`, `email`, `exp`
- Refresh tokens: long-lived (30 days), stored in DB or as opaque tokens. Used to issue new access tokens without re-login
- `POST /auth/signup`: accepts `{email, name, password}`, hashes password with bcrypt, creates user, returns `{access_token, refresh_token, user}`
- `POST /auth/login`: accepts `{email, password}`, verifies bcrypt hash, returns `{access_token, refresh_token, user}`
- `POST /auth/refresh`: accepts `{refresh_token}`, validates, returns new `{access_token}`
- Password hashing: use `passlib[bcrypt]` (same algorithm as the current Next.js signup route)
- Add `passlib[bcrypt]` and `python-jose[cryptography]` to `requirements.txt`

**Migration note:** Keep the existing `X-User-Id` + `X-Api-Key` header auth working in parallel during migration. The `get_current_user_id` dependency should check for a JWT `Authorization: Bearer <token>` header first, then fall back to the header-based approach. This allows the web frontend (if maintained) to continue working.

#### Task 1.2 — Update `core/auth.py` Dependency

Modify the `get_current_user_id()` dependency to support both auth modes:

```python
async def get_current_user_id(request: Request) -> uuid.UUID:
    # 1. Check for Bearer token (mobile app)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        return verify_jwt_and_extract_user_id(token)
    
    # 2. Fall back to X-User-Id + X-Api-Key (legacy web proxy)
    api_key = request.headers.get("X-Api-Key")
    if api_key and secrets.compare_digest(api_key, settings.API_SECRET_KEY):
        return uuid.UUID(request.headers.get("X-User-Id"))
    
    raise HTTPException(status_code=401, detail="Not authenticated")
```

#### Task 1.3 — Add Refresh Token Table (Optional)

Add a `refresh_tokens` table to track issued refresh tokens, enabling revocation:

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users |
| token_hash | VARCHAR | SHA-256 hash of the refresh token |
| expires_at | TIMESTAMP | |
| revoked_at | TIMESTAMP | Null until revoked |
| created_at | TIMESTAMP | |

Create an Alembic migration for this table. This also makes the NextAuth tables (`accounts`, `sessions`, `verification_tokens`) obsolete — create a migration to drop them once the web frontend is fully retired.

#### Task 1.4 — Add Apple Sign-In Support

Apple requires apps that offer third-party sign-in to also offer "Sign in with Apple." Implement this during migration.

> **Note:** Sign in with Apple requires a paid Apple Developer account to function on-device. The backend endpoint and client-side UI will be built now, but the Sign in with Apple button will be hidden or disabled at runtime until HealthKit entitlements are active (which serves as a proxy for "paid account is configured"). Email/password auth remains the primary method during free-account development.

**Backend:**
- `POST /auth/apple`: accepts Apple's identity token (JWT from the iOS Sign in with Apple SDK), verifies it against Apple's public keys (fetched from `https://appleid.apple.com/auth/keys`), extracts `email` and `sub` (Apple user ID), creates or links user account, returns `{access_token, refresh_token, user}`
- Store the Apple `sub` in a new column `apple_user_id VARCHAR` on the `users` table (nullable). When a user signs in with Apple, look up by `apple_user_id` first; if not found and email matches an existing account, link it; otherwise create a new account
- Add `apple_user_id` column via Alembic migration
- Add `PyJWT` or reuse `python-jose` to decode and verify Apple's identity token (RS256, verify `iss`, `aud`, `exp`)

**Client (React Native):**
- Use `expo-apple-authentication` package for the native Sign in with Apple button and flow
- On successful Apple auth, send the identity token to `POST /auth/apple`
- Handle the case where Apple only provides email on first sign-in (subsequent logins return `sub` only — the backend must store the email from the first call)
- Show the Sign in with Apple button only when the capability is available (`AppleAuthentication.isAvailableAsync()`)

---

### Phase 2: HealthKit Integration (Replace Data Normalizers)

**Goal:** Use Apple HealthKit as the primary source of health data, replacing the custom `DataSourceAdapter` interface for wearable-specific adapters.

#### Why HealthKit Simplifies Everything

The current architecture planned for individual adapters per wearable (Apple Health, Whoop, Oura, Garmin, Fitbit). HealthKit eliminates this:

- **Apple Watch** writes directly to HealthKit
- **Whoop** syncs to HealthKit via the Whoop app
- **Oura** syncs to HealthKit via the Oura app
- **Garmin** syncs to HealthKit via Garmin Connect
- **Fitbit** syncs to HealthKit via third-party bridges (less reliable, but possible)

One HealthKit adapter replaces 5+ planned wearable adapters.

#### Task 2.1 — Create HealthKit Native Module

**Package:** `react-native-health` (Expo-compatible) or `expo-health` (if available)

**Implementation:**
- Request authorization for specific HealthKit data types on first app launch (after onboarding)
- Read the following data types:
  | HealthKit Type | Maps To | Normalization |
  |---------------|---------|---------------|
  | `HKCategoryTypeIdentifierSleepAnalysis` | `sleep_hours` | Sum `asleep` intervals per night, convert to hours |
  | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | `hrv` | Daily average SDNN in ms |
  | `HKQuantityTypeIdentifierRestingHeartRate` | `resting_hr` | Lowest daily reading in BPM |
  | `HKQuantityTypeIdentifierStepCount` | `steps` | Sum all step samples per day |
- Date handling: assign sleep sessions to the start date (matching current normalizer spec)
- Return normalized `{date, metric_type, value}[]` arrays

#### Task 2.2 — Build HealthKit Sync Service (Client-Side)

**New file:** `mobile/services/healthkit-sync.ts`

**Sync strategy:**
1. On app launch (foreground): query HealthKit for last 7 days of data
2. On periodic background fetch: push latest data to backend
3. On initial setup (onboarding): query HealthKit for last 90 days to build baseline
4. Track `last_synced_date` in on-device AsyncStorage
5. Deduplicate: HealthKit data is idempotently synced — the backend's `ON CONFLICT DO UPDATE` handles duplicates

**Sync flow:**
```
HealthKit (on-device)
  → healthkit-sync.ts reads + normalizes
    → POST /metrics (batch upsert to backend)
      → Backend stores in health_metrics
        → Baselines recalculated
```

#### Task 2.3 — Update Backend Data Source Handling

- Add `source_type: "apple_healthkit"` as a recognized source type
- The `POST /metrics` endpoint already handles batch upserts — no changes needed
- The `POST /onboarding/seed-demo` endpoint should check: if the user has HealthKit data, skip seeding demo data and instead sync from HealthKit. If no HealthKit data, offer demo data as before
- Update `data_sources` to auto-create an `apple_healthkit` source on first HealthKit sync

#### Task 2.4 — Background HealthKit Sync

**iOS Background Modes:**
- Enable "Background fetch" in Expo config
- Use `expo-background-fetch` to periodically sync HealthKit data to the backend
- HealthKit also supports **observer queries** — register for real-time notifications when new health data is written by any app (e.g., after a workout). Use `HKObserverQuery` via the native bridge to trigger syncs

**Frequency:** Sync at minimum once daily. More frequent syncs (every 1-4 hours) if battery allows, using iOS background fetch scheduling.

#### Task 2.5 — Remove/Archive Unused Ingestion Code

The following become unnecessary for the iOS app:
- `backend/app/services/ingestion/manual.py` — keep for testing/seeding but no longer primary
- Planned adapters for Whoop, Oura, Garmin, Fitbit API integrations — HealthKit covers all of these
- The `DataSourceAdapter` abstract interface can stay as scaffolding but is much less critical now

---

### Phase 3: React Native Frontend (Expo)

**Goal:** Rebuild the frontend in React Native, preserving all existing functionality.

#### Task 3.1 — Project Scaffolding

```bash
npx create-expo-app@latest mobile --template expo-template-blank-typescript
cd mobile
npx expo install expo-dev-client          # Required — replaces Expo Go; enables HealthKit native module
npx expo install expo-router expo-secure-store expo-font expo-linking expo-constants expo-status-bar
npx expo install react-native-reanimated react-native-gesture-handler
npx expo install react-native-safe-area-context react-native-screens
npx expo install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack
npx expo install expo-haptics expo-notifications expo-background-fetch expo-task-manager
npx expo install expo-apple-authentication
npm install react-native-health
```

**Expo Configuration (`app.config.ts`):**

This file is critical — it configures HealthKit entitlements, push notifications, background modes, and the bundle identifier that Apple uses to identify your app.

```typescript
// mobile/app.config.ts
import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "VitalView",
  slug: "vitalview",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "vitalview",  // Deep link scheme: vitalview://
  userInterfaceStyle: "automatic",  // Supports light + dark mode
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#0f766e",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.vitalview.app",  // Works as-is with free Apple ID signing. Change later when you register an App ID with a paid developer account.
    buildNumber: "1",
    infoPlist: {
      // HealthKit privacy strings — required by Apple when HealthKit entitlements are active.
      // These are included now so the code is ready. They have no effect until you enable
      // HealthKit via a paid developer account.
      NSHealthShareUsageDescription:
        "VitalView reads your health data (sleep, heart rate variability, resting heart rate, and steps) to generate personalized weekly health debriefs and track trends over time.",
      NSHealthUpdateUsageDescription:
        "VitalView does not write to your health data. This permission is requested by the HealthKit framework but is not used.",
      UIBackgroundModes: ["fetch", "remote-notification"],
    },
    // HealthKit + APNs entitlements — these require a paid Apple Developer account.
    // With a free Apple ID, the app will build and run but these capabilities will be inactive.
    // The HealthKit and push notification code paths check for availability at runtime and
    // gracefully fall back (seed data instead of HealthKit, no push notifications).
    entitlements: {
      "com.apple.developer.healthkit": true,
      "com.apple.developer.healthkit.access": ["health-records"],
      "aps-environment": "development",  // Change to "production" for App Store builds
    },
    config: {
      usesNonExemptEncryption: false,  // Avoids App Store compliance questionnaire for standard HTTPS
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#0f766e",
      },
    ],
    [
      "expo-background-fetch",
      {
        startOnBoot: true,
      },
    ],
  ],
  extra: {
    eas: {
      projectId: "your-eas-project-id",  // ← Set after running eas build:configure
    },
  },
});
```

> **Bundle identifier:** `com.vitalview.app` works out of the box with free Apple ID signing. When you later enroll in the paid Apple Developer Program and create a registered App ID, update this to match (e.g., `com.yourdomain.vitalview`). HealthKit entitlements require the bundle ID to match a registered App ID.

**Project structure:**
```
mobile/
├── app/                          # Expo Router (file-based routing)
│   ├── _layout.tsx               # Root layout: auth provider, theme, fonts
│   ├── (auth)/
│   │   ├── _layout.tsx           # Auth stack layout
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── welcome.tsx           # Optional splash/welcome screen
│   ├── (app)/
│   │   ├── _layout.tsx           # Tab navigator layout
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx       # Bottom tab bar config
│   │   │   ├── index.tsx         # Dashboard (home tab)
│   │   │   ├── chat.tsx          # Chat tab
│   │   │   ├── history.tsx       # History tab
│   │   │   └── settings.tsx      # Settings tab
│   │   └── chat/
│   │       └── [sessionId].tsx   # Individual chat session
│   └── onboarding/
│       └── index.tsx             # Onboarding wizard
├── components/
│   ├── auth-provider.tsx         # Auth context + secure token storage
│   ├── debrief-card.tsx          # Debrief display (port from web)
│   ├── sparkline-chart.tsx       # Health charts (new library)
│   ├── highlights-strip.tsx      # Metric highlights (port from web)
│   ├── feedback-widget.tsx       # Thumbs up/down (port from web)
│   ├── chat-bubble.tsx           # Chat message bubble
│   ├── health-score-ring.tsx     # Circular progress for composite scores
│   └── ui/                       # Shared UI primitives
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── text.tsx
│       └── loading.tsx
├── services/
│   ├── api.ts                    # API client (port from web, change base URL + auth)
│   ├── auth.ts                   # Login/signup/refresh/token management
│   └── healthkit-sync.ts         # HealthKit read + sync
├── hooks/
│   ├── useAuth.ts
│   ├── useHealthKit.ts
│   └── useApi.ts
├── constants/
│   ├── colors.ts                 # Theme colors (port from CSS vars)
│   └── config.ts                 # API_URL, environment detection
├── app.json                      # Expo config
├── eas.json                      # EAS Build config
├── package.json
└── tsconfig.json
```

#### Task 3.2 — Auth Context & Secure Storage

**Replace:** NextAuth `SessionProvider` + server-side `auth()` calls
**With:** Custom `AuthProvider` using React Context + `expo-secure-store`

```
Login/Signup → POST /auth/login or /auth/signup
  → Receive {access_token, refresh_token, user}
  → Store tokens in SecureStore (iOS Keychain-backed)
  → Set auth state in React Context
  → All subsequent API calls include Authorization: Bearer <access_token>
  → On 401: auto-refresh using refresh_token, retry request
  → On refresh failure: redirect to login
```

**Key implementation details:**
- `expo-secure-store` uses the iOS Keychain — encrypted at rest, survives app reinstall (configurable)
- Auth state persists across app launches (check SecureStore on mount)
- Token refresh happens transparently in the API client interceptor

#### Task 3.3 — API Client Migration

**Port:** `frontend/lib/api.ts` → `mobile/services/api.ts`

**Changes:**
- Base URL: `/api/` → value from `constants/config.ts` which resolves the backend URL per environment:
  ```typescript
  // mobile/constants/config.ts
  import Constants from "expo-constants";

  // In development, the backend runs on your Mac via Docker.
  // Your iPhone reaches it via the Mac's LAN IP on the same WiFi network.
  // In production, this is the deployed backend URL.
  const DEV_API_URL = "http://192.168.1.42:8000";  // ← Replace with your Mac's IP (run: ipconfig getifaddr en0)
  const PROD_API_URL = "https://your-api.railway.app";

  export const API_URL = __DEV__ ? DEV_API_URL : PROD_API_URL;
  ```
- Auth: remove implicit cookie auth → add `Authorization: Bearer <token>` header
- Add token refresh interceptor (on 401, refresh and retry)
- All TypeScript interfaces (`Metric`, `Debrief`, `ChatSession`, etc.) carry over unchanged
- All API method signatures carry over unchanged (they already return typed `Promise<T>`)

This is the highest-reuse file — most of it copies directly.

#### Task 3.4 — Navigation Structure

**Replace:** Next.js App Router route groups → Expo Router / React Navigation

| Web Route | Mobile Screen | Navigator |
|-----------|---------------|-----------|
| `(auth)/login` | `(auth)/login` | Auth Stack |
| `(auth)/signup` | `(auth)/signup` | Auth Stack |
| `onboarding/` | `onboarding/` | Modal Stack |
| `(app)/dashboard` | `(tabs)/index` (Home) | Bottom Tabs |
| `(app)/chat` | `(tabs)/chat` | Bottom Tabs |
| `(app)/chat/[session]` | `chat/[sessionId]` | Stack (pushed from chat tab) |
| `(app)/history` | `(tabs)/history` | Bottom Tabs |
| `(app)/settings` | `(tabs)/settings` | Bottom Tabs |

**Navigation guards:**
- Root layout checks auth state: if no token → show auth stack; if token + not onboarded → show onboarding; else → show app tabs
- This replaces the current `middleware.ts` + server-side `auth()` redirect logic

#### Task 3.5 — UI Component Mapping

Every web component has a React Native equivalent:

| Web (shadcn/ui + Tailwind) | React Native Equivalent | Library |
|---------------------------|------------------------|---------|
| `<Button>` | Custom `<Button>` or `react-native-paper` | Built-in / Paper |
| `<Card>` | `<View>` with shadow styles | Built-in |
| `<Input>` | `<TextInput>` | Built-in |
| `<Dialog>` | `<Modal>` or `react-native-modal` | Built-in |
| `<Sheet>` (bottom drawer) | `@gorhom/bottom-sheet` | Third-party |
| `<ScrollArea>` | `<ScrollView>` / `<FlatList>` | Built-in |
| `<Select>` | `@react-native-picker/picker` or action sheet | Third-party |
| `<Switch>` | `<Switch>` | Built-in |
| `<Tabs>` | Bottom Tab Navigator | React Navigation |
| `<Skeleton>` | `react-native-skeleton-placeholder` | Third-party |
| `<Badge>` | Custom `<View>` + `<Text>` | Built-in |
| `<Separator>` | `<View style={{height: 1, backgroundColor: '#eee'}} />` | Built-in |
| `<Tooltip>` | Long-press popup or skip (less common on mobile) | — |
| Sonner toasts | `react-native-toast-message` or `burnt` (native iOS toasts) | Third-party |
| Recharts sparklines | `victory-native` or `react-native-svg` + custom | Third-party |
| `<a href="tel:...">` | `Linking.openURL("tel:...")` | Built-in |
| Dark mode (CSS vars) | `useColorScheme()` + theme context | Built-in |

#### Task 3.6 — Dashboard Screen

**Port:** `frontend/app/(app)/dashboard/_dashboard-client.tsx`

**Behavior (same):**
- Fetch current debrief, weekly summary, 30-day metrics in parallel
- Show composite scores (Recovery / Sleep / Activity)
- Highlights strip with delta arrows
- Debrief narrative card
- 30-day sparkline charts
- Empty state with "Generate My First Debrief" CTA
- Pull-to-refresh (new — native mobile pattern)

**Changes:**
- Replace `recharts` `<AreaChart>` with `victory-native` `<VictoryArea>` or `react-native-svg`-based custom sparklines
- Replace CSS grid layout with Flexbox + `<ScrollView>`
- Replace Tailwind classes with `StyleSheet.create()` or NativeWind
- Add haptic feedback on score rings (iOS)

#### Task 3.7 — Chat Screen

**Port:** `frontend/app/(app)/chat/_chat-client.tsx`

**Behavior (same):**
- Session list (sidebar on web → separate list view or bottom sheet on mobile)
- Message bubbles with role-based styling
- Send message + optimistic UI
- Emergency detection banner with hotline `tel:` links
- Rate limit display (20/day)
- Starter question suggestions

**Changes:**
- Replace `<Sheet>` session sidebar with a `<FlatList>` screen or `@gorhom/bottom-sheet`
- Use `KeyboardAvoidingView` for input area
- Use `<FlatList inverted>` for auto-scrolling message list (standard RN chat pattern)
- Replace `<textarea>` with `<TextInput multiline>`
- Emergency phone links: `Linking.openURL("tel:911")`

#### Task 3.8 — History Screen

**Port:** `frontend/app/(app)/history/_history-client.tsx`

**Behavior (same):**
- Paginated list of past debriefs
- Expandable cards (week range, highlights, narrative)
- Feedback widget per debrief

**Changes:**
- Use `<FlatList>` with `onEndReached` for infinite scroll (instead of "Load More" button)
- `Animated` API or `react-native-reanimated` for expand/collapse

#### Task 3.9 — Settings Screen

**Port:** `frontend/app/(app)/settings/_settings-client.tsx`

**Behavior (same):**
- Timezone setting
- Email notification toggle
- Data sharing consent toggle
- Connected data sources
- Baseline display

**Additions:**
- **HealthKit connection status** — show whether HealthKit access is granted, last sync time
- **HealthKit re-authorization** button if permissions were denied
- **Push notification toggle** (APNs)
- Sign out button (clears SecureStore tokens)
- App version display

#### Task 3.10 — Onboarding Wizard

**Port:** `frontend/app/onboarding/_onboarding-wizard.tsx`

**Steps (modified):**
1. **Welcome** — same, with app icon/branding
2. **HealthKit Permission** — NEW. Request HealthKit authorization. Explain what data is read and why. Handle denial gracefully (app still works with manual data)
3. **Initial HealthKit Sync** — NEW. If authorized, pull 90 days of HealthKit data and sync to backend. Show progress indicator. This replaces "seed demo data" for users with real wearable data
4. **Timezone** — auto-detected from device, confirm or override
5. **Data Sharing Consent** — same as web
6. **Health Habit Survey** — same as web (if consented)
7. **Demo Data** — only offer if HealthKit had no data or was denied. Call `POST /onboarding/seed-demo`
8. **Push Notification Permission** — NEW. Request APNs authorization
9. **Done** — "Your first debrief arrives Sunday" with countdown

#### Task 3.11 — Styling & Theming

**Approach:** Use NativeWind (Tailwind for React Native) to maximize class reuse from web, OR use `StyleSheet.create()` for full native control.

**Recommendation:** NativeWind v4, because:
- Many Tailwind class names from the web codebase carry over directly
- Dark mode support via `useColorScheme()`
- Compatible with Expo

**Color palette port:** Convert the oklch CSS variables in `globals.css` to hex/rgb values:

```typescript
// constants/colors.ts
export const colors = {
  light: {
    background: '#ffffff',
    foreground: '#0a0a0b',
    primary: '#0f766e',       // teal-700
    primaryForeground: '#f0fdfa',
    card: '#ffffff',
    border: '#e5e7eb',
    muted: '#f4f4f5',
    // ... port all CSS vars
  },
  dark: {
    background: '#09090b',
    foreground: '#fafafa',
    primary: '#2dd4bf',       // teal-400
    primaryForeground: '#042f2e',
    card: '#18181b',
    border: '#27272a',
    muted: '#27272a',
    // ... port all CSS vars
  },
};
```

---

### Phase 4: Push Notifications (Replace Email-Primary)

**Goal:** Add APNs push notifications as the primary debrief alert mechanism. Email becomes optional.

#### Task 4.1 — Add Push Token Storage to Backend

**New column on `users` table:**
- `apns_device_token VARCHAR` — the device push token
- `push_notifications_enabled BOOLEAN DEFAULT true`

Create an Alembic migration.

**New endpoint:**
- `PUT /users/me/push-token` — accepts `{device_token: string}`, stores on user record

#### Task 4.2 — Push Notification Service (Backend)

**New file:** `backend/app/services/push_service.py`

- Use `aioapns` or `httpx` to send push notifications via APNs HTTP/2 API
- Requires the `.p8` auth key file, Key ID, and Team ID (from developer setup)
- Send a push notification when a debrief is generated (in `debrief_service.py` after storing the debrief)
- Payload: `{"aps": {"alert": {"title": "Your Weekly Health Debrief", "body": "Your debrief for [week_range] is ready"}, "sound": "default", "badge": 1}}`

#### Task 4.3 — Update Debrief Pipeline

In `debrief_service.py`, after the debrief is generated and stored:
1. If `push_notifications_enabled`: send APNs push notification
2. If `email_notifications_enabled`: send email via Resend (existing behavior)
3. Both can be active simultaneously

#### Task 4.4 — Client-Side Push Registration

In the React Native app:
- Use `expo-notifications` to request push permission and get the device token
- Send the token to `PUT /users/me/push-token` after onboarding
- Handle incoming notifications: deep-link to the dashboard/debrief when tapped
- Handle token refresh: re-register on each app launch

---

### Phase 5: Backend Cleanup & Optimization

#### Task 5.1 — Remove Next.js-Specific Code

Once the web frontend is fully retired:
- Drop the NextAuth tables (`accounts`, `sessions`, `verification_tokens`) via Alembic migration
- Remove `API_SECRET_KEY` from config (no longer needed with JWT auth)
- Remove the header-based auth fallback from `core/auth.py`
- Update CORS settings in FastAPI `main.py` — now needs CORS since mobile app calls directly (not via same-origin proxy)

#### Task 5.2 — Add CORS Configuration

The web app didn't need CORS because the proxy was same-origin. The mobile app calls FastAPI directly, so add:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Mobile apps don't have origins, but keep restrictive for web
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Note:** iOS apps don't send an `Origin` header, so CORS is mainly needed if you also serve a web client. For a pure mobile backend, CORS is effectively a no-op but harmless to include.

#### Task 5.3 — Add Rate Limiting Middleware

Without the proxy layer buffering requests, consider adding rate limiting to FastAPI directly:
- Use `slowapi` or a custom middleware
- Rate limit per user (from JWT `user_id`): e.g., 100 requests/minute
- Chat rate limit already exists (20/day) — keep as-is

#### Task 5.4 — Optimize for Mobile Clients

- Add response compression (`GZipMiddleware`) for bandwidth-sensitive mobile clients
- Add `ETag`/`If-None-Match` headers for cacheable responses (baselines, survey questions)
- Consider adding a `GET /sync/status` endpoint that returns last sync timestamps for metrics, debriefs, baselines — helps the mobile app decide what to refresh

---

### Phase 6: Archive/Remove Web Frontend

#### Task 6.1 — Archive the Frontend Directory

- Move `frontend/` to `frontend-web-archive/` or delete it
- Remove `frontend` Dockerfile references from `docker-compose.yml` (if any)
- Update the project root README to reference the mobile app
- The `package.json`, Next.js config, and all `app/`, `components/`, `lib/` directories under `frontend/` are no longer needed

#### Task 6.2 — Update Docker Compose

Remove any frontend services. Keep only:
- PostgreSQL
- FastAPI backend (for local development)

The mobile app runs via `npx expo start --dev-client` on the developer's machine. The React Native app connects to the FastAPI backend via the Mac's **local network IP** (e.g., `http://192.168.x.x:8000`), NOT `localhost` — because `localhost` on a physical iPhone refers to the phone itself, not the Mac. See the "Day-to-Day iPhone Development Workflow" section for network setup details.

#### Task 6.3 — Update Project Structure

**New project structure:**
```
/
├── backend/              # FastAPI (unchanged structure)
├── mobile/               # React Native (Expo) iOS app
├── docker-compose.yml    # Postgres + FastAPI only
├── plan.md               # Original plan
├── migration-plan.md     # This document
└── README.md
```

---

## Migration Sequence & Dependencies

```
Phase 1 (Backend Auth)           ← Do first, enables all other phases
  ↓                                Includes Sign in with Apple backend endpoint
Phase 2 (HealthKit)              ← Can start in parallel with Phase 3
  ↓                                (HealthKit is a service, not UI)
Phase 3 (React Native Frontend)  ← Largest phase, most work
  ↓                                ALL screens testable on iPhone with free Apple ID + seed data
Phase 4 (Push Notifications)     ← Depends on Phase 3 (needs mobile app)
  ↓
Phase 5 (Backend Cleanup)        ← Do after mobile app is working
  ↓
Phase 6 (Archive Web)            ← Final cleanup
```

**Critical path:** Phase 1 → Phase 3 → Phase 4 → ship
**Parallel path:** Phase 2 can happen alongside Phase 3

### Free Apple ID vs. Paid Developer Account — What's Testable When

| Feature | Free Apple ID | After Paid Enrollment |
|---------|:------------:|:--------------------:|
| App runs on iPhone | ✅ | ✅ |
| Auth (email/password, JWT) | ✅ | ✅ |
| All screens (dashboard, chat, history, settings) | ✅ | ✅ |
| Backend API calls | ✅ | ✅ |
| Seed/demo data | ✅ | ✅ |
| Onboarding wizard (non-HealthKit steps) | ✅ | ✅ |
| Dark mode, haptics, navigation | ✅ | ✅ |
| Hot reload | ✅ | ✅ |
| HealthKit data sync | ❌ | ✅ |
| Sign in with Apple | ❌ | ✅ |
| Push notifications (APNs) | ❌ | ✅ |
| TestFlight / App Store | ❌ | ✅ |
| EAS cloud builds | ❌ | ✅ |
| App valid beyond 7 days without re-install | ❌ | ✅ |

---

## Detailed Task Checklist

### Phase 1: Backend Auth Migration
- [ ] Add `python-jose[cryptography]` and `passlib[bcrypt]` to `requirements.txt`
- [ ] Create `backend/app/core/jwt.py` with `create_access_token()`, `create_refresh_token()`, `verify_token()` functions
- [ ] Add JWT config to `backend/app/core/config.py` (`JWT_SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`)
- [ ] Create `backend/app/routers/auth.py` with `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`
- [ ] Add password hashing utility (bcrypt via passlib) in auth router or a shared utility
- [ ] Update `backend/app/core/auth.py` — dual-mode: JWT Bearer token (primary) + X-User-Id header (fallback)
- [ ] Create Alembic migration for `refresh_tokens` table
- [ ] Register auth router in `backend/app/main.py`
- [ ] Test: signup → receive tokens → use access token for API calls → refresh token → verify protected endpoints reject invalid tokens
- [ ] Add `POST /auth/apple` endpoint for Sign in with Apple (verify Apple identity token, create/link user)
- [ ] Add `apple_user_id` column to `users` table via Alembic migration
- [ ] Install `expo-apple-authentication` in mobile project
- [ ] Create Sign in with Apple button component (conditionally shown based on `AppleAuthentication.isAvailableAsync()`)
- [ ] Wire Apple auth flow: native dialog → identity token → `POST /auth/apple` → store tokens

### Phase 2: HealthKit Integration
- [ ] Install `react-native-health` or equivalent Expo-compatible HealthKit package
- [ ] Configure HealthKit entitlements in `app.json` / `app.config.ts`
- [ ] Create `mobile/services/healthkit.ts` — HealthKit authorization + data reading for 4 metric types
- [ ] Create `mobile/services/healthkit-sync.ts` — normalize HealthKit data → `POST /metrics` batch sync
- [ ] Add `source_type: "apple_healthkit"` to backend validation (if source_type is validated)
- [ ] Create `mobile/hooks/useHealthKit.ts` — React hook for HealthKit status and sync triggers
- [ ] Implement background sync via `expo-background-fetch`
- [ ] Implement HealthKit observer queries for real-time sync (when new data is written)
- [ ] Store `last_synced_date` in AsyncStorage
- [ ] Test on physical device with Apple Watch data

### Phase 3: React Native Frontend
- [ ] Initialize Expo project with TypeScript template
- [ ] Install `expo-dev-client`: `npx expo install expo-dev-client` (required — Expo Go does not support `react-native-health` or any custom native module)
- [ ] Create `app.config.ts` with HealthKit entitlements, push notification config, background modes, and bundle identifier (see Task 3.1 for full config)
- [ ] Create `eas.json` with `development` (internal), `preview` (internal), and `production` (store) profiles (see Expo/EAS Setup section)
- [ ] Build dev client locally: `npx expo prebuild --platform ios && npx expo run:ios --device` — verify app installs on your iPhone
- [ ] Install core dependencies: expo-router, expo-secure-store, react-native-reanimated, react-native-gesture-handler, react-native-safe-area-context, react-native-screens
- [ ] Install UI dependencies: @gorhom/bottom-sheet, react-native-toast-message, victory-native, @react-native-picker/picker
- [ ] Install NativeWind (Tailwind for RN) + nativewind config
- [ ] Create auth context + SecureStore token management (`mobile/components/auth-provider.tsx`)
- [ ] Port API client: `frontend/lib/api.ts` → `mobile/services/api.ts` (change base URL, add Bearer token, add refresh interceptor)
- [ ] Port TypeScript interfaces (these are identical — copy from `api.ts`)
- [ ] Create root layout with auth/theme providers (`mobile/app/_layout.tsx`)
- [ ] Create auth stack: login + signup screens
- [ ] Create tab navigator: Dashboard, Chat, History, Settings
- [ ] Create color constants from CSS vars (`mobile/constants/colors.ts`)
- [ ] Port Dashboard screen (debrief card, highlights strip, sparkline charts, empty state)
- [ ] Port Chat screen (session list, message bubbles, input, emergency banner)
- [ ] Port History screen (debrief list, expandable cards, feedback)
- [ ] Port Settings screen (timezone, email, consent, sources, baselines)
- [ ] Modify and port Onboarding wizard (add HealthKit + push notification steps)
- [ ] Port component: debrief-card (narrative display + feedback)
- [ ] Port component: highlights-strip (delta arrows, color coding)
- [ ] Port component: feedback-widget (rating + comment)
- [ ] Create component: health-score-ring (circular progress — new, native-feeling)
- [ ] Create component: chat-bubble (message display)
- [ ] Create sparkline chart component using victory-native
- [ ] Add pull-to-refresh on Dashboard and History
- [ ] Add haptic feedback on interactions (expo-haptics)
- [ ] Implement dark mode via useColorScheme + theme context
- [ ] Configure `mobile/constants/config.ts` with Mac's LAN IP for dev API_URL (see Task 3.3)
- [ ] Test full flow on physical iPhone with seed data: signup → onboard → dashboard (seed data) → chat → history → settings
- [ ] Verify HealthKit/Sign in with Apple UI elements are hidden or disabled gracefully when entitlements are unavailable

### Phase 4: Push Notifications
- [ ] Install `expo-notifications`
- [ ] Add Alembic migration for `apns_device_token` and `push_notifications_enabled` columns on `users`
- [ ] Add `PUT /users/me/push-token` endpoint
- [ ] Create `backend/app/services/push_service.py` using APNs HTTP/2 API
- [ ] Update `debrief_service.py` to send push notification after debrief generation
- [ ] Add push token registration in mobile app (after onboarding)
- [ ] Handle notification tap → deep link to debrief
- [ ] Add push notification toggle in Settings
- [ ] Test on physical device

### Phase 5: Backend Cleanup
- [ ] Add CORS middleware to FastAPI `main.py`
- [ ] Add GZip compression middleware
- [ ] Add rate limiting middleware (slowapi or custom)
- [ ] Create Alembic migration to drop NextAuth tables (accounts, sessions, verification_tokens)
- [ ] Remove `API_SECRET_KEY` from config and header-based auth from `core/auth.py`
- [ ] Add `GET /sync/status` endpoint for mobile client sync optimization
- [ ] Update requirements.txt with new dependencies, remove unused ones

### Phase 6: Archive Web Frontend
- [ ] Move `frontend/` to archive or delete
- [ ] Update `docker-compose.yml` to remove frontend service (if any)
- [ ] Update root README.md with new architecture, setup instructions, mobile development workflow
- [ ] Update project structure documentation

---

## Dependency Map (New & Modified Packages)

### Backend (additions to `requirements.txt`)
```
python-jose[cryptography]    # JWT encoding/decoding
passlib[bcrypt]              # Password hashing (replaces Next.js bcrypt)
aioapns                      # Apple Push Notification service client
```

### Mobile (new `package.json`)
```
expo                         # Expo framework
expo-dev-client              # Custom development build (replaces Expo Go — required for react-native-health)
expo-router                  # File-based routing
expo-secure-store            # iOS Keychain token storage
expo-notifications           # Push notifications
expo-background-fetch        # Background HealthKit sync
expo-haptics                 # Haptic feedback
expo-font                    # Custom fonts
expo-linking                 # Deep linking
expo-apple-authentication    # Sign in with Apple native SDK
react-native-health          # HealthKit bridge
@react-navigation/native     # Navigation
@react-navigation/bottom-tabs
@react-navigation/native-stack
react-native-reanimated      # Animations
react-native-gesture-handler # Gestures
react-native-safe-area-context
react-native-screens
@gorhom/bottom-sheet         # Bottom sheet (replaces shadcn Sheet)
react-native-toast-message   # Toast notifications (replaces Sonner)
victory-native               # Charts (replaces Recharts)
react-native-svg             # SVG support for charts
nativewind                   # Tailwind CSS for React Native
@react-native-picker/picker  # Dropdown select
react-native-skeleton-placeholder  # Loading skeletons
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| HealthKit permission denied by user | Medium | High — no data to analyze | Fall back to demo data; allow manual metric entry; clearly explain value proposition during permission request |
| App Store rejection (HealthKit) | Medium | High — blocks launch | Follow Apple's HealthKit guidelines exactly; demonstrate clear user benefit; include proper privacy policy |
| Background sync reliability | Medium | Medium — stale data | Use HealthKit observer queries + foreground sync on app open; show "last synced X hours ago" in UI |
| JWT token security | Low | High — auth bypass | Use short expiry (15 min), refresh tokens, HTTPS-only, SecureStore (Keychain) |
| React Native performance (charts) | Low | Medium — janky UI | Use `victory-native` with `react-native-reanimated` for native-thread animations; limit chart data points |
| Expo managed workflow limitations | Low | Medium — need native modules | `react-native-health` works with Expo (dev client); if blocked, eject to bare workflow |
| Push notification delivery | Low | Low — email fallback exists | Keep email as secondary notification channel; monitor APNs delivery receipts |

---

## Timeline Estimate

| Phase | Estimated Duration | Parallelizable? |
|-------|-------------------|-----------------|
| Phase 1: Backend Auth | 3-4 days | No (blocks all else) |
| Phase 2: HealthKit | 4-5 days | Yes (parallel with Phase 3) |
| Phase 3: React Native Frontend | 10-14 days | Contains the most work |
| Phase 4: Push Notifications | 2-3 days | After Phase 3 |
| Phase 5: Backend Cleanup | 1-2 days | After Phase 3 |
| Phase 6: Archive Web | 0.5 day | After Phase 5 |
| **Total** | **~3-4 weeks** | |

This estimate assumes a single developer working full-time. The bulk of the work is Phase 3 (porting all screens and components to React Native).

---

## HIPAA Considerations for iOS

The migration maintains all existing HIPAA controls and adds iOS-specific considerations:

| Control | Web Implementation | iOS Implementation |
|---------|-------------------|-------------------|
| Encryption at rest (tokens) | Browser cookies (httpOnly, secure) | `expo-secure-store` (iOS Keychain, hardware-encrypted) — **stronger** |
| Encryption in transit | HTTPS (same) | HTTPS (same) + App Transport Security enforced by iOS |
| Data on device | None (web app, no local storage of PHI) | HealthKit data stays in HealthKit (Apple manages encryption). Synced metrics go to backend only — **no PHI cached on device** in the app's storage |
| PII in AI calls | Scrubbed server-side (same) | Scrubbed server-side (same) — no change |
| Audit logging | Same | Same |
| BAA with HealthKit | N/A | Not needed — HealthKit data is read-only on-device and sent to your own backend. Apple is not a business associate for HealthKit reads |
| BAA with APNs | N/A | Push notification content should NOT contain PHI. Use generic alerts ("Your debrief is ready") not health data in the push payload |

**Key rule for push notifications:** Never include health metrics, scores, or narrative content in the push notification payload. APNs payloads traverse Apple's servers and are not covered under a BAA. Use generic text only:
- **Good:** "Your weekly health debrief is ready. Tap to read."
- **Bad:** "Your sleep dropped 15% this week. Recovery score: 58."
