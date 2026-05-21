# P4 — Mobile beta distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-21
**Status:** Ready for execution.
**Spec:** `docs/superpowers/specs/2026-05-21-p4-beta-distribution-design.md`
**Depends on:** Nothing (P3 is in production; web has its own Sentry working).

**Goal:** Land all foundation code for mobile beta distribution: shared scrubber + Sentry React Native + corrected EAS profiles + verified BLE permissions. Plus two operator runbooks (Play Console submission + iOS sideload) for the post-merge external work.

**Architecture:** Move the existing scrubber from `apps/web/src/lib/sentry-scrub.ts` to `packages/shared/src/sentry-scrub.ts` so both web and mobile import it. Install `@sentry/react-native@latest` in apps/mobile, configure it to use the shared scrubber + same DSN/org/project as web's existing Sentry project (we reuse the `divechef/javascript-nextjs` project and tag mobile events via `environment` + `release` instead of creating a separate Sentry project — at our scale, one project is simpler). Fix `eas.json` (real production API URL, AAB, autoIncrement, drop stale preview profile) and `app.json` (dark theme, Sentry plugin, runtimeVersion). Verify Android BLE permissions are in the manifest. Code lands in one PR; operator runbooks (Play Console, iOS sideload) live in `docs/superpowers/runbooks/` and execute post-merge.

**Tech Stack:** Expo SDK 54 (bare workflow), React Native 0.81, `@sentry/react-native@latest`, `@sentry/core` (types only), Jest, EAS CLI.

> **Worktree note:** Single worktree on a feature branch is fine. No native rebuilds during the foundation work — `@sentry/react-native` install adds gradle/podspec config that EAS Build picks up at build time, so we don't need a local `pod install` or gradle sync to land the PR. Local testing happens against jest only.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `packages/shared/src/sentry-scrub.ts` | **Create** | Pure scrubber, moved from apps/web. Imports `ErrorEvent` + `EventHint` from `@sentry/core`. |
| `packages/shared/src/__tests__/sentry-scrub.test.ts` | **Create** | The 7 unit tests, moved from apps/web. |
| `packages/shared/src/index.ts` | **Modify** | Re-export `scrubSensitiveData`. |
| `packages/shared/package.json` | **Modify** | Add `@sentry/core` to `devDependencies` for type imports. |
| `apps/web/src/lib/sentry-scrub.ts` | **Delete** | Replaced by shared version. |
| `apps/web/src/lib/__tests__/sentry-scrub.test.ts` | **Delete** | Replaced by shared version. |
| `apps/web/instrumentation-client.ts` | **Modify** | Import path → `@divechef/shared`. |
| `apps/web/sentry.server.config.ts` | **Modify** | Import path → `@divechef/shared`. |
| `apps/web/sentry.edge.config.ts` | **Modify** | Import path → `@divechef/shared`. |
| `apps/mobile/package.json` | **Modify** | Add `@sentry/react-native` dependency. |
| `apps/mobile/src/sentry/init.ts` | **Create** | `Sentry.init` with shared scrubber + env-driven DSN + environment tag. |
| `apps/mobile/App.tsx` | **Modify** | `import './src/sentry/init'` at top; wrap export with `Sentry.wrap`. |
| `apps/mobile/app.json` | **Modify** | `userInterfaceStyle: "dark"`, register `@sentry/react-native/expo` plugin, set `runtimeVersion`. |
| `apps/mobile/eas.json` | **Modify** | Drop `preview` profile; production env URL + AAB + autoIncrement + submit track config. |
| `apps/mobile/jest.setup.ts` | **Modify** | Mock `@sentry/react-native` so tests don't try to invoke native init. |
| `apps/mobile/android/app/src/main/AndroidManifest.xml` | **Verify** (no edit unless gap) | Confirm BLUETOOTH_SCAN/CONNECT/ADMIN + ACCESS_FINE_LOCATION + bluetooth_le feature declared. |
| `docs/superpowers/runbooks/play-console-first-submission.md` | **Create** | Operator runbook — Play Console signup, app registration, required forms, service account, first AAB submit. |
| `docs/superpowers/runbooks/ios-self-sideload.md` | **Create** | Operator runbook — Xcode + free Apple ID setup, first device install, 7-day re-sign cycle. |

---

## Task 1: Move scrubber to `packages/shared`

The scrubber currently lives at `apps/web/src/lib/sentry-scrub.ts`. Moving it makes mobile reuse it without duplication. The body is unchanged; only the type imports switch from `@sentry/nextjs` to `@sentry/core` (which both nextjs and react-native re-export from).

**Files:**
- Create: `packages/shared/src/sentry-scrub.ts`
- Create: `packages/shared/src/__tests__/sentry-scrub.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json`
- Delete: `apps/web/src/lib/sentry-scrub.ts`
- Delete: `apps/web/src/lib/__tests__/sentry-scrub.test.ts`

### Step 1: Add `@sentry/core` to packages/shared

- [ ] Run: `cd packages/shared && pnpm add -D @sentry/core@^10`
- [ ] Verify: `grep '@sentry/core' packages/shared/package.json` shows it under `devDependencies`.

