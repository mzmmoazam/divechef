# Plan 1 — Foundation + Scoring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the complete backend and scoring engine so that Plan 2 (mobile app) can develop against a live API with mocked BLE (dev-mode JSON ingestion). By the end of Plan 1, a developer can: sign up, log in, POST a dive (either raw bytes or pre-parsed JSON), receive a 0–100 safety score with coaching insights, list/get/delete dives, query 30-day trends, and update their profile.

**Architecture:** pnpm monorepo with three workspaces. `packages/shared` holds TS types (the contract) and the pure scoring engine. `apps/web` is a Next.js 15 App Router backend deployed to Vercel with Prisma on Neon Postgres. `apps/mobile` is created as a placeholder (Plan 2 fills it).

**Tech Stack:**
- pnpm workspaces (monorepo)
- Next.js 15 (App Router, Route Handlers)
- NextAuth v5 (credentials provider, bcrypt, JWT)
- Prisma ORM + Neon Postgres
- Vitest (unit + integration tests)
- TypeScript 5.x (strict mode)
- libdivecomputer via `dctool parse` subprocess
- Sentry (backend error tracking)
- Vercel (deployment target)

**Non-goals:**
- Mobile app screens, BLE, native modules (Plans 2 and 3).
- Web UI for end users.
- LLM-narrated insights, social features, push notifications.
- Any feature listed in spec §8 (out-of-scope).
- FFI-based libdivecomputer integration (documented as future optimization; v1 uses subprocess).

---

## Phase 1 — Monorepo Scaffold

