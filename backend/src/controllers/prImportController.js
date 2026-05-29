const { parseFileBuffer } = require('../services/fileParser');
const { detectMaterialGroup } = require('../services/materialDetector');
const { validateRow, toNum } = require('../services/prValidator');
const prisma = require('../lib/prisma');

// ══════════════════════════════════════════════════════════════════════════════
// PR IMPORT CONTROLLER
// Luồng: parse file → validate row → gate 1 budget check → insert DB
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/prs/import
 * Upload và import PR từ file CSV/XLSX
 */
async function importPR(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Vui lòng đính kèm file CSV/Excel PR',
      });
    }

    // 1. Parse file
    const rawData = await parseFileBuffer(req.file.buffer, req.file.originalname);

    // 2. Validate từng row (Gate 1 row-level)
    const errorRows = [];
    const validRows = [];

    rawData.forEach((row, index) => {
      const result = validateRow(row, index);
      if (result.skip) return;
      if (result.valid) {
        validRows.push({ row: index + 2, data: row, normalized: result.normalized });
      } else {
        errorRows.push(result);
      }
    });

    // Gate 1 Báo Đỏ — rác cấu trúc
    const trashErrors = errorRows.filter((e) => e.isGate1Trash);
    if (trashErrors.length > 0) {
      return res.status(422).json({
        success: false,
        message:
          '[GATE 1 BÁO ĐỎ]: Phát hiện rác cấu trúc! Kỹ thuật đang gửi File PR chứa định dạng Text trong cột số hoặc nhập linh tinh Đơn vị tính.',
        total_errors_detected: trashErrors.length,
        dirty_details: trashErrors,
      });
    }

    // Không có dòng hợp lệ nào
    if (validRows.length === 0 && errorRows.length === 0) {
      return res.status(422).json({
        success: false,
        message: 'File không có dữ liệu hợp lệ. Kiểm tra lại cấu trúc cột tiêu đề.',
      });
    }

    if (errorRows.length > 0 && validRows.length === 0) {
      return res.status(422).json({
        success: false,
        message: `[Gate 1]: Tất cả dòng đều thiếu mô tả vật tư (${errorRows.length} dòng lỗi).`,
        total_errors_detected: errorRows.length,
        dirty_details: errorRows.slice(0, 10),
      });
    }

    // 3. Project info
    const projectCode = req.body.projectCode || req.body.project_code || 'UNKNOWN';
    const projectName = req.body.projectName || req.body.project_name || projectCode;

    if (projectCode === 'UNKNOWN') {
      return res.status(400).json({
        success: false,
        message: 'Không xác định được dự án. Vui lòng chọn dự án trước khi upload.',
      });
    }

    // Upsert project
    let project = await prisma.project.findFirst({ where: { code: projectCode } });
    if (!project) {
      project = await prisma.project.create({
        data: { code: projectCode, name: projectName },
      });
    }

    // 4. Gate 1 Budget Check (chỉ warning nếu chưa có BOM)
    const budgets = await prisma.projectBudget.findMany({ where: { projectId: project.id } });
    const gate1Errors = [];
    const validatedItems = [];

    validRows.forEach((r) => {
      const n = r.normalized;
      const reqQty = toNum(n.netQty || n.reqQty);
      const reqCode = n.itemCode;

      if (budgets.length > 0) {
        const matched = budgets.find(
          (b) => b.itemCode === reqCode || b.itemName.includes(n.itemName)
        );
        if (matched && reqQty > matched.limitQty) {
          gate1Errors.push({
            row_number: r.row,
            status: 'Vượt Ngân Sách',
            errors: [`${reqCode}: yêu cầu ${reqQty} > giới hạn ${matched.limitQty} ${matched.uom}`],
          });
          return;
        }
      }
      validatedItems.push({
        ...r,
        budgetInfo: budgets.length === 0 ? 'CHƯA_CÓ_BOM' : 'TRONG_BOM',
      });
    });

    if (gate1Errors.length > 0) {
      return res.status(422).json({
        success: false,
        message: '[Gate 1]: Phát hiện mã vật tư vượt giới hạn ngân sách BOM.',
        total_errors_detected: gate1Errors.length,
        dirty_details: gate1Errors,
      });
    }

    // 5. Tạo PR Header
    const pr = await prisma.purchaseRequisition.create({
      data: {
        projectId: project.id,
        prRef: `PR-${projectCode}-${Date.now()}`,
        department: req.body.department || 'KỸ THUẬT',
        status: 'SOURCING',
      },
    });

    // 6. Build insert data — chỉ giữ field schema biết
    const insertData = validatedItems.map((r) => {
      const nm = r.normalized;
      const uw = toNum(nm.unitWeight);
      const nq = toNum(nm.netQty);
      const rq = toNum(nm.reqQty) > 0 ? toNum(nm.reqQty) : nq;
      const mg = detectMaterialGroup(nm.itemCode);

      return {
        prId: pr.id,
        itemCode: nm.itemCode,
        itemName: nm.itemName,
        profile: nm.profile || null,
        grade: nm.grade || null,
        uom: nm.uom || 'kg',
        unitWeight: uw,
        netQty: nq,
        netWeight: uw > 0 ? nq * uw : 0,
        reqQty: rq,
        reqWeight: uw > 0 ? rq * uw : 0,
        remainQty: 0,
        remainWeight: 0,
        toBuyQty: rq,
        toBuyWeight: uw > 0 ? rq * uw : 0,
        materialGroupCode: mg.materialGroupCode || null,
        materialSubGroupCode: mg.materialSubGroupCode || null,
        statusFlag: 'Chờ báo giá',
        remarks: null,
      };
    });

    // Insert theo batch 50 để tránh timeout với file lớn
    const BATCH = 50;
    for (let i = 0; i < insertData.length; i += BATCH) {
      await prisma.prDetail.createMany({
        data: insertData.slice(i, i + BATCH),
        skipDuplicates: true,
      });
    }

    res.status(200).json({
      success: true,
      message: `Import thành công ${validatedItems.length} mã vật tư vào dự án ${projectCode}.`,
      valid_items_extracted: validatedItems.length,
      pr_ref: pr.prRef,
      warnings:
        errorRows.length > 0 ? `${errorRows.length} dòng bị bỏ qua (thiếu mô tả)` : undefined,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/prs
 * Danh sách PR detail cho Tracker
 * Query params:
 *   - projectId: filter theo 1 dự án cụ thể
 *   - prRef: filter theo 1 PR cụ thể
 *   - limit: giới hạn số dòng (mặc định không giới hạn — trả hết)
 *   - offset: phân trang (mặc định 0)
 */
async function getListPRs(req, res, next) {
  try {
    const { projectId, prRef, limit, offset } = req.query;

    // Build where clause từ query params
    const where = {};
    if (projectId || prRef) {
      where.pr = {};
      if (projectId) where.pr.projectId = projectId;
      if (prRef) where.pr.prRef = prRef;
    }

    const findOptions = {
      where,
      include: {
        pr: { include: { project: true } },
        contracts: {
          include: {
            inspections: true,
          },
          orderBy: { contractDate: 'asc' },
        },
      },
      orderBy: [{ materialGroupCode: 'asc' }, { materialSubGroupCode: 'asc' }, { itemCode: 'asc' }],
    };

    if (limit) findOptions.take = parseInt(limit, 10);
    if (offset) findOptions.skip = parseInt(offset, 10);

    const [details, total] = await Promise.all([
      prisma.prDetail.findMany(findOptions),
      prisma.prDetail.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: details,
      total,
      count: details.length,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { importPR, getListPRs };
