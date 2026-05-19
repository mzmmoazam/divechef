# diveForge / DiveChef

**Product name:** DiveChef. Repo is `diveForge`.

**Production domain:** https://www.divechef.com/ — apex hosts both the
marketing landing and the `/api/*` JSON API on a single Vercel project
(`apps/web`). Mobile app points `EXPO_PUBLIC_API_URL` at the same origin.

**Monorepo layout:**
- `apps/mobile/` — Expo bare React Native (iOS + Android), TypeScript.
- `apps/web/` — Next.js 16 (App Router), Prisma 6 + Postgres, Tailwind v4.
  Hosts the API and (after P2) the marketing pages.
- `packages/shared/` — TypeScript types + parsers shared between mobile
  and web (`ShearwaterModel`, `parseShearwaterModel`, scoring, etc.).

**Brand:** Deep Ocean Modern (dark-only). Tokens at
`apps/mobile/src/theme/tokens.ts`. Web should mirror them in Tailwind config.

**Sub-project docs:**
- `apps/web/AGENTS.md` — Next.js 16 conventions (loaded into web context).
- `docs/superpowers/specs/` — design specs.
- `docs/superpowers/plans/` — implementation plans.

**Subagent / worktree workflow:** Plans are executed via the superpowers
subagent-driven-development skill. Worktrees go in `.claude/worktrees/`.
For native (iOS/Android) builds in a fresh worktree, run
`bash scripts/bootstrap-worktree.sh` first.
