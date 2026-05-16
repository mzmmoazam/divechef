import * as SQLite from 'expo-sqlite';

const DB_NAME = 'divechef_sync.db';

let db: SQLite.SQLiteDatabase | null = null;

async function ensureMigrated(database: SQLite.SQLiteDatabase): Promise<void> {
  // Inspect the table to decide between fresh-init and migration.
  const cols = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(synced_fingerprints)'
  );
  const colNames = new Set(cols.map((c) => c.name));

  if (colNames.size === 0) {
    // Fresh install: create the table at the current schema.
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS synced_fingerprints (
        user_id     TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        synced_at   INTEGER NOT NULL,
        PRIMARY KEY (user_id, fingerprint)
      );
    `);
    return;
  }

  // Existing table from a previous version. Add the column if missing,
  // then drop legacy unscoped rows. The composite-PK rebuild is handled
  // separately because SQLite does not support ALTER TABLE … ADD CONSTRAINT.
  if (!colNames.has('user_id')) {
    await database.execAsync(
      'ALTER TABLE synced_fingerprints ADD COLUMN user_id TEXT'
    );
  }
  await database.runAsync(
    'DELETE FROM synced_fingerprints WHERE user_id IS NULL'
  );
}

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await ensureMigrated(db);
  }
  return db;
}

/** Returns the set of fingerprint hex strings the given user has uploaded. */
export async function getSyncedFingerprints(userId: string): Promise<Set<string>> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ fingerprint: string }>(
    'SELECT fingerprint FROM synced_fingerprints WHERE user_id = ?',
    [userId]
  );
  return new Set(rows.map((r) => r.fingerprint));
}

/** Records a fingerprint as successfully uploaded for the given user. Idempotent. */
export async function markFingerprintSynced(
  userId: string,
  fingerprint: string
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'INSERT OR IGNORE INTO synced_fingerprints (user_id, fingerprint, synced_at) VALUES (?, ?, ?)',
    [userId, fingerprint, Date.now()]
  );
}

/** Test-only: forces re-init on next call. */
export function __resetSyncedDivesForTests(): void {
  db = null;
}
