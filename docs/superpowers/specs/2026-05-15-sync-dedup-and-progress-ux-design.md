# Sync Dedup + Progress UX Design

**Date:** 2026-05-15
**Status:** Design approved, ready for implementation plan.
**Context:** Real-device Peregrine sync now works end-to-end (commit `1f58a7c`). Two rough edges remain plus one cleanup item from the debugging detour.

---

## Goal

Make `useSync` skip dives that have already been uploaded, and replace the misleading "5/?" byte progress display with a clear "Dive 3 of 7" counter. Also remove the dev-only diagnostic code added during debugging now that the protocol works.

---

## Why

**Dedup:** Today, every sync re-downloads every dive on the manifest. For a Peregrine that holds dozens of historical dives, that's wasteful (battery, BLE bandwidth, time, backend write load) and the 4-byte fingerprint already in the manifest record gives us everything needed to skip duplicates cheaply.

**Progress UX:** The current `"Downloading dives (5/?)..."` string interpolates `bytesReceived / 1024` and `bytesExpected || '?'`. Because dives are LRE-compressed, we don't know `bytesExpected` until the end-of-stream marker fires, so it's always `?`. Users read the `5` as a dive count — wrong; it's KB of the *current* dive. The hook already tracks how many dives have uploaded successfully (the "1 dive(s) synced" line below the spinner) — what's missing is a clear "we're on dive N of M" indicator.

**Cleanup:** Two probes added during the protocol debugging detour are no longer needed:
- `af82fce` — wrapped `downloadBlob()` in a `do/catch` that injected the logupload bytes into the rethrown error message. Useful only while we didn't know the device's logupload format.
- `a9aca6e` — `__DEV__`-gated raw error display in `SyncScreen.tsx`. Useful while we needed to surface protocol errors on screen.

Both can revert; the real fix is in `1f58a7c` (pagination NAK as end-of-manifest).

---

## Architecture

Three independent components. Each is a small, focused change in one part of the stack — no cross-cutting refactors.

```
┌─────────────────┐
│   SyncScreen    │ ← shows "Dive {current} of {total}"
└────────┬────────┘
         │
┌────────▼────────┐
│    useSync      │ ← filters manifest by known fingerprints
│   (hook state)  │ ← tracks currentDiveIndex / totalDives
└────────┬────────┘
         │ uses
┌────────▼────────┐
│  syncedDives    │ ← new module: SQLite get/insert
│ (services/...)  │
└────────┬────────┘
         │ uses
┌────────▼────────┐
│  expo-sqlite    │ ← existing dependency, existing DB file
└─────────────────┘
```

The native protocol layer is unchanged. The sync hook gains two pieces of state and one filter. The screen gains a simpler render. A new ~30-line service module wraps the SQLite read/write.

---

## Components

### 1. `services/syncedDives.ts` (new)

A thin wrapper around the existing expo-sqlite database for the dedup set.

**API:**

```ts
/** Returns the set of fingerprint hex strings already uploaded. */
export async function getSyncedFingerprints(): Promise<Set<string>>;

/** Records a fingerprint as successfully uploaded. Idempotent (INSERT OR IGNORE). */
export async function markFingerprintSynced(fingerprint: string): Promise<void>;
```

**Schema migration:**

```sql
CREATE TABLE IF NOT EXISTS synced_fingerprints (
  fingerprint TEXT PRIMARY KEY NOT NULL,
  synced_at   INTEGER NOT NULL
);
```

The migration runs once at module load (idempotent). The table is small (one row per dive, ~30 bytes); even users with 1000 historical dives top out under 30 KB. No indexing beyond the primary key.

**Failure modes:** SQLite errors propagate to the caller. The hook treats a query failure as "no known fingerprints" (defensive — re-syncing all dives once is preferable to crashing the sync flow).

### 2. `hooks/useSync.ts` (modify)

Two new pieces of state:

```ts
const [currentDiveIndex, setCurrentDiveIndex] = useState(0);
const [totalDives, setTotalDives] = useState(0);
```

After `listDives()` returns, before the for-loop:

```ts
const manifest = await DiveComputerNative.listDives();
const known = await getSyncedFingerprints();
const newDives = manifest.filter(e => !known.has(e.fingerprintHex));

if (newDives.length === 0) {
  await DiveComputerNative.disconnect();
  setState('complete');
  return;
}

setTotalDives(newDives.length);
setState('downloading');

for (let i = 0; i < newDives.length; i++) {
  const entry = newDives[i];
  setCurrentDiveIndex(i + 1);
  // ... existing download + upload logic ...
  // after successful POST:
  await markFingerprintSynced(entry.fingerprintHex);
}
```

The existing `progress` and `syncedCount` state stays. The hook's return contract gains `currentDiveIndex` and `totalDives`.

### 3. `screens/SyncScreen.tsx` (modify)

Replace the byte-counter block with the dive-count line. From:

