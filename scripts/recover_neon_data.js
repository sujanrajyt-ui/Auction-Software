import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { db, runTransaction } from '../server/db.js';

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

async function recover() {
  const neonUrl = (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    ''
  ).trim();

  if (!neonUrl) {
    console.error('ERROR: No DATABASE_URL found.');
    console.error('Usage: DATABASE_URL="postgresql://..." node scripts/recover_neon_data.js');
    process.exit(1);
  }

  console.log('Connecting to Neon PostgreSQL...');
  const sql = neon(neonUrl);

  try {
    const rows = await sql`
      SELECT version, payload, updated_at 
      FROM verdict_state_snapshot 
      WHERE id = 2
    `;

    if (!rows || rows.length === 0) {
      console.warn('No snapshot found with id = 2 in verdict_state_snapshot.');
      const allSnapshots = await sql`SELECT id, version, updated_at FROM verdict_state_snapshot`;
      console.log('Available snapshots:', allSnapshots);
      return;
    }

    const { version, updated_at } = rows[0];
    let payload = rows[0].payload;
    if (typeof payload === 'string') {
      payload = JSON.parse(payload);
    }

    console.log(`Successfully fetched snapshot v${version} (Last updated: ${updated_at})`);

    // 1. Save JSON backup
    const backupDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const backupFile = path.join(backupDir, `auction_backup_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`[Backup Saved]: Full JSON backup saved to: ${backupFile}`);

    // 2. Hydrate local SQLite database
    runTransaction(() => {
      db.exec('PRAGMA foreign_keys = OFF;');
      try {
        for (const table of [...TABLES_IN_ORDER].reverse()) {
          db.prepare(`DELETE FROM ${table}`).run();
        }
        for (const table of TABLES_IN_ORDER) {
          const tableRows = Array.isArray(payload[table]) ? payload[table] : [];
          if (tableRows.length === 0) continue;
          const cols = Object.keys(tableRows[0]);
          const placeholders = cols.map(() => '?').join(', ');
          const stmt = db.prepare(
            `INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`
          );
          for (const row of tableRows) {
            stmt.run(...cols.map(c => (row[c] === undefined ? null : row[c])));
          }
        }
      } finally {
        db.exec('PRAGMA foreign_keys = ON;');
      }
    });

    console.log('[SQLite Hydrated]: Local SQLite database data/verdict.sqlite has been updated with today\'s live data.');

    // 3. Print recovery summary
    console.log('\n================ RECOVERY SUMMARY ================');
    for (const table of TABLES_IN_ORDER) {
      const count = Array.isArray(payload[table]) ? payload[table].length : 0;
      console.log(`  - ${table.padEnd(20)}: ${count} records`);
    }
    console.log('==================================================\n');
    console.log('All live auction data from today has been recovered and secured locally!');
  } catch (err) {
    console.error('Failed to recover data from Neon:', err.message);
    if (err.message.includes('exceeded') || err.message.includes('suspended') || err.message.includes('compute')) {
      console.error('\nNOTE: The Neon database compute is currently suspended due to quota limits.');
      console.error('Please upgrade or resume the compute in the Neon console (https://console.neon.tech) to allow this script to read the data.');
    }
    process.exit(1);
  }
}

recover();
