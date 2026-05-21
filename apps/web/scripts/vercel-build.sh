#!/usr/bin/env bash
set -euo pipefail

echo "▸ Building shared package"
pnpm --filter @divechef/shared build

if [ "${VERCEL_ENV:-}" = "production" ] || [ "${VERCEL_ENV:-}" = "preview" ]; then
  echo "▸ VERCEL_ENV=${VERCEL_ENV} — applying database migrations to this deploy's branch"
  pnpm --filter @divechef/web db:deploy
else
  echo "▸ VERCEL_ENV=${VERCEL_ENV:-unset} — skipping migrations"
fi

echo "▸ Building Next.js app"
pnpm --filter @divechef/web exec next build