```tsx
<Text style={styles.statusText}>
  {t('sync.downloading', {
    received: progress ? Math.round(progress.bytesReceived / 1024) : 0,
    expected: progress?.bytesExpected ? Math.round(progress.bytesExpected / 1024) : '?',
  })}
</Text>
```

To:

```tsx
<Text style={styles.statusText}>
  {t('sync.downloadingDive', { current: currentDiveIndex, total: totalDives })}
</Text>
```

The "N dive(s) synced" line below stays unchanged. Also remove the `__DEV__` raw-error branch in the error block (revert of `a9aca6e`).

### 4. i18n (modify)

Add a new key `sync.downloadingDive` to every language file under `apps/mobile/src/i18n/locales/`:

- `en.json`: `"Dive {{current}} of {{total}}..."`
- All other locales: matching translation following the same template structure.

Leave the old `sync.downloading` key in place for now (might be referenced elsewhere; remove only after verifying it isn't).

### 5. Native diagnostic revert

Revert the `do/catch` block introduced in `af82fce` inside `PeregrineBLEManager.swift listDives()`. Restore the simple call:

```swift
let manifestBlob = try await downloadBlob(
    address: manifestAddr,
    size: Peregrine.MANIFEST_SIZE,
    compression: false
)
```

Keep the `pageIndex > 0` NAK-as-end-of-manifest catch from `1f58a7c` — that's the real fix.

---

## Test Coverage

### Unit tests (Jest, mobile package)

**`services/syncedDives.test.ts` (new):**

- `getSyncedFingerprints()` returns empty Set on a fresh DB.
- `markFingerprintSynced('abc')` followed by `getSyncedFingerprints()` returns `Set(['abc'])`.
- Calling `markFingerprintSynced('abc')` twice does not throw (INSERT OR IGNORE).
- Multiple inserts come back in `getSyncedFingerprints()`.

**`hooks/useSync.test.ts` (extend existing or new):**

- When all manifest fingerprints are in the local set, the hook transitions `idle → scanning → connecting → listing → complete` and never enters `downloading`. `syncedCount === 0`.
- When partial overlap, only the unseen dives are downloaded and uploaded. The seen ones don't trigger `downloadDive` calls.
- After a successful upload, `markFingerprintSynced` is called with the matching fingerprint.
- After a failed upload (queued), `markFingerprintSynced` is *not* called (so a future sync retries — the upload queue is the durability mechanism, but the dedup set should reflect what's authoritatively on the server).

The hook tests will mock the native module and the API. The DB module test uses the real expo-sqlite (in-memory mode if available, file mode otherwise — match what existing tests in this package do).

### What's NOT tested

- The visual rendering of `"Dive 3 of 7"` — covered by snapshot/screen tests if the existing `SyncScreen` has them; otherwise visually verified during the next real-device sync.
- The native diagnostic revert — already covered by the existing 86-test protocol suite (which still passes).

---

## Out of Scope

- Server-side fingerprint refresh (would need a new API endpoint). If a user reinstalls and loses the local cache, the next sync re-downloads everything once. That's acceptable.
- Per-dive ETA / download time prediction.
- Refactoring the `SyncScreen` state-machine rendering (`switch (state)`) for cleaner per-state copy. Non-blocking.
- Removing the now-unused `bytesExpected` field from native progress events. The native code stays untouched in this design — the field just stops being rendered.

---

## Risks & Mitigations

- **Local DB drift from server.** If the backend deletes a dive but the local fingerprint stays, the user can never re-sync that dive without reinstalling. *Mitigation:* the upload-queue path doesn't mark a fingerprint synced until the server confirms; explicit "reset sync" UI is a future enhancement (out of scope here).
- **Dedup hides a regression.** If the server starts rejecting valid dives but the local cache says they're synced, the user sees nothing. *Mitigation:* the hook only marks synced after a 2xx from the API; failures route to the offline upload queue, which retains the dive payload for retry.
- **Empty filter when device just powered on.** If the user only has dives on the Peregrine that they have *also* already synced (matching the local fingerprint set), the sync immediately reports `complete` with 0 synced. The completion screen reads `"0 dive(s) synced"` — informative but minimal. Acceptable for v1; a friendlier "All up to date" copy is a future polish.

---

## Acceptance Criteria

1. After a successful sync of N dives, immediately tapping Sync again with the device still in BLE pairing mode results in: scan + connect + listDives + zero `downloadDive` calls + `complete` state with `syncedCount === 0`.
2. After deleting one dive on the Peregrine and adding a new one, the next sync downloads exactly one dive (the new one).
3. The download spinner shows `"Dive 1 of 1..."`, then `"Dive 2 of 7..."`, etc., and never shows `"5/?"`.
4. The 86-test native protocol suite stays green.
5. Jest unit tests for `syncedDives` and the relevant `useSync` paths pass.
6. The diagnostic do/catch in `PeregrineBLEManager.swift` and the `__DEV__` branch in `SyncScreen.tsx` are removed.
