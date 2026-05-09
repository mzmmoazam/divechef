# DiveForge v1 — Design Spec

**Date:** 2026-05-09
**Status:** Approved (brainstorming) — pending implementation plan
**Owner:** mzm.moazam@gmail.com

## 1. Overview

DiveForge is a personal dive intelligence app for divers using a Shearwater Peregrine. v1 ships to a single dive club (~10–30 known users) for validation before broader release.

It connects to the Peregrine over Bluetooth Low Energy, downloads dives, scores each dive against FFESSM/MN90 norms, and presents personal coaching insights and trends. v1 is mobile-only (iOS + Android), single-user (no club view yet), and rule-based (no LLM yet).

### v1 in scope

1. Email/password auth, niveau picker on signup.
2. Bluetooth sync from Peregrine into the user's account.
3. Dive list, dive detail with depth profile graph and metrics.
4. Per-dive safety score (0–100) and 1–3 coaching insights.
5. 30-day trends: average score, average depth, dive count, score trend, one summary tip.
6. Localization: French (default) and English.

### v1 explicitly NOT in scope

- App Store / Play Store submission (internal distribution only)
- Web app for users
- Push notifications
- LLM-narrated insights
- Club view, social feed, sharing, comments, messaging
- File-import fallback (BLE-only ingestion)
- Dive computers other than the Peregrine
- Per-dive autonome/encadré toggle
- Repetitive-dive surface-interval analysis
- Photo / location annotation
- Manual dive editing

### Success criteria

At least 5 club members install DiveForge, sync at least one dive, and find at least one insight surprising or useful enough to mention to another diver.

## 2. Architecture

Approach: **smart app, smart backend.** The mobile app handles BLE I/O and parses raw bytes into a structured dive via a libdivecomputer native module. The backend handles auth, storage, scoring, and exposes the data to the app. The database stores normalized dives and insights.

### Stack

- **Monorepo:** pnpm workspaces — `apps/mobile` (RN), `apps/web` (Next.js backend), `packages/shared` (TS types + scoring rules).
- **Mobile:** React Native (Expo bare workflow — required because of the native libdivecomputer module), TypeScript, `react-native-ble-plx` for BLE, React Navigation, TanStack Query, `react-i18next`, `victory-native` or `react-native-svg-charts` for the depth profile graph, `expo-sqlite` for the local outbound queue.
- **Backend:** Next.js 15 App Router on Vercel, Route Handlers for the API, NextAuth for email+password auth (with credentials provider, bcrypt-hashed passwords), Prisma ORM.
- **Database:** Postgres on Neon (free tier, branchable for preview deploys).
- **Native module:** libdivecomputer (C) wrapped via Kotlin (Android) and Swift (iOS) bridges, exposed as a TurboModule that takes raw BLE-payload bytes and returns parsed dive JSON.
- **Build / distribution:** Expo EAS Build. Internal distribution: TestFlight (iOS), EAS internal APK (Android). No store submission in v1.
- **Observability:** Vercel logs + Sentry on app and backend.

### Data flow

```
Peregrine → BLE → RN app (react-native-ble-plx)
                → libdivecomputer native module (raw bytes → JSON)
                → POST /api/dives (structured JSON)
                → Next.js backend (Prisma)
                → Postgres
                → Scoring engine runs synchronously, returns score + insights
                → App displays
```

Sync round-trip is synchronous from the user's POV: tap sync, see dives appear with scores. Offline behavior: completed parses are queued in `expo-sqlite` and POSTed when network returns.

## 3. Data model

Prisma schema. Field types use Prisma syntax.