### Step 2: Create `packages/shared/src/sentry-scrub.ts`

- [ ] Create the file with this content (identical to current web version except for the import line):

```ts
import type { ErrorEvent, EventHint } from '@sentry/core';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'authorization',
  'cookie',
  'bytes',
]);

function scrubObject(obj: unknown): unknown {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(scrubObject);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[scrubbed]' : scrubObject(v);
  }
  return out;
}

/**
 * Strip IP addresses and sensitive request-body keys before Sentry sends an event.
 * Returns a new object — does not mutate the input.
 *
 * Used by all Sentry runtimes (web server, web client, web edge, mobile).
 * Single source of truth for what we consider sensitive.
 */
export function scrubSensitiveData<T extends ErrorEvent>(event: T, _hint?: EventHint): T {
  const next: T = { ...event };

  if (next.user) {
    next.user = { ...next.user };
    delete next.user.ip_address;
  }

  if (next.request) {
    next.request = { ...next.request };
    if (next.request.headers) {
      const headers = { ...next.request.headers };
      delete headers['x-forwarded-for'];
      next.request.headers = headers;
    }
    if (next.request.data !== undefined) {
      next.request.data = scrubObject(next.request.data);
    }
  }

  return next;
}
```

### Step 3: Move the existing tests verbatim

- [ ] Read the current tests file to confirm content:

```bash
cat apps/web/src/lib/__tests__/sentry-scrub.test.ts
```

- [ ] Create `packages/shared/src/__tests__/sentry-scrub.test.ts` with the same body, but change the relative import:

```ts
import { describe, it, expect } from 'vitest';
import { scrubSensitiveData } from '../sentry-scrub';
```

(rest of the file is the same 7 tests, byte-for-byte)

The `vitest` import works because the shared package already uses vitest — verify with `cat packages/shared/package.json` to confirm. If shared uses jest instead, replace `from 'vitest'` with `from '@jest/globals'` and adjust the test runner config accordingly.

### Step 4: Re-export from the package barrel

- [ ] Read current state: `cat packages/shared/src/index.ts`
- [ ] Add the export line (place near other re-exports; alphabetize if convention):

```ts
export { scrubSensitiveData } from './sentry-scrub';
```

### Step 5: Run shared tests

- [ ] Run: `cd packages/shared && pnpm test 2>&1 | tail -10`
- [ ] Expected: 7 tests pass.

### Step 6: Delete the web copies

- [ ] Run:

```bash
rm apps/web/src/lib/sentry-scrub.ts
rm apps/web/src/lib/__tests__/sentry-scrub.test.ts
rmdir apps/web/src/lib/__tests__ 2>/dev/null
```

### Step 7: Commit

```bash
git add packages/shared apps/web/src/lib
git commit -m "$(cat <<'EOF'
refactor(sentry): move scrubSensitiveData to packages/shared

P3 placed the scrubber at apps/web/src/lib/sentry-scrub.ts. P4's
mobile Sentry SDK needs the same scrubber. Moving it to
packages/shared lets both runtimes import from one place — no copy-
paste, no drift if SENSITIVE_KEYS gets a new entry later.

Type imports switch from @sentry/nextjs to @sentry/core. Both
@sentry/nextjs and @sentry/react-native re-export from core, so
both consumers see the same ErrorEvent / EventHint types.

7 unit tests move with the implementation; behavior unchanged.

P4 task 1 of 8.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update web Sentry config import paths

Three one-line import changes. No behavior change.

**Files:**
- Modify: `apps/web/instrumentation-client.ts`
- Modify: `apps/web/sentry.server.config.ts`
- Modify: `apps/web/sentry.edge.config.ts`

### Step 1: Update each file

- [ ] In each of the three files, replace:

```ts
import { scrubSensitiveData } from './src/lib/sentry-scrub';
```

with:

```ts
import { scrubSensitiveData } from '@divechef/shared';
```

### Step 2: Verify web tests pass

- [ ] Run: `cd apps/web && pnpm test 2>&1 | tail -10`
- [ ] Expected: 66 tests pass (or whatever the current count is — confirm no regression).

### Step 3: Verify production build still works

- [ ] Run: `cd apps/web && timeout 240 pnpm exec next build 2>&1 | tail -10`
- [ ] Expected: build completes, all routes compile.

### Step 4: Commit

```bash
git add apps/web/instrumentation-client.ts apps/web/sentry.server.config.ts apps/web/sentry.edge.config.ts
git commit -m "$(cat <<'EOF'
refactor(sentry): web imports scrubber from @divechef/shared

The scrubber moved to packages/shared in the previous commit. Web's
three Sentry runtime configs (instrumentation-client, sentry.server,
sentry.edge) update their import paths. Same function, same behavior;
just one source of truth shared with mobile.

P4 task 2 of 8.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Install `@sentry/react-native`

**Files:**
- Modify: `apps/mobile/package.json`

### Step 1: Install

- [ ] Run:

```bash
cd apps/mobile
pnpm add @sentry/react-native
```

