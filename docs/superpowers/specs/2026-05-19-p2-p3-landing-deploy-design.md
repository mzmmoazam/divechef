# P2 + P3 — Marketing landing + Vercel/Neon deploy hardening

**Date:** 2026-05-19
**Status:** Design — awaiting user review before plan.
**Scope:** Two related sub-projects in one spec because they ship to the same Vercel project (`brevcut/divechef`, Hobby plan). Implementation can split into two plans (one per phase) or land as one.

---

## Goals

**P2 — marketing surface:** Public landing + legal pages on `https://www.divechef.com/`, hosted from the existing `apps/web` Next.js project. Email-capture beta waitlist. App-store-submission-ready privacy + terms.

**P3 — deploy hardening:** Close real gaps in the existing Vercel/Neon setup so production deploys are safe to merge: production migrations actually run, Sentry captures client + edge errors and scrubs sensitive data, environment variables match what `apps/web` actually reads.

**Non-goals (deliberately out of scope):**
- Object storage (dive bytes are parsed inline by `parseDiveBytes`, never persisted).
- Custom analytics / cookie banner (no analytics in v1).
- Email infrastructure for `support@divechef.com` (set up via Cloudflare Email Routing separately — flagged in §Open items).
- Rate limiting (beta is closed, low abuse risk; revisit before public launch).
- Vercel Postgres branching for previews (Pro-only feature; chose the lower-cost path).
- Status page, uptime monitoring beyond Sentry.

---

## What's already done — do not redo

| Item | Status |
|---|---|
| Vercel project `brevcut/divechef` (Hobby plan) | ✅ Created May 10, 2026 |
| Vercel ↔ GitHub auto-deploy on push | ✅ Working |
| `apps/web/vercel.json` build command (Prisma generate + Next build) | ✅ |
| `DATABASE_URL` env var (Neon-attached, Production + Preview) | ✅ |
| `NEXTAUTH_SECRET` env var (Production + Preview) | ✅ |
| Domain `www.divechef.com` (apex) | ✅ Per user statement |
| `apps/web/sentry.server.config.ts` (DSN-driven server-side init) | ✅ |
| Existing API routes (`/api/auth`, `/api/dives`, `/api/devices`, `/api/me`, `/api/trends`) | ✅ |

---

## Architecture

**One Next.js project, two surfaces:**

```
apps/web/
├── src/app/
│   ├── layout.tsx                ← NEW: brand chrome, dark theme, Inter font
│   ├── page.tsx                  ← NEW: landing
│   ├── privacy/page.tsx          ← NEW
│   ├── terms/page.tsx            ← NEW
│   ├── support/page.tsx          ← NEW
│   ├── globals.css               ← NEW: Tailwind v4 base, brand tokens
│   └── api/
│       ├── waitlist/route.ts     ← NEW: POST email → DB
│       └── (existing routes)     ← unchanged
├── prisma/
│   └── schema.prisma             ← MODIFY: add Waitlist model
├── public/
│   ├── robots.txt                ← NEW
│   ├── sitemap.xml               ← NEW (static for v1)
│   ├── favicon.ico               ← NEW (replace Next.js default)
│   └── og.png                    ← NEW: OG image, 1200×630
├── sentry.client.config.ts       ← NEW
├── sentry.edge.config.ts         ← NEW
├── sentry.server.config.ts       ← MODIFY: scrubber + env tag
├── next.config.ts                ← MODIFY: wrap with withSentryConfig
├── scripts/vercel-build.sh       ← NEW: production-only `prisma migrate deploy`
├── vercel.json                   ← MODIFY: call vercel-build.sh
└── tailwind.config.ts            ← NEW: mirror Deep Ocean tokens
```

