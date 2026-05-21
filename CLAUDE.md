# diveForge / DiveChef

**Product name:** DiveChef. Repo is `diveForge`.

**Production status:** Live at https://www.divechef.com/ — landing + `/api/*` JSON API hosted on Vercel project `brevcut/divechef` (Hobby plan). Source-mapped Sentry on every prod + preview deploy. Closed beta — invite-only via the on-page waitlist form.

**Monorepo layout:**
- `apps/mobile/` — Expo bare React Native (iOS + Android), TypeScript. Bundle ID `com.divechef.app`.
- `apps/web/` — Next.js 16 (App Router), Prisma 6 + Postgres, Tailwind v4. Hosts the API + 4 marketing pages (`/`, `/privacy`, `/terms`, `/support`).
- `packages/shared/` — TypeScript types + parsers shared between mobile and web (`ShearwaterModel`, `parseShearwaterModel`, scoring engine, `scrubSensitiveData` Sentry filter).

**Brand:** Deep Ocean Modern (dark-only). Tokens at `apps/mobile/src/theme/tokens.ts`; web mirrors them via `@theme` block in `apps/web/src/app/globals.css`.

## Live infrastructure

| Layer | Provider / Path | Notes |
|---|---|---|
| Domain | `divechef.com` | Apex hosts everything; `www.divechef.com` is canonical. |
| Web hosting | Vercel `brevcut/divechef` (Hobby) | Auto-deploys from `main`; preview deploys per PR. |
| Database | Vercel-Neon integration → project `neon-crimson-harbor` (`shy-moon-21238663`), region `eu-central-1` (Frankfurt) | Preview branching ENABLED — each PR gets a copy-on-write branch. Migrations run via `apps/web/scripts/vercel-build.sh` on production AND preview environments. |
| Crash reporting | Sentry org `divechef`, project `javascript-nextjs` (used by both web and mobile) | Source maps uploaded on every web deploy. `EXPO_PUBLIC_SENTRY_*` injected at EAS Build time for mobile. Scrubber at `packages/shared/src/sentry-scrub.ts` strips IPs + `password`/`token`/`bytes`/etc. |
| Mobile distribution | EAS Build (free tier, 30 builds/mo) → Play Console internal track for Android, free Apple ID self-sideload for iOS | EAS profile `production` (only) builds AAB + submits to Play internal. iOS friend-test deferred until Apple Developer Program enrollment. |

## Sub-project docs

- `apps/web/AGENTS.md` — Next.js 16 + Sentry conventions (loaded into web context).
- `apps/web/CLAUDE.md` — same content via `@AGENTS.md` reference.
- `docs/superpowers/specs/` — design specs (one per arc).
- `docs/superpowers/plans/` — implementation plans (one per arc).
- `docs/superpowers/runbooks/` — operator runbooks (Vercel env vars, Play Console submission, iOS sideload).

## Subagent / worktree workflow

Plans are executed via the `superpowers:subagent-driven-development` skill. Worktrees go in `.claude/worktrees/`. For native (iOS/Android) builds in a fresh worktree, run `bash scripts/bootstrap-worktree.sh` first — copies gitignored Expo-regenerated build inputs from main and runs `pnpm install` + `pod install`.

## Common operations

- **Local web dev:** `cd apps/web && pnpm dev` (port 3000).
- **Local mobile dev (against local web):** `cd apps/mobile && pnpm ios` or `pnpm android`. The dev EAS profile sets `EXPO_PUBLIC_API_URL=http://localhost:3000`.
- **Production mobile build:** `cd apps/mobile && npx eas-cli build --profile production --platform android` (Android only — iOS production is reserved for future).
- **Production deploy (web):** push to `main` → Vercel auto-deploys.
- **Submit AAB to Play Console:** `cd apps/mobile && npx eas-cli submit --profile production --platform android --latest` (after first manual upload via Play Console UI).

## Conventions

- TypeScript strict mode in all packages.
- Vitest for `apps/web` and `packages/shared`. Jest (jest-expo) for `apps/mobile`.
- Tests must hit a real DB for integration-style tests in apps/web; UI/component tests use mocks.
- All Sentry init paths (`apps/web/sentry.{server,edge}.config.ts`, `apps/web/instrumentation-client.ts`, `apps/mobile/src/sentry/init.ts`) import `scrubSensitiveData` from `@divechef/shared`. **Single source of truth.** If you add a sensitive key (e.g., a new auth header), edit `packages/shared/src/sentry-scrub.ts` once.