This pulls in the latest `@sentry/react-native` and its peers. If the install fails because of an Expo SDK 54 + new arch peer-dep complaint, retry with `--legacy-peer-deps`-equivalent (`pnpm install --strict-peer-dependencies=false`) — but note the warning in your commit message.

### Step 2: Confirm the install

- [ ] Run: `grep '@sentry/react-native' apps/mobile/package.json`
- [ ] Expected: shows the dep + a version number (e.g., `^6.0.0` or `^10.0.0`).

### Step 3: Commit

```bash
git add apps/mobile/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(mobile): install @sentry/react-native

Adds the SDK that captures JS + native crashes on iOS and Android.
Configuration lands in the next commit.

P4 task 3 of 8.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create `apps/mobile/src/sentry/init.ts`

The mobile equivalent of `apps/web/instrumentation-client.ts` — initializes the SDK, registers the shared scrubber, reads env vars baked at build time.

**Files:**
- Create: `apps/mobile/src/sentry/init.ts`

### Step 1: Create the file

- [ ] Create `apps/mobile/src/sentry/init.ts`:

```ts
import * as Sentry from '@sentry/react-native';
import { scrubSensitiveData } from '@divechef/shared';

/**
 * Sentry initialization for the mobile app.
 *
 * Imported as a side-effect at the top of App.tsx so it runs before
 * any other code that might throw. Same DSN as web (one Sentry project,
 * two consumers); environment tag distinguishes mobile from web events.
 */
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',
  tracesSampleRate: 0.1,
  beforeSend: scrubSensitiveData,
  // Print Sentry's own breadcrumbs to the JS console only in dev builds.
  debug: __DEV__,
});
```

### Step 2: Typecheck

- [ ] Run: `cd apps/mobile && pnpm typecheck 2>&1 | tail -10`
- [ ] Expected: clean. (If `__DEV__` is undefined, add `/// <reference types="react-native" />` at the top — but it should be globally typed by react-native's @types.)

### Step 3: Commit

```bash
git add apps/mobile/src/sentry/init.ts
git commit -m "$(cat <<'EOF'
feat(mobile): Sentry init with shared scrubber

Mirror of web's instrumentation-client pattern. Reads
EXPO_PUBLIC_SENTRY_DSN baked at build time by EAS, tags events with
EXPO_PUBLIC_SENTRY_ENVIRONMENT (production|preview|development).
Uses the same scrubSensitiveData function as web — one source of
truth for what's PII.

P4 task 4 of 8.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire `Sentry.init` into `App.tsx`

The init module needs to load before any other code. We import it as a side-effect at the very top of App.tsx. Then we wrap the exported component with `Sentry.wrap` so React error boundaries capture component-tree errors.

**Files:**
- Modify: `apps/mobile/App.tsx`

### Step 1: Read current state

- [ ] Run: `cat apps/mobile/App.tsx`

### Step 2: Make two edits

- [ ] Add at the **very top** (line 1, before any other import):

```ts
import './src/sentry/init';
```

- [ ] Add a Sentry import near the other library imports:

```ts
import * as Sentry from '@sentry/react-native';
```

- [ ] Find the existing `export default App` (or `export default function App() {...}`). Change to wrap with `Sentry.wrap`:

If the existing code is:
```tsx
export default function App() {
  return (
    // ... JSX
  );
}
```

Change to:
```tsx
function App() {
  return (
    // ... JSX (unchanged)
  );
}

export default Sentry.wrap(App);
```

### Step 3: Verify mobile tests still pass

- [ ] Run: `cd apps/mobile && pnpm test 2>&1 | tail -10`

If a test fails because it imports App.tsx and chokes on the side-effect Sentry init, see Task 6 (jest mock for `@sentry/react-native`). For now, if tests pass, proceed.

### Step 4: Typecheck

- [ ] Run: `cd apps/mobile && pnpm typecheck 2>&1 | tail -10`
- [ ] Expected: clean.

### Step 5: Commit

```bash
git add apps/mobile/App.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): wire Sentry init + Sentry.wrap in App.tsx

Side-effect import at the top of App.tsx ensures Sentry.init runs
before anything else. Sentry.wrap(App) adds a React error boundary
at the root so component-tree exceptions are captured (otherwise they
just bubble to a white screen on iOS / Android).

P4 task 5 of 8.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Mock `@sentry/react-native` in jest setup

Jest tests don't need the real Sentry SDK firing during unit tests. Mocking it makes test runs deterministic and prevents the SDK from trying to reach the native bridge in node.

**Files:**
- Modify: `apps/mobile/jest.setup.ts`

### Step 1: Read current state

- [ ] Run: `cat apps/mobile/jest.setup.ts`

### Step 2: Add the mock

- [ ] Append to the end of `jest.setup.ts`:

```ts
// Sentry: mock the native SDK in tests so init/capture calls are no-ops.
// Real init runs only on device via EAS-built binaries.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: <T extends React.ComponentType<unknown>>(component: T): T => component,
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
}));
```

If `React` isn't already imported in `jest.setup.ts`, add `import * as React from 'react';` at the top.

### Step 3: Run tests

- [ ] Run: `cd apps/mobile && pnpm test 2>&1 | tail -10`
- [ ] Expected: all tests pass.

