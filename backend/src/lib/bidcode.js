/**
 * src/lib/bidcode.js — Bidcode generator + parser
 *
 * Format: BID[!]-<PROJ>-<YYMM>-<MAT>-<NNN>[<VAR>]
 *   - BID!  = urgent marker (optional)
 *   - PROJ  = project short code (VPI095, BRA090, MUL, ALL)
 *   - YYMM  = year+month (2606 = June 2026)
 *   - MAT   = material group (VTC/VPK/VDK/VBP/VTH/VTS/VTP/MIX)
 *   - NNN   = 3-digit sequence (reset monthly per PROJ)
 *   - VAR   = optional A/B/C for re-issue
 *
 * Examples:
 *   BID-VPI095-2606-VTC-001
 *   BID-VPI095-2606-VTC-001A   (re-issue)
 *   BID!-BRA090-2606-VPK-007   (urgent)
 *   BID-MUL-2606-MIX-014       (multi-project, mixed materials)
 */

const BIDCODE_REGEX = /^BID(!?)-([A-Z0-9]{3,8})-(\d{4})-([A-Z]{3})-(\d{3})([A-Z])?$/;

const MAT_LABELS = {
  VTC: 'Thép chính',
  VPK: 'Phụ kiện, bu lông',
  VDK: 'Đóng kiện',
  VBP: 'Biện pháp',
  VTH: 'Tiêu hao',
  VTS: 'Sơn & xử lý bề mặt',
  VTP: 'Dự phòng',
  MIX: 'Nhiều nhóm',
  ALL: 'Tất cả',
};

/**
 * Parse bidcode string into components.
 * Returns null if invalid.
 */
function parseBidCode(code) {
  if (!code || typeof code !== 'string') return null;
  const m = code.match(BIDCODE_REGEX);
  if (!m) return null;
  const [, urgent, proj, yymm, mat, seq, variant] = m;
  const yy = parseInt(yymm.slice(0, 2), 10);
  const mm = parseInt(yymm.slice(2, 4), 10);
  const year = 2000 + yy;
  return {
    raw: code,
    urgent: Boolean(urgent),
    proj,
    yymm,
    year,
    month: mm,
    monthLabel: `${String(mm).padStart(2, '0')}/${year}`,
    mat,
    matLabel: MAT_LABELS[mat] || mat,
    seq: parseInt(seq, 10),
    variant: variant || null,
    // Display segments for UI badges
    badges: [
      { key: 'proj', label: proj, icon: 'folder_open' },
      { key: 'month', label: `${String(mm).padStart(2, '0')}/${year}`, icon: 'calendar_month' },
      { key: 'mat', label: MAT_LABELS[mat] || mat, icon: 'inventory_2' },
      { key: 'seq', label: `#${seq}${variant || ''}`, icon: 'tag' },
      ...(urgent ? [{ key: 'urgent', label: 'Khẩn', icon: 'priority_high', tone: 'danger' }] : []),
    ],
  };
}

/**
 * Derive project short code from project.code
 *   '25-VPI-I-095' → 'VPI095'
 *   '25-BRA-I-090' → 'BRA090'
 *   '25-GEN-G-07'  → 'GEN07'
 */
function projShort(projectCode) {
  if (!projectCode) return 'ALL';
  // pattern: YY-<3char>-<I|G>-<NNN>
  const m = projectCode.match(/^\d{2}-([A-Z]{3})-[A-Z]-?(\d+)$/);
  if (m) return `${m[1]}${m[2].padStart(3, '0')}`;
  // fallback: strip dashes + uppercase
  return projectCode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);
}

/**
 * Derive material group from list of PR items.
 *   - Single mode → that mat
 *   - Multiple distinct → 'MIX'
 *   - Empty → 'ALL'
 */
function deriveMatGroup(items) {
  if (!items || items.length === 0) return 'ALL';
  const counts = {};
  for (const it of items) {
    const m = it.materialGroupCode || 'ALL';
    counts[m] = (counts[m] || 0) + 1;
  }
  const codes = Object.keys(counts);
  if (codes.length === 1) return codes[0];
  // Multiple — return mode if dominant (>60%), else MIX
  const total = items.length;
  const sorted = codes.sort((a, b) => counts[b] - counts[a]);
  const top = sorted[0];
  if (counts[top] / total > 0.6) return top;
  return 'MIX';
}

/**
 * Generate next bidcode for given project + month + material.
 * Queries DB for max seq.
 *
 * @param prisma — Prisma client
 * @param opts.projShort — 'VPI095'
 * @param opts.yymm — '2606'
 * @param opts.mat — 'VTC'
 * @param opts.urgent — boolean
 * @param opts.variant — 'A' | null (for re-issue)
 * @returns {Promise<{code: string, seq: number}>}
 */
async function generateNextBidCode(prisma, opts) {
  const { projShort: proj, yymm, mat, urgent = false, variant = null } = opts;
  // Query max seq for this (proj, yymm)
  // Use raw query for simple aggregation
  const rows = await prisma.bidAnalysis.findMany({
    where: { bidCodeProj: proj, bidCodeYymm: yymm },
    select: { bidCodeSeq: true },
  });
  const maxSeq = rows.reduce((m, r) => Math.max(m, r.bidCodeSeq || 0), 0);
  const nextSeq = variant ? maxSeq : maxSeq + 1;
  const seqStr = String(nextSeq).padStart(3, '0');
  const prefix = urgent ? 'BID!' : 'BID';
  const code = `${prefix}-${proj}-${yymm}-${mat}-${seqStr}${variant || ''}`;
  return { code, seq: nextSeq, variant };
}

/**
 * Compute YYMM from Date.
 */
function yymmOf(date = new Date()) {
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${yy}${mm}`;
}

/**
 * Suggest subject text from PR items.
 *   Logic: pick first 1-3 distinct itemNames + project context.
 *   "Mua <items> cho dự án <code>" (max 80 chars)
 */
function suggestSubject(items, projectCode) {
  if (!items || items.length === 0) return '';
  const distinctNames = [...new Set(items.map((i) => i.itemName).filter(Boolean))];
  const head = distinctNames.slice(0, 3).join(', ');
  const more = distinctNames.length > 3 ? ` và ${distinctNames.length - 3} mã khác` : '';
  const proj = projectCode ? ` cho DA ${projectCode}` : '';
  const subj = `Mua ${head}${more}${proj}`;
  return subj.length > 100 ? subj.slice(0, 97) + '...' : subj;
}

module.exports = {
  BIDCODE_REGEX,
  MAT_LABELS,
  parseBidCode,
  projShort,
  deriveMatGroup,
  generateNextBidCode,
  yymmOf,
  suggestSubject,
};
