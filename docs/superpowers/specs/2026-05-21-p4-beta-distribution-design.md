# P4 — Mobile beta distribution

**Date:** 2026-05-21
**Status:** Design — awaiting user review.
**Scope:** Ship the mobile app to a closed beta of 1-3 users (you + maybe 1-2 friends). Android via Play Console internal testing track; iOS via free Apple ID self-sideload only.

## Goals

1. Build production-quality release artifacts for both platforms via EAS.
2. Capture mobile crashes and errors in Sentry (same project + scrubber as web).
3. Distribute Android builds to a closed group via Play Console internal testing — opt-in URL, no review, fast iteration.
4. Build iOS for self-only sideload via free Apple ID. iOS friend-tester support deferred until Apple Developer Program enrollment.
5. Reuse the production API at `https://www.divechef.com/api/*` from production mobile builds.

## Non-goals (deliberately out of scope)

- Apple Developer Program enrollment + TestFlight (deferred — user opted out of $99/year for now).
- Open testing or external testing tracks on Play Console (more visible, requires review).
- Automated invite flow from waitlist → tester list (manual triage is fine for 1-3 people).
- CI/CD for mobile builds (manual `eas build` is sufficient at this scale).
- Per-PR mobile preview builds (out of scope; preview EAS profile being removed).
- App-store-ready marketing assets (screenshots, feature graphic, video) — Play Console requires a minimal set; we ship the minimum viable.

## What's already in place

- Bare workflow Expo app at `apps/mobile/`, SDK 54, RN 0.81.5, React 19.1.
- Bundle ID: `com.divechef.app` (matches both `ios/` Xcode project and `android/app/build.gradle`).
- App version `1.0.0` in `app.json`.
- BLE entitlements wired in iOS Info.plist via `app.json > expo.ios.infoPlist`.
- Expo SDK plugins for `expo-secure-store`, `expo-sqlite`, `expo-localization`, etc. — already configured.
- API client at `apps/mobile/src/services/api.ts` reads `process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'`.
- 92 mobile tests passing.
- `apps/web/src/lib/sentry-scrub.ts` exists from P3 — needs to move to `packages/shared`.
- `apps/mobile/eas.json` exists with three profiles (`development`, `preview`, `production`); production env URL is **stale** (`https://divechef.vercel.app` — pre-domain), production iOS distribution is `internal` (will keep), production Android `buildType` is `apk` (must change to `app-bundle` for Play Console).

---

## Architecture

```
packages/shared/
 └ src/sentry-scrub.ts        ← moved from apps/web (refactor)

apps/web/
 ├ instrumentation.ts          (unchanged)
 ├ instrumentation-client.ts   ← updated import path: @divechef/shared
 ├ sentry.server.config.ts     ← updated import path
 └ sentry.edge.config.ts       ← updated import path

apps/mobile/
 ├ app.json                    ← MODIFIED: userInterfaceStyle dark, plugins, runtimeVersion
 ├ eas.json                    ← MODIFIED: prod env URL, AAB, autoIncrement, drop preview profile
 ├ src/sentry/init.ts          ← NEW: Sentry.init with shared scrubber
 ├ App.tsx                     ← MODIFIED: import sentry/init at top, wrap with Sentry.wrap()
 ├ android/app/src/main/AndroidManifest.xml  ← VERIFY: BLUETOOTH_SCAN/CONNECT perms
 └ assets/icon.png + splash    ← REPLACE: 1024×1024 brand icon (operator)
```

Three sub-arcs that ship together:

**1. Foundation (code only, no external accounts):**
- Move scrubber → `packages/shared/src/sentry-scrub.ts`. Update web's three Sentry config files to import from there.
- Install `@sentry/react-native` + Expo build properties plugin. Add `apps/mobile/src/sentry/init.ts` that calls `Sentry.init({ dsn, environment, beforeSend: scrubSensitiveData })`.
- Wrap `App` export in `Sentry.wrap()` so React error boundaries capture component-tree errors.
- `app.json`: set `userInterfaceStyle: "dark"`, register `@sentry/react-native` plugin, set `runtimeVersion` (required for OTA updates if we add them later — set to `appVersion` policy now to be safe).
- `eas.json`: production profile env `EXPO_PUBLIC_API_URL=https://www.divechef.com`, Android `buildType: "app-bundle"`, top-level `cli.appVersionSource: "remote"`, production `autoIncrement: true`. Drop the `preview` profile entirely.
- Add `EXPO_PUBLIC_SENTRY_DSN` (build-time public) + `SENTRY_AUTH_TOKEN` (EAS secret) for source-map upload during EAS Build.

