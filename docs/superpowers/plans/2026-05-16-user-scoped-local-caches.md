# User-Scoped Local Caches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-16
**Status:** Ready for execution.
**Spec:** `docs/superpowers/specs/2026-05-16-user-scoped-local-caches-design.md`

**Goal:** Add a `user_id` column to both local-cache SQLite tables (`synced_fingerprints` in `services/syncedDives.ts`, `upload_queue` in `services/queue.ts`), thread the current user's id through every API call, and add a one-time migration that drops legacy unscoped rows.

**Architecture:** Module-level migrations run on first `getDb()` init: `PRAGMA table_info` to detect schema, `ALTER TABLE … ADD COLUMN user_id TEXT`, `DELETE WHERE user_id IS NULL`. For `synced_fingerprints` the primary key changes from `fingerprint` alone to `(user_id, fingerprint)` via a recreate-and-rename. The `useSync` hook reads `user.id` from `useAuth`, throws `'unauthenticated'` if null (defensive), and threads the id through every cache call. No logout hooks; rows for old users sit harmlessly until a future janitor task.

**Tech Stack:** TypeScript, expo-sqlite, React Native, Jest + @testing-library/react-native, i18next.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `apps/mobile/src/services/syncedDives.ts` | **Modify** | Add `userId` param, migration, scoped queries. |
| `apps/mobile/src/services/__tests__/syncedDives.test.ts` | **Modify** | Update mock for column tracking; add isolation + migration tests. |
| `apps/mobile/src/services/queue.ts` | **Modify** | Add `userId` param, migration, scoped queries. |
| `apps/mobile/src/services/__tests__/queue.test.ts` | **Create** | Mirror syncedDives test pattern + isolation + migration. |
| `apps/mobile/src/hooks/useSync.ts` | **Modify** | Read user.id, throw on null, pass through to cache calls. |
| `apps/mobile/src/__tests__/useSync.test.tsx` | **Modify** | Mock useAuth; thread userId through expectations; add unauthenticated test. |

---

## Task 1: User-scope `syncedDives.ts` (migration + isolation)

**Files:**
- Modify: `apps/mobile/src/services/syncedDives.ts`
- Modify: `apps/mobile/src/services/__tests__/syncedDives.test.ts`

### Step 1: Update the test mock to track schema columns and run "migrates legacy unscoped rows" + isolation tests

The existing mock factory in `apps/mobile/src/services/__tests__/syncedDives.test.ts` is a flat in-memory `rows` array. To verify migration semantics it needs to track which columns exist and to honor the `WHERE user_id = ?` clause.

- [ ] **Step 1a: Replace the existing `jest.mock('expo-sqlite', ...)` factory with a column-aware one**

In `apps/mobile/src/services/__tests__/syncedDives.test.ts` replace the existing `jest.mock('expo-sqlite', () => { ... })` block (lines 9-37) with:

