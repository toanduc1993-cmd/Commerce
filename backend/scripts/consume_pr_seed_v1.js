#!/usr/bin/env node
/**
 * TIER 1a: Seed pr_seed_v1.ndjson (41 PRs) vào DB.
 *
 * Mapping:
 *   so_pr      → prRef (unique key — dedup check)
 *   ngay_pr    → (không có field requestDate trong schema, ignore)
 *   bo_phan    → department
 *   du_an      → projectId (fuzzy match bằng code normalizer)
 *   khach_hang → client
 *   do_uu_tien → urgency trên PrDetail (Normal/High/Critical)
 *   ngay_can   → requiredDate trên PrDetail
 *   items[]    → PrDetail records
 *
 * Run:
 *   cd backend && node scripts/consume_pr_seed_v1.js          # dry-run
 *   cd backend && node scripts/consume_pr_seed_v1.js --apply  # commit
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/lib/prisma');

const APPLY = process.argv.includes('--apply');
const PR_SEED_PATH = '/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/IBSHI/mua-hang/02.CONG-CU/ibs-ocr/data/bulk_results/pr_seed_v1.ndjson';
const EXPECTED_SHA256 = '54245f1b76660ca1423c5492c77545b2603934e6cf12f81f1b76d9e1b2e98184';

// du_an → project code mapping
// Handles variants: '25-VPI-I-095', '25-VPI-095', '25-VPI-I-095/V17565', etc.
function normalizeProjectCode(duAn) {
  if (!duAn) return null;
  const s = duAn.toUpperCase().trim();
  // Extract the 3-digit project number + prefix
  // '25-VPI-I-095' → '25-VPI-I-095'
  // '25-VPI-095' → try '25-VPI-I-095'
  // '25-BRA-090' → try '25-BRA-I-090'
  // '25-VPI-I-095/V17565' → '25-VPI-I-095'
  const base = s.split('/')[0]; // strip revision suffix
  return base;
}

// Extra aliases for OCR typos
const DU_AN_ALIASES = {
  '25-SHW-I-100': '25-SHI-I-100',
  '25-SHW-100': '25-SHI-I-100',
  '26-BRA-090-LK': '25-BRA-I-090',   // LK variant — closest project
  '25-BRA-090': '25-BRA-I-090',
  '25-VPI-095': '25-VPI-I-095',
  'I078': '25-IBS-I-078',
  '25-GEN-G-01': '25-GEN-G-07',      // closest match (G-07 is in DB)
};

// Map du_an string to DB project id
function findProjectId(duAn, projectMap) {
  if (!duAn || duAn === 'null') return null;
  const norm = normalizeProjectCode(duAn);
  if (!norm) return null;

  // Alias lookup first
  const alias = DU_AN_ALIASES[norm] || DU_AN_ALIASES[duAn.trim()];
  if (alias && projectMap[alias.toUpperCase()]) return projectMap[alias.toUpperCase()];

  // Direct match
  if (projectMap[norm]) return projectMap[norm];

  // Try inserting -I-  (e.g. '25-BRA-090' → '25-BRA-I-090')
  const withI = norm.replace(/^(\d{2}-[A-Z]{2,4}-)(\d{3})$/, '$1I-$2');
  if (projectMap[withI]) return projectMap[withI];

  // Try removing -I- (e.g. '25-VPI-I-090' → '25-VPI-090')
  const withoutI = norm.replace(/-I-/, '-');
  if (projectMap[withoutI]) return projectMap[withoutI];

  return null;
}

// Map urgency to DB enum
function mapUrgency(u) {
  if (!u) return 'Normal';
  const l = u.toLowerCase();
  if (l.includes('critical') || l.includes('khẩn')) return 'Critical';
  if (l.includes('high') || l.includes('urgent') || l.includes('cao')) return 'High';
  return 'Normal';
}

async function main() {
  console.log(`consume_pr_seed_v1 — ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`File: ${PR_SEED_PATH}`);

  // Verify SHA256
  const { createHash } = require('crypto');
  const fileContent = fs.readFileSync(PR_SEED_PATH);
  const hash = createHash('sha256').update(fileContent).digest('hex');
  if (hash !== EXPECTED_SHA256) {
    console.error(`SHA256 mismatch! Expected: ${EXPECTED_SHA256}\nGot: ${hash}`);
    process.exit(1);
  }
  console.log(`SHA256 ✓ ${hash}`);

  const records = fileContent
    .toString()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  console.log(`Records: ${records.length}`);

  // Build project map from DB
  const projects = await prisma.project.findMany({ select: { id: true, code: true } });
  const projectMap = {};
  projects.forEach((p) => {
    projectMap[p.code.toUpperCase()] = p.id;
  });

  // Build existing prRef set for dedup
  const existingPRs = await prisma.purchaseRequisition.findMany({ select: { prRef: true } });
  const existingRefs = new Set(existingPRs.map((p) => p.prRef));
  console.log(`Existing PRs in DB: ${existingPRs.length}`);

  // Special fallback: use 25-VPI-I-095 as default project for unmapped
  const fallbackProjectId = projectMap['25-VPI-I-095'];

  const toInsert = [];
  const skipped = [];
  const unmapped = [];

  for (const rec of records) {
    const prRef = rec.so_pr || rec._id;
    if (!prRef) {
      skipped.push({ reason: 'no_so_pr', id: rec._id });
      continue;
    }

    if (existingRefs.has(prRef)) {
      skipped.push({ reason: 'duplicate', prRef });
      continue;
    }

    const projectId = findProjectId(rec.du_an, projectMap) || fallbackProjectId;
    if (!projectId) {
      unmapped.push({ prRef, du_an: rec.du_an });
      skipped.push({ reason: 'no_project', prRef, du_an: rec.du_an });
      continue;
    }

    if (findProjectId(rec.du_an, projectMap) === null) {
      unmapped.push({ prRef, du_an: rec.du_an, using_fallback: true });
    }

    const items = (rec.items || []).map((item, idx) => {
      const reqQty = parseFloat(item.qty) || 0;
      return {
        itemCode: item.item_code || `${prRef}-ITEM-${String(idx + 1).padStart(3, '0')}`,
        itemName: item.item_name || '(không rõ)',
        uom: item.uom || 'cái',
        reqQty,
        reqWeight: 0,
        toBuyQty: reqQty,
        toBuyWeight: 0,
        urgency: mapUrgency(rec.do_uu_tien),
        requiredDate: rec.ngay_can ? new Date(rec.ngay_can) : null,
        statusFlag: 'Chờ báo giá',
        remarks: item.ghi_chu || null,
      };
    });

    toInsert.push({
      prRef,
      department: rec.bo_phan || 'Mua hàng',
      client: rec.khach_hang || null,
      projectId,
      items,
      _source_du_an: rec.du_an,
    });
  }

  console.log('\nSummary:');
  console.log(`  Will insert: ${toInsert.length} PRs`);
  console.log(`  Skipped: ${skipped.length} (${skipped.filter((s) => s.reason === 'duplicate').length} dup, ${skipped.filter((s) => s.reason === 'no_project').length} no project, ${skipped.filter((s) => s.reason === 'no_so_pr').length} no ref)`);
  console.log(`  Total items across PRs: ${toInsert.reduce((acc, p) => acc + p.items.length, 0)}`);

  if (unmapped.length > 0) {
    console.log(`\nUnmapped du_an (using fallback 25-VPI-I-095):`);
    unmapped.forEach((u) => console.log(`  ${u.prRef}: "${u.du_an}"`));
  }

  if (!APPLY) {
    console.log('\nDry-run — pass --apply to commit.');
    await prisma.$disconnect();
    return { seeded: 0, skipped: skipped.length };
  }

  let seeded = 0;
  for (const p of toInsert) {
    const { items, _source_du_an, ...prData } = p;
    try {
      await prisma.purchaseRequisition.create({
        data: {
          ...prData,
          details: {
            create: items,
          },
        },
      });
      seeded++;
    } catch (e) {
      console.error(`Insert failed for ${p.prRef}: ${e.message?.slice(0, 100)}`);
      skipped.push({ reason: 'insert_error', prRef: p.prRef, error: e.message?.slice(0, 100) });
    }
  }

  console.log(`\nSeeded: ${seeded}/${toInsert.length} PRs`);
  console.log(`Skipped: ${skipped.length}`);

  await prisma.$disconnect();
  return { seeded, skipped: skipped.length };
}

main().catch((e) => {
  console.error('consume_pr_seed_v1 failed:', e);
  process.exit(1);
});
