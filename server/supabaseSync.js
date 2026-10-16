import { getSupabaseServerClient } from './supabaseRealtime.js';
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

let localVersion = -1;
let isInitialized = false;

export function exportLocalTables() {
  const dump = {};
  for (const table of TABLES_IN_ORDER) {
    dump[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  return dump;
}

export function importLocalTables(dump) {
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

export async function syncFromSupabaseIfNeeded() {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const { data, error } = await supabase
      .from('verdict_state_snapshot')
      .select('version, payload')
      .eq('id', 2)
      .maybeSingle();

    if (error || !data) return;

    const remoteVersion = Number(data.version || 0);
    if (remoteVersion > localVersion) {
      const payload = typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload;
      importLocalTables(payload);
      localVersion = remoteVersion;
      isInitialized = true;
    }
  } catch (err) {
    // Non-blocking fallback
  }
}

export async function syncToSupabase() {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const dump = exportLocalTables();
    const nextVersion = (localVersion > 0 ? localVersion : 1) + 1;

    const { data, error } = await supabase
      .from('verdict_state_snapshot')
      .upsert({
        id: 2,
        version: nextVersion,
        payload: dump,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select('version')
      .maybeSingle();

    if (!error && data?.version) {
      localVersion = Number(data.version);
    }
  } catch (err) {
    // Non-blocking fallback
  }
}