```ts
jest.mock('expo-sqlite', () => {
  type Row = { fingerprint: string; synced_at: number; user_id?: string | null };
  let rows: Row[] = [];
  // Track which columns the table currently "has" so we can simulate
  // ALTER TABLE / PRAGMA table_info.
  let columns = new Set<string>(['fingerprint', 'synced_at']);

  const db = {
    execAsync: jest.fn(async (sql: string) => {
      // Honor migration SQL: ADD COLUMN, DELETE, recreate-and-rename, CREATE TABLE
      const cleaned = sql.replace(/\s+/g, ' ').trim();
      if (/CREATE TABLE IF NOT EXISTS synced_fingerprints/i.test(cleaned)) {
        // Initial fresh schema in the production module is the new
        // composite-PK shape: (user_id, fingerprint, synced_at).
        if (!columns.has('user_id')) {
          columns = new Set(['user_id', 'fingerprint', 'synced_at']);
        }
        return undefined;
      }
      if (/ALTER TABLE synced_fingerprints ADD COLUMN user_id/i.test(cleaned)) {
        columns.add('user_id');
        rows = rows.map((r) => ({ ...r, user_id: r.user_id ?? null }));
        return undefined;
      }
      if (/DELETE FROM synced_fingerprints WHERE user_id IS NULL/i.test(cleaned)) {
        rows = rows.filter((r) => r.user_id != null);
        return undefined;
      }
      if (/CREATE TABLE synced_fingerprints_new/i.test(cleaned)) {
        // Composite PK rebuild flow — handled by the test's executeMigrationSQL helper.
        return undefined;
      }
      return undefined;
    }),
    runAsync: jest.fn(async (sql: string, params: unknown[]) => {
      const cleaned = sql.replace(/\s+/g, ' ').trim();
      if (/INSERT OR IGNORE INTO synced_fingerprints/i.test(cleaned)) {
        const userId = params[0] as string;
        const fp = params[1] as string;
        const at = params[2] as number;
        if (!rows.some((r) => r.user_id === userId && r.fingerprint === fp)) {
          rows.push({ user_id: userId, fingerprint: fp, synced_at: at });
        }
        return { changes: 1, lastInsertRowId: 0 };
      }
      if (/DELETE FROM synced_fingerprints WHERE user_id IS NULL/i.test(cleaned)) {
        rows = rows.filter((r) => r.user_id != null);
        return { changes: 0, lastInsertRowId: 0 };
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    getAllAsync: jest.fn(async (sql: string, params: unknown[] = []) => {
      const cleaned = sql.replace(/\s+/g, ' ').trim();
      if (/PRAGMA table_info\(synced_fingerprints\)/i.test(cleaned)) {
        return Array.from(columns).map((name) => ({ name }));
      }
      if (/SELECT fingerprint FROM synced_fingerprints WHERE user_id = \?/i.test(cleaned)) {
        const userId = params[0] as string;
        return rows
          .filter((r) => r.user_id === userId)
          .map((r) => ({ fingerprint: r.fingerprint }));
      }
      // Fallback: return everything (used by legacy-rows seed tests).
      return rows.slice();
    }),
  };
  const openDatabaseAsync = jest.fn().mockResolvedValue(db);
  return {
    openDatabaseAsync,
    __mockReset: () => {
      rows = [];
      columns = new Set(['fingerprint', 'synced_at']);
      openDatabaseAsync.mockClear();
      (db.execAsync as jest.Mock).mockClear();
      (db.runAsync as jest.Mock).mockClear();
      (db.getAllAsync as jest.Mock).mockClear();
    },
    __seedLegacyRow: (fp: string) => {
      // Simulates a row inserted before the migration (no user_id).
      rows.push({ fingerprint: fp, synced_at: Date.now(), user_id: null });
    },
  };
});
```

- [ ] **Step 1b: Update the existing 6 tests to pass `userId`**

Replace each existing test in `apps/mobile/src/services/__tests__/syncedDives.test.ts` to thread a fixed userId:

```ts
const U1 = 'user-1';

describe('syncedDives', () => {
  beforeEach(() => {
    (SQLite as unknown as { __mockReset: () => void }).__mockReset();
    __resetSyncedDivesForTests();
  });

  it('returns empty Set on a fresh DB', async () => {
    const result = await getSyncedFingerprints(U1);
    expect(result.size).toBe(0);
  });

  it('returns the fingerprint after markFingerprintSynced', async () => {
    await markFingerprintSynced(U1, 'abc123');
    const result = await getSyncedFingerprints(U1);
    expect(result.has('abc123')).toBe(true);
  });

  it('handles multiple inserts', async () => {
    await markFingerprintSynced(U1, 'aa');
    await markFingerprintSynced(U1, 'bb');
    await markFingerprintSynced(U1, 'cc');
    const result = await getSyncedFingerprints(U1);
    expect(result.size).toBe(3);
  });

  it('does not throw when marking the same fingerprint twice', async () => {
    await markFingerprintSynced(U1, 'dup');
    await expect(markFingerprintSynced(U1, 'dup')).resolves.not.toThrow();
    expect((await getSyncedFingerprints(U1)).size).toBe(1);
  });

  it('uses INSERT OR IGNORE for race-safe idempotency', async () => {
    const mockDb = await (SQLite.openDatabaseAsync as jest.Mock)();
    await markFingerprintSynced(U1, 'check');
    const insertCall = (mockDb.runAsync as jest.Mock).mock.calls.find((c) =>
      /INSERT/.test(c[0])
    );
    expect(insertCall![0]).toMatch(/INSERT OR IGNORE/);
  });

  it('opens the database only once across multiple calls', async () => {
    await getSyncedFingerprints(U1);
    await getSyncedFingerprints(U1);
    await markFingerprintSynced(U1, 'x');
    expect((SQLite.openDatabaseAsync as jest.Mock).mock.calls.length).toBe(1);
  });
```

- [ ] **Step 1c: Add 2 isolation tests + 1 migration test (still inside the same `describe` block — close it after these)**

