import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import {
  db,
  uid,
  runTransaction,
  recalculateAllAuctionPurses
} from '../server/db.js';
import {
  AUCTION_STATES,
  ROLES,
  AUCTION_TEMPLATES,
  findBuiltInLogo,
  generateItemSvgDataUri
} from '../shared/constants.js';

async function importFootball() {
  const excelPath = 'C:/Users/nagar/Downloads/Football_Draft_2026_27_Auction_Import_EUR_Millions.xlsx';
  if (!fs.existsSync(excelPath)) {
    console.error('File not found:', excelPath);
    process.exit(1);
  }

  const wb = XLSX.readFile(excelPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  console.log(`Loaded Football Draft sheet with ${rows.length} players.`);

  const template = AUCTION_TEMPLATES.FOOTBALL_DEFAULT;
  const auctionId = 'auc_football_2027';
  const now = new Date().toISOString();

  // Check if auction already exists
  const existing = db.prepare('SELECT id FROM auctions WHERE id = ?').get(auctionId);
  if (existing) {
    console.log(`Football Auction (${auctionId}) already exists. Removing to re-seed cleanly.`);
    db.prepare('DELETE FROM auctions WHERE id = ?').run(auctionId);
  }

  runTransaction(() => {
    // 1. Create Auction
    db.prepare(`
      INSERT INTO auctions (
        id, name, committeeName, currency, startingPurse, maxRetentionsPerTeam, maxRtmPerTeam,
        incrementRulesJson, status, retentionsPublished, activeItemId, projectorOverlayJson,
        reopenedCount, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'READY', 1, NULL, NULL, 0, ?, ?)
    `).run(
      auctionId,
      'Football Draft 2026/27',
      'European Football Committee',
      'EUR',
      1000000000,
      3,
      JSON.stringify([
        { min: 0, max: 20000000, increment: 1000000 },
        { min: 20000000, max: 50000000, increment: 2000000 },
        { min: 50000000, max: 100000000, increment: 5000000 },
        { min: 100000000, max: null, increment: 10000000 }
      ]),
      now,
      now
    );

    // 2. Assign Super Admin, Auctioneer, Bid Operator
    const superAdmin = db.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1").get();
    const auctioneer = db.prepare("SELECT id FROM users WHERE role = 'AUCTIONEER' LIMIT 1").get();
    const operator = db.prepare("SELECT id FROM users WHERE role = 'BID_OPERATOR' LIMIT 1").get();

    if (auctioneer) {
      db.prepare(`
        INSERT OR IGNORE INTO auction_admins (id, auctionId, userId, role, assignedAt)
        VALUES (?, ?, ?, ?, ?)
      `).run('aa_fb_auctioneer', auctionId, auctioneer.id, ROLES.AUCTIONEER, now);
    }
    if (operator) {
      db.prepare(`
        INSERT OR IGNORE INTO auction_admins (id, auctionId, userId, role, assignedAt)
        VALUES (?, ?, ?, ?, ?)
      `).run('aa_fb_operator', auctionId, operator.id, ROLES.BID_OPERATOR, now);
    }

    // 3. Create Teams
    const teamIdMap = new Map();
    template.teams.forEach((t, idx) => {
      const teamId = `team_fb_${idx + 1}`;
      const logo = findBuiltInLogo(t.name) || {};
      const shortName = logo.shortName || t.code || t.name.slice(0, 3).toUpperCase();
      const logoUrl = logo.logoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.name)}&background=0284c7&color=fff`;
      const primaryColor = logo.primaryColor || '#0284c7';
      const secondaryColor = logo.secondaryColor || '#0f172a';

      db.prepare(`
        INSERT INTO teams (
          id, auctionId, name, shortName, code, pin, logoUrl,
          primaryColor, secondaryColor, startingPurse, remainingPurse,
          disabled, sortOrder, createdAt, rtmCardsTotal
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0)
      `).run(
        teamId,
        auctionId,
        t.name,
        shortName,
        t.code,
        t.pin,
        logoUrl,
        primaryColor,
        secondaryColor,
        1000000000,
        1000000000,
        idx,
        now
      );
      teamIdMap.set(t.name.toLowerCase(), teamId);
    });

    // 4. Create Pools from Excel categories
    const poolMap = new Map();
    let poolSort = 0;
    for (const r of rows) {
      const category = (r['Pool/Category'] || r['Pool'] || r['Category'] || 'General').trim();
      const catKey = category.toLowerCase();
      if (!poolMap.has(catKey)) {
        const poolId = `pool_fb_${poolSort + 1}`;
        db.prepare(`
          INSERT INTO pools (id, auctionId, name, defaultBasePrice, isLegendPool, sortOrder, createdAt)
          VALUES (?, ?, ?, ?, 0, ?, ?)
        `).run(poolId, auctionId, category, 20000000, poolSort++, now);
        poolMap.set(catKey, { id: poolId, name: category });
      }
    }

    // 5. Insert Items
    let queueOrder = 1;
    for (const r of rows) {
      const name = (r['Name'] || r['Player Name'] || '').trim();
      if (!name) continue;

      const rawPrice = Number(r['Base Price'] || 10);
      // In millions EUR (e.g. 60 -> 60,000,000)
      const basePrice = rawPrice <= 500 ? rawPrice * 1000000 : rawPrice;
      const category = (r['Pool/Category'] || r['Pool'] || r['Category'] || 'General').trim();
      const poolInfo = poolMap.get(category.toLowerCase()) || { id: null, name: category };

      const itemId = uid('item_fb');
      const imageUrl = generateItemSvgDataUri({ name, pool: category });

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
        poolInfo.id,
        poolInfo.name,
        queueOrder++,
        now,
        now
      );
    }

    recalculateAllAuctionPurses(auctionId);
  });

  // Checkpoint SQLite WAL
  db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();

  const totalItems = db.prepare('SELECT count(*) as c FROM items WHERE auctionId = ?').get(auctionId).c;
  console.log(`\nFootball Draft 2026/27 imported successfully with ${totalItems} players!`);

  // Update verdict_seed.json
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
  console.log(`Exported full multi-committee snapshot to data/verdict_seed.json`);
}

importFootball().catch(err => {
  console.error('Import error:', err);
  process.exit(1);
});
