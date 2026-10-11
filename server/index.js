import dns from 'node:dns';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import {
  db,
  initSchema,
  hashPassword,
  uid,
  runTransaction,
  recordAudit,
  recalculateTeamPurse,
  recalculateAllAuctionPurses,
  getPlatformSettings,
  setPlatformSetting,
  getHydratedAuction
} from './db.js';
import { ensureSeedData, createAuctionInstance } from './seed.js';
import { resolveItemImage, resolveTeamIdentity } from './imageResolver.js';
import { syncFromNeonIfNeeded, syncToNeon, isNeonEnabled } from './neonSync.js';
import {
  AUCTION_STATES,
  ROLES,
  PREDEFINED_CURRENCIES,
  AUCTION_TEMPLATES,
  calculateNextBid,
  getIncrementForAmount,
  formatCurrency,
  normalizePlayerName
} from '../shared/constants.js';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore if unsupported
}

function findRetentionByPlayerName(auctionId, playerName, excludeRetentionId = null) {
  const norm = normalizePlayerName(playerName);
  if (!norm) return null;
  const rows = db
    .prepare('SELECT * FROM retentions WHERE auctionId = ?')
    .all(auctionId);
  return (
    rows.find(
      r => r.id !== excludeRetentionId && normalizePlayerName(r.playerName) === norm
    ) || null
  );
}

function removeRetainedPlayerFromAuctionItems(auctionId, playerName) {
  const norm = normalizePlayerName(playerName);
  if (!norm) return 0;
  const items = db
    .prepare("SELECT id, name, status FROM items WHERE auctionId = ? AND status != 'SOLD'")
    .all(auctionId);
  let removed = 0;
  for (const it of items) {
    if (normalizePlayerName(it.name) === norm) {
      db.prepare('DELETE FROM items WHERE id = ?').run(it.id);
      removed++;
    }
  }
  return removed;
}

// Initialize DB & seed default data if needed
initSchema();
ensureSeedData({ forceReset: false });

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Neon PostgreSQL synchronization middleware (active whenever DATABASE_URL is set)
app.use('/api', async (req, res, next) => {
  if (isNeonEnabled()) {
    await syncFromNeonIfNeeded();
    const origJson = res.json.bind(res);
    res.json = async body => {
      if (req.method !== 'GET' || req._didMutateDb) {
        await syncToNeon();
      }
      return origJson(body);
    };
  }
  next();
});

// Active session store (in-memory + deterministic HMAC token so restarts don't log users out!)
const SECRET_SALT = 'vista_verdict_2027_nmamit_secret';

function createToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = hashPassword(`${data}.${SECRET_SALT}`);
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = hashPassword(`${data}.${SECRET_SALT}`);
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// Track active 3-second SOLD/UNSOLD auto-advance timers per auction
const auctionTransitionTimers = new Map();

function clearAuctionTimer(auctionId) {
  const existing = auctionTransitionTimers.get(auctionId);
  if (existing) {
    clearTimeout(existing);
    auctionTransitionTimers.delete(auctionId);
  }
}

/**
 * Broadcast real-time auction state to all connected screens (Admins, Teams, Projectors)
 * Ensures Team/Public screens only see private retentions after publishing or LIVE.
 */
function broadcastAuctionState(auctionId, extraEvent = null) {
  const adminState = getHydratedAuction(auctionId, {
    includePrivateRetentions: true,
    includeTeamPins: true
  });
  const publicState = getHydratedAuction(auctionId, {
    includePrivateRetentions: false,
    includeTeamPins: false
  });

  if (!adminState) {
    io.to(`auction:${auctionId}:admin`).emit('auction:deleted', { auctionId });
    io.to(`auction:${auctionId}:public`).emit('auction:deleted', { auctionId });
    io.emit('platform:updated');
    return;
  }

  io.to(`auction:${auctionId}:admin`).emit('auction:state', adminState);
  io.to(`auction:${auctionId}:public`).emit('auction:state', publicState);

  if (extraEvent) {
    io.to(`auction:${auctionId}:admin`).emit('auction:event', extraEvent);
    io.to(`auction:${auctionId}:public`).emit('auction:event', extraEvent);
  }

  io.emit('platform:updated');
}

/**
 * Advance to the next item in the queue (used after 3-second SOLD/UNSOLD screen or SKIP)
 * Automatically marks the auction COMPLETED if the queue is exhausted (Section 9).
 */
function advanceToNextItem(auctionId, user = null) {
  clearAuctionTimer(auctionId);

  let soundEvent = null;
  runTransaction(() => {
    const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
    if (!auction) return;

    const now = new Date().toISOString();

    // Clear projector overlay
    db.prepare('UPDATE auctions SET projectorOverlayJson = NULL, updatedAt = ? WHERE id = ?').run(
      now,
      auctionId
    );

    if (auction.status !== AUCTION_STATES.LIVE) {
      return;
    }

    // Find next queued item in queueOrder
    const nextItem = db
      .prepare(
        "SELECT * FROM items WHERE auctionId = ? AND status = 'QUEUED' ORDER BY queueOrder ASC, createdAt ASC LIMIT 1"
      )
      .get(auctionId);

    if (nextItem) {
      db.prepare(
        "UPDATE items SET status = 'ACTIVE', currentBid = 0, highestBidderTeamId = NULL, updatedAt = ? WHERE id = ?"
      ).run(now, nextItem.id);

      db.prepare('UPDATE auctions SET activeItemId = ?, updatedAt = ? WHERE id = ?').run(
        nextItem.id,
        now,
        auctionId
      );

      recordAudit({
        auctionId,
        user,
        action: 'Item started',
        entityType: 'ITEM',
        entityId: nextItem.id,
        entityName: nextItem.name,
        previousValue: { status: 'QUEUED' },
        newValue: { status: 'ACTIVE', basePrice: nextItem.basePrice, poolName: nextItem.poolName }
      });

      soundEvent = { type: 'ITEM_STARTED', sound: 'AUCTION_START', itemId: nextItem.id, itemName: nextItem.name };
    } else {
      // Queue is exhausted -> Automatically mark auction COMPLETED (Section 9)
      db.prepare(
        'UPDATE auctions SET status = ?, activeItemId = NULL, updatedAt = ? WHERE id = ?'
      ).run(AUCTION_STATES.COMPLETED, now, auctionId);

      recordAudit({
        auctionId,
        user,
        action: 'Auction completed',
        entityType: 'AUCTION',
        entityId: auctionId,
        entityName: auction.name,
        previousValue: { status: auction.status },
        newValue: { status: AUCTION_STATES.COMPLETED, reason: 'Queue exhausted' }
      });

      soundEvent = { type: 'AUCTION_COMPLETED', sound: 'TRANSITION' };
    }
  });

  broadcastAuctionState(auctionId, soundEvent);
}

// Authentication Middlewares
function extractUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;

  if (payload.kind === 'ADMIN') {
    const user = db.prepare('SELECT id, email, name, role, active FROM users WHERE id = ?').get(payload.userId);
    if (!user || !user.active) return null;
    return { ...user, kind: 'ADMIN' };
  }

  if (payload.kind === 'TEAM') {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(payload.teamId);
    if (!team || team.disabled) return null;
    return {
      kind: 'TEAM',
      id: team.id,
      teamId: team.id,
      auctionId: team.auctionId,
      name: team.name,
      code: team.code,
      role: ROLES.TEAM
    };
  }

  return null;
}

function requireAdmin(req, res, next) {
  const user = extractUser(req);
  if (!user || user.kind !== 'ADMIN') {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }
  req.user = user;
  next();
}

function requireSuperAdmin(req, res, next) {
  const user = extractUser(req);
  if (!user || user.kind !== 'ADMIN' || user.role !== ROLES.SUPER_ADMIN) {
    return res.status(403).json({ error: 'Super Admin authorization required.' });
  }
  req.user = user;
  req.user.auctionRole = ROLES.SUPER_ADMIN;
  next();
}

function requireAuctionAdmin(req, res, next) {
  const user = extractUser(req);
  if (!user || user.kind !== 'ADMIN') {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }
  const { auctionId } = req.params;
  if (user.role === ROLES.SUPER_ADMIN) {
    req.user = { ...user, auctionRole: ROLES.SUPER_ADMIN };
    return next();
  }

  const assignment = db
    .prepare('SELECT role FROM auction_admins WHERE auctionId = ? AND userId = ?')
    .get(auctionId, user.id);

  if (!assignment) {
    return res
      .status(403)
      .json({ error: 'Access denied: You are not assigned as an administrator for this auction.' });
  }

  req.user = { ...user, auctionRole: assignment.role };
  next();
}

// ============================================================================
// 1. AUTHENTICATION ENDPOINTS
// ============================================================================

app.post('/api/auth/admin-login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const user = db
    .prepare('SELECT * FROM users WHERE LOWER(email) = ?')
    .get(cleanEmail);

  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (!user.active) {
    return res.status(403).json({ error: 'This administrator account has been disabled.' });
  }

  const assignments = db
    .prepare('SELECT auctionId, role FROM auction_admins WHERE userId = ?')
    .all(user.id);

  recordAudit({
    auctionId: assignments[0]?.auctionId || null,
    user: { id: user.id, name: user.name, role: user.role },
    action: 'Admin login',
    entityType: 'USER',
    entityId: user.id,
    entityName: user.email,
    previousValue: null,
    newValue: { role: user.role }
  });

  const token = createToken({
    kind: 'ADMIN',
    userId: user.id,
    role: user.role,
    iat: Date.now()
  });

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      kind: 'ADMIN',
      assignments
    }
  });
});

app.post('/api/auth/team-login', (req, res) => {
  const { auctionId, code, pin } = req.body || {};
  if (!code || !pin) {
    return res.status(400).json({ error: 'Team Code and PIN are required.' });
  }

  const cleanCode = String(code).trim().toUpperCase();
  const cleanPin = String(pin).trim();

  let team;
  if (auctionId) {
    team = db
      .prepare('SELECT * FROM teams WHERE auctionId = ? AND UPPER(code) = ? AND pin = ?')
      .get(auctionId, cleanCode, cleanPin);
  } else {
    team = db
      .prepare('SELECT * FROM teams WHERE UPPER(code) = ? AND pin = ?')
      .get(cleanCode, cleanPin);
  }

  if (!team) {
    return res.status(401).json({ error: 'Invalid Team Code or PIN.' });
  }

  if (team.disabled) {
    return res.status(403).json({ error: 'This team access has been disabled by the Committee Admin.' });
  }

  const token = createToken({
    kind: 'TEAM',
    teamId: team.id,
    auctionId: team.auctionId,
    code: team.code,
    iat: Date.now()
  });

  return res.json({
    token,
    user: {
      kind: 'TEAM',
      id: team.id,
      teamId: team.id,
      auctionId: team.auctionId,
      name: team.name,
      shortName: team.shortName,
      code: team.code,
      logoUrl: team.logoUrl,
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
      role: ROLES.TEAM
    }
  });
});

app.get('/api/auth/me', (req, res) => {
  const user = extractUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (user.kind === 'ADMIN') {
    const assignments = db
      .prepare('SELECT auctionId, role FROM auction_admins WHERE userId = ?')
      .all(user.id);
    return res.json({ user: { ...user, assignments } });
  }
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(user.teamId);
  return res.json({
    user: {
      ...user,
      logoUrl: team?.logoUrl,
      primaryColor: team?.primaryColor,
      secondaryColor: team?.secondaryColor
    }
  });
});

// ============================================================================
// 2. PUBLIC / SHARED DIRECTORY ENDPOINTS
// ============================================================================

app.get('/api/public/auctions', (req, res) => {
  const user = extractUser(req);
  const auctions = db
    .prepare('SELECT * FROM auctions ORDER BY createdAt DESC')
    .all();

  let assignedIds = null;
  if (user?.kind === 'ADMIN' && user.role !== ROLES.SUPER_ADMIN) {
    assignedIds = new Set(
      db
        .prepare('SELECT auctionId FROM auction_admins WHERE userId = ?')
        .all(user.id)
        .map(r => r.auctionId)
    );
  }

  const result = auctions.map(a => {
    const teamsCount = db
      .prepare('SELECT COUNT(*) AS cnt FROM teams WHERE auctionId = ?')
      .get(a.id)?.cnt || 0;
    const itemsCount = db
      .prepare('SELECT COUNT(*) AS cnt FROM items WHERE auctionId = ?')
      .get(a.id)?.cnt || 0;
    const soldCount = db
      .prepare("SELECT COUNT(*) AS cnt FROM items WHERE auctionId = ? AND status = 'SOLD'")
      .get(a.id)?.cnt || 0;

    return {
      id: a.id,
      name: a.name,
      committeeName: a.committeeName,
      currency: a.currency,
      startingPurse: Number(a.startingPurse),
      status: a.status,
      retentionsPublished: Boolean(a.retentionsPublished),
      teamsCount,
      itemsCount,
      soldCount,
      isAssigned: assignedIds ? assignedIds.has(a.id) : true,
      createdAt: a.createdAt
    };
  });

  res.json({
    auctions: result,
    settings: getPlatformSettings()
  });
});

app.get('/api/auctions/:auctionId', (req, res) => {
  const { auctionId } = req.params;
  const user = extractUser(req);

  // Serverless-friendly 3-second SOLD/UNSOLD overlay auto-advance check
  try {
    const rawAuction = db
      .prepare('SELECT status, projectorOverlayJson FROM auctions WHERE id = ?')
      .get(auctionId);
    if (rawAuction?.projectorOverlayJson) {
      const ov = JSON.parse(rawAuction.projectorOverlayJson);
      if (ov?.expiresAt && Date.now() >= Number(ov.expiresAt)) {
        clearAuctionTimer(auctionId);
        advanceToNextItem(auctionId, {
          id: 'system',
          name: 'System Auto-Advance',
          auctionRole: ROLES.AUCTIONEER
        });
        req._didMutateDb = true;
      }
    }
  } catch {
    // Ignore parse errors
  }

  let isAuthorizedAdmin = false;
  if (user?.kind === 'ADMIN') {
    if (user.role === ROLES.SUPER_ADMIN) {
      isAuthorizedAdmin = true;
    } else {
      const assigned = db
        .prepare('SELECT id FROM auction_admins WHERE auctionId = ? AND userId = ?')
        .get(auctionId, user.id);
      isAuthorizedAdmin = Boolean(assigned);
    }
  }

  const hydrated = getHydratedAuction(auctionId, {
    includePrivateRetentions: isAuthorizedAdmin,
    includeTeamPins: isAuthorizedAdmin
  });

  if (!hydrated) {
    return res.status(404).json({ error: 'Auction not found.' });
  }

  res.json({ auction: hydrated });
});

// ============================================================================
// 3. SUPER ADMIN PLATFORM MANAGEMENT ENDPOINTS (Section 2)
// ============================================================================