```ts
  it('different users see different sets', async () => {
    await markFingerprintSynced('alice', 'fp-a');
    await markFingerprintSynced('bob', 'fp-b');
    const aliceSet = await getSyncedFingerprints('alice');
    const bobSet = await getSyncedFingerprints('bob');
    expect(aliceSet.has('fp-a')).toBe(true);
    expect(aliceSet.has('fp-b')).toBe(false);
    expect(bobSet.has('fp-b')).toBe(true);
    expect(bobSet.has('fp-a')).toBe(false);
  });

  it('marking for one user does not affect another', async () => {
    await markFingerprintSynced('alice', 'shared');
    expect((await getSyncedFingerprints('bob')).size).toBe(0);
  });

  it('migrates legacy unscoped rows by deleting them', async () => {
    // Seed a row with user_id = NULL via the mock helper (simulates pre-migration state).
    (SQLite as unknown as { __seedLegacyRow: (fp: string) => void }).__seedLegacyRow('legacy-fp');
    // Trigger getDb() via any call.
    const result = await getSyncedFingerprints('alice');
    expect(result.has('legacy-fp')).toBe(false);
    expect(result.size).toBe(0);
  });
});
```

### Step 2: Run the new tests, confirm they fail

```bash
cd apps/mobile && pnpm test -- --testPathPattern=syncedDives 2>&1 | tail -20
```

Expected: tests fail because the production module doesn't yet take a `userId`, doesn't run the migration, and uses the old SQL.

### Step 3: Rewrite `apps/mobile/src/services/syncedDives.ts`

Replace the entire file with:

```ts
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'divechef_sync.db';

let db: SQLite.SQLiteDatabase | null = null;

async function ensureMigrated(database: SQLite.SQLiteDatabase): Promise<void> {
  // Inspect the table to decide between fresh-init and migration.
  const cols = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(synced_fingerprints)'
  );
  const colNames = new Set(cols.map((c) => c.name));

  if (colNames.size === 0) {
    // Fresh install: create the table at the current schema.
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS synced_fingerprints (
        user_id     TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        synced_at   INTEGER NOT NULL,
        PRIMARY KEY (user_id, fingerprint)
      );
    `);
    return;
  }

  // Existing table from a previous version. Add the column if missing,
  // then drop legacy unscoped rows. The composite-PK rebuild is handled
  // separately because SQLite does not support ALTER TABLE … ADD CONSTRAINT.
  if (!colNames.has('user_id')) {
    await database.execAsync(
      'ALTER TABLE synced_fingerprints ADD COLUMN user_id TEXT'
    );
  }
  await database.runAsync(
    'DELETE FROM synced_fingerprints WHERE user_id IS NULL'
  );
}

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await ensureMigrated(db);
  }
  return db;
}

/** Returns the set of fingerprint hex strings the given user has uploaded. */
export async function getSyncedFingerprints(userId: string): Promise<Set<string>> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ fingerprint: string }>(
    'SELECT fingerprint FROM synced_fingerprints WHERE user_id = ?',
    [userId]
  );
  return new Set(rows.map((r) => r.fingerprint));
}

/** Records a fingerprint as successfully uploaded for the given user. Idempotent. */
export async function markFingerprintSynced(
  userId: string,
  fingerprint: string
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'INSERT OR IGNORE INTO synced_fingerprints (user_id, fingerprint, synced_at) VALUES (?, ?, ?)',
    [userId, fingerprint, Date.now()]
  );
}

/** Test-only: forces re-init on next call. */
export function __resetSyncedDivesForTests(): void {
  db = null;
}
```

### Step 4: Run the tests, confirm all 9 pass

```bash
cd apps/mobile && pnpm test -- --testPathPattern=syncedDives 2>&1 | tail -10
```

Expected: `Tests: 9 passed, 9 total` (6 updated + 3 new).

### Step 5: Verify TypeScript

```bash
cd apps/mobile && pnpm typecheck 2>&1 | tail -3
```

Expected: clean.

### Step 6: Commit

```bash
git add apps/mobile/src/services/syncedDives.ts \
        apps/mobile/src/services/__tests__/syncedDives.test.ts
git commit -m "feat(syncedDives): scope by user_id + migrate legacy unscoped rows

Adds user_id TEXT NOT NULL to synced_fingerprints; primary key becomes
(user_id, fingerprint). All API calls now take userId as the first
argument. Migration runs on first getDb() init: ALTER TABLE if column
missing, DELETE legacy rows where user_id IS NULL.

Triggering bug: logout + new user + sync → 0 dives because previous
user's fingerprints filtered everything out. With user_id scoping the
new user sees their own (empty) set, downloads all dives.

Tests: 9 passing (6 updated + 3 new — isolation x2, migration x1).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: User-scope `queue.ts` (migration + new test file)

