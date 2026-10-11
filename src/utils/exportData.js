import * as XLSX from 'xlsx';
import { formatCurrency, parseCurrencyInput } from '../../shared/constants.js';

/**
 * Section 30: Export Auction Results to Excel (.xlsx) or CSV (.csv)
 * Note: Intentionally does NOT rank teams (per Section 30 requirement).
 */
export function exportAuctionResults(auction, format = 'xlsx') {
  if (!auction) return;
  const cur = auction.currency || 'EUR';
  const safeTitle = String(auction.name || 'Auction_Results')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 40);

  // Sheet 1: Team Financial & Squad Summary (in original team order, no rankings)
  const teamSummaryRows = (auction.teams || []).map(t => ({
    'Team Name': t.name,
    'Short Code': t.shortName,
    'Starting Purse': formatCurrency(t.startingPurse, cur),
    'Starting Purse (Raw)': t.startingPurse,
    'Retention Spend': formatCurrency(t.retentionSpend, cur),
    'Auction Purchase Spend': formatCurrency(t.purchaseSpend, cur),
    'Total Spending': formatCurrency(t.totalSpent, cur),
    'Total Spending (Raw)': t.totalSpent,
    'Final Remaining Purse': formatCurrency(t.remainingPurse, cur),
    'Final Remaining Purse (Raw)': t.remainingPurse,
    'Retentions Count': t.retentionsCount,
    'Purchased Items Count': t.purchasesCount,
    'Total Squad Size': t.squadCount
  }));

  // Sheet 2: Combined Squads (Retentions + Purchased Items)
  const squadRows = [];
  for (const t of auction.teams || []) {
    for (const r of t.retentions || []) {
      squadRows.push({
        Team: t.name,
        'Acquisition Type': 'RETENTION',
        'Player / Item Name': r.playerName,
        'Pool / Category': 'RETENTION',
        'Base Price': '-',
        'Acquisition Amount': formatCurrency(r.amount, cur),
        'Amount (Raw)': r.amount,
        Timestamp: r.createdAt || ''
      });
    }
    for (const p of t.purchases || []) {
      squadRows.push({
        Team: t.name,
        'Acquisition Type': 'AUCTION PURCHASE',
        'Player / Item Name': p.name,
        'Pool / Category': p.poolName,
        'Base Price': formatCurrency(p.basePrice, cur),
        'Acquisition Amount': formatCurrency(p.amount, cur),
        'Amount (Raw)': p.amount,
        Timestamp: p.soldAt || ''
      });
    }
  }

  // Sheet 3: Unsold Items
  const unsoldRows = (auction.unsoldItems || []).map(i => ({
    'Player / Item Name': i.name,
    'Pool / Category': i.poolName,
    'Base Price': formatCurrency(i.basePrice, cur),
    'Base Price (Raw)': i.basePrice,
    Status: i.status,
    'Re-auction Count': i.reauctionCount || 0
  }));

  // Sheet 4: Sales & Re-auction History
  const salesHistoryRows = (auction.salesHistory || []).map(sh => ({
    Timestamp: sh.createdAt,
    Event: sh.eventType,
    'Player / Item': sh.itemName,
    Pool: sh.poolName,
    Team: sh.teamName || '-',
    Amount: sh.amount ? formatCurrency(sh.amount, cur) : '-',
    'Re-auction #': sh.reauctionNumber || 0,
    Admin: sh.adminName,
    Role: sh.adminRole
  }));

  // Sheet 5: Complete Audit Log
  const auditRows = (auction.auditLogs || []).map(a => ({
    Timestamp: a.timestamp,
    Admin: a.userName,
    Role: a.userRole,
    Action: a.action,
    'Entity Type': a.entityType,
    'Entity Name': a.entityName || '-',
    'Previous State': a.previousValue ? JSON.stringify(a.previousValue) : '-',
    'New State': a.newValue ? JSON.stringify(a.newValue) : '-'
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(teamSummaryRows.length ? teamSummaryRows : [{ Info: 'No teams' }]),
    'Teams Summary'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(squadRows.length ? squadRows : [{ Info: 'No squad items yet' }]),
    'Squads & Purchases'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(unsoldRows.length ? unsoldRows : [{ Info: 'No unsold items' }]),
    'Unsold Pool'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(salesHistoryRows.length ? salesHistoryRows : [{ Info: 'No sales history' }]),
    'Re-auction & Sales Log'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(auditRows.length ? auditRows : [{ Info: 'No audit records' }]),
    'Full Audit Log'
  );

  if (format === 'csv') {
    const csvSheet = XLSX.utils.json_to_sheet(squadRows.length ? squadRows : teamSummaryRows);
    const csvContent = XLSX.utils.sheet_to_csv(csvSheet);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}_Results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    XLSX.writeFile(wb, `${safeTitle}_Complete_Results.xlsx`);
  }
}

/**
 * Section 11: Parse uploaded Excel (.xlsx/.xls) or CSV (.csv) file for Item/Player import
 * Standard fields ONLY: Name, Base Price, Pool/Category
 */
export async function parseSpreadsheetItems(file, currencyCode = 'EUR') {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const parsed = [];
  const errors = [];

  rawRows.forEach((row, index) => {
    // Normalize column keys
    const norm = {};
    for (const [k, v] of Object.entries(row)) {
      norm[k.trim().toLowerCase().replace(/[^a-z0-9]/g, '')] = v;
    }

    const name = String(
      norm.name || norm.playername || norm.player || norm.itemname || norm.item || ''
    ).trim();

    const pool = String(
      norm.pool || norm.category || norm.poolcategory || norm.tier || 'General Pool'
    ).trim();

    const rawPrice =
      norm.baseprice ?? norm.price ?? norm.startingprice ?? norm.reserveprice ?? '';
    const basePrice = parseCurrencyInput(rawPrice, currencyCode);

    if (!name) {
      errors.push(`Row ${index + 2}: Missing Name`);
      return;
    }
    if (!basePrice || basePrice <= 0) {
      errors.push(`Row ${index + 2} (${name}): Invalid Base Price "${rawPrice}"`);
      return;
    }

    parsed.push({
      name,
      basePrice,
      pool
    });
  });

  return { parsed, errors };
}

/**
 * Download a sample Excel template for Item/Player Import (Standard fields ONLY)
 */
export function downloadImportTemplate(currencyCode = 'EUR') {
  const sampleRows =
    currencyCode === 'INR'
      ? [
          { Name: 'Jasprit Bumrah', 'Base Price': '2Cr', 'Pool/Category': 'Marquee' },
          { Name: 'Rishabh Pant', 'Base Price': '2Cr', 'Pool/Category': 'Wicketkeepers' },
          { Name: 'Rinku Singh', 'Base Price': '50L', 'Pool/Category': 'Batsmen' }
        ]
      : currencyCode === 'USD'
      ? [
          { Name: 'Vault Unit #402 — Vintage Vinyl & Guitars', 'Base Price': '4000', 'Pool/Category': 'Warehouse 1' },
          { Name: 'Penthouse Locker #12 — Luxury Watches', 'Base Price': '12000', 'Pool/Category': 'Premium Units' }
        ]
      : [
          { Name: 'Jude Bellingham', 'Base Price': '50M', 'Pool/Category': 'Marquee M1' },
          { Name: 'Bukayo Saka', 'Base Price': '35M', 'Pool/Category': 'Marquee M2' },
          { Name: 'William Saliba', 'Base Price': '25M', 'Pool/Category': 'Centre-Backs' }
        ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Items Import Template');
  XLSX.writeFile(wb, `Vista_Verdict_Import_Template_${currencyCode}.xlsx`);
}