```prisma
enum Niveau {
  N1
  N2
  N3
  N4
  INITIATEUR
  MF1
  MF2
  UNKNOWN
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  displayName  String?
  niveau       Niveau   @default(UNKNOWN)
  locale       String   @default("fr")  // "fr" | "en"
  createdAt    DateTime @default(now())
  dives        Dive[]
  devices      Device[]
}

model Device {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  bleAddress   String
  model        String   // "Shearwater Peregrine"
  serialNumber String?
  nickname     String?
  lastSyncAt   DateTime?
  createdAt    DateTime @default(now())
  @@unique([userId, bleAddress])
}

model Dive {
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  deviceId         String?
  externalId       String   // device-provided dive number/UUID, used for dedup
  startedAt        DateTime
  durationSec      Int
  maxDepthM        Float
  avgDepthM        Float
  minWaterTempC    Float?
  maxAscentRateMps Float
  safetyScore      Int?
  scoredAt         DateTime?
  scoringVersion   String?  // "v1.0", bump when rules change
  rawPayloadUrl    String?  // optional, deferred
  samples          DiveSample[]
  insights         Insight[]
  createdAt        DateTime @default(now())
  @@unique([userId, externalId])
  @@index([userId, startedAt])
}

model DiveSample {
  id           BigInt @id @default(autoincrement())
  diveId       String
  dive         Dive   @relation(fields: [diveId], references: [id], onDelete: Cascade)
  tSec         Int       // sample time in seconds since dive start; native interval 10s
  depthM       Float
  tempC        Float?
  cnsPct       Float?
  decoState    String    // "ndl" | "deco" — from libdc <deco> element text
  decoTimeSec  Int       // when ndl: NDL seconds remaining; when deco: required stop seconds
  decoDepthM   Float     // when ndl: 0; when deco: required stop depth (meters)
  ttsSec       Int?      // total time-to-surface in seconds (libdc <tts>)
  @@index([diveId, tSec])
}

model Insight {
  id        String   @id @default(cuid())
  diveId    String
  dive      Dive     @relation(fields: [diveId], references: [id], onDelete: Cascade)
  ruleId    String   // stable rule id, e.g., "ascent_too_fast"
  severity  String   // "info" | "warn" | "alert"
  evidence  Json     // structured data the rule matched on
  createdAt DateTime @default(now())
  @@index([diveId])
}
```

### Notes

- `Dive.externalId` + `(userId, externalId)` unique index dedupes re-syncs.
- `DiveSample` is normalized out of `Dive` to keep list views fast (denormalized headline metrics live on `Dive`).
- `Insight` stores no display strings — only `ruleId` + `evidence`. The app renders localized text from `evidence` using `react-i18next` templates. This keeps the API language-agnostic.
- `scoringVersion` lets us re-score historic dives when rules change in v1.x.
- `rawPayloadUrl` (object storage of raw bytes) is deferred to phase 2 but the field exists so we can backfill without migration.

## 4. Scoring engine

### Disclaimer

DiveForge is a feedback tool, not dive medicine and not a substitute for the user's training, dive computer, or guide. The disclaimer is shown on first run and on every Détail Plongée screen footer. Thresholds below are based on FFESSM/MN90 norms and **must be verified against the current FFESSM Manuel du Moniteur and Code du Sport articles A322-71 et seq. by someone with FFESSM-monitor credentials before public release.**

### Score formula

```
score = 100
for each rule that fires:
    score -= rule.deduction
score = max(0, min(100, score))
```

### v1 rule set