**Files:**
- Modify: `apps/mobile/src/services/queue.ts`
- Create: `apps/mobile/src/services/__tests__/queue.test.ts`

### Step 1: Create the test file

Create `apps/mobile/src/services/__tests__/queue.test.ts`:

```ts
import * as SQLite from 'expo-sqlite';
import {
  enqueueUpload,
  flushQueue,
  getPendingCount,
  clearQueue,
  __resetQueueForTests,
} from '../queue';

jest.mock('expo-sqlite', () => {
  type Row = {
    id: number;
    payload: string;
    created_at: string;
    attempts: number;
    user_id?: string | null;
  };
  let nextId = 1;
  let rows: Row[] = [];
  let columns = new Set<string>(['id', 'payload', 'created_at', 'attempts']);

  const db = {
    execAsync: jest.fn(async (sql: string) => {
      const cleaned = sql.replace(/\s+/g, ' ').trim();
      if (/CREATE TABLE IF NOT EXISTS upload_queue/i.test(cleaned)) {
        if (!columns.has('user_id')) {
          columns = new Set(['id', 'payload', 'created_at', 'attempts', 'user_id']);
        }
        return undefined;
      }
      if (/ALTER TABLE upload_queue ADD COLUMN user_id/i.test(cleaned)) {
        columns.add('user_id');
        rows = rows.map((r) => ({ ...r, user_id: r.user_id ?? null }));
        return undefined;
      }
      if (/DELETE FROM upload_queue WHERE user_id IS NULL/i.test(cleaned)) {
        rows = rows.filter((r) => r.user_id != null);
        return undefined;
      }
      if (/CREATE INDEX IF NOT EXISTS idx_upload_queue_user_id/i.test(cleaned)) {
        return undefined;
      }
      return undefined;
    }),
    runAsync: jest.fn(async (sql: string, params: unknown[] = []) => {
      const cleaned = sql.replace(/\s+/g, ' ').trim();
      if (/INSERT INTO upload_queue \(user_id, payload\)/i.test(cleaned)) {
        rows.push({
          id: nextId++,
          user_id: params[0] as string,
          payload: params[1] as string,
          created_at: new Date().toISOString(),
          attempts: 0,
        });
        return { changes: 1, lastInsertRowId: nextId - 1 };
      }
      if (/DELETE FROM upload_queue WHERE id = \?/i.test(cleaned)) {
        const id = params[0] as number;
        rows = rows.filter((r) => r.id !== id);
        return { changes: 1, lastInsertRowId: 0 };
      }
      if (/UPDATE upload_queue SET attempts = attempts \+ 1 WHERE id = \?/i.test(cleaned)) {
        const id = params[0] as number;
        const r = rows.find((row) => row.id === id);
        if (r) r.attempts++;
        return { changes: 1, lastInsertRowId: 0 };
      }
      if (/DELETE FROM upload_queue WHERE user_id = \?/i.test(cleaned)) {
        const userId = params[0] as string;
        rows = rows.filter((r) => r.user_id !== userId);
        return { changes: 1, lastInsertRowId: 0 };
      }
      if (/DELETE FROM upload_queue WHERE user_id IS NULL/i.test(cleaned)) {
        rows = rows.filter((r) => r.user_id != null);
        return { changes: 0, lastInsertRowId: 0 };
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    getAllAsync: jest.fn(async (sql: string, params: unknown[] = []) => {
      const cleaned = sql.replace(/\s+/g, ' ').trim();
      if (/PRAGMA table_info\(upload_queue\)/i.test(cleaned)) {
        return Array.from(columns).map((name) => ({ name }));
      }
      if (/SELECT id, payload, attempts FROM upload_queue WHERE user_id = \?/i.test(cleaned)) {
        const userId = params[0] as string;
        return rows
          .filter((r) => r.user_id === userId)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((r) => ({ id: r.id, payload: r.payload, attempts: r.attempts }));
      }
      return rows.slice();
    }),
    getFirstAsync: jest.fn(async (sql: string, params: unknown[] = []) => {
      if (/SELECT COUNT\(\*\) as count FROM upload_queue WHERE user_id = \?/i.test(sql.replace(/\s+/g, ' ').trim())) {
        const userId = params[0] as string;
        return { count: rows.filter((r) => r.user_id === userId).length };
      }
      return { count: 0 };
    }),
  };
  const openDatabaseAsync = jest.fn().mockResolvedValue(db);
  return {
    openDatabaseAsync,
    __mockReset: () => {
      rows = [];
      nextId = 1;
      columns = new Set(['id', 'payload', 'created_at', 'attempts']);
      openDatabaseAsync.mockClear();
      (db.execAsync as jest.Mock).mockClear();
      (db.runAsync as jest.Mock).mockClear();
      (db.getAllAsync as jest.Mock).mockClear();
      (db.getFirstAsync as jest.Mock).mockClear();
    },
    __seedLegacyRow: (payload: string) => {
      rows.push({
        id: nextId++,
        payload: JSON.stringify(payload),
        created_at: new Date().toISOString(),
        attempts: 0,
        user_id: null,
      });
    },
  };
});

const U1 = 'user-1';
const U2 = 'user-2';

describe('queue', () => {
  beforeEach(() => {
    (SQLite as unknown as { __mockReset: () => void }).__mockReset();
    __resetQueueForTests();
  });

  it('starts empty for a new user', async () => {
    expect(await getPendingCount(U1)).toBe(0);
  });

  it('enqueueUpload + getPendingCount round-trips for the same user', async () => {
    await enqueueUpload(U1, { fingerprintHex: 'aa' });
    await enqueueUpload(U1, { fingerprintHex: 'bb' });
    expect(await getPendingCount(U1)).toBe(2);
  });

  it('different users see different queues', async () => {
    await enqueueUpload(U1, { x: 1 });
    await enqueueUpload(U2, { x: 2 });
    expect(await getPendingCount(U1)).toBe(1);
    expect(await getPendingCount(U2)).toBe(1);
  });

  it('flushQueue only processes the current user rows', async () => {
    await enqueueUpload(U1, { x: 1 });
    await enqueueUpload(U2, { x: 2 });
    const seen: unknown[] = [];
    const result = await flushQueue(U1, async (payload) => {
      seen.push(payload);
      return true;
    });
    expect(result.succeeded).toBe(1);
    expect(seen).toEqual([{ x: 1 }]);
    // U2's row is still pending.
    expect(await getPendingCount(U2)).toBe(1);
  });

  it('flushQueue increments attempts on uploadFn failure', async () => {
    await enqueueUpload(U1, { x: 1 });
    const result = await flushQueue(U1, async () => false);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    expect(await getPendingCount(U1)).toBe(1);
  });

  it('clearQueue only clears the current user', async () => {
    await enqueueUpload(U1, { x: 1 });
    await enqueueUpload(U2, { x: 2 });
    await clearQueue(U1);
    expect(await getPendingCount(U1)).toBe(0);
    expect(await getPendingCount(U2)).toBe(1);
  });

  it('migrates legacy unscoped rows by deleting them', async () => {
    (SQLite as unknown as { __seedLegacyRow: (p: string) => void }).__seedLegacyRow('legacy');
    // Trigger getDb() via any call.
    expect(await getPendingCount(U1)).toBe(0);
    expect(await getPendingCount(U2)).toBe(0);
  });
});
```

