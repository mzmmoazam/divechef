# User-Scoped Local Caches Design

**Date:** 2026-05-16
**Status:** Design approved (pending spec review), ready for implementation plan.
**Triggering bug:** Logged out → created new user → synced same Peregrine → "0 dives synced" because local fingerprint cache from previous user filtered everything out.

---

## Goal

Make `services/syncedDives.ts` and `services/queue.ts` user-scoped so that switching users on the same device produces correct behavior: each user gets their own dedup set and their own pending-upload queue.

---

## Why — the bug class

Two device-local SQLite tables today have no notion of who their data belongs to:

| Module | Table | What it stores | Bug if mis-scoped |
|---|---|---|---|
| `syncedDives.ts` | `synced_fingerprints` | Fingerprints the local device has already uploaded | New user sees old user's set → "0 dives synced" (the bug) |
| `queue.ts` | `upload_queue` | Pending POST `/api/dives` payloads when offline | Silent data corruption: user A's queued dives POST to user B's account on next online flush — using user B's bearer token |

Both bugs come from the same architectural defect: **cache is device-scoped, but the data is user-scoped**.

The fingerprint variant is annoying. The queue variant is dangerous. Fixing them together is the only responsible option.

---

## Architecture

Add a `user_id TEXT NOT NULL` column to both tables. Thread the current user's id through the public APIs of both modules. Scope every read and write `WHERE user_id = ?`. Logout requires no special handling — rows for the previous user simply stop being read.

The `useSync` hook reads `user.id` from `useAuth` at the top of `startSync` and passes it through. If `user.id` is null at sync time (defensive only — the screen sits behind auth in the nav stack), throw `'unauthenticated'`; SyncScreen already falls through to `t('common.error')` for unmapped error codes, no new i18n needed.

```
┌──────────────┐
│  useSync     │ reads user.id from useAuth → passes to:
└──────┬───────┘
       │
       ├─→ getSyncedFingerprints(userId)
       ├─→ markFingerprintSynced(userId, fingerprint)
       └─→ enqueueUpload(userId, payload)

flushQueue(userId, uploadFn)  ← called by background retry / queue UI
```

---

## Schema migration

Two SQLite databases (`divechef_sync.db`, `divechef_queue.db`) need:

1. `ALTER TABLE … ADD COLUMN user_id TEXT` (idempotent — guarded by `PRAGMA table_info` check).
2. `DELETE FROM … WHERE user_id IS NULL` to drop pre-migration legacy rows.

This is destructive: any fingerprints synced before this fix are dropped, and any queued uploads from before this fix are dropped. The cost is bounded — one forced re-sync per user, dedup-by-fingerprint on the backend prevents double-store. The cost of NOT doing this — silently attributing orphan rows to the next user that logs in — is unbounded.

For `synced_fingerprints`, the primary key changes from `fingerprint` alone to `(user_id, fingerprint)` so two users sharing the same Peregrine on the same phone can each track the same dive independently. SQLite does not support `ALTER TABLE … ADD CONSTRAINT`, so the migration recreates the table:

```sql
CREATE TABLE synced_fingerprints_new (
  user_id     TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  synced_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, fingerprint)
);
INSERT INTO synced_fingerprints_new SELECT user_id, fingerprint, synced_at
  FROM synced_fingerprints WHERE user_id IS NOT NULL;
DROP TABLE synced_fingerprints;
ALTER TABLE synced_fingerprints_new RENAME TO synced_fingerprints;
```

For `upload_queue`, the existing `id INTEGER PRIMARY KEY AUTOINCREMENT` is fine; we just add the column and an index:

```sql
ALTER TABLE upload_queue ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_upload_queue_user_id ON upload_queue(user_id);
DELETE FROM upload_queue WHERE user_id IS NULL;
```

The migration runs once per `getDb()` first init, gated by checking whether the column exists.

---

## Module API changes

### `syncedDives.ts`

```ts
export async function getSyncedFingerprints(userId: string): Promise<Set<string>>;
export async function markFingerprintSynced(userId: string, fingerprint: string): Promise<void>;
```

All queries `WHERE user_id = ?`. `INSERT OR IGNORE` semantics still apply per the composite primary key.

### `queue.ts`

```ts
export async function enqueueUpload(userId: string, payload: unknown): Promise<void>;
export async function getPendingCount(userId: string): Promise<number>;
export async function flushQueue(userId: string, uploadFn: (payload: unknown) => Promise<boolean>): Promise<{ succeeded: number; failed: number }>;
export async function clearQueue(userId: string): Promise<void>;
```

All queries `WHERE user_id = ?`. The flush loop iterates only the current user's rows.

---

## Hook integration

In `useSync.ts`:

