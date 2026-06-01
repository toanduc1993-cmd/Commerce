/**
 * purchaseHistoryController.js — F3: Lịch sử mua hàng per SKU
 *
 * GET /api/v1/purchase-history?itemCodes=<comma-sep>
 *   → Trả lịch sử ContractDetail gom theo itemCode, kèm phân tích vendor + giá
 *
 * GET /api/v1/purchase-history/summary?itemCode=<single>
 *   → Tóm tắt nhanh cho panel slide-in (1 SKU)
 */

const prisma = require('../lib/prisma');

/**
 * Lấy lịch sử mua hàng cho 1 hoặc nhiều itemCode.
 * Query: itemCodes=I95-VTC-001,I95-VTC-002  hoặc  itemCode=I95-VTC-001
 * Trả về aggregate per itemCode + toàn bộ transaction list.
 */
async function getPurchaseHistory(req, res, next) {
  try {
    const raw = req.query.itemCodes || req.query.itemCode || '';
    if (!raw) {
      return res.status(400).json({ error: 'itemCodes query param required' });
    }

    const itemCodes = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (itemCodes.length === 0) {
      return res.status(400).json({ error: 'At least one itemCode required' });
    }
    if (itemCodes.length > 50) {
      return res.status(400).json({ error: 'Max 50 itemCodes per request' });
    }

    // Lấy contracts + PR info cho các itemCode này
    const contracts = await prisma.contractDetail.findMany({
      where: {
        prDetail: {
          itemCode: { in: itemCodes },
        },
      },
      include: {
        prDetail: {
          select: {
            itemCode: true,
            itemName: true,
            profile: true,
            grade: true,
            uom: true,
            pr: {
              select: {
                prRef: true,
                project: { select: { code: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { contractDate: 'desc' },
    });

    // Group by itemCode
    const byItemCode = new Map();

    for (const c of contracts) {
      const code = c.prDetail?.itemCode;
      if (!code) continue;

      if (!byItemCode.has(code)) {
        byItemCode.set(code, {
          itemCode: code,
          itemName: c.prDetail?.itemName || '',
          profile: c.prDetail?.profile || '',
          grade: c.prDetail?.grade || '',
          uom: c.prDetail?.uom || '',
          transactions: [],
        });
      }
      byItemCode.get(code).transactions.push({
        id: c.id,
        contractNo: c.contractNo,
        vendorName: c.vendorName,
        vendorCountry: c.vendorCountry,
        contractDate: c.contractDate,
        contractQty: c.contractQty,
        contractWeight: c.contractWeight,
        unitPriceNoVAT: c.unitPriceNoVAT,
        currency: c.currency,
        vatRate: c.vatRate,
        totalNoVAT: c.totalNoVAT,
        totalWithVAT: c.totalWithVAT,
        actualProfile: c.actualProfile,
        actualGrade: c.actualGrade,
        status: c.status,
        dataSource: c.dataSource,
        projectCode: c.prDetail?.pr?.project?.code || c.projectCode,
        projectName: c.prDetail?.pr?.project?.name || '',
        prRef: c.prDetail?.pr?.prRef || '',
        deliveredQty: c.deliveredQty,
        contractType: c.contractType,
      });
    }

    // Compute per-itemCode analytics
    const results = [];
    for (const [code, item] of byItemCode.entries()) {
      const txs = item.transactions;
      const vendorMap = new Map();

      for (const t of txs) {
        const vn = t.vendorName || 'Không rõ';
        if (!vendorMap.has(vn)) {
          vendorMap.set(vn, { vendorName: vn, txCount: 0, totalQty: 0, totalValue: 0, prices: [] });
        }
        const v = vendorMap.get(vn);
        v.txCount += 1;
        v.totalQty += t.contractQty || 0;
        v.totalValue += t.totalNoVAT || 0;
        if (t.unitPriceNoVAT > 0) v.prices.push(t.unitPriceNoVAT);
      }

      const vendorSummary = Array.from(vendorMap.values()).map((v) => ({
        ...v,
        avgPrice: v.prices.length > 0 ? v.prices.reduce((a, b) => a + b, 0) / v.prices.length : 0,
        minPrice: v.prices.length > 0 ? Math.min(...v.prices) : 0,
        maxPrice: v.prices.length > 0 ? Math.max(...v.prices) : 0,
      }));
      vendorSummary.sort((a, b) => b.totalQty - a.totalQty);

      const allPrices = txs.filter((t) => t.unitPriceNoVAT > 0).map((t) => t.unitPriceNoVAT);

      results.push({
        ...item,
        summary: {
          totalTransactions: txs.length,
          totalVendors: vendorMap.size,
          totalQtyBought: txs.reduce((s, t) => s + (t.contractQty || 0), 0),
          totalValueNoVAT: txs.reduce((s, t) => s + (t.totalNoVAT || 0), 0),
          avgUnitPrice: allPrices.length > 0 ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : 0,
          minUnitPrice: allPrices.length > 0 ? Math.min(...allPrices) : 0,
          maxUnitPrice: allPrices.length > 0 ? Math.max(...allPrices) : 0,
          latestVendor: txs[0]?.vendorName || null,
          latestPrice: txs[0]?.unitPriceNoVAT || null,
          latestDate: txs[0]?.contractDate || null,
        },
        vendorSummary,
      });
    }

    // itemCodes không có lịch sử nào
    const notFound = itemCodes.filter((c) => !byItemCode.has(c));

    return res.json({
      data: results,
      notFound,
      total: results.length,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/purchase-history/summary?itemCode=<single>
 * Tóm tắt nhanh cho PurchaseHistoryPanel (slide-in).
 * Chỉ lấy 10 giao dịch gần nhất + vendor top 5.
 */
async function getPurchaseHistorySummary(req, res, next) {
  try {
    const { itemCode } = req.query;
    if (!itemCode) {
      return res.status(400).json({ error: 'itemCode query param required' });
    }

    const contracts = await prisma.contractDetail.findMany({
      where: { prDetail: { itemCode } },
      include: {
        prDetail: {
          select: {
            itemCode: true,
            itemName: true,
            uom: true,
            pr: {
              select: {
                prRef: true,
                project: { select: { code: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { contractDate: 'desc' },
      take: 20,
    });

    if (contracts.length === 0) {
      return res.json({
        itemCode,
        found: false,
        summary: null,
        recentTransactions: [],
        vendorSummary: [],
      });
    }

    const vendorMap = new Map();
    for (const c of contracts) {
      const vn = c.vendorName || 'Không rõ';
      if (!vendorMap.has(vn)) {
        vendorMap.set(vn, { vendorName: vn, txCount: 0, totalQty: 0, latestPrice: 0, latestDate: null });
      }
      const v = vendorMap.get(vn);
      v.txCount += 1;
      v.totalQty += c.contractQty || 0;
      if (!v.latestDate || (c.contractDate && c.contractDate > v.latestDate)) {
        v.latestDate = c.contractDate;
        v.latestPrice = c.unitPriceNoVAT;
      }
    }

    const allPrices = contracts.filter((c) => c.unitPriceNoVAT > 0).map((c) => c.unitPriceNoVAT);

    return res.json({
      itemCode,
      found: true,
      itemName: contracts[0].prDetail?.itemName || '',
      uom: contracts[0].prDetail?.uom || '',
      summary: {
        totalTransactions: contracts.length,
        totalVendors: vendorMap.size,
        avgUnitPrice: allPrices.length > 0 ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : 0,
        minUnitPrice: allPrices.length > 0 ? Math.min(...allPrices) : 0,
        maxUnitPrice: allPrices.length > 0 ? Math.max(...allPrices) : 0,
        latestVendor: contracts[0]?.vendorName || null,
        latestPrice: contracts[0]?.unitPriceNoVAT || null,
        latestDate: contracts[0]?.contractDate || null,
      },
      recentTransactions: contracts.slice(0, 10).map((c) => ({
        id: c.id,
        vendorName: c.vendorName,
        contractDate: c.contractDate,
        contractQty: c.contractQty,
        unitPriceNoVAT: c.unitPriceNoVAT,
        currency: c.currency,
        totalNoVAT: c.totalNoVAT,
        projectCode: c.prDetail?.pr?.project?.code || c.projectCode,
        prRef: c.prDetail?.pr?.prRef || '',
        status: c.status,
        contractType: c.contractType,
      })),
      vendorSummary: Array.from(vendorMap.values())
        .sort((a, b) => b.totalQty - a.totalQty)
        .slice(0, 5),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getPurchaseHistory, getPurchaseHistorySummary };
