import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.js';

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

const dump = {};
for (const table of TABLES_IN_ORDER) {
  dump[table] = db.prepare(`SELECT * FROM ${table}`).all();
}

const outputPath = path.resolve(process.cwd(), 'data', 'verdict_seed.json');
fs.writeFileSync(outputPath, JSON.stringify(dump, null, 2), 'utf-8');
console.log('Successfully exported verdict_seed.json to:', outputPath);
for (const table of TABLES_IN_ORDER) {
  console.log(`  - ${table.padEnd(20)}: ${dump[table].length} records`);
}
