/**
 * contractController.js
 *
 * Module 4 (Quản Lý Hợp Đồng) — Aggregate ContractDetail records into
 * "Contract" entries (group by contractNo) cho dễ quản lý.
 *
 * Endpoints:
 *   GET  /api/v1/contracts                  — List contracts (group by contractNo)
 *   GET  /api/v1/contracts/:contractNo      — Detail of 1 contract (with line items)
 */

const prisma = require('../lib/prisma');

async function listContracts(req, res, next) {
  try {
    const { projectCode, vendor, type, status } = req.query;

    const where = {
      contractNo: { not: null },
    };
    if (vendor) where.vendorName = { contains: vendor, mode: 'insensitive' };
    if (type) where.contractType = type;
    if (status) where.status = status;
    if (projectCode) {
      const p = await prisma.project.findFirst({ where: { code: projectCode } });
      if (p) {
        where.prDetail = { pr: { projectId: p.id } };
      }
    }

    const contracts = await prisma.contractDetail.findMany({
      where,
      orderBy: [{ contractDate: 'desc' }, { contractNo: 'asc' }],
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
        inspections: true,
      },
    });

    // Group by contractNo + vendorName + contractType
    const groupedMap = new Map();
    for (const c of contracts) {
      const key = `${c.contractNo}|${c.vendorName || ''}|${c.contractType}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          contractNo: c.contractNo,
          vendorName: c.vendorName,
          vendorCountry: c.vendorCountry,
          contractType: c.contractType,
          contractDate: c.contractDate,
          currency: c.currency,
          status: c.status,
          // IMP-specific
          importLCDate: c.importLCDate,
          exportPort: c.exportPort,
          cifDate: c.cifDate,
          paymentDate: c.paymentDate,
          customsDate: c.customsDate,
          arrivedDate: c.arrivedDate,
          qcInvitationDate: c.qcInvitationDate,
          handoverToProductDate: c.handoverToProductDate,
          // Aggregates
          totalQty: 0,
          totalWeight: 0,
          totalNoVAT: 0,
          totalWithVAT: 0,
          itemCount: 0,
          inspectionCount: 0,
          projectCodes: new Set(),
          lineItems: [],
        });
      }
      const g = groupedMap.get(key);
      g.totalQty += c.contractQty || 0;
      g.totalWeight += c.contractWeight || 0;
      g.totalNoVAT += c.totalNoVAT || 0;
      g.totalWithVAT += c.totalWithVAT || 0;
      g.itemCount++;
      g.inspectionCount += c.inspections.length;
      if (c.prDetail?.pr?.project?.code) g.projectCodes.add(c.prDetail.pr.project.code);
      g.lineItems.push({
        id: c.id,
        itemCode: c.prDetail?.itemCode,
        itemName: c.prDetail?.itemName,
        uom: c.prDetail?.uom,
        actualProfile: c.actualProfile,
        actualGrade: c.actualGrade,
        contractQty: c.contractQty,
        contractWeight: c.contractWeight,
        unitPriceNoVAT: c.unitPriceNoVAT,
        totalNoVAT: c.totalNoVAT,
        deliveredQty: c.deliveredQty,
        deliveredWeight: c.deliveredWeight,
        inspectionCount: c.inspections.length,
      });
    }

    const data = Array.from(groupedMap.values()).map((g) => ({
      ...g,
      projectCodes: Array.from(g.projectCodes),
    }));

    res.json({ success: true, data, total: data.length });
  } catch (error) {
    next(error);
  }
}

async function getContractDetail(req, res, next) {
  try {
    const { contractNo } = req.params;
    const items = await prisma.contractDetail.findMany({
      where: { contractNo: decodeURIComponent(contractNo) },
      include: {
        prDetail: {
          select: {
            itemCode: true,
            itemName: true,
            profile: true,
            grade: true,
            uom: true,
            unitWeight: true,
            reqQty: true,
            pr: {
              select: {
                prRef: true,
                project: { select: { code: true, name: true } },
              },
            },
          },
        },
        inspections: true,
      },
    });

    if (items.length === 0)
      return res.status(404).json({ success: false, error: 'Contract not found' });

    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listContracts,
  getContractDetail,
};