### Step 2: Run the test, confirm it fails

```bash
cd apps/mobile && pnpm test -- --testPathPattern=queue 2>&1 | tail -10
```

Expected: failure — `__resetQueueForTests` is not exported by `queue.ts` yet, and the production code doesn't accept `userId`.

### Step 3: Rewrite `apps/mobile/src/services/queue.ts`

Replace the entire file with:

```ts
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'divechef_queue.db';

let db: SQLite.SQLiteDatabase | null = null;

async function ensureMigrated(database: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(upload_queue)'
  );
  const colNames = new Set(cols.map((c) => c.name));

  if (colNames.size === 0) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS upload_queue (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    TEXT NOT NULL,
        payload    TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        attempts   INTEGER NOT NULL DEFAULT 0
      );
    `);
    await database.execAsync(
      'CREATE INDEX IF NOT EXISTS idx_upload_queue_user_id ON upload_queue(user_id)'
    );
    return;
  }

  if (!colNames.has('user_id')) {
    await database.execAsync(
      'ALTER TABLE upload_queue ADD COLUMN user_id TEXT'
    );
    await database.execAsync(
      'CREATE INDEX IF NOT EXISTS idx_upload_queue_user_id ON upload_queue(user_id)'
    );
  }
  await database.runAsync(
    'DELETE FROM upload_queue WHERE user_id IS NULL'
  );
}

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await ensureMigrated(db);
  }
  return db;
}

export async function enqueueUpload(userId: string, payload: unknown): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'INSERT INTO upload_queue (user_id, payload) VALUES (?, ?)',
    [userId, JSON.stringify(payload)]
  );
}

export async function getPendingCount(userId: string): Promise<number> {
  const database = await getDb();
  const result = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM upload_queue WHERE user_id = ?',
    [userId]
  );
  return result?.count ?? 0;
}

