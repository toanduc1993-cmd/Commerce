/**
 * listController.js — Read-only list endpoints cho các module UI
 *
 * Cung cấp danh sách aggregate cho các trang:
 *   - /projects     → listProjects
 *   - /vendors      → listVendors (aggregate từ Quotation + ContractDetail + PurchaseOrder)
 *   - /po           → listPOs
 *   - /warehouse    → listGRNs
 *   - /inventory    → listInventory + listMaterialCatalog
 *   - /dashboard    → dashboardStats
 */

const prisma = require('../lib/prisma');

// ─── PROJECTS ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/projects
 * Trả danh sách dự án + stats (số PR, số mã vật tư, tổng trọng lượng)
 */
async function listProjects(req, res, next) {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { code: 'asc' },
      include: {
        _count: { select: { prs: true, fabricationCategories: true, budgets: true } },
      },
    });

    // Aggregate stats per project
    const stats = await prisma.prDetail.groupBy({
      by: ['prId'],
      _count: { id: true },
      _sum: { reqWeight: true, reqQty: true },
    });

    // Map prId → projectId để gom stats theo project
    const prList = await prisma.purchaseRequisition.findMany({
      select: { id: true, projectId: true },
    });
    const prToProject = new Map(prList.map((p) => [p.id, p.projectId]));

    const projectStats = new Map();
    for (const s of stats) {
      const pid = prToProject.get(s.prId);
      if (!pid) continue;
      const cur = projectStats.get(pid) || { itemCount: 0, totalWeight: 0 };
      cur.itemCount += s._count.id;
      cur.totalWeight += s._sum.reqWeight || 0;
      projectStats.set(pid, cur);
    }

    const data = projects.map((p) => ({
      ...p,
      stats: {
        prCount: p._count.prs,
        fabCategoryCount: p._count.fabricationCategories,
        budgetCount: p._count.budgets,
        itemCount: projectStats.get(p.id)?.itemCount || 0,
        totalWeight: projectStats.get(p.id)?.totalWeight || 0,
      },
    }));

    res.json({ success: true, data, total: data.length });
  } catch (error) {
    next(error);
  }
}

// ─── VENDORS ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/vendors
 * Aggregate vendor info từ ContractDetail + Quotation + PurchaseOrder
 * Mỗi vendor: tên + số HĐ + tổng giá trị + lần giao dịch gần nhất
 */
async function listVendors(req, res, next) {
  try {
    // Lấy tất cả contracts (chứa vendorName + giá trị + ngày)
    const contracts = await prisma.contractDetail.findMany({
      select: {
        vendorName: true,
        vendorCountry: true,
        contractType: true,
        totalNoVAT: true,
        contractDate: true,
        status: true,
      },
    });

    // Lấy thêm POs (có thể chưa có contract)
    const pos = await prisma.purchaseOrder.findMany({
      select: { vendorName: true, totalValue: true, issuedAt: true, status: true },
    });

    // Gộp vendor theo tên
    const vendorMap = new Map();

    for (const c of contracts) {
      if (!c.vendorName) continue;
      const key = c.vendorName.trim();
      const cur = vendorMap.get(key) || {
        name: key,
        country: c.vendorCountry || 'Việt Nam',
        type: c.contractType || 'DOMESTIC',
        contractCount: 0,
        poCount: 0,
        totalValue: 0,
        lastTxDate: null,
        activeContracts: 0,
      };
      cur.contractCount++;
      cur.totalValue += c.totalNoVAT || 0;
      if (c.status === 'ACTIVE') cur.activeContracts++;
      if (c.contractDate && (!cur.lastTxDate || c.contractDate > cur.lastTxDate)) {
        cur.lastTxDate = c.contractDate;
      }
      vendorMap.set(key, cur);
    }

    for (const p of pos) {
      if (!p.vendorName) continue;
      const key = p.vendorName.trim();
      const cur = vendorMap.get(key) || {
        name: key,
        country: 'Việt Nam',
        type: 'DOMESTIC',
        contractCount: 0,
        poCount: 0,
        totalValue: 0,
        lastTxDate: null,
        activeContracts: 0,
      };
      cur.poCount++;
      cur.totalValue += p.totalValue || 0;
      if (p.issuedAt && (!cur.lastTxDate || p.issuedAt > cur.lastTxDate)) {
        cur.lastTxDate = p.issuedAt;
      }
      vendorMap.set(key, cur);
    }

    const data = Array.from(vendorMap.values()).sort((a, b) => b.totalValue - a.totalValue);

    res.json({ success: true, data, total: data.length });
  } catch (error) {
    next(error);
  }
}

// ─── PURCHASE ORDERS ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/pos
 * Danh sách PO + thông tin vendor + tình trạng nhập kho
 */
