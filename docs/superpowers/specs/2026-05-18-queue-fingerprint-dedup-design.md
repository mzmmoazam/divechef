# Queue Fingerprint Dedup Design

**Date:** 2026-05-18
**Status:** Design approved (pending spec review), ready for implementation plan.
**Triggering observation:** During the user-scoped local-caches device retest, a partial sync left 6 rows in `upload_queue` whose fingerprints had since been successfully POSTed by a subsequent sync. Those rows now retry forever (backend rejects as duplicates → uploadFn returns false → attempts++ → row stays). The yellow `QueueBanner` permanently shows "6 pending uploads" even though every dive is safely on the server.

---

## Goal

Make `flushQueue` skip queued rows whose fingerprint is already in the local `synced_fingerprints` cache, so the queue drains naturally and `pendingCount` reflects reality.

---

## Why

**User-visible defect:** [QueueBanner.tsx:6-21](apps/mobile/src/components/QueueBanner.tsx#L6-L21) renders a yellow warning banner whenever `pendingCount > 0`. After any partial-success sync (some dives POST, some fail and queue), the next sync re-downloads the unsynced ones from the device and POSTs them via the direct path. Those POSTs succeed and `markFingerprintSynced` is called — but the original queued rows are now stale (their fingerprints exist on the server). On every app foregrounding, `useQueueFlush.flush()` retries them; backend rejects with a 4xx duplicate; `attempts++`; row sticks forever. The banner never clears.

**Reproduces 100% on any partial-failure sync.** Not a corner case — every user who hits a transient network/backend issue mid-sync ends up with a permanent stuck banner.

**Correctness vs. presentation:** No data is lost (server has every dive). No security issue. But the UI contradicts reality, which erodes trust in the app's sync correctness — exactly the trust we just spent the last day rebuilding via the user-scoped local-caches plan.

---

## Architecture — Option A: dedup inside `flushQueue`

`queue.ts` imports `getSyncedFingerprints` from `syncedDives.ts`. `flushQueue` fetches the user's known-synced set once at the top of its loop, then per-row checks whether `JSON.parse(row.payload).fingerprintHex` is in that set. If yes, the row is treated as already-done: deleted from the queue, counted as `succeeded`, no POST attempted. If no, the existing upload path runs unchanged.

```
        ┌──────────────────────┐
        │ useQueueFlush.flush  │ ──── fires on AppState foreground
        └─────────┬────────────┘
                  │ flushQueue(userId, uploadDive)
                  ▼
        ┌──────────────────────┐
        │ flushQueue           │
        │   1. fetch synced    │ ── getSyncedFingerprints(userId) → Set<fp>
        │   2. for each row:   │
        │      a. parse payload│
        │      b. fp in set?   │
        │         yes → DELETE │
        │              (count  │
        │               as ok) │
        │         no  → POST   │
        │              normal  │
        └──────────────────────┘
```

**Why Option A over caller-side dedup:** safe by default. Any future caller of `flushQueue` (e.g., a Profile-screen "Retry uploads" button) inherits dedup automatically, without having to remember to wire it. With caller-side dedup, forgetting to wire it brings back exactly the bug this spec exists to fix.

**Honest coupling:** `queue.ts` and `syncedDives.ts` are not generic stores; both are *the local sync state for this app*. Coupling them around a shared "is this dive done?" question is honest, not a domain-boundary violation.

---

## Module API changes

`flushQueue`'s public signature is **unchanged**:

```ts
export async function flushQueue(
  userId: string,
  uploadFn: (payload: unknown) => Promise<boolean>
): Promise<{ succeeded: number; failed: number }>
```

Internal behavior:

1. Fetches `known = await getSyncedFingerprints(userId)` once at the top.
   - On error (e.g. transient SQLite failure on the syncedDives DB), default `known = new Set<string>()` — i.e., fall back to the existing all-rows behavior. Don't let one local-DB hiccup block all upload retries.
2. For each row, before calling `uploadFn`:
   - Parse `payload` (existing step).
   - If `payload.fingerprintHex` is a string AND `known.has(payload.fingerprintHex)`:
     - `DELETE FROM upload_queue WHERE id = ?`
     - `succeeded++`
     - Continue to next row.
   - Else: existing behavior (call `uploadFn`, branch on its boolean).

The `succeeded` counter conflates "POSTed successfully" with "skipped because already synced," but the consumer (`useQueueFlush.refreshCount`) only uses it as a "queue is shrinking" signal. Both outcomes shrink the queue; the count is meaningful.

---

## Edge cases

- **Row payload missing `fingerprintHex` (legacy/unknown shape).** Treat as not-dedupable: fall through to normal `uploadFn`. We don't want to silently drop a row whose contents we don't recognize.
- **Row payload is non-JSON garbage.** Existing `try/catch` in `flushQueue` already handles parse failures with `attempts++`. Keep that path; the dedup check only runs after a successful parse.
- **`getSyncedFingerprints` throws.** Catch + fall back to empty set. The flush still runs as before.
- **Race: a row's fingerprint gets marked synced WHILE flush is mid-loop.** We fetch `known` once at the top, so a mid-loop mark wouldn't be reflected on this pass. Worst case: that row POSTs, backend rejects duplicate, attempts++. Next foregrounding picks it up. Acceptable; same behavior as today minus the dedup improvement.
- **The fetch races with concurrent `markFingerprintSynced` from a sync running in parallel.** Same race window as today; not introduced by this change.

---

## Tests

### Existing tests to update

`apps/mobile/src/services/__tests__/queue.test.ts` — 7 tests today. The mock factory currently swallows the `syncedDives` import path. To exercise the new dedup branch, the test file needs a mocked `getSyncedFingerprints`. Add `jest.mock('../syncedDives', ...)` alongside the existing `expo-sqlite` mock.

### New tests in `queue.test.ts`

1. **`'flushQueue skips rows whose fingerprint is already in synced set'`** — seed 2 queue rows for U1 with fingerprints `'fp-A'` and `'fp-B'`; mock `getSyncedFingerprints(U1)` to return `Set(['fp-A'])`; assert: `uploadFn` called exactly once (with payload containing `'fp-B'`); the `'fp-A'` row was DELETE'd; result is `{ succeeded: 2, failed: 0 }` (1 actual POST + 1 dedup-skip both count as success); `getPendingCount(U1)` is 0 after.

2. **`'flushQueue falls back when getSyncedFingerprints throws'`** — seed 1 row; mock `getSyncedFingerprints` to reject; assert: `uploadFn` is called normally; flush behavior matches the pre-dedup path.

3. **`'flushQueue passes through rows with no fingerprintHex'`** — seed 1 row whose payload is `{ otherField: 1 }`; mock `getSyncedFingerprints` to return any non-empty set; assert: `uploadFn` is still called (we don't drop unrecognized payloads).

4. **`'flushQueue does not call uploadFn when all rows are already synced'`** — seed 3 rows all with fingerprints in the known set; assert: `uploadFn` never called; result is `{ succeeded: 3, failed: 0 }`; queue is empty.

### What's not tested

- The `useQueueFlush` hook itself doesn't change behavior in this spec; existing AppState-flush wiring is unchanged. No new hook tests needed.
- The `QueueBanner` rendering is unchanged; no UI test needed.

---

## Out of scope

- Max-attempts cap on queue rows. Now unnecessary because dedup drains stale rows on the first pass after their fingerprint is locally marked.
- Backend-side recognition of duplicates as success. Could simplify further but requires server coordination; defer.
- Migrating existing stuck rows on user devices. The first `flushQueue` after this lands will drain them automatically — no user action required.
- Pull-based fingerprint sync from server (`GET /api/dives/fingerprints`). Separate spec; addresses cross-device drift, not the local-stuck-row problem.

---

## Risks

- **Coupling direction.** `queue.ts` now depends on `syncedDives.ts`. Both are sync-state modules, both are user-scoped, both live in `services/`. Acceptable; not a domain crossing. If a third sync-state module appears, consider extracting a shared `syncState` namespace.
- **Test mock surface grows.** `queue.test.ts` now mocks `expo-sqlite` *and* `syncedDives`. Both are simple, isolated mocks. Manageable.
- **Silent dedup might hide a real bug.** If somehow `markFingerprintSynced` were called for a fingerprint that *isn't* actually on the server (we don't believe this can happen — it's only called after a 2xx api response), we'd silently drop the row and the dive would be lost from the user's perspective. Mitigated by: `markFingerprintSynced` is only called from one place (useSync.ts) inside the success branch of `api.post`. Defense-in-depth: a future addition could verify-via-server before marking.

---

## Acceptance criteria

1. After a partial-success sync (some POST direct, some queue), the next direct sync of the remaining dives via `useSync` causes the queued rows to be deleted on the next `useQueueFlush.flush()` call (typically next app foregrounding) without any HTTP traffic for the duplicate rows.
2. `pendingCount` reflects only un-synced rows; the yellow `QueueBanner` clears once stale rows are flushed.
3. `flushQueue` continues to work correctly when `getSyncedFingerprints` throws (defensive fallback).
4. `queue.test.ts` covers all four new test cases listed above; total queue test count goes from 7 → 11.
5. Cross-suite test count: `useAuth (2) + syncedDives (9) + queue (11) + useSync (7) = 29`. All green; typecheck clean.
6. Real-device retest: User B's existing 6 stuck rows clear themselves on the first foregrounding after upgrading; the yellow banner disappears.
