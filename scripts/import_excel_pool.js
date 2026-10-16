import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';
import {
  db,
  uid,
  runTransaction,
  recalculateAllAuctionPurses
} from '../server/db.js';
import {
  normalizePlayerName,
  CRICKETER_VERIFIED_IMAGES,
  generateCricketAvatarSvgDataUri
} from '../shared/constants.js';

function parsePrice(str) {
  if (typeof str === 'number') return str;
  const s = String(str || '').replace(/[₹, ]/g, '').trim();
  if (s.endsWith('Cr')) {
    return Math.round(parseFloat(s) * 10000000);
  }
  if (s.endsWith('L') || s.endsWith('Lakh')) {
    return Math.round(parseFloat(s) * 100000);
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? 3000000 : Math.round(n);
}

async function runImport() {
  const excelPath = 'C:/Users/nagar/Downloads/IPL_2027_Auction_Player_Pool_UPLOAD_READY.xlsx';
  if (!fs.existsSync(excelPath)) {
    console.error('File not found:', excelPath);
    process.exit(1);
  }

  const wb = xlsx.readFile(excelPath);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  console.log(`Loaded ${rows.length} rows from Excel sheet.`);

  const auction = db.prepare('SELECT id, name FROM auctions LIMIT 1').get();
  if (!auction) {
    console.error('No auction found in database.');
    process.exit(1);
  }
  const auctionId = auction.id;
  console.log(`Target Auction: ${auction.name} (${auctionId})`);

  // Existing pools
  const existingPools = db.prepare('SELECT id, name FROM pools WHERE auctionId = ?').all(auctionId);
  const poolMap = new Map();
  existingPools.forEach(p => poolMap.set(p.name.trim().toLowerCase(), p.id));

  // Existing items & retentions
  const existingItems = db.prepare('SELECT name, status FROM items WHERE auctionId = ?').all(auctionId);
  const existingRetentions = db.prepare('SELECT playerName FROM retentions WHERE auctionId = ?').all(auctionId);

  const seenNames = new Set();
  existingItems.forEach(i => seenNames.add(normalizePlayerName(i.name)));
  existingRetentions.forEach(r => seenNames.add(normalizePlayerName(r.playerName)));

  const maxOrderRow = db.prepare('SELECT COALESCE(MAX(queueOrder), 0) as maxOrder FROM items WHERE auctionId = ?').get(auctionId);
  let nextQueueOrder = (maxOrderRow?.maxOrder || 0) + 1;

  let addedCount = 0;
  let skippedCount = 0;
  const now = new Date().toISOString();

  runTransaction(() => {
    // 1. Ensure pools exist
    for (const row of rows) {
      const category = (row['Pool/Category'] || 'General').trim();
      const catKey = category.toLowerCase();
      if (!poolMap.has(catKey)) {
        const newPoolId = uid('pool');
        db.prepare(`
          INSERT INTO pools (id, auctionId, name, defaultBasePrice, sortOrder, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(newPoolId, auctionId, category, 20000000, poolMap.size, now);
        poolMap.set(catKey, newPoolId);
        console.log(`Created new pool: ${category} (${newPoolId})`);
      }
    }

    // 2. Insert new players
    for (const row of rows) {
      const name = (row['Name'] || '').trim();
      if (!name) continue;

      const norm = normalizePlayerName(name);
      if (seenNames.has(norm)) {
        skippedCount++;
        continue;
      }
      seenNames.add(norm);

      const basePrice = parsePrice(row['Base Price']);
      const category = (row['Pool/Category'] || 'General').trim();
      const poolId = poolMap.get(category.toLowerCase()) || null;

      // Image resolution: Check verified dictionary or generate SVG avatar
      let imageUrl = CRICKETER_VERIFIED_IMAGES[name] || null;
      if (!imageUrl) {
        for (const [vName, vUrl] of Object.entries(CRICKETER_VERIFIED_IMAGES)) {
          if (normalizePlayerName(vName) === norm) {
            imageUrl = vUrl;
            break;
          }
        }
      }
      if (!imageUrl) {
        imageUrl = generateCricketAvatarSvgDataUri(name, category);
      }

      const itemId = uid('item');
      db.prepare(`
        INSERT INTO items (
          id, auctionId, name, imageUrl, basePrice, originalBasePrice,
          poolId, poolName, status, queueOrder, currentBid,
          highestBidderTeamId, soldToTeamId, soldAmount, soldAt,
          reauctionCount, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?, 0, NULL, NULL, NULL, NULL, 0, ?, ?)
      `).run(
        itemId,
        auctionId,
        name,
        imageUrl,
        basePrice,
        basePrice,
        poolId,
        category,
        nextQueueOrder++,
        now,
        now
      );

      addedCount++;
    }

    recalculateAllAuctionPurses(auctionId);
  });

  console.log(`\n========================================`);
  console.log(`Import Finished Successfully!`);
  console.log(`- Total Added to Queue: ${addedCount}`);
  console.log(`- Skipped (already in auction or retention): ${skippedCount}`);
  
  const totalItems = db.prepare('SELECT count(*) as c FROM items WHERE auctionId = ?').get(auctionId).c;
  console.log(`- New Total Items in Auction: ${totalItems}`);
  console.log(`========================================\n`);

  // Export seed file
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
  const seedPath = path.resolve(process.cwd(), 'data', 'verdict_seed.json');
  fs.writeFileSync(seedPath, JSON.stringify(dump, null, 2), 'utf-8');
  console.log(`Exported full snapshot (${totalItems} items) to data/verdict_seed.json`);
}

runImport().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
