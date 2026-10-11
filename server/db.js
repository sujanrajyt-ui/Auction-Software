import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  AUCTION_STATES,
  ROLES,
  PREDEFINED_CURRENCIES,
  BUILTIN_LOGOS,
  calculateNextBid,
  getIncrementForAmount,
  normalizePlayerName
} from '../shared/constants.js';

const DEFAULT_DATA_DIR = process.env.VERCEL
  ? '/tmp/verdict-data'
  : path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(DEFAULT_DATA_DIR, 'verdict.sqlite');
const DATA_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

// Configure SQLite for high concurrency & strict foreign key integrity
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
`);

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auction_admins (
      id TEXT PRIMARY KEY,
      auctionId TEXT NOT NULL,
      userId TEXT NOT NULL,
      role TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      UNIQUE(auctionId, userId),
      FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE CASCADE,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      valueJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auctions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      committeeName TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      startingPurse INTEGER NOT NULL DEFAULT 1000000000,
      maxRetentionsPerTeam INTEGER NOT NULL DEFAULT 3,
      maxRtmPerTeam INTEGER NOT NULL DEFAULT 0,
      incrementRulesJson TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      retentionsPublished INTEGER NOT NULL DEFAULT 0,
      activeItemId TEXT,
      projectorOverlayJson TEXT,
      reopenedCount INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      auctionId TEXT NOT NULL,
      name TEXT NOT NULL,
      shortName TEXT NOT NULL,
      code TEXT NOT NULL,
      pin TEXT NOT NULL,
      logoUrl TEXT NOT NULL,
      primaryColor TEXT NOT NULL DEFAULT '#034694',
      secondaryColor TEXT NOT NULL DEFAULT '#DBA111',
      startingPurse INTEGER NOT NULL,
      remainingPurse INTEGER NOT NULL,
      rtmCardsTotal INTEGER DEFAULT NULL,
      disabled INTEGER NOT NULL DEFAULT 0,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pools (
      id TEXT PRIMARY KEY,
      auctionId TEXT NOT NULL,
      name TEXT NOT NULL,
      defaultBasePrice INTEGER NOT NULL DEFAULT 10000000,
      isLegendPool INTEGER NOT NULL DEFAULT 0,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      auctionId TEXT NOT NULL,
      name TEXT NOT NULL,
      imageUrl TEXT NOT NULL,
      basePrice INTEGER NOT NULL,
      originalBasePrice INTEGER NOT NULL,
      poolId TEXT,
      poolName TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'QUEUED',
      queueOrder INTEGER NOT NULL DEFAULT 0,
      currentBid INTEGER NOT NULL DEFAULT 0,
      highestBidderTeamId TEXT,
      soldToTeamId TEXT,
      soldAmount INTEGER,
      soldAt TEXT,
      soldViaRtm INTEGER NOT NULL DEFAULT 0,
      reauctionCount INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bids (
      id TEXT PRIMARY KEY,
      auctionId TEXT NOT NULL,
      itemId TEXT NOT NULL,
      teamId TEXT NOT NULL,
      amount INTEGER NOT NULL,
      placedByUserId TEXT,
      placedByName TEXT NOT NULL,
      placedByRole TEXT NOT NULL,
      isOverride INTEGER NOT NULL DEFAULT 0,
      undone INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE CASCADE,
      FOREIGN KEY(itemId) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY(teamId) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS retentions (
      id TEXT PRIMARY KEY,
      auctionId TEXT NOT NULL,
      teamId TEXT NOT NULL,
      playerName TEXT NOT NULL,
      amount INTEGER NOT NULL,
      imageUrl TEXT,
      createdByUserId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE CASCADE,
      FOREIGN KEY(teamId) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS purse_adjustments (
      id TEXT PRIMARY KEY,
      auctionId TEXT NOT NULL,
      teamId TEXT NOT NULL,
      amount INTEGER NOT NULL,
      previousPurse INTEGER NOT NULL,
      newPurse INTEGER NOT NULL,
      reason TEXT NOT NULL,
      adminId TEXT,
      adminName TEXT NOT NULL,
      adminRole TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE CASCADE,
      FOREIGN KEY(teamId) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sales_history (
      id TEXT PRIMARY KEY,
      auctionId TEXT NOT NULL,
      itemId TEXT NOT NULL,
      itemName TEXT NOT NULL,
      poolName TEXT NOT NULL,
      eventType TEXT NOT NULL,
      teamId TEXT,
      teamName TEXT,
      amount INTEGER,
      reauctionNumber INTEGER NOT NULL DEFAULT 0,
      adminName TEXT NOT NULL,
      adminRole TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      auctionId TEXT,
      timestamp TEXT NOT NULL,
      userId TEXT,
      userName TEXT NOT NULL,
      userRole TEXT NOT NULL,
      action TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT,
      entityName TEXT,
      previousValueJson TEXT,
      newValueJson TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_teams_auction ON teams(auctionId);
    CREATE INDEX IF NOT EXISTS idx_items_auction ON items(auctionId, queueOrder);
    CREATE INDEX IF NOT EXISTS idx_bids_item ON bids(itemId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_retentions_auction ON retentions(auctionId, teamId);
    CREATE INDEX IF NOT EXISTS idx_audit_auction ON audit_logs(auctionId, timestamp DESC);
  `);

  // Safe schema migrations for existing SQLite files
  try {
    db.exec('ALTER TABLE auctions ADD COLUMN maxRtmPerTeam INTEGER NOT NULL DEFAULT 0');
  } catch {
    // Column already exists
  }
  try {
    db.exec('ALTER TABLE teams ADD COLUMN rtmCardsTotal INTEGER DEFAULT NULL');
  } catch {
    // Column already exists
  }
  try {
    db.exec('ALTER TABLE items ADD COLUMN soldViaRtm INTEGER NOT NULL DEFAULT 0');
  } catch {
    // Column already exists
  }

  // Ensure existing IPL auctions default to 2 RTM cards per team if not yet set
  try {
    db.exec(`
      UPDATE auctions
      SET maxRtmPerTeam = 2
      WHERE maxRtmPerTeam = 0 AND (currency = 'INR' OR LOWER(name) LIKE '%ipl%')
    `);
  } catch {
    // Ignore
  }

  // Clean up any legacy retention labels and enforce that retained players are removed from auction items
  try {
    const allRets = db.prepare('SELECT id, auctionId, playerName FROM retentions').all();
    for (const r of allRets) {
      const cleaned = String(r.playerName || '')
        .replace(/\(Retained[^)]*\)/gi, '')
        .replace(/\(La Masia[^)]*\)/gi, '')
        .replace(/\(Club[^)]*\)/gi, '')
        .replace(/\(Captain[^)]*\)/gi, '')
        .replace(/\(Core[^)]*\)/gi, '')
        .trim();
      if (cleaned && cleaned !== r.playerName) {
        db.prepare('UPDATE retentions SET playerName = ? WHERE id = ?').run(cleaned, r.id);
      }
      const norm = normalizePlayerName(cleaned || r.playerName);
      if (norm) {
        const auctionItems = db
          .prepare("SELECT id, name, status FROM items WHERE auctionId = ? AND status != 'SOLD'")
          .all(r.auctionId);
        for (const it of auctionItems) {
          if (normalizePlayerName(it.name) === norm) {
            db.prepare('DELETE FROM items WHERE id = ?').run(it.id);
          }
        }
      }
    }
  } catch {
    // Ignore
  }
}

