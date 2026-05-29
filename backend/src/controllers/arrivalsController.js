/**
 * arrivalsController.js — Track hàng về kho + QC
 *
 * Khác với GRN cũ (manual entry), arrivals được dẫn xuất từ ContractDetail:
 *   - arrivedDate IS NOT NULL → đã về kho
 *   - inspections relation → kết quả QC
 *   - handoverToProductDate → đã bàn giao sản xuất
 *
 * Endpoints:
 *   GET   /api/v1/arrivals                       — List ContractDetail có arrivedDate
 *   GET   /api/v1/arrivals/stats                 — Aggregate stats
 *   PATCH /api/v1/arrivals/:id                   — Update arrivedDate / qcInvitationDate / handover
 *   POST  /api/v1/arrivals/:id/inspections       — Thêm InspectionRecord
 *   PATCH /api/v1/arrivals/inspections/:id       — Update InspectionRecord
 *   DELETE /api/v1/arrivals/inspections/:id      — Xoá InspectionRecord
 */

const prisma = require('../lib/prisma');

async function listArrivals(req, res, next) {
  try {
    const { search, qc, type, projectCode, hasArrived } = req.query;

    const where = {};
    // Mặc định chỉ lấy các HĐ đã có arrivedDate
    if (hasArrived !== 'all') {
      where.arrivedDate = { not: null };
    }
    if (type) where.contractType = type;
    if (projectCode) {
      const p = await prisma.project.findFirst({ where: { code: projectCode } });
      if (p) where.prDetail = { pr: { projectId: p.id } };
    }
    if (search) {
      where.OR = [
        { contractNo: { contains: search, mode: 'insensitive' } },
        { vendorName: { contains: search, mode: 'insensitive' } },
        { prDetail: { itemCode: { contains: search, mode: 'insensitive' } } },
        { prDetail: { itemName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const rows = await prisma.contractDetail.findMany({
      where,
      orderBy: [{ arrivedDate: 'desc' }, { contractNo: 'asc' }],
      include: {
        prDetail: {
          select: {
            itemCode: true,
            itemName: true,
            uom: true,
            profile: true,
            grade: true,
            pr: { select: { prRef: true, project: { select: { code: true, name: true } } } },
          },
        },
        inspections: { orderBy: { inspectionDate: 'desc' } },
      },
    });

    // Compute QC status
    const data = rows.map((r) => {
      const qcStatus = computeQCStatus(r.inspections);
      const isHandedOver = !!r.handoverToProductDate;
      return {
        id: r.id,
        contractNo: r.contractNo,
        contractType: r.contractType,
        vendorName: r.vendorName,
        vendorCountry: r.vendorCountry,
        contractDate: r.contractDate,
        arrivedDate: r.arrivedDate,
        qcInvitationDate: r.qcInvitationDate,
        handoverDate: r.handoverDate,
        handoverToProductDate: r.handoverToProductDate,
        contractQty: r.contractQty,
        contractWeight: r.contractWeight,
        deliveredQty: r.deliveredQty,
        deliveredWeight: r.deliveredWeight,
        actualProfile: r.actualProfile,
        actualGrade: r.actualGrade,
        status: r.status,
        qcStatus,
        isHandedOver,
        item: {
          itemCode: r.prDetail?.itemCode,
          itemName: r.prDetail?.itemName,
          uom: r.prDetail?.uom,
          profile: r.prDetail?.profile,
          grade: r.prDetail?.grade,
        },
        project: r.prDetail?.pr?.project || null,
        prRef: r.prDetail?.pr?.prRef,
        inspections: r.inspections.map((i) => ({
          id: i.id,
          reportNo: i.reportNo,
          inspectionDate: i.inspectionDate,
          inspectedQty: i.inspectedQty,
          inspectedWeight: i.inspectedWeight,
          acceptedQty: i.acceptedQty,
          acceptedWeight: i.acceptedWeight,
          result: i.result,
          remarks: i.remarks,
        })),
      };
    });

    // Filter by QC status (post-compute)
    const filtered = qc && qc !== 'all' ? data.filter((d) => d.qcStatus === qc) : data;

    res.json({ success: true, data: filtered, total: filtered.length });
  } catch (error) {
    next(error);
  }
}

function computeQCStatus(inspections) {
  if (!inspections || inspections.length === 0) return 'PENDING';
  const results = inspections.map((i) => (i.result || '').toLowerCase());
  if (results.some((r) => r.includes('fail') || r.includes('không'))) return 'FAILED';
  if (results.some((r) => r.includes('partial') || r.includes('một phần'))) return 'PARTIAL';
  if (results.some((r) => r.includes('pass') || r.includes('đạt'))) return 'PASSED';
  return 'PENDING';
}

async function getArrivalStats(req, res, next) {
  try {
    const all = await prisma.contractDetail.findMany({
      where: { arrivedDate: { not: null } },
      include: { inspections: true },
    });
    const passed = all.filter((r) => computeQCStatus(r.inspections) === 'PASSED').length;
    const failed = all.filter((r) => computeQCStatus(r.inspections) === 'FAILED').length;
    const pending = all.filter((r) => computeQCStatus(r.inspections) === 'PENDING').length;
    const handedOver = all.filter((r) => !!r.handoverToProductDate).length;
    const totalWeight = all.reduce((s, r) => s + (r.contractWeight || 0), 0);
    res.json({
      success: true,
      data: {
        totalArrivals: all.length,
        passed,
        failed,
        pending,
        handedOver,
        totalWeight,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updateArrival(req, res, next) {
  try {
    const { id } = req.params;
    const allowed = [
      'arrivedDate',
      'qcInvitationDate',
      'handoverDate',
      'handoverToProductDate',
      'deliveredQty',
      'deliveredWeight',
      'notes',
    ];
    const data = {};
    for (const k of allowed) {
      if (k in req.body) {
        data[k] = req.body[k];
        // Coerce date strings
        if (k.endsWith('Date') && data[k]) data[k] = new Date(data[k]);
      }
    }
    const updated = await prisma.contractDetail.update({ where: { id }, data });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

async function addInspection(req, res, next) {
  try {
    const { id } = req.params; // contractDetailId
    const cd = await prisma.contractDetail.findUnique({ where: { id } });
    if (!cd) return res.status(404).json({ success: false, error: 'Contract detail not found' });

    const data = {
      contractDetailId: id,
      inspectionType: cd.contractType,
      reportNo: req.body.reportNo || null,
      inspectionDate: req.body.inspectionDate ? new Date(req.body.inspectionDate) : null,
      inspectedQty: Number(req.body.inspectedQty) || 0,
      inspectedWeight: Number(req.body.inspectedWeight) || 0,
      acceptedQty: Number(req.body.acceptedQty) || 0,
      acceptedWeight: Number(req.body.acceptedWeight) || 0,
      result: req.body.result || 'PENDING',
      remarks: req.body.remarks || null,
    };
    const created = await prisma.inspectionRecord.create({ data });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
}

async function updateInspection(req, res, next) {
  try {
    const { id } = req.params;
    const allowed = [
      'reportNo',
      'inspectionDate',
      'inspectedQty',
      'inspectedWeight',
      'acceptedQty',
      'acceptedWeight',
      'result',
      'remarks',
    ];
    const data = {};
    for (const k of allowed) {
      if (k in req.body) {
        data[k] = req.body[k];
        if (k === 'inspectionDate' && data[k]) data[k] = new Date(data[k]);
        if (k.startsWith('inspected') || k.startsWith('accepted')) data[k] = Number(data[k]) || 0;
      }
    }
    const updated = await prisma.inspectionRecord.update({ where: { id }, data });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

async function deleteInspection(req, res, next) {
  try {
    const { id } = req.params;
    await prisma.inspectionRecord.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listArrivals,
  getArrivalStats,
  updateArrival,
  addInspection,
  updateInspection,
  deleteInspection,
};
