/**
 * procurementUpdateController.js
 *
 * Endpoint POST /api/v1/prs/update-procurement
 * Upload file Excel "Theo Dõi Dự Án" để cập nhật tình trạng mua sắm
 * cho từng PrDetail theo itemCode + projectCode.
 *
 * Workflow:
 *  1. Validate file + projectCode
 *  2. Parse file → mảng updates
 *  3. Lookup PrDetail theo (itemCode, projectId) cho project được chọn
 *  4. Update từng PrDetail (chỉ field có data)
 *  5. Tạo ContractDetail records mới cho domestic/import
 *  6. Trả về stats: matched / updated / skipped / contracts created
 */

const { parseProcurementUpdate } = require('../services/procurementUpdater');
const { detectMaterialGroup } = require('../services/materialDetector');
const prisma = require('../lib/prisma');

async function updateProcurementStatus(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Vui lòng đính kèm file Excel cập nhật tình trạng mua sắm',
      });
    }

    const projectCode = req.body.projectCode || req.body.project_code;
    if (!projectCode) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu projectCode — vui lòng chọn dự án trước khi upload',
      });
    }

    // Mặc định: tự động create item missing (file tracking thường có item mới)
    const createMissing = req.body.createMissing !== 'false';

    // 1. Resolve project — tự create nếu chưa có
    let project = await prisma.project.findFirst({ where: { code: projectCode } });
    if (!project) {
      const projectName = req.body.projectName || projectCode;
      project = await prisma.project.create({
        data: { code: projectCode, name: projectName, status: 'active' },
      });
    }

    // 2. Parse file
    let parsed;
    try {
      parsed = parseProcurementUpdate(req.file.buffer);
    } catch (e) {
      return res.status(422).json({
        success: false,
        error: `Lỗi parse file: ${e.message}`,
      });
    }

    if (parsed.rowsParsed === 0) {
      return res.status(422).json({
        success: false,
        error: 'File không có dữ liệu hợp lệ. Kiểm tra cấu trúc cột.',
      });
    }

    // 3. Lookup tất cả PrDetail thuộc project này, build map itemCode → id
    const allDetails = await prisma.prDetail.findMany({
      where: { pr: { projectId: project.id } },
      select: { id: true, itemCode: true, prId: true },
    });
    const codeToDetail = new Map();
    for (const d of allDetails) {
      // Một itemCode có thể xuất hiện nhiều lần (nhiều PR), giữ bản đầu tiên
      if (!codeToDetail.has(d.itemCode)) codeToDetail.set(d.itemCode, d);
    }

    // 4. Apply updates trong transaction
    const stats = {
      totalParsed: parsed.rowsParsed,
      matched: 0,
      created: 0,
      notFound: 0,
      updated: 0,
      contractsCreated: 0,
      contractsUpdated: 0,
      inspectionsCreated: 0,
      errors: [],
    };

    // Cần PR header chung cho các item auto-created
    let autoPR = null;
    async function getAutoPR() {
      if (autoPR) return autoPR;
      autoPR = await prisma.purchaseRequisition.create({
        data: {
          projectId: project.id,
          prRef: `PR-${projectCode}-AUTO-${Date.now()}`,
          department: 'IMPORT',
          status: 'SOURCING',
        },
      });
      return autoPR;
    }

    const notFoundCodes = [];

    for (const item of parsed.updates) {
      let detail = codeToDetail.get(item.itemCode);

      if (!detail) {
        if (!createMissing) {
          stats.notFound++;
          if (notFoundCodes.length < 20) notFoundCodes.push(item.itemCode);
          continue;
        }
        // Auto-create PrDetail cho item mới (file tracking thường có item mới)
        try {
          const pr = await getAutoPR();
          const mg = detectMaterialGroup(item.itemCode);
          const newDetail = await prisma.prDetail.create({
            data: {
              prId: pr.id,
              itemCode: item.itemInfo.itemCode,
              itemName: item.itemInfo.itemName || item.itemCode,
              profile: item.itemInfo.profile || null,
              grade: item.itemInfo.grade || null,
              uom: item.itemInfo.uom || 'kg',
              unitWeight: item.itemInfo.unitWeight || 0,
              netQty: item.itemInfo.netQty || 0,
              netWeight: item.itemInfo.netWeight || 0,
              reqQty: item.itemInfo.reqQty || 0,
              reqWeight: item.itemInfo.reqWeight || 0,
              remainQty: 0,
              remainWeight: 0,
              toBuyQty: item.itemInfo.reqQty || 0,
              toBuyWeight: item.itemInfo.reqWeight || 0,
              materialGroupCode: mg.materialGroupCode || null,
              materialSubGroupCode: mg.materialSubGroupCode || null,
              statusFlag: 'Chờ báo giá',
            },
          });
          detail = { id: newDetail.id, itemCode: newDetail.itemCode, prId: pr.id };
          codeToDetail.set(item.itemCode, detail);
          stats.created++;
        } catch (err) {
          if (stats.errors.length < 10) {
            stats.errors.push({ itemCode: item.itemCode, error: err.message.slice(0, 200) });
          }
          continue;
        }
      } else {
        stats.matched++;
      }

      try {
        // Update PrDetail (chỉ nếu có ít nhất 1 field)
        if (Object.keys(item.update).length > 0) {
          await prisma.prDetail.update({
            where: { id: detail.id },
            data: item.update,
          });
          stats.updated++;
        }

        // Upsert ContractDetail records (key: prDetailId + contractNo)
        // Track contracts theo type để bind inspection vào contract đúng
        const contractsByType = {};
        for (const ct of item.contracts) {
          if (!ct.contractNo) continue;
          const existing = await prisma.contractDetail.findFirst({
            where: { prDetailId: detail.id, contractNo: ct.contractNo },
            select: { id: true },
          });
          let contractId;
          if (existing) {
            await prisma.contractDetail.update({
              where: { id: existing.id },
              data: ct,
            });
            contractId = existing.id;
            stats.contractsUpdated++;
          } else {
            const created = await prisma.contractDetail.create({
              data: { ...ct, prDetailId: detail.id },
            });
            contractId = created.id;
            stats.contractsCreated++;
          }
          contractsByType[ct.contractType] = contractId;
        }

        // Upsert InspectionRecord — bind vào contract khớp type
        for (const ins of item.inspections || []) {
          const contractId = contractsByType[ins.contractType];
          if (!contractId) continue; // Không có contract → skip inspection

          // Check existing by contractDetailId + reportNo (hoặc inspectionDate nếu chưa có report)
          const where = { contractDetailId: contractId };
          if (ins.reportNo) where.reportNo = ins.reportNo;
          else if (ins.inspectionDate) where.inspectionDate = ins.inspectionDate;
          else continue;

          const existing = await prisma.inspectionRecord.findFirst({
            where,
            select: { id: true },
          });

          const insData = {
            contractDetailId: contractId,
            inspectionType: ins.inspectionType,
            reportNo: ins.reportNo,
            inspectionDate: ins.inspectionDate,
            inspectedQty: ins.inspectedQty || 0,
            inspectedWeight: ins.inspectedWeight || 0,
            acceptedQty: ins.acceptedQty || 0,
            acceptedWeight: ins.acceptedWeight || 0,
            result: ins.result,
            remarks: ins.remarks || null,
          };

          if (existing) {
            await prisma.inspectionRecord.update({
              where: { id: existing.id },
              data: insData,
            });
          } else {
            await prisma.inspectionRecord.create({ data: insData });
            stats.inspectionsCreated++;
          }
        }
      } catch (err) {
        if (stats.errors.length < 10) {
          stats.errors.push({ itemCode: item.itemCode, error: err.message.slice(0, 200) });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `Đã xử lý ${stats.totalParsed} dòng cho dự án ${projectCode}: ${stats.updated} cập nhật, ${stats.created} tạo mới, ${stats.contractsCreated + stats.contractsUpdated} HĐ, ${stats.inspectionsCreated} biên bản nghiệm thu`,
      sheetName: parsed.sheetName,
      format: parsed.format,
      notice: parsed.notice || null,
      projectCode,
      stats,
      notFoundSample: notFoundCodes,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { updateProcurementStatus };
