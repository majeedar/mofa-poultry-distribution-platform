import * as SQLite from 'expo-sqlite';

let _db = null;

export function getDB() {
  if (!_db) _db = SQLite.openDatabaseSync('pircmes.db');
  return _db;
}

export async function initDB() {
  const db = getDB();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      method    TEXT NOT NULL,
      url       TEXT NOT NULL,
      data      TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      synced    INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS farmers_cache (
      id               INTEGER PRIMARY KEY,
      farmer_number    TEXT,
      farmer_barcode   TEXT,
      full_name        TEXT,
      phone_number     TEXT,
      production_tier  TEXT,
      sp_id            INTEGER,
      aea_id           INTEGER,
      farm_location    TEXT,
      farm_gps_lat     REAL,
      farm_gps_lng     REAL,
      cached_at        INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS daily_entries_local (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id    INTEGER,
      entry_date   TEXT,
      birds_alive  INTEGER,
      mortality_count INTEGER DEFAULT 0,
      vaccine_given   INTEGER DEFAULT 0,
      feed_consumed_kg REAL,
      water_consumed_l REAL,
      observations TEXT,
      entry_method TEXT DEFAULT 'tablet',
      synced       INTEGER DEFAULT 0,
      created_at   INTEGER DEFAULT (strftime('%s','now'))
    );
  `);
}

export async function queueSync(method, url, data) {
  const db = getDB();
  await db.runAsync(
    'INSERT INTO sync_queue (method, url, data) VALUES (?, ?, ?)',
    [method, url, JSON.stringify(data)]
  );
}

export async function getPendingSync() {
  const db = getDB();
  return await db.getAllAsync('SELECT * FROM sync_queue WHERE synced=0 ORDER BY created_at');
}

export async function markSynced(id) {
  const db = getDB();
  await db.runAsync('UPDATE sync_queue SET synced=1 WHERE id=?', [id]);
}

export async function cacheFarmers(farmers) {
  const db = getDB();
  await db.runAsync('DELETE FROM farmers_cache');
  for (const f of farmers) {
    await db.runAsync(
      `INSERT OR REPLACE INTO farmers_cache (id, farmer_number, farmer_barcode, full_name, phone_number, production_tier, sp_id, aea_id, farm_location, farm_gps_lat, farm_gps_lng)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [f.id, f.farmer_number, f.farmer_barcode, f.full_name, f.phone_number, f.production_tier, f.sp_id, f.aea_id, f.farm_location, f.farm_gps_lat, f.farm_gps_lng]
    );
  }
}

export async function getCachedFarmers() {
  const db = getDB();
  return await db.getAllAsync('SELECT * FROM farmers_cache');
}