export async function flushQueue(
  userId: string,
  uploadFn: (payload: unknown) => Promise<boolean>
): Promise<{ succeeded: number; failed: number }> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ id: number; payload: string; attempts: number }>(
    'SELECT id, payload, attempts FROM upload_queue WHERE user_id = ? ORDER BY created_at ASC',
    [userId]
  );

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as unknown;
      const ok = await uploadFn(payload);
      if (ok) {
        await database.runAsync('DELETE FROM upload_queue WHERE id = ?', [row.id]);
        succeeded++;
      } else {
        await database.runAsync(
          'UPDATE upload_queue SET attempts = attempts + 1 WHERE id = ?',
          [row.id]
        );
        failed++;
      }
    } catch {
      await database.runAsync(
        'UPDATE upload_queue SET attempts = attempts + 1 WHERE id = ?',
        [row.id]
      );
      failed++;
    }
  }

  return { succeeded, failed };
}

export async function clearQueue(userId: string): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM upload_queue WHERE user_id = ?', [userId]);
}

/** Test-only: forces re-init on next call. */
export function __resetQueueForTests(): void {
  db = null;
}
```

### Step 4: Run the test, confirm 7 pass

```bash
cd apps/mobile && pnpm test -- --testPathPattern=queue 2>&1 | tail -10
```

Expected: `Tests: 7 passed, 7 total`.

### Step 5: Verify TypeScript

```bash
cd apps/mobile && pnpm typecheck 2>&1 | tail -3
```

Expected: clean. If `useSync.ts` still calls `enqueueUpload` with one argument, **expect a tsc error** — proceed to Task 3 to fix it.

### Step 6: Commit

```bash
git add apps/mobile/src/services/queue.ts \
        apps/mobile/src/services/__tests__/queue.test.ts
git commit -m "feat(queue): scope upload_queue by user_id + migrate legacy rows

Adds user_id TEXT NOT NULL to upload_queue with an index. All API calls
now take userId. Migration on first getDb() init: ALTER TABLE if column
missing, DELETE legacy rows where user_id IS NULL.

Latent bug fix: a flushQueue running with a different bearer token than
the one that enqueued the rows would have POSTed user A's dives to user
B's account. With user_id scoping, flushQueue iterates only rows
matching the current user.

Tests: 7 passing (new file — first test coverage for queue.ts).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Thread `userId` through `useSync` + auth guard

**Files:**
- Modify: `apps/mobile/src/hooks/useSync.ts`
- Modify: `apps/mobile/src/__tests__/useSync.test.tsx`

### Step 1: Update tests to mock `useAuth`, thread `U1`, add unauthenticated test

In `apps/mobile/src/__tests__/useSync.test.tsx`:

- [ ] **Step 1a: Add the `useAuth` mock**

Add this `jest.mock` block alongside the existing module mocks (top of file, near the others):

```ts
const mockUseAuth = jest.fn();
jest.mock('../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));
```

In the `beforeEach`, set the default return:

```ts
mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
```

(Place this alongside the other mock-setup lines in the existing `beforeEach` block, after `jest.clearAllMocks()`.)

- [ ] **Step 1b: Update `markFingerprintSynced` and `getSyncedFingerprints` mock signatures**

Replace the existing `jest.mock('../services/syncedDives', ...)` with:

```ts
const mockGetSyncedFingerprints = jest.fn();
const mockMarkFingerprintSynced = jest.fn();
jest.mock('../services/syncedDives', () => ({
  getSyncedFingerprints: (userId: string) => mockGetSyncedFingerprints(userId),
  markFingerprintSynced: (userId: string, fp: string) => mockMarkFingerprintSynced(userId, fp),
}));
```

Update the existing assertions: every `mockMarkFingerprintSynced.toHaveBeenCalledWith('aaaaaaaa')` becomes `mockMarkFingerprintSynced.toHaveBeenCalledWith('user-1', 'aaaaaaaa')`.

Search for `toHaveBeenCalledWith('aaaaaaaa')`, `toHaveBeenCalledWith('bbbbbbbb')`, `toHaveBeenCalledWith('cccccccc')` and prepend `'user-1'` to each.

- [ ] **Step 1c: Update `enqueueUpload` mock signature**

Replace the existing `jest.mock('../services/queue', ...)` with:

```ts
const mockEnqueueUpload = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/queue', () => ({
  enqueueUpload: (userId: string, payload: unknown) => mockEnqueueUpload(userId, payload),
}));
```

In the `'does NOT mark fingerprint synced when upload is queued'` test, add:

