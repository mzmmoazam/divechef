<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Sentry on this project (Next.js 16 + @sentry/nextjs v10)

Hard-won lessons from P3:

- **`instrumentation.ts` + `instrumentation-client.ts` is the modern pattern.** The legacy `sentry.client.config.ts` at the project root is officially supported by `@sentry/nextjs` v10 BUT does NOT auto-load under Next.js 16's Turbopack default builds. We migrated and verified `window.__SENTRY__` is populated only after the migration.
- **`hideSourceMaps: true` was removed in `@sentry/nextjs` v10.** Use `sourcemaps: { deleteSourcemapsAfterUpload: true }` in the `withSentryConfig` second argument instead.
- **DSN fallback is dead in production browser bundles.** Next.js only inlines `NEXT_PUBLIC_*` env vars at build time. `process.env.SENTRY_DSN` is `undefined` in the client bundle — never use it as a fallback for `NEXT_PUBLIC_SENTRY_DSN`. Doing so silently no-ops Sentry on missing-config.
- **Browser-extension inbound filter drops console-thrown errors.** Sentry's default "Filter out errors caused by browser extensions" filter classifies stacks like `at <anonymous>:1:7` as extension noise. To verify Sentry round-trip, throw from real bundled app code (a button onClick), not from devtools console.
- **Source-map upload requires `SENTRY_PROJECT` with no whitespace.** Trim env vars before pasting into Vercel — a trailing tab kills source-map upload silently.

# Production migrations

`apps/web/scripts/vercel-build.sh` runs `prisma migrate deploy` for `VERCEL_ENV` in `(production, preview)`. Local `next dev` is unaffected (no `VERCEL_ENV`). Preview branching is enabled in the Vercel-Neon integration, so each PR's preview applies migrations to its own COW branch — destructive migrations cannot trash prod.

# Scrubber

`scrubSensitiveData` at `packages/shared/src/sentry-scrub.ts`. Imported by all three Sentry runtimes (server, client, edge) and by mobile's `apps/mobile/src/sentry/init.ts`. `SENSITIVE_KEYS` set is the single source of truth — add new keys here, not in each runtime config.

# Database connection

Use the pooled `DATABASE_URL` (`*-pooler.<region>.aws.neon.tech`) for serverless friendliness. The Vercel-Neon integration sets this correctly by default; the `_UNPOOLED` variants are for migrations and direct queries.