app.get('/api/platform/overview', requireSuperAdmin, (req, res) => {
  const admins = db
    .prepare('SELECT id, email, name, role, active, createdAt FROM users ORDER BY createdAt ASC')
    .all()
    .map(u => {
      const assignments = db
        .prepare(`
          SELECT aa.auctionId, aa.role, a.name AS auctionName
          FROM auction_admins aa
          JOIN auctions a ON a.id = aa.auctionId
          WHERE aa.userId = ?
        `)
        .all(u.id);
      return { ...u, active: Boolean(u.active), assignments };
    });

  const auctions = db
    .prepare('SELECT id FROM auctions ORDER BY createdAt DESC')
    .all()
    .map(a => getHydratedAuction(a.id, { includePrivateRetentions: true, includeTeamPins: true }));

  const globalAuditLogs = db
    .prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 250')
    .all()
    .map(l => ({
      ...l,
      previousValue: l.previousValueJson ? JSON.parse(l.previousValueJson) : null,
      newValue: l.newValueJson ? JSON.parse(l.newValueJson) : null
    }));

  res.json({
    admins,
    auctions,
    settings: getPlatformSettings(),
    auditLogs: globalAuditLogs
  });
});

app.post('/api/platform/admins', requireSuperAdmin, (req, res) => {
  const { name, email, password, role = ROLES.AUCTIONEER, auctionIds = [] } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const validRoles = [ROLES.SUPER_ADMIN, ROLES.AUCTIONEER, ROLES.BID_OPERATOR];
  const cleanRole = validRoles.includes(role) ? role : ROLES.AUCTIONEER;
  const cleanEmail = String(email).trim().toLowerCase();

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
  if (existing) {
    return res.status(400).json({ error: 'An administrator with this email already exists.' });
  }

  const userId = uid('usr');
  const now = new Date().toISOString();

  runTransaction(() => {
    db.prepare(`
      INSERT INTO users (id, email, passwordHash, name, role, active, createdAt)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(userId, cleanEmail, hashPassword(password), name.trim(), cleanRole, now);

    if (Array.isArray(auctionIds)) {
      for (const aId of auctionIds) {
        db.prepare(`
          INSERT OR IGNORE INTO auction_admins (id, auctionId, userId, role, assignedAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(uid('aa'), aId, userId, cleanRole === ROLES.SUPER_ADMIN ? ROLES.AUCTIONEER : cleanRole, now);
      }
    }

    recordAudit({
      user: req.user,
      action: 'Committee Admin created',
      entityType: 'USER',
      entityId: userId,
      entityName: name.trim(),
      previousValue: null,
      newValue: { email: cleanEmail, role: cleanRole, auctionIds }
    });
  });

  io.emit('platform:updated');
  res.json({ ok: true, userId });
});

app.patch('/api/platform/admins/:userId', requireSuperAdmin, (req, res) => {
  const { userId } = req.params;
  const { name, email, password, role, active } = req.body || {};
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!existing) {
    return res.status(404).json({ error: 'Admin user not found.' });
  }

  const updatedName = name !== undefined ? String(name).trim() : existing.name;
  const updatedEmail = email !== undefined ? String(email).trim().toLowerCase() : existing.email;
  const updatedRole = role !== undefined ? role : existing.role;
  const updatedActive = active !== undefined ? (active ? 1 : 0) : existing.active;
  const updatedHash = password ? hashPassword(password) : existing.passwordHash;

  db.prepare(`
    UPDATE users SET name = ?, email = ?, passwordHash = ?, role = ?, active = ? WHERE id = ?
  `).run(updatedName, updatedEmail, updatedHash, updatedRole, updatedActive, userId);

  recordAudit({
    user: req.user,
    action: 'Committee Admin edited',
    entityType: 'USER',
    entityId: userId,
    entityName: updatedName,
    previousValue: { name: existing.name, email: existing.email, role: existing.role, active: Boolean(existing.active) },
    newValue: { name: updatedName, email: updatedEmail, role: updatedRole, active: Boolean(updatedActive) }
  });

  io.emit('platform:updated');
  res.json({ ok: true });
});

