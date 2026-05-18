# Queue Fingerprint Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-18
**Status:** Ready for execution.
**Spec:** `docs/superpowers/specs/2026-05-18-queue-fingerprint-dedup-design.md`

**Goal:** Make `flushQueue` skip rows whose fingerprint is already locally marked as synced, so stale rows from partial-success syncs drain naturally instead of retrying forever and pinning the `QueueBanner` open.

**Architecture:** Single-task TDD change in `apps/mobile/src/services/queue.ts`. Import `getSyncedFingerprints` from `syncedDives.ts`, fetch the user's known-synced set once at the top of the `flushQueue` loop, per-row check whether `JSON.parse(payload).fingerprintHex` is already in that set; if yes, DELETE the row and count it as `succeeded` without calling `uploadFn`. Defensive: if `getSyncedFingerprints` throws, fall back to an empty set so flush still runs as before.

**Tech Stack:** TypeScript, expo-sqlite, Jest. No native code, no UI changes.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `apps/mobile/src/services/queue.ts` | **Modify** | Add the fingerprint pre-check inside `flushQueue`. |
| `apps/mobile/src/services/__tests__/queue.test.ts` | **Modify** | Mock `syncedDives`, add 4 new tests for the dedup branch. |

---

## Task 1: Pre-check synced fingerprints inside `flushQueue`

**Files:**
- Modify: `apps/mobile/src/services/queue.ts`
- Modify: `apps/mobile/src/services/__tests__/queue.test.ts`

### Step 1: Add a `syncedDives` mock to the test file

Open `apps/mobile/src/services/__tests__/queue.test.ts`. Just below the existing `jest.mock('expo-sqlite', () => { ... })` factory (which ends with the closing `});` of the factory), insert this new block:

```ts
// Mock syncedDives so we can control which fingerprints flushQueue sees as already-synced.
const mockGetSyncedFingerprints = jest.fn();
jest.mock('../syncedDives', () => ({
  getSyncedFingerprints: (userId: string) => mockGetSyncedFingerprints(userId),
}));
```

In the existing `beforeEach` block, add a default return so existing tests don't fail:

```ts
mockGetSyncedFingerprints.mockResolvedValue(new Set<string>());
```

Place that line right after the existing `__resetQueueForTests();` call inside `beforeEach`.

### Step 2: Write the four failing tests

Append these four `it(...)` blocks to the existing `describe('queue', ...)` block (i.e. before the closing `});` of the describe at the bottom of the file):

```ts
  it('flushQueue skips rows whose fingerprint is already in the synced set', async () => {
    await enqueueUpload(U1, { fingerprintHex: 'fp-A', other: 1 });
    await enqueueUpload(U1, { fingerprintHex: 'fp-B', other: 2 });
    mockGetSyncedFingerprints.mockResolvedValue(new Set(['fp-A']));

    const seenPayloads: unknown[] = [];
    const result = await flushQueue(U1, async (p) => {
      seenPayloads.push(p);
      return true;
    });

    // 'fp-B' POSTs normally; 'fp-A' is dedup-skipped (no uploadFn call).
    expect(seenPayloads).toEqual([{ fingerprintHex: 'fp-B', other: 2 }]);
    // Both rows leave the queue: one via POST success, one via dedup-skip.
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(await getPendingCount(U1)).toBe(0);
  });

  it('flushQueue does not call uploadFn when all rows are already synced', async () => {
    await enqueueUpload(U1, { fingerprintHex: 'a' });
    await enqueueUpload(U1, { fingerprintHex: 'b' });
    await enqueueUpload(U1, { fingerprintHex: 'c' });
    mockGetSyncedFingerprints.mockResolvedValue(new Set(['a', 'b', 'c']));

    const uploadFn = jest.fn().mockResolvedValue(true);
    const result = await flushQueue(U1, uploadFn);

    expect(uploadFn).not.toHaveBeenCalled();
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(await getPendingCount(U1)).toBe(0);
  });

  it('flushQueue falls back to normal upload when getSyncedFingerprints throws', async () => {
    await enqueueUpload(U1, { fingerprintHex: 'fp-X' });
    mockGetSyncedFingerprints.mockRejectedValue(new Error('db read failed'));

    const uploadFn = jest.fn().mockResolvedValue(true);
    const result = await flushQueue(U1, uploadFn);

    expect(uploadFn).toHaveBeenCalledTimes(1);
    expect(uploadFn).toHaveBeenCalledWith({ fingerprintHex: 'fp-X' });
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('flushQueue passes through rows that have no fingerprintHex', async () => {
    await enqueueUpload(U1, { otherField: 'no fp here' });
    mockGetSyncedFingerprints.mockResolvedValue(new Set(['fp-A']));

    const uploadFn = jest.fn().mockResolvedValue(true);
    const result = await flushQueue(U1, uploadFn);

    // Unknown payload shape: don't drop it, run normal upload.
    expect(uploadFn).toHaveBeenCalledTimes(1);
    expect(uploadFn).toHaveBeenCalledWith({ otherField: 'no fp here' });
    expect(result.succeeded).toBe(1);
  });
```