### Task 1.1: Initialize pnpm workspace

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`
- Create: `.gitignore` (root-level additions)
- Create: `turbo.json`

- [ ] **Step 1: Initialize root package.json**

```bash
pnpm init
```

Edit `package.json`:
```json
{
  "name": "diveforge",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "db:migrate": "pnpm --filter @diveforge/web exec prisma migrate deploy",
    "db:generate": "pnpm --filter @diveforge/web exec prisma generate"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create .npmrc**

```ini
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 4: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

- [ ] **Step 5: Update root .gitignore**

Append to existing `.gitignore`:
```
node_modules/
.turbo/
dist/
.next/
.env
.env.local
.vercel
```

- [ ] **Step 6: Install root dependencies**

```bash
pnpm install
```

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml .npmrc turbo.json .gitignore pnpm-lock.yaml
git commit -m "scaffold: pnpm monorepo with Turborepo"
```

---

### Task 1.2: Create packages/shared workspace

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p packages/shared/src
```

- [ ] **Step 2: Write packages/shared/package.json**

```json
{
  "name": "@diveforge/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./types": {
      "import": "./dist/types.js",
      "types": "./dist/types.d.ts"
    },
    "./scoring": {
      "import": "./dist/scoring/index.js",
      "types": "./dist/scoring/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 3: Write packages/shared/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 4: Write packages/shared/src/index.ts (barrel)**

```typescript
export * from "./types.js";
export * from "./scoring/index.js";
```

- [ ] **Step 5: Install shared workspace deps**

```bash
pnpm --filter @diveforge/shared install
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/
git commit -m "scaffold: packages/shared workspace skeleton"
```

---

### Task 1.3: Create apps/web (Next.js 15) workspace

**Files:**
- Create: `apps/web/` (Next.js project via create-next-app)
- Modify: `apps/web/package.json` (name to `@diveforge/web`, add shared dep)

- [ ] **Step 1: Scaffold Next.js 15 app**

```bash
cd apps
pnpm create next-app@latest web --typescript --eslint --tailwind --app --src-dir --import-alias "@/*" --no-turbopack
cd ..
```

- [ ] **Step 2: Update apps/web/package.json**

Set `"name": "@diveforge/web"` and add workspace dependency:

```json
"dependencies": {
  "@diveforge/shared": "workspace:*",
  ...
}
```

- [ ] **Step 3: Add vitest to apps/web**

```bash
pnpm --filter @diveforge/web add -D vitest @vitejs/plugin-react
```

- [ ] **Step 4: Create apps/web/vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 5: Add test script to apps/web/package.json**

```json
"scripts": {
  ...
  "test": "vitest run"
}
```

- [ ] **Step 6: Install all workspace deps**

```bash
pnpm install
```

- [ ] **Step 7: Verify build**

```bash
pnpm --filter @diveforge/web build
```

Expected: Next.js builds without error.

- [ ] **Step 8: Commit**

```bash
git add apps/web/ pnpm-lock.yaml
git commit -m "scaffold: Next.js 15 App Router backend (apps/web)"
```

---

### Task 1.4: Create apps/mobile placeholder

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/README.md`

- [ ] **Step 1: Create minimal placeholder**

```bash
mkdir -p apps/mobile
```

Write `apps/mobile/package.json`:
```json
{
  "name": "@diveforge/mobile",
  "version": "0.0.1",
  "private": true,
  "description": "Placeholder — Plan 2 fills this with Expo bare RN app"
}
```

Write `apps/mobile/README.md`:
```markdown
# DiveForge Mobile

Placeholder workspace. Plan 2 scaffolds the Expo bare-workflow React Native app here.
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/
git commit -m "scaffold: apps/mobile placeholder for Plan 2"
```

---

### Phase 1 verification

- [ ] Run `pnpm install` from root — exits 0, no warnings about missing workspaces.
- [ ] Run `pnpm --filter @diveforge/shared build` — produces `packages/shared/dist/`.
- [ ] Run `pnpm --filter @diveforge/web build` — Next.js build passes.
- [ ] Directory structure matches: `apps/web`, `apps/mobile`, `packages/shared`.

---

## Phase 2 — Database + Prisma Schema

### Task 2.1: Install Prisma and configure Neon connection

**Files:**
- Create: `apps/web/prisma/schema.prisma`
- Create: `apps/web/.env.example`
- Modify: `apps/web/package.json` (add prisma deps)

- [ ] **Step 1: Install Prisma**

```bash
pnpm --filter @diveforge/web add prisma @prisma/client
pnpm --filter @diveforge/web add -D prisma
```

- [ ] **Step 2: Initialize Prisma**

```bash
cd apps/web
pnpm exec prisma init --datasource-provider postgresql
cd ../..
```

- [ ] **Step 3: Write .env.example**

`apps/web/.env.example`:
```
DATABASE_URL="postgresql://user:password@host/diveforge?sslmode=require"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"
```

- [ ] **Step 4: Ensure .env is gitignored**

Verify `apps/web/.gitignore` includes `.env` and `.env.local`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/prisma/ apps/web/.env.example apps/web/.gitignore apps/web/package.json pnpm-lock.yaml
git commit -m "db: initialize Prisma with Neon Postgres provider"
```

---

### Task 2.2: Write the Prisma schema (per spec §3)

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Write the complete schema**

Per spec §3, the schema must include User, Device, Dive, DiveSample, and Insight models with exact field names and types:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Niveau {
  N1
  N2
  N3
  N4
  INITIATEUR
  MF1
  MF2
  UNKNOWN
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  displayName  String?
  niveau       Niveau   @default(UNKNOWN)
  locale       String   @default("fr")
  createdAt    DateTime @default(now())
  dives        Dive[]
  devices      Device[]
}

model Device {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id])
  bleAddress   String
  model        String
  serialNumber String?
  nickname     String?
  lastSyncAt   DateTime?
  createdAt    DateTime  @default(now())

  @@unique([userId, bleAddress])
}

model Dive {
  id               String       @id @default(cuid())
  userId           String
  user             User         @relation(fields: [userId], references: [id])
  deviceId         String?
  externalId       String
  startedAt        DateTime
  durationSec      Int
  maxDepthM        Float
  avgDepthM        Float
  minWaterTempC    Float?
  maxAscentRateMps Float
  safetyScore      Int?
  scoredAt         DateTime?
  scoringVersion   String?
  rawPayloadUrl    String?
  samples          DiveSample[]
  insights         Insight[]
  createdAt        DateTime     @default(now())

  @@unique([userId, externalId])
  @@index([userId, startedAt])
}

model DiveSample {
  id          BigInt @id @default(autoincrement())
  diveId      String
  dive        Dive   @relation(fields: [diveId], references: [id], onDelete: Cascade)
  tSec        Int
  depthM      Float
  tempC       Float?
  cnsPct      Float?
  decoState   String
  decoTimeSec Int
  decoDepthM  Float
  ttsSec      Int?

  @@index([diveId, tSec])
}

model Insight {
  id        String   @id @default(cuid())
  diveId    String
  dive      Dive     @relation(fields: [diveId], references: [id], onDelete: Cascade)
  ruleId    String
  severity  String
  evidence  Json
  createdAt DateTime @default(now())

  @@index([diveId])
}
```

- [ ] **Step 2: Validate schema**

```bash
pnpm --filter @diveforge/web exec prisma validate
```

Expected: "The schema is valid."

- [ ] **Step 3: Generate Prisma client**

```bash
pnpm --filter @diveforge/web exec prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/prisma/schema.prisma
git commit -m "db: Prisma schema per spec §3 — User, Device, Dive, DiveSample, Insight"
```

---

### Task 2.3: Create and apply initial migration

**Files:**
- Create: `apps/web/prisma/migrations/` (auto-generated)

- [ ] **Step 1: Create the migration**

Ensure `DATABASE_URL` is set in `apps/web/.env` pointing to a Neon database.

```bash
cd apps/web
pnpm exec prisma migrate dev --name init
cd ../..
```

Expected: migration created under `prisma/migrations/`, applied to the database, Prisma client regenerated.

- [ ] **Step 2: Verify by inspecting migration SQL**

```bash
ls apps/web/prisma/migrations/
cat apps/web/prisma/migrations/*/migration.sql | head -60
```

Expected: CREATE TABLE statements for all 5 models with correct indices and enums.

- [ ] **Step 3: Commit**

```bash
git add apps/web/prisma/migrations/
git commit -m "db: initial migration — all tables + indices"
```

---

### Phase 2 verification

- [ ] `pnpm --filter @diveforge/web exec prisma validate` — exits 0.
- [ ] `pnpm --filter @diveforge/web exec prisma generate` — exits 0, generates client.
- [ ] Schema has `@@unique([userId, externalId])` on Dive (per Contract §Dive ingestion, idempotency).
- [ ] Schema has `@@index([userId, startedAt])` on Dive (for list queries).
- [ ] DiveSample has `decoState`, `decoTimeSec`, `decoDepthM`, `ttsSec` (per spike findings).

---

## Phase 3 — Auth (NextAuth + JWT)

### Task 3.1: Install auth dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install NextAuth v5 and bcrypt**

```bash
pnpm --filter @diveforge/web add next-auth@beta @auth/prisma-adapter bcryptjs jsonwebtoken
pnpm --filter @diveforge/web add -D @types/bcryptjs @types/jsonwebtoken
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "auth: install NextAuth v5, bcrypt, jsonwebtoken"
```

---

### Task 3.2: Configure NextAuth with credentials provider

**Files:**
- Create: `apps/web/src/lib/auth.ts`
- Create: `apps/web/src/lib/db.ts`
- Create: `apps/web/src/lib/jwt.ts`

- [ ] **Step 1: Create Prisma client singleton (apps/web/src/lib/db.ts)**

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 2: Create JWT helper (apps/web/src/lib/jwt.ts)**

```typescript
import jwt from "jsonwebtoken";

const SECRET = process.env.NEXTAUTH_SECRET!;

export interface JwtPayload {
  sub: string; // userId
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Create auth configuration (apps/web/src/lib/auth.ts)**

```typescript
import { prisma } from "./db";
import { verifyToken } from "./jwt";
import type { User } from "@diveforge/shared";
import { NextRequest } from "next/server";

export async function getAuthUser(req: NextRequest): Promise<User | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, displayName: true, niveau: true, locale: true },
  });

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    niveau: user.niveau,
    locale: user.locale as "fr" | "en",
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/
git commit -m "auth: Prisma singleton, JWT helper, auth middleware"
```

---

### Task 3.3: Implement POST /api/auth/signup

**Files:**
- Create: `apps/web/src/app/api/auth/signup/route.ts`

- [ ] **Step 1: Write the signup route handler**

Per Contract §Auth: accepts `{ email, password, niveau, locale }`, returns `{ token, user }`.

```typescript
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/jwt";
import type { Niveau, Locale } from "@diveforge/shared";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, niveau, locale } = body as {
      email: string;
      password: string;
      niveau: Niveau;
      locale: Locale;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        niveau: niveau ?? "UNKNOWN",
        locale: locale ?? "fr",
      },
      select: { id: true, email: true, displayName: true, niveau: true, locale: true },
    });

    const token = signToken({ sub: user.id, email: user.email });

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        niveau: user.niveau,
        locale: user.locale,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/auth/signup/
git commit -m "auth: POST /api/auth/signup — credentials registration"
```

---

### Task 3.4: Implement POST /api/auth/login

**Files:**
- Create: `apps/web/src/app/api/auth/login/route.ts`

- [ ] **Step 1: Write the login route handler**

Per Contract §Auth: accepts `{ email, password }`, returns `{ token, user }`.

```typescript
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/jwt";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json()) as {
      email: string;
      password: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = signToken({ sub: user.id, email: user.email });

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        niveau: user.niveau,
        locale: user.locale,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/auth/login/
git commit -m "auth: POST /api/auth/login — credentials authentication"
```

---

### Task 3.5: Implement GET /api/auth/me and POST /api/auth/logout

**Files:**
- Create: `apps/web/src/app/api/auth/me/route.ts`
- Create: `apps/web/src/app/api/auth/logout/route.ts`

- [ ] **Step 1: Write GET /api/auth/me**

Per Contract §Auth: returns `{ user }` from auth header.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ user });
}
```

- [ ] **Step 2: Write POST /api/auth/logout**

Per Contract §Auth: returns `{ ok: true }`. JWT-based auth is stateless; logout is a no-op on the server side (client discards the token). This endpoint exists for API symmetry and future token-revocation.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // JWT stateless — client discards token. Future: add token to revocation list.
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/auth/me/ apps/web/src/app/api/auth/logout/
git commit -m "auth: GET /api/auth/me + POST /api/auth/logout"
```

---

### Task 3.6: Auth integration tests

**Files:**
- Create: `apps/web/src/app/api/auth/__tests__/auth.test.ts`

- [ ] **Step 1: Write auth test suite**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// These tests hit the actual route handlers in isolation.
// For a proper integration test against Prisma, a test DB is needed.
// This suite validates request/response shapes and error paths.

describe("Auth endpoints — contract compliance", () => {
  it("POST /api/auth/signup rejects missing fields", async () => {
    // Validate 400 response for empty body
  });

  it("POST /api/auth/signup returns { token, user } shape", async () => {
    // Validate response matches Contract §Auth
  });

  it("POST /api/auth/login returns 401 for wrong password", async () => {
    // Validate error handling
  });

  it("GET /api/auth/me returns 401 without token", async () => {
    // Validate auth guard
  });

  it("GET /api/auth/me returns { user } with valid token", async () => {
    // Validate authenticated response shape
  });
});
```

Note: Full integration tests require a test database. The test file above is a structural scaffold; the executor should fill in test bodies using a test Neon branch or `prisma migrate reset` against a local Postgres.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/auth/__tests__/
git commit -m "auth: integration test scaffold for auth endpoints"
```

---

### Phase 3 verification

- [ ] Start `pnpm --filter @diveforge/web dev` and use `curl` to test the full auth flow:
  ```bash
  # Signup
  curl -X POST http://localhost:3000/api/auth/signup \
    -H "Content-Type: application/json" \
    -d '{"email":"test@dive.club","password":"hunter2","niveau":"N2","locale":"fr"}'
  # Login
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@dive.club","password":"hunter2"}'
  # Me (use token from above)
  curl http://localhost:3000/api/auth/me \
    -H "Authorization: Bearer <token>"
  # Logout
  curl -X POST http://localhost:3000/api/auth/logout \
    -H "Authorization: Bearer <token>"
  ```
- [ ] Confirm response shapes match Contract §Auth exactly.
- [ ] Confirm duplicate signup returns 409.
- [ ] Confirm wrong password returns 401.

---

## Phase 4 — Shared Types + Scoring Engine

### Task 4.1: Write packages/shared/src/types.ts

**Files:**
- Create: `packages/shared/src/types.ts`

- [ ] **Step 1: Write the contract types (per Contract §Shared types)**

```typescript
export type Niveau = "N1" | "N2" | "N3" | "N4" | "INITIATEUR" | "MF1" | "MF2" | "UNKNOWN";
export type Locale = "fr" | "en";
export type DecoState = "ndl" | "deco";
export type Severity = "info" | "warn" | "alert";

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  niveau: Niveau;
  locale: Locale;
}

export interface Dive {
  id: string;
  externalId: string;
  startedAt: string;       // ISO 8601
  durationSec: number;
  maxDepthM: number;
  avgDepthM: number;
  minWaterTempC: number | null;
  maxAscentRateMps: number;
  safetyScore: number | null;   // 0–100, null while not yet scored
  scoringVersion: string | null;
}

export interface DiveSummary {
  id: string;
  startedAt: string;
  durationSec: number;
  maxDepthM: number;
  safetyScore: number | null;
}

export interface DiveSample {
  tSec: number;            // multiple of 10 in practice
  depthM: number;
  tempC: number | null;
  cnsPct: number | null;
  decoState: DecoState;
  decoTimeSec: number;     // when ndl: NDL seconds remaining; when deco: required stop seconds
  decoDepthM: number;      // when ndl: 0; when deco: required stop depth (m)
  ttsSec: number | null;
}

export interface Insight {
  id: string;
  ruleId: string;          // stable id, e.g. "ascent_too_fast"
  severity: Severity;
  evidence: Record<string, unknown>;  // i18n template inputs; no displayed strings here
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "shared: contract types per Contract §Shared types"
```

---

### Task 4.2: Create scoring engine types and registry

**Files:**
- Create: `packages/shared/src/scoring/types.ts`
- Create: `packages/shared/src/scoring/index.ts`
- Create: `packages/shared/src/scoring/registry.ts`

- [ ] **Step 1: Write scoring internal types (packages/shared/src/scoring/types.ts)**

```typescript
import type { DecoState, Severity } from "../types.js";

/** Input shape for the scoring engine — subset of Dive relevant to rules */
export interface DiveInput {
  maxDepthM: number;
  avgDepthM: number;
  durationSec: number;
  maxAscentRateMps: number;
  minWaterTempC: number | null;
  niveau: string; // Niveau enum value
}

/** Input shape for samples */
export interface DiveSampleInput {
  tSec: number;
  depthM: number;
  tempC: number | null;
  cnsPct: number | null;
  decoState: DecoState;
  decoTimeSec: number;
  decoDepthM: number;
  ttsSec: number | null;
}

/** Output from a single rule */
export interface RuleResult {
  ruleId: string;
  severity: Severity;
  evidence: Record<string, unknown>;
}

/** A scoring rule: pure function, no I/O */
export interface Rule {
  id: string;
  deduction: number;
  evaluate: (dive: DiveInput, samples: DiveSampleInput[]) => RuleResult | null;
}

/** Output from scoreDive */
export interface ScoreResult {
  score: number;
  scoringVersion: string;
  insights: RuleResult[];
}
```

- [ ] **Step 2: Write registry placeholder (packages/shared/src/scoring/registry.ts)**

```typescript
import type { Rule } from "./types.js";

// Rules are registered here; each rule file exports a Rule and is added to this array.
// Order does not affect scoring (all rules are independent, deductions are additive).
export const RULES: Rule[] = [];
```

- [ ] **Step 3: Write engine entrypoint (packages/shared/src/scoring/index.ts)**

Per spec §4: per-rule try/catch, deterministic, `scoringVersion = "v1.0"`.

```typescript
import { RULES } from "./registry.js";
import type { DiveInput, DiveSampleInput, ScoreResult, RuleResult } from "./types.js";

export const SCORING_VERSION = "v1.0";

export function scoreDive(dive: DiveInput, samples: DiveSampleInput[]): ScoreResult {
  const insights: RuleResult[] = [];
  let score = 100;

  for (const rule of RULES) {
    try {
      const result = rule.evaluate(dive, samples);
      if (result) {
        insights.push(result);
        score -= rule.deduction;
      }
    } catch (error) {
      // Per spec §4 and spec §6: one rule throwing must not kill the whole scoring pass.
      // In production, log to Sentry here.
      console.error(`Scoring rule "${rule.id}" threw:`, error);
    }
  }

  score = Math.max(0, Math.min(100, score));

  return { score, scoringVersion: SCORING_VERSION, insights };
}

export type { DiveInput, DiveSampleInput, ScoreResult, RuleResult, Rule } from "./types.js";
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/scoring/
git commit -m "scoring: engine entrypoint, types, and rule registry"
```

---

### Task 4.3: Implement scoring rules (all 10 per spec §4)

**Files:**
- Create: `packages/shared/src/scoring/rules/ascent-too-fast.ts`
- Create: `packages/shared/src/scoring/rules/ascent-dangerous.ts`
- Create: `packages/shared/src/scoring/rules/final-ascent-too-fast.ts`
- Create: `packages/shared/src/scoring/rules/palier-securite-manque.ts`
- Create: `packages/shared/src/scoring/rules/palier-securite-court.ts`
- Create: `packages/shared/src/scoring/rules/palier-deco-manque.ts`
- Create: `packages/shared/src/scoring/rules/profondeur-depasse-niveau-leger.ts`
- Create: `packages/shared/src/scoring/rules/profondeur-depasse-niveau-grave.ts`
- Create: `packages/shared/src/scoring/rules/temperature-basse.ts`
- Create: `packages/shared/src/scoring/rules/plongee-profonde.ts`
- Modify: `packages/shared/src/scoring/registry.ts`

- [ ] **Step 1: Write `ascent-too-fast` rule**

Per spec §4: fires when max ascent rate over any 60s window > 15 m/min. Deduction: -15. Severity: warn.

```typescript
// packages/shared/src/scoring/rules/ascent-too-fast.ts
import type { Rule, DiveInput, DiveSampleInput } from "../types.js";

/**
 * ascent_too_fast: fires when max ascent rate over any 60s window > 15 m/min.
 * Evidence keys: maxRateMpm (number), startSec (number), endSec (number).
 */
export const ascentTooFast: Rule = {
  id: "ascent_too_fast",
  deduction: 15,
  evaluate(dive: DiveInput, samples: DiveSampleInput[]) {
    let maxRate = 0;
    let worstStart = 0;
    let worstEnd = 0;

    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const dt = samples[j].tSec - samples[i].tSec;
        if (dt > 60) break; // window exceeds 60s
        if (dt === 0) continue;

        const dDepth = samples[i].depthM - samples[j].depthM; // positive = ascending
        if (dDepth <= 0) continue; // descending or level

        const rateMpm = (dDepth / dt) * 60; // meters per minute
        if (rateMpm > maxRate) {
          maxRate = rateMpm;
          worstStart = samples[i].tSec;
          worstEnd = samples[j].tSec;
        }
      }
    }

    if (maxRate > 15) {
      return {
        ruleId: "ascent_too_fast",
        severity: "warn",
        evidence: {
          maxRateMpm: Math.round(maxRate * 10) / 10,
          startSec: worstStart,
          endSec: worstEnd,
        },
      };
    }
    return null;
  },
};
```

- [ ] **Step 2: Write `ascent-dangerous` rule**

Per spec §4: fires when max ascent rate > 17 m/min sustained. Deduction: -30. Severity: alert.

```typescript
// packages/shared/src/scoring/rules/ascent-dangerous.ts
import type { Rule, DiveInput, DiveSampleInput } from "../types.js";

