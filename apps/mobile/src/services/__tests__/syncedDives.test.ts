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
