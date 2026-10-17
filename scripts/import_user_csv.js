import fs from 'node:fs';
import path from 'node:path';
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

function parseCsvPrice(val) {
  const num = parseFloat(String(val || '').replace(/[₹, ]/g, ''));
  if (Number.isNaN(num) || num <= 0) return 3000000;
  // If price is in Lakhs (e.g. 200, 150, 100, 75, 50, 40, 30)
  if (num <= 500) {
    return Math.round(num * 100000);
  }
  return Math.round(num);
}

async function importUserCsv() {
  const csvPath = 'C:/Users/nagar/Downloads/PlayAuctionGame_Mega_Auction_Player_List_Updated.csv';
  if (!fs.existsSync(csvPath)) {
    console.error('File not found:', csvPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  console.log(`Loaded CSV with ${lines.length - 1} player rows.`);

  const auction = db.prepare('SELECT id, name FROM auctions LIMIT 1').get();
  if (!auction) {
    console.error('No auction found in DB.');
    process.exit(1);
  }
  const auctionId = auction.id;
  console.log(`Target Auction: ${auction.name} (${auctionId})`);

  // Existing pools
  const existingPools = db.prepare('SELECT id, name FROM pools WHERE auctionId = ?').all(auctionId);
  const poolMap = new Map();
  existingPools.forEach(p => poolMap.set(p.name.trim().toLowerCase(), p.id));

  // Existing items & retentions
  const existingItems = db.prepare('SELECT id, name, status FROM items WHERE auctionId = ?').all(auctionId);
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
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      const category = (parts[2] || 'General').trim();
      const catKey = category.toLowerCase();
      if (!poolMap.has(catKey)) {
        const newPoolId = uid('pool');
        db.prepare(`
          INSERT INTO pools (id, auctionId, name, defaultBasePrice, sortOrder, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(newPoolId, auctionId, category, 10000000, poolMap.size, now);
        poolMap.set(catKey, newPoolId);
        console.log(`Created pool: ${category} (${newPoolId})`);
      }
    }

    // 2. Insert new players
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      const name = (parts[0] || '').trim();
      if (!name) continue;

      const norm = normalizePlayerName(name);
      if (seenNames.has(norm)) {
        skippedCount++;
        continue;
      }
      seenNames.add(norm);

      const basePrice = parseCsvPrice(parts[1]);
      const category = (parts[2] || 'General').trim();
      const poolId = poolMap.get(category.toLowerCase()) || null;

      // Image resolution
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

  // Checkpoint SQLite WAL into main database file
  db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();

  const totalItems = db.prepare('SELECT count(*) as c FROM items WHERE auctionId = ?').get(auctionId).c;
  const soldCount = db.prepare("SELECT count(*) as c FROM items WHERE auctionId = ? AND status = 'SOLD'").get(auctionId).c;
  const unsoldCount = db.prepare("SELECT count(*) as c FROM items WHERE auctionId = ? AND status = 'UNSOLD'").get(auctionId).c;
  const queuedCount = db.prepare("SELECT count(*) as c FROM items WHERE auctionId = ? AND status = 'QUEUED'").get(auctionId).c;

  console.log(`\n========================================`);
  console.log(`CSV Import Complete & Committed!`);
  console.log(`- New Players Added to Queue: ${addedCount}`);
  console.log(`- Skipped (already in auction / retention): ${skippedCount}`);
  console.log(`- Total Items in Auction: ${totalItems}`);
  console.log(`  * Sold Items Preserved: ${soldCount}`);
  console.log(`  * Unsold Items Preserved: ${unsoldCount}`);
  console.log(`  * Queued Items Available: ${queuedCount}`);
  console.log(`========================================\n`);

  // Export full snapshot to verdict_seed.json
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

importUserCsv().catch(err => {
  console.error('Import error:', err);
  process.exit(1);
});