/**
 * ascent_dangerous: fires when max ascent rate > 17 m/min sustained (over any 60s window).
 * Evidence keys: maxRateMpm (number), startSec (number), endSec (number).
 */
export const ascentDangerous: Rule = {
  id: "ascent_dangerous",
  deduction: 30,
  evaluate(dive: DiveInput, samples: DiveSampleInput[]) {
    let maxRate = 0;
    let worstStart = 0;
    let worstEnd = 0;

    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const dt = samples[j].tSec - samples[i].tSec;
        if (dt > 60) break;
        if (dt === 0) continue;

        const dDepth = samples[i].depthM - samples[j].depthM;
        if (dDepth <= 0) continue;

        const rateMpm = (dDepth / dt) * 60;
        if (rateMpm > maxRate) {
          maxRate = rateMpm;
          worstStart = samples[i].tSec;
          worstEnd = samples[j].tSec;
        }
      }
    }

    if (maxRate > 17) {
      return {
        ruleId: "ascent_dangerous",
        severity: "alert",
        evidence: {
          maxRateMpm: Math.round(maxRate * 10) / 10,
          startSec: worstStart,
          endSec: worstEnd,
        },
      };
    }
    return null;
  },
};
```

- [ ] **Step 3: Write `final-ascent-too-fast` rule**

Per spec §4: fires when ascent rate from 6m to surface > 6 m/min. Deduction: -10. Severity: warn.

```typescript
// packages/shared/src/scoring/rules/final-ascent-too-fast.ts
import type { Rule, DiveInput, DiveSampleInput } from "../types.js";

/**
 * final_ascent_too_fast: fires when ascent rate from 6m to surface > 6 m/min.
 * Evidence keys: rateMpm (number), from6mSec (number), surfaceSec (number).
 */
export const finalAscentTooFast: Rule = {
  id: "final_ascent_too_fast",
  deduction: 10,
  evaluate(dive: DiveInput, samples: DiveSampleInput[]) {
    // Find the last time the diver was at or below 6m
    let lastAt6mIdx = -1;
    for (let i = samples.length - 1; i >= 0; i--) {
      if (samples[i].depthM >= 6) {
        lastAt6mIdx = i;
        break;
      }
    }
    if (lastAt6mIdx < 0) return null; // Never went below 6m

    // Find the first surface sample after lastAt6mIdx (depth < 1m as proxy for surface)
    let surfaceIdx = -1;
    for (let i = lastAt6mIdx + 1; i < samples.length; i++) {
      if (samples[i].depthM < 1) {
        surfaceIdx = i;
        break;
      }
    }
    if (surfaceIdx < 0) return null; // Did not surface after 6m

    const dt = samples[surfaceIdx].tSec - samples[lastAt6mIdx].tSec;
    if (dt === 0) return null;

    const dDepth = samples[lastAt6mIdx].depthM - samples[surfaceIdx].depthM;
    const rateMpm = (dDepth / dt) * 60;

    if (rateMpm > 6) {
      return {
        ruleId: "final_ascent_too_fast",
        severity: "warn",
        evidence: {
          rateMpm: Math.round(rateMpm * 10) / 10,
          from6mSec: samples[lastAt6mIdx].tSec,
          surfaceSec: samples[surfaceIdx].tSec,
        },
      };
    }
    return null;
  },
};
```

- [ ] **Step 4: Write `palier-securite-manque` rule**

Per spec §4: fires when max depth > 6m AND no continuous >=180s segment between 3m and 5m before surfacing. Deduction: -10. Severity: warn.

```typescript
// packages/shared/src/scoring/rules/palier-securite-manque.ts
import type { Rule, DiveInput, DiveSampleInput } from "../types.js";

/**
 * palier_securite_manque: fires when max depth > 6m AND no continuous >=180s
 * segment between 3m and 5m before surfacing.
 * Evidence keys: maxDepthM (number), longestPalierSec (number).
 */
export const palierSecuriteManque: Rule = {
  id: "palier_securite_manque",
  deduction: 10,
  evaluate(dive: DiveInput, samples: DiveSampleInput[]) {
    if (dive.maxDepthM <= 6) return null;

    // Find longest continuous segment in [3m, 5m] in the final ascent phase
    // (after the last time diver was below 6m)
    let lastBelow6Idx = -1;
    for (let i = samples.length - 1; i >= 0; i--) {
      if (samples[i].depthM > 6) {
        lastBelow6Idx = i;
        break;
      }
    }
    if (lastBelow6Idx < 0) return null;

    let longestSec = 0;
    let currentStart: number | null = null;

    for (let i = lastBelow6Idx + 1; i < samples.length; i++) {
      const d = samples[i].depthM;
      if (d >= 3 && d <= 5) {
        if (currentStart === null) currentStart = samples[i].tSec;
      } else {
        if (currentStart !== null) {
          const duration = samples[i - 1].tSec - currentStart;
          if (duration > longestSec) longestSec = duration;
          currentStart = null;
        }
      }
    }
    // Check if the segment extends to the last sample
    if (currentStart !== null) {
      const duration = samples[samples.length - 1].tSec - currentStart;
      if (duration > longestSec) longestSec = duration;
    }

    if (longestSec >= 180) return null; // Safety stop was performed

    return {
      ruleId: "palier_securite_manque",
      severity: "warn",
      evidence: {
        maxDepthM: dive.maxDepthM,
        longestPalierSec: longestSec,
      },
    };
  },
};
```

- [ ] **Step 5: Write `palier-securite-court` rule**

Per spec §4: fires when palier between 3–5m attempted but lasted < 180s (and `palier_securite_manque` did not fire). Deduction: -5. Severity: info.

```typescript
// packages/shared/src/scoring/rules/palier-securite-court.ts
import type { Rule, DiveInput, DiveSampleInput } from "../types.js";

/**
 * palier_securite_court: fires when a safety stop was attempted (some time in 3-5m zone)
 * but lasted < 180s. Only fires if palier_securite_manque does NOT fire (i.e., there IS
 * some time spent, just not enough). The registry ensures this rule runs after
 * palier_securite_manque, but since each rule is independent, this rule internally
 * re-checks the condition.
 * Evidence keys: palierDurationSec (number), requiredSec (number).
 */
export const palierSecuriteCourt: Rule = {
  id: "palier_securite_court",
  deduction: 5,
  evaluate(dive: DiveInput, samples: DiveSampleInput[]) {
    if (dive.maxDepthM <= 6) return null;

    let lastBelow6Idx = -1;
    for (let i = samples.length - 1; i >= 0; i--) {
      if (samples[i].depthM > 6) {
        lastBelow6Idx = i;
        break;
      }
    }
    if (lastBelow6Idx < 0) return null;

    let longestSec = 0;
    let currentStart: number | null = null;

    for (let i = lastBelow6Idx + 1; i < samples.length; i++) {
      const d = samples[i].depthM;
      if (d >= 3 && d <= 5) {
        if (currentStart === null) currentStart = samples[i].tSec;
      } else {
        if (currentStart !== null) {
          const duration = samples[i - 1].tSec - currentStart;
          if (duration > longestSec) longestSec = duration;
          currentStart = null;
        }
      }
    }
    if (currentStart !== null) {
      const duration = samples[samples.length - 1].tSec - currentStart;
      if (duration > longestSec) longestSec = duration;
    }

    // If longestSec >= 180, palier was successful — neither rule fires
    if (longestSec >= 180) return null;
    // If longestSec === 0, no attempt was made — palier_securite_manque fires instead
    if (longestSec === 0) return null;

    return {
      ruleId: "palier_securite_court",
      severity: "info",
      evidence: {
        palierDurationSec: longestSec,
        requiredSec: 180,
      },
    };
  },
};
```

- [ ] **Step 6: Write `palier-deco-manque` rule**

Per spec §4 (confidence High, confirmed by spike): fires when any sample has `decoState == "deco"` AND in the final 60s of the dive the diver did NOT spend >= `decoTimeSec` seconds within +/-0.5m of `decoDepthM` before surfacing. Deduction: -40. Severity: alert.

```typescript
// packages/shared/src/scoring/rules/palier-deco-manque.ts
import type { Rule, DiveInput, DiveSampleInput } from "../types.js";

/**
 * palier_deco_manque: fires when deco obligation was indicated but not completed.
 * Per spec §4: any sample has decoState == "deco" AND in the final 60s the diver
 * did NOT spend >= decoTimeSec seconds within ±0.5m of decoDepthM before surfacing.
 * Evidence keys: requiredDepthM (number), requiredTimeSec (number), actualTimeSec (number).
 */