async function listPOs(req, res, next) {
  try {
    const { status, projectCode } = req.query;

    const where = {};
    if (status) where.status = status;

    const pos = await prisma.purchaseOrder.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      include: {
        bid: {
          select: {
            id: true,
            prId: true,
            pr: {
              select: {
                id: true,
                prRef: true,
                project: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
        contractDetails: {
          select: {
            id: true,
            contractNo: true,
            contractType: true,
            contractDate: true,
            contractQty: true,
            contractWeight: true,
            unitPriceNoVAT: true,
            totalNoVAT: true,
            totalWithVAT: true,
            vendorName: true,
            vendorCountry: true,
            deliveredQty: true,
            deliveredWeight: true,
            status: true,
          },
        },
        grns: {
          select: {
            id: true,
            grnCode: true,
            qcStatus: true,
            receivedAt: true,
          },
        },
      },
    });

    // Filter theo projectCode nếu có
    const filtered = projectCode
      ? pos.filter((po) => po.bid?.pr?.project?.code === projectCode)
      : pos;

    res.json({ success: true, data: filtered, total: filtered.length });
  } catch (error) {
    next(error);
  }
}

// ─── GOODS RECEIVED NOTES (GRN) ────────────────────────────────────────────────

/**
 * GET /api/v1/grns
 * Danh sách phiếu nhập kho + line items + QC status
 */
async function listGRNs(req, res, next) {
  try {
    const { qcStatus, warehouseLocation } = req.query;

    const where = {};
    if (qcStatus) where.qcStatus = qcStatus;
    if (warehouseLocation) where.warehouseLocation = warehouseLocation;

    const grns = await prisma.goodsReceivedNote.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      include: {
        purchaseOrder: { select: { poCode: true, vendorName: true } },
        lineItems: true,
      },
    });

    res.json({ success: true, data: grns, total: grns.length });
  } catch (error) {
    next(error);
  }
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/inventory
 * Danh sách tồn kho thực tế + thông tin pegging
 */
async function listInventory(req, res, next) {
  try {
    const { warehouseLocation, hasStock } = req.query;

    const where = {};
    if (warehouseLocation) where.warehouseLocation = warehouseLocation;
    if (hasStock === 'true') where.onHandQty = { gt: 0 };

    const items = await prisma.inventory.findMany({
      where,
      orderBy: { itemCode: 'asc' },
      include: {
        peggings: {
          where: { status: 'ACTIVE' },
          select: { id: true, peggedQty: true, prDetailId: true, peggedAt: true },
        },
      },
    });

    res.json({ success: true, data: items, total: items.length });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/material-catalog
 * Danh mục master vật tư (aggregate từ PrDetail — distinct itemCode)
 */
async function listMaterialCatalog(req, res, next) {
  try {
    const { groupCode, search } = req.query;

    const where = {};
    if (groupCode) where.materialGroupCode = groupCode;
    if (search) {
      where.OR = [
        { itemCode: { contains: search, mode: 'insensitive' } },
        { itemName: { contains: search, mode: 'insensitive' } },
        { profile: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Lấy distinct theo itemCode
    const items = await prisma.prDetail.findMany({
      where,
      distinct: ['itemCode'],
      select: {
        itemCode: true,
        itemName: true,
        profile: true,
        grade: true,
        uom: true,
        unitWeight: true,
        materialGroupCode: true,
        materialSubGroupCode: true,
      },
      orderBy: [{ materialGroupCode: 'asc' }, { itemCode: 'asc' }],
    });

    res.json({ success: true, data: items, total: items.length });
  } catch (error) {
    next(error);
  }
}

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/dashboard/stats
 * Tổng hợp KPI cho dashboard:
 *  - Số dự án active
 *  - Số mã vật tư tổng
 *  - Tổng KL yêu cầu (tấn)
 *  - Tổng giá trị HĐ
 *  - Số PO theo status
 *  - Top 5 vendors theo giá trị
 */
async function dashboardStats(req, res, next) {
  try {
    const [
      projectCount,
      activeProjectCount,
      prCount,
      prDetailCount,
      prDetailAgg,
      poCount,
      poStatusBreakdown,
      grnCount,
      inventoryCount,
      contractAgg,
    ] = await Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { status: 'active' } }),
      prisma.purchaseRequisition.count(),
      prisma.prDetail.count(),
      prisma.prDetail.aggregate({
        _sum: { reqWeight: true, netWeight: true, toBuyWeight: true },
      }),
      prisma.purchaseOrder.count(),
      prisma.purchaseOrder.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { totalValue: true },
      }),
      prisma.goodsReceivedNote.count(),
      prisma.inventory.count(),
      prisma.contractDetail.aggregate({
        _sum: { totalNoVAT: true, totalWithVAT: true },
        _count: { id: true },
      }),
    ]);

    // Top vendors by total value
    const allContracts = await prisma.contractDetail.findMany({
      where: { vendorName: { not: null } },
      select: { vendorName: true, totalNoVAT: true },
    });
    const vendorMap = new Map();
    for (const c of allContracts) {
      const k = c.vendorName.trim();
      vendorMap.set(k, (vendorMap.get(k) || 0) + (c.totalNoVAT || 0));
    }
    const topVendors = Array.from(vendorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));

    // Item count by group
    const groupBreakdown = await prisma.prDetail.groupBy({
      by: ['materialGroupCode'],
      _count: { id: true },
      _sum: { reqWeight: true, toBuyWeight: true },
    });

    res.json({
      success: true,
      data: {
        projects: { total: projectCount, active: activeProjectCount },
        prs: { total: prCount, items: prDetailCount },
        weights: {
          requested: prDetailAgg._sum.reqWeight || 0,
          net: prDetailAgg._sum.netWeight || 0,
          toBuy: prDetailAgg._sum.toBuyWeight || 0,
        },
        pos: {
          total: poCount,
          breakdown: poStatusBreakdown.map((x) => ({
            status: x.status,
            count: x._count.id,
            totalValue: x._sum.totalValue || 0,
          })),
        },
        grns: { total: grnCount },
        inventory: { items: inventoryCount },
        contracts: {
          count: contractAgg._count.id,
          totalNoVAT: contractAgg._sum.totalNoVAT || 0,
          totalWithVAT: contractAgg._sum.totalWithVAT || 0,
        },
        topVendors,
        groupBreakdown: groupBreakdown.map((g) => ({
          groupCode: g.materialGroupCode || 'OTHER',
          itemCount: g._count.id,
          requestedWeight: g._sum.reqWeight || 0,
          purchasedWeight: g._sum.totalPurchasedWeight || 0,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listProjects,
  listVendors,
  listPOs,
  listGRNs,
  listInventory,
  listMaterialCatalog,
  dashboardStats,
};