```ts
expect(mockEnqueueUpload).toHaveBeenCalledTimes(3);
expect(mockEnqueueUpload).toHaveBeenCalledWith('user-1', expect.any(Object));
```

- [ ] **Step 1d: Add the unauthenticated test**

Add inside the `describe('useSync', ...)` block:

```ts
it('throws unauthenticated when user.id is null', async () => {
  mockUseAuth.mockReturnValue({ user: null });
  const { result } = renderHook(() => useSync(), { wrapper });
  await act(async () => {
    result.current.startSync();
    await new Promise((r) => setTimeout(r, 0));
    fireDiscovered();
  });
  await waitFor(() => expect(result.current.state).toBe('error'));
  expect(result.current.error).toBe('unauthenticated');
});
```

### Step 2: Run the test, confirm it fails

```bash
cd apps/mobile && pnpm test -- --testPathPattern=useSync 2>&1 | tail -20
```

Expected: tests fail because `useSync` does not yet read `useAuth` or thread userId.

### Step 3: Modify `apps/mobile/src/hooks/useSync.ts`

- [ ] **Step 3a: Add the `useAuth` import**

At the top of the file, alongside other imports:

```ts
import { useAuth } from './useAuth';
```

- [ ] **Step 3b: Read `user.id` inside the hook**

Right after `const queryClient = useQueryClient();` (around line 27), add:

```ts
const { user } = useAuth();
```

- [ ] **Step 3c: Guard at the top of `startSync`**

Replace the current first lines of `startSync` (the `abortRef.current = false; setError(null); ...` block, around lines 67-74):

```ts
const startSync = useCallback(async () => {
  abortRef.current = false;
  setError(null);
  setSyncedCount(0);
  setDiscoveredDevices([]);
  setCurrentDiveIndex(0);
  setTotalDives(0);
```

with:

```ts
const startSync = useCallback(async () => {
  abortRef.current = false;
  setError(null);
  setSyncedCount(0);
  setDiscoveredDevices([]);
  setCurrentDiveIndex(0);
  setTotalDives(0);

  if (!user?.id) {
    setState('error');
    setError('unauthenticated');
    return;
  }
  const userId = user.id;
```

- [ ] **Step 3d: Thread `userId` into the cache calls**

Find this block (around lines 108-114):

```ts
const known = await getSyncedFingerprints().catch(() => new Set<string>());
```

Replace with:

```ts
const known = await getSyncedFingerprints(userId).catch(() => new Set<string>());
```

Find the `markFingerprintSynced` call (around line 138):

```ts
await markFingerprintSynced(entry.fingerprintHex);
```

Replace with:

```ts
await markFingerprintSynced(userId, entry.fingerprintHex);
```

Find the `enqueueUpload` call (in the catch block, around line 142):

```ts
await enqueueUpload(payload);
```

Replace with:

```ts
await enqueueUpload(userId, payload);
```

- [ ] **Step 3e: Update the `useCallback` dependency array**

The existing `useCallback` deps are `[queryClient]`. Add `user?.id`:

```ts
}, [queryClient, user?.id]);
```

### Step 4: Run the tests

```bash
cd apps/mobile && pnpm test -- --testPathPattern=useSync 2>&1 | tail -10
```

Expected: `Tests: 7 passed, 7 total` (6 updated + 1 new unauthenticated).

Then run the full suite to confirm no regression:

```bash
cd apps/mobile && pnpm test 2>&1 | tail -10
```

Expected: all suites pass — `useAuth` (3) + `syncedDives` (9) + `queue` (7) + `useSync` (7) = 26 tests.

### Step 5: Verify TypeScript

```bash
cd apps/mobile && pnpm typecheck 2>&1 | tail -3
```

Expected: clean.

### Step 6: Commit

```bash
git add apps/mobile/src/hooks/useSync.ts \
        apps/mobile/src/__tests__/useSync.test.tsx
git commit -m "feat(useSync): thread user.id into cache calls + auth guard

useSync now reads user.id from useAuth at the top of startSync, throws
'unauthenticated' if null (defensive — Sync screen sits behind auth in
the nav), and threads the captured id through getSyncedFingerprints,
markFingerprintSynced, and enqueueUpload.

Mid-sync logout is handled by capture: the userId is captured at sync
start, so any in-flight markFingerprintSynced still attributes the
upload to the user who actually authenticated the POST. Correct
semantics, documented in the spec.

Tests: 7 passing (6 updated + 1 unauthenticated guard).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Real-device retest (manual gate)

This is an operator task, not a subagent task. Closes the loop on the original bug.

- [ ] **Step 1: Rebuild on the iPhone**

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile
npx expo run:ios --device
```

