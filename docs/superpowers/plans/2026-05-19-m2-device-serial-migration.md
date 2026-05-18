# M2 — Local DB device_serial migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-19
**Status:** Ready for execution.
**Spec:** `docs/superpowers/specs/2026-05-18-phase-a-beta-ship-design.md` (Multi-device architecture > Local DB schema migration).
**Depends on:** M1 (`@divechef/shared` → `DeviceInfo` type, `getDeviceInfo()` native + mock surface).

> **Worktree note:** If executing this plan in a fresh worktree, run
> `bash scripts/bootstrap-worktree.sh` from the worktree root before any
> `xcodebuild` or `gradlew` command. The script copies gitignored
> Expo-regenerated iOS/Android build inputs from main and runs
> `pod install`.

**Goal:** Add `device_serial` scoping to both local SQLite tables (`synced_fingerprints` and `upload_queue`) so multi-device users get correct dedup and queue isolation. Update every API site to take `deviceSerial` alongside the existing `userId`. DRY up the mock's local-type drift in the same pass.

**Architecture:** Same destructive-migration pattern we used twice for user-scoping (`2026-05-16-user-scoped-local-caches.md`). For `synced_fingerprints` the PK becomes the composite `(user_id, device_serial, fingerprint)` (DROP + CREATE rebuild). For `upload_queue`, add the `device_serial TEXT NOT NULL` column with the ALTER + DELETE-legacy-rows pattern. `useSync` and `useQueueFlush` thread `deviceSerial` from a new state field that's set after the upcoming P1 add-a-device flow registers a device — for M2, we add the parameter and update tests, P1 wires the actual values.

**Tech Stack:** TypeScript, expo-sqlite, Jest. No native, no UI in this plan.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `apps/mobile/src/native/DiveComputer.mock.ts` | **Modify** | Task 0: drop local re-declarations of `ScanResult`/`ManifestEntry`/`DownloadProgress`/`DiveComputerModule`; import them from `./DiveComputer`. |
| `apps/mobile/src/services/syncedDives.ts` | **Modify** | Add `deviceSerial` param; PK becomes composite. |
| `apps/mobile/src/services/__tests__/syncedDives.test.ts` | **Modify** | Update mock + existing tests; add device-isolation + migration tests. |
| `apps/mobile/src/services/queue.ts` | **Modify** | Add `deviceSerial` param + column; threaded through every public function. |
| `apps/mobile/src/services/__tests__/queue.test.ts` | **Modify** | Same as syncedDives. |
| `apps/mobile/src/hooks/useSync.ts` | **Modify** | Thread `deviceSerial` into all 3 cache calls. Read from a new `selectedDeviceSerial` state (P1 will set it; M2 stubs it). |
| `apps/mobile/src/__tests__/useSync.test.tsx` | **Modify** | Update tests with `deviceSerial` thread; add "no device selected" guard test. |
| `apps/mobile/src/hooks/useQueueFlush.ts` | **Modify** | Same threading as useSync. |

---

## Task 0: DRY the mock — remove local type drift