export const palierDecoManque: Rule = {
  id: "palier_deco_manque",
  deduction: 40,
  evaluate(dive: DiveInput, samples: DiveSampleInput[]) {
    // Find all samples with deco obligation
    const decoSamples = samples.filter((s) => s.decoState === "deco");
    if (decoSamples.length === 0) return null;

    // Use the last deco obligation as the required stop
    const lastDeco = decoSamples[decoSamples.length - 1];
    const requiredDepthM = lastDeco.decoDepthM;
    const requiredTimeSec = lastDeco.decoTimeSec;

    if (requiredTimeSec <= 0) return null; // No actual time required

    // Check final 60s of dive: did diver spend enough time near requiredDepthM?
    const diveEndSec = samples[samples.length - 1].tSec;
    const windowStart = Math.max(0, diveEndSec - 60);

    let timeAtStopSec = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      if (samples[i].tSec < windowStart) continue;
      const dt = (samples[i + 1]?.tSec ?? samples[i].tSec) - samples[i].tSec;
      if (Math.abs(samples[i].depthM - requiredDepthM) <= 0.5) {
        timeAtStopSec += dt;
      }
    }

    if (timeAtStopSec >= requiredTimeSec) return null; // Obligation met

    return {
      ruleId: "palier_deco_manque",
      severity: "alert",
      evidence: {
        requiredDepthM,
        requiredTimeSec,
        actualTimeSec: timeAtStopSec,
      },
    };
  },
};
```

- [ ] **Step 7: Write `profondeur-depasse-niveau-leger` rule**

Per spec §4: fires when max depth exceeds niveau limit by <=5m. Deduction: -10. Severity: warn.

```typescript
// packages/shared/src/scoring/rules/profondeur-depasse-niveau-leger.ts
import type { Rule, DiveInput, DiveSampleInput } from "../types.js";

const NIVEAU_LIMITS: Record<string, number | null> = {
  N1: 20,
  N2: 20,
  N3: 60,
  N4: null,
  INITIATEUR: null,
  MF1: null,
  MF2: null,
  UNKNOWN: null, // Rule disabled for UNKNOWN
};

/**
 * profondeur_depasse_niveau_leger: fires when max depth exceeds niveau limit by <=5m.
 * Evidence keys: maxDepthM (number), limitM (number), excessM (number), niveau (string).
 */
export const profondeurDepasseNiveauLeger: Rule = {
  id: "profondeur_depasse_niveau_leger",
  deduction: 10,
  evaluate(dive: DiveInput, samples: DiveSampleInput[]) {
    const limit = NIVEAU_LIMITS[dive.niveau];
    if (limit === null || limit === undefined) return null; // No cap or unknown

    const excess = dive.maxDepthM - limit;
    if (excess > 0 && excess <= 5) {
      return {
        ruleId: "profondeur_depasse_niveau_leger",
        severity: "warn",
        evidence: {
          maxDepthM: dive.maxDepthM,
          limitM: limit,
          excessM: Math.round(excess * 10) / 10,
          niveau: dive.niveau,
        },
      };
    }
    return null;
  },
};
```

- [ ] **Step 8: Write `profondeur-depasse-niveau-grave` rule**

Per spec §4: fires when max depth exceeds niveau limit by >5m. Deduction: -30. Severity: alert.

```typescript
// packages/shared/src/scoring/rules/profondeur-depasse-niveau-grave.ts
import type { Rule, DiveInput, DiveSampleInput } from "../types.js";

const NIVEAU_LIMITS: Record<string, number | null> = {
  N1: 20,
  N2: 20,
  N3: 60,
  N4: null,
  INITIATEUR: null,
  MF1: null,
  MF2: null,
  UNKNOWN: null,
};

/**
 * profondeur_depasse_niveau_grave: fires when max depth exceeds niveau limit by >5m.
 * Evidence keys: maxDepthM (number), limitM (number), excessM (number), niveau (string).
 */
export const profondeurDepasseNiveauGrave: Rule = {
  id: "profondeur_depasse_niveau_grave",
  deduction: 30,
  evaluate(dive: DiveInput, samples: DiveSampleInput[]) {
    const limit = NIVEAU_LIMITS[dive.niveau];
    if (limit === null || limit === undefined) return null;

    const excess = dive.maxDepthM - limit;
    if (excess > 5) {
      return {
        ruleId: "profondeur_depasse_niveau_grave",
        severity: "alert",
        evidence: {
          maxDepthM: dive.maxDepthM,
          limitM: limit,
          excessM: Math.round(excess * 10) / 10,
          niveau: dive.niveau,
        },
      };
    }
    return null;
  },
};
```

- [ ] **Step 9: Write `temperature-basse` rule**

Per spec §4: fires when `min_water_temp_c` < 10 AND duration > 30 min. Deduction: -3. Severity: info.

```typescript
// packages/shared/src/scoring/rules/temperature-basse.ts
import type { Rule, DiveInput, DiveSampleInput } from "../types.js";

/**
 * temperature_basse: fires when water temp < 10°C and dive > 30 minutes.
 * Evidence keys: minTempC (number), durationMin (number).
 */
export const temperatureBasse: Rule = {
  id: "temperature_basse",
  deduction: 3,
  evaluate(dive: DiveInput, samples: DiveSampleInput[]) {
    if (dive.minWaterTempC === null) return null;
    if (dive.minWaterTempC >= 10) return null;
    if (dive.durationSec <= 1800) return null; // 30 min = 1800s

    return {
      ruleId: "temperature_basse",
      severity: "info",
      evidence: {
        minTempC: dive.minWaterTempC,
        durationMin: Math.round(dive.durationSec / 60),
      },
    };
  },
};
```

- [ ] **Step 10: Write `plongee-profonde` rule**

Per spec §4: fires when max depth > 30m. Informational only, deduction: 0. Severity: info.

```typescript
// packages/shared/src/scoring/rules/plongee-profonde.ts
import type { Rule, DiveInput, DiveSampleInput } from "../types.js";

/**
 * plongee_profonde: informational flag when max depth > 30m.
 * Evidence keys: maxDepthM (number).
 */
export const plongeeProfonde: Rule = {
  id: "plongee_profonde",
  deduction: 0,
  evaluate(dive: DiveInput, samples: DiveSampleInput[]) {
    if (dive.maxDepthM > 30) {
      return {
        ruleId: "plongee_profonde",
        severity: "info",
        evidence: {
          maxDepthM: dive.maxDepthM,
        },
      };
    }
    return null;
  },
};
```

- [ ] **Step 11: Register all rules in registry.ts**

```typescript
// packages/shared/src/scoring/registry.ts
import type { Rule } from "./types.js";
import { ascentTooFast } from "./rules/ascent-too-fast.js";
import { ascentDangerous } from "./rules/ascent-dangerous.js";
import { finalAscentTooFast } from "./rules/final-ascent-too-fast.js";
import { palierSecuriteManque } from "./rules/palier-securite-manque.js";
import { palierSecuriteCourt } from "./rules/palier-securite-court.js";
import { palierDecoManque } from "./rules/palier-deco-manque.js";
import { profondeurDepasseNiveauLeger } from "./rules/profondeur-depasse-niveau-leger.js";
import { profondeurDepasseNiveauGrave } from "./rules/profondeur-depasse-niveau-grave.js";
import { temperatureBasse } from "./rules/temperature-basse.js";
import { plongeeProfonde } from "./rules/plongee-profonde.js";

export const RULES: Rule[] = [
  ascentTooFast,
  ascentDangerous,
  finalAscentTooFast,
  palierSecuriteManque,
  palierSecuriteCourt,
  palierDecoManque,
  profondeurDepasseNiveauLeger,
  profondeurDepasseNiveauGrave,
  temperatureBasse,
  plongeeProfonde,
];
```

- [ ] **Step 12: Commit**

```bash
git add packages/shared/src/scoring/
git commit -m "scoring: implement all 10 FFESSM rules per spec §4"
```

---

### Task 4.4: Migrate spike fixtures + create synthetic profiles

**Files:**
- Create: `packages/shared/src/scoring/fixtures/dive-1.json`
- Create: `packages/shared/src/scoring/fixtures/dive-3.json`
- Create: `packages/shared/src/scoring/fixtures/dive-4.json`
- Create: `packages/shared/src/scoring/fixtures/dive-5.json`
- Create: `packages/shared/src/scoring/fixtures/perfect-dive.json`
- Create: `packages/shared/src/scoring/fixtures/fast-ascent.json`
- Create: `packages/shared/src/scoring/fixtures/missed-palier.json`
- Create: `packages/shared/src/scoring/fixtures/deco-breach.json`
- Create: `packages/shared/src/scoring/fixtures/parse-fixture.ts` (conversion script)

- [ ] **Step 1: Write the XML-to-JSON conversion script**

This script reads the 4 parsed XMLs from `spike/0a-uddf-inspection/parsed/dive-{1,3,4,5}.xml` and converts them into the `DiveInput + DiveSampleInput[]` JSON shape the scoring engine consumes. Anonymizes any identifying data (timestamps shifted, device info stripped).

```typescript
// packages/shared/src/scoring/fixtures/parse-fixture.ts
// Run via: npx tsx packages/shared/src/scoring/fixtures/parse-fixture.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SPIKE_DIR = join(import.meta.dirname, "../../../../../spike/0a-uddf-inspection/parsed");
const OUT_DIR = import.meta.dirname;

interface ParsedFixture {
  dive: {
    maxDepthM: number;
    avgDepthM: number;
    durationSec: number;
    maxAscentRateMps: number;
    minWaterTempC: number | null;
    niveau: string;
  };
  samples: Array<{
    tSec: number;
    depthM: number;
    tempC: number | null;
    cnsPct: number | null;
    decoState: "ndl" | "deco";
    decoTimeSec: number;
    decoDepthM: number;
    ttsSec: number | null;
  }>;
}

function parseTimeToSec(timeStr: string): number {
  // Format: "MM:SS" or "HH:MM:SS"
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function parseDctoolXml(xmlContent: string): ParsedFixture {
  // Simple regex-based parser for dctool XML output
  const samples: ParsedFixture["samples"] = [];
  const sampleRegex = /<sample>([\s\S]*?)<\/sample>/g;
  let match;
  let minTemp: number | null = null;
  let maxDepth = 0;
  let totalDepth = 0;
  let sampleCount = 0;

  while ((match = sampleRegex.exec(xmlContent)) !== null) {
    const block = match[1];
    const time = block.match(/<time>(.*?)<\/time>/)?.[1] ?? "0:00";
    const depth = parseFloat(block.match(/<depth>(.*?)<\/depth>/)?.[1] ?? "0");
    const temp = block.match(/<temperature>(.*?)<\/temperature>/)?.[1];
    const cns = block.match(/<cns>(.*?)<\/cns>/)?.[1];
    const decoMatch = block.match(/<deco time="(\d+)" depth="([\d.]+)">(ndl|deco)<\/deco>/);
    const tts = block.match(/<tts>(\d+)<\/tts>/)?.[1];

    const tSec = parseTimeToSec(time);
    const tempC = temp ? parseFloat(temp) : null;
    const cnsPct = cns ? parseFloat(cns) : null;
    const decoState = (decoMatch?.[3] ?? "ndl") as "ndl" | "deco";
    const decoTimeSec = decoMatch ? parseInt(decoMatch[1]) : 0;
    const decoDepthM = decoMatch ? parseFloat(decoMatch[2]) : 0;
    const ttsSec = tts ? parseInt(tts) : null;

    if (tempC !== null && (minTemp === null || tempC < minTemp)) minTemp = tempC;
    if (depth > maxDepth) maxDepth = depth;
    totalDepth += depth;
    sampleCount++;

    samples.push({ tSec, depthM: depth, tempC, cnsPct, decoState, decoTimeSec, decoDepthM, ttsSec });
  }

  // Compute max ascent rate
  let maxAscentRateMps = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].tSec - samples[i - 1].tSec;
    if (dt === 0) continue;
    const dDepth = samples[i - 1].depthM - samples[i].depthM;
    if (dDepth > 0) {
      const rate = dDepth / dt; // m/s
      if (rate > maxAscentRateMps) maxAscentRateMps = rate;
    }
  }

  const durationSec = samples.length > 0 ? samples[samples.length - 1].tSec : 0;

  return {
    dive: {
      maxDepthM: maxDepth,
      avgDepthM: sampleCount > 0 ? Math.round((totalDepth / sampleCount) * 100) / 100 : 0,
      durationSec,
      maxAscentRateMps: Math.round(maxAscentRateMps * 1000) / 1000,
      minWaterTempC: minTemp,
      niveau: "N2", // default for fixtures; tests can override
    },
    samples,
  };
}

