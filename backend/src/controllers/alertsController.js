/**
 * alertsController.js — F04 Alert Center
 *
 * Read: JSON từ project_reconciliation.json (snapshot DA produce, refresh ngoài API).
 * Write: AlertResolution table cho resolved-state.
 *
 * Severity:
 *   HIGH   = flags contains ORPHAN_INVOICE
 *   MEDIUM = flags contains CHƯA_XUẤT_HĐ (without ORPHAN)
 *   LOW    = chỉ có PQLDA_KHÔNG_INV
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../lib/prisma');
const logger = require('../lib/logger');

const DEFAULT_JSON_PATH = path.resolve(
  __dirname,
  '../../../../IBSHI/mua-hang/_index/project_reconciliation.json'
);

function getJsonPath() {
  return process.env.RECON_ALERTS_JSON_PATH || DEFAULT_JSON_PATH;
}

function computeSeverity(flags) {
  if (!Array.isArray(flags)) return null;
  if (flags.includes('ORPHAN_INVOICE')) return 'HIGH';
  if (flags.includes('CHƯA_XUẤT_HĐ')) return 'MEDIUM';
  if (flags.includes('PQLDA_KHÔNG_INV')) return 'LOW';
  return null;
}

function loadReconciliationFile() {
  const p = getJsonPath();
  if (!fs.existsSync(p)) {
    throw Object.assign(new Error(`reconciliation file không tồn tại: ${p}`), {
      statusCode: 503,
    });
  }
  const raw = fs.readFileSync(p, 'utf-8');
  const data = JSON.parse(raw);
  return data;
}

async function listAlerts(req, res, next) {
  try {
    const data = loadReconciliationFile();
    const all = data.reconciliation || [];

    // Filter records that have at least one flag (per spec Q3 — clean 20 unflagged)
    const flagged = all.filter((r) => Array.isArray(r.flags) && r.flags.length > 0);

    // Join with AlertResolution
    const resolutions = await prisma.alertResolution.findMany();
    const resolvedMap = new Map(resolutions.map((r) => [r.canonicalKey, r]));

    const enriched = flagged.map((r) => {
      const severity = computeSeverity(r.flags);
      const res = resolvedMap.get(r.canonical_key);
      return {
        canonical_key: r.canonical_key,
        flags: r.flags,
        severity,
        bid_du_toan_vnd: r.bid_du_toan_vnd || 0,
        pqlda_du_toan_vnd: r.pqlda_du_toan_vnd || 0,
        invoice_thuc_xuat_vnd: r.invoice_thuc_xuat_vnd || 0,
        invoice_n: r.invoice_n || 0,
        delta_pqlda_vs_invoice_vnd: r.delta_pqlda_vs_invoice_vnd || 0,
        pct_invoice_vs_pqlda: r.pct_invoice_vs_pqlda,
        pct_invoice_vs_bid: r.pct_invoice_vs_bid,
        in_bid: !!r.in_bid,
        in_pqlda: !!r.in_pqlda,
        in_invoice: !!r.in_invoice,
        raw_codes_bid: r.raw_codes_bid || [],
        raw_codes_pqlda: r.raw_codes_pqlda || [],
        raw_codes_invoice: r.raw_codes_invoice || [],
        resolved: !!res,
        resolved_at: res?.resolvedAt || null,
        resolved_by: res?.resolvedBy || null,
        resolved_note: res?.note || null,
      };
    });

    // Apply filters from req.query (already validated by validate middleware)
    const { severity, flag, resolved, search } = req.query || {};
    let filtered = enriched;
    if (severity) filtered = filtered.filter((r) => r.severity === severity);
    if (flag) filtered = filtered.filter((r) => r.flags.includes(flag));
    if (resolved !== undefined) {
      const want = resolved === true || resolved === 'true';
      filtered = filtered.filter((r) => r.resolved === want);
    }
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter((r) => r.canonical_key.toLowerCase().includes(q));
    }

    const summary = {
      high: enriched.filter((r) => r.severity === 'HIGH').length,
      medium: enriched.filter((r) => r.severity === 'MEDIUM').length,
      low: enriched.filter((r) => r.severity === 'LOW').length,
      totalResolved: enriched.filter((r) => r.resolved).length,
      lastAuditDate: data.audit_date || null,
      totalFlagged: enriched.length,
    };

    res.json({ success: true, data: filtered, summary });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
}

async function resolveAlert(req, res, next) {
  try {
    const { canonicalKey } = req.params;
    const { note } = req.body || {};
    const userId = req.user?.id || req.user?.username || 'unknown';

    // Verify canonical_key exists in JSON snapshot
    const data = loadReconciliationFile();
    const exists = (data.reconciliation || []).some(
      (r) => r.canonical_key === canonicalKey && Array.isArray(r.flags) && r.flags.length > 0
    );
    if (!exists) {
      return res
        .status(404)
        .json({ success: false, error: `canonical_key '${canonicalKey}' không có trong alerts` });
    }

    const row = await prisma.alertResolution.upsert({
      where: { canonicalKey },
      create: {
        canonicalKey,
        resolvedBy: String(userId),
        note: note || null,
      },
      update: {
        resolvedBy: String(userId),
        resolvedAt: new Date(),
        note: note ?? null,
      },
    });

    res.json({
      success: true,
      data: {
        canonical_key: row.canonicalKey,
        resolved_at: row.resolvedAt,
        resolved_by: row.resolvedBy,
        note: row.note,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function unresolveAlert(req, res, next) {
  try {
    const { canonicalKey } = req.params;
    const existing = await prisma.alertResolution.findUnique({ where: { canonicalKey } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Không có resolved record cho '${canonicalKey}'`,
      });
    }
    await prisma.alertResolution.delete({ where: { canonicalKey } });
    res.json({ success: true, data: { canonical_key: canonicalKey, status: 'open' } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAlerts,
  resolveAlert,
  unresolveAlert,
  // exported for tests
  _internals: { computeSeverity, getJsonPath },
};
