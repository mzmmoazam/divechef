import * as SQLite from 'expo-sqlite';
import { getSyncedFingerprints } from './syncedDives';

const DB_NAME = 'divechef_queue.db';

// Cache the in-flight Promise (not the resolved value) so concurrent
// callers at app boot don't both try to migrate.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function ensureMigrated(database: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(upload_queue)'
  );
  const colNames = new Set(cols.map((c) => c.name));

  if (colNames.size === 0) {
    // Fresh install.
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS upload_queue (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    TEXT NOT NULL,
        payload    TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        attempts   INTEGER NOT NULL DEFAULT 0
      );
    `);
    await database.execAsync(
      'CREATE INDEX IF NOT EXISTS idx_upload_queue_user_id ON upload_queue(user_id)'
    );
    return;
  }

  if (colNames.has('user_id')) {
    // Already migrated. Defensively drop any rows that snuck in unscoped.
    await database.runAsync(
      'DELETE FROM upload_queue WHERE user_id IS NULL'
    );
    return;
  }

  // Pre-migration: every row is unscoped legacy data with a NULL bearer-token
  // attribution. We refuse to flush them under a different user, so DELETE.
  // NOTE: this discards any pending uploads queued by a pre-migration build of
  // the app. Acceptable per spec — those rows have no user attribution and
  // could not be safely flushed.
  //
  // SQLite cannot ALTER TABLE … ADD COLUMN with NOT NULL without a default,
  // so the added column is nullable at the database layer. The schema's
  // NOT NULL constraint applies only to the fresh-install CREATE TABLE.
  // For migrated databases, NOT NULL is enforced at the application layer
  // by enqueueUpload's userId guard — any caller bypassing that function
  // could insert a NULL user_id silently.
  await database.execAsync(
    'ALTER TABLE upload_queue ADD COLUMN user_id TEXT'
  );
  await database.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_upload_queue_user_id ON upload_queue(user_id)'
  );
  await database.runAsync(
    'DELETE FROM upload_queue WHERE user_id IS NULL'
  );
}

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await SQLite.openDatabaseAsync(DB_NAME);
      await ensureMigrated(d);
      return d;
    })();
  }
  return dbPromise;
}

export async function enqueueUpload(userId: string, payload: unknown): Promise<void> {
  if (!userId) throw new Error('queue: userId is required');
  const database = await getDb();
  await database.runAsync(
    'INSERT INTO upload_queue (user_id, payload) VALUES (?, ?)',
    [userId, JSON.stringify(payload)]
  );
}

export async function getPendingCount(userId: string): Promise<number> {
  if (!userId) throw new Error('queue: userId is required');
  const database = await getDb();
  const result = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM upload_queue WHERE user_id = ?',
    [userId]
  );
  return result?.count ?? 0;
}

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

export async function clearQueue(userId: string): Promise<void> {
  if (!userId) throw new Error('queue: userId is required');
  const database = await getDb();
  await database.runAsync('DELETE FROM upload_queue WHERE user_id = ?', [userId]);
}

/** Test-only: forces re-init on next call. */
export function __resetQueueForTests(): void {
  dbPromise = null;
}
