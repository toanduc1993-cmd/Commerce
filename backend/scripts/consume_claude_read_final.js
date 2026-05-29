#!/usr/bin/env node
/**
 * TIER 1d: Consume claude_read_priority.ndjson (184 records) into DB.
 *
 * Strategy:
 *   - For each OCRP record: look up BidAnalysis by sourceFilePath match.
 *   - If found: enrich BidQuoteOffer with CLAUDE_READ qualitySource.
 *   - If NOT found: create new BidAnalysis (legacyBidCode = _id, subject = _business_summary[:100]),
 *       BidQuoteVendor per vendor, BidQuoteItem per item, BidQuoteOffer per offer.
 *   - Idempotent on (pdf_relpath): if already consumed, skip.
 *
 * Run:
 *   cd backend && node scripts/consume_claude_read_final.js          # dry-run
 *   cd backend && node scripts/consume_claude_read_final.js --apply  # commit
 */
require('dotenv').config();
const fs = require('fs');
const prisma = require('../src/lib/prisma');

const APPLY = process.argv.includes('--apply');
const CLAUDE_READ_PATH =
  '/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/IBSHI/mua-hang/02.CONG-CU/ibs-ocr/data/bulk_results/claude_read_priority.ndjson';
const EXPECTED_SHA256 = '541d056cbedd010edc7d388d7fc4d794f56f0a29bc2be48c9368fe98849f7541';

function sha256(content) {
  return require('crypto').createHash('sha256').update(content).digest('hex');
}

function normalizePath(p) {
  if (!p) return '';
  // Strip common leading prefixes to get canonical "MS NGẦN/..." path
  for (const prefix of ['IBSHI/mua-hang/00.DATA/', '00.DATA/', 'IBSHI/mua-hang/']) {
    if (p.startsWith(prefix)) return p.slice(prefix.length);
  }
  return p;
}

// Map canonical project code to DB project ID
const projectCache = {};
async function getProjectId(canonicalCode) {
  if (!canonicalCode) return null;
  if (projectCache[canonicalCode]) return projectCache[canonicalCode];
  // Direct lookup
  let p = await prisma.project.findFirst({ where: { code: canonicalCode } });
  if (!p) {
    // Try extracting short code like "095" from "25-VPI-I-095"
    const m = canonicalCode.match(/(\d{3})$/);
    if (m) {
      p = await prisma.project.findFirst({ where: { code: { endsWith: m[1] } } });
    }
  }
  projectCache[canonicalCode] = p?.id || null;
  return projectCache[canonicalCode];
}

// Map OCRP urgency string to DB enum
function mapUrgency(u) {
  if (!u) return 'Normal';
  const l = u.toLowerCase();
  if (l.includes('critical') || l.includes('urgent')) return 'Critical';
  if (l.includes('high')) return 'High';
  return 'Normal';
}

