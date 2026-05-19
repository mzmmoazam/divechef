# P3 — Vercel/Neon deploy hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-19
**Status:** Ready for execution.
**Spec:** `docs/superpowers/specs/2026-05-19-p2-p3-landing-deploy-design.md` (sections "P3 — Deploy hardening" and "What's already done").
**Depends on:** Nothing (apps/web stack is independent of mobile work).

**Goal:** Close three concrete gaps in the live `brevcut/divechef` Vercel deployment: production migrations don't run on deploy; Sentry is server-only with no scrubbing or source maps; six environment variables `apps/web` reads at runtime aren't set.

**Architecture:** Add a `scripts/vercel-build.sh` that gates `prisma migrate deploy` on `VERCEL_ENV=production`. Wire client + edge Sentry configs to mirror the existing server config, all three sharing a `beforeSend` scrubber from `lib/sentry-scrub.ts` that strips IPs and sensitive keys (`password`, `passwordHash`, `token`, `authorization`, `cookie`, `bytes`). Wrap `next.config.ts` with `withSentryConfig` for source-map upload at build. Document the env-var additions as a manual step in the Vercel dashboard (no code).

**Tech Stack:** Next.js 16 (App Router), `@sentry/nextjs@^10.52`, Prisma 6, Vitest, bash.

> **Worktree note:** No native (iOS/Android) work in this plan. A worktree is optional; you can land this on `main` directly. If you do use a worktree, no `bootstrap-worktree.sh` run is needed (no `pod install` involved).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `apps/web/src/lib/sentry-scrub.ts` | **Create** | Pure scrubber: `scrubSensitiveData(event)`. Removes IP, scrubs request body keys. Single source of truth for what's stripped. |
| `apps/web/src/lib/__tests__/sentry-scrub.test.ts` | **Create** | Vitest unit tests for the scrubber. |
| `apps/web/sentry.server.config.ts` | **Modify** | Use `SENTRY_ENVIRONMENT` (not `NODE_ENV`); call `scrubSensitiveData` in `beforeSend`. |
| `apps/web/sentry.client.config.ts` | **Create** | Browser-side `Sentry.init` with the same scrubber, reading `NEXT_PUBLIC_*` env vars. |
| `apps/web/sentry.edge.config.ts` | **Create** | Edge-runtime `Sentry.init` with the same scrubber. |
| `apps/web/next.config.ts` | **Modify** | Wrap export with `withSentryConfig` for source-map upload. |
| `apps/web/scripts/vercel-build.sh` | **Create** | Bash script: shared build + `prisma migrate deploy` only when `VERCEL_ENV=production`. |
| `apps/web/vercel.json` | **Modify** | `buildCommand` calls `bash scripts/vercel-build.sh`. |
| `apps/web/.env.example` | **Modify** | Document all 7 new env vars (Sentry-related + `NEXTAUTH_URL`). |
| `docs/superpowers/runbooks/vercel-env-vars.md` | **Create** | Human-runnable checklist for adding the 7 env vars to the Vercel dashboard. |

---

## Task 1: Sentry scrubber module

The scrubber is the only piece of P3 that has unit-testable logic. Build it test-first so all three Sentry runtimes (server, client, edge) consume the same proven function.

**Files:**
- Create: `apps/web/src/lib/sentry-scrub.ts`
- Test: `apps/web/src/lib/__tests__/sentry-scrub.test.ts`

### Step 1: Write the failing tests