- [ ] **Step 2: Verify same-user flow first**

- Log in as user A (the account that previously synced 7 dives).
- Tap Sync with the Peregrine in BLE pairing mode.
- Expected: state goes idle → scanning → connecting → listing → complete with `0 dive(s) synced` (because user A's fingerprints are migrated and intact). NO redownload.

If user A's existing fingerprints were dropped by the destructive migration: redownload is acceptable for this one-time upgrade. The screen will show a count > 0.

- [ ] **Step 3: Verify user-switching flow (the original bug)**

- Log out of user A.
- Create a new user B (signup).
- Tap Sync with the Peregrine in BLE pairing mode.
- Expected: all dives on the device download for user B (`N dive(s) synced` where N matches the count on the device).
- Open the dive list — verify the dives appear under user B's account.

- [ ] **Step 4: Verify queue scoping (offline → switch → online)**

If you have a quick way to disable network mid-sync:

- Log in as user A. Disable network. Tap Sync. Some dives queue (`enqueueUpload` is called).
- Log out. Log in as user B. Re-enable network.
- Verify: user A's queued rows do NOT POST as user B. Either they sit waiting for user A to log back in, or they appear in user A's account (not user B's) when user A returns online.

If you don't have a quick offline toggle, skip this step — `queue.test.ts` covers it in isolation.

- [ ] **Step 5: Report results**

If all three flows pass: the bug is fixed. No more code changes needed.

If anything fails: capture the SyncScreen error message (the `__DEV__` raw-error display was removed in `392159e`, but Console.app filtered to "DiveChef" will still show the `dlog` checkpoint output during `listDives()`).

---

## Self-Review

**1. Spec coverage:**

- Spec §"Architecture" → Tasks 1-3.
- Spec §"Schema migration" → Task 1 step 3 + Task 2 step 3 (both have `ensureMigrated`).
- Spec §"Module API changes — syncedDives" → Task 1 step 3.
- Spec §"Module API changes — queue" → Task 2 step 3.
- Spec §"Hook integration" → Task 3 steps 3a-3e.
- Spec §"Tests":
  - syncedDives 6 updated + 2 isolation + 1 migration → Task 1 steps 1b-1c.
  - queue.test.ts (new) with isolation + migration → Task 2 step 1.
  - useSync 6 updated + 1 unauthenticated → Task 3 steps 1a-1d.
- Spec §"Logout — no code changes" → no task; correctly left out.
- Spec §"Acceptance Criteria":
  1. (logout + new user + sync = N dives) → Task 4 step 3.
  2. (logout + same user + sync = only new dives) → Task 4 step 2.
  3. (queue not flushed under wrong user) → Task 4 step 4 + queue.test.ts unit test.
  4. (migration runs once) → Task 1 step 3 + Task 2 step 3 use `PRAGMA table_info` to short-circuit on subsequent calls.
  5. (existing tests pass with userId threaded) → Task 1 step 4 + Task 3 step 4.
  6. (queue.test.ts covers isolation + migration) → Task 2 step 1.
  7. (real-device retest) → Task 4.

All criteria covered.

**2. Placeholder scan:**

No "TBD"s, no "implement later", no narrative steps without code, no "similar to Task N". Each step shows actual SQL / test code / TypeScript / commands.

**3. Type consistency:**

- `getSyncedFingerprints(userId: string): Promise<Set<string>>` — Task 1 (definition), Task 3 (consumer). Match.
- `markFingerprintSynced(userId: string, fingerprint: string): Promise<void>` — Task 1, Task 3. Match.
- `enqueueUpload(userId: string, payload: unknown): Promise<void>` — Task 2, Task 3. Match.
- `flushQueue(userId: string, uploadFn): Promise<...>` — Task 2 only; no useSync caller (consistent with current code: useSync doesn't call flushQueue, that's done by a different layer).
- User type: `User.id: string` confirmed in `packages/shared/src/types.ts:6`.
- Error code `'unauthenticated'` — Task 3 (set), test asserts the exact string. SyncScreen falls through to `t('common.error')` for unknown codes (verified earlier in this session at `SyncScreen.tsx:103`).

---

## Execution Notes

- Tasks 1, 2, 3 must run in order — Task 3 imports new signatures introduced by Tasks 1 and 2.
- Task 4 (real-device) must run last and is a manual gate, not subagent work.
- Each task is a single commit. Total expected new commits: 3 + 0 (Task 4 is verification, no commit).
- After Task 3 lands, expect TypeScript to be clean and ALL existing tests to still pass — the cumulative regression guard is `pnpm test` returning `Tests: 26 passed`.
