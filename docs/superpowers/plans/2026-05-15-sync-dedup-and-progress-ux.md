# Sync Dedup + Progress UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-15
**Status:** Ready for execution.
**Spec:** `docs/superpowers/specs/2026-05-15-sync-dedup-and-progress-ux-design.md`

**Goal:** Add local SQLite fingerprint dedup to `useSync`, replace the misleading "5/?" byte progress display with a "Dive N of M" counter, and revert the two dev-only diagnostic probes from the protocol-debugging detour.

**Architecture:** A new ~30-line `services/syncedDives.ts` module wraps the existing expo-sqlite database for fingerprint storage. The `useSync` hook gains two state fields (`currentDiveIndex`, `totalDives`), filters the manifest against the local fingerprint set before downloading, and marks each fingerprint synced after a successful API POST. The `SyncScreen` swaps its byte-counter line for a dive-count line. The `__DEV__` raw-error branch and the manifest-dl `do/catch` diagnostic both revert to clean code. Native protocol layer is unchanged; the 86-test protocol suite must stay green.

**Tech Stack:** TypeScript, React Native, expo-sqlite, Jest + @testing-library/react-native, i18next.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `apps/mobile/src/services/syncedDives.ts` | **Create** | SQLite-backed get/insert for fingerprint set. |
| `apps/mobile/src/services/__tests__/syncedDives.test.ts` | **Create** | Unit tests for the new module. |
| `apps/mobile/src/hooks/useSync.ts` | **Modify** | Filter manifest by known fingerprints; track dive index/total; mark synced after upload. |
| `apps/mobile/src/__tests__/useSync.test.tsx` | **Create** | Hook tests covering all-known / partial / none-known paths. |
| `apps/mobile/src/screens/SyncScreen.tsx` | **Modify** | Render "Dive N of M" instead of bytes; remove `__DEV__` raw-error branch. |
| `apps/mobile/src/i18n/en.json` | **Modify** | Add `sync.downloadingDive` key. |
| `apps/mobile/src/i18n/fr.json` | **Modify** | Add `sync.downloadingDive` translation. |
| `apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift` | **Modify** | Revert the diagnostic do/catch wrapper around `downloadBlob()`. Keep the pagination NAK handler. |

---

## Task 1: Create the `syncedDives` module with SQLite-backed fingerprint storage

**Files:**
- Create: `apps/mobile/src/services/syncedDives.ts`
- Create: `apps/mobile/src/services/__tests__/syncedDives.test.ts`

**Pattern reference:** `apps/mobile/src/services/queue.ts` — same project, same `expo-sqlite` API, same lazy-init pattern. Match its style.

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/services/__tests__/syncedDives.test.ts`:

```ts
import * as SQLite from 'expo-sqlite';
import {
  getSyncedFingerprints,
  markFingerprintSynced,
  __resetSyncedDivesForTests,
} from '../syncedDives';

// In-memory mock so tests don't hit a real device DB.
jest.mock('expo-sqlite', () => {
  const rows: { fingerprint: string; synced_at: number }[] = [];
  const db = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('INSERT')) {
        const fp = params[0] as string;
        if (!rows.some((r) => r.fingerprint === fp)) {
          rows.push({ fingerprint: fp, synced_at: Date.now() });
        }
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    getAllAsync: jest.fn(async () => rows.slice()),
  };
  return {
    openDatabaseAsync: jest.fn().mockResolvedValue(db),
    __mockReset: () => { rows.length = 0; (db.execAsync as jest.Mock).mockClear(); (db.runAsync as jest.Mock).mockClear(); (db.getAllAsync as jest.Mock).mockClear(); },
  };
});

