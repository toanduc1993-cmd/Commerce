#!/usr/bin/env node
/**
 * F-BID-A Phase A: backfill `selectionMode` cho 96 BidAnalysis hiện tại.
 *
 * Rule (DA decided 2026-05-28 12:25 — clarify #1):
 *   - Item-level selected → "PER_ITEM" (ưu tiên, vì refined sau BID-level)
 *   - BID-level winner only → "PER_BID"
 *   - Default (chưa quyết) → "PER_ITEM"
 *
 * Run:
 *   cd backend && node scripts/f_bid_a_backfill_selection_mode.js          # dry-run
 *   cd backend && node scripts/f_bid_a_backfill_selection_mode.js --apply  # commit
 */

require('dotenv').config();
const prisma = require('../src/lib/prisma');
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`F-BID-A backfill — ${APPLY ? 'APPLY MODE' : 'DRY-RUN'}`);
  console.log(`Started: ${new Date().toISOString()}`);

  const bids = await prisma.bidAnalysis.findMany({
    select: {
      id: true,
      bidCode: true,
      legacyBidCode: true,
      selectionMode: true,
      vendors: { select: { isWinner: true } },
      items: { select: { selectedVendorName: true } },
    },
  });

  console.log(`Total BidAnalysis records: ${bids.length}`);

  const stats = { PER_ITEM: 0, PER_BID: 0, both: 0, neither: 0, updated: 0, skipped: 0 };
  const conflicts = [];
  const updates = [];

  for (const bid of bids) {
    const itemLevelCount = bid.items.filter((i) => i.selectedVendorName).length;
    const bidLevelWinner = bid.vendors.some((v) => v.isWinner);

    let target;
    if (itemLevelCount > 0 && bidLevelWinner) {
      stats.both++;
      target = 'PER_ITEM'; // DA rule: ưu tiên item-level
      conflicts.push({
        id: bid.id,
        bidCode: bid.bidCode || bid.legacyBidCode,
        itemLevelCount,
        had_both: true,
      });
    } else if (itemLevelCount > 0) {
      stats.PER_ITEM++;
      target = 'PER_ITEM';
    } else if (bidLevelWinner) {
      stats.PER_BID++;
      target = 'PER_BID';
    } else {
      stats.neither++;
      target = 'PER_ITEM'; // default
    }

    if (bid.selectionMode === target) {
      stats.skipped++;
    } else {
      updates.push({ id: bid.id, from: bid.selectionMode, to: target, bidCode: bid.bidCode });
      stats.updated++;
    }
  }

  console.log('\nStats:');
  console.log(`  Will be PER_ITEM:  ${stats.PER_ITEM} (item-level only)`);
  console.log(`  Will be PER_BID:   ${stats.PER_BID} (BID-level winner only)`);
  console.log(`  Had BOTH:          ${stats.both} (DA rule → PER_ITEM, logged)`);
  console.log(`  Neither:           ${stats.neither} (default PER_ITEM)`);
  console.log(`  Will update:       ${stats.updated}`);
  console.log(`  Will skip:         ${stats.skipped} (already correct)`);
  console.log(`  Total:             ${bids.length}`);

  if (conflicts.length > 0) {
    console.log(`\nConflicts (had_both): ${conflicts.length}`);
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(
      __dirname,
      `backfill_log_${new Date().toISOString().slice(0, 10)}.json`
    );
    fs.writeFileSync(logPath, JSON.stringify(conflicts, null, 2));
    console.log(`  Written: ${logPath}`);
  }

  if (!APPLY) {
    console.log('\nDry-run only. Re-run với --apply để commit changes.');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nApplying ${updates.length} updates...`);
  let applied = 0;
  for (const u of updates) {
    await prisma.bidAnalysis.update({
      where: { id: u.id },
      data: { selectionMode: u.to },
    });
    applied++;
    if (applied % 20 === 0) console.log(`  ${applied}/${updates.length}`);
  }
  console.log(`Applied: ${applied}/${updates.length}`);

  // AuditLog batch insert
  if (applied > 0) {
    await prisma.auditLog.createMany({
      data: updates.map((u) => ({
        action: 'BID_SELECTION_MODE_BACKFILL',
        userId: 'system',
        entityType: 'BidAnalysis',
        entityId: u.id,
        details: JSON.stringify({ from: u.from, to: u.to, bidCode: u.bidCode }),
      })),
    });
    console.log(`AuditLog: ${applied} entries inserted`);
  }

  await prisma.$disconnect();
  console.log(`Done: ${new Date().toISOString()}`);
}

main().catch((e) => {
  console.error('Backfill failed:', e);
  process.exit(1);
});