### Step 4: Commit

```bash
git add apps/mobile/jest.setup.ts
git commit -m "$(cat <<'EOF'
test(mobile): mock @sentry/react-native in jest setup

Tests don't need the real native SDK to fire during unit runs. Mock
init / wrap / captureException etc. as no-ops so any test that
indirectly imports App.tsx (or any module that calls Sentry) doesn't
crash trying to reach the native bridge under node.

wrap returns the wrapped component as-is so error-boundary tests
still work.

P4 task 6 of 8.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update `app.json`

Three changes:
1. `userInterfaceStyle: "light"` → `"dark"` (we ship a dark app; this prevents iOS from inverting system surfaces).
2. Add the `@sentry/react-native/expo` plugin so the native Sentry SDK is wired during prebuild.
3. Add `runtimeVersion` so future EAS Update support is forward-compatible.

**Files:**
- Modify: `apps/mobile/app.json`

### Step 1: Read current state

- [ ] Run: `cat apps/mobile/app.json`

### Step 2: Apply the three changes

- [ ] Change `"userInterfaceStyle": "light"` → `"userInterfaceStyle": "dark"`.

- [ ] Find the `"plugins"` array (or create it as a sibling of `"name"`, `"slug"`, etc. inside the `"expo"` block if it doesn't exist). Add the Sentry plugin entry. Final shape (illustrative):

```json
"plugins": [
  [
    "@sentry/react-native/expo",
    {
      "url": "https://sentry.io/",
      "organization": "divechef",
      "project": "javascript-nextjs"
    }
  ]
]
```

If `plugins` already has other entries, append the Sentry one — don't replace. Order doesn't matter.

- [ ] Add `runtimeVersion` as a sibling of `"name"`, `"slug"`, etc. inside the `"expo"` block:

```json
"runtimeVersion": {
  "policy": "appVersion"
}
```

This means Expo treats the `version` field (`1.0.0`) as the runtime version. If we later add EAS Update OTA, only updates targeting the same runtime version (i.e., the same binary) will be served — preventing breaking native-incompatible JS from going to old binaries.

### Step 3: Verify the JSON parses

- [ ] Run: `python3 -m json.tool apps/mobile/app.json > /dev/null && echo OK`
- [ ] Expected: `OK`. If it errors, fix the syntax.

### Step 4: Commit

```bash
git add apps/mobile/app.json
git commit -m "$(cat <<'EOF'
feat(mobile): app.json — dark theme, Sentry plugin, runtimeVersion

userInterfaceStyle: "dark" — prevents iOS from inverting system UI
surfaces (modal backdrops, action sheets) on light-mode devices.

@sentry/react-native/expo plugin wires the native SDK during
prebuild so Sentry can capture native (Java / Swift) crashes,
not just JS errors. Configured with the same divechef org +
javascript-nextjs project as web.

runtimeVersion: appVersion policy makes us EAS-Update-ready —
future OTAs will target a specific binary version.

P4 task 7 of 8.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update `eas.json` + verify Android manifest

**Files:**
- Modify: `apps/mobile/eas.json`
- Verify (no edit unless gap): `apps/mobile/android/app/src/main/AndroidManifest.xml`

### Step 1: Replace `eas.json` contents

- [ ] Replace the entire file with:

```json
{
  "cli": {
    "version": ">= 5.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "http://localhost:3000",
        "EXPO_PUBLIC_SENTRY_ENVIRONMENT": "development"
      }
    },
    "production": {
      "autoIncrement": true,
      "ios": {
        "buildConfiguration": "Release",
        "distribution": "internal"
      },
      "android": {
        "buildType": "app-bundle"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://www.divechef.com",
        "EXPO_PUBLIC_SENTRY_ENVIRONMENT": "production"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "track": "internal"
      }
    }
  }
}
```

Notes:
- Drop `preview` profile entirely.
- `appVersionSource: "remote"` so EAS owns the build counter (paired with `autoIncrement: true`).
- `submit.production.android.track: "internal"` lets `eas submit --profile production --platform android` land on the Play Console internal track without a separate flag.

### Step 2: Verify Android BLE permissions

- [ ] Run:

```bash
grep -E "BLUETOOTH|bluetooth_le|ACCESS_FINE_LOCATION" apps/mobile/android/app/src/main/AndroidManifest.xml
```

