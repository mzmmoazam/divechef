import * as SQLite from 'expo-sqlite';

const DB_NAME = 'divechef_sync.db';

// Cache the in-flight Promise (not the resolved value) so concurrent
// callers at app boot don't both try to migrate. The first caller's
// migration wins; subsequent callers await the same Promise.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function ensureMigrated(database: SQLite.SQLiteDatabase): Promise<void> {
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

  if (colNames.has('user_id')) {
    // Already migrated. Defensively drop any rows that snuck in unscoped.
    await database.runAsync(
      'DELETE FROM synced_fingerprints WHERE user_id IS NULL'
    );
    return;
  }

  // Pre-migration table: every row is unscoped legacy data. Rebuild from
  // scratch with the composite PK. SQLite does not support ALTER TABLE …
  // ADD CONSTRAINT, so DROP + CREATE is the right move (and we'd be
  // DELETE-ing all those rows anyway because they have NULL user_id).
  await database.execAsync('DROP TABLE synced_fingerprints');
  await database.execAsync(`
    CREATE TABLE synced_fingerprints (
      user_id     TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      synced_at   INTEGER NOT NULL,
      PRIMARY KEY (user_id, fingerprint)
    );
  `);
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

/** Returns the set of fingerprint hex strings the given user has uploaded. */
export async function getSyncedFingerprints(userId: string): Promise<Set<string>> {
  if (!userId) throw new Error('syncedDives: userId is required');
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
  if (!userId) throw new Error('syncedDives: userId is required');
  if (!fingerprint) throw new Error('syncedDives: fingerprint is required');
  const database = await getDb();
  await database.runAsync(
    'INSERT OR IGNORE INTO synced_fingerprints (user_id, fingerprint, synced_at) VALUES (?, ?, ?)',
    [userId, fingerprint, Date.now()]
  );
}

/** Test-only: forces re-init on next call. */
export function __resetSyncedDivesForTests(): void {
  dbPromise = null;
}