**2. Android distribution (Play Console internal testing track):**
- Operator: register `com.divechef.app` on Play Console, complete required setup forms (privacy policy URL, data safety, content rating, app icon, feature graphic).
- Run `eas build --profile production --platform android` → produces signed AAB.
- Run `eas submit --platform android` → uploads AAB to Play Console internal track via Google service account.
- Configure internal tester opt-in URL on Play Console; share with the 1-2 friend testers (each needs a Google account).
- Verify a tester can opt in, install from Play Store with "Internal testing" badge, sign up, sync a dive.

**3. iOS self-sideload (free Apple ID):**
- Operator: configure free Apple ID in Xcode → Personal Team signing.
- Run `eas build --profile development --platform ios --local` (or use EAS cloud build), download `.ipa`, install via Xcode → personal device.
- Document the 7-day re-sign cycle in the runbook.
- Acceptance: you can open the app on your iPhone and complete a sync.

---

## Foundation — file-by-file

### `packages/shared/src/sentry-scrub.ts` (NEW — moved from apps/web)

The current scrubber at `apps/web/src/lib/sentry-scrub.ts` imports `ErrorEvent` and `EventHint` from `@sentry/nextjs`. We move it to `packages/shared` with one minor change: import those types from `@sentry/core` (the core package both `@sentry/nextjs` and `@sentry/react-native` re-export from). This way the same module works for both runtimes.

Add `@sentry/core` as a peer/dev dep of `packages/shared` so the type imports resolve. The runtime types are identical across `nextjs` and `react-native`.

The scrubber's body is unchanged — same `SENSITIVE_KEYS`, same recursive `scrubObject`, same immutability guarantees. Tests move with it (currently `apps/web/src/lib/__tests__/sentry-scrub.test.ts` — relocate to `packages/shared/src/__tests__/sentry-scrub.test.ts`).

`packages/shared/src/index.ts` re-exports `scrubSensitiveData` so consumers import it as `from '@divechef/shared'`.

### `apps/web/instrumentation-client.ts`, `apps/web/sentry.server.config.ts`, `apps/web/sentry.edge.config.ts` (MODIFY)

Replace the existing import:

```ts
import { scrubSensitiveData } from './src/lib/sentry-scrub';
```

With:

```ts
import { scrubSensitiveData } from '@divechef/shared';
```

Three one-line changes. Web tests still pass; behavior unchanged.

### `apps/mobile/src/sentry/init.ts` (NEW)

```ts
import * as Sentry from '@sentry/react-native';
import { scrubSensitiveData } from '@divechef/shared';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',
  tracesSampleRate: 0.1,
  beforeSend: scrubSensitiveData,
  // RN-specific: don't print Sentry's own breadcrumbs to console in production
  debug: __DEV__,
});
```

### `apps/mobile/App.tsx` (MODIFY)

At the very top, **before any other imports**, add:

```ts
import './src/sentry/init';
```

Wrap the existing default export:

```ts
import * as Sentry from '@sentry/react-native';
// ... existing imports

function App() {
  // ... existing component body
}

export default Sentry.wrap(App);
```

`Sentry.wrap` adds an error boundary at the root of the React tree so component-tree crashes are captured instead of just bubbling up to a white screen.

### `apps/mobile/app.json` (MODIFY)