### Step 3: Run the tests, confirm 4 fail

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile && \
pnpm test -- --testPathPattern=queue 2>&1 | tail -20
```

Expected: the 4 new tests fail because `flushQueue` doesn't yet consult `getSyncedFingerprints`. The existing 7 tests still pass.

### Step 4: Modify `flushQueue` in `apps/mobile/src/services/queue.ts`

At the top of the file, alongside the existing imports, add:

```ts
import { getSyncedFingerprints } from './syncedDives';
```

Replace the existing `flushQueue` function body. The current shape is:

```ts
export async function flushQueue(
  userId: string,
  uploadFn: (payload: unknown) => Promise<boolean>
): Promise<{ succeeded: number; failed: number }> {
  if (!userId) throw new Error('queue: userId is required');
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
```

Replace it with:

```ts
export async function flushQueue(
  userId: string,
  uploadFn: (payload: unknown) => Promise<boolean>
): Promise<{ succeeded: number; failed: number }> {
  if (!userId) throw new Error('queue: userId is required');
  const database = await getDb();
  const rows = await database.getAllAsync<{ id: number; payload: string; attempts: number }>(
    'SELECT id, payload, attempts FROM upload_queue WHERE user_id = ? ORDER BY created_at ASC',
    [userId]
  );

  // Fetch the user's already-synced fingerprint set once. If this fails,
  // fall back to an empty set so the flush still runs as before.
  const known: Set<string> = await getSyncedFingerprints(userId).catch(
    () => new Set<string>()
  );

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as unknown;
      const fp =
        typeof payload === 'object' &&
        payload !== null &&
        'fingerprintHex' in payload &&
        typeof (payload as { fingerprintHex?: unknown }).fingerprintHex === 'string'
          ? (payload as { fingerprintHex: string }).fingerprintHex
          : undefined;

      if (fp && known.has(fp)) {
        // Already synced via the direct path; the queued row is stale.
        // Delete it and count as success so the queue shrinks correctly.
        await database.runAsync('DELETE FROM upload_queue WHERE id = ?', [row.id]);
        succeeded++;
        continue;
      }

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
```

### Step 5: Run the tests, confirm 11 pass

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile && \
pnpm test -- --testPathPattern=queue 2>&1 | tail -10
```

Expected: `Tests: 11 passed, 11 total`.

Then run the full suite to confirm nothing else broke:

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile && pnpm test 2>&1 | tail -10
```

Expected: 4 suites, 29 tests passed (`useAuth (2) + syncedDives (9) + queue (11) + useSync (7)`).

### Step 6: Verify TypeScript

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile && pnpm typecheck 2>&1 | tail -3
```

Expected: clean (no output).

### Step 7: Commit

```bash
git add apps/mobile/src/services/queue.ts \
        apps/mobile/src/services/__tests__/queue.test.ts
git commit -m "feat(queue): drop stale rows whose fingerprint is already synced

After a partial-success sync, queued rows whose fingerprints get
POSTed via the next direct sync would otherwise retry forever:
backend rejects the duplicate, attempts++, the row sticks, and the
yellow QueueBanner permanently shows 'N pending' contradicting the
actual sync state.

flushQueue now imports getSyncedFingerprints from syncedDives and
fetches the user's known-synced set once at the top of the loop. Per
row, if its payload's fingerprintHex is already in that set, the row
is DELETE'd and counted as 'succeeded' without calling uploadFn —
no HTTP traffic for duplicates. Falls back to empty set if the read
throws, so a transient SQLite error doesn't block all retries.

Rows whose payload is missing fingerprintHex (legacy / unknown
shape) fall through to normal upload — losing a dive is worse than
retrying one.

Tests: queue.test.ts grows 7 → 11 with one test per branch (skip
some, skip all, fallback on throw, pass through unrecognized).
Total cross-suite: 29 passing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**

- Spec §"Architecture" → Task 1 Step 4 (the new `flushQueue` body).
- Spec §"Module API changes" → unchanged signature preserved in Step 4.
- Spec §"Edge cases":
  - Missing fingerprintHex → fall through → covered by test 4 ("passes through rows that have no fingerprintHex").
  - Non-JSON payload → existing `try/catch` → still in place in Step 4.
  - `getSyncedFingerprints` throws → `.catch(() => new Set())` → covered by test 3 ("falls back when getSyncedFingerprints throws").
  - Race conditions → behavior unchanged from today; no test needed.
- Spec §"Tests" → 4 new tests in `queue.test.ts` per Step 2 (skip-some, skip-all, fallback-on-throw, pass-through-unknown).
- Spec §"Acceptance criteria":
  1. (queued rows deleted on next flush after fingerprint marked synced) → unit-tested in test 1; real-device verification is out of scope here.
  2. (pendingCount reflects only un-synced rows) → emergent property of test 1's `getPendingCount === 0` assertion.
  3. (graceful fallback on throw) → test 3.
  4. (queue test count 7 → 11) → Steps 2 + 5.
  5. (cross-suite total 29; typecheck clean) → Steps 5 + 6.
  6. (real-device retest drains stuck rows) → not a code task; happens automatically on first foregrounding after upgrade.

All criteria covered.

**2. Placeholder scan:**

No "TBD"s, no "implement later", no "similar to Task N". Each step shows actual code or exact commands. The fingerprint extraction is written out in full (the type-narrowing pattern over `unknown`).

**3. Type consistency:**

- `getSyncedFingerprints(userId: string): Promise<Set<string>>` — matches the existing export from `services/syncedDives.ts`.
- `flushQueue(userId: string, uploadFn: ...): Promise<{ succeeded; failed }>` — signature unchanged.
- `payload.fingerprintHex` — referenced as a `string` after narrowing. Matches the producer (`useSync.ts:115` writes `fingerprintHex: entry.fingerprintHex` where `entry.fingerprintHex: string`).
- Test mock signatures match the production module: `mockGetSyncedFingerprints(userId)` returns `Promise<Set<string>>`.

---

## Execution Notes

- Single task, single commit. ~30 minutes if everything goes smoothly.
- The four new tests are independent and exercise distinct branches; each can debug in isolation if any fails.
- After this lands, real-device verification: User B's existing 6 stuck rows will drain on the first app-foreground transition without any user action. Confirm by checking the QueueBanner disappears.