The mock currently re-declares `ScanResult`/`ManifestEntry`/`DownloadProgress` and a local `DiveComputerModule` interface that has already drifted (M1's `getDeviceInfo` is missing from the local interface — only the canonical type from `index.ts:13-15` saves consumers). This task fixes the root cause before M2 adds another method (signature changes) that would re-introduce drift.

### Step 1: Read the current state

```bash
head -25 apps/mobile/src/native/DiveComputer.mock.ts
```

You'll see local re-declarations near the top.

### Step 2: Replace with imports from `./DiveComputer`

Replace the top of `apps/mobile/src/native/DiveComputer.mock.ts` so the type re-declarations become imports. The first ~18 lines that locally re-declare `ScanResult`, `ManifestEntry`, `DownloadProgress`, and `DiveComputerModule` should become:

```ts
import type {
  ScanResult,
  ManifestEntry,
  DownloadProgress,
  DeviceInfo,
  DiveComputerModule,
} from './DiveComputer';
```

The `MockDiveComputerModule` class already `implements DiveComputerModule` — once the import comes from the canonical source, the class will fail typecheck if it's missing any method (including `getDeviceInfo` from M1, which it now has). This is the value of the cleanup: the local interface can never silently drift.

### Step 3: Verify typecheck + tests

```bash
cd apps/mobile && pnpm typecheck && pnpm test 2>&1 | tail -8
```

Expected: typecheck clean (since M1 added `getDeviceInfo` to the mock class, the canonical interface is satisfied). All 29 JS tests pass.

### Step 4: Commit

```bash
git add apps/mobile/src/native/DiveComputer.mock.ts
git commit -m "refactor(mock): import types from canonical DiveComputer.ts

The mock had local re-declarations of ScanResult/ManifestEntry/
DownloadProgress and a local DiveComputerModule interface that drifted
during M1 — the local interface was missing getDeviceInfo, only saved
because index.ts casts the require'd mock to the canonical type.

Importing from ./DiveComputer makes the implements clause enforce
the canonical contract. Future signature changes (M2 adds deviceSerial
to APIs the mock proxies) can't silently drift now.

29 JS tests stay green; typecheck clean."
```

---

## Task 1: device-scope `syncedDives.ts`

Mirrors the user-scoping migration we shipped at commit `0556def` for the same module. Same DROP+CREATE pattern; same destructive migration of legacy rows.

### Step 1: Update the test mock to track the composite PK

In `apps/mobile/src/services/__tests__/syncedDives.test.ts`, the existing `jest.mock('expo-sqlite', ...)` already tracks `columns` and `rows`. Update the row shape to include `device_serial`, and update the inline SQL parsers to handle:

- `INSERT OR IGNORE INTO synced_fingerprints (user_id, device_serial, fingerprint, synced_at) VALUES (?, ?, ?, ?)` — push `{user_id, device_serial, fingerprint, synced_at}`.
- `SELECT fingerprint FROM synced_fingerprints WHERE user_id = ? AND device_serial = ?` — filter by both.
- `DROP TABLE synced_fingerprints` and the CREATE TABLE form (existing logic): on CREATE, set columns to `{user_id, device_serial, fingerprint, synced_at}`.

### Step 2: Update existing tests to thread `deviceSerial`

A constant `D1 = 'serial-A'`, `D2 = 'serial-B'` alongside the existing `U1`. Replace every `getSyncedFingerprints(U1)` with `getSyncedFingerprints(U1, D1)` and every `markFingerprintSynced(U1, fp)` with `markFingerprintSynced(U1, D1, fp)`.

### Step 3: Add 3 new tests

```ts
it('different devices for the same user see different sets', async () => {
  await markFingerprintSynced(U1, D1, 'fp-on-A');
  await markFingerprintSynced(U1, D2, 'fp-on-B');
  expect((await getSyncedFingerprints(U1, D1)).has('fp-on-A')).toBe(true);
  expect((await getSyncedFingerprints(U1, D1)).has('fp-on-B')).toBe(false);
  expect((await getSyncedFingerprints(U1, D2)).has('fp-on-B')).toBe(true);
});

it('marking on device A does not affect device B', async () => {
  await markFingerprintSynced(U1, D1, 'shared');
  expect((await getSyncedFingerprints(U1, D2)).size).toBe(0);
});

it('migrates pre-device-serial rows by dropping them', async () => {
  // Seed a row with no device_serial (pre-migration shape)
  (SQLite as unknown as { __seedLegacyRow: (fp: string) => void }).__seedLegacyRow('legacy-fp');
  expect((await getSyncedFingerprints(U1, D1)).has('legacy-fp')).toBe(false);
});
```

The mock's `__seedLegacyRow` helper already exists from the prior migration work — extend it to seed a row with `device_serial = null` so the migration's DROP path consumes it.

### Step 4: Run the test, confirm failures

```bash
cd apps/mobile && pnpm test -- --testPathPattern=syncedDives 2>&1 | tail -10
```

### Step 5: Update `apps/mobile/src/services/syncedDives.ts`

Three-branch `ensureMigrated` becomes:

- **Fresh install** (PRAGMA returns no rows): CREATE TABLE with the new composite PK.
- **Already migrated** (PRAGMA includes `device_serial`): defensive `DELETE FROM synced_fingerprints WHERE device_serial IS NULL` (no-op if data is clean).
- **Pre-migration** (table exists, no `device_serial` column): DROP + CREATE rebuild.

```ts
async function ensureMigrated(database: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(synced_fingerprints)'
  );
  const colNames = new Set(cols.map((c) => c.name));

  if (colNames.size === 0) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS synced_fingerprints (
        user_id       TEXT NOT NULL,
        device_serial TEXT NOT NULL,
        fingerprint   TEXT NOT NULL,
        synced_at     INTEGER NOT NULL,
        PRIMARY KEY (user_id, device_serial, fingerprint)
      );
    `);
    return;
  }

  if (colNames.has('device_serial')) {
    await database.runAsync('DELETE FROM synced_fingerprints WHERE device_serial IS NULL');
    return;
  }

  // Pre-M2 (post-M1 user-scoped, pre-device-scoped). Rebuild.
  await database.execAsync('DROP TABLE synced_fingerprints');
  await database.execAsync(`
    CREATE TABLE synced_fingerprints (
      user_id       TEXT NOT NULL,
      device_serial TEXT NOT NULL,
      fingerprint   TEXT NOT NULL,
      synced_at     INTEGER NOT NULL,
      PRIMARY KEY (user_id, device_serial, fingerprint)
    );
  `);
}
```

Public APIs:

```ts
export async function getSyncedFingerprints(userId: string, deviceSerial: string): Promise<Set<string>> {
  if (!userId) throw new Error('syncedDives: userId is required');
  if (!deviceSerial) throw new Error('syncedDives: deviceSerial is required');
  const database = await getDb();
  const rows = await database.getAllAsync<{ fingerprint: string }>(
    'SELECT fingerprint FROM synced_fingerprints WHERE user_id = ? AND device_serial = ?',
    [userId, deviceSerial]
  );
  return new Set(rows.map((r) => r.fingerprint));
}