- [ ] Expected output (order doesn't matter, but all lines should be present):

```
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
```

- [ ] **If any line is missing**, edit `apps/mobile/android/app/src/main/AndroidManifest.xml` and add the missing entries inside the `<manifest>` element, near the existing permission declarations. Stage the file.

### Step 3: Commit

- [ ] Run:

```bash
git add apps/mobile/eas.json apps/mobile/android/app/src/main/AndroidManifest.xml
git commit -m "$(cat <<'EOF'
feat(mobile): eas.json fixes + verified Android BLE permissions

eas.json:
- Drop the stale "preview" profile (no preview channel; production-only).
- Production env: EXPO_PUBLIC_API_URL points at the real production
  origin (https://www.divechef.com), not the old vercel.app placeholder.
- Production Android: buildType "app-bundle" so eas builds an AAB
  for Play Console (APK is for sideload only, not Play uploads).
- autoIncrement + appVersionSource "remote" so EAS bumps versionCode
  / buildNumber per build — no more "forgot to bump versionCode and
  Play rejects the AAB" footgun.
- submit.production.android.track "internal" so eas submit lands
  AABs on the Play Console internal track in one command.

AndroidManifest.xml verified to contain BLUETOOTH / BLUETOOTH_ADMIN /
BLUETOOTH_SCAN / BLUETOOTH_CONNECT / ACCESS_FINE_LOCATION permissions
+ bluetooth_le feature requirement. M1's native work wired these
correctly; this is defensive verification.

P4 task 8 of 8 — all foundation code in place.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Operator runbooks (docs only, no code)

Create two runbook docs the operator follows post-merge. Each runbook is plain markdown — no app changes.

**Files:**
- Create: `docs/superpowers/runbooks/play-console-first-submission.md`
- Create: `docs/superpowers/runbooks/ios-self-sideload.md`

### Step 1: Create `play-console-first-submission.md`

- [ ] Create `docs/superpowers/runbooks/play-console-first-submission.md`:

````markdown
# Play Console — first AAB submission

End-to-end runbook for shipping the first DiveChef AAB to Play Console internal testing.
Estimated time: 1 hour of operator clicking + 1-3 day Play Console first-app review wait.

## Prerequisites

- Google account (the one you'll use as Play Console owner).
- Credit/debit card for the $25 one-time Play Console developer fee.
- The latest mobile main commit merged with foundation code (P4 task 1-8).
- `npx eas-cli@latest --version` works locally.

## 1. Sign up for Play Console ($25 one-time)

1. Go to https://play.google.com/console
2. Sign in with the Google account you want to own the app.
3. Choose "Personal" account type (faster verification than "Organization" for solo devs).
4. Pay $25 with a credit card.
5. Verify email + phone if prompted.
6. Wait for approval — usually instant for personal accounts.

## 2. Register `com.divechef.app` as a new app

In Play Console → "Create app":

- App name: `DiveChef`
- Default language: `English (United States)` — en-US
- App or game: App
- Free or paid: Free
- Declarations:
  - "Developer Program Policies" — check
  - "US export laws" — check

After creation, the app dashboard appears. Now complete the required setup tasks listed under "Set up your app".

## 3. Required setup forms (before first AAB upload)

Play Console blocks AAB uploads until these are filled. Do them in this order:

### App access
- Choose "All functionality is available without special access" — true; the beta is invite-only at the Play Console level, not via in-app gating.

### Ads
- "Does your app contain ads?" → No

### Content rating
Click "Start questionnaire". Answer truthfully:
- Email: your support email
- Category: Reference, News, or Educational → choose **Reference, News, or Educational**
- Violence: No
- Sexual content: No
- Profanity: No
- Drugs/alcohol/tobacco: No
- User-generated content: No (other users can't see your dives)
- Functionality: Health & Fitness checkbox = optional (you can leave off; we're a logging tool not a medical device)
- Calculate rating

Result: IARC rating "Everyone" or "Everyone 10+" depending on questionnaire details.

### Target audience
- Target ages: 16+ (matches `/privacy`)
- Are children part of audience? → No

### News apps
- Is your app a news app? → No

### COVID-19 contact tracing
- No

### Data safety
This is the most detailed form. Mirror what `/privacy` says.
- Data collection: Yes
- Data types collected:
  - **Personal info → Email address** (account, beta waitlist) — Required, Used for account function + app communication
  - **Personal info → Name** (display name) — Optional, account function
  - **Personal info → Other** (certification level, locale) — Optional, app personalization
  - **App activity → App interactions** (dives logged) — Required, app functionality
  - **App activity → Other** (device serial number, dive computer model, BLE-advertised name, firmware version) — Required, app functionality
  - **App info and performance → Crash logs** (Sentry) — Required, analytics + bug fixing
  - **App info and performance → Diagnostics** (Sentry traces) — Required, analytics
- Data sharing: No (we don't share with third parties beyond Sentry/Vercel as processors)
- Data security:
  - Encrypted in transit: Yes
  - Users can request data deletion: Yes — via support email and in-app account deletion
  - Adheres to families policy: N/A (not targeting children)
  - Independent security review: No

### Government apps
- No

### Financial features
- No

### Health
- "Health" toggle → No (we're a logging tool, not regulated medical software)

### App category & contact details
- Category: Health & Fitness OR Sports → choose **Sports** (closer fit; Health & Fitness can imply medical device)
- Tags: scuba diving, dive log, fitness tracking
- Email: support@divechef.com (or your contact email until forwarding is set up)
- Phone: optional
- Website: https://www.divechef.com
- Privacy policy URL: https://www.divechef.com/privacy

### Store listing
- App name: DiveChef
- Short description (≤80 chars): `Personal dive intelligence. Sync your Shearwater. Score every dive.`
- Full description (≤4000 chars): copy from the landing hero + how-it-works + tier descriptions, expanded slightly for SEO
- App icon: 512×512 PNG (export from `apps/mobile/assets/icon.png` if it's already 1024×1024; otherwise replace with a real designed asset)
- Feature graphic: 1024×500 PNG (placeholder — solid `#0a1220` background with "DiveChef" wordmark in cyan/white). Tools: Figma, Canva, or use an online generator.
- Phone screenshots (2-8): Take 2-4 screenshots from your phone or simulator running the dev build. Hero screen + sync screen + dive detail are the natural picks.

## 4. Create a Google service account for `eas submit`

`eas submit` needs a service account JSON to upload AABs.

1. Go to https://console.cloud.google.com → select or create a Google Cloud project.
2. APIs & Services → Library → search "Google Play Android Developer API" → Enable.
3. IAM & Admin → Service Accounts → Create service account.
   - Name: `eas-play-submit`
   - Role: leave blank (we grant via Play Console, not Cloud IAM)
4. Click the new service account → Keys → Add Key → Create new key → JSON → Download.
5. **Save the JSON file securely** (e.g., `~/.config/divechef/eas-play-submit.json`). Do NOT commit it.

Now grant Play Console access to the service account:

1. Play Console → Setup → API access
2. "Link your Google Cloud project" → select the project from step 1 above.
3. Find your service account in the list → "Grant access".
4. Permissions: tick "Release manager" → save.

## 5. First-time AAB upload (manual via web UI for the very first version)

Play Console requires the FIRST version of a brand-new app to be uploaded via the web UI (not via the API / `eas submit`). After that, all subsequent versions can use `eas submit`.

1. Run locally:

```bash
cd apps/mobile
npx eas-cli build --profile production --platform android
```

This queues a build on EAS Build (free tier: ~15-30 min queue + build). When done, EAS prints a download URL for the AAB.

2. Download the AAB to your machine.

3. Play Console → Testing → Internal testing → Create new release.

4. Upload the AAB. Play Console may complain about missing pieces — go back and fill them in. Common gotchas:
   - "Designed for Tablet": optional
   - "Developer description" / release notes: write something like "Closed beta build 1. Initial submission for internal testing."

5. Save → Review release → Start rollout to Internal testing.

## 6. Configure internal tester list

1. Play Console → Testing → Internal testing → Testers.
2. "Create email list" → name it "DiveChef beta testers".
3. Add emails (your Google account email + 1-2 friends' emails).
4. Save the list and assign it to the internal testing track.
5. Copy the "Web URL" opt-in link.

## 7. Wait for first-app review

Brand-new apps undergo a one-time review even for internal testing. Usually 1-3 days. You'll get an email when approved.

## 8. Subsequent uploads via `eas submit`

After approval, future builds can submit programmatically:

1. Set the service account JSON path as an EAS secret (one-time):

```bash
cd apps/mobile
eas credentials  # interactive; or use:
# eas submit --profile production --platform android --service-account-key-path /absolute/path/to/eas-play-submit.json
```

2. Subsequent rolls:

```bash
cd apps/mobile
npx eas-cli build --profile production --platform android
npx eas-cli submit --profile production --platform android --latest
```

The `--latest` flag uploads the most recent build for that profile/platform.

## 9. Onboard testers

For each tester:
1. Add their Google account email to the tester list (Step 6).
2. Send them the opt-in URL via email/Telegram/whatever.
3. They click → opt in → install from Play Store with "Internal testing" badge.

## Verification (definition of "Play Console runbook done")

- [ ] You can install DiveChef on your phone via the Play Store internal-test link.
- [ ] You can sign up + log a fake dive in the app.
- [ ] At least one friend tester is on the list and has been able to opt in.

## Common errors

- **"Version code already used"**: Bump `versionCode` (autoIncrement should handle this; if it doesn't, manually bump in app.json).
- **"App bundle's signing key not registered with Play"**: First-time builds register a new key. If you've previously signed with a different key (e.g., during a Cloud Console mistake), you need to enroll Play App Signing — Play Console will prompt.
- **`eas submit` says "Forbidden"**: service account doesn't have Release manager permission yet. Re-check Step 4.
````

### Step 2: Create `ios-self-sideload.md`

- [ ] Create `docs/superpowers/runbooks/ios-self-sideload.md`:

````markdown
# iOS self-sideload via free Apple ID

How to install DiveChef on your iPhone for personal beta testing without the $99/year Apple Developer Program.

## Constraints (read first)

- The certificate Xcode auto-provisions for a free Apple ID expires every **7 days**. After expiry, the app refuses to launch — you reopen Xcode, hit ⌘R, and it re-signs.
- You can register up to **3 device IDs** per Apple ID for free signing. For self-only beta, fine.
- This path does NOT publish to TestFlight or App Store. Just to your physical iPhone.
- Anyone else who wants to test on iPhone needs you to enroll in Apple Developer Program ($99/year) → TestFlight.

## Prerequisites

- A Mac with Xcode 15+ installed (latest is best).
- Your iPhone, with a Lightning/USB-C cable.
- Your personal Apple ID (the one you use for App Store).
- The mobile foundation code merged to main (P4 tasks 1-8).

## 1. Add your Apple ID to Xcode

1. Open Xcode.
2. Xcode menu → Settings → Accounts.
3. Click "+" → Apple ID → sign in with your personal Apple ID.
4. After signing in, you'll see a "Personal Team" entry under your account.

## 2. Connect and trust your iPhone

1. Plug your iPhone into your Mac with USB.
2. On the phone: when prompted "Trust this computer?", tap Trust.
3. In Xcode: Window → Devices and Simulators → confirm your iPhone shows up under "Devices".
4. If your phone shows "Unavailable" with a yellow warning: usually means you need to wait for symbols to load (~1 min) or the iOS version is newer than Xcode supports (update Xcode if so).

## 3. Open the iOS workspace

```bash
cd /Users/<you>/path/to/diveForge/apps/mobile/ios
ls *.xcworkspace
```

You should see `DiveChef.xcworkspace` (or similar — the exact name comes from the Expo prebuild). **Open the workspace, not the xcodeproj** (the workspace pulls in the CocoaPods dependencies):

```bash
open DiveChef.xcworkspace
```

## 4. Configure signing

1. In Xcode's project navigator (left), click the top "DiveChef" node.
2. In the main pane, select the "DiveChef" target.
3. Click "Signing & Capabilities" tab.
4. Under "Signing":
   - Check "Automatically manage signing".
   - Team: choose your Personal Team.
   - Bundle Identifier should already be `com.divechef.app`. **Don't change it** unless you absolutely need to (changing it on a free Apple ID can cause provisioning conflicts).
5. Wait a few seconds. Xcode auto-provisions a development certificate. If it errors:
   - "Failed to register bundle identifier" → bundle ID is in use by another Apple ID's app. Workaround: change bundle ID temporarily to `com.divechef.app.<your-initials>` for self-test, but this means notifications/keychain don't carry over.
   - "Maximum number of free apps signed" (10 max per device) → revoke old apps in Xcode → Devices and Simulators.

## 5. Set the build destination

In Xcode's toolbar (top-left, next to play/stop):
- Click the device picker.
- Select your physical iPhone (not "Any iOS Device" or a simulator).

## 6. Build and run

- Press ⌘R (or click the Play button).
- First build: ~3-5 minutes. Subsequent builds: ~30 seconds.
- The app installs on your phone.

## 7. Trust the developer profile (one-time, on the phone)

The first time you launch DiveChef on your phone, iOS will refuse to open it ("Untrusted Developer"):

1. On your phone: Settings → General → VPN & Device Management.
2. Under "Developer App", you'll see your Apple ID.
3. Tap it → "Trust <your name>" → Trust.
4. Go back to the home screen → tap DiveChef.
5. App launches.

You only do this once per Apple ID per device.

## 8. Configure the API URL

Out of the box, the development build points at `http://localhost:3000` (per `eas.json` development profile). To test against production:

Option A: Run with production env locally (recommended for true beta testing):

1. In Xcode, edit Scheme: Product → Scheme → Edit Scheme.
2. Run → Arguments → Environment Variables.
3. Add `EXPO_PUBLIC_API_URL` = `https://www.divechef.com`.
4. Hit Close → ⌘R again.

Option B: Build via EAS development profile then sideload (requires the foundation EAS config from P4):

```bash
cd apps/mobile
npx eas-cli build --profile development --platform ios
```

EAS hands you an .ipa download URL. Drag the .ipa onto your connected device in Xcode → Devices → "Installed Apps" pane.

## 9. Re-sign cycle

Every 7 days, the cert expires. Symptoms: app refuses to launch ("Untrusted Developer" reappears, or just crashes silently).

To re-sign:
1. Plug your iPhone into your Mac.
2. Open Xcode → workspace from Step 3.
3. Hit ⌘R.

That's it. Cert renews automatically; takes ~30 seconds end-to-end if Xcode is already open.

If the cert renewal fails because Apple's auth changed (rare), the workaround is to:
1. Xcode → Settings → Accounts → click your Apple ID → Manage Certificates.
2. Right-click the expired "Apple Development" cert → Delete.
3. Click "+" → "Apple Development" → wait for issue.
4. ⌘R again.

## Verification (definition of "iOS sideload runbook done")

- [ ] DiveChef opens on your iPhone.
- [ ] You can sign up.
- [ ] You can pair your Shearwater dive computer (BLE permission prompt appears).
- [ ] A test sync completes successfully against `https://www.divechef.com/api`.

## When you eventually enroll in Apple Developer Program

You'll graduate from this runbook to the standard TestFlight pipeline:
1. Add `submit.production.ios` config to `eas.json`.
2. Generate an App Store Connect API key.
3. Run `eas build --profile production --platform ios && eas submit --profile production --platform ios`.
4. Configure TestFlight internal/external testers.

That's a separate runbook for the future.
````

### Step 3: Commit

```bash
git add docs/superpowers/runbooks/play-console-first-submission.md docs/superpowers/runbooks/ios-self-sideload.md
git commit -m "$(cat <<'EOF'
docs(p4): operator runbooks for Play Console + iOS sideload

Two end-to-end runbooks the operator runs after the foundation code
merges:

play-console-first-submission.md walks through Play Console signup
($25 one-time), required setup forms (privacy/data-safety/content-
rating/store-listing), Google service account for eas submit,
first-time manual AAB upload via web UI, internal tester list +
opt-in URL, then the eas submit pipeline for subsequent builds.

ios-self-sideload.md walks through Xcode + free Apple ID setup,
Personal Team signing, device trust, the 7-day re-sign cycle, and
how to point the dev build at the production API URL via Xcode
scheme environment variables.

Each runbook ends with concrete verification criteria.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Open the PR

After all 9 commits land on the feature branch:

### Step 1: Push the branch

- [ ] Run:

```bash
git push -u origin <feature-branch>
```

### Step 2: Open PR

Use the GitHub URL printed by `git push` (since `gh pr create` had auth issues last time):

`https://github.com/mzmmoazam/divechef/pull/new/<feature-branch>`

Title: `feat(mobile): P4 foundation — shared scrubber + Sentry RN + EAS profile fixes`

Body:

```markdown
## Summary

- Move sentry-scrub from apps/web to packages/shared so web + mobile share one source of truth for what's PII.
- Install @sentry/react-native, wire Sentry.init at the top of App.tsx, wrap App with Sentry.wrap for component-tree error boundary.
- Mock @sentry/react-native in jest.setup so unit tests don't try to reach the native bridge.
- Update app.json: dark theme, Sentry plugin, runtimeVersion (EAS Update ready).
- Update eas.json: drop stale "preview" profile, fix production EXPO_PUBLIC_API_URL to https://www.divechef.com, AAB for Android, autoIncrement, submit.production.android.track="internal".
- Verify Android BLE permissions in AndroidManifest.xml.
- Two operator runbooks (Play Console + iOS sideload) for post-merge external work.

## Test plan

- [ ] All web tests pass after scrubber move (`pnpm --filter @divechef/web test`)
- [ ] All mobile tests pass after Sentry mock (`pnpm --filter @divechef/mobile test`)
- [ ] Web production build succeeds (`pnpm --filter @divechef/web build`)
- [ ] Vercel preview deploy is green
- [ ] Vercel preview build log shows source maps uploading cleanly to Sentry release
- [ ] After merge: operator runs the Play Console runbook → first AAB lands on internal track
- [ ] After merge: operator runs the iOS sideload runbook → app installs on personal iPhone

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### Step 3: Verify on PR's Vercel preview

The preview deploy will use the existing prod DB (Hobby plan caveat — preview branching is enabled but this PR doesn't change schema, so the preview branch starts identical to prod). Confirm:

- [ ] `/` loads with the dark theme.
- [ ] `/privacy`, `/terms`, `/support` render.
- [ ] Build log mentions `[@sentry/nextjs] Successfully uploaded source maps to Sentry`.
- [ ] No new typecheck errors in the build log.

If anything's off, fix on the branch and push again.

### Step 4: Merge

- [ ] Squash and merge the PR.
- [ ] Locally: `git checkout main && git pull`.
- [ ] Production deploy auto-triggers from the merge commit.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| `packages/shared/src/sentry-scrub.ts` move | Task 1 |
| Update web Sentry config import paths | Task 2 |
| Install `@sentry/react-native` | Task 3 |
| `apps/mobile/src/sentry/init.ts` | Task 4 |
| `App.tsx` wire-up + `Sentry.wrap` | Task 5 |
| `jest.setup.ts` mock | Task 6 |
| `app.json` updates (dark, plugin, runtimeVersion) | Task 7 |
| `eas.json` updates (drop preview, prod URL, AAB, autoIncrement, submit track) | Task 8 |
| Android BLE permissions verification | Task 8 |
| Play Console operator runbook | Task 9 |
| iOS sideload operator runbook | Task 9 |
| PR + verification | Task 10 |

All spec items covered.

**2. Placeholder scan:** No "TBD"s. Each task has exact code or commands. The runbooks reference operator-supplied values (your Google account email, your Apple ID) but those are by definition operator inputs, not placeholders for the implementer.

**3. Type consistency:**

- `scrubSensitiveData<T extends ErrorEvent>` signature unchanged from P3.
- Sentry env var names are consistent: `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_ENVIRONMENT` (mobile, baked at build time) vs `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_*` (web, runtime per env).
- `apps/mobile/src/sentry/init.ts` exports nothing (side-effect import); `App.tsx` imports it as `import './src/sentry/init'`.
- `Sentry.wrap` is a default export from `@sentry/react-native`'s namespace import.

---

## Execution notes

- **One feature branch, 9 commits + PR.** No worktrees needed (single sequential dev work).
- **No dependency on prior P-series work being merged** — P3 is in production, this builds on it.
- **Estimated time:** ~2-3 hours of focused dev for tasks 1-10. Then operator runs the runbooks separately.
- **Subagent-driven execution** is appropriate. Tasks 1-2 (scrubber move + import update) can land in one dispatch; tasks 3-6 (Sentry RN install + init + App wire-up + jest mock) in another; tasks 7-8 (config files + manifest verify) in another; task 9 (runbooks) standalone; task 10 (PR + verification) operator.