export function hashPassword(password) {
  return crypto.createHash('sha256').update(`vista_verdict_salt_${password}`).digest('hex');
}

export function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
}

/**
 * Execute a callback inside an atomic SQLite transaction (BEGIN IMMEDIATE ... COMMIT).
 * Prevents any race conditions between Auctioneer and Bid Operator.
 */
let inTransaction = false;
export function runTransaction(fn) {
  if (inTransaction) {
    return fn();
  }
  db.exec('BEGIN IMMEDIATE');
  inTransaction = true;
  try {
    const result = fn();
    db.exec('COMMIT');
    inTransaction = false;
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback error
    }
    inTransaction = false;
    throw err;
  }
}

/**
 * Append an immutable Audit Log entry (Section 31)
 */
export function recordAudit({
  auctionId = null,
  user = null,
  action,
  entityType,
  entityId = null,
  entityName = null,
  previousValue = null,
  newValue = null
}) {
  const id = uid('aud');
  const timestamp = new Date().toISOString();
  const userId = user?.id || 'system';
  const userName = user?.name || user?.email || 'System';
  const userRole = user?.auctionRole || user?.role || 'SYSTEM';

  const stmt = db.prepare(`
    INSERT INTO audit_logs (
      id, auctionId, timestamp, userId, userName, userRole,
      action, entityType, entityId, entityName, previousValueJson, newValueJson
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    auctionId,
    timestamp,
    userId,
    userName,
    userRole,
    action,
    entityType,
    entityId ? String(entityId) : null,
    entityName ? String(entityName) : null,
    previousValue !== undefined && previousValue !== null ? JSON.stringify(previousValue) : null,
    newValue !== undefined && newValue !== null ? JSON.stringify(newValue) : null
  );

  return id;
}

/**
 * Deterministic Purse Engine (Sections 18, 25, 26, 41):
 * Recalculates and enforces exact remaining purse for a team or all teams in an auction.
 * Formula:
 *   remainingPurse = startingPurse + sum(manual purse_adjustments) - sum(retentions) - sum(SOLD items)
 */
export function recalculateTeamPurse(teamId) {
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) return null;

  const retRow = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM retentions WHERE teamId = ?')
    .get(teamId);
  const soldRow = db
    .prepare(
      "SELECT COALESCE(SUM(soldAmount), 0) AS total FROM items WHERE soldToTeamId = ? AND status = 'SOLD'"
    )
    .get(teamId);
  const adjRow = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM purse_adjustments WHERE teamId = ?')
    .get(teamId);

  const retentionsSpent = Number(retRow?.total) || 0;
  const purchasesSpent = Number(soldRow?.total) || 0;
  const manualAdjustments = Number(adjRow?.total) || 0;

  const exactRemaining =
    Number(team.startingPurse) + manualAdjustments - retentionsSpent - purchasesSpent;

  db.prepare('UPDATE teams SET remainingPurse = ? WHERE id = ?').run(exactRemaining, teamId);

  return {
    teamId,
    startingPurse: Number(team.startingPurse),
    manualAdjustments,
    retentionsSpent,
    purchasesSpent,
    totalSpent: retentionsSpent + purchasesSpent,
    remainingPurse: exactRemaining
  };
}

export function recalculateAllAuctionPurses(auctionId) {
  const teams = db.prepare('SELECT id FROM teams WHERE auctionId = ?').all(auctionId);
  for (const t of teams) {
    recalculateTeamPurse(t.id);
  }
}

/**
 * Platform settings helpers (Currencies & Built-in Logo Library extensions)
 */
export function getPlatformSettings() {
  const rows = db.prepare('SELECT key, valueJson FROM platform_settings').all();
  const map = {};
  for (const r of rows) {
    try {
      map[r.key] = JSON.parse(r.valueJson);
    } catch {
      map[r.key] = null;
    }
  }

  const enabledCurrencyCodes = map.enabledCurrencies || Object.keys(PREDEFINED_CURRENCIES);
  const currencies = Object.values(PREDEFINED_CURRENCIES).map(c => ({
    ...c,
    enabled: enabledCurrencyCodes.includes(c.code)
  }));

  const customLogos = Array.isArray(map.customLogos) ? map.customLogos : [];
  const logoLibrary = [...customLogos, ...BUILTIN_LOGOS];

  return {
    platformName: map.platformName || 'VISTA PRESENTS THE VERDICT',
    institution: map.institution || 'NMAMIT',
    currencies,
    customLogos,
    logoLibrary
  };
}

export function setPlatformSetting(key, value) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO platform_settings (key, valueJson, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET valueJson = excluded.valueJson, updatedAt = excluded.updatedAt
  `).run(key, JSON.stringify(value), now);
}