async function processRecord(r, dryRun) {
  const ext = r.result?.extracted_platform_v1;
  if (!ext) return { status: 'skip', reason: 'no_extracted_platform_v1' };

  const bm = ext.bid_matrix || {};
  const vendors = bm.vendors || [];
  const items = bm.items || [];
  const offers = bm.offers || [];

  if (offers.length === 0) return { status: 'skip', reason: 'no_offers' };

  // Determine canonical path for dedup
  const pdfRelpath = r.pdf_relpath || r.pdf_path || '';
  const canonicalPath = '00.DATA/' + normalizePath(pdfRelpath);

  // Check if BidAnalysis already exists by sourceFilePath
  const existing = await prisma.bidAnalysis.findFirst({
    where: { sourceFilePath: canonicalPath },
    select: { id: true, bidCode: true },
  });

  const projectCodes = ext.project?.codes_canonical || [];
  const projectId = await getProjectId(projectCodes[0]);

  const bsSrc = ext._business_summary;
  const bsStr = typeof bsSrc === 'string' ? bsSrc
    : typeof bsSrc === 'object' && bsSrc ? JSON.stringify(bsSrc).slice(0, 100)
    : '';
  const subject = (bsStr || ext.pdf_name || r.pdf_name || r._id || '').slice(0, 200);
  const legacyBidCode = r._id;

  if (existing) {
    // Enrich existing BID's offers with CLAUDE_READ quality source
    let enriched = 0;
    for (const offer of offers) {
      if (!offer.vendor || offer.unit_price == null) continue;
      // Find matching BidQuoteVendor
      const vendor = await prisma.bidQuoteVendor.findFirst({
        where: { bidId: existing.id, vendorName: { contains: offer.vendor, mode: 'insensitive' } },
      });
      if (!vendor) continue;

      // Find matching BidQuoteItem by item_order
      const item = items[offer.item_order];
      if (!item) continue;
      const bidItem = await prisma.bidQuoteItem.findFirst({
        where: {
          bidId: existing.id,
          OR: [
            { itemCode: item.code || '' },
            { itemName: { contains: item.name || '', mode: 'insensitive' } },
          ],
        },
      });
      if (!bidItem) continue;

      // Upsert BidQuoteOffer
      const offerRecord = await prisma.bidQuoteOffer.findFirst({
        where: { itemId: bidItem.id, vendorId: vendor.id },
      });
      if (!offerRecord && !dryRun) {
        await prisma.bidQuoteOffer.create({
          data: {
            itemId: bidItem.id,
            vendorId: vendor.id,
            scope: offer.scope || 'V',
            unitPrice: offer.unit_price || 0,
            totalPrice: offer.total_price || 0,
            qualitySource: 'CLAUDE_READ',
          },
        });
        enriched++;
      } else if (offerRecord?.qualitySource !== 'CLAUDE_READ' && !dryRun) {
        await prisma.bidQuoteOffer.update({
          where: { id: offerRecord.id },
          data: { qualitySource: 'CLAUDE_READ', unitPrice: offer.unit_price || offerRecord.unitPrice },
        });
        enriched++;
      }
    }
    return { status: 'enrich', id: existing.id, enriched };
  }

  // Create new BidAnalysis from scratch
  if (dryRun) {
    return {
      status: 'create_new',
      legacyBidCode,
      subject: subject.slice(0, 50),
      projectCode: projectCodes[0],
      vendors: vendors.length,
      items: items.length,
      offers: offers.length,
    };
  }

  if (!projectId) {
    return { status: 'skip', reason: 'no_project', projectCode: projectCodes[0] };
  }

  // Create BidAnalysis + nested vendors/items/offers in transaction
  const bidAnalysis = await prisma.$transaction(async (tx) => {
    const bid = await tx.bidAnalysis.create({
      data: {
        projectId,
        legacyBidCode,
        subject: subject.slice(0, 200),
        status: 'SELECTED',
        sourceFilePath: canonicalPath,
        sourceFileName: r.pdf_name || '',
        selectionMode: 'PER_BID',
      },
    });

    // Create vendors
    const vendorMap = {};
    for (const v of vendors) {
      const vendorName = v.name_normalized || v.name || 'Unknown';
      const created = await tx.bidQuoteVendor.create({
        data: {
          bidId: bid.id,
          vendorName,
          vendorOrder: v.order || 0,
          vendorType: 'DOMESTIC',
          currency: 'VND',
          totalQuote: v.total_quote || 0,
          isWinner: v.is_winner === true,
        },
      });
      vendorMap[vendorName.toLowerCase()] = created.id;
      // Also map by exact name
      if (v.name) vendorMap[(v.name).toLowerCase()] = created.id;
    }

    // Create items
    const itemMap = {};
    for (const it of items) {
      const itemCode = it.code || `${legacyBidCode}-ITEM-${String(it.order || 0).padStart(3, '0')}`;
      const created = await tx.bidQuoteItem.create({
        data: {
          bidId: bid.id,
          itemOrder: it.order || 0,
          itemCode,
          itemName: it.name || '',
          profile: it.profile || null,
          grade: it.grade || null,
          uom: it.uom || 'chiếc',
          qtyPR: it.qty_pr || 0,
          qtyToBuy: it.qty_to_buy || it.qty_pr || 0,
          estimateUnitPrice: 0,
          estimateTotal: 0,
          alreadyBoughtAmount: 0,
        },
      });
      itemMap[it.order] = created.id;
    }

    // Create offers
    let offersCreated = 0;
    for (const o of offers) {
      const vendorName = (o.vendor || '').toLowerCase();
      const vendorId = vendorMap[vendorName];
      const itemId = itemMap[o.item_order ?? -1];
      if (!vendorId || !itemId) continue;

      // Mark is_chosen as selectedVendorName on item if applicable
      if (o.is_chosen && !dryRun) {
        const vendorDisplayName = Object.entries(vendorMap).find(([, id]) => id === vendorId)?.[0] || '';
        await tx.bidQuoteItem.update({
          where: { id: itemId },
          data: { selectedVendorName: vendors.find((v) => (v.name_normalized || v.name || '').toLowerCase() === vendorName)?.name_normalized || o.vendor },
        });
      }

      await tx.bidQuoteOffer.create({
        data: {
          itemId,
          vendorId,
          scope: o.scope || 'V',
          unitPrice: o.unit_price || 0,
          totalPrice: o.total_price || 0,
          qualitySource: 'CLAUDE_READ',
        },
      });
      offersCreated++;
    }

    return bid;
  });

  return {
    status: 'created',
    id: bidAnalysis.id,
    legacyBidCode,
    vendors: vendors.length,
    items: items.length,
    offersCreated: offers.length,
  };
}

async function main() {
  console.log(`consume_claude_read_final — ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const content = fs.readFileSync(CLAUDE_READ_PATH);
  const hash = sha256(content);
  if (hash !== EXPECTED_SHA256) {
    console.error(`SHA256 mismatch: ${hash}`);
    process.exit(1);
  }
  console.log(`SHA256 ✓`);

  const records = content
    .toString()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  console.log(`Records: ${records.length}`);

  const stats = { created: 0, enriched: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    try {
      const result = await processRecord(r, !APPLY);
      if (result.status === 'skip') {
        stats.skipped++;
      } else if (result.status === 'enrich') {
        stats.enriched++;
      } else if (result.status === 'created' || result.status === 'create_new') {
        stats.created++;
        if (i < 5 || result.status === 'created') {
          console.log(`  [${i + 1}] ${result.status}: ${result.legacyBidCode} (${result.vendors}v/${result.items}i/${result.offersCreated || 0}o)`);
        }
      }
    } catch (e) {
      stats.errors++;
      console.error(`  [${i + 1}] ERROR ${r._id}: ${e.message?.slice(0, 80)}`);
    }

    if ((i + 1) % 20 === 0) {
      console.log(`  Progress: ${i + 1}/${records.length} — created=${stats.created} enriched=${stats.enriched} skip=${stats.skipped} err=${stats.errors}`);
    }
  }

  console.log(`\nFinal: created=${stats.created} enriched=${stats.enriched} skipped=${stats.skipped} errors=${stats.errors}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('consume_claude_read_final failed:', e);
  process.exit(1);
});
