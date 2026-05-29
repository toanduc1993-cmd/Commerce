/**
 * vendorController.js — Vendor master CRUD
 *
 * Endpoints:
 *   GET    /api/v1/vendor-master          — List với filter + aggregated stats
 *   GET    /api/v1/vendor-master/:id      — Detail 1 vendor + history
 *   POST   /api/v1/vendor-master          — Create
 *   PATCH  /api/v1/vendor-master/:id      — Update
 *   DELETE /api/v1/vendor-master/:id      — Delete (soft: set status=INACTIVE)
 *   POST   /api/v1/vendor-master/seed     — Auto-seed từ existing contracts
 */

const prisma = require('../lib/prisma');

async function listVendorsMaster(req, res, next) {
  try {
    const { search, type, status } = req.query;
    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { shortName: { contains: search, mode: 'insensitive' } },
        { taxCode: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (type) where.vendorType = type;
    if (status) where.status = status;

    const vendors = await prisma.vendor.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    // Aggregate stats: đếm contracts + total value từ ContractDetail
    const statsRaw = await prisma.contractDetail.groupBy({
      by: ['vendorName'],
      _count: { id: true },
      _sum: { totalNoVAT: true },
      where: { vendorName: { not: null } },
    });
    const statsByName = new Map();
    for (const s of statsRaw) {
      statsByName.set(s.vendorName.trim().toLowerCase(), {
        contractCount: s._count.id,
        totalValue: s._sum.totalNoVAT || 0,
      });
    }

    const data = vendors.map((v) => {
      // Match by name or shortName
      const key1 = (v.name || '').trim().toLowerCase();
      const key2 = (v.shortName || '').trim().toLowerCase();
      const st = statsByName.get(key1) || statsByName.get(key2) || { contractCount: 0, totalValue: 0 };
      return { ...v, stats: st };
    });

    res.json({ success: true, data, total: data.length });
  } catch (error) {
    next(error);
  }
}

async function getVendorMaster(req, res, next) {
  try {
    const { id } = req.params;
    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });

    // Lấy contracts history
    const contracts = await prisma.contractDetail.findMany({
      where: {
        OR: [{ vendorName: vendor.name }, ...(vendor.shortName ? [{ vendorName: vendor.shortName }] : [])],
      },
      orderBy: { contractDate: 'desc' },
      take: 50,
      select: {
        id: true,
        contractNo: true,
        contractType: true,
        contractDate: true,
        contractQty: true,
        contractWeight: true,
        totalNoVAT: true,
        totalWithVAT: true,
        status: true,
        prDetail: {
          select: {
            itemCode: true,
            itemName: true,
            pr: { select: { project: { select: { code: true } } } },
          },
        },
      },
    });

    res.json({ success: true, data: { ...vendor, contracts } });
  } catch (error) {
    next(error);
  }
}

async function createVendor(req, res, next) {
  try {
    const data = req.body;
    if (!data.name) return res.status(400).json({ success: false, error: 'Thiếu tên NCC' });

    const existing = await prisma.vendor.findUnique({ where: { name: data.name } });
    if (existing)
      return res.status(409).json({ success: false, error: `NCC "${data.name}" đã tồn tại` });

    const vendor = await prisma.vendor.create({ data });
    res.status(201).json({ success: true, data: vendor });
  } catch (error) {
    next(error);
  }
}

async function updateVendor(req, res, next) {
  try {
    const { id } = req.params;
    const data = req.body;
    // Loại bỏ read-only fields
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;

    const updated = await prisma.vendor.update({ where: { id }, data });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

async function deleteVendor(req, res, next) {
  try {
    const { id } = req.params;
    const { hard } = req.query;
    if (hard === 'true') {
      await prisma.vendor.delete({ where: { id } });
    } else {
      // Soft delete
      await prisma.vendor.update({ where: { id }, data: { status: 'INACTIVE' } });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/**
 * Auto-seed Vendor master từ ContractDetail + BidQuoteVendor (distinct vendor names)
 */
async function seedVendorsFromHistory(req, res, next) {
  try {
    // Collect distinct vendor names
    const fromContracts = await prisma.contractDetail.findMany({
      where: { vendorName: { not: null } },
      select: { vendorName: true, contractType: true, vendorCountry: true },
      distinct: ['vendorName'],
    });

    const fromBids = await prisma.bidQuoteVendor.findMany({
      select: { vendorName: true, vendorType: true },
      distinct: ['vendorName'],
    });

    const vendorMap = new Map();
    for (const c of fromContracts) {
      const name = c.vendorName.trim();
      if (!name) continue;
      if (!vendorMap.has(name)) {
        vendorMap.set(name, {
          name,
          vendorType: c.contractType || 'DOMESTIC',
          country: c.vendorCountry || (c.contractType === 'IMPORT' ? 'Nước ngoài' : 'Việt Nam'),
        });
      }
    }
    for (const b of fromBids) {
      const name = b.vendorName.trim();
      if (!name) continue;
      if (!vendorMap.has(name)) {
        vendorMap.set(name, {
          name,
          vendorType: b.vendorType || 'DOMESTIC',
          country: b.vendorType === 'IMPORT' ? 'Nước ngoài' : 'Việt Nam',
        });
      }
    }

    let created = 0;
    let skipped = 0;
    for (const [name, data] of vendorMap) {
      const existing = await prisma.vendor.findUnique({ where: { name } });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.vendor.create({ data: { ...data, status: 'ACTIVE' } });
      created++;
    }

    res.json({
      success: true,
      message: `Đã tạo ${created} NCC mới (${skipped} đã tồn tại, bỏ qua)`,
      stats: { created, skipped, total: vendorMap.size },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listVendorsMaster,
  getVendorMaster,
  createVendor,
  updateVendor,
  deleteVendor,
  seedVendorsFromHistory,
};