/**
 * Hydrate complete, authoritative state for a single auction.
 * Supports filtering private retentions for unauthenticated/team views before publishing.
 */
export function getHydratedAuction(auctionId, options = { includePrivateRetentions: true, includeTeamPins: false }) {
  const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
  if (!auction) return null;

  recalculateAllAuctionPurses(auctionId);

  const incrementRules = (() => {
    try {
      return JSON.parse(auction.incrementRulesJson || '[]');
    } catch {
      return [];
    }
  })();

  const projectorOverlay = (() => {
    try {
      return auction.projectorOverlayJson ? JSON.parse(auction.projectorOverlayJson) : null;
    } catch {
      return null;
    }
  })();

  const pools = db
    .prepare('SELECT * FROM pools WHERE auctionId = ? ORDER BY sortOrder ASC, createdAt ASC')
    .all(auctionId)
    .map(p => ({
      ...p,
      isLegendPool: Boolean(p.isLegendPool)
    }));

  const rawTeams = db
    .prepare('SELECT * FROM teams WHERE auctionId = ? ORDER BY sortOrder ASC, createdAt ASC')
    .all(auctionId);

  const allItems = db
    .prepare('SELECT * FROM items WHERE auctionId = ? ORDER BY queueOrder ASC, createdAt ASC')
    .all(auctionId);

  const rawRetentions = db
    .prepare('SELECT * FROM retentions WHERE auctionId = ? ORDER BY createdAt ASC')
    .all(auctionId);

  const shouldShowRetentions =
    options.includePrivateRetentions ||
    Boolean(auction.retentionsPublished) ||
    auction.status === AUCTION_STATES.LIVE ||
    auction.status === AUCTION_STATES.PAUSED ||
    auction.status === AUCTION_STATES.COMPLETED;

  const retentions = shouldShowRetentions ? rawRetentions : [];

  const purseAdjustments = db
    .prepare('SELECT * FROM purse_adjustments WHERE auctionId = ? ORDER BY createdAt DESC')
    .all(auctionId);

  const assignedAdmins = db
    .prepare(`
      SELECT aa.id, aa.auctionId, aa.userId, aa.role, aa.assignedAt, u.name, u.email
      FROM auction_admins aa
      JOIN users u ON u.id = aa.userId
      WHERE aa.auctionId = ?
      ORDER BY aa.assignedAt ASC
    `)
    .all(auctionId);

  // Build rich team objects with purchases, retentions, and exact spending breakdown
  const teamsMap = new Map();
  const teams = rawTeams.map(t => {
    const teamRetentions = retentions
      .filter(r => r.teamId === t.id)
      .map(r => ({
        ...r,
        type: 'RETENTION'
      }));
    const allTeamRetentionsForMath = rawRetentions.filter(r => r.teamId === t.id);
    const retentionSpend = allTeamRetentionsForMath.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

    const purchasedItems = allItems
      .filter(i => i.soldToTeamId === t.id && i.status === 'SOLD')
      .sort((a, b) => (b.soldAt || '').localeCompare(a.soldAt || ''))
      .map(i => ({
        id: i.id,
        name: i.name,
        imageUrl: i.imageUrl,
        basePrice: i.basePrice,
        poolName: i.poolName,
        amount: i.soldAmount,
        soldAt: i.soldAt,
        soldViaRtm: Boolean(i.soldViaRtm),
        type: 'PURCHASE'
      }));

    const purchaseSpend = purchasedItems.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
    const totalSpent = retentionSpend + purchaseSpend;

    const rtmTotal =
      t.rtmCardsTotal !== null && t.rtmCardsTotal !== undefined
        ? Number(t.rtmCardsTotal)
        : Number(auction.maxRtmPerTeam) || 0;
    const rtmUsed = purchasedItems.filter(p => p.soldViaRtm).length;
    const rtmRemaining = Math.max(0, rtmTotal - rtmUsed);

    const teamObj = {
      id: t.id,
      auctionId: t.auctionId,
      name: t.name,
      shortName: t.shortName,
      code: t.code,
      ...(options.includeTeamPins ? { pin: t.pin } : {}),
      logoUrl: t.logoUrl,
      primaryColor: t.primaryColor,
      secondaryColor: t.secondaryColor,
      startingPurse: Number(t.startingPurse),
      remainingPurse: Number(t.remainingPurse),
      retentionSpend,
      purchaseSpend,
      totalSpent,
      retentionsCount: allTeamRetentionsForMath.length,
      purchasesCount: purchasedItems.length,
      squadCount: allTeamRetentionsForMath.length + purchasedItems.length,
      rtmTotal,
      rtmUsed,
      rtmRemaining,
      retentions: teamRetentions,
      purchases: purchasedItems,
      disabled: Boolean(t.disabled),
      sortOrder: t.sortOrder
    };
    teamsMap.set(t.id, teamObj);
    return teamObj;
  });

  // Determine active item and its bid history
  let activeItem = null;
  if (auction.activeItemId) {
    activeItem = allItems.find(i => i.id === auction.activeItemId) || null;
  }
  if (!activeItem) {
    activeItem = allItems.find(i => i.status === 'ACTIVE') || null;
  }

  let activeItemBids = [];
  if (activeItem) {
    activeItemBids = db
      .prepare(`
        SELECT b.*, t.name AS teamName, t.shortName AS teamShortName, t.logoUrl AS teamLogoUrl, t.primaryColor AS teamPrimaryColor
        FROM bids b
        JOIN teams t ON t.id = b.teamId
        WHERE b.itemId = ? AND b.undone = 0
        ORDER BY b.amount DESC, b.createdAt DESC
      `)
      .all(activeItem.id);
  }

  const highestBidderTeam =
    activeItem && activeItem.highestBidderTeamId
      ? teamsMap.get(activeItem.highestBidderTeamId) || null
      : null;

  const nextBidAmount = activeItem ? calculateNextBid(activeItem, incrementRules) : 0;
  const currentIncrement = activeItem
    ? getIncrementForAmount(
        activeItem.highestBidderTeamId ? activeItem.currentBid : activeItem.basePrice,
        incrementRules
      )
    : 0;

  const queuedItems = allItems.filter(i => i.status === 'QUEUED');
  const soldItems = allItems
    .filter(i => i.status === 'SOLD')
    .map(i => ({
      ...i,
      soldViaRtm: Boolean(i.soldViaRtm),
      soldToTeam: teamsMap.get(i.soldToTeamId) || null
    }))
    .sort((a, b) => (b.soldAt || '').localeCompare(a.soldAt || ''));

  const unsoldItems = allItems.filter(
    i => i.status === 'UNSOLD' || i.status === 'PERMANENTLY_UNSOLD'
  );

  const salesHistory = db
    .prepare('SELECT * FROM sales_history WHERE auctionId = ? ORDER BY createdAt DESC LIMIT 200')
    .all(auctionId);

  const auditLogs = db
    .prepare('SELECT * FROM audit_logs WHERE auctionId = ? ORDER BY timestamp DESC LIMIT 300')
    .all(auctionId)
    .map(l => ({
      ...l,
      previousValue: l.previousValueJson ? JSON.parse(l.previousValueJson) : null,
      newValue: l.newValueJson ? JSON.parse(l.newValueJson) : null
    }));

  return {
    id: auction.id,
    name: auction.name,
    committeeName: auction.committeeName,
    currency: auction.currency,
    currencyMeta: PREDEFINED_CURRENCIES[auction.currency] || PREDEFINED_CURRENCIES.EUR,
    startingPurse: Number(auction.startingPurse),
    maxRetentionsPerTeam: Number(auction.maxRetentionsPerTeam),
    maxRtmPerTeam: Number(auction.maxRtmPerTeam) || 0,
    incrementRules,
    status: auction.status,
    retentionsPublished: Boolean(auction.retentionsPublished),
    reopenedCount: Number(auction.reopenedCount) || 0,
    activeItemId: activeItem?.id || null,
    activeItem: activeItem
      ? {
          ...activeItem,
          highestBidderTeam,
          nextBidAmount,
          currentIncrement,
          bids: activeItemBids
        }
      : null,
    projectorOverlay,
    pools,
    teams,
    items: allItems.map(i => ({
      ...i,
      soldToTeam: i.soldToTeamId ? teamsMap.get(i.soldToTeamId) || null : null,
      highestBidderTeam: i.highestBidderTeamId ? teamsMap.get(i.highestBidderTeamId) || null : null
    })),
    queue: queuedItems,
    soldItems,
    unsoldItems,
    retentions,
    purseAdjustments,
    salesHistory,
    auditLogs,
    assignedAdmins,
    stats: {
      totalItems: allItems.length,
      queuedCount: queuedItems.length,
      soldCount: soldItems.length,
      unsoldCount: unsoldItems.length,
      totalAuctionSpend: teams.reduce((s, t) => s + t.totalSpent, 0)
    },
    createdAt: auction.createdAt,
    updatedAt: auction.updatedAt
  };
}
