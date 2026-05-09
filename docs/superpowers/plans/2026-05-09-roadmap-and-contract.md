# DiveForge v1 Roadmap + Contract

**Date:** 2026-05-09
**Status:** Binding contract — Plans 1, 2, 3 must conform to this document.

Plan 0 (the BLE/libdivecomputer feasibility spike) is complete and validated end-to-end. This document is the single source of truth for the **interfaces** between v1's three production subsystems. Each subsystem has its own implementation plan; this doc locks the coupling points so the plans can be built in parallel without drifting.

## The three plans

| Plan | Scope | Independent? | Spec sections | Owner |
|---|---|---|---|---|
| **Plan 1 — Foundation + Scoring** | Monorepo, Next.js + Postgres backend, NextAuth, Prisma schema, scoring engine + FFESSM rules, dive ingestion + storage + trends APIs | Yes (consumes Contract section below) | Spec §2, §3, §4, §6, §7 | Backend |
| **Plan 2 — Mobile App Shell** | Expo bare RN app, all 6 screens, i18n, auth flow, charts, TanStack Query — runs against backend with **mocked native module** so it ships without BLE | Yes (consumes Contract section below) | Spec §5, §6 | Mobile UI |
| **Plan 3 — BLE TurboModule** | Production wrap of the spike's `PeregrineClient.swift` + `PeregrineProtocol.swift` as a TurboModule, plus Android Kotlin port, plus robustness items | Yes (produces native module per Contract section below) | Spec §2 ingestion path | Native |

Plans **must** be executed in this order: 1 → 2 → 3. Plan 1 produces the API. Plan 2 consumes the API and exposes a mock native module. Plan 3 replaces the mock with the real BLE module.

## The Contract

Every interface that crosses a plan boundary lives here. If a plan needs a different shape than what this doc says, the change must come back to this doc first.

### Auth

NextAuth credentials provider (email + password). Sessions via JWT in `Authorization: Bearer <token>` header for the mobile app, and `next-auth.session-token` httpOnly cookie for any future web access.

| Endpoint | Method | Purpose | Body | Returns |
|---|---|---|---|---|
| `/api/auth/signup` | POST | New user | `{ email, password, niveau, locale }` | `{ token, user }` |
| `/api/auth/login` | POST | Existing user | `{ email, password }` | `{ token, user }` |
| `/api/auth/me` | GET | Refresh user | (auth header) | `{ user }` |
| `/api/auth/logout` | POST | Invalidate token | (auth header) | `{ ok: true }` |

`niveau` is one of: `N1 | N2 | N3 | N4 | INITIATEUR | MF1 | MF2 | UNKNOWN`. `locale` is `fr | en`.

### Dive ingestion