| Rule ID | Severity | Deduction | Fires when | Confidence |
|---|---|---|---|---|
| `ascent_too_fast` | warn | -15 | Max ascent rate over any 60s window > 15 m/min | High (MN90) |
| `ascent_dangerous` | alert | -30 | Max ascent rate > 17 m/min sustained | High |
| `final_ascent_too_fast` | warn | -10 | Ascent rate from 6m to surface > 6 m/min | Medium |
| `palier_securite_manque` | warn | -10 | Max depth > 6m AND no continuous ≥180s segment between 3m and 5m before surfacing | High |
| `palier_securite_court` | info | -5 | Palier between 3-5m attempted but lasted < 180s (and `palier_securite_manque` did not fire) | High |
| `palier_deco_manque` | alert | -40 | Any sample has `decoState == "deco"` AND in the final 60s of the dive the diver did NOT spend ≥ `decoTimeSec` seconds within ±0.5m of `decoDepthM` before surfacing | **High — confirmed available** via libdc parser; spike validated on a real deco dive |
| `profondeur_depasse_niveau_leger` | warn | -10 | Max depth exceeds niveau limit by ≤5m (N1: 20m, N2: 20m autonome, N3: 60m, N4/Initiateur/MF1/MF2: no cap, UNKNOWN: rule disabled) | Medium — depends on user-declared niveau |
| `profondeur_depasse_niveau_grave` | alert | -30 | Max depth exceeds niveau limit by >5m | Medium |
| `temperature_basse` | info | -3 | `min_water_temp_c` < 10°C AND duration > 30 min | Low (comfort flag) |
| `plongee_profonde` | info | 0 | Max depth > 30m — informational only, no deduction | — |

### Engine implementation

- Lives in `packages/shared/scoring/` as pure TypeScript so types and rules can be referenced from the mobile app for help text, even though execution happens on the backend.
- Each rule is a pure function: `(dive: DiveInput, samples: DiveSampleInput[]) => Insight | null`.
- Rules are registered in a single registry array: `const RULES: Rule[] = [ascentTooFast, ascentDangerous, ...]`.
- Engine entrypoint: `scoreDive(dive, samples) → { score, insights[] }`. Pure, deterministic, no I/O.
- `scoringVersion = "v1.0"`. Bump on any rule change; backfill job re-scores historic dives via `prisma migrate`-adjacent admin script.
- One rule throwing must not kill the whole scoring pass — engine catches per-rule, logs to Sentry, and continues.

### Resolved unknowns (Plan 0 spike — see [spike/findings.md](../../../spike/findings.md))