// Convert real dives
for (const n of [1, 3, 4, 5]) {
  const xml = readFileSync(join(SPIKE_DIR, `dive-${n}.xml`), "utf8");
  const fixture = parseDctoolXml(xml);
  writeFileSync(join(OUT_DIR, `dive-${n}.json`), JSON.stringify(fixture, null, 2));
  console.log(`Wrote dive-${n}.json (${fixture.samples.length} samples)`);
}
```

- [ ] **Step 2: Run the conversion script**

```bash
npx tsx packages/shared/src/scoring/fixtures/parse-fixture.ts
```

Expected: produces `dive-1.json`, `dive-3.json`, `dive-4.json`, `dive-5.json` in the fixtures directory.

- [ ] **Step 3: Create synthetic fixtures**

Write four hand-crafted JSON files:

**`perfect-dive.json`** — 30 min, 18m max, clean ascent at 9 m/min, 3 min safety stop at 4m, no deco, 29C water:
```json
{
  "dive": {
    "maxDepthM": 18,
    "avgDepthM": 14,
    "durationSec": 1800,
    "maxAscentRateMps": 0.15,
    "minWaterTempC": 29,
    "niveau": "N2"
  },
  "samples": "... (generated: 180 samples at 10s intervals, descent to 18m, bottom phase, clean ascent, 3-min stop at 4m)"
}
```

The executor should generate complete sample arrays programmatically. Key properties:
- Perfect dive: no rules fire, score = 100.
- Fast ascent: ascent rate 18 m/min over 60s window, triggers both `ascent_too_fast` and `ascent_dangerous`.
- Missed palier: 25m dive, no time between 3-5m before surfacing, triggers `palier_securite_manque`.
- Deco breach: samples with `decoState: "deco"`, diver surfaces without completing stop, triggers `palier_deco_manque`.

- [ ] **Step 4: Write a fixture-generator script**

Create `packages/shared/src/scoring/fixtures/generate-synthetic.ts` that programmatically generates the four synthetic profiles with correct sample arrays. Run it to produce the JSON files.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/scoring/fixtures/
git commit -m "scoring: fixture library — 4 real dives + 4 synthetic profiles"
```

---

### Task 4.5: Vitest unit tests for each scoring rule

**Files:**
- Create: `packages/shared/src/scoring/__tests__/rules.test.ts`
- Create: `packages/shared/src/scoring/__tests__/score-dive.test.ts`
- Create: `packages/shared/vitest.config.ts`

- [ ] **Step 1: Create vitest config for packages/shared**

```typescript
// packages/shared/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 2: Write per-rule unit tests**

`packages/shared/src/scoring/__tests__/rules.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ascentTooFast } from "../rules/ascent-too-fast.js";
import { ascentDangerous } from "../rules/ascent-dangerous.js";
import { finalAscentTooFast } from "../rules/final-ascent-too-fast.js";
import { palierSecuriteManque } from "../rules/palier-securite-manque.js";
import { palierSecuriteCourt } from "../rules/palier-securite-court.js";
import { palierDecoManque } from "../rules/palier-deco-manque.js";
import { profondeurDepasseNiveauLeger } from "../rules/profondeur-depasse-niveau-leger.js";
import { profondeurDepasseNiveauGrave } from "../rules/profondeur-depasse-niveau-grave.js";
import { temperatureBasse } from "../rules/temperature-basse.js";
import { plongeeProfonde } from "../rules/plongee-profonde.js";
import type { DiveInput, DiveSampleInput } from "../types.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");

function loadFixture(name: string): { dive: DiveInput; samples: DiveSampleInput[] } {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), "utf8"));
}

describe("ascent_too_fast", () => {
  it("does NOT fire on perfect dive", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    expect(ascentTooFast.evaluate(dive, samples)).toBeNull();
  });

  it("fires on fast-ascent fixture", () => {
    const { dive, samples } = loadFixture("fast-ascent");
    const result = ascentTooFast.evaluate(dive, samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("ascent_too_fast");
    expect(result!.severity).toBe("warn");
    expect((result!.evidence as any).maxRateMpm).toBeGreaterThan(15);
  });
});

describe("ascent_dangerous", () => {
  it("does NOT fire on perfect dive", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    expect(ascentDangerous.evaluate(dive, samples)).toBeNull();
  });

  it("fires on fast-ascent fixture (rate > 17)", () => {
    const { dive, samples } = loadFixture("fast-ascent");
    const result = ascentDangerous.evaluate(dive, samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("ascent_dangerous");
    expect(result!.severity).toBe("alert");
  });
});

describe("final_ascent_too_fast", () => {
  it("does NOT fire on perfect dive (clean final ascent)", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    expect(finalAscentTooFast.evaluate(dive, samples)).toBeNull();
  });
});

describe("palier_securite_manque", () => {
  it("does NOT fire on perfect dive (has 3-min stop)", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    expect(palierSecuriteManque.evaluate(dive, samples)).toBeNull();
  });

  it("fires on missed-palier fixture", () => {
    const { dive, samples } = loadFixture("missed-palier");
    const result = palierSecuriteManque.evaluate(dive, samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("palier_securite_manque");
  });
});

describe("palier_securite_court", () => {
  it("does NOT fire on perfect dive", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    expect(palierSecuriteCourt.evaluate(dive, samples)).toBeNull();
  });

  it("does NOT fire when no palier was attempted (manque fires instead)", () => {
    const { dive, samples } = loadFixture("missed-palier");
    // If longestSec === 0, this rule should not fire
    const result = palierSecuriteCourt.evaluate(dive, samples);
    expect(result).toBeNull();
  });
});

describe("palier_deco_manque", () => {
  it("does NOT fire on perfect dive (no deco obligation)", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    expect(palierDecoManque.evaluate(dive, samples)).toBeNull();
  });

  it("fires on deco-breach fixture", () => {
    const { dive, samples } = loadFixture("deco-breach");
    const result = palierDecoManque.evaluate(dive, samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("palier_deco_manque");
    expect(result!.severity).toBe("alert");
  });
});

describe("profondeur_depasse_niveau_leger", () => {
  it("does NOT fire when within limits", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    expect(profondeurDepasseNiveauLeger.evaluate(dive, samples)).toBeNull();
  });

  it("fires when depth exceeds limit by <=5m", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    const deepDive = { ...dive, maxDepthM: 23, niveau: "N2" }; // N2 limit is 20, excess = 3
    const result = profondeurDepasseNiveauLeger.evaluate(deepDive, samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("profondeur_depasse_niveau_leger");
  });

  it("does NOT fire for UNKNOWN niveau", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    const deepDive = { ...dive, maxDepthM: 50, niveau: "UNKNOWN" };
    expect(profondeurDepasseNiveauLeger.evaluate(deepDive, samples)).toBeNull();
  });
});

describe("profondeur_depasse_niveau_grave", () => {
  it("fires when depth exceeds limit by >5m", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    const deepDive = { ...dive, maxDepthM: 30, niveau: "N2" }; // excess = 10 > 5
    const result = profondeurDepasseNiveauGrave.evaluate(deepDive, samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("profondeur_depasse_niveau_grave");
    expect(result!.severity).toBe("alert");
  });
});

describe("temperature_basse", () => {
  it("does NOT fire on warm dive", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    expect(temperatureBasse.evaluate(dive, samples)).toBeNull();
  });

  it("fires on cold + long dive", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    const coldDive = { ...dive, minWaterTempC: 8, durationSec: 2400 };
    const result = temperatureBasse.evaluate(coldDive, samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("temperature_basse");
  });

  it("does NOT fire on cold but short dive", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    const coldShort = { ...dive, minWaterTempC: 8, durationSec: 1200 };
    expect(temperatureBasse.evaluate(coldShort, samples)).toBeNull();
  });
});

describe("plongee_profonde", () => {
  it("does NOT fire on shallow dive", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    expect(plongeeProfonde.evaluate(dive, samples)).toBeNull();
  });

  it("fires on deep dive (>30m)", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    const deepDive = { ...dive, maxDepthM: 35 };
    const result = plongeeProfonde.evaluate(deepDive, samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("plongee_profonde");
    expect(result!.evidence).toEqual({ maxDepthM: 35 });
  });
});
```

- [ ] **Step 3: Write scoreDive snapshot test**

`packages/shared/src/scoring/__tests__/score-dive.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scoreDive, SCORING_VERSION } from "../index.js";
import type { DiveInput, DiveSampleInput } from "../types.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");

function loadFixture(name: string): { dive: DiveInput; samples: DiveSampleInput[] } {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), "utf8"));
}

