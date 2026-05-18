# Phase A: Beta Ship — Design Doc

**Date:** 2026-05-18
**Status:** Draft (pending user review).
**Scope:** Everything required to put DiveForge in front of you + 1–2 beta testers across iOS and Android, with a marketing landing page on the existing domain. Excludes the camera feature, web app for users, and the §8 deferred backlog (those are Phase B/C).

---

## Goal

Take the working code from Plans 1–3 + the post-Plan-3 fixes, give it a brand identity, polish the mobile UX, deploy a marketing landing page on the owned domain, host the backend somewhere durable, and put signed builds into 2–3 testers' hands. Cheap-or-free wherever it doesn't hurt UX.

---

## The brand (locked via brainstorm)

**Direction:** Deep Ocean Modern. Dark-only, single palette.

**Reference apps:** Whoop, Linear, Apple Fitness+, Arc Browser. Premium-instrument feel; numbers feel weighty; cyan glows against the depth.

### Tokens

| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#0a1220` | App background |
| `bg-elev` | `#0f1d33` | Cards, list rows |
| `bg-deep` | `#103952` | Hero gradient stop |
| `accent` | `#22d3ee` | Primary CTA, score, key data |
| `accent-2` | `#a5f3fc` | Hover/glow halo |
| `text` | `#f0f9ff` | Primary text |
| `text-2` | `#94a3b8` | Secondary text |
| `text-3` | `#64748b` | Tertiary / labels |
| `border-subtle` | `#ffffff14` (rgba) | Card borders, dividers |
| `success` | `#22c55e` | Score 70+, all-good |
| `warning` | `#facc15` | Score 30–69, advisory |
| `danger` | `#ef4444` | Score <30, errors |

### Typography

- **Display / Heading:** Inter (variable). Sizes: 30/700 display, 24/700 title, 18/600 heading, 15/600 body-strong, 15/400 body, 13/500 small.
- **Mono numerics:** SF Mono (iOS system) / JetBrains Mono fallback. Used for depth, time, score, dates. Slight negative letter-spacing.
- **Caption / label:** Inter 11/600 with 0.12em letter-spacing, uppercase.

### Spacing & radius scale

`4 / 8 / 12 / 16 / 24 / 32 / 48`. Radius `8` (small surfaces), `12` (cards), `16` (hero), `999` (pills).

### Component vocabulary (primitives)

`Button` (filled cyan / ghost / danger), `Card` (elevated dark surface w/ optional hero gradient), `ListItem` (left meta + right value+chevron), `Badge` (cyan filled / outlined / score-coded), `Input` (dark with subtle border, cyan focus), `Tab` (icon + uppercase label, cyan = active), `ScoreNumber` (mono, color-graded by value), `EmptyState` (centered icon + line + CTA), `Spinner` (cyan ring on dark).

### What this DOES NOT include

- Light mode (chosen out — single palette, single identity).
- Custom illustrations or photography (system fonts + flat color blocks for v1; iconography uses lucide or sf-symbols).
- Custom fonts hosted by us (Inter + Mono via system fallback chain).

---

## Multi-device architecture (Petrel family — hybrid C)

The current code is single-device, Peregrine-only. We refactor for **multi-device per user across the Shearwater Petrel family** before shipping to beta. Same protocol family in libdc (`shearwater_petrel.c`), same byte layout, same LRE+XOR.

**Verified via libdivecomputer + Subsurface source:** every BLE-capable Shearwater Petrel-family computer advertises under a single service UUID — the one we already use, `FE25C237-0ECE-443C-B0AA-E02033E7029D`. No UUID list to expand. Models disambiguate by BLE-advertised GAP name during scan ("Peregrine", "Perdix", "Perdix 2", "Petrel 3", "Teric", "Nerd 2", "Tern"). Sources: libdivecomputer `src/descriptor.c:367-382`, Subsurface `core/qt-ble.cpp:177`.

**In-scope BLE Shearwater models** (covered by this architecture, all use the same UUID and same protocol):

- Peregrine, Peregrine TX
- Perdix (BLE-capable variants), Perdix AI, Perdix 2
- Petrel 2 (BLE-capable variant), Petrel 3
- Teric
- Nerd 2
- Tern, Tern TX

