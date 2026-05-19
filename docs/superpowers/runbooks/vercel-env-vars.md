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
