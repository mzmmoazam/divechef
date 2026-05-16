import * as SQLite from 'expo-sqlite';
import {
  getSyncedFingerprints,
  markFingerprintSynced,
  __resetSyncedDivesForTests,
} from '../syncedDives';

// In-memory mock so tests don't hit a real device DB.
jest.mock('expo-sqlite', () => {
  let rows: { fingerprint: string; synced_at: number; user_id?: string | null }[] = [];
  // Track which columns the table currently "has" so we can simulate
  // ALTER TABLE / PRAGMA table_info.
  let columns = new Set<string>(['fingerprint', 'synced_at']);

  const db = {
    execAsync: jest.fn(async (sql: string) => {
      // Honor migration SQL: ADD COLUMN, DELETE, recreate-and-rename, CREATE TABLE
      const cleaned = sql.replace(/\s+/g, ' ').trim();
      if (/DROP TABLE synced_fingerprints/i.test(cleaned)) {
        rows = [];
        columns = new Set();
        return undefined;
      }
      if (/CREATE TABLE (IF NOT EXISTS )?synced_fingerprints/i.test(cleaned)) {
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