export async function markFingerprintSynced(
  userId: string,
  deviceSerial: string,
  fingerprint: string
): Promise<void> {
  if (!userId) throw new Error('syncedDives: userId is required');
  if (!deviceSerial) throw new Error('syncedDives: deviceSerial is required');
  if (!fingerprint) throw new Error('syncedDives: fingerprint is required');
  const database = await getDb();
  await database.runAsync(
    'INSERT OR IGNORE INTO synced_fingerprints (user_id, device_serial, fingerprint, synced_at) VALUES (?, ?, ?, ?)',
    [userId, deviceSerial, fingerprint, Date.now()]
  );
}
```

### Step 6: Run tests, confirm green

```bash
cd apps/mobile && pnpm test -- --testPathPattern=syncedDives 2>&1 | tail -10
```

Expected: tests pass; typecheck fails at `useSync.ts` callsites (expected — Task 4 fixes it).

### Step 7: Commit

```bash
git add apps/mobile/src/services/syncedDives.ts \
        apps/mobile/src/services/__tests__/syncedDives.test.ts
git commit -m "feat(syncedDives): scope by device_serial in addition to user_id

Composite PK becomes (user_id, device_serial, fingerprint). Same
destructive DROP+CREATE migration we used for user-scoping in 0556def.

Public APIs add deviceSerial as the second positional param after
userId. Tests cover device-isolation (different devices for same user
see different sets) and migration (pre-device-serial rows get dropped).

