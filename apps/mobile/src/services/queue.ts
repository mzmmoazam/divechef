import * as SQLite from 'expo-sqlite';

const DB_NAME = 'divechef_queue.db';

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS upload_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        attempts INTEGER NOT NULL DEFAULT 0
      );
    `);
  }
  return db;
}

export async function enqueueUpload(payload: unknown): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'INSERT INTO upload_queue (payload) VALUES (?)',
    [JSON.stringify(payload)]
  );
}

export async function getPendingCount(): Promise<number> {
  const database = await getDb();
  const result = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM upload_queue'
  );
  return result?.count ?? 0;
}

export async function flushQueue(
  uploadFn: (payload: unknown) => Promise<boolean>
): Promise<{ succeeded: number; failed: number }> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ id: number; payload: string; attempts: number }>(
    'SELECT id, payload, attempts FROM upload_queue ORDER BY created_at ASC'
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

export async function clearQueue(): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM upload_queue');
}