- [ ] Create `apps/web/src/lib/__tests__/sentry-scrub.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scrubSensitiveData } from '../sentry-scrub';

describe('scrubSensitiveData', () => {
  it('returns the event unchanged when there is nothing sensitive', () => {
    const event = {
      request: { url: '/api/me', method: 'GET', data: { ok: true } },
    } as any;
    const out = scrubSensitiveData(event);
    expect(out.request.data).toEqual({ ok: true });
  });

  it('removes user.ip_address', () => {
    const event = { user: { id: 'u1', ip_address: '1.2.3.4' } } as any;
    const out = scrubSensitiveData(event);
    expect(out.user.ip_address).toBeUndefined();
    expect(out.user.id).toBe('u1');
  });

  it('removes the x-forwarded-for header', () => {
    const event = {
      request: { headers: { 'x-forwarded-for': '5.6.7.8', 'user-agent': 'jest' } },
    } as any;
    const out = scrubSensitiveData(event);
    expect(out.request.headers['x-forwarded-for']).toBeUndefined();
    expect(out.request.headers['user-agent']).toBe('jest');
  });

  it('scrubs sensitive keys in request.data (case-insensitive)', () => {
    const event = {
      request: {
        data: {
          email: 'a@b.com',
          password: 'hunter2',
          PasswordHash: 'should-also-go',
          token: 'abc',
          authorization: 'Bearer xyz',
          cookie: 'sid=1',
          bytes: 'BASE64BLOB',
          nested: { token: 'inner', other: 'keep' },
        },
      },
    } as any;
    const out = scrubSensitiveData(event);
    expect(out.request.data.password).toBe('[scrubbed]');
    expect(out.request.data.PasswordHash).toBe('[scrubbed]');
    expect(out.request.data.token).toBe('[scrubbed]');
    expect(out.request.data.authorization).toBe('[scrubbed]');
    expect(out.request.data.cookie).toBe('[scrubbed]');
    expect(out.request.data.bytes).toBe('[scrubbed]');
    expect(out.request.data.email).toBe('a@b.com');
    expect(out.request.data.nested.token).toBe('[scrubbed]');
    expect(out.request.data.nested.other).toBe('keep');
  });

  it('scrubs sensitive keys inside arrays', () => {
    const event = {
      request: { data: { items: [{ password: 'a' }, { keep: 'me' }] } },
    } as any;
    const out = scrubSensitiveData(event);
    expect(out.request.data.items[0].password).toBe('[scrubbed]');
    expect(out.request.data.items[1].keep).toBe('me');
  });

  it('handles missing/null fields without crashing', () => {
    expect(scrubSensitiveData({} as any)).toEqual({});
    expect(scrubSensitiveData({ request: undefined } as any)).toEqual({ request: undefined });
    const evt = { request: { data: null } } as any;
    expect(scrubSensitiveData(evt).request.data).toBeNull();
  });

  it('does not mutate the input object', () => {
    const input = {
      request: { data: { password: 'p' } },
      user: { ip_address: '1.1.1.1' },
    } as any;
    scrubSensitiveData(input);
    expect(input.request.data.password).toBe('p');
    expect(input.user.ip_address).toBe('1.1.1.1');
  });
});
```

### Step 2: Run the test, confirm it fails

- [ ] Run: `cd apps/web && pnpm test -- sentry-scrub`
- [ ] Expected: FAIL with "Cannot find module '../sentry-scrub'" (file doesn't exist yet).

### Step 3: Implement the scrubber

- [ ] Create `apps/web/src/lib/sentry-scrub.ts`:

```ts
import type { ErrorEvent, EventHint } from '@sentry/nextjs';

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
 * Used by all three runtimes (server, client, edge). Single source of truth for
 * what we consider sensitive.
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

### Step 4: Run the tests, confirm pass

- [ ] Run: `cd apps/web && pnpm test -- sentry-scrub`
- [ ] Expected: 7 tests PASS.

### Step 5: Commit

- [ ] Run:

```bash
git add apps/web/src/lib/sentry-scrub.ts apps/web/src/lib/__tests__/sentry-scrub.test.ts
git commit -m "$(cat <<'EOF'
feat(sentry): scrubSensitiveData — strip IPs + sensitive request body keys

Pure function shared by server, client, and edge Sentry runtimes.
Removes user.ip_address, the x-forwarded-for header, and recursively
scrubs SENSITIVE_KEYS (password, passwordhash, token, authorization,
cookie, bytes — the dive-data binary). Does not mutate input.

Tests cover: clean events, IP removal, XFF header removal, nested
scrubbing, arrays, null/missing fields, immutability.

P3 task 1 of 7.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update server-side Sentry config

Wire the scrubber in and switch from `NODE_ENV` (always `"production"` on Vercel for both prod and preview) to the explicit `SENTRY_ENVIRONMENT` env var so prod and preview events are tagged distinctly.

**Files:**
- Modify: `apps/web/sentry.server.config.ts`

### Step 1: Read current state

- [ ] Run: `cat apps/web/sentry.server.config.ts`
- [ ] Confirm content matches:

```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});
```

### Step 2: Replace with scrubber-aware version

- [ ] Replace the entire file contents with:

```ts
import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveData } from "./src/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.SENTRY_ENVIRONMENT ?? "development",
  beforeSend: scrubSensitiveData,
});
```

### Step 3: Verify the import path resolves

- [ ] Run: `cd apps/web && pnpm exec tsc --noEmit sentry.server.config.ts 2>&1 | head -10`
- [ ] Expected: no errors. (If the import path needs adjustment because Next.js relocates these files, the SDK still resolves them — the path `./src/lib/sentry-scrub` works because `sentry.server.config.ts` lives at the package root.)

### Step 4: Commit

- [ ] Run:

```bash
git add apps/web/sentry.server.config.ts
git commit -m "$(cat <<'EOF'
feat(sentry): server config uses scrubber + SENTRY_ENVIRONMENT

beforeSend now strips IPs and sensitive request body keys via the
shared scrubSensitiveData function. environment switches from
NODE_ENV (always "production" on Vercel) to SENTRY_ENVIRONMENT so
production and preview deploys tag events distinctly.

Default falls back to "development" when SENTRY_ENVIRONMENT is unset
(local dev).

P3 task 2 of 7.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add client-side Sentry config

Currently zero browser-side errors are captured. Add the file. Browser bundles read `NEXT_PUBLIC_*` env vars only.

**Files:**
- Create: `apps/web/sentry.client.config.ts`

### Step 1: Create the file

- [ ] Create `apps/web/sentry.client.config.ts`:

```ts
import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveData } from "./src/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
  beforeSend: scrubSensitiveData,
});
```

### Step 2: Verify the file typechecks

- [ ] Run: `cd apps/web && pnpm exec tsc --noEmit sentry.client.config.ts 2>&1 | head -10`
- [ ] Expected: no errors.

### Step 3: Commit

- [ ] Run:

```bash
git add apps/web/sentry.client.config.ts
git commit -m "$(cat <<'EOF'
feat(sentry): add client (browser) Sentry config