Multi-device fingerprint dedup is now correct: a user with both a
Peregrine and a Perdix has independent fingerprint caches per device,
so a fingerprint hash collision between two physical computers can't
cause silent skip on the wrong device."
```

---

## Task 2: device-scope `queue.ts`

Mirrors Task 1 for `upload_queue`. ALTER + DELETE pattern (no PK change — `id INTEGER AUTOINCREMENT` stays, just a new NOT NULL column).

### Step 1: Update the test mock

Same shape as Task 1 — extend the in-memory mock to:
- Track `device_serial` on the row type.
- Honor `INSERT INTO upload_queue (user_id, device_serial, payload)`.
- Honor `SELECT ... WHERE user_id = ? AND device_serial = ?`.
- Honor `DELETE FROM upload_queue WHERE user_id = ? AND device_serial = ?` for `clearQueue`.
- Honor `DELETE FROM upload_queue WHERE device_serial IS NULL` (migration).

### Step 2: Update existing tests + add 4 new ones

The 4 new tests mirror the syncedDives device-isolation pattern:
- `'different devices have separate queues for the same user'`
- `'flushQueue scopes to the current device'`
- `'clearQueue does not affect other devices'`
- `'migrates pre-device-serial rows by deleting them'`

### Step 3: Update `apps/mobile/src/services/queue.ts`

Schema migration in `ensureMigrated`:

- Fresh install: `CREATE TABLE IF NOT EXISTS upload_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, device_serial TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), attempts INTEGER NOT NULL DEFAULT 0)` + `CREATE INDEX IF NOT EXISTS idx_upload_queue_user_device ON upload_queue(user_id, device_serial)`.
- Already migrated (`device_serial` present): `DELETE FROM upload_queue WHERE device_serial IS NULL` (defensive).
- Pre-migration (`device_serial` absent): `ALTER TABLE upload_queue ADD COLUMN device_serial TEXT` + `CREATE INDEX ...` + `DELETE FROM upload_queue WHERE device_serial IS NULL` (drops everything since the column was just added nullable).

Public APIs add `deviceSerial` as the second positional param. The existing `dedup-via-getSyncedFingerprints` call inside `flushQueue` (from commit `8dbcb24`) now passes `deviceSerial` through to `getSyncedFingerprints(userId, deviceSerial)`. The cross-check stays correct.

### Step 4-6: Run tests, commit

Same pattern as Task 1. Commit message:

```
feat(queue): scope upload_queue by device_serial in addition to user_id

ALTER+DELETE migration (no PK change). Public APIs add deviceSerial.
flushQueue's existing getSyncedFingerprints cross-check now scopes
correctly to the current device — the mark-synced fingerprints from
the right physical computer drain the right queue rows.

Multi-device users with offline syncs from both devices flush the
right rows under each device's bearer-token-equivalent context.
```

---

## Task 3: thread `deviceSerial` through `useSync`

Hook reads a "currently-selected device serial" from somewhere. For M2 this is hardcoded as a placeholder (P1 will wire the real value from the registered device). The placeholder is acceptable because no production user is hitting the hook today — only tests.

### Step 1: Add `selectedDeviceSerial` to the hook's return shape

Read `apps/mobile/src/hooks/useSync.ts`. Add a new state field:

```ts
const [selectedDeviceSerial, setSelectedDeviceSerial] = useState<string | null>(null);
```

Expose `setSelectedDeviceSerial` in the hook's return so P1 can wire it later.

### Step 2: Guard `startSync` on null device

Right after the existing `if (!user?.id) { setError('unauthenticated'); ... }` guard, add:

```ts
if (!selectedDeviceSerial) {
  setState('error');
  setError('no_device_selected');
  return;
}
const deviceSerial = selectedDeviceSerial;
```

### Step 3: Thread `deviceSerial` into the cache calls

Replace `getSyncedFingerprints(userId)` with `getSyncedFingerprints(userId, deviceSerial)`. Same for `markFingerprintSynced(userId, entry.fingerprintHex)` → `markFingerprintSynced(userId, deviceSerial, entry.fingerprintHex)`. Same for `enqueueUpload(userId, payload)` → `enqueueUpload(userId, deviceSerial, payload)`.

Add `selectedDeviceSerial` to the `useCallback` dependency array.

### Step 4: Update tests

In `apps/mobile/src/__tests__/useSync.test.tsx`:

- Default `beforeEach` sets `selectedDeviceSerial` to `'test-serial'` (use a `setSelectedDeviceSerial` call inside an `act()` after the hook mounts in each test that exercises sync).
- Mock signatures for `getSyncedFingerprints`, `markFingerprintSynced`, `enqueueUpload` all gain `deviceSerial` parameter.
- Add a new test: `'sets no_device_selected error when selectedDeviceSerial is null'` — mounts the hook, doesn't set the device serial, calls `startSync`, expects `state === 'error'` and `error === 'no_device_selected'`.

### Step 5-6: Test, commit

Same pattern. Commit message:

```
feat(useSync): thread selectedDeviceSerial into cache calls

