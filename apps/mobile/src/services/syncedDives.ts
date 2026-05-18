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
        user_id       TEXT NOT NULL,
        device_serial TEXT NOT NULL,
        fingerprint   TEXT NOT NULL,
        synced_at     INTEGER NOT NULL,
        PRIMARY KEY (user_id, device_serial, fingerprint)
      );
    `);
    return;
  }

  if (colNames.has('device_serial')) {
    // Already migrated. Defensively drop any rows that snuck in unscoped.
    await database.runAsync(
      'DELETE FROM synced_fingerprints WHERE device_serial IS NULL'
    );
    return;
  }

  // Pre-M2 table (post-M1 user-scoped, pre-device-scoped). Rebuild from
  // scratch with the new composite PK. SQLite does not support ALTER TABLE …
  // ADD CONSTRAINT, so DROP + CREATE is the right move (and we'd be
  // DELETE-ing all those rows anyway because they have NULL device_serial).
  await database.execAsync('DROP TABLE synced_fingerprints');
  await database.execAsync(`
    CREATE TABLE synced_fingerprints (
      user_id       TEXT NOT NULL,
      device_serial TEXT NOT NULL,
      fingerprint   TEXT NOT NULL,
      synced_at     INTEGER NOT NULL,
      PRIMARY KEY (user_id, device_serial, fingerprint)
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

/** Returns the set of fingerprint hex strings the given (user, device) has uploaded. */
export async function getSyncedFingerprints(
  userId: string,
  deviceSerial: string
): Promise<Set<string>> {
  if (!userId) throw new Error('syncedDives: userId is required');
  if (!deviceSerial) throw new Error('syncedDives: deviceSerial is required');
  const database = await getDb();
  const rows = await database.getAllAsync<{ fingerprint: string }>(
    'SELECT fingerprint FROM synced_fingerprints WHERE user_id = ? AND device_serial = ?',
    [userId, deviceSerial]
  );
  return new Set(rows.map((r) => r.fingerprint));
}

/** Records a fingerprint as successfully uploaded for the given (user, device). Idempotent. */
export async function markFingerprintSynced(
  userId: string,
  deviceSerial: string,
  fingerprint: string
): Promise<void> {
  if (!userId) throw new Error('syncedDives: userId is required');
  if (!deviceSerial) throw new Error('syncedDives: deviceSerial is required');
  if (!fingerprint) throw new Error('syncedDives: fingerprint is required');
  const database = await getDb();
  await database.runAsync(
    'INSERT OR IGNORE INTO synced_fingerprints (user_id, device_serial, fingerprint, synced_at) VALUES (?, ?, ?, ?)',
    [userId, deviceSerial, fingerprint, Date.now()]
  );
}

/** Test-only: forces re-init on next call. */
export function __resetSyncedDivesForTests(): void {
  dbPromise = null;
}
