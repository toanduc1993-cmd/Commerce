/**
 * paymentScheduleController.js
 *
 * Module 5 (Thanh Toán)
 *
 * Endpoints:
 *   POST /api/v1/payment-schedules/upload  — Upload Excel "Kế hoạch thanh toán"
 *   GET  /api/v1/payment-schedules          — List schedules (filter project, month, status)
 *   PATCH /api/v1/payment-schedules/:id    — Update payment status (mark as paid, ...)
 */

const { parsePaymentSchedule } = require('../services/paymentScheduleParser');
const prisma = require('../lib/prisma');

async function uploadPaymentSchedules(req, res, next) {
  try {
    if (!req.file)
      return res.status(400).json({ success: false, error: 'Vui lòng đính kèm file Excel' });

    const projectCode = req.body.projectCode;
    let project = null;
    if (projectCode) {
      project = await prisma.project.findFirst({ where: { code: projectCode } });
      if (!project)
        project = await prisma.project.create({
          data: { code: projectCode, name: projectCode, status: 'active' },
        });
    }

    const result = parsePaymentSchedule(req.file.buffer);
    if (!result.parsed || result.parsed === 0) {
      return res
        .status(422)
        .json({ success: false, error: 'Không tìm thấy sheet Kế hoạch thanh toán', detail: result });
    }

    const stats = { created: 0, updated: 0, errors: [] };

    for (const sched of result.schedules) {
      try {
        // Try match contractDetail by saleContract
        let contractDetailId = null;
        if (sched.saleContract) {
          const cd = await prisma.contractDetail.findFirst({
            where: { contractNo: sched.saleContract },
            select: { id: true },
          });
          if (cd) contractDetailId = cd.id;
        }

        // Try match project from sched.projectCode
        let pid = project?.id || null;
        if (!pid && sched.projectCode) {
          // sched.projectCode VD "DA 095" → tìm project có code chứa "095"
          const code = sched.projectCode.replace(/da\s*/i, '').trim();
          const found = await prisma.project.findFirst({
            where: { code: { contains: code, mode: 'insensitive' } },
          });
          if (found) pid = found.id;
        }

        // Upsert by (supplier + saleContract)
        const existing = await prisma.paymentSchedule.findFirst({
          where: { supplier: sched.supplier, saleContract: sched.saleContract },
          select: { id: true },
        });

        const data = {
          projectId: pid,
          contractDetailId,
          rowOrder: sched.rowOrder,
          supplier: sched.supplier,
          saleContract: sched.saleContract,
          projectCode: sched.projectCode,
          value: sched.value,
          currency: sched.currency,
          paymentMethod: sched.paymentMethod,
          signDate: sched.signDate,
          lcDate: sched.lcDate,
          etd: sched.etd,
          eta: sched.eta,
          documentDate: sched.documentDate,
          paymentMonth: sched.paymentMonth,
          lcDeadline: sched.lcDeadline,
          notes: sched.notes,
        };

        if (existing) {
          await prisma.paymentSchedule.update({ where: { id: existing.id }, data });
          stats.updated++;
        } else {
          await prisma.paymentSchedule.create({ data });
          stats.created++;
        }
      } catch (err) {
        if (stats.errors.length < 10)
          stats.errors.push({ supplier: sched.supplier, error: err.message.slice(0, 200) });
      }
    }

    res.json({
      success: true,
      message: `Đã import ${stats.created + stats.updated} kế hoạch thanh toán (${stats.created} mới, ${stats.updated} cập nhật)`,
      sheetName: result.sheetName,
      stats,
    });
  } catch (error) {
    next(error);
  }
}

async function listPaymentSchedules(req, res, next) {
  try {
    const { projectCode, month, status, supplier } = req.query;
    const where = {};
    if (projectCode) {
      const p = await prisma.project.findFirst({ where: { code: projectCode } });
      if (p) where.projectId = p.id;
    }
    if (month) where.paymentMonth = { contains: month, mode: 'insensitive' };
    if (status) where.status = status;
    if (supplier) where.supplier = { contains: supplier, mode: 'insensitive' };

    const schedules = await prisma.paymentSchedule.findMany({
      where,
      orderBy: [{ paymentMonth: 'asc' }, { rowOrder: 'asc' }],
      include: {
        project: { select: { code: true, name: true } },
        contractDetail: {
          select: {
            id: true,
            contractNo: true,
            vendorName: true,
            contractType: true,
            totalNoVAT: true,
            totalWithVAT: true,
          },
        },
      },
    });

    // Aggregate by month
    const byMonth = new Map();
    for (const s of schedules) {
      const m = s.paymentMonth || 'Chưa xác định';
      if (!byMonth.has(m)) byMonth.set(m, { count: 0, totalValue: 0 });
      const cur = byMonth.get(m);
      cur.count++;
      cur.totalValue += s.value || 0;
    }

    res.json({
      success: true,
      data: schedules,
      total: schedules.length,
      summary: Array.from(byMonth.entries()).map(([m, v]) => ({ month: m, ...v })),
    });
  } catch (error) {
    next(error);
  }
}

async function updatePaymentStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, paidDate, paidAmount, notes } = req.body;
    const updated = await prisma.paymentSchedule.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(paidDate && { paidDate: new Date(paidDate) }),
        ...(paidAmount !== undefined && { paidAmount }),
        ...(notes !== undefined && { notes }),
      },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  uploadPaymentSchedules,
  listPaymentSchedules,
  updatePaymentStatus,
};