The mobile app uploads **raw bytes** (the post-LRE+XOR-decompressed Peregrine binary, byte-for-byte the same shape as Phase A's extracted blobs). Backend runs libdivecomputer parsing server-side and stores both the parsed dive and the raw bytes (in object storage) for replay.

| Endpoint | Method | Purpose | Body | Returns |
|---|---|---|---|---|
| `/api/dives` | POST | Upload one dive | `multipart/form-data`: `bytes` (binary, the dive payload), `meta` (JSON: `{ deviceModel, deviceSerial, externalId, startedAt }`) | `{ dive: Dive, insights: Insight[], score: number }` |
| `/api/dives` | GET | List user's dives | (auth) `?limit&cursor` | `{ dives: DiveSummary[], nextCursor }` |
| `/api/dives/:id` | GET | Detail | (auth) | `{ dive: Dive, insights: Insight[] }` |
| `/api/dives/:id/samples` | GET | Sample stream (lazy-load for charts) | (auth) `?from&to` (in seconds since dive start) | `{ samples: DiveSample[] }` |
| `/api/dives/:id` | DELETE | Remove a dive | (auth) | `{ ok: true }` |

`POST /api/dives` is idempotent on `(userId, externalId)` — re-uploading the same dive returns the existing record. `externalId` is the device-emitted dive number from the Peregrine manifest (per Plan 0 findings, manifest order ≠ Shearwater Cloud dive numbers; clients must NOT use position).

The `bytes` part is the dive payload AFTER LRE+XOR decompression — exactly what `dctool parse` consumes. Backend uses libdivecomputer (compiled as a Node native module or via subprocess to `dctool parse`) to decode into the structured `Dive` + `DiveSample[]` shape.

### Trends

| Endpoint | Method | Purpose | Returns |
|---|---|---|---|
| `/api/trends?days=30` | GET | Aggregate stats over N days (default 30) | `{ avgScore, avgDepthM, diveCount, scoreSeries: [{date, score}], summaryTipKey: string }` |

`summaryTipKey` is a stable rule ID (e.g., `improving_ascent_control`) that the app renders via i18n templates. Backend doesn't return localized strings.

### User

| Endpoint | Method | Purpose | Body | Returns |
|---|---|---|---|---|
| `/api/me` | PATCH | Update niveau / locale | `{ niveau?, locale? }` | `{ user }` |

### Shared types (lives in `packages/shared/types.ts`)

These types are imported by both the backend and the mobile app — no duplication, no drift.

```ts
export type Niveau = "N1" | "N2" | "N3" | "N4" | "INITIATEUR" | "MF1" | "MF2" | "UNKNOWN";
export type Locale = "fr" | "en";
export type DecoState = "ndl" | "deco";
export type Severity = "info" | "warn" | "alert";

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  niveau: Niveau;
  locale: Locale;
}

export interface Dive {
  id: string;
  externalId: string;
  startedAt: string;       // ISO 8601
  durationSec: number;
  maxDepthM: number;
  avgDepthM: number;
  minWaterTempC: number | null;
  maxAscentRateMps: number;
  safetyScore: number | null;   // 0–100, null while not yet scored
  scoringVersion: string | null;
}

export interface DiveSummary {
  id: string;
  startedAt: string;
  durationSec: number;
  maxDepthM: number;
  safetyScore: number | null;
}

export interface DiveSample {
  tSec: number;            // multiple of 10 in practice
  depthM: number;
  tempC: number | null;
  cnsPct: number | null;
  decoState: DecoState;
  decoTimeSec: number;     // when ndl: NDL seconds remaining; when deco: required stop seconds
  decoDepthM: number;      // when ndl: 0; when deco: required stop depth (m)
  ttsSec: number | null;
}

export interface Insight {
  id: string;
  ruleId: string;          // stable id, e.g. "ascent_too_fast"
  severity: Severity;
  evidence: Record<string, unknown>;  // i18n template inputs; no displayed strings here
}
```

### Native module interface (Plan 2 ↔ Plan 3)

The mobile app talks to BLE through a single TurboModule. **Plan 2 ships against a JS-only mock with this exact interface; Plan 3 produces the real native implementation conforming to it.**

Module name: `DiveComputer` (registered as `NativeModules.DiveComputer`).

```ts
// apps/mobile/src/native/DiveComputer.ts
export type ScanResult = { name: string; identifier: string; rssi: number };
export type ManifestEntry = { index: number; address: number; fingerprintHex: string };
export type DownloadProgress = { bytesReceived: number; bytesExpected: number | null };

export interface DiveComputerModule {
  // Discovery
  startScan(serviceUuid: string): Promise<void>;            // emits "diveComputerDiscovered" events
  stopScan(): Promise<void>;

  // Connection
  connect(identifier: string): Promise<void>;               // resolves once subscribed to notifications
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;

  // Dive operations
  listDives(): Promise<ManifestEntry[]>;                    // requires connected
  downloadDive(index: number): Promise<{ rawBytes: string }>;  // base64 of post-LRE+XOR bytes
                                                            // emits "diveComputerProgress" during

  // Lifecycle
  addListener(eventName: string): void;                     // RN NativeEventEmitter contract
  removeListeners(count: number): void;
}
```

Events emitted via `NativeEventEmitter`:

- `"diveComputerDiscovered"` — payload `ScanResult` — emitted during scan for each discovered peripheral
- `"diveComputerProgress"` — payload `DownloadProgress` — emitted during `downloadDive`
- `"diveComputerDisconnected"` — payload `{ reason: string }` — emitted when device drops

Hard-coded service UUID for v1: `FE25C237-0ECE-443C-B0AA-E02033E7029D` (Shearwater family). The app passes it to `startScan` so future device families can be added without bumping the native module.

`rawBytes` returned as base64 because RN bridges have well-known issues with binary in some versions; base64 is universally safe. Plan 1's `POST /api/dives` accepts `multipart/form-data` so the app decodes base64 → blob before upload.

### Mock module for Plan 2

Plan 2 ships a JS implementation at `apps/mobile/src/native/DiveComputer.mock.ts` that satisfies the same interface using bundled fixture dives (the parsed XML files from `spike/0a-uddf-inspection/parsed/` re-encoded into Peregrine raw-byte form, OR a small set of hand-written JSON dives that the backend can also accept via a debug endpoint). Plan 1 should expose `POST /api/dives` such that the app can also send pre-parsed JSON in dev mode (e.g., `Content-Type: application/json` with a pre-parsed dive shape) so the mock doesn't have to fake byte-level decompression.

### i18n contract

All user-facing strings render in the mobile app from `apps/mobile/i18n/{fr,en}.json`. Backend never returns localized strings — only stable keys + structured evidence. Insight rendering pattern:

```ts
// In the app, given Insight from /api/dives/:id
const template = i18n.t(`insights.${insight.ruleId}.body`);   // e.g., "Vous êtes remonté à {{maxRateMpm}} m/min..."
const rendered = i18nInterpolate(template, insight.evidence);
```

`evidence` keys are camelCase and stable per ruleId. Plan 1's scoring engine documents exactly which keys each rule emits; Plan 2's translation files match those keys.

## Test data

The four parsed XMLs at `spike/0a-uddf-inspection/parsed/dive-{1,3,4,5}.xml` are the canonical fixtures. Plan 1 commits anonymized versions into `packages/shared/scoring/fixtures/` for unit tests. Plan 2's mock module returns these (or a re-encoded subset) so screen development is unblocked from BLE work.

## Out of scope (deferred from v1)

Listed in spec §8. Plans 1, 2, 3 must NOT add features from that list.

## Coupling-change protocol

If during execution a plan needs a contract change:

1. Stop. Don't silently update the plan.
2. Edit this doc with the proposed change.
3. Update the affected plans to match.
4. Note the change in commit message.

This prevents Plan 1 and Plan 2 from drifting into incompatible interpretations.
