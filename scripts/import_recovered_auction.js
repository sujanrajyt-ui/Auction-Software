import fs from 'node:fs';
import path from 'node:path';
import { db, runTransaction, recalculateAllAuctionPurses } from '../server/db.js';

const backupFile = path.resolve(process.cwd(), 'backups/recovered_today_auction.json');
if (!fs.existsSync(backupFile)) {
  console.error('File not found:', backupFile);
  process.exit(1);
}

const rawPayload = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
const auction = rawPayload.auction;

if (!auction || !auction.id) {
  console.error('Invalid auction data in JSON.');
  process.exit(1);
}

console.log(`Starting import for auction "${auction.name}" (${auction.id})...`);

runTransaction(() => {
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    // 1. Clean up existing records for this auction ID
    db.prepare('DELETE FROM audit_logs WHERE auctionId = ?').run(auction.id);
    db.prepare('DELETE FROM sales_history WHERE auctionId = ?').run(auction.id);
    db.prepare('DELETE FROM purse_adjustments WHERE auctionId = ?').run(auction.id);
    db.prepare('DELETE FROM retentions WHERE auctionId = ?').run(auction.id);
    db.prepare('DELETE FROM items WHERE auctionId = ?').run(auction.id);
    db.prepare('DELETE FROM pools WHERE auctionId = ?').run(auction.id);
    db.prepare('DELETE FROM teams WHERE auctionId = ?').run(auction.id);
    db.prepare('DELETE FROM auctions WHERE id = ?').run(auction.id);

    // 2. Insert Auction
    const insAuction = db.prepare(`
      INSERT OR REPLACE INTO auctions (
        id, name, committeeName, currency, startingPurse,
        maxRetentionsPerTeam, maxRtmPerTeam, incrementRulesJson,
        status, retentionsPublished, activeItemId, projectorOverlayJson,
        reopenedCount, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insAuction.run(
      auction.id,
      auction.name,
      auction.committeeName || 'Vista Presents The Verdict',
      auction.currency || 'INR',
      auction.startingPurse || 1250000000,
      auction.maxRetentionsPerTeam || 5,
      auction.maxRtmPerTeam || 2,
      typeof auction.incrementRules === 'string'
        ? auction.incrementRules
        : JSON.stringify(auction.incrementRules || []),
      auction.status || 'PAUSED',
      auction.retentionsPublished ? 1 : 0,
      auction.activeItemId || null,
      auction.projectorOverlay ? JSON.stringify(auction.projectorOverlay) : null,
      auction.reopenedCount || 0,
      auction.createdAt || new Date().toISOString(),
      auction.updatedAt || new Date().toISOString()
    );

    // 3. Insert Teams
    const insTeam = db.prepare(`
      INSERT OR REPLACE INTO teams (
        id, auctionId, name, shortName, code, pin, logoUrl,
        primaryColor, secondaryColor, startingPurse, remainingPurse,
        rtmCardsTotal, disabled, sortOrder, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of auction.teams || []) {
      insTeam.run(
        t.id,
        t.auctionId || auction.id,
        t.name,
        t.shortName || t.name.slice(0, 3).toUpperCase(),
        t.code || t.name.slice(0, 3).toUpperCase(),
        t.pin || '1234',
        t.logoUrl || '',
        t.primaryColor || '#034694',
        t.secondaryColor || '#DBA111',
        t.startingPurse || 1250000000,
        t.remainingPurse !== undefined ? t.remainingPurse : t.startingPurse,
        t.rtmCardsTotal !== undefined ? t.rtmCardsTotal : 2,
        t.disabled ? 1 : 0,
        t.sortOrder || 0,
        t.createdAt || new Date().toISOString()
      );
    }

    // 4. Insert Pools
    const insPool = db.prepare(`
      INSERT OR REPLACE INTO pools (
        id, auctionId, name, defaultBasePrice, isLegendPool, sortOrder, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of auction.pools || []) {
      insPool.run(
        p.id,
        p.auctionId || auction.id,
        p.name,
        p.defaultBasePrice || 20000000,
        p.isLegendPool ? 1 : 0,
        p.sortOrder || 0,
        p.createdAt || new Date().toISOString()
      );
    }

    // 5. Insert Items (combine items, queue, soldItems, unsoldItems deduplicated)
    const itemMap = new Map();
    for (const i of auction.items || []) itemMap.set(i.id, i);
    for (const i of auction.queue || []) itemMap.set(i.id, i);
    for (const i of auction.soldItems || []) itemMap.set(i.id, i);
    for (const i of auction.unsoldItems || []) itemMap.set(i.id, i);

    const insItem = db.prepare(`
      INSERT OR REPLACE INTO items (
        id, auctionId, name, imageUrl, basePrice, originalBasePrice,
        poolId, poolName, status, queueOrder, currentBid,
        highestBidderTeamId, soldToTeamId, soldAmount, soldAt,
        soldViaRtm, reauctionCount, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of itemMap.values()) {
      insItem.run(
        item.id,
        item.auctionId || auction.id,
        item.name,
        item.imageUrl || '',
        item.basePrice || 20000000,
        item.originalBasePrice || item.basePrice || 20000000,
        item.poolId || null,
        item.poolName || 'General',
        item.status || 'QUEUED',
        item.queueOrder || 0,
        item.currentBid || 0,
        item.highestBidderTeamId || null,
        item.soldToTeamId || null,
        item.soldAmount || null,
        item.soldAt || null,
        item.soldViaRtm ? 1 : 0,
        item.reauctionCount || 0,
        item.createdAt || new Date().toISOString(),
        item.updatedAt || new Date().toISOString()
      );
    }

    // 6. Insert Retentions
    const insRetention = db.prepare(`
      INSERT OR REPLACE INTO retentions (
        id, auctionId, teamId, playerName, amount, imageUrl, createdByUserId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of auction.retentions || []) {
      insRetention.run(
        r.id,
        r.auctionId || auction.id,
        r.teamId,
        r.playerName,
        r.amount,
        r.imageUrl || null,
        r.createdByUserId || null,
        r.createdAt || new Date().toISOString(),
        r.updatedAt || new Date().toISOString()
      );
    }

    // 7. Insert Sales History
    const insSale = db.prepare(`
      INSERT OR REPLACE INTO sales_history (
        id, auctionId, itemId, itemName, poolName, eventType,
        teamId, teamName, amount, reauctionNumber, adminName, adminRole, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of auction.salesHistory || []) {
      insSale.run(
        s.id,
        s.auctionId || auction.id,
        s.itemId,
        s.itemName,
        s.poolName || 'General',
        s.eventType || 'SOLD',
        s.teamId || null,
        s.teamName || null,
        s.amount || null,
        s.reauctionNumber || 0,
        s.adminName || 'Admin',
        s.adminRole || 'COMMITTEE_ADMIN',
        s.createdAt || new Date().toISOString()
      );
    }

    // 8. Insert Audit Logs
    const insAudit = db.prepare(`
      INSERT OR REPLACE INTO audit_logs (
        id, auctionId, timestamp, userId, userName, userRole,
        action, entityType, entityId, entityName, previousValueJson, newValueJson
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Only import logs if we have them
    for (const log of auction.auditLogs || []) {
      try {
        insAudit.run(
          log.id,
          log.auctionId || auction.id,
          log.timestamp || new Date().toISOString(),
          log.userId || null,
          log.userName || 'System',
          log.userRole || 'SYSTEM',
          log.action || 'AUCTION_EVENT',
          log.entityType || 'AUCTION',
          log.entityId || null,
          log.entityName || null,
          log.previousValueJson || null,
          log.newValueJson || null
        );
      } catch (err) {
        // Skip log conflict
      }
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
});

// Recalculate all purses to be 100% mathematically consistent
recalculateAllAuctionPurses(auction.id);

console.log('\n================ IMPORT SUCCESS ================');
console.log(`Auction: ${auction.name} (${auction.id})`);
console.log(`Teams imported: ${(auction.teams || []).length}`);
console.log(`Retentions imported: ${(auction.retentions || []).length}`);
console.log(`Items imported: ${(auction.items || []).length}`);
console.log(`Sold items: ${(auction.soldItems || []).length}`);
console.log(`Sales history: ${(auction.salesHistory || []).length}`);
console.log('================================================\n');
