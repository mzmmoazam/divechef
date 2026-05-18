import * as SQLite from 'expo-sqlite';
import {
  getSyncedFingerprints,
  markFingerprintSynced,
  __resetSyncedDivesForTests,
} from '../syncedDives';

// In-memory mock so tests don't hit a real device DB.
jest.mock('expo-sqlite', () => {
  let rows: {
    fingerprint: string;
    synced_at: number;
    user_id?: string | null;
    device_serial?: string | null;
  }[] = [];
  // Track which columns the table currently "has" so we can simulate
  // ALTER TABLE / PRAGMA table_info.
  let columns = new Set<string>(['fingerprint', 'synced_at']);

  const db = {
    execAsync: jest.fn(async (sql: string) => {
      // Honor the migration SQL the production module emits:
      //   - DROP TABLE synced_fingerprints      (pre-migration rebuild path)
      //   - CREATE TABLE [IF NOT EXISTS] synced_fingerprints (...)
      //   - DELETE FROM ... WHERE device_serial IS NULL  (defensive on already-migrated)
      const cleaned = sql.replace(/\s+/g, ' ').trim();
      if (/DROP TABLE synced_fingerprints/i.test(cleaned)) {
        rows = [];
        columns = new Set();
        return undefined;
      }
      // Anchor the regex on `(` so it doesn't match `synced_fingerprints_new`.
      if (/CREATE TABLE (IF NOT EXISTS )?synced_fingerprints\s*\(/i.test(cleaned)) {
        // Production CREATE always uses the new composite-PK schema.
        columns = new Set(['user_id', 'device_serial', 'fingerprint', 'synced_at']);
        return undefined;
      }
      if (/DELETE FROM synced_fingerprints WHERE device_serial IS NULL/i.test(cleaned)) {
        rows = rows.filter((r) => r.device_serial != null);
        return undefined;
      }
      return undefined;
    }),
    runAsync: jest.fn(async (sql: string, params: unknown[]) => {
      const cleaned = sql.replace(/\s+/g, ' ').trim();
      if (/INSERT OR IGNORE INTO synced_fingerprints/i.test(cleaned)) {
        const userId = params[0] as string;
        const deviceSerial = params[1] as string;
        const fp = params[2] as string;
        const at = params[3] as number;
        if (
          !rows.some(
            (r) =>
              r.user_id === userId &&
              r.device_serial === deviceSerial &&
              r.fingerprint === fp
          )
        ) {
          rows.push({
            user_id: userId,
            device_serial: deviceSerial,
            fingerprint: fp,
            synced_at: at,
          });
        }
        return { changes: 1, lastInsertRowId: 0 };
      }
      if (/DELETE FROM synced_fingerprints WHERE device_serial IS NULL/i.test(cleaned)) {
        rows = rows.filter((r) => r.device_serial != null);
        return { changes: 0, lastInsertRowId: 0 };
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    getAllAsync: jest.fn(async (sql: string, params: unknown[] = []) => {
      const cleaned = sql.replace(/\s+/g, ' ').trim();
      if (/PRAGMA table_info\(synced_fingerprints\)/i.test(cleaned)) {
        return Array.from(columns).map((name) => ({ name }));
      }
      if (
        /SELECT fingerprint FROM synced_fingerprints WHERE user_id = \? AND device_serial = \?/i.test(
          cleaned
        )
      ) {
        const userId = params[0] as string;
        const deviceSerial = params[1] as string;
        return rows
          .filter((r) => r.user_id === userId && r.device_serial === deviceSerial)
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
      // Simulates a row inserted before the device_serial migration
      // (no device_serial). Used to verify the migration drops it.
      rows.push({
        fingerprint: fp,
        synced_at: Date.now(),
        user_id: 'user-1',
        device_serial: null,
      });
    },
  };
});

const U1 = 'user-1';
const D1 = 'serial-A';
const D2 = 'serial-B';

describe('syncedDives', () => {
  beforeEach(() => {
    (SQLite as unknown as { __mockReset: () => void }).__mockReset();
    __resetSyncedDivesForTests();
  });

  it('returns empty Set on a fresh DB', async () => {
    const result = await getSyncedFingerprints(U1, D1);
    expect(result.size).toBe(0);
  });

  it('returns the fingerprint after markFingerprintSynced', async () => {
    await markFingerprintSynced(U1, D1, 'abc123');
    const result = await getSyncedFingerprints(U1, D1);
    expect(result.has('abc123')).toBe(true);
  });

  it('handles multiple inserts', async () => {
    await markFingerprintSynced(U1, D1, 'aa');
    await markFingerprintSynced(U1, D1, 'bb');
    await markFingerprintSynced(U1, D1, 'cc');
    const result = await getSyncedFingerprints(U1, D1);
    expect(result.size).toBe(3);
  });

  it('does not throw when marking the same fingerprint twice', async () => {
    await markFingerprintSynced(U1, D1, 'dup');
    await expect(markFingerprintSynced(U1, D1, 'dup')).resolves.not.toThrow();
    expect((await getSyncedFingerprints(U1, D1)).size).toBe(1);
  });

  it('uses INSERT OR IGNORE for race-safe idempotency', async () => {
    const mockDb = await (SQLite.openDatabaseAsync as jest.Mock)();
    await markFingerprintSynced(U1, D1, 'check');
    const insertCall = (mockDb.runAsync as jest.Mock).mock.calls.find((c) =>
      /INSERT/.test(c[0])
    );
    expect(insertCall![0]).toMatch(/INSERT OR IGNORE/);
  });

  it('opens the database only once across multiple calls', async () => {
    await getSyncedFingerprints(U1, D1);
    await getSyncedFingerprints(U1, D1);
    await markFingerprintSynced(U1, D1, 'x');
    expect((SQLite.openDatabaseAsync as jest.Mock).mock.calls.length).toBe(1);
  });

  it('different users see different sets', async () => {
    await markFingerprintSynced('alice', D1, 'fp-a');
    await markFingerprintSynced('bob', D1, 'fp-b');
    const aliceSet = await getSyncedFingerprints('alice', D1);
    const bobSet = await getSyncedFingerprints('bob', D1);
    expect(aliceSet.has('fp-a')).toBe(true);
    expect(aliceSet.has('fp-b')).toBe(false);
    expect(bobSet.has('fp-b')).toBe(true);
    expect(bobSet.has('fp-a')).toBe(false);
  });

  it('marking for one user does not affect another', async () => {
    await markFingerprintSynced('alice', D1, 'shared');
    expect((await getSyncedFingerprints('bob', D1)).size).toBe(0);
  });

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
    (SQLite as unknown as { __seedLegacyRow: (fp: string) => void }).__seedLegacyRow(
      'legacy-fp'
    );
    expect((await getSyncedFingerprints(U1, D1)).has('legacy-fp')).toBe(false);
  });
});
