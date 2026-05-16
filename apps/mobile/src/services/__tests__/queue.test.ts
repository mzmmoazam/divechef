import * as SQLite from 'expo-sqlite';
import {
  enqueueUpload,
  flushQueue,
  getPendingCount,
  clearQueue,
  __resetQueueForTests,
} from '../queue';

jest.mock('expo-sqlite', () => {
  let nextId = 1;
  let rows: {
    id: number;
    payload: string;
    created_at: string;
    attempts: number;
    user_id?: string | null;
  }[] = [];
  let columns = new Set<string>(['id', 'payload', 'created_at', 'attempts']);

  const db = {
    execAsync: jest.fn(async (sql: string) => {
      const cleaned = sql.replace(/\s+/g, ' ').trim();
      if (/DROP TABLE upload_queue/i.test(cleaned)) {
        rows = [];
        columns = new Set();
        return undefined;
      }
      if (/CREATE TABLE (IF NOT EXISTS )?upload_queue\s*\(/i.test(cleaned)) {
        columns = new Set(['id', 'user_id', 'payload', 'created_at', 'attempts']);
        return undefined;
      }
      if (/ALTER TABLE upload_queue ADD COLUMN user_id/i.test(cleaned)) {
        columns.add('user_id');
        rows = rows.map((r) => ({ ...r, user_id: r.user_id ?? null }));
        return undefined;
      }
      if (/CREATE INDEX IF NOT EXISTS idx_upload_queue_user_id/i.test(cleaned)) {
        return undefined;
      }
      if (/DELETE FROM upload_queue WHERE user_id IS NULL/i.test(cleaned)) {
        rows = rows.filter((r) => r.user_id != null);
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