**Single domain (`www.divechef.com`):**
- `/` — landing
- `/privacy`, `/terms`, `/support` — legal/info
- `/api/*` — JSON API (mobile app's `EXPO_PUBLIC_API_URL` points at the same origin)

**Cross-cutting:**
- Brand: Deep Ocean Modern (dark-only). Web Tailwind config mirrors `apps/mobile/src/theme/tokens.ts` colors + spacing + radii.
- Type: Inter (body) + JetBrains Mono / SF Mono fallback (numerics) — same as mobile.
- No light-mode toggle. No theme switcher.

---

## P2 — Marketing pages

### `/` — landing

Single-page scroll, server-rendered, no client JS except the form.

**Sections (top to bottom):**

1. **Top nav** — logo + "Beta access" anchor link to the form section. Sticky.
2. **Hero** — display headline + body + CTA + caption.
3. **How it works** — three numbered steps: pair via BLE, sync new dives, get clarity score.
4. **Verification tiers** — four cards using the same `VerificationBadge`-style chip vocabulary as mobile (Verified / Compatible / Experimental / Out-of-scope). Lists which model goes in each tier. Petrel 1 / Nerd 1 explicitly called out as out-of-scope, with one-line redirect to Subsurface.
5. **Beta invite form** — email + optional note ("which dive computer do you have?"). Posts to `/api/waitlist`.
6. **Footer** — © year, links to /privacy, /terms, /support.

**Copy guidance (final copy drafted in implementation):**
- Headline: "Personal dive intelligence for Shearwater divers."
- Subhead: One sentence explaining what we do (sync dives, score them, honest verification stance).
- CTA: "Get a beta invite →"
- Caption under CTA: "Closed beta · iOS + Android · French / English"
- Tone: technical, honest, direct. No marketing fluff. Mirrors the four-tier verification stance — don't overclaim.

**Form (`/api/waitlist`):**
- Method: POST, JSON body `{ email: string, note?: string }`.
- Validation: email shape (regex), email length ≤ 320 chars, note length ≤ 500 chars.
- Idempotent on email: if the address already exists, return 200 with the existing row (don't error). Same UX whether or not you've signed up before.
- Success state: replace the form with "Thanks — we'll be in touch."
- Error state: inline red text under the field; Sentry breadcrumb on submit, full event on 500.
- No CSRF token — same-origin POST with `Content-Type: application/json` is sufficient (browsers preflight cross-origin JSON POSTs).
- No rate limiting in v1 (closed beta; flagged for post-launch).
- No captcha / honeypot in v1 (same reason).

**Prisma model addition:**
```prisma
model Waitlist {
  id        String   @id @default(cuid())
  email     String   @unique
  note      String?
  createdAt DateTime @default(now())
}
```

Manual workflow: I view the list via Prisma Studio (or a future minimal admin endpoint), invite testers via TestFlight / Play Console out-of-band, no auto-invite logic in v1.

### `/privacy`

Drafted from the actual data flow. Sections:

- **What we collect:**
  - Waitlist: email + optional note + timestamp.
  - Account: email, password hash (bcrypt), display name, certification level (`niveau`), locale.
  - Devices: model, serial number (hex-encoded RDBI bytes), friendly name, BLE-advertised name, firmware version, registration timestamp, last-sync timestamp.
  - Dives: max depth, duration, samples (depth/time pairs), max ascent rate, water temperature, dive computer's externalId.
  - Crash data (Sentry): error type, stack trace, request URL + method + status. **IP addresses and request bodies are scrubbed** — see §P3 for the `beforeSend` filter.
- **What we don't collect:** location coordinates, advertising IDs, browser cookies, third-party analytics. No cross-site tracking.
- **How we use it:** sync your dives to your account; score them; show trends; send beta invites; debug crashes. Nothing else. No selling, no sharing.
- **Where it lives:** Neon Postgres in EU region (`fra1`); Sentry's standard EU project. Backups handled by Vercel/Neon.
- **Your rights (GDPR):**
  - Export — manual via support email for v1; programmatic later.
  - Delete — `DELETE /api/me` (cascades to dives + devices); waitlist removal via support email.
  - Correct — change email/display name/niveau via in-app profile.
- **Children:** intended for users 16+. We don't knowingly collect data from anyone younger.
- **Contact:** support@divechef.com.
- **Last updated:** date stamp (set at deploy time).

### `/terms`

- **What DiveChef is:** a dive logging + feedback tool. Reads dive data from supported computers; scores each dive against FFESSM/MN90 norms; surfaces insights.
- **What it isn't:** a dive computer. Does not replace your training, your buddy, or your computer's alarms. **Do not dive based on what DiveChef says.**
- **Verification tiers (Verified / Compatible / Experimental / Out-of-scope):** explicit four-tier framework — same vocabulary as the app. We tell you what we've actually tested.
- **Beta status:** v1 is invite-only beta. Things will break. We may delete data, change schemas, push fixes that require re-sync. Email us before relying on anything.
- **Account suspension:** abusive conduct → account closed. No charge during beta.
- **Liability:** to the maximum extent permitted by law, DiveChef has no liability for diving incidents. Read your computer; trust your training.
- **Governing law:** **France**. Disputes go to French courts.
- **Changes:** we'll update this page and email you if anything material changes.
- **Last updated:** date stamp.

### `/support`

Single short page:
- "Email us at support@divechef.com — we reply within a few days during beta."
- FAQ stubs (4 entries): "How do I add my dive computer?", "What if my model isn't listed?" (links the in-app sheet copy), "I lost my dives — what now?", "How do I delete my account?".
- Footer link back to `/`.

### Tailwind brand config

`apps/web/tailwind.config.ts` exports a `theme.extend` mirroring `apps/mobile/src/theme/tokens.ts`:

| Mobile token | Tailwind utility | Value |
|---|---|---|
| `tokens.color.bgBase` | `bg-base` | `#0a1220` |
| `tokens.color.bgElev` | `bg-elev` | `#0f1d33` |
| `tokens.color.bgDeep` | `bg-deep` | `#103952` |
| `tokens.color.accent` | `accent` | `#22d3ee` |
| `tokens.color.accent2` | `accent-2` | `#a5f3fc` |
| `tokens.color.text` | `text` | `#f0f9ff` |
| `tokens.color.text2` | `text-2` | `#94a3b8` |
| `tokens.color.text3` | `text-3` | `#64748b` |
| `tokens.color.borderSubtle` | `border-subtle` | `rgba(255,255,255,0.08)` |
| `tokens.color.success` | `success` | `#22c55e` |
| `tokens.color.warning` | `warning` | `#facc15` |
| `tokens.color.danger` | `danger` | `#ef4444` |
| `tokens.radius.card` | `rounded-card` | `12px` |
| `tokens.radius.hero` | `rounded-hero` | `16px` |
| `tokens.radius.pill` | `rounded-pill` | `9999px` |

Spacing 1–12 maps to a `space` extension on the same scale (4, 8, 12, 16, 24, 32, 48 px).

`globals.css` sets `body { background: var(--color-base); color: var(--color-text); font-family: 'Inter', system-ui, sans-serif; }` and disables system light-mode override (`color-scheme: dark only`).

### SEO + social

- `apps/web/public/robots.txt` — allows all crawlers (closed beta, but landing copy is fine to index).
- `apps/web/public/sitemap.xml` — static list of `/`, `/privacy`, `/terms`, `/support`. Generated at build time so it picks up correct timestamps.
- Per-page `<head>` metadata via Next.js `Metadata` API: title, description, OG image (`/og.png`, 1200×630, dark hero render), Twitter card.
- Favicon: replace Next.js default `apps/web/public/favicon.ico` with a small DiveChef mark. Provide `.ico`, 16×16 + 32×32 + 48×48.

---

## P3 — Deploy hardening

### What's missing in the current Vercel state

1. **Migrations don't run on production deploys.** `vercel.json` calls `prisma generate` but never `prisma migrate deploy`. Schema changes shipped post-May-10 (Device normalization, etc.) **are not applied to production DB**. This is the largest hidden bug.
2. **Sentry is half-wired.** Server-side errors captured (`sentry.server.config.ts`), but client and edge runtimes are not. Source-map upload is not configured. Sensitive data (IPs, signup passwords) is not scrubbed.
3. **Missing env vars:** `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_ENVIRONMENT`, `NEXTAUTH_URL`.

### Build command — production-only migrations

`apps/web/scripts/vercel-build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @divechef/shared build
pnpm --filter @divechef/web exec prisma generate

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "VERCEL_ENV=production — running migrations"
  pnpm --filter @divechef/web db:deploy
else
  echo "VERCEL_ENV=${VERCEL_ENV:-unset} — skipping migrations"
fi

pnpm --filter @divechef/web exec next build
```

Make it executable (`chmod +x`). Update `apps/web/vercel.json`:

```json
{
  "buildCommand": "bash scripts/vercel-build.sh",
  "installCommand": "pnpm install",
  "framework": "nextjs"
}
```

The script's `set -euo pipefail` means any failure (including a real migration failure on production) exits non-zero and Vercel marks the deploy as failed. The previous shell-OR-fallback pattern (which silently swallowed failures) is replaced by an explicit if/else.

**Preview deploy behavior:** `VERCEL_ENV=preview` skips `db:deploy`, so previews share the production DB schema as it stands. If a preview depends on a schema not yet in production, the preview will 500 on those routes — that's the agreed tradeoff (vs. paying for branched DBs).

### Sentry — complete the picture

**Add `apps/web/sentry.client.config.ts`:**

```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.SENTRY_ENVIRONMENT ?? "development",
});
```

**Add `apps/web/sentry.edge.config.ts`:** identical body, server-side env vars (no `NEXT_PUBLIC_` needed).

**Modify `apps/web/sentry.server.config.ts`** to add the scrubber and use `SENTRY_ENVIRONMENT`:

```ts
import * as Sentry from "@sentry/nextjs";

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "passwordHash",
  "token",
  "authorization",
  "cookie",
  "bytes",  // dive-data binary blob
]);

function scrubObject(obj: unknown): unknown {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(scrubObject);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? "[scrubbed]" : scrubObject(v);
  }
  return out;
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.SENTRY_ENVIRONMENT ?? "development",
  beforeSend(event) {
    // Strip user IP
    if (event.user) delete event.user.ip_address;
    if (event.request) delete event.request.headers?.["x-forwarded-for"];
    // Strip sensitive request body keys
    if (event.request?.data) {
      event.request.data = scrubObject(event.request.data);
    }
    return event;
  },
});
```

The same `beforeSend` filter applies to client + edge (the implementation extracts it into `apps/web/src/lib/sentry-scrub.ts` so all three init files share it).

**Modify `apps/web/next.config.ts`** to wrap with `withSentryConfig` for source-map upload:

```ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // existing options
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,  // strip source-map references from client bundles
  disableLogger: true,
});
```

Source maps are uploaded to Sentry via `SENTRY_AUTH_TOKEN` at build time; the `hideSourceMaps: true` flag prevents the public `.map` files from being shipped to the browser.

### Env vars to add (Vercel dashboard)

| Var | Production | Preview | Source |
|---|---|---|---|
| `SENTRY_DSN` | real DSN | same | sentry.io project |
| `NEXT_PUBLIC_SENTRY_DSN` | same as `SENTRY_DSN` | same | client init reads this |
| `SENTRY_AUTH_TOKEN` | sentry.io auth token (project:write) | same | sentry.io org settings |
| `SENTRY_ORG` | org slug | same | constant |
| `SENTRY_PROJECT` | `divechef-web` (or actual) | same | constant |
| `SENTRY_ENVIRONMENT` | `production` | `preview` | per-env override |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | same | same | client init reads this |
| `NEXTAUTH_URL` | `https://www.divechef.com` | (omit; falls back to `VERCEL_URL`) | constant |

### Verify before declaring P3 done

1. Push a small commit; confirm Vercel build runs the new `vercel-build.sh` and migrations execute on production.
2. Hit production `/api/me` (with a valid Bearer token) — confirm 200.
3. Trigger a controlled error in the client (a debug button on a hidden page, or a malformed API call) — confirm Sentry receives it.
4. Inspect the Sentry event — confirm IP scrubbed, no sensitive keys in request body.
5. Inspect `DATABASE_URL` (Vercel dashboard → reveal value): confirm it uses the pooled hostname (`*-pooler.eu-central-1.aws.neon.tech` or similar). If it's the direct URL, switch to pooled to handle Vercel's serverless cold starts.

---

## Mobile-side handoff (P3 → P4)

`EXPO_PUBLIC_API_URL` for production builds → `https://www.divechef.com`.

This lives in EAS profiles (P4 scope), not Vercel. Note here only as a coordination point. Production EAS profile sets it; development + preview profiles keep the existing `http://localhost:3000` default.

---

## Open items — not in P2/P3 scope, but flagged

1. **Email infrastructure for `support@divechef.com`.** Vercel doesn't host email. Cheapest path: Cloudflare Email Routing (free) forwarding to your Gmail. Set up before pointing testers at `/support`. Also consider `hello@`, `legal@` aliases. **Action:** user sets up DNS routing; not implementation work.
2. **Rate limiting on `/api/waitlist` + `/api/auth/signup`.** Add `@upstash/ratelimit` or similar before public launch. Not v1-beta-blocking.
3. **Programmatic GDPR data export.** Manual via support email for v1; build `/api/me/export` later.
4. **Vercel Postgres branching for previews.** Pro-only feature; revisit if/when upgrading off Hobby.
5. **Status page / uptime monitoring.** Sentry covers errors. For up/down beyond Sentry, future work.
6. **Custom OG image rendering.** v1 uses a static `og.png`. If we add per-page OG images later, use `@vercel/og`.

---

## Self-review

**Spec coverage:**
- ✅ Landing + 3 legal pages — §P2.
- ✅ Brand mirror (Tailwind config from mobile tokens) — §P2.
- ✅ Email-capture form + Waitlist Prisma model — §P2.
- ✅ Privacy policy reflecting actual data flow + Sentry IP/auth scrubbing — §P2 + §P3.
- ✅ Terms with French jurisdiction + four-tier verification disclosure + beta caveat — §P2.
- ✅ Support page + email mention — §P2.
- ✅ SEO/OG/favicon — §P2.
- ✅ Production-only migrations via `vercel-build.sh` — §P3.
- ✅ Complete Sentry wiring (client + edge + scrubber + source-map upload) — §P3.
- ✅ Env var additions enumerated — §P3.
- ✅ Hobby-plan caveats called out — §P3.

**Placeholder scan:** No "TBD"s. Open items in §Open items are deliberate deferrals with stated rationale, not placeholders.

**Internal consistency:** Privacy disclosure of Sentry IP scrubbing matches §P3 `beforeSend` implementation. Tailwind brand mirrors mobile tokens 1:1. Build command production-gating matches the user's "skip migrations on previews" choice.

**Scope check:** P2 + P3 together is one coherent "ship landing + harden deploy" arc. Implementation may split into two plans (one per phase) for cleaner reviewing — that's a plan-level decision, not a spec-level one.

**Ambiguity check:** "Domain" pinned to `https://www.divechef.com/`. Governing law pinned to France. Sentry scrubbing pinned to "strip IPs + auth payloads". Postgres host pinned to Vercel Postgres (Neon). Preview-DB strategy pinned to "skip migrations on previews".

---

## Execution notes (for the plan author)

- One PR for P2, one for P3. Both target main; no worktree split needed (no native rebuilds).
- P3 should land first if any new schema columns are referenced from P2 (currently: only the `Waitlist` model — but P3's migration runner is what makes that table exist on production). **Order: P3 migration-runner → P2 (which adds the Waitlist model + form).**
- P2 doesn't need to wait for P3's full Sentry overhaul. P3 can complete in parallel.
- After both land: smoke test on production (form submit, hit /api/me, trigger Sentry error).