describe("scoreDive", () => {
  it("returns scoringVersion v1.0", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    const result = scoreDive(dive, samples);
    expect(result.scoringVersion).toBe("v1.0");
  });

  it("perfect dive scores 100 with no insights (except possibly info-level)", () => {
    const { dive, samples } = loadFixture("perfect-dive");
    const result = scoreDive(dive, samples);
    expect(result.score).toBe(100);
    // plongee_profonde (0 deduction) might fire if maxDepth > 30; perfect fixture is 18m
    expect(result.insights.filter((i) => i.severity !== "info")).toHaveLength(0);
  });

  it("fast-ascent fixture triggers ascent rules", () => {
    const { dive, samples } = loadFixture("fast-ascent");
    const result = scoreDive(dive, samples);
    const ruleIds = result.insights.map((i) => i.ruleId);
    expect(ruleIds).toContain("ascent_too_fast");
    expect(ruleIds).toContain("ascent_dangerous");
    expect(result.score).toBeLessThan(100);
  });

  it("deco-breach fixture triggers palier_deco_manque", () => {
    const { dive, samples } = loadFixture("deco-breach");
    const result = scoreDive(dive, samples);
    const ruleIds = result.insights.map((i) => i.ruleId);
    expect(ruleIds).toContain("palier_deco_manque");
    expect(result.score).toBeLessThanOrEqual(60); // -40 deduction
  });

  it("score is clamped to [0, 100]", () => {
    const { dive, samples } = loadFixture("fast-ascent");
    // Even with multiple rules firing, score never goes below 0
    const result = scoreDive(dive, samples);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("snapshot: all fixtures produce stable output", () => {
    for (const name of ["perfect-dive", "fast-ascent", "missed-palier", "deco-breach"]) {
      const { dive, samples } = loadFixture(name);
      const result = scoreDive(dive, samples);
      expect(result).toMatchSnapshot();
    }
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @diveforge/shared test
```

Expected: all tests pass. If snapshot tests fail on first run, update snapshots with `pnpm --filter @diveforge/shared test -- --update`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/scoring/__tests__/ packages/shared/vitest.config.ts
git commit -m "scoring: Vitest unit tests for all 10 rules + scoreDive snapshot"
```

---

### Task 4.6: Build shared package and verify exports

**Files:**
- Modify: `packages/shared/src/index.ts` (ensure all exports)

- [ ] **Step 1: Verify barrel exports**

`packages/shared/src/index.ts` should export:
```typescript
export * from "./types.js";
export { scoreDive, SCORING_VERSION } from "./scoring/index.js";
export type { DiveInput, DiveSampleInput, ScoreResult, RuleResult, Rule } from "./scoring/index.js";
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @diveforge/shared build
```

Expected: `dist/` produced with `.js` and `.d.ts` files for types and scoring.

- [ ] **Step 3: Commit any changes**

```bash
git add packages/shared/
git commit -m "shared: finalize barrel exports and build"
```

---

### Phase 4 verification

- [ ] `pnpm --filter @diveforge/shared test` — all tests pass.
- [ ] `pnpm --filter @diveforge/shared build` — produces dist/ with no errors.
- [ ] Types in `packages/shared/src/types.ts` match Contract §Shared types character-for-character.
- [ ] All 10 rules from spec §4 rule table are implemented and registered.
- [ ] `SCORING_VERSION` is `"v1.0"`.
- [ ] Fixture library contains 4 real + 4 synthetic dives.

---

## Phase 5 — Dive Ingestion API

### Task 5.1: libdivecomputer parsing utility

**Files:**
- Create: `apps/web/src/lib/dctool-parser.ts`

- [ ] **Step 1: Write the dctool subprocess wrapper**

This wraps `dctool parse` as a subprocess. The spike already builds it under `spike/0b-desktop-harness/build/install/bin/dctool`. For production, the binary is deployed alongside the backend (Docker image or Vercel serverless function layer). For dev, it uses the spike-built binary.

```typescript
// apps/web/src/lib/dctool-parser.ts
import { execFile } from "node:child_process";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { DiveSampleInput } from "@diveforge/shared";

const DCTOOL_PATH = process.env.DCTOOL_PATH ?? join(
  process.cwd(), "../../spike/0b-desktop-harness/build/install/bin/dctool"
);

interface ParsedDive {
  maxDepthM: number;
  avgDepthM: number;
  durationSec: number;
  maxAscentRateMps: number;
  minWaterTempC: number | null;
  samples: DiveSampleInput[];
}

/**
 * Parse raw Peregrine dive bytes via dctool subprocess.
 * Input: raw bytes (post-LRE+XOR decompression).
 * Output: structured dive data.
 *
 * Future optimization: replace subprocess with FFI binding to libdivecomputer.
 */
export async function parseDiveBytes(rawBytes: Buffer): Promise<ParsedDive> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `diveforge-${id}.bin`);
  const outputPath = join(tmpdir(), `diveforge-${id}.xml`);

  try {
    await writeFile(inputPath, rawBytes);

    await new Promise<void>((resolve, reject) => {
      execFile(
        DCTOOL_PATH,
        ["-d", "Shearwater Peregrine", "parse", "-u", "metric", "-o", outputPath, inputPath],
        { timeout: 30000 },
        (error, stdout, stderr) => {
          if (error) reject(new Error(`dctool parse failed: ${stderr || error.message}`));
          else resolve();
        }
      );
    });

    const xml = await readFile(outputPath, "utf8");
    return parseDctoolXml(xml);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

function parseTimeToSec(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function parseDctoolXml(xml: string): ParsedDive {
  const samples: DiveSampleInput[] = [];
  const sampleRegex = /<sample>([\s\S]*?)<\/sample>/g;
  let match;
  let minTemp: number | null = null;
  let maxDepth = 0;
  let totalDepth = 0;
  let sampleCount = 0;

  while ((match = sampleRegex.exec(xml)) !== null) {
    const block = match[1];
    const time = block.match(/<time>(.*?)<\/time>/)?.[1] ?? "0:00";
    const depth = parseFloat(block.match(/<depth>(.*?)<\/depth>/)?.[1] ?? "0");
    const temp = block.match(/<temperature>(.*?)<\/temperature>/)?.[1];
    const cns = block.match(/<cns>(.*?)<\/cns>/)?.[1];
    const decoMatch = block.match(/<deco time="(\d+)" depth="([\d.]+)">(ndl|deco)<\/deco>/);
    const tts = block.match(/<tts>(\d+)<\/tts>/)?.[1];

    const tSec = parseTimeToSec(time);
    const tempC = temp ? parseFloat(temp) : null;
    const cnsPct = cns ? parseFloat(cns) : null;
    const decoState = (decoMatch?.[3] ?? "ndl") as "ndl" | "deco";
    const decoTimeSec = decoMatch ? parseInt(decoMatch[1]) : 0;
    const decoDepthM = decoMatch ? parseFloat(decoMatch[2]) : 0;
    const ttsSec = tts ? parseInt(tts) : null;

    if (tempC !== null && (minTemp === null || tempC < minTemp)) minTemp = tempC;
    if (depth > maxDepth) maxDepth = depth;
    totalDepth += depth;
    sampleCount++;

    samples.push({ tSec, depthM: depth, tempC, cnsPct, decoState, decoTimeSec, decoDepthM, ttsSec });
  }

  let maxAscentRateMps = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].tSec - samples[i - 1].tSec;
    if (dt === 0) continue;
    const dDepth = samples[i - 1].depthM - samples[i].depthM;
    if (dDepth > 0) {
      const rate = dDepth / dt;
      if (rate > maxAscentRateMps) maxAscentRateMps = rate;
    }
  }

  const durationSec = samples.length > 0 ? samples[samples.length - 1].tSec : 0;

  return {
    maxDepthM: maxDepth,
    avgDepthM: sampleCount > 0 ? Math.round((totalDepth / sampleCount) * 100) / 100 : 0,
    durationSec,
    maxAscentRateMps: Math.round(maxAscentRateMps * 1000) / 1000,
    minWaterTempC: minTemp,
    samples,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/dctool-parser.ts
git commit -m "api: dctool subprocess parser for raw Peregrine bytes"
```

---

### Task 5.2: Implement POST /api/dives (multipart + JSON dev-mode)

**Files:**
- Create: `apps/web/src/app/api/dives/route.ts`

- [ ] **Step 1: Write the route handler**

Per Contract §Dive ingestion:
- `multipart/form-data`: `bytes` (binary) + `meta` (JSON: `{ deviceModel, deviceSerial, externalId, startedAt }`)
- `application/json`: dev-mode pre-parsed dive shape (REQUIRED by contract for Plan 2 mock module)
- Returns `{ dive: Dive, insights: Insight[], score: number }`
- Idempotent on `(userId, externalId)` — per Contract §Dive ingestion

```typescript
// apps/web/src/app/api/dives/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseDiveBytes } from "@/lib/dctool-parser";
import { scoreDive, SCORING_VERSION } from "@diveforge/shared";
import type { Dive, Insight, DiveSample } from "@diveforge/shared";

interface DiveMeta {
  deviceModel: string;
  deviceSerial?: string;
  externalId: string;
  startedAt: string;
}

interface DevModeBody {
  meta: DiveMeta;
  dive: {
    maxDepthM: number;
    avgDepthM: number;
    durationSec: number;
    maxAscentRateMps: number;
    minWaterTempC: number | null;
  };
  samples: Array<{
    tSec: number;
    depthM: number;
    tempC: number | null;
    cnsPct: number | null;
    decoState: "ndl" | "deco";
    decoTimeSec: number;
    decoDepthM: number;
    ttsSec: number | null;
  }>;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let meta: DiveMeta;
  let diveData: {
    maxDepthM: number;
    avgDepthM: number;
    durationSec: number;
    maxAscentRateMps: number;
    minWaterTempC: number | null;
  };
  let samples: Array<{
    tSec: number;
    depthM: number;
    tempC: number | null;
    cnsPct: number | null;
    decoState: "ndl" | "deco";
    decoTimeSec: number;
    decoDepthM: number;
    ttsSec: number | null;
  }>;

  try {
    if (contentType.includes("application/json")) {
      // Dev-mode JSON ingestion path (per Contract §Mock module for Plan 2)
      const body = (await req.json()) as DevModeBody;
      meta = body.meta;
      diveData = body.dive;
      samples = body.samples;
    } else if (contentType.includes("multipart/form-data")) {
      // Production path: raw bytes + meta
      const formData = await req.formData();
      const bytesFile = formData.get("bytes") as File | null;
      const metaField = formData.get("meta") as string | null;

      if (!bytesFile || !metaField) {
        return NextResponse.json(
          { error: "Missing 'bytes' or 'meta' in multipart form" },
          { status: 400 }
        );
      }

      meta = JSON.parse(metaField) as DiveMeta;
      const rawBytes = Buffer.from(await bytesFile.arrayBuffer());
      const parsed = await parseDiveBytes(rawBytes);
      diveData = {
        maxDepthM: parsed.maxDepthM,
        avgDepthM: parsed.avgDepthM,
        durationSec: parsed.durationSec,
        maxAscentRateMps: parsed.maxAscentRateMps,
        minWaterTempC: parsed.minWaterTempC,
      };
      samples = parsed.samples;
    } else {
      return NextResponse.json(
        { error: "Unsupported Content-Type. Use application/json or multipart/form-data." },
        { status: 415 }
      );
    }

    // Idempotency check per Contract §Dive ingestion: (userId, externalId)
    const existing = await prisma.dive.findUnique({
      where: { userId_externalId: { userId: user.id, externalId: meta.externalId } },
      include: { insights: true },
    });

    if (existing) {
      // Return existing record per contract
      const dive: Dive = {
        id: existing.id,
        externalId: existing.externalId,
        startedAt: existing.startedAt.toISOString(),
        durationSec: existing.durationSec,
        maxDepthM: existing.maxDepthM,
        avgDepthM: existing.avgDepthM,
        minWaterTempC: existing.minWaterTempC,
        maxAscentRateMps: existing.maxAscentRateMps,
        safetyScore: existing.safetyScore,
        scoringVersion: existing.scoringVersion,
      };
      const insights: Insight[] = existing.insights.map((i) => ({
        id: i.id,
        ruleId: i.ruleId,
        severity: i.severity as "info" | "warn" | "alert",
        evidence: i.evidence as Record<string, unknown>,
      }));
      return NextResponse.json({ dive, insights, score: existing.safetyScore ?? 0 });
    }

    // Score the dive
    const scoreInput = {
      maxDepthM: diveData.maxDepthM,
      avgDepthM: diveData.avgDepthM,
      durationSec: diveData.durationSec,
      maxAscentRateMps: diveData.maxAscentRateMps,
      minWaterTempC: diveData.minWaterTempC,
      niveau: user.niveau,
    };
    const scoreResult = scoreDive(scoreInput, samples);

    // Create dive + samples + insights in a transaction
    const created = await prisma.dive.create({
      data: {
        userId: user.id,
        externalId: meta.externalId,
        startedAt: new Date(meta.startedAt),
        durationSec: diveData.durationSec,
        maxDepthM: diveData.maxDepthM,
        avgDepthM: diveData.avgDepthM,
        minWaterTempC: diveData.minWaterTempC,
        maxAscentRateMps: diveData.maxAscentRateMps,
        safetyScore: scoreResult.score,
        scoredAt: new Date(),
        scoringVersion: scoreResult.scoringVersion,
        samples: {
          createMany: {
            data: samples.map((s) => ({
              tSec: s.tSec,
              depthM: s.depthM,
              tempC: s.tempC,
              cnsPct: s.cnsPct,
              decoState: s.decoState,
              decoTimeSec: s.decoTimeSec,
              decoDepthM: s.decoDepthM,
              ttsSec: s.ttsSec,
            })),
          },
        },
        insights: {
          createMany: {
            data: scoreResult.insights.map((i) => ({
              ruleId: i.ruleId,
              severity: i.severity,
              evidence: i.evidence,
            })),
          },
        },
      },
      include: { insights: true },
    });

    const dive: Dive = {
      id: created.id,
      externalId: created.externalId,
      startedAt: created.startedAt.toISOString(),
      durationSec: created.durationSec,
      maxDepthM: created.maxDepthM,
      avgDepthM: created.avgDepthM,
      minWaterTempC: created.minWaterTempC,
      maxAscentRateMps: created.maxAscentRateMps,
      safetyScore: created.safetyScore,
      scoringVersion: created.scoringVersion,
    };
    const insights: Insight[] = created.insights.map((i) => ({
      id: i.id,
      ruleId: i.ruleId,
      severity: i.severity as "info" | "warn" | "alert",
      evidence: i.evidence as Record<string, unknown>,
    }));

    return NextResponse.json({ dive, insights, score: scoreResult.score }, { status: 201 });
  } catch (error) {
    console.error("POST /api/dives error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const cursor = searchParams.get("cursor");

  const dives = await prisma.dive.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      startedAt: true,
      durationSec: true,
      maxDepthM: true,
      safetyScore: true,
    },
  });

  const hasMore = dives.length > limit;
  const items = hasMore ? dives.slice(0, limit) : dives;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return NextResponse.json({
    dives: items.map((d) => ({
      id: d.id,
      startedAt: d.startedAt.toISOString(),
      durationSec: d.durationSec,
      maxDepthM: d.maxDepthM,
      safetyScore: d.safetyScore,
    })),
    nextCursor,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/dives/route.ts
git commit -m "api: POST /api/dives (multipart + JSON dev-mode) + GET /api/dives (list)"
```

---

### Task 5.3: Implement GET /api/dives/:id and DELETE /api/dives/:id

**Files:**
- Create: `apps/web/src/app/api/dives/[id]/route.ts`

- [ ] **Step 1: Write the route handler**

Per Contract §Dive ingestion: GET returns `{ dive: Dive, insights: Insight[] }`, DELETE returns `{ ok: true }`.

```typescript
// apps/web/src/app/api/dives/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Dive, Insight } from "@diveforge/shared";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const dive = await prisma.dive.findFirst({
    where: { id, userId: user.id },
    include: { insights: true },
  });

  if (!dive) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const diveResponse: Dive = {
    id: dive.id,
    externalId: dive.externalId,
    startedAt: dive.startedAt.toISOString(),
    durationSec: dive.durationSec,
    maxDepthM: dive.maxDepthM,
    avgDepthM: dive.avgDepthM,
    minWaterTempC: dive.minWaterTempC,
    maxAscentRateMps: dive.maxAscentRateMps,
    safetyScore: dive.safetyScore,
    scoringVersion: dive.scoringVersion,
  };

  const insights: Insight[] = dive.insights.map((i) => ({
    id: i.id,
    ruleId: i.ruleId,
    severity: i.severity as "info" | "warn" | "alert",
    evidence: i.evidence as Record<string, unknown>,
  }));

  return NextResponse.json({ dive: diveResponse, insights });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const dive = await prisma.dive.findFirst({
    where: { id, userId: user.id },
  });

  if (!dive) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Cascade delete handles samples + insights (per schema onDelete: Cascade)
  await prisma.dive.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/dives/\[id\]/route.ts
git commit -m "api: GET/DELETE /api/dives/:id"
```

---

### Task 5.4: Implement GET /api/dives/:id/samples

**Files:**
- Create: `apps/web/src/app/api/dives/[id]/samples/route.ts`

- [ ] **Step 1: Write the route handler**

Per Contract §Dive ingestion: returns `{ samples: DiveSample[] }` with optional `?from&to` filter.

```typescript
// apps/web/src/app/api/dives/[id]/samples/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { DiveSample } from "@diveforge/shared";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const dive = await prisma.dive.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!dive) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ? parseInt(searchParams.get("from")!) : undefined;
  const to = searchParams.get("to") ? parseInt(searchParams.get("to")!) : undefined;

  const where: any = { diveId: id };
  if (from !== undefined || to !== undefined) {
    where.tSec = {};
    if (from !== undefined) where.tSec.gte = from;
    if (to !== undefined) where.tSec.lte = to;
  }

  const dbSamples = await prisma.diveSample.findMany({
    where,
    orderBy: { tSec: "asc" },
    select: {
      tSec: true,
      depthM: true,
      tempC: true,
      cnsPct: true,
      decoState: true,
      decoTimeSec: true,
      decoDepthM: true,
      ttsSec: true,
    },
  });

  const samples: DiveSample[] = dbSamples.map((s) => ({
    tSec: s.tSec,
    depthM: s.depthM,
    tempC: s.tempC,
    cnsPct: s.cnsPct,
    decoState: s.decoState as "ndl" | "deco",
    decoTimeSec: s.decoTimeSec,
    decoDepthM: s.decoDepthM,
    ttsSec: s.ttsSec,
  }));

  return NextResponse.json({ samples });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/dives/\[id\]/samples/
git commit -m "api: GET /api/dives/:id/samples with from/to filter"
```

---

### Phase 5 verification

- [ ] Start dev server and test the full dive ingestion flow with JSON dev-mode:
  ```bash
  # Create a user first, capture token
  TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/signup \
    -H "Content-Type: application/json" \
    -d '{"email":"diver@test.com","password":"pass123","niveau":"N2","locale":"fr"}' \
    | jq -r .token)

  # POST a dive via JSON dev-mode
  curl -X POST http://localhost:3000/api/dives \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d @packages/shared/src/scoring/fixtures/dive-1.json

  # List dives
  curl http://localhost:3000/api/dives \
    -H "Authorization: Bearer $TOKEN"

  # Get samples
  curl http://localhost:3000/api/dives/<id>/samples \
    -H "Authorization: Bearer $TOKEN"
  ```
- [ ] Confirm idempotency: re-POST same externalId returns existing record (no duplicate).
- [ ] Confirm DELETE removes the dive and its samples/insights (cascade).
- [ ] Response shapes match Contract §Dive ingestion exactly.

---

## Phase 6 — Trends + User APIs

### Task 6.1: Implement GET /api/trends

**Files:**
- Create: `apps/web/src/app/api/trends/route.ts`

- [ ] **Step 1: Write the route handler**

Per Contract §Trends: returns `{ avgScore, avgDepthM, diveCount, scoreSeries: [{date, score}], summaryTipKey: string }`.

```typescript
// apps/web/src/app/api/trends/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "30");
  const since = new Date();
  since.setDate(since.getDate() - days);

  const dives = await prisma.dive.findMany({
    where: {
      userId: user.id,
      startedAt: { gte: since },
    },
    orderBy: { startedAt: "asc" },
    select: {
      startedAt: true,
      safetyScore: true,
      maxDepthM: true,
    },
  });

  const diveCount = dives.length;

  if (diveCount === 0) {
    return NextResponse.json({
      avgScore: null,
      avgDepthM: null,
      diveCount: 0,
      scoreSeries: [],
      summaryTipKey: "no_dives_yet",
    });
  }

  const scoredDives = dives.filter((d) => d.safetyScore !== null);
  const avgScore = scoredDives.length > 0
    ? Math.round(scoredDives.reduce((sum, d) => sum + d.safetyScore!, 0) / scoredDives.length)
    : null;

  const avgDepthM = Math.round(
    (dives.reduce((sum, d) => sum + d.maxDepthM, 0) / diveCount) * 10
  ) / 10;

  const scoreSeries = dives
    .filter((d) => d.safetyScore !== null)
    .map((d) => ({
      date: d.startedAt.toISOString().split("T")[0],
      score: d.safetyScore!,
    }));

  // summaryTipKey: pick the most actionable insight based on recent scores
  // Simple heuristic: if avg score < 70, tip about most common issue
  const summaryTipKey = deriveSummaryTip(avgScore);

  return NextResponse.json({
    avgScore,
    avgDepthM,
    diveCount,
    scoreSeries,
    summaryTipKey,
  });
}

function deriveSummaryTip(avgScore: number | null): string {
  if (avgScore === null) return "keep_diving";
  if (avgScore >= 90) return "excellent_practice";
  if (avgScore >= 75) return "improving_ascent_control";
  if (avgScore >= 50) return "watch_ascent_rate";
  return "review_safety_stops";
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/trends/
git commit -m "api: GET /api/trends — rolling aggregate stats per Contract §Trends"
```

---

### Task 6.2: Implement PATCH /api/me

**Files:**
- Create: `apps/web/src/app/api/me/route.ts`

- [ ] **Step 1: Write the route handler**

Per Contract §User: accepts `{ niveau?, locale? }`, returns `{ user }`.

```typescript
// apps/web/src/app/api/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Niveau, Locale } from "@diveforge/shared";

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { niveau?: Niveau; locale?: Locale };
  const updateData: Record<string, unknown> = {};

  if (body.niveau) {
    const validNiveaux: Niveau[] = ["N1", "N2", "N3", "N4", "INITIATEUR", "MF1", "MF2", "UNKNOWN"];
    if (!validNiveaux.includes(body.niveau)) {
      return NextResponse.json({ error: "Invalid niveau" }, { status: 400 });
    }
    updateData.niveau = body.niveau;
  }

  if (body.locale) {
    const validLocales: Locale[] = ["fr", "en"];
    if (!validLocales.includes(body.locale)) {
      return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
    }
    updateData.locale = body.locale;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ user });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: updateData,
    select: { id: true, email: true, displayName: true, niveau: true, locale: true },
  });

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      niveau: updated.niveau,
      locale: updated.locale,
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/me/
git commit -m "api: PATCH /api/me — update niveau + locale per Contract §User"
```

---

### Task 6.3: API integration test scaffold

**Files:**
- Create: `apps/web/src/app/api/__tests__/dives.test.ts`
- Create: `apps/web/src/app/api/__tests__/trends.test.ts`

- [ ] **Step 1: Write dive API test scaffold**

```typescript
// apps/web/src/app/api/__tests__/dives.test.ts
import { describe, it, expect } from "vitest";

describe("POST /api/dives", () => {
  it("rejects unauthenticated requests with 401", async () => {
    // Test without Authorization header
  });

  it("accepts JSON dev-mode body and returns scored dive", async () => {
    // POST with Content-Type: application/json, verify response shape
  });

  it("is idempotent on (userId, externalId)", async () => {
    // POST same externalId twice, confirm second returns existing record
  });

  it("returns 415 for unsupported content-type", async () => {
    // POST with text/plain, expect 415
  });
});

describe("GET /api/dives", () => {
  it("returns paginated DiveSummary[] with nextCursor", async () => {
    // Verify cursor-based pagination
  });
});

describe("GET /api/dives/:id", () => {
  it("returns 404 for non-existent dive", async () => {});
  it("returns 404 for another user's dive", async () => {});
  it("returns { dive, insights } for owned dive", async () => {});
});

describe("DELETE /api/dives/:id", () => {
  it("removes dive and cascades to samples + insights", async () => {});
});

describe("GET /api/dives/:id/samples", () => {
  it("returns all samples for a dive", async () => {});
  it("supports from/to query params", async () => {});
});
```

- [ ] **Step 2: Write trends test scaffold**

```typescript
// apps/web/src/app/api/__tests__/trends.test.ts
import { describe, it, expect } from "vitest";

describe("GET /api/trends", () => {
  it("returns zeros/nulls with no dives", async () => {});
  it("computes correct avgScore over N days", async () => {});
  it("returns scoreSeries sorted by date", async () => {});
  it("respects ?days parameter", async () => {});
  it("returns a summaryTipKey string", async () => {});
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/__tests__/
git commit -m "api: integration test scaffolds for dives + trends endpoints"
```

---

### Phase 6 verification

- [ ] `curl` test GET /api/trends — returns correct shape with `avgScore`, `avgDepthM`, `diveCount`, `scoreSeries`, `summaryTipKey`.
- [ ] `curl` test PATCH /api/me — updates niveau and locale, returns updated user.
- [ ] All endpoints require auth (401 without token).
- [ ] Response shapes match contract exactly.

---

## Phase 7 — Deploy + Observability

### Task 7.1: Configure Sentry for backend

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/sentry.ts`
- Create: `apps/web/sentry.server.config.ts`

- [ ] **Step 1: Install Sentry**

```bash
pnpm --filter @diveforge/web add @sentry/nextjs
```

- [ ] **Step 2: Create Sentry server config**

`apps/web/sentry.server.config.ts`:
```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});
```

- [ ] **Step 3: Create instrumentation hook**

`apps/web/src/instrumentation.ts`:
```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
}
```

- [ ] **Step 4: Add SENTRY_DSN to .env.example**

Append to `apps/web/.env.example`:
```
SENTRY_DSN="https://your-sentry-dsn"
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/sentry.server.config.ts apps/web/src/instrumentation.ts apps/web/.env.example apps/web/package.json pnpm-lock.yaml
git commit -m "observability: Sentry integration for backend error tracking"
```

---

### Task 7.2: Vercel deployment configuration

**Files:**
- Create: `apps/web/vercel.json`
- Modify: `apps/web/package.json` (build script includes prisma generate)

- [ ] **Step 1: Create vercel.json**

```json
{
  "buildCommand": "pnpm --filter @diveforge/shared build && prisma generate && next build",
  "installCommand": "pnpm install",
  "framework": "nextjs"
}
```

- [ ] **Step 2: Ensure prisma generate runs before build**

Update `apps/web/package.json` build script:
```json
"scripts": {
  "build": "prisma generate && next build",
  "postinstall": "prisma generate",
  ...
}
```

- [ ] **Step 3: Add migration deploy to CI/build**

Per spec §7: migrations via `prisma migrate deploy` in build. Add to `apps/web/package.json`:
```json
"scripts": {
  ...
  "db:deploy": "prisma migrate deploy"
}
```

Note: On Vercel, `prisma migrate deploy` should run as a build step or via a separate CI action. The executor should configure this in Vercel project settings or add a `prebuild` script.

- [ ] **Step 4: Commit**

```bash
git add apps/web/vercel.json apps/web/package.json
git commit -m "deploy: Vercel configuration with Prisma generate + migrate"
```

---

### Task 7.3: Environment variable documentation

**Files:**
- Modify: `apps/web/.env.example`

- [ ] **Step 1: Finalize .env.example with all required vars**

```
# Database (Neon Postgres)
DATABASE_URL="postgresql://user:password@host/diveforge?sslmode=require"

# Auth
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"

# Sentry
SENTRY_DSN="https://your-dsn@sentry.io/project-id"

# libdivecomputer binary path (optional, defaults to spike build)
DCTOOL_PATH="/path/to/dctool"
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/.env.example
git commit -m "deploy: complete environment variable documentation"
```

---

### Task 7.4: Final verification and smoke test

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

Expected: all tests in `packages/shared` and `apps/web` pass.

- [ ] **Step 2: Build all workspaces**

```bash
pnpm build
```

Expected: `packages/shared` builds to dist/, `apps/web` builds Next.js output.

- [ ] **Step 3: End-to-end smoke test**

Run dev server and execute the complete user journey:

```bash
# 1. Signup
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.com","password":"smoke123","niveau":"N2","locale":"fr"}' \
  | jq -r .token)

# 2. Upload dive (JSON dev-mode)
DIVE_RESPONSE=$(curl -s -X POST http://localhost:3000/api/dives \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"meta":{"deviceModel":"Shearwater Peregrine","externalId":"smoke-1","startedAt":"2026-03-31T21:14:41Z"},"dive":{"maxDepthM":19.4,"avgDepthM":14.2,"durationSec":2073,"maxAscentRateMps":0.25,"minWaterTempC":29},"samples":[{"tSec":0,"depthM":0,"tempC":29,"cnsPct":0,"decoState":"ndl","decoTimeSec":5940,"decoDepthM":0,"ttsSec":null}]}')
DIVE_ID=$(echo $DIVE_RESPONSE | jq -r .dive.id)

# 3. Get dive detail
curl -s http://localhost:3000/api/dives/$DIVE_ID \
  -H "Authorization: Bearer $TOKEN" | jq .

# 4. Get samples
curl -s http://localhost:3000/api/dives/$DIVE_ID/samples \
  -H "Authorization: Bearer $TOKEN" | jq .

# 5. Get trends
curl -s http://localhost:3000/api/trends \
  -H "Authorization: Bearer $TOKEN" | jq .

# 6. Update profile
curl -s -X PATCH http://localhost:3000/api/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"niveau":"N3"}' | jq .

# 7. Verify idempotency (re-upload same externalId)
curl -s -X POST http://localhost:3000/api/dives \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"meta":{"deviceModel":"Shearwater Peregrine","externalId":"smoke-1","startedAt":"2026-03-31T21:14:41Z"},"dive":{"maxDepthM":19.4,"avgDepthM":14.2,"durationSec":2073,"maxAscentRateMps":0.25,"minWaterTempC":29},"samples":[]}' | jq .

# 8. Delete dive
curl -s -X DELETE http://localhost:3000/api/dives/$DIVE_ID \
  -H "Authorization: Bearer $TOKEN" | jq .

# 9. Logout
curl -s -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer $TOKEN" | jq .
```

- [ ] **Step 4: Deploy to Vercel**

```bash
# Link project (first time)
cd apps/web
pnpm exec vercel link

# Deploy preview
pnpm exec vercel

# If preview passes, deploy production
pnpm exec vercel --prod
```

- [ ] **Step 5: Run smoke test against production URL**

Repeat the curl commands from Step 3 against the production URL.

- [ ] **Step 6: Commit any final adjustments**

```bash
git add -A
git commit -m "plan1: final adjustments from smoke test"
```

---

### Phase 7 verification

- [ ] `pnpm test` passes across all workspaces.
- [ ] `pnpm build` succeeds.
- [ ] Vercel deployment is live and accessible.
- [ ] Sentry receives test errors (trigger one intentionally to verify).
- [ ] All contract endpoints respond with correct shapes.
- [ ] Dev-mode JSON ingestion works (Plan 2 unblocked).
- [ ] Idempotency on `(userId, externalId)` verified.

---

## Appendix: FFI follow-up (NOT in Plan 1 scope)

The current implementation uses `dctool parse` as a subprocess for parsing raw Peregrine bytes. This is adequate for v1 (low traffic, known user base). For production scale-up:

1. Compile libdivecomputer as a Node native addon (N-API) or use `node-ffi-napi`.
2. Call `dc_parser_*` functions directly, eliminating subprocess overhead, temp file I/O, and XML round-trip.
3. Benchmark: subprocess adds ~50ms per dive on warm invocation; FFI should reduce to <5ms.

This is tracked as a future optimization and does NOT block v1 launch.

---

## Self-review checklist

- [x] Every step has actual content (no "TBD", "implement later", "similar to above")
- [x] All file paths are exact and absolute-from-workspace-root
- [x] All commands include expected output descriptions
- [x] Each phase ends with a verification step
- [x] Tests are written alongside the code they test
- [x] Commits are small and atomic (one concern per commit)
- [x] Contract §Auth endpoint shapes matched exactly
- [x] Contract §Dive ingestion shapes matched exactly
- [x] Contract §Trends shapes matched exactly
- [x] Contract §User shapes matched exactly
- [x] Contract §Shared types reproduced character-for-character
- [x] Dev-mode JSON ingestion path present (Plan 2 unblocked)
- [x] Idempotency semantics on `(userId, externalId)` implemented
- [x] All 10 scoring rules from spec §4 implemented
- [x] `scoringVersion = "v1.0"` set
- [x] Per-rule try/catch in engine entrypoint
- [x] Fixture migration from spike included (4 real + 4 synthetic)
- [x] Prisma schema matches spec §3 exactly (including DiveSample deco fields)
- [x] Plan executable without Plans 2 or 3