Captures uncaught browser errors with the same scrubber the server
config uses. Reads NEXT_PUBLIC_SENTRY_DSN and
NEXT_PUBLIC_SENTRY_ENVIRONMENT (browser bundles can only read
NEXT_PUBLIC_* vars), falls back to the server-side names for parity
during local dev.

P3 task 3 of 7.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add edge-runtime Sentry config

Mirrors server config; the `@sentry/nextjs` SDK auto-loads this file for edge functions.

**Files:**
- Create: `apps/web/sentry.edge.config.ts`

### Step 1: Create the file

- [ ] Create `apps/web/sentry.edge.config.ts`:

```ts
import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveData } from "./src/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.SENTRY_ENVIRONMENT ?? "development",
  beforeSend: scrubSensitiveData,
});
```

### Step 2: Verify typecheck

- [ ] Run: `cd apps/web && pnpm exec tsc --noEmit sentry.edge.config.ts 2>&1 | head -10`
- [ ] Expected: no errors.

### Step 3: Commit

- [ ] Run:

```bash
git add apps/web/sentry.edge.config.ts
git commit -m "$(cat <<'EOF'
feat(sentry): add edge-runtime Sentry config

Mirrors the server config so errors thrown in middleware or edge route
handlers are captured. Same scrubber, same SENTRY_ENVIRONMENT tag.

P3 task 4 of 7.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wrap `next.config.ts` with `withSentryConfig`

Source-map upload happens at build time. The wrapper needs `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` set in the build environment (added to Vercel in Task 7) — but the wrapper itself works locally too (it just no-ops the upload step when auth is missing).

**Files:**
- Modify: `apps/web/next.config.ts`

### Step 1: Read current state

- [ ] Run: `cat apps/web/next.config.ts`
- [ ] Confirm:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
```

### Step 2: Replace with wrapped version

- [ ] Replace the entire file with:

```ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
```

### Step 3: Verify build still works locally

