import fs from 'node:fs';
import path from 'node:path';
import {
  db,
  initSchema,
  hashPassword,
  uid,
  runTransaction,
  recordAudit,
  recalculateAllAuctionPurses
} from './db.js';
import {
  AUCTION_STATES,
  ROLES,
  AUCTION_TEMPLATES,
  findBuiltInLogo,
  generateCrestSvgDataUri,
  generateItemSvgDataUri,
  isIplAuction
} from '../shared/constants.js';

/**
 * Reusable factory to create a new Auction instance from a template or custom configuration
 */
export function createAuctionInstance({
  id = null,
  name,
  committeeName,
  currency = 'EUR',
  startingPurse = 1_000_000_000,
  maxRetentionsPerTeam = 3,
  maxRtmPerTeam = 0,
  incrementRules = [{ min: 0, max: null, increment: 5_000_000 }],
  pools = [],
  teams = [],
  items = [],
  status = AUCTION_STATES.DRAFT,
  createdByUser = null
}) {
  return runTransaction(() => {
    const auctionId = id || uid('auc');
    const isDeterministic = Boolean(id);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO auctions (
        id, name, committeeName, currency, startingPurse, maxRetentionsPerTeam, maxRtmPerTeam,
        incrementRulesJson, status, retentionsPublished, activeItemId,
        projectorOverlayJson, reopenedCount, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 0, ?, ?)
    `).run(
      auctionId,
      name,
      committeeName,
      currency,
      Number(startingPurse),
      Number(maxRetentionsPerTeam),
      Number(maxRtmPerTeam) || 0,
      JSON.stringify(incrementRules),
      status,
      now,
      now
    );

    // Insert Pools
    const poolNameMap = new Map();
    pools.forEach((p, idx) => {
      const poolId = isDeterministic ? `pool_${auctionId}_${idx + 1}` : uid('pool');
      db.prepare(`
        INSERT INTO pools (id, auctionId, name, defaultBasePrice, isLegendPool, sortOrder, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        poolId,
        auctionId,
        p.name,
        Number(p.defaultBasePrice) || 10_000_000,
        p.isLegendPool ? 1 : 0,
        idx,
        now
      );
      poolNameMap.set(p.name.toLowerCase(), { id: poolId, name: p.name, defaultBasePrice: p.defaultBasePrice });
    });

    // Insert Teams with official logos & colours from built-in library
    teams.forEach((t, idx) => {
      const teamId = isDeterministic ? `team_${auctionId}_${idx + 1}` : uid('team');
      const libMatch = findBuiltInLogo(t.name) || findBuiltInLogo(t.code);
      const shortName =
        t.shortName ||
        t.code ||
        libMatch?.shortName ||
        t.name
          .split(/\s+/)
          .map(w => w[0])
          .join('')
          .slice(0, 3)
          .toUpperCase();
      const primaryColor = t.primaryColor || libMatch?.primaryColor || '#034694';
      const secondaryColor = t.secondaryColor || libMatch?.secondaryColor || '#DBA111';
      const logoUrl =
        t.logoUrl ||
        libMatch?.logoUrl ||
        generateCrestSvgDataUri({
          name: t.name,
          shortName,
          primaryColor,
          secondaryColor
        });
      const teamCode = (t.code || `${shortName}${idx + 1}`).toUpperCase();
      const teamPin = String(t.pin || String(1001 + idx));
      const teamPurse = t.startingPurse !== undefined ? Number(t.startingPurse) : Number(startingPurse);

      db.prepare(`
        INSERT INTO teams (
          id, auctionId, name, shortName, code, pin, logoUrl,
          primaryColor, secondaryColor, startingPurse, remainingPurse,
          disabled, sortOrder, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        teamId,
        auctionId,
        t.name,
        shortName,
        teamCode,
        teamPin,
        logoUrl,
        primaryColor,
        secondaryColor,
        teamPurse,
        teamPurse,
        idx,
        now
      );
    });

    // Insert Items
    items.forEach((item, idx) => {
      const itemId = isDeterministic ? `item_${auctionId}_${idx + 1}` : uid('item');
      const poolMatch = poolNameMap.get(String(item.pool || '').toLowerCase());
      const poolName = poolMatch?.name || item.pool || 'General Pool';
      const basePrice =
        item.basePrice !== undefined
          ? Number(item.basePrice)
          : Number(poolMatch?.defaultBasePrice || 10_000_000);
      const imageUrl =
        item.imageUrl ||
        generateItemSvgDataUri({
          name: item.name,
          pool: poolName
        });

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
        item.name,
        imageUrl,
        basePrice,
        basePrice,
        poolMatch?.id || null,
        poolName,
        idx,
        now,
        now
      );
    });

    recalculateAllAuctionPurses(auctionId);

    recordAudit({
      auctionId,
      user: createdByUser,
      action: 'Auction created',
      entityType: 'AUCTION',
      entityId: auctionId,
      entityName: name,
      previousValue: null,
      newValue: {
        name,
        committeeName,
        currency,
        startingPurse,
        teamsCount: teams.length,
        itemsCount: items.length
      }
    });

    return auctionId;
  });
}

export function ensureSeedData({ forceReset = false } = {}) {
  initSchema();

  if (forceReset) {
    db.exec(`
      DELETE FROM audit_logs;
      DELETE FROM sales_history;
      DELETE FROM purse_adjustments;
      DELETE FROM retentions;
      DELETE FROM bids;
      DELETE FROM items;
      DELETE FROM pools;
      DELETE FROM teams;
      DELETE FROM auction_admins;
      DELETE FROM auctions;
      DELETE FROM users;
    `);
  }

  // 0. If database has no auctions, check if GitHub bundled verdict_seed.json exists
  const existingAuctionsCheck = db.prepare('SELECT COUNT(*) AS cnt FROM auctions').get();
  if (!existingAuctionsCheck || existingAuctionsCheck.cnt === 0) {
    const seedJsonPath = path.resolve(process.cwd(), 'data', 'verdict_seed.json');
    if (fs.existsSync(seedJsonPath)) {
      try {
        const dump = JSON.parse(fs.readFileSync(seedJsonPath, 'utf8'));
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
        runTransaction(() => {
          db.exec('PRAGMA foreign_keys = OFF;');
          try {
            for (const table of TABLES_IN_ORDER) {
              const rows = Array.isArray(dump[table]) ? dump[table] : [];
              if (rows.length === 0) continue;
              const cols = Object.keys(rows[0]);
              const placeholders = cols.map(() => '?').join(', ');
              const stmt = db.prepare(
                `INSERT OR REPLACE INTO ${table} (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`
              );
              for (const row of rows) {
                stmt.run(...cols.map(c => (row[c] === undefined ? null : row[c])));
              }
            }
          } finally {
            db.exec('PRAGMA foreign_keys = ON;');
          }
        });
        console.log('[Seed DB] Successfully hydrated complete auction state from GitHub bundled verdict_seed.json');
        return;
      } catch (err) {
        console.error('[Seed DB Error]: Failed to load verdict_seed.json:', err.message);
      }
    }
  }

  const now = new Date().toISOString();

  // 1. Ensure default Super Admin & Committee Admins (Auctioneer & Bid Operator)
  const existingUsers = db.prepare('SELECT COUNT(*) AS cnt FROM users').get();
  let superAdminId;
  let auctioneerId;
  let bidOperatorId;

  if (!existingUsers || existingUsers.cnt === 0) {
    superAdminId = 'usr_superadmin';
    auctioneerId = 'usr_auctioneer';
    bidOperatorId = 'usr_operator';

    const insertUser = db.prepare(`
      INSERT INTO users (id, email, passwordHash, name, role, active, createdAt)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);

    insertUser.run(
      superAdminId,
      'superadmin@vista.nmamit.in',
      hashPassword('vista2027'),
      'Vista Super Admin',
      ROLES.SUPER_ADMIN,
      now
    );

    insertUser.run(
      auctioneerId,
      'auctioneer@vista.nmamit.in',
      hashPassword('vista2027'),
      'Chief Auctioneer (Vista)',
      ROLES.AUCTIONEER,
      now
    );

    insertUser.run(
      bidOperatorId,
      'operator@vista.nmamit.in',
      hashPassword('vista2027'),
      'Lead Bid Operator (Vista)',
      ROLES.BID_OPERATOR,
      now
    );
  } else {
    superAdminId = db.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1").get()?.id;
    auctioneerId = db.prepare("SELECT id FROM users WHERE role = 'AUCTIONEER' LIMIT 1").get()?.id;
    bidOperatorId = db.prepare("SELECT id FROM users WHERE role = 'BID_OPERATOR' LIMIT 1").get()?.id;
  }

  // 2. Ensure default auctions exist
  const existingAuctions = db.prepare('SELECT COUNT(*) AS cnt FROM auctions').get();
  if (!existingAuctions || existingAuctions.cnt === 0) {
    const creator = { id: superAdminId, name: 'Vista Super Admin', role: ROLES.SUPER_ADMIN };

    // Primary Football Auction (Section 39)
    const fbTemplate = AUCTION_TEMPLATES.FOOTBALL_DEFAULT;
    const fbAuctionId = createAuctionInstance({
      id: 'auc_football_2027',
      name: fbTemplate.name,
      committeeName: fbTemplate.committeeName,
      currency: fbTemplate.currency,
      startingPurse: fbTemplate.startingPurse,
      maxRetentionsPerTeam: fbTemplate.maxRetentionsPerTeam,
      incrementRules: fbTemplate.incrementRules,
      pools: fbTemplate.pools,
      teams: fbTemplate.teams,
      items: fbTemplate.items,
      status: AUCTION_STATES.READY,
      createdByUser: creator
    });

    // Assign both Auctioneer and Bid Operator to Football Auction
    if (auctioneerId) {
      db.prepare(`
        INSERT OR IGNORE INTO auction_admins (id, auctionId, userId, role, assignedAt)
        VALUES (?, ?, ?, ?, ?)
      `).run('aa_fb_auctioneer', fbAuctionId, auctioneerId, ROLES.AUCTIONEER, now);
    }
    if (bidOperatorId) {
      db.prepare(`
        INSERT OR IGNORE INTO auction_admins (id, auctionId, userId, role, assignedAt)
        VALUES (?, ?, ?, ?, ?)
      `).run('aa_fb_operator', fbAuctionId, bidOperatorId, ROLES.BID_OPERATOR, now);
    }

    const fbTeams = db.prepare('SELECT id, name FROM teams WHERE auctionId = ?').all(fbAuctionId);
    const sampleRetentions = [
      { teamName: 'Real Madrid', playerName: 'Federico Valverde', amount: 65_000_000 },
      { teamName: 'Barcelona', playerName: 'Gavi', amount: 50_000_000 },
      { teamName: 'Manchester City', playerName: 'Phil Foden', amount: 75_000_000 },
      { teamName: 'Arsenal', playerName: 'Martin Ødegaard', amount: 70_000_000 },
      { teamName: 'Bayern Munich', playerName: 'Joshua Kimmich', amount: 60_000_000 }
    ];
    sampleRetentions.forEach((sr, idx) => {
      const team = fbTeams.find(t => t.name === sr.teamName);
      if (team) {
        db.prepare(`
          INSERT INTO retentions (id, auctionId, teamId, playerName, amount, imageUrl, createdByUserId, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `ret_fb_${idx + 1}`,
          fbAuctionId,
          team.id,
          sr.playerName,
          sr.amount,
          generateItemSvgDataUri({ name: sr.playerName, pool: 'RETENTION' }),
          superAdminId,
          now,
          now
        );
        // Retained player cannot be in auction items
        db.prepare('DELETE FROM items WHERE auctionId = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))').run(
          fbAuctionId,
          sr.playerName
        );
      }
    });
    db.prepare('UPDATE auctions SET retentionsPublished = 1 WHERE id = ?').run(fbAuctionId);
    recalculateAllAuctionPurses(fbAuctionId);

    // Secondary IPL Mega Auction 2027 instance
    const iplTemplate = AUCTION_TEMPLATES.IPL_2027;
    const iplAuctionId = createAuctionInstance({
      id: 'auc_ipl_2027',
      name: iplTemplate.name,
      committeeName: iplTemplate.committeeName,
      currency: iplTemplate.currency,
      startingPurse: iplTemplate.startingPurse,
      maxRetentionsPerTeam: iplTemplate.maxRetentionsPerTeam,
      maxRtmPerTeam: iplTemplate.maxRtmPerTeam || 2,
      incrementRules: iplTemplate.incrementRules,
      pools: iplTemplate.pools,
      teams: iplTemplate.teams,
      items: iplTemplate.items,
      status: AUCTION_STATES.DRAFT,
      createdByUser: creator
    });

    if (auctioneerId) {
      db.prepare(`
        INSERT OR IGNORE INTO auction_admins (id, auctionId, userId, role, assignedAt)
        VALUES (?, ?, ?, ?, ?)
      `).run('aa_ipl_auctioneer', iplAuctionId, auctioneerId, ROLES.AUCTIONEER, now);
    }
    if (bidOperatorId) {
      db.prepare(`
        INSERT OR IGNORE INTO auction_admins (id, auctionId, userId, role, assignedAt)
        VALUES (?, ?, ?, ?, ?)
      `).run('aa_ipl_operator', iplAuctionId, bidOperatorId, ROLES.BID_OPERATOR, now);
    }

    // Tertiary Storage Wars Auction instance
    const swTemplate = AUCTION_TEMPLATES.STORAGE_WARS;
    const swAuctionId = createAuctionInstance({
      id: 'auc_storage_2027',
      name: swTemplate.name,
      committeeName: swTemplate.committeeName,
      currency: swTemplate.currency,
      startingPurse: swTemplate.startingPurse,
      maxRetentionsPerTeam: swTemplate.maxRetentionsPerTeam,
      incrementRules: swTemplate.incrementRules,
      pools: swTemplate.pools,
      teams: swTemplate.teams,
      items: swTemplate.items,
      status: AUCTION_STATES.DRAFT,
      createdByUser: creator
    });

    if (auctioneerId) {
      db.prepare(`
        INSERT OR IGNORE INTO auction_admins (id, auctionId, userId, role, assignedAt)
        VALUES (?, ?, ?, ?, ?)
      `).run('aa_sw_auctioneer', swAuctionId, auctioneerId, ROLES.AUCTIONEER, now);
    }
  }

  // Ensure Kochi Tuskers Kerala and Pune Warriors India are present across all IPL auctions
  try {
    const allAuctions = db.prepare('SELECT * FROM auctions').all();
    for (const auc of allAuctions) {
      if (isIplAuction(auc)) {
        syncIplTeams(auc.id);
      }
    }
  } catch (err) {
    console.error('Error syncing IPL teams:', err);
  }
}

export function syncIplTeams(auctionId) {
  const iplTeams = [
    {
      name: 'Kochi Tuskers Kerala',
      code: 'KTK',
      shortName: 'KTK',
      pin: '2011',
      primaryColor: '#6B2D5C',
      secondaryColor: '#FF6B00',
      logoUrl: 'https://upload.wikimedia.org/wikipedia/en/2/20/Kochi_Tuskers_Kerala_Logo.png'
    },
    {
      name: 'Pune Warriors India',
      code: 'PWI',
      shortName: 'PWI',
      pin: '2012',
      primaryColor: '#004B87',
      secondaryColor: '#41B6E6',
      logoUrl: 'https://upload.wikimedia.org/wikipedia/en/3/30/Pune_Warriors_India_IPL_Team_Logo.svg'
    }
  ];

  const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
  if (!auction) return;
  const purse = auction.startingPurse || 1_200_000_000;
  const now = new Date().toISOString();

  for (const t of iplTeams) {
    const existing = db
      .prepare('SELECT id FROM teams WHERE auctionId = ? AND (LOWER(name) = ? OR LOWER(code) = ?)')
      .get(auctionId, t.name.toLowerCase(), t.code.toLowerCase());

    if (!existing) {
      const maxSort = db
        .prepare('SELECT COALESCE(MAX(sortOrder), 0) AS maxSort FROM teams WHERE auctionId = ?')
        .get(auctionId);
      const nextSort = (maxSort?.maxSort || 0) + 1;
      const teamId = uid('team');

      db.prepare(`
        INSERT INTO teams (
          id, auctionId, name, shortName, code, pin, logoUrl,
          primaryColor, secondaryColor, startingPurse, remainingPurse,
          disabled, sortOrder, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        teamId,
        auctionId,
        t.name,
        t.shortName,
        t.code,
        t.pin,
        t.logoUrl,
        t.primaryColor,
        t.secondaryColor,
        purse,
        purse,
        nextSort,
        now
      );
    }
  }
}

if (process.argv.includes('--reset')) {
  ensureSeedData({ forceReset: true });
  console.log('Database reset and seeded with default Vista Presents The Verdict auctions.');
}
