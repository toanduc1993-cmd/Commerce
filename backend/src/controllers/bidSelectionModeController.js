// ============================================================
// F-BID-A Phase A v3: Selection Mode endpoints
//   - PATCH /:id/selection-mode          — đổi mode + reset selections cũ
//   - POST  /:id/group-selection         — PER_GROUP mode
//   - GET   /:id/group-selections        — list group selections
//   - POST  /:id/auto-select-min-price   — AUTO_MIN_PRICE algorithm
//   - POST  /:id/vendor-scores           — MANUAL_WEIGHTED score input
//   - GET   /:id/vendor-scores           — list scores
// ============================================================
const prisma = require('../lib/prisma');
const logger = require('../lib/logger');

const VALID_MODES = ['PER_BID', 'PER_ITEM', 'PER_GROUP', 'AUTO_MIN_PRICE', 'MANUAL_WEIGHTED'];

async function audit(req, action, bidId, details) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id || null,
        action,
        entityType: 'BidAnalysis',
        entityId: bidId,
        details: JSON.stringify(details),
      },
    });
  } catch (e) {
    (req.log || logger).warn({ err: e.message?.slice(0, 100) }, 'Audit log failed (non-fatal)');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PATCH /bid-analyses/:id/selection-mode  body: { mode }
//   Reset selections cũ khi switch mode khác:
//     PER_BID → reset BidQuoteVendor.isWinner
//     PER_ITEM → reset BidQuoteOffer.selectedVendorName
//     PER_GROUP → wipe BidGroupSelection
//     AUTO_MIN_PRICE → reset BidQuoteOffer.selectedVendorName (overlaps PER_ITEM)
//     MANUAL_WEIGHTED → wipe BidVendorScore
// ────────────────────────────────────────────────────────────────────────────
exports.setSelectionMode = async (req, res) => {
  try {
    const { id } = req.params;
    const { mode } = req.body || {};

    if (!VALID_MODES.includes(mode)) {
      return res
        .status(400)
        .json({ success: false, error: `Mode không hợp lệ. Chọn: ${VALID_MODES.join(', ')}` });
    }

    const bid = await prisma.bidAnalysis.findUnique({ where: { id } });
    if (!bid) return res.status(404).json({ success: false, error: 'Không tìm thấy BidAnalysis.' });

    if (bid.selectionMode === mode) {
      return res
        .status(200)
        .json({ success: true, id, selectionMode: mode, resetCount: 0, unchanged: true });
    }

    let resetCount = 0;
    await prisma.$transaction(async (tx) => {
      // Reset selections theo MODE CŨ
      if (bid.selectionMode === 'PER_BID') {
        const r = await tx.bidQuoteVendor.updateMany({
          where: { bidId: id, isWinner: true },
          data: { isWinner: false },
        });
        resetCount += r.count;
      }
      if (bid.selectionMode === 'PER_ITEM' || bid.selectionMode === 'AUTO_MIN_PRICE') {
        const r = await tx.bidQuoteOffer.updateMany({
          where: { bidAnalysisItem: { bidId: id }, selectedVendorName: { not: null } },
          data: { selectedVendorName: null },
        });
        resetCount += r.count;
      }
      if (bid.selectionMode === 'PER_GROUP') {
        const r = await tx.bidGroupSelection.deleteMany({ where: { bidAnalysisId: id } });
        resetCount += r.count;
      }
      if (bid.selectionMode === 'MANUAL_WEIGHTED') {
        const r = await tx.bidVendorScore.deleteMany({ where: { bidAnalysisId: id } });
        resetCount += r.count;
      }

      await tx.bidAnalysis.update({
        where: { id },
        data: { selectionMode: mode },
      });
    });

    await audit(req, 'BID_SELECTION_MODE_CHANGED', id, {
      from: bid.selectionMode,
      to: mode,
      resetCount,
    });

    res.status(200).json({ success: true, id, selectionMode: mode, resetCount });
  } catch (error) {
    (req.log || logger).error({ err: error, op: 'setSelectionMode' }, 'Set selection mode failed');
    res.status(500).json({ success: false, error: 'Lỗi hệ thống.' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POST /bid-analyses/:id/group-selection  body: { groupCode, vendorName, notes? }
// ────────────────────────────────────────────────────────────────────────────
exports.upsertGroupSelection = async (req, res) => {
  try {
    const { id } = req.params;
    const { groupCode, vendorName, notes } = req.body || {};
    if (!groupCode || !vendorName) {
      return res
        .status(400)
        .json({ success: false, error: 'Thiếu groupCode hoặc vendorName.' });
    }

    const bid = await prisma.bidAnalysis.findUnique({ where: { id } });
    if (!bid) return res.status(404).json({ success: false, error: 'Không tìm thấy BidAnalysis.' });
    if (bid.selectionMode !== 'PER_GROUP') {
      return res.status(400).json({
        success: false,
        error: `BID đang ở mode "${bid.selectionMode}", không phải PER_GROUP.`,
      });
    }

    const selection = await prisma.bidGroupSelection.upsert({
      where: {
        bidAnalysisId_materialSubGroupCode: {
          bidAnalysisId: id,
          materialSubGroupCode: groupCode,
        },
      },
      create: {
        bidAnalysisId: id,
        materialSubGroupCode: groupCode,
        selectedVendorName: vendorName,
        selectedBy: req.user?.id || 'unknown',
        notes,
      },
      update: { selectedVendorName: vendorName, selectedBy: req.user?.id || 'unknown', notes },
    });

    await audit(req, 'BID_GROUP_VENDOR_SELECTED', id, { groupCode, vendorName });

    res.status(200).json({ success: true, data: selection });
  } catch (error) {
    (req.log || logger).error({ err: error, op: 'upsertGroupSelection' }, 'Group selection failed');
    res.status(500).json({ success: false, error: 'Lỗi hệ thống.' });
  }
};

exports.listGroupSelections = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await prisma.bidGroupSelection.findMany({
      where: { bidAnalysisId: id },
      orderBy: { selectedAt: 'asc' },
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    (req.log || logger).error({ err: error, op: 'listGroupSelections' }, 'List failed');
    res.status(500).json({ success: false, error: 'Lỗi hệ thống.' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POST /bid-analyses/:id/auto-select-min-price body: { confirm: true }
// Algorithm (per DA spec F-BID-A clarify #3):
//   - Eligible offer: scope='V' AND unitPrice > 0 AND currency matches BID
//   - For each item, pick min(unitPrice). Tie-break: vendor name ASC.
//   - Skip items without eligible offers (log reason).
// ────────────────────────────────────────────────────────────────────────────
exports.autoSelectMinPrice = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.body?.confirm) {
      return res
        .status(400)
        .json({ success: false, error: 'Cần confirm=true để chạy auto-select.' });
    }

    const bid = await prisma.bidAnalysis.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            offers: { include: { vendor: true } },
          },
        },
        vendors: { select: { vendorName: true, currency: true } },
      },
    });

    if (!bid) return res.status(404).json({ success: false, error: 'Không tìm thấy BidAnalysis.' });
    if (bid.selectionMode !== 'AUTO_MIN_PRICE') {
      return res.status(400).json({
        success: false,
        error: `BID đang ở mode "${bid.selectionMode}", không phải AUTO_MIN_PRICE.`,
      });
    }

    // Determine BID currency (use most common vendor currency, default VND)
    const currencyVotes = {};
    bid.vendors.forEach((v) => {
      currencyVotes[v.currency || 'VND'] = (currencyVotes[v.currency || 'VND'] || 0) + 1;
    });
    const bidCurrency =
      Object.entries(currencyVotes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'VND';

    const updates = [];
    const skips = [];
    let totalValue = 0;

    for (const item of bid.items) {
      const eligible = item.offers.filter(
        (o) =>
          o.scope === 'V' &&
          (o.unitPrice || 0) > 0 &&
          (o.vendor?.currency || 'VND') === bidCurrency
      );

      if (eligible.length === 0) {
        skips.push({
          itemId: item.id,
          itemName: item.itemName,
          reason: 'no_eligible_offers',
        });
        continue;
      }

      // min by unitPrice, tie-break by vendor name ASC
      eligible.sort((a, b) => {
        if (a.unitPrice !== b.unitPrice) return a.unitPrice - b.unitPrice;
        return (a.vendor?.vendorName || '').localeCompare(b.vendor?.vendorName || '');
      });
      const winner = eligible[0];
      updates.push({
        itemId: item.id,
        itemName: item.itemName,
        vendorName: winner.vendor?.vendorName,
        unitPrice: winner.unitPrice,
        totalPrice: (winner.unitPrice || 0) * (item.qtyToBuy || 0),
      });
      totalValue += updates[updates.length - 1].totalPrice;
    }

    // Apply: mỗi item set selectedVendorName trên winning offer
    await prisma.$transaction(async (tx) => {
      // First clear all previous selections cho BID này
      await tx.bidQuoteOffer.updateMany({
        where: { bidAnalysisItem: { bidId: id }, selectedVendorName: { not: null } },
        data: { selectedVendorName: null },
      });
      // Mark winning offer cho mỗi item
      for (const u of updates) {
        await tx.bidQuoteOffer.updateMany({
          where: {
            bidAnalysisItem: { id: u.itemId },
            vendor: { vendorName: u.vendorName },
          },
          data: { selectedVendorName: u.vendorName },
        });
      }
    });

    await audit(req, 'BID_AUTO_MIN_PRICE_APPLIED', id, {
      updated: updates.length,
      skipped: skips.length,
      bidCurrency,
      totalValue,
    });

    res.status(200).json({
      success: true,
      updated: updates.length,
      skipped: skips.length,
      bidCurrency,
      totalValue,
      details: { updates, skips },
    });
  } catch (error) {
    (req.log || logger).error({ err: error, op: 'autoSelectMinPrice' }, 'AUTO_MIN_PRICE failed');
    res.status(500).json({ success: false, error: 'Lỗi hệ thống.' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POST /bid-analyses/:id/vendor-scores body: { vendorName, priceScore, qualityScore, paymentScore, criteria? }
// ────────────────────────────────────────────────────────────────────────────
exports.scoreVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendorName, priceScore, qualityScore, paymentScore, criteria } = req.body || {};

    if (!vendorName) {
      return res.status(400).json({ success: false, error: 'Thiếu vendorName.' });
    }
    const scores = [priceScore, qualityScore, paymentScore];
    if (scores.some((s) => typeof s !== 'number' || s < 0 || s > 100)) {
      return res.status(400).json({
        success: false,
        error: 'priceScore/qualityScore/paymentScore phải là số trong [0, 100].',
      });
    }

    const bid = await prisma.bidAnalysis.findUnique({ where: { id } });
    if (!bid) return res.status(404).json({ success: false, error: 'Không tìm thấy BidAnalysis.' });

    // Weighting: từ bid.weightingCriteria, default { price: 0.5, quality: 0.3, paymentTerms: 0.2 }
    let weights = { price: 0.5, quality: 0.3, paymentTerms: 0.2 };
    if (criteria && typeof criteria === 'object') {
      weights = { ...weights, ...criteria };
      // Update bid weightingCriteria nếu khác
      await prisma.bidAnalysis.update({
        where: { id },
        data: { weightingCriteria: weights },
      });
    } else if (bid.weightingCriteria) {
      weights = bid.weightingCriteria;
    }

    const overall =
      priceScore * (weights.price || 0) +
      qualityScore * (weights.quality || 0) +
      paymentScore * (weights.paymentTerms || 0);

    const score = await prisma.bidVendorScore.upsert({
      where: {
        bidAnalysisId_vendorName: { bidAnalysisId: id, vendorName },
      },
      create: {
        bidAnalysisId: id,
        vendorName,
        priceScore,
        qualityScore,
        paymentScore,
        overallScore: overall,
        scoredBy: req.user?.id || 'unknown',
      },
      update: {
        priceScore,
        qualityScore,
        paymentScore,
        overallScore: overall,
        scoredBy: req.user?.id || 'unknown',
      },
    });

    await audit(req, 'BID_VENDOR_SCORED', id, { vendorName, overall, weights });

    res.status(200).json({ success: true, data: score, weights });
  } catch (error) {
    (req.log || logger).error({ err: error, op: 'scoreVendor' }, 'Score vendor failed');
    res.status(500).json({ success: false, error: 'Lỗi hệ thống.' });
  }
};

exports.listVendorScores = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await prisma.bidVendorScore.findMany({
      where: { bidAnalysisId: id },
      orderBy: { overallScore: 'desc' },
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    (req.log || logger).error({ err: error, op: 'listVendorScores' }, 'List scores failed');
    res.status(500).json({ success: false, error: 'Lỗi hệ thống.' });
  }
};