describe('syncedDives', () => {
  beforeEach(() => {
    (SQLite as unknown as { __mockReset: () => void }).__mockReset();
    __resetSyncedDivesForTests();
  });

  it('returns empty Set on a fresh DB', async () => {
    const result = await getSyncedFingerprints();
    expect(result.size).toBe(0);
  });

  it('returns the fingerprint after markFingerprintSynced', async () => {
    await markFingerprintSynced('abc123');
    const result = await getSyncedFingerprints();
    expect(result.size).toBe(1);
    expect(result.has('abc123')).toBe(true);
  });

  it('handles multiple inserts', async () => {
    await markFingerprintSynced('aa');
    await markFingerprintSynced('bb');
    await markFingerprintSynced('cc');
    const result = await getSyncedFingerprints();
    expect(result.size).toBe(3);
    expect(result.has('aa')).toBe(true);
    expect(result.has('bb')).toBe(true);
    expect(result.has('cc')).toBe(true);
  });

  it('does not throw when marking the same fingerprint twice', async () => {
    await markFingerprintSynced('dup');
    await expect(markFingerprintSynced('dup')).resolves.not.toThrow();
    const result = await getSyncedFingerprints();
    expect(result.size).toBe(1);
  });

  it('initializes the schema only once across multiple calls', async () => {
    const mockDb = await (SQLite.openDatabaseAsync as jest.Mock)();
    await getSyncedFingerprints();
    await getSyncedFingerprints();
    await markFingerprintSynced('x');
    expect((mockDb.execAsync as jest.Mock).mock.calls.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
cd apps/mobile && pnpm test -- --testPathPattern=syncedDives 2>&1 | tail -10
```

Expected: FAIL with "Cannot find module '../syncedDives'" or similar — the module doesn't exist yet.

- [ ] **Step 3: Implement the module**

Create `apps/mobile/src/services/syncedDives.ts`:

```ts
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'divechef_sync.db';

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS synced_fingerprints (
        fingerprint TEXT PRIMARY KEY NOT NULL,
        synced_at   INTEGER NOT NULL
      );
    `);
  }
  return db;
}

/** Returns the set of fingerprint hex strings already uploaded. */
export async function getSyncedFingerprints(): Promise<Set<string>> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ fingerprint: string }>(
    'SELECT fingerprint FROM synced_fingerprints'
  );
  return new Set(rows.map((r) => r.fingerprint));
}

/** Records a fingerprint as successfully uploaded. Idempotent (INSERT OR IGNORE). */
export async function markFingerprintSynced(fingerprint: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'INSERT OR IGNORE INTO synced_fingerprints (fingerprint, synced_at) VALUES (?, ?)',
    [fingerprint, Date.now()]
  );
}

/** Test-only: forces re-init on next call. Not exported in production. */
export function __resetSyncedDivesForTests(): void {
  db = null;
}
```

- [ ] **Step 4: Run the test, confirm it passes**

```bash
cd apps/mobile && pnpm test -- --testPathPattern=syncedDives 2>&1 | tail -10
```

Expected: `Tests: 5 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services/syncedDives.ts \
        apps/mobile/src/services/__tests__/syncedDives.test.ts
git commit -m "feat(sync): add syncedDives SQLite module for fingerprint dedup

New services/syncedDives.ts mirrors the queue.ts pattern with
expo-sqlite. Stores one row per uploaded dive fingerprint;
INSERT OR IGNORE so re-marks are idempotent. Used by useSync to
filter the Peregrine manifest before downloading.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Wire dedup + progress state into `useSync`

**Files:**
- Modify: `apps/mobile/src/hooks/useSync.ts`
- Create: `apps/mobile/src/__tests__/useSync.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/__tests__/useSync.test.tsx`:

```tsx
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSync } from '../hooks/useSync';

// Mock the native module
jest.mock('../native', () => ({
  DiveComputerNative: {
    startScan: jest.fn().mockResolvedValue(undefined),
    stopScan: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockResolvedValue(false),
    listDives: jest.fn(),
    downloadDive: jest.fn(),
  },
}));

// Mock event emitter — fire a discovered event immediately when subscribed during scanning.
let discoveredHandlers: Array<(d: unknown) => void> = [];
let progressHandlers: Array<(p: unknown) => void> = [];
let disconnectedHandlers: Array<(p: unknown) => void> = [];
jest.mock('../native/events', () => ({
  addDiveComputerListener: (event: string, cb: (d: unknown) => void) => {
    if (event === 'diveComputerDiscovered') discoveredHandlers.push(cb);
    if (event === 'diveComputerProgress') progressHandlers.push(cb);
    if (event === 'diveComputerDisconnected') disconnectedHandlers.push(cb);
    return () => {
      if (event === 'diveComputerDiscovered') {
        discoveredHandlers = discoveredHandlers.filter((h) => h !== cb);
      }
      if (event === 'diveComputerProgress') {
        progressHandlers = progressHandlers.filter((h) => h !== cb);
      }
      if (event === 'diveComputerDisconnected') {
        disconnectedHandlers = disconnectedHandlers.filter((h) => h !== cb);
      }
    };
  },
}));

// Mock api
const mockApiPost = jest.fn();
jest.mock('../services/api', () => ({
  api: { post: (...args: unknown[]) => mockApiPost(...args) },
}));

// Mock queue
jest.mock('../services/queue', () => ({
  enqueueUpload: jest.fn().mockResolvedValue(undefined),
}));

// Mock syncedDives — control the fingerprint set per test
const mockGetSyncedFingerprints = jest.fn();
const mockMarkFingerprintSynced = jest.fn();
jest.mock('../services/syncedDives', () => ({
  getSyncedFingerprints: () => mockGetSyncedFingerprints(),
  markFingerprintSynced: (...args: unknown[]) => mockMarkFingerprintSynced(...args),
}));

import { DiveComputerNative } from '../native';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const sampleManifest = [
  { index: 1, address: 0x100, fingerprintHex: 'aaaaaaaa', firmwareVersion: '1.0' },
  { index: 2, address: 0x200, fingerprintHex: 'bbbbbbbb', firmwareVersion: '1.0' },
  { index: 3, address: 0x300, fingerprintHex: 'cccccccc', firmwareVersion: '1.0' },
];

const fireDiscovered = () =>
  discoveredHandlers.forEach((h) =>
    h({ identifier: 'mock-uuid', name: 'Peregrine', rssi: -50 })
  );

beforeEach(() => {
  jest.clearAllMocks();
  discoveredHandlers = [];
  progressHandlers = [];
  disconnectedHandlers = [];
  mockApiPost.mockResolvedValue({ data: {} });
  mockGetSyncedFingerprints.mockResolvedValue(new Set<string>());
  mockMarkFingerprintSynced.mockResolvedValue(undefined);
  (DiveComputerNative.listDives as jest.Mock).mockResolvedValue(sampleManifest);
  (DiveComputerNative.downloadDive as jest.Mock).mockResolvedValue({ rawBytes: 'base64' });
});

describe('useSync', () => {
  it('downloads all dives when local fingerprint set is empty', async () => {
    const { result } = renderHook(() => useSync(), { wrapper });
    await act(async () => {
      result.current.startSync();
      // Let scan promise register, then fire discovery
      await new Promise((r) => setTimeout(r, 0));
      fireDiscovered();
    });
    await waitFor(() => expect(result.current.state).toBe('complete'));
    expect((DiveComputerNative.downloadDive as jest.Mock).mock.calls.length).toBe(3);
    expect(result.current.syncedCount).toBe(3);
    expect(mockMarkFingerprintSynced).toHaveBeenCalledTimes(3);
    expect(mockMarkFingerprintSynced).toHaveBeenCalledWith('aaaaaaaa');
    expect(mockMarkFingerprintSynced).toHaveBeenCalledWith('bbbbbbbb');
    expect(mockMarkFingerprintSynced).toHaveBeenCalledWith('cccccccc');
  });

  it('skips already-synced dives', async () => {
    mockGetSyncedFingerprints.mockResolvedValue(new Set(['aaaaaaaa', 'cccccccc']));
    const { result } = renderHook(() => useSync(), { wrapper });
    await act(async () => {
      result.current.startSync();
      await new Promise((r) => setTimeout(r, 0));
      fireDiscovered();
    });
    await waitFor(() => expect(result.current.state).toBe('complete'));
    expect((DiveComputerNative.downloadDive as jest.Mock).mock.calls.length).toBe(1);
    expect((DiveComputerNative.downloadDive as jest.Mock).mock.calls[0][0]).toBe(2); // index of 'bbbbbbbb'
    expect(result.current.syncedCount).toBe(1);
    expect(mockMarkFingerprintSynced).toHaveBeenCalledTimes(1);
    expect(mockMarkFingerprintSynced).toHaveBeenCalledWith('bbbbbbbb');
  });

  it('goes straight to complete with 0 synced when all dives are already known', async () => {
    mockGetSyncedFingerprints.mockResolvedValue(
      new Set(['aaaaaaaa', 'bbbbbbbb', 'cccccccc'])
    );
    const { result } = renderHook(() => useSync(), { wrapper });
    await act(async () => {
      result.current.startSync();
      await new Promise((r) => setTimeout(r, 0));
      fireDiscovered();
    });
    await waitFor(() => expect(result.current.state).toBe('complete'));
    expect((DiveComputerNative.downloadDive as jest.Mock).mock.calls.length).toBe(0);
    expect(result.current.syncedCount).toBe(0);
    expect(mockMarkFingerprintSynced).not.toHaveBeenCalled();
  });

  it('does NOT mark fingerprint synced when upload is queued (api fails)', async () => {
    mockApiPost.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useSync(), { wrapper });
    await act(async () => {
      result.current.startSync();
      await new Promise((r) => setTimeout(r, 0));
      fireDiscovered();
    });
    await waitFor(() => expect(result.current.state).toBe('complete'));
    expect((DiveComputerNative.downloadDive as jest.Mock).mock.calls.length).toBe(3);
    // syncedCount counts API successes only
    expect(result.current.syncedCount).toBe(0);
    expect(mockMarkFingerprintSynced).not.toHaveBeenCalled();
  });

  it('exposes currentDiveIndex and totalDives during download', async () => {
    let resolveDownload: (v: { rawBytes: string }) => void = () => undefined;
    (DiveComputerNative.downloadDive as jest.Mock).mockImplementationOnce(() =>
      new Promise<{ rawBytes: string }>((r) => { resolveDownload = r; })
    );
    const { result } = renderHook(() => useSync(), { wrapper });
    await act(async () => {
      result.current.startSync();
      await new Promise((r) => setTimeout(r, 0));
      fireDiscovered();
    });
    // Wait for the hook to reach the downloading state with the first dive in flight.
    await waitFor(() => expect(result.current.state).toBe('downloading'));
    expect(result.current.totalDives).toBe(3);
    expect(result.current.currentDiveIndex).toBe(1);

    // Let the first download complete, allow the rest to flow.
    await act(async () => {
      resolveDownload({ rawBytes: 'base64' });
    });
    await waitFor(() => expect(result.current.state).toBe('complete'));
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
cd apps/mobile && pnpm test -- --testPathPattern=useSync 2>&1 | tail -20
```

Expected: tests fail because `useSync` doesn't yet expose `currentDiveIndex` / `totalDives` and doesn't filter by `getSyncedFingerprints` or call `markFingerprintSynced`.

- [ ] **Step 3: Modify `useSync.ts`**

Read `apps/mobile/src/hooks/useSync.ts` first (it currently exists at the path with the structure shown in the spec). Apply these changes:

**3a. Add the import at the top of the file (after the existing imports around line 1-7):**

```ts
import { getSyncedFingerprints, markFingerprintSynced } from '../services/syncedDives';
```

**3b. Add two new state fields inside the hook (right after the existing `syncedCount` state, around line 26):**

```ts
const [currentDiveIndex, setCurrentDiveIndex] = useState(0);
const [totalDives, setTotalDives] = useState(0);
```

**3c. Reset the new state at the top of `startSync` (right after the existing `setDiscoveredDevices([]);` near line 69):**

```ts
setCurrentDiveIndex(0);
setTotalDives(0);
```

**3d. Replace the manifest-loop block. Locate this current block (around lines 101-130):**

```ts
setState('listing');
const manifest = await DiveComputerNative.listDives();

setState('downloading');
let synced = 0;

for (const entry of manifest) {
  if (abortRef.current) break;

  const { rawBytes } = await DiveComputerNative.downloadDive(entry.index);

  setState('uploading');
  const payload = {
    rawBase64: rawBytes,
    fingerprintHex: entry.fingerprintHex,
    address: entry.address,
  };

  try {
    await api.post('/api/dives', payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    synced++;
    setSyncedCount(synced);
  } catch {
    await enqueueUpload(payload);
  }

  setState('downloading');
}

await DiveComputerNative.disconnect();
setState('complete');
```

**Replace with:**

```ts
setState('listing');
const manifest = await DiveComputerNative.listDives();
const known = await getSyncedFingerprints();
const newDives = manifest.filter((e) => !known.has(e.fingerprintHex));

if (newDives.length === 0) {
  await DiveComputerNative.disconnect();
  setState('complete');
  // still trigger the reprocess + invalidations below (unchanged tail)
} else {
  setTotalDives(newDives.length);
  setState('downloading');
  let synced = 0;

  for (let i = 0; i < newDives.length; i++) {
    if (abortRef.current) break;
    const entry = newDives[i];
    setCurrentDiveIndex(i + 1);

    const { rawBytes } = await DiveComputerNative.downloadDive(entry.index);

    setState('uploading');
    const payload = {
      rawBase64: rawBytes,
      fingerprintHex: entry.fingerprintHex,
      address: entry.address,
    };

    try {
      await api.post('/api/dives', payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      await markFingerprintSynced(entry.fingerprintHex);
      synced++;
      setSyncedCount(synced);
    } catch {
      await enqueueUpload(payload);
    }

    setState('downloading');
  }

  await DiveComputerNative.disconnect();
  setState('complete');
}
```

**3e. Add the new fields to the returned object at the bottom of the hook (around line 160). Change:**

```ts
return { state, progress, discoveredDevices, error, syncedCount, startSync, cancel };
```

**To:**

```ts
return {
  state,
  progress,
  discoveredDevices,
  error,
  syncedCount,
  currentDiveIndex,
  totalDives,
  startSync,
  cancel,
};
```

- [ ] **Step 4: Run the tests, confirm all pass**

```bash
cd apps/mobile && pnpm test -- --testPathPattern=useSync 2>&1 | tail -15
```

Expected: 5 tests passed.

Also verify the syncedDives suite still passes:

```bash
cd apps/mobile && pnpm test -- --testPathPattern='syncedDives|useSync' 2>&1 | tail -10
```

Expected: 10 tests passed.

- [ ] **Step 5: Verify TypeScript still compiles**

```bash
cd apps/mobile && pnpm typecheck 2>&1 | tail -3
```

Expected: no output (success).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/hooks/useSync.ts \
        apps/mobile/src/__tests__/useSync.test.tsx
git commit -m "feat(sync): filter manifest by synced fingerprints + track dive index

useSync now consults services/syncedDives before iterating the
Peregrine manifest, skipping dives already uploaded. After each
successful POST to /api/dives, the fingerprint is marked synced so
subsequent runs skip it. When the filtered set is empty, the hook
transitions straight to 'complete' with syncedCount=0.

Adds currentDiveIndex and totalDives to the returned state for
the UI to render 'Dive N of M' progress.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Update `SyncScreen` + i18n for "Dive N of M" progress

**Files:**
- Modify: `apps/mobile/src/screens/SyncScreen.tsx`
- Modify: `apps/mobile/src/i18n/en.json`
- Modify: `apps/mobile/src/i18n/fr.json`

- [ ] **Step 1: Add the new i18n key in en.json**

Open `apps/mobile/src/i18n/en.json`. Locate the `"sync"` block (starts around line 33). Add the new key right after the existing `downloading` line:

```json
    "downloading": "Downloading dives ({{received}}/{{expected}})...",
    "downloadingDive": "Dive {{current}} of {{total}}...",
```

- [ ] **Step 2: Add the new i18n key in fr.json**

Open `apps/mobile/src/i18n/fr.json`. Same position:

```json
    "downloading": "Telechargement des plongees ({{received}}/{{expected}})...",
    "downloadingDive": "Plongee {{current}} sur {{total}}...",
```

- [ ] **Step 3: Update `SyncScreen.tsx` to consume the new state and key**

Open `apps/mobile/src/screens/SyncScreen.tsx`. Three changes:

**3a. Update the `useSync()` destructuring (around line 9):**

Current:

```tsx
const { state, progress, error, syncedCount, startSync, cancel } = useSync();
```

Change to:

```tsx
const { state, progress, error, syncedCount, currentDiveIndex, totalDives, startSync, cancel } = useSync();
```

**3b. Replace the `downloading`/`uploading` rendering block. Locate this current code (around lines 52-74):**

```tsx
case 'downloading':
case 'uploading':
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#0066cc" />
      <Text style={styles.statusText}>
        {t('sync.downloading', {
          received: progress ? Math.round(progress.bytesReceived / 1024) : 0,
          expected: progress?.bytesExpected
            ? Math.round(progress.bytesExpected / 1024)
            : '?',
        })}
      </Text>
      {syncedCount > 0 && (
        <Text style={styles.countText}>
          {t('sync.complete', { count: syncedCount })}
        </Text>
      )}
      <TouchableOpacity style={styles.cancelButton} onPress={cancel}>
        <Text style={styles.cancelText}>{t('common.cancel')}</Text>
      </TouchableOpacity>
    </View>
  );
```

**Replace with:**

```tsx
case 'downloading':
case 'uploading':
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#0066cc" />
      <Text style={styles.statusText}>
        {t('sync.downloadingDive', {
          current: currentDiveIndex,
          total: totalDives,
        })}
      </Text>
      {syncedCount > 0 && (
        <Text style={styles.countText}>
          {t('sync.complete', { count: syncedCount })}
        </Text>
      )}
      <TouchableOpacity style={styles.cancelButton} onPress={cancel}>
        <Text style={styles.cancelText}>{t('common.cancel')}</Text>
      </TouchableOpacity>
    </View>
  );
```

**3c. Revert the `__DEV__` raw-error branch added in `a9aca6e`. Locate the error block (around lines 92-106):**

```tsx
case 'error':
  return (
    <View style={styles.centered}>
      <Text style={styles.errorIcon}>!</Text>
      <Text style={styles.errorText}>
        {error === 'no_device' || error === 'no_device_found'
          ? t('sync.noDevice')
          : error === 'connection_rejected'
          ? t('sync.connectionRejected')
          : error === 'device_busy'
          ? t('sync.deviceBusy')
          : error === 'ble_connection_lost'
          ? t('sync.connectionLost')
          : __DEV__
          ? error || t('common.error')
          : t('common.error')}
      </Text>
```

**Replace with:**

```tsx
case 'error':
  return (
    <View style={styles.centered}>
      <Text style={styles.errorIcon}>!</Text>
      <Text style={styles.errorText}>
        {error === 'no_device' || error === 'no_device_found'
          ? t('sync.noDevice')
          : error === 'connection_rejected'
          ? t('sync.connectionRejected')
          : error === 'device_busy'
          ? t('sync.deviceBusy')
          : error === 'ble_connection_lost'
          ? t('sync.connectionLost')
          : t('common.error')}
      </Text>
```

- [ ] **Step 4: Verify TypeScript compiles + tests still pass**

```bash
cd apps/mobile && pnpm typecheck 2>&1 | tail -3
```

Expected: no output (success).

```bash
cd apps/mobile && pnpm test 2>&1 | tail -10
```

Expected: all tests pass (auth, syncedDives, useSync). No new test was added for SyncScreen — the i18n key change is verified by typecheck (the t() string lookup works), and the dive-count progress is verified by the useSync test.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/SyncScreen.tsx \
        apps/mobile/src/i18n/en.json \
        apps/mobile/src/i18n/fr.json
git commit -m "feat(sync): show 'Dive N of M' progress, drop misleading byte counter

Replaces the 'Downloading dives ({{received}}/{{expected}})...' line
that always rendered as 'X/?' (because LRE-compressed dive size is
unknown until end-of-stream) with a clear 'Dive N of M' counter
sourced from useSync's currentDiveIndex / totalDives.

Also reverts the __DEV__ raw-error branch from a9aca6e — the
on-screen protocol-error trick was a debugging aid only; with sync
working we don't need it, and the existing Sentry/console pipeline
captures the raw string.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Revert the iOS manifest-dl diagnostic + final verification

**Files:**
- Modify: `apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift`

- [ ] **Step 1: Read the current state of `listDives()` around lines 217-247**

Locate the manifest pagination block. It currently has the diagnostic do/catch from `af82fce` PLUS the page-NAK end-of-manifest catch from `1f58a7c` (interleaved). Both are in the same do/catch.

- [ ] **Step 2: Simplify the pagination block**

Find this code (around lines 218-237):

```swift
for pageIndex in 0..<maxPages {
    let manifestBlob: Data
    do {
        manifestBlob = try await downloadBlob(
            address: manifestAddr,
            size: Peregrine.MANIFEST_SIZE,
            compression: false
        )
    } catch {
        // The Peregrine fully populates a 48-record page even if real
        // dive count > 48, but rejects subsequent pages at +0x600 with
        // 'requestOutOfRange'. Treat any error past page 1 as
        // end-of-manifest (matches libdc's behavior). On page 1, an
        // error is a real failure — re-throw with diagnostic context.
        if pageIndex > 0 {
            dlog("listDives: end-of-manifest detected at page \(pageIndex) (\(error))")
            break
        }
        let logHex = logupload.map { String(format: "%02x", $0) }.joined(separator: " ")
        throw PeregrineProtocolError.unexpectedResponse(
            "manifest dl failed at 0x\(String(format: "%08x", manifestAddr)) " +
            "(base 0x\(String(format: "%08x", baseAddr)), " +
            "logupload \(logupload.count)B: \(logHex)) — \(error)"
        )
    }
    let pageRecords = Manifest.parse(manifestBlob)
    allRecords.append(contentsOf: pageRecords)
```

Replace with the cleaner version (keep the `pageIndex > 0` end-of-manifest catch; drop the page-1 diagnostic injection):

```swift
for pageIndex in 0..<maxPages {
    let manifestBlob: Data
    do {
        manifestBlob = try await downloadBlob(
            address: manifestAddr,
            size: Peregrine.MANIFEST_SIZE,
            compression: false
        )
    } catch {
        // The Peregrine fully populates a 48-record page even if real
        // dive count > 48, but rejects subsequent pages at +0x600 with
        // 'requestOutOfRange'. Treat any error past page 1 as
        // end-of-manifest (matches libdc's behavior). On page 1, an
        // error is a real failure — propagate it.
        if pageIndex > 0 {
            dlog("listDives: end-of-manifest detected at page \(pageIndex) (\(error))")
            break
        }
        throw error
    }
    let pageRecords = Manifest.parse(manifestBlob)
    allRecords.append(contentsOf: pageRecords)
```

- [ ] **Step 3: Run the iOS test suite, confirm 86/86 still pass**

```bash
xcodebuild test \
  -workspace /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile/ios/DiveChef.xcworkspace \
  -scheme DiveChef \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:DiveChefTests 2>&1 | grep -E "Executed|TEST " | tail -3
```

Expected: `Executed 86 tests, with 0 failures` and `** TEST SUCCEEDED **`.

- [ ] **Step 4: Run the Android test suite, confirm 86/86 still pass**

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile/android && \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
./gradlew :app:testDebugUnitTest 2>&1 | tail -5
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift
git commit -m "chore(ble): drop diagnostic logupload-bytes injection from manifest dl

The do/catch added in af82fce was a probe to surface the Peregrine's
logupload bytes on screen during real-device debugging. With the real
fix landed (1f58a7c, manifest pagination NAK as end-of-manifest), the
diagnostic is no longer needed.

The pageIndex > 0 end-of-manifest catch stays; only the page-1 error
re-wrapping is reverted.

86/86 iOS XCTest + Android JUnit suites still green.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**

- Spec §"Component 1: services/syncedDives.ts" → Task 1.
- Spec §"Component 2: hooks/useSync.ts" → Task 2.
- Spec §"Component 3: SyncScreen.tsx" + §"Component 4: i18n" → Task 3.
- Spec §"Component 5: Native diagnostic revert" → Task 4.
- Spec §"Test Coverage": syncedDives unit tests in Task 1 step 1; useSync hook tests in Task 2 step 1.
- Spec §"Acceptance Criteria":
  1. (re-sync skips known dives) → useSync test "skips already-synced dives" + "goes straight to complete with 0 synced".
  2. (delete + add → only 1 download) → covered by the same filter logic; not unit-tested separately because it's the same code path; will be exercised in real-device verification.
  3. (no more "5/?") → Task 3 changes the render; useSync test "exposes currentDiveIndex and totalDives during download".
  4. (86-test native suite stays green) → Task 4 step 3 + step 4.
  5. (Jest tests pass) → Task 1 step 4 + Task 2 step 4.
  6. (revert dev-only diagnostics) → Task 3 step 3c + Task 4.

All criteria covered.

**2. Placeholder scan:**

No "TBD"s, no "implement later", no "similar to Task N" without code, no "add appropriate error handling". Each step shows actual code or exact commands.

**3. Type consistency:**

- `getSyncedFingerprints(): Promise<Set<string>>` — used in Task 1 (definition), Task 2 (consumer). Matches.
- `markFingerprintSynced(fingerprint: string): Promise<void>` — used in Task 1 (definition), Task 2 (consumer). Matches.
- `currentDiveIndex` / `totalDives` — declared in Task 2 step 3b, returned in Task 2 step 3e, consumed in Task 3 step 3a + 3b. Matches.
- `sync.downloadingDive` i18n key — defined in Task 3 steps 1+2, consumed in Task 3 step 3b. Matches.

---

## Execution Notes

- Tasks 1, 2, 3, 4 must run in that order — Task 2 imports from the module created in Task 1; Task 3 consumes state added in Task 2.
- After all 4 tasks land, the user should re-run a real-device sync once: the first run will download all 7 dives again (since the local DB starts empty), but the second run should report `0 dive(s) synced` if the device has no new dives. That's the live-fire acceptance test.
- The protocol layer is untouched in this plan; the 86-test native suite is run only as a regression guard at the end of Task 4.
