const prisma = require('../lib/prisma');

/**
 * GET /api/v1/prs/:prId/fab-allocations
 * Lấy toàn bộ phân bổ hạng mục gia công của một PR
 * Response: { prId, items: [{ prDetailId, itemCode, allocations: [{ categoryCode, qty, weight }] }] }
 */
const getFabAllocations = async (req, res, next) => {
  try {
    const { prId } = req.params;

    const prDetails = await prisma.prDetail.findMany({
      where: { prId },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        profile: true,
        uom: true,
        reqQty: true,
        reqWeight: true,
        fabAllocations: {
          include: {
            fabricationCategory: {
              select: { id: true, code: true, name: true, sortOrder: true },
            },
          },
          orderBy: { fabricationCategory: { sortOrder: 'asc' } },
        },
      },
      orderBy: { itemCode: 'asc' },
    });

    const items = prDetails.map((d) => ({
      prDetailId: d.id,
      itemCode: d.itemCode,
      itemName: d.itemName,
      profile: d.profile,
      uom: d.uom,
      reqQty: d.reqQty,
      reqWeight: d.reqWeight,
      totalAllocatedQty: d.fabAllocations.reduce((s, a) => s + a.qty, 0),
      totalAllocatedWeight: d.fabAllocations.reduce((s, a) => s + a.weight, 0),
      allocations: d.fabAllocations.map((a) => ({
        id: a.id,
        categoryId: a.fabricationCategoryId,
        categoryCode: a.fabricationCategory.code,
        categoryName: a.fabricationCategory.name,
        qty: a.qty,
        weight: a.weight,
      })),
    }));

    res.status(200).json({ success: true, prId, count: items.length, items });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/prs/details/:prDetailId/fab-allocations
 * Lấy phân bổ của 1 PrDetail cụ thể
 */
const getFabAllocationsForDetail = async (req, res, next) => {
  try {
    const { prDetailId } = req.params;

    const detail = await prisma.prDetail.findUnique({
      where: { id: prDetailId },
      include: {
        fabAllocations: {
          include: { fabricationCategory: true },
          orderBy: { fabricationCategory: { sortOrder: 'asc' } },
        },
      },
    });

    if (!detail) return res.status(404).json({ success: false, error: 'PrDetail không tồn tại.' });

    const totalAllocated = detail.fabAllocations.reduce((s, a) => s + a.qty, 0);
    const remaining = detail.reqQty - totalAllocated;

    res.status(200).json({
      success: true,
      prDetailId,
      itemCode: detail.itemCode,
      reqQty: detail.reqQty,
      totalAllocatedQty: totalAllocated,
      remainingQty: remaining,
      isFullyAllocated: remaining <= 0,
      allocations: detail.fabAllocations.map((a) => ({
        id: a.id,
        categoryId: a.fabricationCategoryId,
        categoryCode: a.fabricationCategory.code,
        categoryName: a.fabricationCategory.name,
        qty: a.qty,
        weight: a.weight,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/prs/details/:prDetailId/fab-allocations
 * Lưu (upsert) toàn bộ phân bổ hạng mục cho 1 PrDetail
 * Body: { allocations: [{ fabricationCategoryId, qty, weight }] }
 *
 * Business rule: SUM(qty) <= PrDetail.reqQty
 */
const saveFabAllocations = async (req, res, next) => {
  try {
    const { prDetailId } = req.params;
    const { allocations } = req.body;

    if (!allocations || !Array.isArray(allocations)) {
      return res.status(400).json({ error: 'Body phải có field allocations (array).' });
    }

    const detail = await prisma.prDetail.findUnique({ where: { id: prDetailId } });
    if (!detail) return res.status(404).json({ success: false, error: 'PrDetail không tồn tại.' });

    // Validate: tổng qty không vượt reqQty
    const totalQty = allocations.reduce((s, a) => s + (parseFloat(a.qty) || 0), 0);
    if (totalQty > detail.reqQty + 0.001) {
      // tolerance nhỏ cho float
      return res.status(400).json({
        success: false,
        error: `Tổng phân bổ (${totalQty.toFixed(3)} ${detail.uom}) vượt số lượng yêu cầu mua (${detail.reqQty} ${detail.uom}).`,
        totalQty,
        reqQty: detail.reqQty,
        overage: totalQty - detail.reqQty,
      });
    }

    // Upsert trong transaction
    await prisma.$transaction(async (tx) => {
      for (const alloc of allocations) {
        const { fabricationCategoryId, qty, weight } = alloc;
        if (!fabricationCategoryId) continue;

        const qtyVal = parseFloat(qty) || 0;
        const weightVal = parseFloat(weight) || 0;

        if (qtyVal === 0) {
          // Xóa allocation nếu qty = 0
          await tx.prDetailFabAllocation.deleteMany({
            where: { prDetailId, fabricationCategoryId },
          });
        } else {
          await tx.prDetailFabAllocation.upsert({
            where: {
              prDetailId_fabricationCategoryId: { prDetailId, fabricationCategoryId },
            },
            update: { qty: qtyVal, weight: weightVal },
            create: { prDetailId, fabricationCategoryId, qty: qtyVal, weight: weightVal },
          });
        }
      }
    });

    // Audit log
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          action: 'UPDATE_FAB_ALLOCATION',
          userId: req.user.id,
          entityType: 'PrDetail',
          entityId: prDetailId,
          details: JSON.stringify({ allocations, totalQty }),
        },
      });
    }

    // Trả về trạng thái sau khi lưu
    const updated = await prisma.prDetailFabAllocation.findMany({
      where: { prDetailId },
      include: { fabricationCategory: { select: { code: true, name: true } } },
      orderBy: { fabricationCategory: { sortOrder: 'asc' } },
    });

    res.status(200).json({
      success: true,
      message: `Đã lưu ${updated.length} phân bổ hạng mục cho ${detail.itemCode}.`,
      totalAllocatedQty: totalQty,
      remainingQty: detail.reqQty - totalQty,
      isFullyAllocated: Math.abs(detail.reqQty - totalQty) < 0.001,
      allocations: updated.map((a) => ({
        categoryCode: a.fabricationCategory.code,
        categoryName: a.fabricationCategory.name,
        qty: a.qty,
        weight: a.weight,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/prs/details/:prDetailId/fab-allocations
 * Xóa toàn bộ phân bổ của 1 PrDetail (reset)
 */
const clearFabAllocations = async (req, res, next) => {
  try {
    const { prDetailId } = req.params;
    const result = await prisma.prDetailFabAllocation.deleteMany({ where: { prDetailId } });
    res
      .status(200)
      .json({ success: true, deleted: result.count, message: `Đã xóa ${result.count} phân bổ.` });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/projects/:projectId/fab-categories
 * Lấy danh sách hạng mục gia công của một project
 */
const getProjectFabCategories = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const cats = await prisma.fabricationCategory.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true, sortOrder: true },
    });
    res.status(200).json({ success: true, projectId, count: cats.length, categories: cats });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFabAllocations,
  getFabAllocationsForDetail,
  saveFabAllocations,
  clearFabAllocations,
  getProjectFabCategories,
};