- [ ] Run: `cd apps/web && timeout 180 pnpm exec next build 2>&1 | tail -10`
- [ ] Expected: build completes (the wrapper logs a warning about missing `SENTRY_AUTH_TOKEN` locally; that's fine — uploads only happen when the token is present).
- [ ] If the build fails for an unrelated reason (e.g., missing env vars for routes we already had), note it but don't try to fix unrelated breakage in this task.

### Step 4: Commit

- [ ] Run:

```bash
git add apps/web/next.config.ts
git commit -m "$(cat <<'EOF'
feat(sentry): wrap next.config with withSentryConfig for source-map upload

Source maps now upload to Sentry at build time when SENTRY_AUTH_TOKEN
+ SENTRY_ORG + SENTRY_PROJECT are set in the environment. hideSourceMaps
strips the source-map references from client bundles so they're not
publicly fetchable.

silent unless CI=true (keeps local builds quiet); disableLogger drops
Sentry debug logs from the production bundle.

P3 task 5 of 7.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `vercel-build.sh` + `vercel.json`

Move the build orchestration into a shell script with explicit if/else so production migrations run, preview deploys skip them, and any failure exits non-zero.

**Files:**
- Create: `apps/web/scripts/vercel-build.sh`
- Modify: `apps/web/vercel.json`

### Step 1: Create the build script

- [ ] Create `apps/web/scripts/vercel-build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "▸ Building shared package"
pnpm --filter @divechef/shared build

echo "▸ Generating Prisma client"
pnpm --filter @divechef/web exec prisma generate

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "▸ VERCEL_ENV=production — applying database migrations"
  pnpm --filter @divechef/web db:deploy
else
  echo "▸ VERCEL_ENV=${VERCEL_ENV:-unset} — skipping migrations (preview/dev shares production schema)"
fi

echo "▸ Building Next.js app"
pnpm --filter @divechef/web exec next build
```

### Step 2: Make it executable

- [ ] Run: `chmod +x apps/web/scripts/vercel-build.sh`
- [ ] Run: `ls -l apps/web/scripts/vercel-build.sh`
- [ ] Expected: the file mode shows `-rwxr-xr-x` (or similar with `x` on the user bit).

### Step 3: Update `apps/web/vercel.json`

- [ ] Read current state: `cat apps/web/vercel.json`
- [ ] Replace contents with:

```json
{
  "buildCommand": "bash scripts/vercel-build.sh",
  "installCommand": "pnpm install",
  "framework": "nextjs"
}
```

### Step 4: Smoke-test the script locally (without migrations)

- [ ] Run: `cd apps/web && VERCEL_ENV=preview bash scripts/vercel-build.sh 2>&1 | tail -15`
- [ ] Expected: shared package builds, prisma generate runs, "skipping migrations" line prints, next build runs.
- [ ] If `next build` fails because of a missing local env var (e.g., DATABASE_URL pointing at a fake DB), that's OK — the script structure is what we're verifying. The real migration run happens in Vercel.

### Step 5: Commit

- [ ] Run:

```bash
git add apps/web/scripts/vercel-build.sh apps/web/vercel.json
git commit -m "$(cat <<'EOF'
feat(deploy): production-only migrations via vercel-build.sh

vercel.json now calls scripts/vercel-build.sh, which runs the shared
package build + prisma generate + (only when VERCEL_ENV=production)
prisma migrate deploy + next build. set -euo pipefail means any failure
including a real migration failure on production exits non-zero and
Vercel marks the deploy as failed.

Previews skip migrations and share the production DB schema as it
stands at the time of the PR. A preview that depends on a not-yet-
production schema will 500 — agreed tradeoff to avoid Pro-tier
branched DBs.

Replaces the earlier vercel.json that called prisma generate but never
prisma migrate deploy — schema changes since May 10 weren't being
applied on production.

P3 task 6 of 7.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Document the env vars + create runbook

The 7 missing env vars are added to the Vercel dashboard manually (the operator's task, not a code change). This task produces (a) an updated `.env.example` so local devs see the full list, and (b) a runbook so the operator can add them in one sitting.

**Files:**
- Modify: `apps/web/.env.example`
- Create: `docs/superpowers/runbooks/vercel-env-vars.md`

### Step 1: Update `.env.example`

- [ ] Read current contents: `cat apps/web/.env.example`
- [ ] Replace with:

```
# Database (Neon Postgres — already attached via Vercel integration)
# Use the pooled URL (*-pooler.<region>.aws.neon.tech) for serverless cold-start friendliness.
DATABASE_URL="postgresql://user:password@host/diveforge?sslmode=require"

# Auth — JWT-based, no NextAuth provider currently
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
# Production only; preview omits this so NextAuth falls back to $VERCEL_URL.
NEXTAUTH_URL="https://www.divechef.com"

# Sentry — server + edge runtimes
SENTRY_DSN="https://your-dsn@sentry.io/project-id"
# Set explicitly per environment so Vercel preview deploys are tagged "preview"
# (NODE_ENV is always "production" in Vercel builds, even for previews).
SENTRY_ENVIRONMENT="development"

# Sentry — client (browser bundle reads NEXT_PUBLIC_* only)
NEXT_PUBLIC_SENTRY_DSN="https://your-dsn@sentry.io/project-id"
NEXT_PUBLIC_SENTRY_ENVIRONMENT="development"

# Sentry — source-map upload at build time (production only)
SENTRY_ORG="your-sentry-org-slug"
SENTRY_PROJECT="divechef-web"
SENTRY_AUTH_TOKEN="sntrys_..."

# libdivecomputer binary path (optional, defaults to spike build)
# DCTOOL_PATH="/path/to/dctool"
```

### Step 2: Create the runbook

- [ ] Create `docs/superpowers/runbooks/vercel-env-vars.md`:

```markdown
# Vercel env-var checklist (P3)

After P3 lands in code, the operator (you) needs to add 7 environment
variables in the Vercel dashboard. Without them, Sentry won't capture
browser/edge errors, source maps won't upload, and NextAuth will fall
back to `$VERCEL_URL` even on production.

## Where

`https://vercel.com/brevcut/divechef/settings/environment-variables`

## What to add

| Name | Production value | Preview value | Notes |
|---|---|---|---|
| `SENTRY_DSN` | DSN from sentry.io project | same | Click the project → Settings → Client Keys (DSN). |
| `NEXT_PUBLIC_SENTRY_DSN` | same as above | same | Browser bundles can only read `NEXT_PUBLIC_*`. |
| `SENTRY_AUTH_TOKEN` | sentry.io org settings → Auth Tokens → create a project-scoped token with `project:write` | same | Treat as sensitive. |
| `SENTRY_ORG` | your sentry.io org slug (lowercase, e.g. `divechef-eu`) | same | Constant; not sensitive. |
| `SENTRY_PROJECT` | `divechef-web` (or whatever your project slug is on sentry.io) | same | Constant; not sensitive. |
| `SENTRY_ENVIRONMENT` | `production` | `preview` | Per-env override is the point — distinguishes deploys in Sentry. |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `production` | `preview` | Mirror of above for browser bundle. |
| `NEXTAUTH_URL` | `https://www.divechef.com` | (leave unset; NextAuth falls back to `$VERCEL_URL`) | |

## Already set — do not re-create

- `DATABASE_URL` (Neon-attached, May 10).
- `NEXTAUTH_SECRET` (May 10).

## After adding

1. Trigger a redeploy of `main` (Vercel → Deployments → ⋯ → Redeploy without cache, or just push a no-op commit).
2. Watch the build log: source-map upload to Sentry should be visible (lines starting with `[@sentry/nextjs]`).
3. Trigger a controlled error (see P3 task 8) and verify the event arrives in Sentry tagged `production`.

## Verifying `DATABASE_URL` uses the pooled URL

Vercel's Neon integration usually sets the pooled URL by default, but it's
worth confirming once. In the Vercel env-vars page, click the eye icon on
`DATABASE_URL` to reveal the value. The hostname should contain
`-pooler.<region>.aws.neon.tech`. If it shows the direct hostname (no
`-pooler`), edit the value to use the pooled equivalent — Prisma + Vercel
serverless cold starts otherwise exhaust connections under load.
```

### Step 3: Commit

- [ ] Run:

```bash
git add apps/web/.env.example docs/superpowers/runbooks/vercel-env-vars.md
git commit -m "$(cat <<'EOF'
docs(p3): document Vercel env vars + runbook for the operator

.env.example now lists all 9 vars apps/web reads at runtime, with
inline notes on why each is per-env (SENTRY_ENVIRONMENT, NEXTAUTH_URL).

New runbook at docs/superpowers/runbooks/vercel-env-vars.md is the
operator's checklist for adding the 7 missing vars in the Vercel
dashboard, plus the verify-pooled-DATABASE_URL step.

P3 task 7 of 7. Code is done; the operator runs the runbook to finish
the deploy.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Production verification (after env vars are added)

This task happens **after** the operator has run the runbook from Task 7. It's not a code commit — it's a verification step the operator runs once.

### Step 1: Trigger a clean redeploy

- [ ] Push a no-op commit (or click "Redeploy" in Vercel) to force a build with the new env vars.

```bash
git commit --allow-empty -m "chore: trigger redeploy after Sentry env vars added"
git push
```

### Step 2: Watch the Vercel build log

- [ ] Open the latest deployment in `vercel.com/brevcut/divechef`.
- [ ] Confirm the build log shows:
  - `▸ Building shared package` from `vercel-build.sh`
  - `▸ Generating Prisma client`
  - `▸ VERCEL_ENV=production — applying database migrations`
  - At least one Prisma migration name printed (or `Database schema is up to date.`).
  - `▸ Building Next.js app`
  - One or more `[@sentry/nextjs]` lines about source-map upload.

### Step 3: Smoke-test the production app

- [ ] From a logged-in mobile build (or with a stored Bearer token), hit `https://www.divechef.com/api/me`. Expect 200 with the user JSON.
- [ ] Visit `https://www.divechef.com/` in a browser. (Today returns the Next.js default page until P2 lands. That's fine — confirm it's HTTPS and no SSL errors.)

### Step 4: Trigger a controlled Sentry error

- [ ] Open browser devtools on `https://www.divechef.com/`.
- [ ] In the console, run:

```js
throw new Error('p3-verify-' + Date.now());
```

- [ ] Open `https://sentry.io/organizations/<org>/issues/?project=<project>` and confirm an event arrives within ~30 seconds, tagged `environment: production`.

### Step 5: Confirm scrubbing worked

- [ ] On the new Sentry event, expand the Request panel.
- [ ] Confirm:
  - No `user.ip_address` field (or it's the literal string `[scrubbed]`).
  - No `x-forwarded-for` header.
- [ ] If you have a way to trigger a server error from a request that POSTs `password` (e.g., a malformed login request that throws), do so and confirm the password field shows `[scrubbed]` in the Sentry event.

### Step 6: Done

- [ ] If all of the above pass, P3 is complete on production. No commit needed for this task.
- [ ] If anything fails, add an entry to `docs/superpowers/runbooks/vercel-env-vars.md` describing what you observed and roll back to the last known-good deploy in Vercel while diagnosing.

---

## Self-Review

**1. Spec coverage:**

| Spec requirement | Task |
|---|---|
| Production-only migrations via `scripts/vercel-build.sh` | Task 6 |
| `vercel.json` calls the new script | Task 6 |
| `sentry.client.config.ts` | Task 3 |
| `sentry.edge.config.ts` | Task 4 |
| `sentry.server.config.ts` uses `SENTRY_ENVIRONMENT` + scrubber | Task 2 |
| Scrubber extracted to `lib/sentry-scrub.ts` | Task 1 |
| `next.config.ts` wrapped with `withSentryConfig` | Task 5 |
| 7 missing env vars enumerated for the operator | Task 7 |
| `.env.example` updated | Task 7 |
| Verify pooled `DATABASE_URL` | Task 7 (in runbook) |
| Production smoke test (deploy, /api/me, Sentry round-trip, scrubbing) | Task 8 |

All spec items covered.

**2. Placeholder scan:** No "TBD"s. The runbook references `<org>` and `<project>` in URLs and asks the operator to substitute their real slugs — that's by design (those values are user-specific, not unknowns the plan needs to resolve).

**3. Type consistency:**

- `scrubSensitiveData(event: T): T` signature is consistent across the three Sentry init files (Tasks 2, 3, 4).
- Env var names are consistent: `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_ENVIRONMENT` server-side; `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` client-side; `NEXTAUTH_URL` per-env. All match `.env.example` (Task 7) and the runbook table (Task 7).
- `SENSITIVE_KEYS` set in Task 1 (`password`, `passwordhash`, `token`, `authorization`, `cookie`, `bytes`) matches the spec's "Sentry data handling — strip IPs + auth payloads" decision.

---

## Execution notes

- **Tasks 1–5** are pure code changes; they can land in one PR if desired.
- **Task 6** is the highest-leverage change (production migrations actually run) — if you split, prioritize landing Task 6 first.
- **Task 7** is the operator's homework; the code change in Task 7 is just `.env.example` + a runbook.
- **Task 8** runs after the operator has added the env vars and deployed.
- Total commit count: 7 code commits + 1 trigger-redeploy empty commit. ~1–2 hours of focused work.
- **No worktree needed.** All work is in `apps/web/` plus one runbook under `docs/`.