**Explicitly out of scope** (Bluetooth Classic SPP only — different transport stack we don't support): Petrel 1, Nerd 1.

**Hardware verification:** we have only Peregrine. Peregrine ships verified end-to-end. The others ship as "should work" with high confidence (identical protocol family per libdivecomputer; just no physical-device round-trip on our side). On encountering a model whose advertised name we don't recognize, we **fail loudly** — show an error to the user and capture the raw advertised name to Sentry — rather than silently registering it as `'unknown'`.

### What changes

**Native module:**

- Rename `PeregrineBLEManager` → `ShearwaterPetrelManager` (both iOS + Android).
- Service UUID stays a single constant — `FE25C237-0ECE-443C-B0AA-E02033E7029D` covers every BLE-capable Shearwater per Subsurface's authoritative table. No list, no parameterization debt.
- **Model dispatch by BLE-advertised GAP name during scan**, not after connect. The advertised name is in the `ScanResult` we already emit. Map name-prefix → model via a small `parseShearwaterModel(name)` function in shared TS (so iOS, Android, and JS agree). Known prefixes: `Peregrine`, `Perdix 2`, `Perdix AI`, `Perdix`, `Petrel 3`, `Petrel`, `Teric`, `Nerd 2`, `Tern`. **No `'unknown'` fallback** — a name that doesn't match any prefix surfaces as `model: null` to the JS layer, and the registration flow refuses to proceed and shows a "Unrecognized device — please report what model you have" UI.
- `getDeviceInfo()` is still exposed but used for **confirmation, not dispatch**: returns `{ model: parsed-from-name, serial: from-RDBI-ID_SERIAL, firmwareVersion: from-RDBI-ID_FIRMWARE, friendlyName: derived }`.
- Existing 86 protocol unit tests stay green — they exercise the protocol, not the device label. Rename is mechanical. Add unit tests for `parseShearwaterModel` covering all known prefixes plus a "garbled name → null" case.

**Backend (Plan 1 schema additions):**

- New `user_devices` table: `(id, user_id, model, device_serial, friendly_name, registered_at, last_synced_at)`. Composite uniqueness on `(user_id, device_serial)`.
- New endpoints under `/api/devices`:
  - `POST /api/devices` — register a newly-discovered device. Body: `{ model, deviceSerial, friendlyName }`. Idempotent on `(user_id, deviceSerial)`.
  - `GET /api/devices` — list current user's registered devices.
  - `PATCH /api/devices/:id` — rename. Body: `{ friendlyName }`.
  - `DELETE /api/devices/:id` — remove from inventory (does NOT delete the user's dives — those keep their `deviceSerial` reference for history).
- `POST /api/dives` validates `meta.deviceSerial` matches a registered device for the authenticated user. **Rejects with 400** if the device isn't registered — this catches the "client tried to upload from a device the server has never heard of" case. Registration always happens client-side (after `parseShearwaterModel` succeeds during scan); server-side registration is not a fallback.

**Local DB schema migration:**

- `synced_fingerprints` primary key changes from `(user_id, fingerprint)` to `(user_id, device_serial, fingerprint)`. Same destructive-migration pattern we used twice already (DROP + CREATE; legacy rows have no `device_serial` so they're not worth keeping).
- `upload_queue` gains a `device_serial TEXT NOT NULL` column. Existing legacy rows get DELETE'd on first run (same precedent).
- Both modules' public APIs add a `deviceSerial` parameter alongside the existing `userId`:
  - `getSyncedFingerprints(userId, deviceSerial)`
  - `markFingerprintSynced(userId, deviceSerial, fingerprint)`
  - `enqueueUpload(userId, deviceSerial, payload)`
  - `flushQueue(userId, deviceSerial, uploadFn)` and `getPendingCount(userId, deviceSerial)` similarly.

**Mobile UX:**

- **First-sync registration flow:** scan discovers a device → `parseShearwaterModel(scanResult.name)` runs immediately. If it returns `null`, the discovery is rejected with a "We don't recognize this dive computer model. Currently we support Shearwater Petrel-family BLE devices (Peregrine, Perdix, Petrel 2/3, Teric, Nerd 2, Tern). Please report what model you have." error — captures the raw advertised name to Sentry. If it returns a known model, the user proceeds; after connect, `getDeviceInfo()` confirms serial + firmware, and `POST /api/devices` registers with a generated friendly name (e.g. "Mohammad's Peregrine").
- **Sync screen:** if 0 devices registered → scan flow (existing). If 1 device → sync that one (existing). If ≥2 devices → device picker before scan ("Sync from which?").
- **Profile screen:** new "Your dive computers" section listing each registered device with friendly name, model, serial (last 4), last sync date, rename, remove.

### What this DOES NOT include

- Non-Petrel-family Shearwater models or other vendors (Garmin, Suunto, Mares, Atomic) — those are different protocols, different libdc adapters. Phase B+ work.
- Cross-device dive dedup on the backend (e.g., the same dive logged on two computers in a buddy pair). Each device's fingerprints are independent; the backend trusts `(user_id, deviceSerial, fingerprint)` as the dive identity.
- Auto-discovery of "I bought a new Perdix" beyond the first scan working. If the user already has Peregrine registered and now scans for Perdix, the discovery flow auto-registers the second device.
- "Sync all my computers" one-tap flow. Phase B.

### Honest claim for the beta

In the beta-tester docs and the marketing landing's feature list:

> "DiveForge syncs with Shearwater Peregrine, and *should* sync with any BLE-capable Shearwater Petrel-family computer — Perdix (AI / 2), Petrel 2/3, Teric, Nerd 2, Tern. Same protocol family, same Bluetooth interface. Peregrine is verified end-to-end on real hardware; the others are unverified — please get in touch if you have one and we'll figure out anything that doesn't work. Petrel 1 and Nerd 1 use older Bluetooth Classic and aren't supported."

We're confident in the family because libdivecomputer treats them as one (verified via source). We're transparent about what we've actually run. Tester expectations match reality.

### Acceptance criteria

1. Renamed `ShearwaterPetrelManager` exists on both platforms; 86 protocol tests still pass; type-check clean.
2. `getDeviceInfo()` returns the correct `model: 'peregrine'` and a real serial when run against your Peregrine.
3. Backend `user_devices` table exists; `POST/GET/PATCH/DELETE /api/devices` work end-to-end (covered by integration tests).
4. Local mobile DB migrates: `synced_fingerprints` has the new composite PK, `upload_queue` has the new column, legacy rows are dropped.
5. `useSync` threads `deviceSerial` through every cache call; `useQueueFlush` does too.
6. Profile screen shows the registered Peregrine; rename works; remove works (and the user's dives stay).
7. Sync screen handles zero / one / multiple registered devices correctly.
8. The full Phase A test suite (~30+ unit tests, plus the new device + multi-device tests) is green.

---

## P1 — Mobile UX rollout

Apply the design system to all 6 screens. The current code uses generic React Native components; this is a per-screen polish pass, not a rewrite.

### Screens & moments-of-truth

1. **Home** — locked via brainstorm mockup. Hero card for last dive, list of earlier dives, floating sync button, tab bar.
2. **Trends** — Score series chart (Victory native), summary tip, 30-day stats row.
3. **DiveDetail** — Depth profile chart, score breakdown, insight cards, raw stats row.
4. **Profile** — User info, niveau, locale, logout, queue banner placement, **registered dive computers section** (rename, remove).
5. **Sync** — State machine: idle → scanning → connecting → listing → downloading → uploading → complete → error. Each state gets its own treatment (locked: "Dive N of M" already shipped). **Device picker** prefix when ≥2 devices are registered; first-sync auto-registers the discovered device.
6. **Auth (Login + Signup)** — Single-screen forms, Inter + cyan, friendly empty / loading states.

### Cross-cutting items

- **Empty states** — every list screen needs one. "No dives yet — sync your dive computer to get started" with sync CTA.
- **Loading states** — cyan spinners. No skeleton screens for v1 (overkill).
- **Error states** — red icon + plain-language message. Retry CTA where applicable.
- **`QueueBanner`** — already exists; restyle to match dark theme + cyan-tinted warning amber.
- **Tab bar** — three tabs (Home, Trends, Profile). Active = cyan icon + label. Inactive = `text-3`.
- **Status / nav header** — minimal; rely on screen-level `<Text>` titles, not React Navigation's default header where avoidable.

### What this DOES NOT include

- Animations beyond default RN transitions (no Reanimated work, no shared-element transitions). Adds polish but ~1 week of work.
- Per-niveau theming or customization. Single palette.
- Onboarding tour. Sign up + first sync is the tour.

### Acceptance criteria

1. All 6 screens use only design tokens (no inline hex). Tokens live in `apps/mobile/src/theme/tokens.ts` and `apps/mobile/src/theme/index.ts`.
2. The `theme/` module exports type-safe accessors so `<View style={{ backgroundColor: theme.bgElev }}>` is the pattern, not raw hex.
3. The 6 primitive components live in `apps/mobile/src/components/ui/` and have at least one consumer each.
4. Profile shows the registered Peregrine; rename + remove work; the user's dives are not deleted on remove.
5. Sync screen renders device picker correctly across the 0 / 1 / ≥2 cases.
6. The 86 native protocol tests + JS tests stay green throughout (test count grows with the device-scoping additions; baseline drift is fine, regressions aren't).
7. `pnpm typecheck` clean.

---

## P2 — Marketing landing page

A static-ish landing page on the existing domain. Single page (`/`) with a privacy stub at `/privacy`. Content: hero, features, "join the beta" CTA, footer.

### Stack

- **Framework:** Next.js (App Router, static export). Same stack as the backend (Plan 1) — single skill set, single deploy target.
- **Styling:** Tailwind CSS, with the same design tokens (extended in `tailwind.config.ts` from a shared `packages/shared/tokens.ts`).
- **Hosting:** Vercel free tier. Custom domain wiring is automatic.
- **Content:** Static MDX or just JSX. No CMS for v1.

### Page shape (single)

- **Hero** — Full-bleed dark, cyan glow, big mono "36.6m" placeholder, headline "Dive smarter. Logbook your data. Get coached.", "Join the beta" button.
- **Features** — 3 feature cards (Sync your Peregrine over Bluetooth · See FFESSM-graded scores · Track trends over time).
- **Beta CTA** — Email capture. Stored in a simple table or sent to a free Formspree / Tally form for v1.
- **Footer** — Logo, copyright, /privacy link.

### Where it lives

Inside the existing monorepo as a new app: `apps/web-marketing/`. Sibling to `apps/mobile/` and the backend.

### What this DOES NOT include

- Blog, changelog, docs.
- Multi-language. Domain is owned and global; we do English-only for v1 marketing (the mobile app keeps fr/en — that's per-user locale, separate concern).
- Analytics beyond a free Vercel Web Analytics pixel.
- A11y audit beyond default Tailwind contrast (revisit when we have actual users).

### Acceptance criteria

1. Domain resolves and serves the dark-themed landing.
2. Email capture works end-to-end (form posts to a real endpoint, stored or forwarded).
3. Lighthouse score ≥ 95 on perf and a11y.
4. Same color palette and Inter typography as mobile.

---

## P3 — Backend deploy + database

### Stack & hosts

- **Backend (Plan 1):** Next.js (App Router) Postgres-backed API. Already exists in repo; just needs deploy.
- **Hosting:** Vercel free tier. Same project as marketing landing? **No** — keep them as separate Vercel projects so the marketing site can ship on a different cadence and we don't ship API changes when we tweak landing copy. Two Vercel projects, both free tier.
- **Database:** **Neon** Postgres free tier (0.5 GB, autoscaling, branchable). Connection string into Vercel env vars.
- **Object storage (raw dive bytes):** **Cloudflare R2** free tier (10 GB + 1M class-A ops/mo). S3-compatible API; works with the AWS SDK.
- **Email (for the beta-signup form):** **Resend** free tier (3K emails/mo) — or Formspree (50/mo) if Resend feels heavy. Plan: forward signup form posts to your inbox.

### Environment matrix

| Env var | Where used | Source |
|---|---|---|
| `DATABASE_URL` | backend | Neon connection string |
| `NEXTAUTH_SECRET` | backend | generated, stored in Vercel |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_KEY` / `R2_BUCKET` | backend | Cloudflare dashboard |
| `SENTRY_DSN` | backend, mobile | Sentry project |
| `EXPO_PUBLIC_API_URL` | mobile | Vercel deployment URL |

### dctool subprocess concern

Plan 1 uses `dctool parse` (libdivecomputer) as a subprocess to decode raw bytes. **Vercel functions have a 10s timeout on the free tier**. Quick parse should fit; large dive payloads might not. Mitigation: stream-parse if possible, OR move the parse path to a Vercel Background Function (60s timeout on free), OR run a tiny long-running worker on Fly.io free tier (3 shared-CPU-1x VMs at no cost).

For v1 with 2–3 testers and small dive counts, the 10s function timeout will hold. Document this as a constraint to revisit if it bites.

### What this DOES NOT include

- CDN edge caching tuning.
- Database backups beyond Neon's built-in PITR (free tier includes 7 days).
- Multi-region deploys. Single us-east-1 region for v1.

### Acceptance criteria

1. Backend deployed; `/api/auth/login` returns a JWT for a seeded test user.
2. Mobile app pointed at the deployed `EXPO_PUBLIC_API_URL` syncs a dive end-to-end (BLE → POST `/api/dives` → row in Neon, raw bytes in R2).
3. Database survives a redeploy (no data loss).
4. R2 bucket has a real raw-bytes object after one synced dive.
5. `user_devices` table exists; first sync auto-registers a row; `GET /api/devices` returns it; `PATCH` renames; `DELETE` removes from inventory while preserving `dives` rows.
6. `POST /api/dives` rejects (or auto-registers via fallback) when `meta.deviceSerial` is missing or unrecognized — must not silently associate a dive with the wrong device.

---

## P4 — Beta distribution + observability

### Distribution

**iOS:**
- **Recommended path:** Apple Developer Program ($99/year). Enables TestFlight — clean install for non-technical testers, no 7-day cert expiry, no manual cable install. Worth it for any non-trivial beta.
- **Free path:** Free Apple ID + Xcode personal cert. Works for you + 1–2 friends willing to re-trust the cert every 7 days. No App Store presence. Manual cable install or Expo Dev Client.

User said "cheap and free are welcome" — so the **default for v1 is the free path** (you + 1–2 testers, all technical-ish). If friction shows up, upgrade.

**Android:**
- **Recommended path:** Google Play Console developer account ($25 one-time). Internal track lets you push builds to a closed list of testers via email. Install via Play Store, no sideload prompt.
- **Free path:** Direct APK + sideload. "Install from unknown sources" prompt, no auto-updates. Works for 1–2 technical testers.

**Default for v1: free path** (direct APK, you + 1–2 testers). Same upgrade trigger as iOS.

### Build mechanism

**Both platforms:** Expo Application Services (EAS Build) free tier — 30 builds/month, unlimited team members for personal projects. Already an Expo bare workflow project, so EAS is the natural fit. Generates signed `.ipa` (iOS) and `.aab` / `.apk` (Android) without you owning a Mac for Android signing.

EAS dashboard hosts the builds; testers grab them via short link or QR code.

### Observability

- **Crash reporting (mobile + backend):** **Sentry** free tier — 5K errors/month, 10K performance events/month. SDK in both `apps/mobile/` and the backend. Source maps uploaded automatically by the EAS post-build hook.
- **Backend logs:** Vercel built-in logs (free, kept 1 hour on free tier — sufficient for live debug; longer retention only if needed).
- **Telemetry:** None for v1. We're 2–3 testers; we don't need a product analytics pipeline. If it gets useful, PostHog free tier (1M events/mo) or Vercel Web Analytics.
- **User-facing error reporting:** Already partial via the existing `error` field surfaced by `useSync`. The `console.warn` we just added to `flushQueue` flows into Sentry's breadcrumbs automatically.

### What this DOES NOT include

- App Store submission (deferred per spec §8).
- Beta-tester recruitment beyond your direct circle.
- Onboarding videos.
- Crashlytics / Firebase (Sentry covers it).

### Acceptance criteria

1. EAS produces a signed iOS `.ipa` and Android `.apk`.
2. You can install both on real devices and walk through scan → sync → view dive.
3. A deliberately-introduced crash on either platform shows up in Sentry within 60 seconds.
4. Backend errors surface in Vercel logs + Sentry.

---

## Cost summary

| Item | Free path | Recommended path |
|---|---|---|
| Domain | Already owned | Already owned |
| Vercel (marketing + backend) | $0 | $0 |
| Neon Postgres | $0 | $0 |
| Cloudflare R2 | $0 | $0 |
| Sentry | $0 | $0 |
| Resend (for landing form) | $0 | $0 |
| EAS Build | $0 (30/mo) | $0 (30/mo) |
| Apple Developer | $0 (personal cert) | $99/yr |
| Google Play Console | $0 (sideload) | $25 one-time |
| **Total** | **$0** | **~$124 first year, $99/yr after** |

The free path is fully viable for v1. The recommended path is what to upgrade to when friction shows up.

---

## Sequencing & parallelism

```
P0 (locked above)
   │
   ├──> M1 — Native rename + getDeviceInfo   (~2 days; serial)
   │       │
   │       └──> M2 — Local DB device_serial migration (~2 days; serial)
   │
   ├──> M3 — Backend user_devices table + CRUD (~2-3 days; parallel with M1/M2)
   │
   ├──> P1 — mobile UX rollout + device picker + Profile inventory   (critical path; ~2-3 weeks; needs M1+M2+M3)
   │
   └──> P2 — marketing landing                  (parallel; ~3–5 days; needs P0 only)

P3 — backend deploy + DB                       (~2–3 days; depends on M3 schema being final)

P4 — beta distribution                         (~2–3 days; depends on P1 + P3)
```

The "M" tasks (M1/M2/M3) are the multi-device foundation work that landed in this spec revision. They feed P1 and P3 but don't extend the calendar end-date materially because they run in parallel with the design-system rollout.

Critical path: M1 → M2 → P1 → P4. P2 and P3 finish in parallel.

Each labeled task gets its own implementation plan after this spec is approved.

---

## Out of scope (deferred to Phase B and beyond)

- **Camera feature** (data collection + design) — Phase B
- **UX iteration based on beta feedback** — Phase B (parallel with camera)
- **Web app for users** (full-fidelity dive viewing on the web) — Phase B
- **§8 v1 spec deferred items** — Phase C: clubs, social, LLM-narrated insights, file-import, other dive computers, push, App Store submission, monetization

---

## Risks

- **Vercel function timeout on `dctool parse`.** If a single dive's parse takes >10s on the free tier, the POST will fail. Mitigation: monitor and either (a) move parse to Background Functions or (b) move backend to Fly.io free tier if persistent. For 2–3 testers with small dive counts, unlikely to bite.
- **EAS free tier 30 builds/month.** Active development might consume that on iOS+Android combined. Mitigation: be deliberate about builds; combine fixes before rebuilding. Upgrade to EAS Production tier ($29/mo) if hit consistently.
- **Personal Apple cert 7-day expiry.** If the recommended TestFlight path is rejected, expect to rebuild and re-trust weekly during the beta. Honest UX cost; document in tester instructions.
- **Brand drift between mobile and web.** Sharing tokens via `packages/shared/tokens.ts` mitigates. If the web team and mobile team drift on a single token, fix at the package and both pick up.
- **Untested Petrel-family models (Perdix, Petrel 2/3, Teric, Nerd 2, Tern).** We ship architectural support without hardware to verify against. Mitigations: (a) per libdivecomputer + Subsurface source, the protocol code and BLE service UUID are identical for the family — the prior is "almost certainly works"; (b) we fail loudly on unrecognized model names so a regression is visible; (c) tester docs and marketing copy explicitly disclose Peregrine-only verification. Cost of being wrong: a Perdix/Teric tester reports a failure; we triage and fix specifically.
- **Advertised-name parsing edge cases.** Shearwater hasn't published an exhaustive list of advertised GAP names and the strings could vary by firmware (e.g., "Petrel 3" vs "Petrel-3" vs "Petrel III"). Mitigations: (a) `parseShearwaterModel` uses prefix-matching against a documented list; (b) unrecognized names fail-loud and capture the raw string to Sentry so we can update the parser; (c) the parser is shared TS in `packages/shared/` so iOS, Android, and JS agree.

---

## Acceptance criteria for Phase A overall

1. Brand tokens defined once, consumed by both `apps/mobile/` and `apps/web-marketing/`.
2. All 6 mobile screens use the design system; the visual baseline is "looks like a real product, not a prototype."
3. Marketing landing reachable on the owned domain; email signup works.
4. Backend + DB deployed; mobile app works end-to-end against the deployed backend.
5. Beta build distributable to 2–3 testers on iOS + Android; one full sync round-trip per tester succeeds.
6. Crashes surface in Sentry within minutes.
7. Multi-device architecture in place: native module renamed to `ShearwaterPetrelManager`, `parseShearwaterModel` lives in `packages/shared/` and covers the documented prefixes, `getDeviceInfo()` returns model + serial, `user_devices` table + CRUD endpoints exist, local DB tables device-scoped, Profile shows the registered device, Sync screen handles the 0/1/≥2 device cases. Unrecognized models fail loudly with telemetry. Peregrine verified end-to-end; Perdix/Teric/Petrel-2/Petrel-3/Nerd-2/Tern marked unverified in tester-facing copy. Petrel 1 and Nerd 1 explicitly flagged as out-of-scope (BT Classic only).
8. Total recurring cost: $0 (with the option to spend $99 + $25 one-time if friction warrants).