app.delete('/api/platform/admins/:userId', requireSuperAdmin, (req, res) => {
  const { userId } = req.params;
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own Super Admin account.' });
  }
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!existing) {
    return res.status(404).json({ error: 'Admin not found.' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  recordAudit({
    user: req.user,
    action: 'Committee Admin deleted',
    entityType: 'USER',
    entityId: userId,
    entityName: existing.name,
    previousValue: { email: existing.email, role: existing.role },
    newValue: null
  });

  io.emit('platform:updated');
  res.json({ ok: true });
});

app.post('/api/platform/auctions/:auctionId/assign-admin', requireSuperAdmin, (req, res) => {
  const { auctionId } = req.params;
  const { userId, role = ROLES.AUCTIONEER } = req.body || {};
  const validRole = role === ROLES.BID_OPERATOR ? ROLES.BID_OPERATOR : ROLES.AUCTIONEER;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO auction_admins (id, auctionId, userId, role, assignedAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(auctionId, userId) DO UPDATE SET role = excluded.role
  `).run(uid('aa'), auctionId, userId, validRole, now);

  const u = db.prepare('SELECT name, email FROM users WHERE id = ?').get(userId);
  recordAudit({
    auctionId,
    user: req.user,
    action: 'Admin assigned to auction',
    entityType: 'USER',
    entityId: userId,
    entityName: u?.name || userId,
    previousValue: null,
    newValue: { auctionId, role: validRole }
  });

  broadcastAuctionState(auctionId);
  res.json({ ok: true });
});

app.delete('/api/platform/auctions/:auctionId/assign-admin/:userId', requireSuperAdmin, (req, res) => {
  const { auctionId, userId } = req.params;
  const u = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  db.prepare('DELETE FROM auction_admins WHERE auctionId = ? AND userId = ?').run(auctionId, userId);

  recordAudit({
    auctionId,
    user: req.user,
    action: 'Admin unassigned from auction',
    entityType: 'USER',
    entityId: userId,
    entityName: u?.name || userId,
    previousValue: { auctionId, userId },
    newValue: null
  });

  broadcastAuctionState(auctionId);
  res.json({ ok: true });
});

app.post('/api/platform/settings/currencies', requireSuperAdmin, (req, res) => {
  const { enabledCurrencies } = req.body || {};
  if (!Array.isArray(enabledCurrencies) || enabledCurrencies.length === 0) {
    return res.status(400).json({ error: 'At least one predefined currency must remain enabled.' });
  }
  const validCodes = enabledCurrencies.filter(c => Boolean(PREDEFINED_CURRENCIES[c]));
  if (validCodes.length === 0) {
    return res.status(400).json({ error: 'Currencies must come from the predefined currency list.' });
  }
  setPlatformSetting('enabledCurrencies', validCodes);
  recordAudit({
    user: req.user,
    action: 'Supported currencies updated',
    entityType: 'SETTINGS',
    entityId: 'enabledCurrencies',
    entityName: 'Supported Currencies',
    previousValue: null,
    newValue: validCodes
  });
  io.emit('platform:updated');
  res.json({ settings: getPlatformSettings() });
});

app.post('/api/platform/settings/logos', requireSuperAdmin, (req, res) => {
  const { name, shortName, category = 'Custom Organization', primaryColor = '#3B82F6', secondaryColor = '#F59E0B', logoUrl } = req.body || {};
  if (!name || !logoUrl) {
    return res.status(400).json({ error: 'Organization/Club Name and Logo URL are required.' });
  }
  const current = getPlatformSettings().customLogos || [];
  const newLogo = {
    id: uid('logo'),
    name: name.trim(),
    shortName: (shortName || name.slice(0, 3)).trim().toUpperCase(),
    category,
    primaryColor,
    secondaryColor,
    logoUrl,
    isCustom: true
  };
  const updated = [newLogo, ...current];
  setPlatformSetting('customLogos', updated);
  recordAudit({
    user: req.user,
    action: 'Logo added to built-in library',
    entityType: 'LOGO',
    entityId: newLogo.id,
    entityName: newLogo.name,
    previousValue: null,
    newValue: newLogo
  });
  io.emit('platform:updated');
  res.json({ settings: getPlatformSettings() });
});

app.delete('/api/platform/settings/logos/:logoId', requireSuperAdmin, (req, res) => {
  const { logoId } = req.params;
  const current = getPlatformSettings().customLogos || [];
  const updated = current.filter(l => l.id !== logoId);
  setPlatformSetting('customLogos', updated);
  io.emit('platform:updated');
  res.json({ settings: getPlatformSettings() });
});

// ============================================================================
// 4. AUCTION CREATION, DELETION, RESET & CONFIGURATION (Sections 8, 9, 10)
// ============================================================================

app.post('/api/auctions', requireAdmin, (req, res) => {
  const {
    templateId,
    name,
    committeeName,
    currency = 'EUR',
    startingPurse,
    maxRetentionsPerTeam,
    maxRtmPerTeam,
    incrementRules,
    pools,
    teams,
    items
  } = req.body || {};

  // Validate currency against fixed predefined list (Section 8)
  if (!PREDEFINED_CURRENCIES[currency]) {
    return res.status(400).json({ error: 'Selected currency is not in the predefined currency list.' });
  }

  const tpl = templateId && AUCTION_TEMPLATES[templateId] ? AUCTION_TEMPLATES[templateId] : AUCTION_TEMPLATES.CUSTOM_BLANK;

  const auctionName = (name || tpl.name || 'New Committee Auction').trim();
  const committee = (committeeName || tpl.committeeName || 'Vista Committee').trim();

  const auctionId = createAuctionInstance({
    name: auctionName,
    committeeName: committee,
    currency: currency || tpl.currency,
    startingPurse: startingPurse !== undefined ? Number(startingPurse) : tpl.startingPurse,
    maxRetentionsPerTeam:
      maxRetentionsPerTeam !== undefined ? Number(maxRetentionsPerTeam) : tpl.maxRetentionsPerTeam,
    maxRtmPerTeam:
      maxRtmPerTeam !== undefined ? Number(maxRtmPerTeam) : Number(tpl.maxRtmPerTeam) || 0,
    incrementRules: Array.isArray(incrementRules) && incrementRules.length > 0 ? incrementRules : tpl.incrementRules,
    pools: Array.isArray(pools) ? pools : tpl.pools,
    teams: Array.isArray(teams) ? teams : tpl.teams,
    items: Array.isArray(items) ? items : tpl.items,
    status: AUCTION_STATES.DRAFT,
    createdByUser: req.user
  });

  // If created by a Committee Admin, automatically assign them to this auction
  if (req.user.role !== ROLES.SUPER_ADMIN) {
    db.prepare(`
      INSERT OR IGNORE INTO auction_admins (id, auctionId, userId, role, assignedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(uid('aa'), auctionId, req.user.id, req.user.role, new Date().toISOString());
  }

  broadcastAuctionState(auctionId);
  res.json({ auctionId, auction: getHydratedAuction(auctionId) });
});

app.delete('/api/auctions/:auctionId', requireSuperAdmin, (req, res) => {
  const { auctionId } = req.params;
  const existing = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
  if (!existing) {
    return res.status(404).json({ error: 'Auction not found.' });
  }
  clearAuctionTimer(auctionId);
  db.prepare('DELETE FROM auctions WHERE id = ?').run(auctionId);

  recordAudit({
    auctionId: null,
    user: req.user,
    action: 'Auction deleted',
    entityType: 'AUCTION',
    entityId: auctionId,
    entityName: existing.name,
    previousValue: { name: existing.name, committeeName: existing.committeeName },
    newValue: null
  });

  broadcastAuctionState(auctionId);
  res.json({ ok: true });
});

app.post('/api/auctions/:auctionId/reset', requireAuctionAdmin, (req, res) => {
  const { auctionId } = req.params;
  const { confirmationText } = req.body || {};
  if (String(confirmationText || '').trim().toLowerCase() !== 'i confirm') {
    return res
      .status(400)
      .json({ error: 'Confirmation required: Please type "I confirm" to restart the auction.' });
  }
  const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
  if (!auction) {
    return res.status(404).json({ error: 'Auction not found.' });
  }
  clearAuctionTimer(auctionId);
  const now = new Date().toISOString();

  runTransaction(() => {
    db.prepare('DELETE FROM bids WHERE auctionId = ?').run(auctionId);
    db.prepare('DELETE FROM sales_history WHERE auctionId = ?').run(auctionId);
    db.prepare('DELETE FROM purse_adjustments WHERE auctionId = ?').run(auctionId);

    db.prepare(`
      UPDATE items
      SET status = 'QUEUED',
          currentBid = 0,
          highestBidderTeamId = NULL,
          soldToTeamId = NULL,
          soldAmount = NULL,
          soldAt = NULL,
          soldViaRtm = 0,
          basePrice = originalBasePrice,
          reauctionCount = 0,
          updatedAt = ?
      WHERE auctionId = ?
    `).run(now, auctionId);

    // Ensure no retained player is in items after reset
    const rets = db.prepare('SELECT playerName FROM retentions WHERE auctionId = ?').all(auctionId);
    for (const r of rets) {
      removeRetainedPlayerFromAuctionItems(auctionId, r.playerName);
    }

    db.prepare(`
      UPDATE auctions
      SET status = 'READY',
          activeItemId = NULL,
          projectorOverlayJson = NULL,
          updatedAt = ?
      WHERE id = ?
    `).run(now, auctionId);

    recalculateAllAuctionPurses(auctionId);

    recordAudit({
      auctionId,
      user: req.user,
      action: 'Auction reset',
      entityType: 'AUCTION',
      entityId: auctionId,
      entityName: auction.name,
      previousValue: { status: auction.status },
      newValue: { status: AUCTION_STATES.READY }
    });
  });

  broadcastAuctionState(auctionId, { type: 'AUCTION_RESET', sound: 'TRANSITION' });
  res.json({ auction: getHydratedAuction(auctionId) });
});

app.patch('/api/auctions/:auctionId/config', requireAuctionAdmin, (req, res) => {
  const { auctionId } = req.params;
  const {
    name,
    committeeName,
    currency,
    startingPurse,
    maxRetentionsPerTeam,
    maxRtmPerTeam,
    incrementRules,
    applyStartingPurseToAllTeams,
    applyRtmToAllTeams
  } = req.body || {};

  const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
  if (!auction) {
    return res.status(404).json({ error: 'Auction not found.' });
  }

  if (currency && !PREDEFINED_CURRENCIES[currency]) {
    return res.status(400).json({ error: 'Invalid currency: Must select from predefined currency list.' });
  }

  const now = new Date().toISOString();
  runTransaction(() => {
    const updatedName = name !== undefined ? String(name).trim() : auction.name;
    const updatedCommittee =
      committeeName !== undefined ? String(committeeName).trim() : auction.committeeName;
    const updatedCurrency = currency || auction.currency;
    const updatedPurse =
      startingPurse !== undefined ? Number(startingPurse) : Number(auction.startingPurse);
    const updatedMaxRet =
      maxRetentionsPerTeam !== undefined
        ? Math.max(0, Number(maxRetentionsPerTeam))
        : Number(auction.maxRetentionsPerTeam);
    const updatedMaxRtm =
      maxRtmPerTeam !== undefined
        ? Math.max(0, Number(maxRtmPerTeam))
        : Number(auction.maxRtmPerTeam) || 0;
    const updatedRulesJson =
      Array.isArray(incrementRules) && incrementRules.length > 0
        ? JSON.stringify(incrementRules)
        : auction.incrementRulesJson;

    db.prepare(`
      UPDATE auctions
      SET name = ?, committeeName = ?, currency = ?, startingPurse = ?,
          maxRetentionsPerTeam = ?, maxRtmPerTeam = ?, incrementRulesJson = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      updatedName,
      updatedCommittee,
      updatedCurrency,
      updatedPurse,
      updatedMaxRet,
      updatedMaxRtm,
      updatedRulesJson,
      now,
      auctionId
    );

    if (applyStartingPurseToAllTeams && startingPurse !== undefined) {
      db.prepare('UPDATE teams SET startingPurse = ? WHERE auctionId = ?').run(
        updatedPurse,
        auctionId
      );
      recalculateAllAuctionPurses(auctionId);
    }

    if (applyRtmToAllTeams && maxRtmPerTeam !== undefined) {
      db.prepare('UPDATE teams SET rtmCardsTotal = ? WHERE auctionId = ?').run(
        updatedMaxRtm,
        auctionId
      );
    }

    recordAudit({
      auctionId,
      user: req.user,
      action: 'Auction configuration updated',
      entityType: 'AUCTION',
      entityId: auctionId,
      entityName: updatedName,
      previousValue: {
        name: auction.name,
        committeeName: auction.committeeName,
        currency: auction.currency,
        startingPurse: auction.startingPurse,
        maxRetentionsPerTeam: auction.maxRetentionsPerTeam,
        maxRtmPerTeam: auction.maxRtmPerTeam
      },
      newValue: {
        name: updatedName,
        committeeName: updatedCommittee,
        currency: updatedCurrency,
        startingPurse: updatedPurse,
        maxRetentionsPerTeam: updatedMaxRet,
        maxRtmPerTeam: updatedMaxRtm
      }
    });
  });

  broadcastAuctionState(auctionId);
  res.json({ auction: getHydratedAuction(auctionId) });
});

// ============================================================================
// 5. AUCTION STATE MACHINE & REOPENING (Sections 9 & 10)
// ============================================================================

app.post('/api/auctions/:auctionId/state', requireAuctionAdmin, (req, res) => {
  const { auctionId } = req.params;
  const { status } = req.body || {};

  if (!Object.values(AUCTION_STATES).includes(status)) {
    return res.status(400).json({ error: `Invalid auction state: ${status}` });
  }

  const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
  if (!auction) {
    return res.status(404).json({ error: 'Auction not found.' });
  }

  clearAuctionTimer(auctionId);
  const now = new Date().toISOString();
  const prevStatus = auction.status;

  runTransaction(() => {
    // Once LIVE begins, retentions are published & locked (Section 28)
    const retPub =
      status === AUCTION_STATES.LIVE ? 1 : auction.retentionsPublished;

    db.prepare(`
      UPDATE auctions
      SET status = ?, retentionsPublished = ?, projectorOverlayJson = NULL, updatedAt = ?
      WHERE id = ?
    `).run(status, retPub, now, auctionId);

    // If transitioning to LIVE and no active item is set, keep activeItemId if one was active in PAUSED
    let actionLabel = `Auction state changed to ${status}`;
    if (status === AUCTION_STATES.PAUSED) actionLabel = 'Auction paused';
    else if (prevStatus === AUCTION_STATES.PAUSED && status === AUCTION_STATES.LIVE) actionLabel = 'Auction resumed';
    else if (status === AUCTION_STATES.COMPLETED) actionLabel = 'Auction completed';
    else if (status === AUCTION_STATES.LIVE) actionLabel = 'Auction started (LIVE)';

    recordAudit({
      auctionId,
      user: req.user,
      action: actionLabel,
      entityType: 'AUCTION',
      entityId: auctionId,
      entityName: auction.name,
      previousValue: { status: prevStatus },
      newValue: { status }
    });
  });

  broadcastAuctionState(auctionId, {
    type: 'STATE_CHANGED',
    status,
    sound: status === AUCTION_STATES.LIVE ? 'AUCTION_START' : 'TRANSITION'
  });

  res.json({ auction: getHydratedAuction(auctionId) });
});

// Section 10: Reopen Completed Auction
app.post('/api/auctions/:auctionId/reopen', requireAuctionAdmin, (req, res) => {
  const { auctionId } = req.params;
  const { targetStatus = AUCTION_STATES.LIVE } = req.body || {};
  const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
  if (!auction) {
    return res.status(404).json({ error: 'Auction not found.' });
  }

  const newStatus =
    targetStatus === AUCTION_STATES.READY ? AUCTION_STATES.READY : AUCTION_STATES.LIVE;
  const now = new Date().toISOString();

  runTransaction(() => {
    db.prepare(`
      UPDATE auctions
      SET status = ?, reopenedCount = reopenedCount + 1, projectorOverlayJson = NULL, updatedAt = ?
      WHERE id = ?
    `).run(newStatus, now, auctionId);

    recalculateAllAuctionPurses(auctionId);

    recordAudit({
      auctionId,
      user: req.user,
      action: 'Auction reopened',
      entityType: 'AUCTION',
      entityId: auctionId,
      entityName: auction.name,
      previousValue: { status: auction.status, reopenedCount: auction.reopenedCount },
      newValue: { status: newStatus, reopenedCount: (auction.reopenedCount || 0) + 1 }
    });
  });

  broadcastAuctionState(auctionId, { type: 'AUCTION_REOPENED', sound: 'TRANSITION' });
  res.json({ auction: getHydratedAuction(auctionId) });
});

// ============================================================================
// 6. LIVE BIDDING & AUCTION FLOW CONTROLS (Sections 15-24)
// ============================================================================

// Start next item or specific item
app.post('/api/auctions/:auctionId/start-item', requireAuctionAdmin, (req, res) => {
  const { auctionId } = req.params;
  const { itemId } = req.body || {};

  const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
  if (!auction) {
    return res.status(404).json({ error: 'Auction not found.' });
  }

  clearAuctionTimer(auctionId);
  const now = new Date().toISOString();

  try {
    let startedItem = null;
    runTransaction(() => {
      // If an item is currently ACTIVE with no sale, return it to head of queue before switching
      if (auction.activeItemId) {
        const prevActive = db.prepare('SELECT * FROM items WHERE id = ?').get(auction.activeItemId);
        if (prevActive && prevActive.status === 'ACTIVE') {
          db.prepare(
            "UPDATE items SET status = 'QUEUED', currentBid = 0, highestBidderTeamId = NULL, updatedAt = ? WHERE id = ?"
          ).run(now, prevActive.id);
        }
      }

      if (itemId) {
        startedItem = db
          .prepare('SELECT * FROM items WHERE id = ? AND auctionId = ?')
          .get(itemId, auctionId);
      } else {
        startedItem = db
          .prepare(
            "SELECT * FROM items WHERE auctionId = ? AND status = 'QUEUED' ORDER BY queueOrder ASC, createdAt ASC LIMIT 1"
          )
          .get(auctionId);
      }

      if (!startedItem) {
        throw new Error('No queued items remaining to start.');
      }

      // Ensure auction is LIVE and retentions are locked once first item begins
      db.prepare(`
        UPDATE auctions
        SET status = 'LIVE', retentionsPublished = 1, activeItemId = ?, projectorOverlayJson = NULL, updatedAt = ?
        WHERE id = ?
      `).run(startedItem.id, now, auctionId);

      db.prepare(`
        UPDATE items
        SET status = 'ACTIVE', currentBid = 0, highestBidderTeamId = NULL, updatedAt = ?
        WHERE id = ?
      `).run(now, startedItem.id);

      recordAudit({
        auctionId,
        user: req.user,
        action: 'Item started',
        entityType: 'ITEM',
        entityId: startedItem.id,
        entityName: startedItem.name,
        previousValue: { status: startedItem.status },
        newValue: { status: 'ACTIVE', basePrice: startedItem.basePrice, poolName: startedItem.poolName }
      });
    });

    broadcastAuctionState(auctionId, {
      type: 'ITEM_STARTED',
      sound: 'AUCTION_START',
      itemId: startedItem.id,
      itemName: startedItem.name
    });
    res.json({ auction: getHydratedAuction(auctionId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Place Bid (+ BID or Manual EDIT BID) — Sections 16, 17, 18, 35
app.post('/api/auctions/:auctionId/bid', requireAuctionAdmin, (req, res) => {
  const { auctionId } = req.params;
  const { teamId, mode = 'INCREMENT', manualAmount, allowOverride = false } = req.body || {};

  if (!teamId) {
    return res.status(400).json({ error: 'Please select a bidding team.' });
  }

  try {
    let bidRecord = null;
    runTransaction(() => {
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
      if (!auction) throw new Error('Auction not found.');

      if (auction.status === AUCTION_STATES.PAUSED) {
        throw new Error('Auction is PAUSED. Resume the auction before placing bids.');
      }
      if (auction.status !== AUCTION_STATES.LIVE) {
        throw new Error(`Cannot place bids while auction is in ${auction.status} state.`);
      }

      const activeItem = db
        .prepare("SELECT * FROM items WHERE id = ? AND auctionId = ? AND status = 'ACTIVE'")
        .get(auction.activeItemId, auctionId);

      if (!activeItem) {
        throw new Error('There is no active item on the block right now.');
      }

      const team = db
        .prepare('SELECT * FROM teams WHERE id = ? AND auctionId = ?')
        .get(teamId, auctionId);

      if (!team) throw new Error('Selected team does not exist in this auction.');
      if (team.disabled) throw new Error(`${team.name} is currently disabled and cannot bid.`);

      // Authoritative server-side purse check
      const purseState = recalculateTeamPurse(team.id);
      const remainingPurse = purseState.remainingPurse;

      const incrementRules = JSON.parse(auction.incrementRulesJson || '[]');
      let targetAmount = 0;
      let isOverride = false;

      if (mode === 'MANUAL') {
        targetAmount = Math.round(Number(manualAmount) || 0);
        if (targetAmount <= 0) {
          throw new Error('Bid amount must be greater than zero.');
        }
        if (targetAmount < activeItem.basePrice && !allowOverride) {
          throw new Error(
            `First valid bid cannot be below base price (${formatCurrency(activeItem.basePrice, auction.currency)}). Enable Admin Override if intentional.`
          );
        }
        if (activeItem.highestBidderTeamId && targetAmount <= activeItem.currentBid && !allowOverride) {
          throw new Error(
            `Manual bid must exceed current bid (${formatCurrency(activeItem.currentBid, auction.currency)}) unless Admin Override is enabled.`
          );
        }
        if (activeItem.highestBidderTeamId && !allowOverride) {
          const requiredInc = getIncrementForAmount(activeItem.currentBid, incrementRules);
          const minValidNext = activeItem.currentBid + requiredInc;
          if (targetAmount < minValidNext) {
            throw new Error(
              `Minimum next bid by increment rules is ${formatCurrency(minValidNext, auction.currency)} (+${formatCurrency(requiredInc, auction.currency)}). Enable Admin Override to bypass increment rules.`
            );
          }
        }
        isOverride = Boolean(allowOverride);
      } else {
        // Automatic + BID via Configurable Bid Increment Engine
        if (activeItem.highestBidderTeamId === team.id) {
          throw new Error(`${team.name} already holds the highest bid.`);
        }
        targetAmount = calculateNextBid(activeItem, incrementRules);
      }

      // Section 18: Never allow negative purse or exceeding remaining purse
      if (targetAmount > remainingPurse) {
        throw new Error(
          `Insufficient purse! ${team.name} has ${formatCurrency(remainingPurse, auction.currency)} remaining and cannot bid ${formatCurrency(targetAmount, auction.currency)}.`
        );
      }

      const now = new Date().toISOString();
      const bidId = uid('bid');

      db.prepare(`
        INSERT INTO bids (
          id, auctionId, itemId, teamId, amount,
          placedByUserId, placedByName, placedByRole, isOverride, undone, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(
        bidId,
        auctionId,
        activeItem.id,
        team.id,
        targetAmount,
        req.user.id,
        req.user.name,
        req.user.auctionRole,
        isOverride ? 1 : 0,
        now
      );

      const previousState = {
        currentBid: activeItem.currentBid,
        highestBidderTeamId: activeItem.highestBidderTeamId
      };

      db.prepare(`
        UPDATE items
        SET currentBid = ?, highestBidderTeamId = ?, updatedAt = ?
        WHERE id = ?
      `).run(targetAmount, team.id, now, activeItem.id);

      recordAudit({
        auctionId,
        user: req.user,
        action: mode === 'MANUAL' ? 'Bid edited' : 'Bid placed',
        entityType: 'ITEM',
        entityId: activeItem.id,
        entityName: activeItem.name,
        previousValue: previousState,
        newValue: {
          currentBid: targetAmount,
          highestBidderTeamId: team.id,
          teamName: team.name,
          isOverride
        }
      });

      bidRecord = {
        id: bidId,
        itemId: activeItem.id,
        itemName: activeItem.name,
        teamId: team.id,
        teamName: team.name,
        amount: targetAmount
      };
    });

    broadcastAuctionState(auctionId, {
      type: 'BID_PLACED',
      sound: 'BID',
      bid: bidRecord
    });

    res.json({ auction: getHydratedAuction(auctionId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Section 23: Undo Last Bid
app.post('/api/auctions/:auctionId/undo-bid', requireAuctionAdmin, (req, res) => {
  const { auctionId } = req.params;

  try {
    runTransaction(() => {
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
      if (!auction || !auction.activeItemId) {
        throw new Error('No active item to undo bid on.');
      }

      const activeItem = db.prepare('SELECT * FROM items WHERE id = ?').get(auction.activeItemId);
      if (!activeItem || activeItem.status !== 'ACTIVE') {
        throw new Error('Item is not active.');
      }

      const lastBid = db
        .prepare(
          'SELECT * FROM bids WHERE itemId = ? AND undone = 0 ORDER BY amount DESC, createdAt DESC LIMIT 1'
        )
        .get(activeItem.id);

      if (!lastBid) {
        throw new Error('No bids have been placed on this item to undo.');
      }

      db.prepare('UPDATE bids SET undone = 1 WHERE id = ?').run(lastBid.id);

      const previousBid = db
        .prepare(
          'SELECT * FROM bids WHERE itemId = ? AND undone = 0 ORDER BY amount DESC, createdAt DESC LIMIT 1'
        )
        .get(activeItem.id);

      const newBidAmount = previousBid ? Number(previousBid.amount) : 0;
      const newHighestTeamId = previousBid ? previousBid.teamId : null;
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE items
        SET currentBid = ?, highestBidderTeamId = ?, updatedAt = ?
        WHERE id = ?
      `).run(newBidAmount, newHighestTeamId, now, activeItem.id);

      recordAudit({
        auctionId,
        user: req.user,
        action: 'Bid undone',
        entityType: 'ITEM',
        entityId: activeItem.id,
        entityName: activeItem.name,
        previousValue: {
          currentBid: activeItem.currentBid,
          highestBidderTeamId: activeItem.highestBidderTeamId
        },
        newValue: {
          currentBid: newBidAmount,
          highestBidderTeamId: newHighestTeamId
        }
      });
    });

    broadcastAuctionState(auctionId, { type: 'BID_UNDONE', sound: 'TRANSITION' });
    res.json({ auction: getHydratedAuction(auctionId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Section 19: SOLD Action (Standard Highest Bidder OR Right To Match / RTM)
app.post('/api/auctions/:auctionId/sold', requireAuctionAdmin, (req, res) => {
  const { auctionId } = req.params;
  const { rtmTeamId, rtmAmount } = req.body || {};

  try {
    let salePayload = null;
    runTransaction(() => {
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
      if (!auction) throw new Error('Auction not found.');
      if (auction.status === AUCTION_STATES.PAUSED) {
        throw new Error('Cannot mark SOLD while auction is PAUSED.');
      }

      const activeItem = db
        .prepare("SELECT * FROM items WHERE id = ? AND auctionId = ? AND status = 'ACTIVE'")
        .get(auction.activeItemId, auctionId);

      if (!activeItem) {
        throw new Error('No active item to mark SOLD.');
      }

      const isRtm = Boolean(rtmTeamId);
      const targetTeamId = isRtm ? rtmTeamId : activeItem.highestBidderTeamId;

      if (!targetTeamId || (!isRtm && activeItem.currentBid <= 0)) {
        throw new Error('Cannot mark SOLD: No team has placed a bid on this item yet.');
      }

      const winningTeam = db
        .prepare('SELECT * FROM teams WHERE id = ? AND auctionId = ?')
        .get(targetTeamId, auctionId);

      if (!winningTeam) {
        throw new Error('Winning team not found.');
      }
      if (winningTeam.disabled) {
        throw new Error(`${winningTeam.name} is disabled.`);
      }

      if (isRtm) {
        const rtmTotal =
          winningTeam.rtmCardsTotal !== null && winningTeam.rtmCardsTotal !== undefined
            ? Number(winningTeam.rtmCardsTotal)
            : Number(auction.maxRtmPerTeam) || 0;
        const rtmUsed =
          db
            .prepare(
              "SELECT COUNT(*) AS cnt FROM items WHERE soldToTeamId = ? AND status = 'SOLD' AND soldViaRtm = 1"
            )
            .get(winningTeam.id)?.cnt || 0;

        if (rtmTotal <= 0 || rtmUsed >= rtmTotal) {
          throw new Error(
            `${winningTeam.name} has no RTM cards remaining (${rtmUsed}/${rtmTotal} used).`
          );
        }
      }

      const preSalePurse = recalculateTeamPurse(winningTeam.id).remainingPurse;
      const winningAmount = isRtm
        ? Math.round(
            Number(
              rtmAmount !== undefined && rtmAmount !== null && rtmAmount !== ''
                ? rtmAmount
                : activeItem.currentBid > 0
                ? activeItem.currentBid
                : activeItem.basePrice
            )
          )
        : Number(activeItem.currentBid);

      if (winningAmount <= 0) {
        throw new Error('Sale amount must be greater than zero.');
      }

      if (winningAmount > preSalePurse) {
        throw new Error(
          `Purse check failed: ${winningTeam.name} only has ${formatCurrency(preSalePurse, auction.currency)} remaining.`
        );
      }

      const now = new Date().toISOString();

      // 1. Award item to winning team & mark SOLD
      db.prepare(`
        UPDATE items
        SET status = 'SOLD',
            currentBid = ?,
            highestBidderTeamId = ?,
            soldToTeamId = ?,
            soldAmount = ?,
            soldAt = ?,
            soldViaRtm = ?,
            updatedAt = ?
        WHERE id = ?
      `).run(
        winningAmount,
        winningTeam.id,
        winningTeam.id,
        winningAmount,
        now,
        isRtm ? 1 : 0,
        now,
        activeItem.id
      );

      // 2. Deduct winning amount & update team purse deterministically
      const postSalePurse = recalculateTeamPurse(winningTeam.id).remainingPurse;

      // 3. Record in sales_history
      db.prepare(`
        INSERT INTO sales_history (
          id, auctionId, itemId, itemName, poolName, eventType,
          teamId, teamName, amount, reauctionNumber, adminName, adminRole, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uid('sh'),
        auctionId,
        activeItem.id,
        activeItem.name,
        activeItem.poolName,
        isRtm ? 'SOLD_RTM' : 'SOLD',
        winningTeam.id,
        winningTeam.name,
        winningAmount,
        activeItem.reauctionCount || 0,
        req.user.name,
        req.user.auctionRole,
        now
      );

      // 4. Configure 3-second dramatic SOLD overlay for Projector & connected displays
      const overlay = {
        type: 'SOLD',
        soldViaRtm: isRtm,
        itemId: activeItem.id,
        itemName: activeItem.name,
        itemImageUrl: activeItem.imageUrl,
        poolName: activeItem.poolName,
        amount: winningAmount,
        teamId: winningTeam.id,
        teamName: winningTeam.name,
        teamShortName: winningTeam.shortName,
        teamLogoUrl: winningTeam.logoUrl,
        teamPrimaryColor: winningTeam.primaryColor,
        teamSecondaryColor: winningTeam.secondaryColor,
        remainingPurse: postSalePurse,
        triggeredAt: Date.now(),
        expiresAt: Date.now() + 3000
      };

      db.prepare(`
        UPDATE auctions
        SET activeItemId = NULL, projectorOverlayJson = ?, updatedAt = ?
        WHERE id = ?
      `).run(JSON.stringify(overlay), now, auctionId);

      // 5. Record audit event
      recordAudit({
        auctionId,
        user: req.user,
        action: isRtm ? 'Item sold via RTM' : 'Item sold',
        entityType: 'ITEM',
        entityId: activeItem.id,
        entityName: activeItem.name,
        previousValue: {
          status: 'ACTIVE',
          teamPurse: preSalePurse
        },
        newValue: {
          status: 'SOLD',
          soldViaRtm: isRtm,
          soldToTeamId: winningTeam.id,
          soldToTeamName: winningTeam.name,
          soldAmount: winningAmount,
          newTeamPurse: postSalePurse
        }
      });

      salePayload = overlay;
    });

    // Broadcast SOLD event + prominent winning notification for the winning team's devices!
    broadcastAuctionState(auctionId, {
      type: 'ITEM_SOLD',
      sound: 'SOLD',
      sale: salePayload
    });

    io.to(`team:${salePayload.teamId}`).emit('team:won', salePayload);

    // Schedule 3-second automatic transition to next item (Section 19)
    clearAuctionTimer(auctionId);
    const timer = setTimeout(() => {
      advanceToNextItem(auctionId, req.user);
    }, 3000);
    auctionTransitionTimers.set(auctionId, timer);

    res.json({ auction: getHydratedAuction(auctionId), sale: salePayload });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Section 20: UNSOLD Action (Immediate, 3-second screen, then auto-advance)
app.post('/api/auctions/:auctionId/unsold', requireAuctionAdmin, (req, res) => {
  const { auctionId } = req.params;

  try {
    let unsoldOverlay = null;
    runTransaction(() => {
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
      if (!auction) throw new Error('Auction not found.');
      if (auction.status === AUCTION_STATES.PAUSED) {
        throw new Error('Cannot mark UNSOLD while auction is PAUSED.');
      }

      const activeItem = db
        .prepare("SELECT * FROM items WHERE id = ? AND auctionId = ? AND status = 'ACTIVE'")
        .get(auction.activeItemId, auctionId);

      if (!activeItem) {
        throw new Error('No active item to mark UNSOLD.');
      }

      const now = new Date().toISOString();

      db.prepare(`
        UPDATE items
        SET status = 'UNSOLD',
            currentBid = 0,
            highestBidderTeamId = NULL,
            updatedAt = ?
        WHERE id = ?
      `).run(now, activeItem.id);

      db.prepare(`
        INSERT INTO sales_history (
          id, auctionId, itemId, itemName, poolName, eventType,
          teamId, teamName, amount, reauctionNumber, adminName, adminRole, createdAt
        ) VALUES (?, ?, ?, ?, ?, 'UNSOLD', NULL, NULL, ?, ?, ?, ?, ?)
      `).run(
        uid('sh'),
        auctionId,
        activeItem.id,
        activeItem.name,
        activeItem.poolName,
        activeItem.basePrice,
        activeItem.reauctionCount || 0,
        req.user.name,
        req.user.auctionRole,
        now
      );

      unsoldOverlay = {
        type: 'UNSOLD',
        itemId: activeItem.id,
        itemName: activeItem.name,
        itemImageUrl: activeItem.imageUrl,
        poolName: activeItem.poolName,
        basePrice: activeItem.basePrice,
        triggeredAt: Date.now(),
        expiresAt: Date.now() + 3000
      };

      db.prepare(`
        UPDATE auctions
        SET activeItemId = NULL, projectorOverlayJson = ?, updatedAt = ?
        WHERE id = ?
      `).run(JSON.stringify(unsoldOverlay), now, auctionId);

      recordAudit({
        auctionId,
        user: req.user,
        action: 'Item unsold',
        entityType: 'ITEM',
        entityId: activeItem.id,
        entityName: activeItem.name,
        previousValue: { status: 'ACTIVE', currentBid: activeItem.currentBid },
        newValue: { status: 'UNSOLD' }
      });
    });

    broadcastAuctionState(auctionId, {
      type: 'ITEM_UNSOLD',
      sound: 'UNSOLD',
      unsold: unsoldOverlay
    });

    // Schedule 3-second automatic transition to next item (Section 20)
    clearAuctionTimer(auctionId);
    const timer = setTimeout(() => {
      advanceToNextItem(auctionId, req.user);
    }, 3000);
    auctionTransitionTimers.set(auctionId, timer);

    res.json({ auction: getHydratedAuction(auctionId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Section 21: SKIP Action (Immediate move to next item, no special screen, item remains available)
app.post('/api/auctions/:auctionId/skip', requireAuctionAdmin, (req, res) => {
  const { auctionId } = req.params;

  try {
    clearAuctionTimer(auctionId);
    runTransaction(() => {
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
      if (!auction) throw new Error('Auction not found.');
      if (auction.status === AUCTION_STATES.PAUSED) {
        throw new Error('Cannot skip item while auction is PAUSED.');
      }

      const activeItem = db
        .prepare("SELECT * FROM items WHERE id = ? AND auctionId = ? AND status = 'ACTIVE'")
        .get(auction.activeItemId, auctionId);

      if (!activeItem) {
        throw new Error('No active item to skip.');
      }

      const maxOrderRow = db
        .prepare('SELECT COALESCE(MAX(queueOrder), 0) AS maxOrder FROM items WHERE auctionId = ?')
        .get(auctionId);
      const newOrder = (Number(maxOrderRow?.maxOrder) || 0) + 1;
      const now = new Date().toISOString();

      // Mark any temporary bids on this skipped item as undone
      db.prepare('UPDATE bids SET undone = 1 WHERE itemId = ? AND undone = 0').run(activeItem.id);

      // Return item to end of queue so it remains available later
      db.prepare(`
        UPDATE items
        SET status = 'QUEUED',
            currentBid = 0,
            highestBidderTeamId = NULL,
            queueOrder = ?,
            updatedAt = ?
        WHERE id = ?
      `).run(newOrder, now, activeItem.id);

      // Find next item in queue
      const nextItem = db
        .prepare(
          "SELECT * FROM items WHERE auctionId = ? AND status = 'QUEUED' AND id != ? ORDER BY queueOrder ASC, createdAt ASC LIMIT 1"
        )
        .get(auctionId, activeItem.id) || activeItem;

      db.prepare("UPDATE items SET status = 'ACTIVE', updatedAt = ? WHERE id = ?").run(
        now,
        nextItem.id
      );

      db.prepare(`
        UPDATE auctions
        SET activeItemId = ?, projectorOverlayJson = NULL, updatedAt = ?
        WHERE id = ?
      `).run(nextItem.id, now, auctionId);

      recordAudit({
        auctionId,
        user: req.user,
        action: 'Item skipped',
        entityType: 'ITEM',
        entityId: activeItem.id,
        entityName: activeItem.name,
        previousValue: { status: 'ACTIVE', currentBid: activeItem.currentBid },
        newValue: { status: 'QUEUED', nextItemId: nextItem.id, nextItemName: nextItem.name }
      });
    });

    broadcastAuctionState(auctionId, { type: 'ITEM_SKIPPED', sound: 'TRANSITION' });
    res.json({ auction: getHydratedAuction(auctionId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Section 22: WITHDRAW Action (Return to Queue or Send to Unsold Pool)
app.post('/api/auctions/:auctionId/withdraw', requireAuctionAdmin, (req, res) => {
  const { auctionId } = req.params;
  const { destination = 'QUEUE', autoStartNext = true } = req.body || {};

  try {
    clearAuctionTimer(auctionId);
    runTransaction(() => {
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
      if (!auction) throw new Error('Auction not found.');

      const activeItem = db
        .prepare("SELECT * FROM items WHERE id = ? AND auctionId = ? AND status = 'ACTIVE'")
        .get(auction.activeItemId, auctionId);

      if (!activeItem) {
        throw new Error('No active item to withdraw.');
      }

      const now = new Date().toISOString();
      const targetStatus = destination === 'UNSOLD' ? 'UNSOLD' : 'QUEUED';
      const maxOrderRow = db
        .prepare('SELECT COALESCE(MAX(queueOrder), 0) AS maxOrder FROM items WHERE auctionId = ?')
        .get(auctionId);

      db.prepare('UPDATE bids SET undone = 1 WHERE itemId = ? AND undone = 0').run(activeItem.id);

      db.prepare(`
        UPDATE items
        SET status = ?,
            currentBid = 0,
            highestBidderTeamId = NULL,
            queueOrder = ?,
            updatedAt = ?
        WHERE id = ?
      `).run(
        targetStatus,
        targetStatus === 'QUEUED' ? (Number(maxOrderRow?.maxOrder) || 0) + 1 : activeItem.queueOrder,
        now,
        activeItem.id
      );

      let nextActiveId = null;
      if (autoStartNext) {
        const nextItem = db
          .prepare(
            "SELECT * FROM items WHERE auctionId = ? AND status = 'QUEUED' AND id != ? ORDER BY queueOrder ASC, createdAt ASC LIMIT 1"
          )
          .get(auctionId, activeItem.id);
        if (nextItem) {
          db.prepare("UPDATE items SET status = 'ACTIVE', updatedAt = ? WHERE id = ?").run(
            now,
            nextItem.id
          );
          nextActiveId = nextItem.id;
        }
      }

      db.prepare(`
        UPDATE auctions
        SET activeItemId = ?, projectorOverlayJson = NULL, updatedAt = ?
        WHERE id = ?
      `).run(nextActiveId, now, auctionId);

      recordAudit({
        auctionId,
        user: req.user,
        action: 'Item withdrawn',
        entityType: 'ITEM',
        entityId: activeItem.id,
        entityName: activeItem.name,
        previousValue: { status: 'ACTIVE', currentBid: activeItem.currentBid },
        newValue: { status: targetStatus, destination }
      });
    });

    broadcastAuctionState(auctionId, { type: 'ITEM_WITHDRAWN', sound: 'TRANSITION' });
    res.json({ auction: getHydratedAuction(auctionId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// 7. UNSOLD POOL RE-AUCTION & PURCHASE CORRECTIONS (Sections 15, 20, 24)
// ============================================================================

// Re-auction an unsold item (with default originalBasePrice or overridden basePrice)
app.post('/api/auctions/:auctionId/items/:itemId/reauction', requireAuctionAdmin, (req, res) => {
  const { auctionId, itemId } = req.params;
  const { overrideBasePrice, startImmediately = false, queuePosition = 'TOP' } = req.body || {};

  try {
    runTransaction(() => {
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
      const item = db
        .prepare('SELECT * FROM items WHERE id = ? AND auctionId = ?')
        .get(itemId, auctionId);

      if (!item) throw new Error('Item not found.');
      if (item.status !== 'UNSOLD' && item.status !== 'PERMANENTLY_UNSOLD') {
        throw new Error('Only unsold items can be re-auctioned.');
      }

      const defaultPrice = Number(item.originalBasePrice) || Number(item.basePrice);
      const newBasePrice =
        overrideBasePrice !== undefined && overrideBasePrice !== null && overrideBasePrice !== ''
          ? Number(overrideBasePrice)
          : defaultPrice;

      if (newBasePrice <= 0) {
        throw new Error('Re-auction base price must be greater than zero.');
      }

      const isPriceOverridden = newBasePrice !== defaultPrice;
      const now = new Date().toISOString();

      let targetQueueOrder = item.queueOrder;
      if (queuePosition === 'TOP') {
        const minRow = db
          .prepare("SELECT COALESCE(MIN(queueOrder), 0) AS minOrder FROM items WHERE auctionId = ? AND status = 'QUEUED'")
          .get(auctionId);
        targetQueueOrder = (Number(minRow?.minOrder) || 0) - 1;
      } else {
        const maxRow = db
          .prepare('SELECT COALESCE(MAX(queueOrder), 0) AS maxOrder FROM items WHERE auctionId = ?')
          .get(auctionId);
        targetQueueOrder = (Number(maxRow?.maxOrder) || 0) + 1;
      }

      const newStatus = startImmediately ? 'ACTIVE' : 'QUEUED';

      if (startImmediately && auction.activeItemId) {
        db.prepare(
          "UPDATE items SET status = 'QUEUED', currentBid = 0, highestBidderTeamId = NULL, updatedAt = ? WHERE id = ? AND status = 'ACTIVE'"
        ).run(now, auction.activeItemId);
      }

      db.prepare(`
        UPDATE items
        SET status = ?,
            basePrice = ?,
            currentBid = 0,
            highestBidderTeamId = NULL,
            queueOrder = ?,
            reauctionCount = reauctionCount + 1,
            updatedAt = ?
        WHERE id = ?
      `).run(newStatus, newBasePrice, targetQueueOrder, now, item.id);

      if (startImmediately) {
        db.prepare(`
          UPDATE auctions
          SET status = 'LIVE', activeItemId = ?, projectorOverlayJson = NULL, updatedAt = ?
          WHERE id = ?
        `).run(item.id, now, auctionId);
      }

      db.prepare(`
        INSERT INTO sales_history (
          id, auctionId, itemId, itemName, poolName, eventType,
          teamId, teamName, amount, reauctionNumber, adminName, adminRole, createdAt
        ) VALUES (?, ?, ?, ?, ?, 'REAUCTION_QUEUED', NULL, NULL, ?, ?, ?, ?, ?)
      `).run(
        uid('sh'),
        auctionId,
        item.id,
        item.name,
        item.poolName,
        newBasePrice,
        (item.reauctionCount || 0) + 1,
        req.user.name,
        req.user.auctionRole,
        now
      );

      recordAudit({
        auctionId,
        user: req.user,
        action: isPriceOverridden
          ? 'Item re-auctioned (base price overridden)'
          : 'Item queued for re-auction',
        entityType: 'ITEM',
        entityId: item.id,
        entityName: item.name,
        previousValue: { status: item.status, basePrice: item.basePrice },
        newValue: {
          status: newStatus,
          basePrice: newBasePrice,
          originalBasePrice: item.originalBasePrice,
          isPriceOverridden,
          reauctionCount: (item.reauctionCount || 0) + 1
        }
      });
    });

    broadcastAuctionState(auctionId, { type: 'ITEM_REAUCTION', sound: 'TRANSITION' });
    res.json({ auction: getHydratedAuction(auctionId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Permanently mark item unsold (Section 20)
app.post('/api/auctions/:auctionId/items/:itemId/permanent-unsold', requireAuctionAdmin, (req, res) => {
  const { auctionId, itemId } = req.params;
  const item = db
    .prepare('SELECT * FROM items WHERE id = ? AND auctionId = ?')
    .get(itemId, auctionId);

  if (!item) return res.status(404).json({ error: 'Item not found.' });

  const now = new Date().toISOString();
  db.prepare("UPDATE items SET status = 'PERMANENTLY_UNSOLD', updatedAt = ? WHERE id = ?").run(
    now,
    itemId
  );

  recordAudit({
    auctionId,
    user: req.user,
    action: 'Item permanently marked unsold',
    entityType: 'ITEM',
    entityId: item.id,
    entityName: item.name,
    previousValue: { status: item.status },
    newValue: { status: 'PERMANENTLY_UNSOLD' }
  });

  broadcastAuctionState(auctionId);
  res.json({ auction: getHydratedAuction(auctionId) });
});

// Section 24: Purchase Correction 1 — Undo Entire Sale
app.post('/api/auctions/:auctionId/items/:itemId/undo-sale', requireAuctionAdmin, (req, res) => {
  const { auctionId, itemId } = req.params;
  const { returnTo = 'QUEUE' } = req.body || {};

  try {
    runTransaction(() => {
      const item = db
        .prepare('SELECT * FROM items WHERE id = ? AND auctionId = ?')
        .get(itemId, auctionId);

      if (!item || item.status !== 'SOLD') {
        throw new Error('This item is not currently marked as SOLD.');
      }

      const prevTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(item.soldToTeamId);
      const refundedAmount = Number(item.soldAmount) || 0;
      const targetStatus = returnTo === 'UNSOLD' ? 'UNSOLD' : 'QUEUED';
      const now = new Date().toISOString();

      db.prepare('UPDATE bids SET undone = 1 WHERE itemId = ?').run(item.id);

      db.prepare(`
        UPDATE items
        SET status = ?,
            currentBid = 0,
            highestBidderTeamId = NULL,
            soldToTeamId = NULL,
            soldAmount = NULL,
            soldAt = NULL,
            soldViaRtm = 0,
            updatedAt = ?
        WHERE id = ?
      `).run(targetStatus, now, item.id);

      const updatedPurse = prevTeam ? recalculateTeamPurse(prevTeam.id) : null;

      db.prepare(`
        INSERT INTO sales_history (
          id, auctionId, itemId, itemName, poolName, eventType,
          teamId, teamName, amount, reauctionNumber, adminName, adminRole, createdAt
        ) VALUES (?, ?, ?, ?, ?, 'SALE_REVERSED', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uid('sh'),
        auctionId,
        item.id,
        item.name,
        item.poolName,
        prevTeam?.id || null,
        prevTeam?.name || 'Unknown Team',
        refundedAmount,
        item.reauctionCount || 0,
        req.user.name,
        req.user.auctionRole,
        now
      );

      recordAudit({
        auctionId,
        user: req.user,
        action: 'Sale reversed',
        entityType: 'ITEM',
        entityId: item.id,
        entityName: item.name,
        previousValue: {
          status: 'SOLD',
          soldToTeamId: prevTeam?.id,
          soldToTeamName: prevTeam?.name,
          soldAmount: refundedAmount
        },
        newValue: {
          status: targetStatus,
          refundedTeamName: prevTeam?.name,
          refundedAmount,
          newTeamPurse: updatedPurse?.remainingPurse
        }
      });
    });

    broadcastAuctionState(auctionId, { type: 'SALE_REVERSED', sound: 'TRANSITION' });
    res.json({ auction: getHydratedAuction(auctionId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Section 24: Purchase Correction 2 — Transfer Purchase to another team
app.post('/api/auctions/:auctionId/items/:itemId/transfer-sale', requireAuctionAdmin, (req, res) => {
  const { auctionId, itemId } = req.params;
  const { targetTeamId, newAmount } = req.body || {};

  if (!targetTeamId) {
    return res.status(400).json({ error: 'Target team is required for purchase transfer.' });
  }

  try {
    runTransaction(() => {
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
      const item = db
        .prepare('SELECT * FROM items WHERE id = ? AND auctionId = ?')
        .get(itemId, auctionId);

      if (!item || item.status !== 'SOLD') {
        throw new Error('Only SOLD items can be transferred.');
      }

      if (item.soldToTeamId === targetTeamId && (newAmount === undefined || Number(newAmount) === Number(item.soldAmount))) {
        throw new Error('Item is already owned by this team at the same amount.');
      }

      const fromTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(item.soldToTeamId);
      const toTeam = db
        .prepare('SELECT * FROM teams WHERE id = ? AND auctionId = ?')
        .get(targetTeamId, auctionId);

      if (!toTeam) throw new Error('Target team not found.');

      const transferPrice =
        newAmount !== undefined && newAmount !== null && newAmount !== ''
          ? Number(newAmount)
          : Number(item.soldAmount);

      if (transferPrice <= 0) {
        throw new Error('Transfer purchase price must be greater than zero.');
      }

      // Check target team's available purse
      const toTeamPurseBefore = recalculateTeamPurse(toTeam.id).remainingPurse;
      const availableForTransfer =
        fromTeam?.id === toTeam.id
          ? toTeamPurseBefore + Number(item.soldAmount)
          : toTeamPurseBefore;

      if (transferPrice > availableForTransfer) {
        throw new Error(
          `Cannot transfer: ${toTeam.name} only has ${formatCurrency(availableForTransfer, auction.currency)} available.`
        );
      }

      const now = new Date().toISOString();

      db.prepare(`
        UPDATE items
        SET soldToTeamId = ?, soldAmount = ?, currentBid = ?, highestBidderTeamId = ?, updatedAt = ?
        WHERE id = ?
      `).run(toTeam.id, transferPrice, transferPrice, toTeam.id, now, item.id);

      const fromPurseAfter = fromTeam ? recalculateTeamPurse(fromTeam.id) : null;
      const toPurseAfter = recalculateTeamPurse(toTeam.id);

      db.prepare(`
        INSERT INTO sales_history (
          id, auctionId, itemId, itemName, poolName, eventType,
          teamId, teamName, amount, reauctionNumber, adminName, adminRole, createdAt
        ) VALUES (?, ?, ?, ?, ?, 'PURCHASE_TRANSFERRED', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uid('sh'),
        auctionId,
        item.id,
        item.name,
        item.poolName,
        toTeam.id,
        `${fromTeam?.name || 'Previous'} → ${toTeam.name}`,
        transferPrice,
        item.reauctionCount || 0,
        req.user.name,
        req.user.auctionRole,
        now
      );

      recordAudit({
        auctionId,
        user: req.user,
        action: 'Purchase transferred',
        entityType: 'ITEM',
        entityId: item.id,
        entityName: item.name,
        previousValue: {
          teamId: fromTeam?.id,
          teamName: fromTeam?.name,
          amount: item.soldAmount
        },
        newValue: {
          teamId: toTeam.id,
          teamName: toTeam.name,
          amount: transferPrice,
          fromTeamNewPurse: fromPurseAfter?.remainingPurse,
          toTeamNewPurse: toPurseAfter.remainingPurse
        }
      });
    });

    broadcastAuctionState(auctionId, { type: 'PURCHASE_TRANSFERRED', sound: 'TRANSITION' });
    res.json({ auction: getHydratedAuction(auctionId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// 8. QUEUE, ITEMS / PLAYERS & IMAGE SYSTEM (Sections 11, 12, 13, 14)
// ============================================================================

// Section 14: Reorder Queue (Current active item cannot be reordered)
app.put('/api/auctions/:auctionId/queue/reorder', requireAuctionAdmin, (req, res) => {
  const { auctionId } = req.params;
  const { orderedItemIds } = req.body || {};

  if (!Array.isArray(orderedItemIds)) {
    return res.status(400).json({ error: 'orderedItemIds array is required.' });
  }

  runTransaction(() => {
    const auction = db.prepare('SELECT activeItemId FROM auctions WHERE id = ?').get(auctionId);
    const stmt = db.prepare(
      "UPDATE items SET queueOrder = ?, updatedAt = ? WHERE id = ? AND auctionId = ? AND status = 'QUEUED'"
    );
    const now = new Date().toISOString();

    orderedItemIds.forEach((id, index) => {
      if (id !== auction?.activeItemId) {
        stmt.run(index, now, id, auctionId);
      }
    });

    recordAudit({
      auctionId,
      user: req.user,
      action: 'Queue reordered',
      entityType: 'QUEUE',
      entityId: auctionId,
      entityName: 'Auction Queue',
      previousValue: null,
      newValue: { count: orderedItemIds.length }
    });
  });

  broadcastAuctionState(auctionId);
  res.json({ auction: getHydratedAuction(auctionId) });
});

// Section 11, 12, 14: Add Single Item (Manual Entry + Automatic Image Search + Queue Position)
app.post('/api/auctions/:auctionId/items', requireAuctionAdmin, async (req, res) => {
  const { auctionId } = req.params;
  const { name, basePrice, poolName, poolId, imageUrl, queuePosition } = req.body || {};

  if (!name || basePrice === undefined || (!poolName && !poolId)) {
    return res.status(400).json({ error: 'Item Name, Base Price, and Pool/Category are required.' });
  }

  const numBasePrice = Number(basePrice);
  if (Number.isNaN(numBasePrice) || numBasePrice <= 0) {
    return res.status(400).json({ error: 'Base price must be greater than zero.' });
  }

  // Enforce exclusivity: if player is in retention, they cannot be in auction
  const existingRetention = findRetentionByPlayerName(auctionId, name);
  if (existingRetention) {
    return res.status(400).json({
      error: `${name.trim()} is already retained by ${existingRetention.teamName} and cannot be added to the auction.`
    });
  }

  let resolvedPool = null;
  if (poolId) {
    resolvedPool = db
      .prepare('SELECT * FROM pools WHERE id = ? AND auctionId = ?')
      .get(poolId, auctionId);
  }
  if (!resolvedPool && poolName) {
    resolvedPool = db
      .prepare('SELECT * FROM pools WHERE LOWER(name) = ? AND auctionId = ?')
      .get(String(poolName).trim().toLowerCase(), auctionId);
  }

  const finalPoolName = resolvedPool?.name || String(poolName).trim();

  // Section 12: Automatically find suitable image online if not manually supplied
  const finalImageUrl =
    imageUrl && String(imageUrl).trim()
      ? String(imageUrl).trim()
      : await resolveItemImage({ name: name.trim(), pool: finalPoolName });

  const itemId = uid('item');
  const now = new Date().toISOString();

  runTransaction(() => {
    const queuedItems = db
      .prepare("SELECT id, queueOrder FROM items WHERE auctionId = ? AND status = 'QUEUED' ORDER BY queueOrder ASC")
      .all(auctionId);

    let insertOrder = queuedItems.length;
    if (
      queuePosition !== undefined &&
      queuePosition !== null &&
      queuePosition !== '' &&
      Number(queuePosition) >= 0 &&
      Number(queuePosition) <= queuedItems.length
    ) {
      const targetIdx = Math.max(0, Math.min(queuedItems.length, Number(queuePosition)));
      insertOrder = targetIdx;
      // Shift existing items at or after targetIdx
      queuedItems.forEach((qi, idx) => {
        const adjusted = idx >= targetIdx ? idx + 1 : idx;
        db.prepare('UPDATE items SET queueOrder = ? WHERE id = ?').run(adjusted, qi.id);
      });
    } else {
      const maxRow = db
        .prepare('SELECT COALESCE(MAX(queueOrder), -1) AS maxOrder FROM items WHERE auctionId = ?')
        .get(auctionId);
      insertOrder = (Number(maxRow?.maxOrder) || 0) + 1;
    }

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
      name.trim(),
      finalImageUrl,
      numBasePrice,
      numBasePrice,
      resolvedPool?.id || null,
      finalPoolName,
      insertOrder,
      now,
      now
    );

    recordAudit({
      auctionId,
      user: req.user,
      action: 'Item added',
      entityType: 'ITEM',
      entityId: itemId,
      entityName: name.trim(),
      previousValue: null,
      newValue: {
        name: name.trim(),
        basePrice: numBasePrice,
        poolName: finalPoolName,
        queueOrder: insertOrder
      }
    });
  });

  broadcastAuctionState(auctionId);
  res.json({ auction: getHydratedAuction(auctionId), itemId });
});

// Section 11: Bulk Excel/CSV Item Import with Validation & Auto Image Resolution
app.post('/api/auctions/:auctionId/items/bulk', requireAuctionAdmin, async (req, res) => {
  const { auctionId } = req.params;
  const { items } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No valid rows found to import.' });
  }

  // Validate all rows first (Section 11)
  const validated = [];
  const errors = [];

  items.forEach((row, idx) => {
    const itemName = String(row.name || row.Name || row.player || row.Player || '').trim();
    const poolName = String(
      row.pool || row.Pool || row.category || row.Category || 'General Pool'
    ).trim();
    const rawPrice = row.basePrice ?? row.BasePrice ?? row['Base Price'] ?? row.price ?? 0;
    const basePrice = Number(rawPrice);

    if (!itemName) {
      errors.push(`Row ${idx + 1}: Missing Name`);
      return;
    }
    if (Number.isNaN(basePrice) || basePrice <= 0) {
      errors.push(`Row ${idx + 1} (${itemName}): Invalid Base Price "${rawPrice}"`);
      return;
    }
    const existingRetention = findRetentionByPlayerName(auctionId, itemName);
    if (existingRetention) {
      errors.push(`Row ${idx + 1} (${itemName}): Already retained by ${existingRetention.teamName} — skipped`);
      return;
    }

    validated.push({
      name: itemName,
      poolName,
      basePrice,
      imageUrl: row.imageUrl || row.Image || row.image || null
    });
  });

  if (errors.length > 0 && validated.length === 0) {
    return res.status(400).json({ error: `Import validation failed: ${errors.slice(0, 5).join('; ')}` });
  }

  const now = new Date().toISOString();
  const insertedIds = [];

  runTransaction(() => {
    const pools = db.prepare('SELECT * FROM pools WHERE auctionId = ?').all(auctionId);
    const poolMap = new Map(pools.map(p => [p.name.toLowerCase(), p]));

    const maxRow = db
      .prepare('SELECT COALESCE(MAX(queueOrder), -1) AS maxOrder FROM items WHERE auctionId = ?')
      .get(auctionId);
    let nextOrder = (Number(maxRow?.maxOrder) || 0) + 1;

    for (const v of validated) {
      let poolObj = poolMap.get(v.poolName.toLowerCase());
      if (!poolObj) {
        const newPoolId = uid('pool');
        db.prepare(`
          INSERT INTO pools (id, auctionId, name, defaultBasePrice, isLegendPool, sortOrder, createdAt)
          VALUES (?, ?, ?, ?, 0, ?, ?)
        `).run(newPoolId, auctionId, v.poolName, v.basePrice, poolMap.size, now);
        poolObj = { id: newPoolId, name: v.poolName };
        poolMap.set(v.poolName.toLowerCase(), poolObj);
      }

      const itemId = uid('item');
      const initialImg =
        v.imageUrl ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(v.name)}&background=111827&color=F59E0B&size=400&bold=true`;

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
        v.name,
        initialImg,
        v.basePrice,
        v.basePrice,
        poolObj.id,
        poolObj.name,
        nextOrder++,
        now,
        now
      );

      insertedIds.push({ id: itemId, name: v.name, poolName: poolObj.name, hasCustomImg: Boolean(v.imageUrl) });
    }

    recordAudit({
      auctionId,
      user: req.user,
      action: 'Item added (Bulk Import)',
      entityType: 'ITEM',
      entityId: auctionId,
      entityName: `${validated.length} items imported`,
      previousValue: null,
      newValue: { importedCount: validated.length, warningsCount: errors.length }
    });
  });

  broadcastAuctionState(auctionId);
  res.json({
    auction: getHydratedAuction(auctionId),
    importedCount: validated.length,
    warnings: errors
  });

  // Resolve real online images asynchronously for imported items that didn't specify a custom URL
  (async () => {
    for (const item of insertedIds) {
      if (!item.hasCustomImg) {
        try {
          const resolvedUrl = await resolveItemImage({ name: item.name, pool: item.poolName });
          db.prepare('UPDATE items SET imageUrl = ? WHERE id = ?').run(resolvedUrl, item.id);
        } catch {
          // Ignore individual resolution error
        }
      }
    }
    broadcastAuctionState(auctionId);
  })();
});

// Edit Item (Name, Base Price, Pool, Manual Image Replacement)
app.patch('/api/auctions/:auctionId/items/:itemId', requireAuctionAdmin, (req, res) => {
  const { auctionId, itemId } = req.params;
  const { name, basePrice, poolName, poolId, imageUrl } = req.body || {};

  const item = db
    .prepare('SELECT * FROM items WHERE id = ? AND auctionId = ?')
    .get(itemId, auctionId);

  if (!item) return res.status(404).json({ error: 'Item not found.' });

  const updatedName = name !== undefined ? String(name).trim() : item.name;
  const existingRetention = findRetentionByPlayerName(auctionId, updatedName);
  if (existingRetention) {
    return res.status(400).json({
      error: `${updatedName} is already retained by ${existingRetention.teamName} and cannot be in the auction.`
    });
  }

  const updatedPrice = basePrice !== undefined ? Number(basePrice) : Number(item.basePrice);
  const updatedImage = imageUrl !== undefined ? String(imageUrl).trim() : item.imageUrl;

  let updatedPoolId = item.poolId;
  let updatedPoolName = item.poolName;

  if (poolId) {
    const p = db.prepare('SELECT * FROM pools WHERE id = ? AND auctionId = ?').get(poolId, auctionId);
    if (p) {
      updatedPoolId = p.id;
      updatedPoolName = p.name;
    }
  } else if (poolName !== undefined) {
    updatedPoolName = String(poolName).trim();
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE items
    SET name = ?, basePrice = ?, poolId = ?, poolName = ?, imageUrl = ?, updatedAt = ?
    WHERE id = ?
  `).run(updatedName, updatedPrice, updatedPoolId, updatedPoolName, updatedImage, now, itemId);

  recordAudit({
    auctionId,
    user: req.user,
    action: imageUrl !== undefined && imageUrl !== item.imageUrl ? 'Item image changed' : 'Item edited',
    entityType: 'ITEM',
    entityId: itemId,
    entityName: updatedName,
    previousValue: { name: item.name, basePrice: item.basePrice, poolName: item.poolName },
    newValue: { name: updatedName, basePrice: updatedPrice, poolName: updatedPoolName }
  });

  broadcastAuctionState(auctionId);
  res.json({ auction: getHydratedAuction(auctionId) });
});

// Section 12: REFRESH ALL PLAYER IMAGES across the entire auction (items + retentions)
app.post('/api/auctions/:auctionId/items/refresh-all-images', requireAuctionAdmin, async (req, res) => {
  const { auctionId } = req.params;
  const items = db
    .prepare('SELECT * FROM items WHERE auctionId = ? ORDER BY queueOrder ASC')
    .all(auctionId);
  const retentions = db
    .prepare('SELECT * FROM retentions WHERE auctionId = ? ORDER BY createdAt ASC')
    .all(auctionId);

  if ((!items || items.length === 0) && (!retentions || retentions.length === 0)) {
    return res.status(400).json({ error: 'No items/players found in this auction to refresh.' });
  }

  const now = new Date().toISOString();
  const updateItemStmt = db.prepare('UPDATE items SET imageUrl = ?, updatedAt = ? WHERE id = ?');
  const updateRetStmt = db.prepare('UPDATE retentions SET imageUrl = ?, updatedAt = ? WHERE id = ?');
  let refreshedCount = 0;

  // Process items in concurrent batches of 6 for reliable resolution
  const batchSize = 6;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const resolvedBatch = await Promise.all(
      batch.map(async item => {
        try {
          const url = await resolveItemImage({
            name: item.name,
            pool: item.poolName,
            skipUrl: null,
            existingUrl: item.imageUrl
          });
          return { id: item.id, url };
        } catch {
          return null;
        }
      })
    );

    runTransaction(() => {
      for (const r of resolvedBatch) {
        if (r && r.url) {
          updateItemStmt.run(r.url, now, r.id);
          refreshedCount++;
        }
      }
    });

    broadcastAuctionState(auctionId);
  }

  // Also refresh retention player images
  for (let i = 0; i < retentions.length; i += batchSize) {
    const batch = retentions.slice(i, i + batchSize);
    const resolvedBatch = await Promise.all(
      batch.map(async ret => {
        try {
          const url = await resolveItemImage({
            name: ret.playerName,
            pool: 'RETENTION',
            skipUrl: null,
            existingUrl: ret.imageUrl
          });
          return { id: ret.id, url };
        } catch {
          return null;
        }
      })
    );

    runTransaction(() => {
      for (const r of resolvedBatch) {
        if (r && r.url) {
          updateRetStmt.run(r.url, now, r.id);
          refreshedCount++;
        }
      }
    });
  }

  recordAudit({
    auctionId,
    user: req.user,
    action: 'All player/item images refreshed',
    entityType: 'ITEM',
    entityId: auctionId,
    entityName: `${refreshedCount} items refreshed`,
    previousValue: { itemsCount: items.length },
    newValue: { refreshedCount }
  });

  broadcastAuctionState(auctionId);
  res.json({
    auction: getHydratedAuction(auctionId),
    refreshedCount
  });
});

// Section 12: REFRESH IMAGE button for manual image re-search
app.post('/api/auctions/:auctionId/items/:itemId/refresh-image', requireAuctionAdmin, async (req, res) => {
  const { auctionId, itemId } = req.params;
  const item = db
    .prepare('SELECT * FROM items WHERE id = ? AND auctionId = ?')
    .get(itemId, auctionId);

  if (!item) return res.status(404).json({ error: 'Item not found.' });

  const newImageUrl = await resolveItemImage({
    name: item.name,
    pool: item.poolName,
    skipUrl: null,
    existingUrl: item.imageUrl
  });

  const now = new Date().toISOString();
  db.prepare('UPDATE items SET imageUrl = ?, updatedAt = ? WHERE id = ?').run(
    newImageUrl,
    now,
    itemId
  );

  recordAudit({
    auctionId,
    user: req.user,
    action: 'Item image changed',
    entityType: 'ITEM',
    entityId: itemId,
    entityName: item.name,
    previousValue: { imageUrl: item.imageUrl },
    newValue: { imageUrl: newImageUrl }
  });

  broadcastAuctionState(auctionId);
  res.json({ auction: getHydratedAuction(auctionId), imageUrl: newImageUrl });
});

// Delete Item
app.delete('/api/auctions/:auctionId/items/:itemId', requireAuctionAdmin, (req, res) => {
  const { auctionId, itemId } = req.params;
  const item = db
    .prepare('SELECT * FROM items WHERE id = ? AND auctionId = ?')
    .get(itemId, auctionId);

  if (!item) return res.status(404).json({ error: 'Item not found.' });
  if (item.status === 'ACTIVE') {
    return res.status(400).json({ error: 'Cannot delete the currently active item. Withdraw or skip it first.' });
  }

  runTransaction(() => {
    const soldTeamId = item.soldToTeamId;
    db.prepare('DELETE FROM items WHERE id = ?').run(itemId);
    if (soldTeamId) {
      recalculateTeamPurse(soldTeamId);
    }

    recordAudit({
      auctionId,
      user: req.user,
      action: 'Item deleted',
      entityType: 'ITEM',
      entityId: itemId,
      entityName: item.name,
      previousValue: { name: item.name, basePrice: item.basePrice, poolName: item.poolName },
      newValue: null
    });
  });

  broadcastAuctionState(auctionId);
  res.json({ auction: getHydratedAuction(auctionId) });
});

// ============================================================================
// 9. POOLS / POOL SETS CRUD, BATCH PLAYERS & QUEUE ACTIVATION (Section 13)
// ============================================================================

app.post('/api/auctions/:auctionId/pools', requireAuctionAdmin, async (req, res) => {
  const { auctionId } = req.params;
  const {
    name,
    defaultBasePrice = 10_000_000,
    isLegendPool = false,
    playerNames = []
  } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Pool Set name is required.' });
  }

  const trimmedPoolName = String(name).trim();
  const numDefaultBasePrice = Number(defaultBasePrice) || 10_000_000;
  const rawPlayers = Array.isArray(playerNames)
    ? playerNames
    : typeof playerNames === 'string'
      ? playerNames.split(/[\r\n,]+/)
      : [];
  const cleanedPlayers = Array.from(
    new Set(
      rawPlayers
        .map(p => String(p || '').trim())
        .filter(Boolean)
    )
  );

  const poolId = uid('pool');
  const now = new Date().toISOString();
  const insertedItems = [];
  const skippedRetained = [];

  runTransaction(() => {
    const maxSort = db
      .prepare('SELECT COALESCE(MAX(sortOrder), -1) AS maxSort FROM pools WHERE auctionId = ?')
      .get(auctionId);

    db.prepare(`
      INSERT INTO pools (id, auctionId, name, defaultBasePrice, isLegendPool, sortOrder, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      poolId,
      auctionId,
      trimmedPoolName,
      numDefaultBasePrice,
      isLegendPool ? 1 : 0,
      (Number(maxSort?.maxSort) || 0) + 1,
      now
    );

    if (cleanedPlayers.length > 0) {
      const maxRow = db
        .prepare('SELECT COALESCE(MAX(queueOrder), -1) AS maxOrder FROM items WHERE auctionId = ?')
        .get(auctionId);
      let nextOrder = (Number(maxRow?.maxOrder) || 0) + 1;

      for (const playerName of cleanedPlayers) {
        const ret = findRetentionByPlayerName(auctionId, playerName);
        if (ret) {
          skippedRetained.push(`${playerName} (retained by ${ret.teamName})`);
          continue;
        }

        const itemId = uid('item');
        const initialImg = `https://ui-avatars.com/api/?name=${encodeURIComponent(playerName)}&background=111827&color=F59E0B&size=400&bold=true`;

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
          playerName,
          initialImg,
          numDefaultBasePrice,
          numDefaultBasePrice,
          poolId,
          trimmedPoolName,
          nextOrder++,
          now,
          now
        );

        insertedItems.push({ id: itemId, name: playerName, poolName: trimmedPoolName });
      }
    }

    recordAudit({
      auctionId,
      user: req.user,
      action: 'Pool Set created',
      entityType: 'POOL',
      entityId: poolId,
      entityName: trimmedPoolName,
      previousValue: null,
      newValue: {
        name: trimmedPoolName,
        defaultBasePrice: numDefaultBasePrice,
        addedPlayers: insertedItems.length
      }
    });
  });

  broadcastAuctionState(auctionId);
  res.json({
    auction: getHydratedAuction(auctionId),
    poolId,
    addedPlayersCount: insertedItems.length,
    skippedRetained
  });

  if (insertedItems.length > 0) {
    (async () => {
      for (const item of insertedItems) {
        try {
          const resolvedUrl = await resolveItemImage({ name: item.name, pool: item.poolName });
          db.prepare('UPDATE items SET imageUrl = ? WHERE id = ?').run(resolvedUrl, item.id);
        } catch {
          // Ignore individual resolution error
        }
      }
      broadcastAuctionState(auctionId);
    })();
  }
});

// Move all QUEUED items of a Pool Set to the top of the live auction queue (optionally shuffled)
app.post('/api/auctions/:auctionId/pools/:poolId/activate-set', requireAuctionAdmin, (req, res) => {
  const { auctionId, poolId } = req.params;
  const { shuffle = false } = req.body || {};

  const pool = db
    .prepare('SELECT * FROM pools WHERE id = ? AND auctionId = ?')
    .get(poolId, auctionId);
  if (!pool) return res.status(404).json({ error: 'Pool Set not found.' });

  let movedCount = 0;

  runTransaction(() => {
    const queuedItems = db
      .prepare("SELECT * FROM items WHERE auctionId = ? AND status = 'QUEUED' ORDER BY queueOrder ASC")
      .all(auctionId);

    const setItems = queuedItems.filter(
      it => it.poolId === pool.id || String(it.poolName).toLowerCase() === String(pool.name).toLowerCase()
    );
    const otherItems = queuedItems.filter(
      it => !(it.poolId === pool.id || String(it.poolName).toLowerCase() === String(pool.name).toLowerCase())
    );

    if (setItems.length === 0) {
      throw new Error(`No queued items found in Pool Set "${pool.name}".`);
    }

    if (shuffle) {
      for (let i = setItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [setItems[i], setItems[j]] = [setItems[j], setItems[i]];
      }
    }

    const combined = [...setItems, ...otherItems];
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE items SET queueOrder = ?, updatedAt = ? WHERE id = ?');
    combined.forEach((it, idx) => stmt.run(idx, now, it.id));
    movedCount = setItems.length;

    recordAudit({
      auctionId,
      user: req.user,
      action: shuffle ? 'Pool Set shuffled to front of queue' : 'Pool Set moved to front of queue',
      entityType: 'POOL',
      entityId: poolId,
      entityName: pool.name,
      previousValue: null,
      newValue: { count: movedCount, shuffled: Boolean(shuffle) }
    });
  });

  broadcastAuctionState(auctionId);
  res.json({ auction: getHydratedAuction(auctionId), movedCount });
});

// Assign existing items to a Pool Set (and optionally sync their basePrice to the Pool Set default)
app.post('/api/auctions/:auctionId/pools/:poolId/assign-items', requireAuctionAdmin, (req, res) => {
  const { auctionId, poolId } = req.params;
  const { itemIds = [], syncBasePrice = false } = req.body || {};

  const pool = db
    .prepare('SELECT * FROM pools WHERE id = ? AND auctionId = ?')
    .get(poolId, auctionId);
  if (!pool) return res.status(404).json({ error: 'Pool Set not found.' });

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ error: 'Select at least one player/item to assign to this Pool Set.' });
  }

  const now = new Date().toISOString();
  runTransaction(() => {
    for (const id of itemIds) {
      if (syncBasePrice) {
        db.prepare(
          'UPDATE items SET poolId = ?, poolName = ?, basePrice = ?, updatedAt = ? WHERE id = ? AND auctionId = ?'
        ).run(pool.id, pool.name, pool.defaultBasePrice, now, id, auctionId);
      } else {
        db.prepare(
          'UPDATE items SET poolId = ?, poolName = ?, updatedAt = ? WHERE id = ? AND auctionId = ?'
        ).run(pool.id, pool.name, now, id, auctionId);
      }
    }

    recordAudit({
      auctionId,
      user: req.user,
      action: 'Players assigned to Pool Set',
      entityType: 'POOL',
      entityId: poolId,
      entityName: pool.name,
      previousValue: null,
      newValue: { assignedCount: itemIds.length, syncBasePrice: Boolean(syncBasePrice) }
    });
  });

  broadcastAuctionState(auctionId);
  res.json({ auction: getHydratedAuction(auctionId) });
});

app.patch('/api/auctions/:auctionId/pools/:poolId', requireAuctionAdmin, (req, res) => {
  const { auctionId, poolId } = req.params;
  const { name, defaultBasePrice, isLegendPool } = req.body || {};

  const pool = db
    .prepare('SELECT * FROM pools WHERE id = ? AND auctionId = ?')
    .get(poolId, auctionId);
  if (!pool) return res.status(404).json({ error: 'Pool not found.' });

  const newName = name !== undefined ? String(name).trim() : pool.name;
  const newPrice = defaultBasePrice !== undefined ? Number(defaultBasePrice) : pool.defaultBasePrice;
  const newLegend = isLegendPool !== undefined ? (isLegendPool ? 1 : 0) : pool.isLegendPool;

  runTransaction(() => {
    db.prepare(
      'UPDATE pools SET name = ?, defaultBasePrice = ?, isLegendPool = ? WHERE id = ?'
    ).run(newName, newPrice, newLegend, poolId);

    if (newName !== pool.name) {
      db.prepare('UPDATE items SET poolName = ? WHERE poolId = ? AND auctionId = ?').run(
        newName,
        poolId,
        auctionId
      );
    }

    recordAudit({
      auctionId,
      user: req.user,
      action: 'Pool updated',
      entityType: 'POOL',
      entityId: poolId,
      entityName: newName,
      previousValue: { name: pool.name, defaultBasePrice: pool.defaultBasePrice },
      newValue: { name: newName, defaultBasePrice: newPrice }
    });
  });

  broadcastAuctionState(auctionId);
  res.json({ auction: getHydratedAuction(auctionId) });
});

app.put('/api/auctions/:auctionId/pools/reorder', requireAuctionAdmin, (req, res) => {
  const { auctionId } = req.params;
  const { orderedPoolIds } = req.body || {};
  if (!Array.isArray(orderedPoolIds)) {
    return res.status(400).json({ error: 'orderedPoolIds array required.' });
  }

  runTransaction(() => {
    const stmt = db.prepare('UPDATE pools SET sortOrder = ? WHERE id = ? AND auctionId = ?');
    orderedPoolIds.forEach((id, idx) => stmt.run(idx, id, auctionId));
  });

  broadcastAuctionState(auctionId);
  res.json({ auction: getHydratedAuction(auctionId) });
});

app.delete('/api/auctions/:auctionId/pools/:poolId', requireAuctionAdmin, (req, res) => {
  const { auctionId, poolId } = req.params;
  const pool = db
    .prepare('SELECT * FROM pools WHERE id = ? AND auctionId = ?')
    .get(poolId, auctionId);
  if (!pool) return res.status(404).json({ error: 'Pool not found.' });

  db.prepare('DELETE FROM pools WHERE id = ?').run(poolId);
  recordAudit({
    auctionId,
    user: req.user,
    action: 'Pool deleted',
    entityType: 'POOL',
    entityId: poolId,
    entityName: pool.name,
    previousValue: { name: pool.name },
    newValue: null
  });

  broadcastAuctionState(auctionId);
  res.json({ auction: getHydratedAuction(auctionId) });
});

// ============================================================================
// 10. TEAM MANAGEMENT & PURSE ADJUSTMENTS (Sections 7, 25)
// ============================================================================

app.post('/api/auctions/:auctionId/teams', requireAuctionAdmin, async (req, res) => {
  const { auctionId } = req.params;
  const {
    name,
    shortName,
    code,
    pin,
    logoUrl,
    primaryColor,
    secondaryColor,
    startingPurse,
    rtmCardsTotal
  } = req.body || {};

  if (!name) return res.status(400).json({ error: 'Team Name is required.' });

  const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
  if (!auction) return res.status(404).json({ error: 'Auction not found.' });

  const customLogos = getPlatformSettings().customLogos || [];
  const identity = await resolveTeamIdentity({
    name: name.trim(),
    shortName,
    primaryColor,
    secondaryColor,
    logoUrl,
    customLogos
  });

  const existingTeams = db
    .prepare('SELECT COUNT(*) AS cnt FROM teams WHERE auctionId = ?')
    .get(auctionId);
  const idx = Number(existingTeams?.cnt) || 0;

  const teamId = uid('team');
  const teamCode = (code || identity.shortName || `TM${idx + 1}`).trim().toUpperCase();
  const teamPin = String(pin || 1001 + idx).trim();
  const initialPurse =
    startingPurse !== undefined ? Number(startingPurse) : Number(auction.startingPurse);
  const initialRtm =
    rtmCardsTotal !== undefined
      ? Math.max(0, Number(rtmCardsTotal) || 0)
      : Math.max(0, Number(auction.maxRtmPerTeam ?? 0));
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO teams (
      id, auctionId, name, shortName, code, pin, logoUrl,
      primaryColor, secondaryColor, startingPurse, remainingPurse,
      rtmCardsTotal, disabled, sortOrder, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    teamId,
    auctionId,
    name.trim(),
    identity.shortName,
    teamCode,
    teamPin,
    identity.logoUrl,
    identity.primaryColor,
    identity.secondaryColor,
    initialPurse,
    initialPurse,
    initialRtm,
    idx,
    now
  );

  recordAudit({
    auctionId,
    user: req.user,
    action: 'Team created',
    entityType: 'TEAM',
    entityId: teamId,
    entityName: name.trim(),
    previousValue: null,
    newValue: {
      name: name.trim(),
      code: teamCode,
      startingPurse: initialPurse,
      rtmCardsTotal: initialRtm,
      primaryColor: identity.primaryColor
    }
  });

  broadcastAuctionState(auctionId);
  res.json({ auction: getHydratedAuction(auctionId) });
});

app.patch('/api/auctions/:auctionId/teams/:teamId', requireAuctionAdmin, (req, res) => {
  const { auctionId, teamId } = req.params;
  const {
    name,
    shortName,
    code,
    pin,
    logoUrl,
    primaryColor,
    secondaryColor,
    startingPurse,
    rtmCardsTotal,
    disabled
  } = req.body || {};

  const team = db
    .prepare('SELECT * FROM teams WHERE id = ? AND auctionId = ?')
    .get(teamId, auctionId);
  if (!team) return res.status(404).json({ error: 'Team not found.' });

  try {
    runTransaction(() => {
      const updatedName = name !== undefined ? String(name).trim() : team.name;
      const updatedShort = shortName !== undefined ? String(shortName).trim().toUpperCase() : team.shortName;
      const updatedCode = code !== undefined ? String(code).trim().toUpperCase() : team.code;
      const updatedPin = pin !== undefined ? String(pin).trim() : team.pin;
      const updatedLogo = logoUrl !== undefined ? String(logoUrl).trim() : team.logoUrl;
      const updatedPrimary = primaryColor || team.primaryColor;
      const updatedSecondary = secondaryColor || team.secondaryColor;
      const updatedStartingPurse =
        startingPurse !== undefined ? Number(startingPurse) : Number(team.startingPurse);
      const updatedRtmCardsTotal =
        rtmCardsTotal !== undefined
          ? Math.max(0, Number(rtmCardsTotal) || 0)
          : team.rtmCardsTotal !== null && team.rtmCardsTotal !== undefined
            ? Number(team.rtmCardsTotal)
            : null;
      const updatedDisabled = disabled !== undefined ? (disabled ? 1 : 0) : team.disabled;

      db.prepare(`
        UPDATE teams
        SET name = ?, shortName = ?, code = ?, pin = ?, logoUrl = ?,
            primaryColor = ?, secondaryColor = ?, startingPurse = ?,
            rtmCardsTotal = ?, disabled = ?
        WHERE id = ?
      `).run(
        updatedName,
        updatedShort,
        updatedCode,
        updatedPin,
        updatedLogo,
        updatedPrimary,
        updatedSecondary,
        updatedStartingPurse,
        updatedRtmCardsTotal,
        updatedDisabled,
        teamId
      );

      const newPurseState = recalculateTeamPurse(teamId);
      if (newPurseState.remainingPurse < 0) {
        throw new Error('Cannot set starting purse lower than current total team spending.');
      }

      recordAudit({
        auctionId,
        user: req.user,
        action: 'Team edited',
        entityType: 'TEAM',
        entityId: teamId,
        entityName: updatedName,
        previousValue: {
          name: team.name,
          code: team.code,
          startingPurse: team.startingPurse,
          rtmCardsTotal: team.rtmCardsTotal,
          disabled: Boolean(team.disabled)
        },
        newValue: {
          name: updatedName,
          code: updatedCode,
          startingPurse: updatedStartingPurse,
          remainingPurse: newPurseState.remainingPurse,
          rtmCardsTotal: updatedRtmCardsTotal,
          disabled: Boolean(updatedDisabled)
        }
      });
    });

    broadcastAuctionState(auctionId);
    res.json({ auction: getHydratedAuction(auctionId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Section 25: Add Funds / Deduct Funds (Requires Amount + Reason + Admin + Timestamp)
app.post('/api/auctions/:auctionId/teams/:teamId/purse-adjustment', requireAuctionAdmin, (req, res) => {
  const { auctionId, teamId } = req.params;
  const { type = 'ADD', amount, reason } = req.body || {};

  const numAmount = Math.abs(Number(amount) || 0);
  if (numAmount <= 0) {
    return res.status(400).json({ error: 'Adjustment amount must be greater than zero.' });
  }
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: 'A reason is required for every purse adjustment.' });
  }

  try {
    runTransaction(() => {
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
      const team = db
        .prepare('SELECT * FROM teams WHERE id = ? AND auctionId = ?')
        .get(teamId, auctionId);
      if (!team) throw new Error('Team not found.');

      const beforeState = recalculateTeamPurse(teamId);
      const signedDelta = type === 'DEDUCT' ? -numAmount : numAmount;

      if (beforeState.remainingPurse + signedDelta < 0) {
        throw new Error(
          `Cannot deduct ${formatCurrency(numAmount, auction.currency)}: ${team.name} only has ${formatCurrency(beforeState.remainingPurse, auction.currency)} remaining. Negative purse is prohibited.`
        );
      }

      const now = new Date().toISOString();
      const adjId = uid('padj');

      db.prepare(`
        INSERT INTO purse_adjustments (
          id, auctionId, teamId, amount, previousPurse, newPurse,
          reason, adminId, adminName, adminRole, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        adjId,
        auctionId,
        teamId,
        signedDelta,
        beforeState.remainingPurse,
        beforeState.remainingPurse + signedDelta,
        String(reason).trim(),
        req.user.id,
        req.user.name,
        req.user.auctionRole,
        now
      );

      const afterState = recalculateTeamPurse(teamId);

      recordAudit({
        auctionId,
        user: req.user,
        action: signedDelta > 0 ? 'Purse increased' : 'Purse decreased',
        entityType: 'TEAM',
        entityId: teamId,
        entityName: team.name,
        previousValue: { remainingPurse: beforeState.remainingPurse },
        newValue: {
          remainingPurse: afterState.remainingPurse,
          adjustment: signedDelta,
          reason: String(reason).trim()
        }
      });
    });

    broadcastAuctionState(auctionId);
    res.json({ auction: getHydratedAuction(auctionId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/auctions/:auctionId/teams/:teamId', requireAuctionAdmin, (req, res) => {
  const { auctionId, teamId } = req.params;
  const team = db
    .prepare('SELECT * FROM teams WHERE id = ? AND auctionId = ?')
    .get(teamId, auctionId);
  if (!team) return res.status(404).json({ error: 'Team not found.' });

  const soldCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM items WHERE soldToTeamId = ? AND status = 'SOLD'")
    .get(teamId)?.cnt || 0;
  if (soldCount > 0) {
    return res.status(400).json({
      error: `Cannot delete ${team.name} because they have ${soldCount} purchased items. Disable the team or undo/transfer their purchases first.`
    });
  }

  db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);
  recordAudit({
    auctionId,
    user: req.user,
    action: 'Team deleted',
    entityType: 'TEAM',
    entityId: teamId,
    entityName: team.name,
    previousValue: { name: team.name, code: team.code },
    newValue: null
  });

  broadcastAuctionState(auctionId);
  res.json({ auction: getHydratedAuction(auctionId) });
});

// ============================================================================
// 11. RETENTION SYSTEM (Sections 26, 27, 28, 29)
// ============================================================================

// Section 26: Manual Retention Entry (Team, Player/Item Name, Retention Amount)
// Retained players cannot remain in the auction queue — automatically removed.
app.post('/api/auctions/:auctionId/retentions', requireAuctionAdmin, async (req, res) => {
  const { auctionId } = req.params;
  const { teamId, playerName, amount } = req.body || {};

  if (!teamId || !playerName || amount === undefined) {
    return res.status(400).json({ error: 'Team, Player/Item Name, and Retention Amount are required.' });
  }

  const numAmount = Number(amount);
  if (Number.isNaN(numAmount) || numAmount < 0) {
    return res.status(400).json({ error: 'Retention amount must be a valid non-negative number.' });
  }

  const cleanName = String(playerName).replace(/\s*\(Retained Core\)\s*/gi, '').trim();
  const resolvedImg = await resolveItemImage({ name: cleanName, pool: 'RETENTION' });

  try {
    runTransaction(() => {
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
      if (!auction) throw new Error('Auction not found.');

      // Section 27 & 28: Once LIVE, Retentions are LOCKED
      if (
        auction.status === AUCTION_STATES.LIVE ||
        auction.status === AUCTION_STATES.PAUSED ||
        auction.status === AUCTION_STATES.COMPLETED
      ) {
        throw new Error('Retentions are LOCKED once the auction has gone LIVE.');
      }

      const existingRetention = findRetentionByPlayerName(auctionId, cleanName);
      if (existingRetention) {
        throw new Error(`${cleanName} is already retained by ${existingRetention.teamName}.`);
      }

      const soldItem = db
        .prepare("SELECT * FROM items WHERE auctionId = ? AND status = 'SOLD'")
        .all(auctionId)
        .find(it => cleanPlayerKey(it.name) === cleanPlayerKey(cleanName));
      if (soldItem) {
        throw new Error(`${cleanName} has already been SOLD in this auction and cannot be retained.`);
      }

      const team = db
        .prepare('SELECT * FROM teams WHERE id = ? AND auctionId = ?')
        .get(teamId, auctionId);
      if (!team) throw new Error('Team not found.');

      const existingCount =
        db
          .prepare('SELECT COUNT(*) AS cnt FROM retentions WHERE auctionId = ? AND teamId = ?')
          .get(auctionId, teamId)?.cnt || 0;

      if (existingCount >= Number(auction.maxRetentionsPerTeam)) {
        throw new Error(
          `Maximum retention count (${auction.maxRetentionsPerTeam}) reached for ${team.name}.`
        );
      }

      const purseBefore = recalculateTeamPurse(teamId).remainingPurse;
      if (numAmount > purseBefore) {
        throw new Error(
          `Insufficient purse: ${team.name} has ${formatCurrency(purseBefore, auction.currency)} remaining, cannot retain for ${formatCurrency(numAmount, auction.currency)}.`
        );
      }

      const retId = uid('ret');
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO retentions (
          id, auctionId, teamId, playerName, amount, imageUrl, createdByUserId, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        retId,
        auctionId,
        teamId,
        cleanName,
        numAmount,
        resolvedImg,
        req.user.id,
        now,
        now
      );

      // Remove retained player from auction queue so they cannot appear in auction
      const removedAuctionItems = removeRetainedPlayerFromAuctionItems(auctionId, cleanName);

      // Section 26: Retention amount is immediately deducted from team's purse
      const purseAfter = recalculateTeamPurse(teamId).remainingPurse;

      recordAudit({
        auctionId,
        user: req.user,
        action: 'Retention created',
        entityType: 'RETENTION',
        entityId: retId,
        entityName: cleanName,
        previousValue: { teamName: team.name, remainingPurse: purseBefore },
        newValue: {
          teamName: team.name,
          playerName: cleanName,
          amount: numAmount,
          remainingPurse: purseAfter,
          removedFromAuctionQueue: removedAuctionItems.length
        }
      });
    });

    broadcastAuctionState(auctionId);
    res.json({ auction: getHydratedAuction(auctionId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Section 27: Edit Retention (Editable only before LIVE)
app.patch('/api/auctions/:auctionId/retentions/:retentionId', requireAuctionAdmin, (req, res) => {
  const { auctionId, retentionId } = req.params;
  const { playerName, amount } = req.body || {};

  try {
    runTransaction(() => {
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
      if (!auction) throw new Error('Auction not found.');
      if (
        auction.status === AUCTION_STATES.LIVE ||
        auction.status === AUCTION_STATES.PAUSED ||
        auction.status === AUCTION_STATES.COMPLETED
      ) {
        throw new Error('Retentions are LOCKED once the auction becomes LIVE.');
      }

      const retention = db
        .prepare('SELECT * FROM retentions WHERE id = ? AND auctionId = ?')
        .get(retentionId, auctionId);
      if (!retention) throw new Error('Retention not found.');

      const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(retention.teamId);
      const purseBefore = recalculateTeamPurse(retention.teamId).remainingPurse;

      const updatedName =
        playerName !== undefined
          ? String(playerName).replace(/\s*\(Retained Core\)\s*/gi, '').trim()
          : retention.playerName;
      const updatedAmount = amount !== undefined ? Number(amount) : Number(retention.amount);

      const otherRetention = db
        .prepare('SELECT r.*, t.name AS teamName FROM retentions r JOIN teams t ON r.teamId = t.id WHERE r.auctionId = ? AND r.id != ?')
        .all(auctionId, retentionId)
        .find(r => cleanPlayerKey(r.playerName) === cleanPlayerKey(updatedName));
      if (otherRetention) {
        throw new Error(`${updatedName} is already retained by ${otherRetention.teamName}.`);
      }

      const availableForEdit = purseBefore + Number(retention.amount);
      if (updatedAmount > availableForEdit) {
        throw new Error(
          `Insufficient purse for ${team?.name}: maximum available is ${formatCurrency(availableForEdit, auction.currency)}.`
        );
      }

      const now = new Date().toISOString();
      db.prepare('UPDATE retentions SET playerName = ?, amount = ?, updatedAt = ? WHERE id = ?').run(
        updatedName,
        updatedAmount,
        now,
        retentionId
      );

      removeRetainedPlayerFromAuctionItems(auctionId, updatedName);

      const purseAfter = recalculateTeamPurse(retention.teamId).remainingPurse;

      recordAudit({
        auctionId,
        user: req.user,
        action: 'Retention edited',
        entityType: 'RETENTION',
        entityId: retentionId,
        entityName: updatedName,
        previousValue: {
          teamName: team?.name,
          playerName: retention.playerName,
          amount: retention.amount,
          remainingPurse: purseBefore
        },
        newValue: {
          teamName: team?.name,
          playerName: updatedName,
          amount: updatedAmount,
          remainingPurse: purseAfter
        }
      });
    });

    broadcastAuctionState(auctionId);
    res.json({ auction: getHydratedAuction(auctionId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Section 27: Delete Retention before LIVE -> Automatically refunds full amount
app.delete('/api/auctions/:auctionId/retentions/:retentionId', requireAuctionAdmin, (req, res) => {
  const { auctionId, retentionId } = req.params;

  try {
    runTransaction(() => {
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
      if (!auction) throw new Error('Auction not found.');
      if (
        auction.status === AUCTION_STATES.LIVE ||
        auction.status === AUCTION_STATES.PAUSED ||
        auction.status === AUCTION_STATES.COMPLETED
      ) {
        throw new Error('Retentions are LOCKED once the auction becomes LIVE.');
      }

      const retention = db
        .prepare('SELECT * FROM retentions WHERE id = ? AND auctionId = ?')
        .get(retentionId, auctionId);
      if (!retention) throw new Error('Retention not found.');

      const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(retention.teamId);
      const purseBefore = recalculateTeamPurse(retention.teamId).remainingPurse;

      db.prepare('DELETE FROM retentions WHERE id = ?').run(retentionId);

      // Automatically refund full amount
      const purseAfter = recalculateTeamPurse(retention.teamId).remainingPurse;

      recordAudit({
        auctionId,
        user: req.user,
        action: 'Retention deleted',
        entityType: 'RETENTION',
        entityId: retentionId,
        entityName: retention.playerName,
        previousValue: {
          teamName: team?.name,
          playerName: retention.playerName,
          amount: retention.amount,
          remainingPurse: purseBefore
        },
        newValue: {
          refundedAmount: retention.amount,
          remainingPurse: purseAfter
        }
      });
    });

    broadcastAuctionState(auctionId);
    res.json({ auction: getHydratedAuction(auctionId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Section 28: PUBLISH RETENTIONS
app.post('/api/auctions/:auctionId/retentions/publish', requireAuctionAdmin, (req, res) => {
  const { auctionId } = req.params;
  const { published = true } = req.body || {};

  const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
  if (!auction) return res.status(404).json({ error: 'Auction not found.' });

  const now = new Date().toISOString();
  db.prepare('UPDATE auctions SET retentionsPublished = ?, updatedAt = ? WHERE id = ?').run(
    published ? 1 : 0,
    now,
    auctionId
  );

  recordAudit({
    auctionId,
    user: req.user,
    action: published ? 'Retention published' : 'Retention unpublished',
    entityType: 'AUCTION',
    entityId: auctionId,
    entityName: auction.name,
    previousValue: { retentionsPublished: Boolean(auction.retentionsPublished) },
    newValue: { retentionsPublished: Boolean(published) }
  });

  broadcastAuctionState(auctionId, { type: 'RETENTIONS_PUBLISHED', sound: 'TRANSITION' });
  res.json({ auction: getHydratedAuction(auctionId) });
});

// ============================================================================
// 12. REAL-TIME SOCKET.IO SYNCHRONIZATION (Sections 32 & 33)
// ============================================================================

io.on('connection', socket => {
  socket.on('join:auction', ({ auctionId, token, teamId }) => {
    if (!auctionId) return;

    const user = verifyToken(token);
    let isAuthorizedAdmin = false;

    if (user?.kind === 'ADMIN') {
      if (user.role === ROLES.SUPER_ADMIN) {
        isAuthorizedAdmin = true;
      } else {
        const assigned = db
          .prepare('SELECT id FROM auction_admins WHERE auctionId = ? AND userId = ?')
          .get(auctionId, user.userId);
        isAuthorizedAdmin = Boolean(assigned);
      }
    }

    if (isAuthorizedAdmin) {
      socket.join(`auction:${auctionId}:admin`);
      const state = getHydratedAuction(auctionId, {
        includePrivateRetentions: true,
        includeTeamPins: true
      });
      if (state) socket.emit('auction:state', state);
    } else {
      socket.join(`auction:${auctionId}:public`);
      const state = getHydratedAuction(auctionId, {
        includePrivateRetentions: false,
        includeTeamPins: false
      });
      if (state) socket.emit('auction:state', state);
    }

    // Section 33: Multi-device Team room synchronization
    const resolvedTeamId = user?.teamId || teamId;
    if (resolvedTeamId) {
      socket.join(`team:${resolvedTeamId}`);
    }
  });

  socket.on('leave:auction', ({ auctionId }) => {
    if (!auctionId) return;
    socket.leave(`auction:${auctionId}:admin`);
    socket.leave(`auction:${auctionId}:public`);
  });
});

// ============================================================================
// 13. VITE DEV SERVER MIDDLEWARE OR PRODUCTION STATIC ASSETS
// ============================================================================

const PORT = process.env.PORT || 3000;
const isDev = process.argv.includes('--dev');

async function startServer() {
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================================`);
    console.log(`  VISTA PRESENTS THE VERDICT — Universal Live Auction Platform`);
    console.log(`  Running at: http://localhost:${PORT}`);
    console.log(`==================================================================\n`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export { app };
export default app;