```ts
const { user } = useAuth();
// inside startSync:
if (!user?.id) throw new Error('unauthenticated');
const userId = user.id;
// ... pass userId to all syncedDives + queue calls ...
```

The captured `userId` is used for the entire sync session. If the user gets logged out mid-sync (unlikely but possible — token refresh failure), the in-flight calls still use the captured id, so `markFingerprintSynced` correctly attributes uploaded dives to the user who actually uploaded them.

Anywhere else `flushQueue` is called (e.g. a future background task, a "retry uploads" button), the caller passes the current `user.id`.

---

## Tests

### Existing tests to update

- `syncedDives.test.ts` (6 tests): pass a `userId` argument through every call. Mock helper unchanged.
- `useSync.test.tsx` (6 tests): mock `useAuth` to return a fixed `user.id = 'u1'`. Assert the mocked `getSyncedFingerprints` and `markFingerprintSynced` are called with `'u1'`.

### New tests

- `syncedDives.test.ts` — 2 user-isolation tests:
  - "different users see different sets" — mark `'fp1'` for user A, query as user B → empty.
  - "marking for one user doesn't affect another" — both users mark different fingerprints, each sees only their own.
- `useSync.test.tsx` — 1 unauthenticated test:
  - "throws when user.id is null" — mock `useAuth` returns `user: null`, expect state to land on `'error'` with `error === 'unauthenticated'`.
- `queue.test.ts` — new file. Mirror the syncedDives test pattern: enqueue/flush/getPendingCount user-isolation tests. Also covers the previously-untested base `flushQueue` behavior.

### Migration test

In each module's test file, add one "migrates legacy unscoped rows" test:
- Pre-populate the mock DB with rows that have `user_id IS NULL` (or a table at the old schema).
- Call `getDb()` (forces migration via the test helper).
- Assert legacy rows are gone and the schema is current.

---

## Logout

**No code changes.** Per the approach, rows for previous users sit in the DB but are never read because every query is scoped `WHERE user_id = ?`. Same-user re-login keeps state (good UX). A future janitor task can prune rows for users who have been permanently deleted server-side; out of scope here.

---

## Out of scope

- **Server-driven cache invalidation.** If a user deletes a dive on the backend (e.g. via a future web UI), the local cache still says "synced" → that dive can never come back via the device. Separate spec; needs a `GET /api/dives/fingerprints` endpoint and a "refresh known set" call in `useSync`.
- **Encryption at rest.** Fingerprints are not PII, but if we ever store more sensitive cached data per-user, sqlcipher or expo-secure-store may become the right home. Not now.
- **Cross-device sync of the dedup set.** Each device tracks independently; backend's fingerprint dedup is the canonical source. If user syncs Peregrine on phone A, then phone B, phone B will re-download (server returns 200/duplicate). Acceptable cost.
- **A "wipe all local data" power-user toggle.** Possible follow-up; not needed for this fix.

---

## Risks & mitigations

- **Migration runs every app launch.** First-launch-after-upgrade does the work; subsequent launches see the column already present and `PRAGMA table_info` short-circuits. Cheap. No user-visible delay.
- **Throwing 'unauthenticated' from `useSync`.** Reachable only via the defensive guard; nav already gates Sync behind auth. If someone introduces a code path that skips the gate, the throw fails loud instead of producing silent zero-dive syncs.
- **Test migration realism.** The Jest mock for `expo-sqlite` is hand-rolled and doesn't natively support `ALTER TABLE` semantics. The migration test will use a more faithful mock that tracks columns explicitly, or use `:memory:` mode of the real `expo-sqlite` if Expo SDK 54 supports it in Node Jest (verify during implementation; if not, document the gap and rely on a manual real-device upgrade test).
- **The captured `userId` is one-shot per sync.** If user logs out mid-sync, the in-flight call uses the old id. Correct semantics: the upload was authenticated under the old user's token, so the fingerprint marking belongs to that user. Documented behavior.

---

## Acceptance criteria

1. After logout + creating a new user + tapping Sync on a Peregrine that the previous user already synced: all dives download for the new user. (The original triggering bug.)
2. After logout + same-user re-login + tapping Sync: only new dives download (existing dedup behavior preserved per-user).
3. With pending rows in `upload_queue`, logging out and logging in as a different user does NOT cause those rows to flush as the new user. Logging back in as the original user resumes flushing.
4. Migration runs once per app launch (cheap on subsequent launches via `PRAGMA table_info`).
5. All existing tests pass with `userId` threaded through (8 syncedDives + 7 useSync tests, accounting for the 2 new isolation tests + 1 unauthenticated test).
6. New `queue.test.ts` covers user-isolated enqueue/flush/clear and 1 migration test.
7. Real-device retest: log out, create new user, sync, see N dives downloaded (matching the count of dives on the device).
