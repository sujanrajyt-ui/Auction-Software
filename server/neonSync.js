import { neon } from '@neondatabase/serverless';
import { db, runTransaction } from './db.js';

const TABLES_IN_ORDER = [
  'users',
  'platform_settings',
  'auctions',
  'auction_admins',
  'teams',
  'pools',
  'items',
  'bids',
  'retentions',
  'purse_adjustments',
  'sales_history',
  'audit_logs'
];

let sqlClient = null;
let initialized = false;
let localVersion = -1;
let initPromise = null;

export function getNeonUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    ''
  ).trim();
}

export function isNeonEnabled() {
  return Boolean(getNeonUrl());
}

function getSql() {
  if (!sqlClient) {
    const url = getNeonUrl();
    if (!url) return null;
    sqlClient = neon(url);
  }
  return sqlClient;
}

function exportLocalTables() {
  const dump = {};
  for (const table of TABLES_IN_ORDER) {
    dump[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  return dump;
}

function importLocalTables(dump) {
  if (!dump || typeof dump !== 'object') return;
  runTransaction(() => {
    db.exec('PRAGMA foreign_keys = OFF;');
    try {
      for (const table of [...TABLES_IN_ORDER].reverse()) {
        db.prepare(`DELETE FROM ${table}`).run();
      }
      for (const table of TABLES_IN_ORDER) {
        const rows = Array.isArray(dump[table]) ? dump[table] : [];
        if (rows.length === 0) continue;
        const cols = Object.keys(rows[0]);
        const placeholders = cols.map(() => '?').join(', ');
        const stmt = db.prepare(
          `INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`
        );
        for (const row of rows) {
          stmt.run(...cols.map(c => (row[c] === undefined ? null : row[c])));
        }
      }
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  });
}

async function syncRelationalTablesToNeon(sql, dump) {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS auctions (
        id TEXT PRIMARY KEY,
        name TEXT,
        committee_name TEXT,
        currency TEXT,
        starting_purse BIGINT,
        max_retentions_per_team INT,
        max_rtm_per_team INT,
        status TEXT,
        updated_at TEXT
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        auction_id TEXT,
        name TEXT,
        code TEXT,
        pin TEXT,
        starting_purse BIGINT,
        remaining_purse BIGINT,
        rtm_cards_total INT
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        auction_id TEXT,
        name TEXT,
        pool_name TEXT,
        base_price BIGINT,
        status TEXT,
        sold_to_team_id TEXT,
        sold_amount BIGINT,
        sold_via_rtm INT
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS retentions (
        id TEXT PRIMARY KEY,
        auction_id TEXT,
        team_id TEXT,
        player_name TEXT,
        amount BIGINT
      )
    `;

    for (const a of dump.auctions || []) {
      await sql`
        INSERT INTO auctions (id, name, committee_name, currency, starting_purse, max_retentions_per_team, max_rtm_per_team, status, updated_at)
        VALUES (${a.id}, ${a.name}, ${a.committeeName}, ${a.currency}, ${a.startingPurse}, ${a.maxRetentionsPerTeam}, ${a.maxRtmPerTeam || 0}, ${a.status}, ${a.updatedAt})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          max_retentions_per_team = EXCLUDED.max_retentions_per_team,
          max_rtm_per_team = EXCLUDED.max_rtm_per_team,
          updated_at = EXCLUDED.updated_at
      `;
    }
  } catch (err) {
    // Non-blocking mirror for Neon table viewer
    console.warn('[Neon Mirror Warning]:', err.message);
  }
}

export async function ensureNeonInitialized() {
  if (!isNeonEnabled()) return;
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS verdict_state_snapshot (
          id INT PRIMARY KEY,
          version BIGINT NOT NULL,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      const rows = await sql`
        SELECT version, payload FROM verdict_state_snapshot WHERE id = 2
      `;

      if (rows.length === 0) {
        const initialDump = exportLocalTables();
        const payloadStr = JSON.stringify(initialDump);
        await sql`
          INSERT INTO verdict_state_snapshot (id, version, payload, updated_at)
          VALUES (2, 1, ${payloadStr}::jsonb, NOW())
        `;
        localVersion = 1;
        await syncRelationalTablesToNeon(sql, initialDump);
        console.log('[Neon DB] Initialized & seeded Neon PostgreSQL database.');
      } else {
        const remoteVersion = Number(rows[0].version || 1);
        const payload =
          typeof rows[0].payload === 'string'
            ? JSON.parse(rows[0].payload)
            : rows[0].payload;
        importLocalTables(payload);
        localVersion = remoteVersion;
        console.log(`[Neon DB] Connected & hydrated from Neon PostgreSQL (v${localVersion}).`);
      }

      initialized = true;
    } catch (err) {
      console.error('[Neon DB Init Error]:', err.message);
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export async function syncFromNeonIfNeeded() {
  if (!isNeonEnabled()) return;
  await ensureNeonInitialized();
  try {
    const sql = getSql();
    const versionRows = await sql`
      SELECT version FROM verdict_state_snapshot WHERE id = 2
    `;
    if (versionRows.length === 0) return;
    const remoteVersion = Number(versionRows[0].version || 0);
    if (remoteVersion > localVersion) {
      const fullRows = await sql`
        SELECT version, payload FROM verdict_state_snapshot WHERE id = 2
      `;
      if (fullRows.length > 0) {
        const payload =
          typeof fullRows[0].payload === 'string'
            ? JSON.parse(fullRows[0].payload)
            : fullRows[0].payload;
        importLocalTables(payload);
        localVersion = Number(fullRows[0].version || remoteVersion);
      }
    }
  } catch (err) {
    console.error('[Neon DB Pull Error]:', err.message);
  }
}

export async function syncToNeon() {
  if (!isNeonEnabled()) return;
  await ensureNeonInitialized();
  try {
    const sql = getSql();
    const dump = exportLocalTables();
    const payloadStr = JSON.stringify(dump);
    const updatedRows = await sql`
      INSERT INTO verdict_state_snapshot (id, version, payload, updated_at)
      VALUES (2, 1, ${payloadStr}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET
        version = verdict_state_snapshot.version + 1,
        payload = EXCLUDED.payload,
        updated_at = NOW()
      RETURNING version
    `;
    if (updatedRows.length > 0) {
      localVersion = Number(updatedRows[0].version);
    }
    syncRelationalTablesToNeon(sql, dump);
  } catch (err) {
    console.error('[Neon DB Push Error]:', err.message);
  }
}