Three changes:
1. `userInterfaceStyle: "light"` → `"dark"` (we're a dark app; this prevents iOS system UI surfaces from inverting).
2. Add `@sentry/react-native` to `expo.plugins`. Without the plugin, Sentry's native bridge isn't wired and crashes from the native layer (not JS) won't be captured.
3. Add `runtimeVersion: { policy: "appVersion" }` so future OTA updates (if we add them later) are tied to the binary version.

Resulting plugin block (illustrative):
```json
"plugins": [
  ["@sentry/react-native/expo", {
    "url": "https://sentry.io/",
    "project": "javascript-nextjs",
    "organization": "divechef"
  }]
]
```

(Exact plugin name/options depend on the installed version; the implementer follows current `@sentry/react-native` docs at install time.)

### `apps/mobile/eas.json` (MODIFY)

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

Notable changes from current:
- **Drop `preview` profile** entirely (we agreed: production-only).
- **Production env**: real API URL + Sentry environment tag.
- **`autoIncrement: true`** so EAS bumps `versionCode` (Android) and `buildNumber` (iOS) per build.
- **`appVersionSource: "remote"`** so EAS owns the build counter (otherwise app.json must be hand-bumped, contradicting autoIncrement).
- **`buildType: "app-bundle"`** for Android — Play Console requires AAB.
- **`submit.production.android.track: "internal"`** — `eas submit` lands the AAB on the internal track without a separate manual step.
- iOS production `distribution: "internal"` retained for future use; we don't actually run iOS production builds in this scope.

### `apps/mobile/package.json` (MODIFY)

Add dependencies:
- `@sentry/react-native` (the SDK)
- (peer/transitive dep) `@sentry/core` — included automatically

Run via `pnpm --filter @divechef/mobile add @sentry/react-native` so versions resolve cleanly with the rest of the workspace.

### `packages/shared/package.json` (MODIFY)

Add `@sentry/core` as a `peerDependency` (so consumers bring their own runtime — web brings `@sentry/nextjs` which re-exports core types; mobile brings `@sentry/react-native` which does the same).

### `apps/mobile/android/app/src/main/AndroidManifest.xml` (VERIFY)

The implementer reads the file and confirms these `<uses-permission>` declarations are present:

```xml
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
```

If anything is missing, add it. (M1 should have wired this when the native `ShearwaterPetrelManager.kt` was added; verifying defensively.)

---

## EAS Secrets (operator action, not in code)

Set these once via `eas secret:create --scope project`:

| Secret | Source | Used for |
|---|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry → divechef → javascript-nextjs project DSN | Runtime: read by `instrumentation-client.ts`-equivalent on mobile |
| `SENTRY_AUTH_TOKEN` | Sentry → org → Organization Tokens → "vercel-builds" or new "eas-builds" token, scope `org:ci` | Build-time: source-map upload from EAS Build to Sentry |
| `SENTRY_ORG` | `divechef` (constant) | Build-time |
| `SENTRY_PROJECT` | `javascript-nextjs` (constant; trim whitespace!) | Build-time |

`EXPO_PUBLIC_*` vars are baked into the JS bundle at build time and are visible to anyone with the .ipa/.aab. The DSN is meant to be public per Sentry's design. Don't put the auth token in an `EXPO_PUBLIC_*` var — keep it as a regular EAS secret used only at build time.

---

## Android distribution — Play Console setup (operator runbook)

The full sequence the operator follows, summarized as a runbook (drafted in detail in the implementation plan):

1. **Sign up for Google Play Console** — $25 one-time, requires verified Google account + payment + a few business questions.
2. **Create a new app:** name "DiveChef", default language English, app/game = App, free, package name `com.divechef.app`.
3. **Complete required forms before first AAB upload** — Play Console enforces these:
   - Privacy policy URL: `https://www.divechef.com/privacy`
   - Data safety form: declare what we collect (email, password hash, dive data, device serial, optional friendlyName, BLE-advertised name, firmware version, crash reports). Mirror `/privacy` page wording.
   - Content rating questionnaire: answer "no violence, no gambling, no user-generated content visible to others" → IARC rating "Everyone".
   - Target audience: 16+ (matches `/privacy`). Declare we don't target children.
   - Ads declaration: "No ads".
   - Government apps declaration: "No".
   - Health apps declaration: "No" (we're a logging tool, not a medical device).
4. **App icon + feature graphic**:
   - Icon: 512×512 PNG (will be generated from existing `assets/icon.png` if it's already 1024×1024, otherwise replace).
   - Feature graphic: 1024×500 PNG (placeholder — solid `#0a1220` with "DiveChef" wordmark; can replace later).
   - At least 2 phone screenshots (320–3840px wide). Take from a tester device or from the iOS simulator running the dev build.
5. **Create a Google service account** (Cloud Console → IAM → service accounts) with the "Service Account User" role. Download the JSON key. This is what `eas submit` uses to upload AABs.
6. **In Play Console** → API access → Link the Cloud project → Grant the service account "Release manager" permissions.
7. **Configure internal testing track**: create a tester list (your Google account email + 1-2 friends' Google account emails); copy the opt-in URL.
8. **First-build sequence** (executed by the implementer):
   - `eas build --profile production --platform android` → ~15-30 min queue + build.
   - On success: `eas submit --profile production --platform android` → uploads AAB to internal track.
   - Review takes a few hours to ~2 days for a brand-new app.
   - Once approved: testers click the opt-in URL → opt in → install from Play Store.

**Note:** The first build for a new app on Play Console can be slow because Google does a one-time review. Subsequent updates to the same internal track are instant.

---

## iOS sideload — self-only setup

For self-test on your personal iPhone via Xcode + free Apple ID:

1. **Add a free Apple ID to Xcode:** Xcode → Settings → Accounts → Add Apple ID. Sign in with your personal Apple ID. Xcode auto-creates a "Personal Team" certificate.
2. **Connect your iPhone to your Mac via USB.** First connection: trust the computer on the phone.
3. **Open the iOS project** at `apps/mobile/ios/DiveChef.xcworkspace` (workspace, not project — it's a CocoaPods setup).
4. **Set the team:** target DiveChef → Signing & Capabilities → Team = your Personal Team. Xcode will auto-provision a development certificate.
5. **Set the device** as the build destination in Xcode.
6. **Build and run** (⌘R) — Xcode signs, installs, and launches on your phone.
7. **First launch on phone**: iOS will block the unsigned-by-recognized-publisher app. Open Settings → General → VPN & Device Management → trust your developer profile.

Re-sign cycle: every 7 days, the development cert expires and the app refuses to launch. To re-sign: ⌘R in Xcode again. Cert renews automatically. Total time: ~30 seconds when the project is already open.

For ad-hoc builds via EAS (no local Xcode invocation), `eas build --profile development --platform ios` produces a `.ipa` you can install via Xcode → Devices → drag-and-drop, or via Apple Configurator. Same 7-day cert limit.

We do not run `eas build --profile production --platform ios` in this scope (no TestFlight to submit to).

---

## Invite flow

For v1 we keep this manual. Workflow per friend tester:

1. You receive a waitlist signup notification (or check Prisma Studio occasionally).
2. You decide who to invite, ask them for their Google account email (the one they'll use on their Android device).
3. Add their email to the Play Console internal tester list.
4. Send them the opt-in URL via email/Telegram/whatever.
5. They click → opt in → install from Play Store.

No code changes needed. The waitlist + manual triage covers it. If/when we have >10 testers and this gets tedious, we'll automate. Out of scope for now.

---

## Verification (definition of "P4 is done")

The implementer or operator confirms each of these:

1. ✅ Web tests still pass after scrubber move (`pnpm --filter @divechef/web test`).
2. ✅ Mobile tests still pass after Sentry SDK install (`pnpm --filter @divechef/mobile test`).
3. ✅ A trial production-profile build completes via `eas build --profile production --platform android` and produces a signed AAB.
4. ✅ The AAB submits to Play Console internal track via `eas submit` without errors.
5. ✅ You can opt in via the internal tester URL on your own Google account, install from Play Store, sign up in the app, and submit a fake dive.
6. ✅ A controlled crash (we add a temporary "Throw test error" button on a hidden screen, then delete it) produces a Sentry event tagged `environment: production`, `release: <git SHA>`, with a non-minified stack trace, no IP, and any sensitive request fields scrubbed to `[scrubbed]`.
7. ✅ iOS sideload via Xcode + free Apple ID: app launches on your iPhone, you can sign up + sync a dive.

---

## Open items — flagged, not in scope

1. **TestFlight / iOS friend testing**: deferred until Apple Developer Program enrollment ($99/year). When enrolled, we'll:
   - Add `eas.json submit.production.ios` config + an Apple service-account-equivalent app-store-connect API key.
   - Run `eas build --profile production --platform ios` + `eas submit`.
   - Configure TestFlight internal/external testers.
2. **App icons / OG / feature graphic** are placeholders. Real designed assets when available.
3. **Auto-invite from waitlist**: if/when we cross ~10 testers, build a small admin endpoint that auto-adds approved emails to Play Console via the Play Developer API.
4. **Mobile OTA updates** via EAS Update: not enabled. `runtimeVersion` policy in app.json is set so we can flip this on later without code changes.
5. **Crash reporting on Android JVM-level crashes**: `@sentry/react-native` covers JS + native iOS. Confirm the Android native crash path during verification (the SDK does it by default but it's worth a one-time test).
6. **App Store screenshots / store listing copy**: when iOS goes to TestFlight/App Store, we'll need 6.5" iPhone + 12.9" iPad screenshots, store description, keywords. Out of scope for sideload.
7. **EAS Build free tier (30 builds/month)**: should be plenty at our shipping cadence. If we hit the limit, EAS Pro is $99/month — switch only when needed.

---

## Risks

- **Play Console first-app review delay**: brand-new apps on the internal track can take 1-3 days to receive their first review. After approval, internal-track updates are instant. Plan for delay on the first ship; not blocking after that.
- **`@sentry/react-native` + Expo SDK 54 + new arch compatibility**: the new architecture is bleeding edge. Verify `@sentry/react-native` supports Fabric/TurboModules in the version we install. Mitigation: check release notes, fall back to a legacy version if necessary, or temporarily disable `newArchEnabled` if blockers surface.
- **Friend testers without Google accounts**: confirm before promising builds.
- **iOS 7-day re-sign**: not a problem for self-only, just an annoyance.
- **First production AAB build with a stale `EXPO_PUBLIC_API_URL`**: easy to forget the env update before kicking the build. Mitigated by the `eas.json` change in this spec — the URL is now baked into the production profile.

---

## Self-review

**Spec coverage:** All 4 stated goals (foundation, Sentry, Android, iOS) have concrete sub-sections with file paths or operator runbooks. The 23 cases I considered earlier (BLE perms, AAB vs APK, manifest verification, scrubber sharing, versioning) are all addressed.

**Scope check:** Single coherent "ship the mobile beta" arc. Foundation + Android + iOS are tightly coupled — splitting them into separate plans would mean re-doing the EAS profile work twice. Keep as one spec, one plan.

**Internal consistency:** Scrubber move is consumed identically by web and mobile (`from '@divechef/shared'`). Sentry env tag (`production` vs `development`) is consistent across `EXPO_PUBLIC_SENTRY_ENVIRONMENT` and `vercel-build.sh`. EAS profile env URL matches the actual production domain.

**Placeholder scan:** No "TBD"s. The few placeholders that remain (app icon, feature graphic) are explicit operator deliverables flagged as "minimum viable for first submission, replace later" — not unknowns.

**Ambiguity check:**
- "Self-only" for iOS = your iPhone, sideloaded via Xcode. Not 1-2 friend iPhones.
- "Production" mobile profile = the only profile that builds artifacts going to a tester device. `development` profile is for local dev clients only.
- "Verification" criteria are concrete (real signup, real Sentry event, etc.) — not "looks good".

---

## Execution notes

- One PR for the foundation code changes (scrubber move, Sentry mobile, app.json, eas.json).
- Operator parallel work (Play Console signup, app registration, runbook prep) can happen while the code PR is in review.
- Once code is on main + first AAB is built, operator submits to Play Console internal track.
- iOS sideload setup can happen any time — independent of the PR.
- Total plan execution: ~2-3 hours of dev work + ~1-2 hours of operator clicking + 1-3 day Play Console review wait for the first ship.