1. ✅ **libdc exposes required-deco-stop info via `<deco>` element** with `time` (required stop seconds) and `depth` (required stop meters) attributes. Sample interval is 10 seconds. `palier_deco_manque` is feasible and now scoped concretely.
2. ✅ **BLE on iOS is viable** via CoreBluetooth + libdivecomputer parser (NOT libdc's BLE transport, which is BlueZ-only). Spike produced byte-identical parsed XML to the SQLite-extracted reference. Service UUID `FE25C237-0ECE-443C-B0AA-E02033E7029D`, single SPP characteristic `27B7570B-359E-45A3-91BB-CF7E70049BD2`.
3. ✅ **Peregrine wire protocol implemented** in pure Swift — see `spike/0c-ble-protocol/swift-sources/PeregrineProtocol.swift` and `PeregrineClient.swift`. To be wrapped as a TurboModule in Plan 3.

### Outstanding unknowns

1. **Exact FFESSM threshold sources.** All rules still need a credentialed reviewer pass (FFESSM Manuel du Moniteur, Code du Sport articles A322-71 et seq.) before public release. Tracked as a release-gate item.
2. **Android BLE port not validated.** Same wire protocol assumed to work over Android `BluetoothGatt`; first Android attempt in Plan 3 should re-validate on a real device.
3. **Other Shearwater models untested.** Petrel/Perdix/Teric/Tern share the protocol per libdc but were not exercised. Verification recommended before claiming broader device support.

### Test strategy

- Build a fixture library of synthetic dive profiles (perfect dive, fast ascent, missed palier, deco breach, etc.) committed as JSON in `packages/shared/scoring/fixtures/`.
- Unit-test each rule against its fixtures (Vitest): must fire on the matching fixture, must NOT fire on the perfect dive.
- Snapshot-test `scoreDive` output across the full fixture library.
- Once real Peregrine exports are available, add anonymized real dives as additional fixtures with manually-labeled expected insights.

## 5. Mobile app

### Screens

1. **Onboarding (one-time):** signup (email + password), niveau picker, language picker (defaults to device locale), disclaimer acceptance, BLE permission prompt.
2. **Sync (BLE):** scan, connect, progress as dives download. Reachable from header on Accueil and from Profil. Resumable via `externalId` dedup.
3. **Accueil (home):** highlighted last-dive card (score + top warning) at top, reverse-chronological dive list below, pull-to-refresh triggers Sync.
4. **Détail Plongée:** headline metrics, depth-vs-time profile graph, color-coded insight cards (green ✓ / amber ⚠ / red 🚨) with title and body rendered from `evidence` via i18n.
5. **Tendances:** 30-day rolling average score, average depth, dive count, score trendline, one summary tip.
6. **Profil:** email (read-only), niveau (editable), locale (editable), connected device, manual sync button, logout.

### Navigation

- Bottom tabs: **Accueil** / **Tendances** / **Profil**
- Sync is reachable from Accueil header (⟳) and from Profil
- Onboarding stack is shown only until first signup completes

### Localization

- `react-i18next` with `apps/mobile/i18n/fr.json` and `apps/mobile/i18n/en.json`.
- Default to device locale; fall back to French.
- User can override in Profil → Locale.
- All UI strings, including insight templates, live in the JSON files. Insights are rendered by interpolating `evidence` fields into translation templates.

Example translation entry:
```json
{
  "insights": {
    "ascent_too_fast": {
      "title": "Remontée rapide",
      "body": "Vous êtes remonté à {{maxRateMpm}} m/min entre {{startSec}}s et {{endSec}}s. Norme MN90: 15 m/min."
    }
  }
}
```

## 6. Error handling

| Failure | Behavior |
|---|---|
| BLE: device not found | Localized "no device" message + retry button |
| BLE: connection drops mid-sync | Resume via `externalId` dedup; show partial-success banner |
| BLE: permission denied | Explainer screen with deep-link to OS settings |
| libdivecomputer parse error | Save raw bytes locally, mark dive `parse_failed`, log to Sentry, surface generic error to user; replay path comes in phase 2 |
| API: network unavailable | Queue dive in `expo-sqlite`; retry on next foreground; UI shows "En attente de synchronisation" |
| API: auth expired | Auto-refresh token; on refresh failure, send to login |
| Scoring: rule throws | Engine catches per-rule, logs to Sentry, continues with the rest; dive scored as partial |

## 7. Testing & deployment

### Testing

- **Backend (Vitest):** unit tests per scoring rule against fixtures; integration tests on API routes against a Neon test branch; type-level tests on shared schemas.
- **Mobile (Jest + React Native Testing Library):** unit tests on hooks; integration tests on screens with mocked API. **No E2E in v1.**
- **Native module:** smoke tests of each libdivecomputer entrypoint against committed Peregrine export fixtures, runnable on macOS/Linux as Node-side tests (not in-simulator).
- **Fixtures:** `packages/shared/scoring/fixtures/` (synthetic) + `apps/mobile/native/divecomputer/fixtures/` (real, anonymized exports).

### Deployment

- **Backend:** push to `main` → Vercel auto-deploy. Preview deploys on PRs use Neon branches. Migrations via `prisma migrate deploy` in build.
- **Mobile:** Expo EAS Build. Internal distribution to club via TestFlight (iOS) and EAS internal APK (Android). No App Store / Play Store submission for v1.
- **Secrets:** Vercel env vars (backend), EAS secrets (app build-time API URL).

### Observability

- Vercel logs + Sentry on backend and app.
- No analytics yet — v1 is validation with a known group, not growth.

## 8. Out of scope (deferred to phase 2+)

- Club view (member roster, shared dive visibility with consent)
- Buddy comparison and pairing
- Social feed, sharing, comments, messaging
- LLM-narrated insights (data shape already supports this via `evidence`)
- File-import fallback ingestion path
- Other dive computers (Perdix, Teric, Garmin, Suunto)
- Per-dive autonome/encadré distinction
- Repetitive-dive / surface-interval analysis
- Photo and location annotation
- Web app for users
- Push notifications
- App Store / Play Store submission
- Manual dive editing
- Subscription / monetization