Hook now reads a selectedDeviceSerial state field (defaults to null;
P1 wires the real value from the registered device). startSync guards
on it being non-null — sets error 'no_device_selected' when null.

All three cache calls (getSyncedFingerprints, markFingerprintSynced,
enqueueUpload) thread the device serial through. M1's userId-scoping
patterns extend cleanly.
```

---

## Task 4: thread `deviceSerial` through `useQueueFlush`

Same shape as Task 3 for the background flush.

### Step 1: Hook adds `deviceSerial` parameter

The current `useQueueFlush()` reads `userId` from `useAuth`. We can't read the device serial from `useAuth` — it's not auth state. Instead, pass it as a parameter:

```ts
export function useQueueFlush(deviceSerial: string | null) {
  // ... existing userId logic
  const refreshCount = useCallback(async () => {
    if (!userId || !deviceSerial) {
      setPendingCount(0);
      return;
    }
    const count = await getPendingCount(userId, deviceSerial);
    setPendingCount(count);
  }, [userId, deviceSerial]);

  const flush = useCallback(async () => {
    if (!userId || !deviceSerial) return;
    if (isFlushing.current) return;
    isFlushing.current = true;
    try {
      await flushQueue(userId, deviceSerial, uploadDive);
      await refreshCount();
    } finally {
      isFlushing.current = false;
    }
  }, [refreshCount, userId, deviceSerial]);
  // ... rest unchanged
}
```

### Step 2: Update consumers

Find all `useQueueFlush()` calls and add the `deviceSerial` argument. Today the only consumer is `apps/mobile/src/components/QueueBanner.tsx`. The banner doesn't know about device selection — it gets the serial from a prop or from a higher-up context. For M2, just pass `null` from QueueBanner so the banner gracefully shows zero pending. P1 will wire the real value.

```tsx
// QueueBanner.tsx
export function QueueBanner({ deviceSerial }: { deviceSerial: string | null }) {
  const { pendingCount } = useQueueFlush(deviceSerial);
  // ... existing logic
}
```

Existing call sites of `<QueueBanner />` need to pass `deviceSerial={null}` for now. P1 will replace `null` with the real value once the device-selection state is in place.

### Step 3-5: Test, commit

Update `useQueueFlush` tests if any exist (none today per spec); update `QueueBanner` tests if any exist (also none today). Commit.

```
feat(useQueueFlush): accept deviceSerial parameter for queue scoping

Hook now takes deviceSerial as an argument; null disables flushing
gracefully. QueueBanner passes null for now — P1 wires the real value
from the user's selected/registered device.

flushQueue and getPendingCount in queue.ts now receive both userId
and deviceSerial, completing the device-scoping coverage of all
local-cache APIs.
```

---

## Self-Review

**1. Spec coverage:**

- ✅ `synced_fingerprints` PK becomes `(user_id, device_serial, fingerprint)` — Task 1.
- ✅ `upload_queue` adds `device_serial NOT NULL` — Task 2.
- ✅ Public APIs take `deviceSerial` — Tasks 1, 2.
- ✅ `useSync` and `useQueueFlush` thread it — Tasks 3, 4.
- ✅ Migration drops legacy rows — Tasks 1, 2.
- ✅ Mock cleanup — Task 0.

**2. Placeholder scan:** No "TBD"s. The `selectedDeviceSerial = null` placeholder in P1 is documented as "P1 wires the real value" — this is the contract, not a placeholder.

**3. Type consistency:**

- `deviceSerial: string` (non-null when API is called; the null check happens at the hook layer before the API is invoked).
- Composite PK and parameter ordering: `(userId, deviceSerial, ...)` — userId first, deviceSerial second. Consistent across all 6 modified files.

---

## Execution notes

- Run as one M2 worktree (`m2-device-serial-migration`) with 5 commits on the branch (Task 0 + Tasks 1-4).
- M2 doesn't depend on M3 or Housekeeping; can run in parallel with both.
- After M2 lands, P1 wires the real `selectedDeviceSerial` from the registered device.
