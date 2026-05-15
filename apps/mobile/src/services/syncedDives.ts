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
