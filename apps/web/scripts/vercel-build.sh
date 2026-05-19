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
