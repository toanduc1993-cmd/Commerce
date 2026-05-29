/**
 * backfill_legacy_bidcodes.js
 *
 * One-time migration: gen Smart Bidcode v2 cho TẤT CẢ BidAnalysis có bidCode=NULL.
 * GIỮ legacyBidCode (audit trail).
 *
 * Usage:
 *   node scripts/backfill_legacy_bidcodes.js --dry-run     # preview
 *   node scripts/backfill_legacy_bidcodes.js --apply       # commit
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../src/lib/prisma');
const {
  projShort,
  deriveMatGroup,
  generateNextBidCode,
  yymmOf,
} = require('../src/lib/bidcode');

const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');
if (!dryRun && !apply) {
  console.error('Cần --dry-run hoặc --apply');
  process.exit(1);
}

(async () => {
  const startTs = Date.now();
  console.log(`[${new Date().toISOString()}] Backfill legacy bidcodes — ${dryRun ? 'DRY RUN' : 'APPLY'}`);

  const bids = await prisma.bidAnalysis.findMany({
    where: { bidCode: null },
    include: {
      project: { select: { code: true } },
      // BidQuoteItem không có materialGroupCode; extract từ itemCode pattern <PROJ>-<MAT>-<seq>
      items: { select: { itemCode: true, profile: true } },
    },
    orderBy: [{ projectId: 'asc' }, { bidDate: 'asc' }, { createdAt: 'asc' }],
  });

  // Extract MAT từ itemCode pattern, ví dụ:
  //   "I95-VPK-019"    → split by "-" → ["I95","VPK","019"] → seg "VPK" → "VPK"
  //   "I109-VTC04-001" → ["I109","VTC04","001"] → seg "VTC04" → match "VTC"
  //   "G07-VPK-011"    → "VPK"
  function matFromItemCode(itemCode) {
    if (!itemCode) return null;
    const parts = String(itemCode).split('-');
    if (parts.length < 2) return null;
    const seg = parts[1].toUpperCase();
    const m = seg.match(/^([A-Z]{2,4})/);
    return m ? m[1] : null;
  }

  // Local sequence counter — tránh trùng khi nhiều BIDs cùng (proj, yymm, mat)
  // Map key: "PROJ|YYMM|MAT" → next seq (1-based)
  const seqCache = new Map();
  async function nextSeqLocal(proj, yymm, mat) {
    const key = `${proj}|${yymm}|${mat}`;
    if (!seqCache.has(key)) {
      // Lần đầu — query DB để biết max hiện tại
      const maxRow = await prisma.bidAnalysis.findFirst({
        where: { bidCodeProj: proj, bidCodeYymm: yymm, bidCodeMat: mat },
        orderBy: { bidCodeSeq: 'desc' },
        select: { bidCodeSeq: true },
      });
      seqCache.set(key, (maxRow?.bidCodeSeq || 0) + 1);
    } else {
      seqCache.set(key, seqCache.get(key) + 1);
    }
    return seqCache.get(key);
  }
  console.log(`  Found ${bids.length} BidAnalysis with bidCode=NULL`);

  // Reset in-memory sequence cache per (proj, yymm, mat) — vì generateNextBidCode query DB từng lần
  const stats = {
    total: bids.length,
    success: 0,
    failed: 0,
    by_proj: {},
    by_mat: {},
  };
  const updates = [];

  for (const bid of bids) {
    try {
      const proj = projShort(bid.project?.code || 'ALL');
      // YYMM from bidDate (primary) → createdAt (fallback)
      const dateRef = bid.bidDate || bid.createdAt || new Date();
      const yymm = yymmOf(dateRef);
      // Derive materialGroupCode từ itemCode pattern (BidQuoteItem không có sẵn field này)
      const itemsForMat = bid.items.map((it) => ({
        itemCode: it.itemCode,
        materialGroupCode: matFromItemCode(it.itemCode),
        profile: it.profile,
      }));
      const mat = deriveMatGroup(itemsForMat);

      const seq = await nextSeqLocal(proj, yymm, mat);
      const code = `BID-${proj}-${yymm}-${mat}-${String(seq).padStart(3, '0')}`;

      updates.push({
        id: bid.id,
        bidCode: code,
        bidCodeProj: proj,
        bidCodeYymm: yymm,
        bidCodeMat: mat,
        bidCodeSeq: seq,
        legacy: bid.legacyBidCode,
      });
      stats.success += 1;
      stats.by_proj[proj] = (stats.by_proj[proj] || 0) + 1;
      stats.by_mat[mat] = (stats.by_mat[mat] || 0) + 1;
    } catch (err) {
      console.error(`  ✗ ${bid.id} (${bid.legacyBidCode}): ${err.message}`);
      stats.failed += 1;
    }
  }

  console.log(`\n  Generated ${updates.length} codes`);
  console.log('  By project:', stats.by_proj);
  console.log('  By material:', stats.by_mat);
  console.log('\n  Sample (10 first):');
  updates.slice(0, 10).forEach((u) => {
    console.log(`    ${u.bidCode}  ←  "${u.legacy}"`);
  });

  if (dryRun) {
    console.log('\n  DRY RUN — no DB write. Rerun with --apply');
    process.exit(0);
  }

  // Apply
  console.log('\n  Applying updates in transaction...');
  await prisma.$transaction(
    updates.map((u) =>
      prisma.bidAnalysis.update({
        where: { id: u.id },
        data: {
          bidCode: u.bidCode,
          bidCodeProj: u.bidCodeProj,
          bidCodeYymm: u.bidCodeYymm,
          bidCodeMat: u.bidCodeMat,
          bidCodeSeq: u.bidCodeSeq,
        },
      })
    ),
    { timeout: 60_000 }
  );

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: 'BACKFILL_LEGACY_BIDCODES',
      entityType: 'BidAnalysis',
      entityId: 'BULK',
      details: JSON.stringify({
        total: stats.total,
        success: stats.success,
        failed: stats.failed,
        by_proj: stats.by_proj,
        by_mat: stats.by_mat,
        durationMs: Date.now() - startTs,
      }),
    },
  });

  console.log(`\n✅ Done — ${stats.success}/${stats.total} updated in ${Date.now() - startTs}ms`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
