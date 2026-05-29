/**
 * bidAnalysisController.js
 *
 * Module 2 (Báo Giá) + Module 3 (So Sánh Báo Giá)
 *
 * Endpoints:
 *   POST /api/v1/bid-analyses/upload  — Upload Excel, parse all BID ANALYSIS sheets
 *   GET  /api/v1/bid-analyses          — List bids (filter by project, status)
 *   GET  /api/v1/bid-analyses/:id      — Detail with vendors + items + offers
 *   POST /api/v1/bid-analyses/:id/select-vendor — Chọn winner cho 1 bid
 */

const fs = require('fs');
const path = require('path');
const { parseAllBidAnalyses } = require('../services/bidAnalysisParser');
const prisma = require('../lib/prisma');
const logger = require('../lib/logger');
const {
  parseBidCode,
  projShort,
  deriveMatGroup,
  generateNextBidCode,
  yymmOf,
  suggestSubject,
  MAT_LABELS,
} = require('../lib/bidcode');

// Sanitize filename for FS (giữ ASCII + .xlsx, drop diacritics/special)
function sanitizeFileName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 100);
}

// ─── UPLOAD ──────────────────────────────────────────────────────────────────

async function uploadBidAnalyses(req, res, next) {
  try {
    if (!req.file)
      return res.status(400).json({ success: false, error: 'Vui lòng đính kèm file Excel' });

    const projectCode = req.body.projectCode || req.body.project_code;

    let project = null;
    if (projectCode) {
      project = await prisma.project.findFirst({ where: { code: projectCode } });
      if (!project) {
        project = await prisma.project.create({
          data: { code: projectCode, name: projectCode, status: 'active' },
        });
      }
    }

    const result = parseAllBidAnalyses(req.file.buffer);
    if (!result.parsed || result.parsed.length === 0) {
      return res.status(422).json({
        success: false,
        error: 'Không tìm thấy sheet BID ANALYSIS hợp lệ trong file',
        sheets: result.sheets,
        errors: result.errors,
      });
    }

    // Save file gốc to uploads/bid-analyses/ để user download lại review
    // Fix multer latin1 encoding → UTF-8 cho filename tiếng Việt
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const uploadDir = path.join(__dirname, '../../uploads/bid-analyses');
    fs.mkdirSync(uploadDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const savedFileName = `${ts}_${sanitizeFileName(originalName)}`;
    const savedFilePath = path.join(uploadDir, savedFileName);
    fs.writeFileSync(savedFilePath, req.file.buffer);
    const sourceFileRelPath = `bid-analyses/${savedFileName}`;

    const stats = {
      sheetsFound: result.sheets.length,
      bidsCreated: 0,
      bidsUpdated: 0,
      vendorsCreated: 0,
      itemsCreated: 0,
      offersCreated: 0,
      errors: [],
    };

    for (const bid of result.parsed) {
      try {
        // Resolve project nếu detect được từ sheet
        let bidProjectId = project?.id || null;
        if (!bidProjectId && bid.projectCode) {
          let p = await prisma.project.findFirst({ where: { code: bid.projectCode } });
          if (!p)
            p = await prisma.project.create({
              data: { code: bid.projectCode, name: bid.projectCode, status: 'active' },
            });
          bidProjectId = p.id;
        }

        // Upsert by bidCode (per project)
        const existing = await prisma.bidAnalysis.findFirst({
          where: { bidCode: bid.bidCode, projectId: bidProjectId },
          select: { id: true },
        });

        let bidId;
        if (existing) {
          // Wipe vendors + items first
          await prisma.bidQuoteVendor.deleteMany({ where: { bidId: existing.id } });
          await prisma.bidQuoteItem.deleteMany({ where: { bidId: existing.id } });
          await prisma.bidAnalysis.update({
            where: { id: existing.id },
            data: {
              subject: bid.subject,
              bidDate: bid.bidDate,
              status: bid.selectedVendorName ? 'SELECTED' : 'OPEN',
              sourceFileName: originalName,
              sourceFilePath: sourceFileRelPath,
              sourceSheetName: bid.sheetName || bid.bidCode,
              updatedAt: new Date(),
            },
          });
          bidId = existing.id;
          stats.bidsUpdated++;
        } else {
          const created = await prisma.bidAnalysis.create({
            data: {
              projectId: bidProjectId,
              bidCode: bid.bidCode,
              subject: bid.subject,
              bidDate: bid.bidDate,
              status: bid.selectedVendorName ? 'SELECTED' : 'OPEN',
              sourceFileName: originalName,
              sourceFilePath: sourceFileRelPath,
              sourceSheetName: bid.sheetName || bid.bidCode,
            },
          });
          bidId = created.id;
          stats.bidsCreated++;
        }

        // Create vendors
        const vendorIdMap = new Map(); // vendorOrder → vendorId
        for (const v of bid.vendors) {
          const vc = await prisma.bidQuoteVendor.create({
            data: {
              bidId,
              vendorName: v.vendorName,
              vendorOrder: v.vendorOrder,
              vendorType: v.vendorType,
              currency: v.currency,
              totalQuote: v.totalQuote,
              isWinner: v.isWinner,
            },
          });
          vendorIdMap.set(v.vendorOrder, vc.id);
          stats.vendorsCreated++;
        }

        // Create items + offers
        for (let i = 0; i < bid.items.length; i++) {
          const it = bid.items[i];
          const itemRow = await prisma.bidQuoteItem.create({
            data: {
              bidId,
              itemOrder: i,
              itemCode: it.itemCode,
              itemName: it.itemName,
              profile: it.profile,
              grade: it.grade,
              gradeBuy: it.gradeBuy,
              uom: it.uom,
              qtyPR: it.qtyPR,
              qtyToBuy: it.qtyToBuy,
              estimateUnitPrice: it.estimateUnitPrice,
              estimateTotal: it.estimateTotal,
              alreadyBoughtAmount: it.alreadyBoughtAmount,
              selectedVendorName: it.selectedVendorName,
              notes: it.notes,
            },
          });
          stats.itemsCreated++;

          for (const offer of it.offers) {
            const vendorId = vendorIdMap.get(offer.vendorOrder);
            if (!vendorId) continue;
            await prisma.bidQuoteOffer.create({
              data: {
                itemId: itemRow.id,
                vendorId,
                scope: offer.scope,
                unitPrice: offer.unitPrice,
                totalPrice: offer.totalPrice,
              },
            });
            stats.offersCreated++;
          }
        }
      } catch (err) {
        if (stats.errors.length < 10)
          stats.errors.push({ sheet: bid.bidCode, error: err.message.slice(0, 200) });
      }
    }

    res.json({
      success: true,
      message: `Đã import ${stats.bidsCreated + stats.bidsUpdated} bid analyses (${stats.itemsCreated} items, ${stats.offersCreated} offers)`,
      stats,
    });
  } catch (error) {
    next(error);
  }
}

// ─── LIST ────────────────────────────────────────────────────────────────────

async function listBidAnalyses(req, res, next) {
  try {
    const { projectCode, status } = req.query;
    const where = {};
    if (projectCode) {
      const p = await prisma.project.findFirst({ where: { code: projectCode } });
      if (p) where.projectId = p.id;
    }
    if (status) where.status = status;

    const bids = await prisma.bidAnalysis.findMany({
      where,
      orderBy: { bidDate: 'desc' },
      include: {
        project: { select: { code: true, name: true } },
        vendors: { select: { id: true, vendorName: true, isWinner: true, totalQuote: true, currency: true } },
        _count: { select: { items: true } },
      },
    });

    res.json({ success: true, data: bids, total: bids.length });
  } catch (error) {
    next(error);
  }
}

// ─── DETAIL ──────────────────────────────────────────────────────────────────

async function getBidAnalysisDetail(req, res, next) {
  try {
    const { id } = req.params;
    const bid = await prisma.bidAnalysis.findUnique({
      where: { id },
      include: {
        project: { select: { code: true, name: true } },
        vendors: { orderBy: { vendorOrder: 'asc' } },
        items: {
          orderBy: { itemOrder: 'asc' },
          include: {
            offers: {
              include: { vendor: { select: { vendorName: true, vendorOrder: true } } },
            },
          },
        },
      },
    });
    if (!bid) return res.status(404).json({ success: false, error: 'Bid not found' });
    res.json({ success: true, data: bid });
  } catch (error) {
    next(error);
  }
}

// ─── SELECT VENDOR (Module 3) ────────────────────────────────────────────────

async function selectVendor(req, res, next) {
  try {
    const { id } = req.params;
    const { vendorId } = req.body;
    if (!vendorId) return res.status(400).json({ success: false, error: 'Thiếu vendorId' });

    // Reset all vendors of this bid to non-winner
    await prisma.bidQuoteVendor.updateMany({
      where: { bidId: id },
      data: { isWinner: false },
    });

    // Set selected vendor as winner
    const winner = await prisma.bidQuoteVendor.update({
      where: { id: vendorId },
      data: { isWinner: true },
    });

    // Update bid status
    await prisma.bidAnalysis.update({
      where: { id },
      data: {
        status: 'SELECTED',
        selectedVendorId: vendorId,
        approvedBy: req.user?.id,
        approvedAt: new Date(),
      },
    });

    res.json({ success: true, message: `Đã chọn vendor: ${winner.vendorName}` });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/v1/bid-analyses/:bidId/items/:itemId/select-vendor
// Body: { vendorName: string | null }  — null = clear selection
async function selectItemVendor(req, res, next) {
  try {
    const { bidId, itemId } = req.params;
    const { vendorName } = req.body;

    // Verify item thuộc bid
    const item = await prisma.bidQuoteItem.findFirst({
      where: { id: itemId, bidId },
      select: { id: true },
    });
    if (!item) return res.status(404).json({ success: false, error: 'Item không thuộc bid này' });

    // Verify vendorName tồn tại trong bid (hoặc null để clear)
    if (vendorName) {
      const vendor = await prisma.bidQuoteVendor.findFirst({
        where: { bidId, vendorName },
        select: { id: true },
      });
      if (!vendor) {
        return res
          .status(400)
          .json({ success: false, error: `Vendor "${vendorName}" không có trong bid này` });
      }
    }

    await prisma.bidQuoteItem.update({
      where: { id: itemId },
      data: { selectedVendorName: vendorName || null },
    });

    res.json({ success: true, itemId, selectedVendorName: vendorName });
  } catch (error) {
    next(error);
  }
}

// GET /api/v1/bid-analyses/:id/approval-summary
// Aggregate items grouped by selectedVendorName → summary table
async function getApprovalSummary(req, res, next) {
  try {
    const { id } = req.params;

    const bid = await prisma.bidAnalysis.findUnique({
      where: { id },
      select: {
        id: true,
        bidCode: true,
        subject: true,
        project: { select: { code: true, name: true } },
      },
    });
    if (!bid) return res.status(404).json({ success: false, error: 'Bid không tồn tại' });

    // Lấy tất cả items kèm offers (để compute đơn giá theo vendor đã chọn)
    const items = await prisma.bidQuoteItem.findMany({
      where: { bidId: id },
      include: {
        offers: {
          include: { vendor: { select: { vendorName: true } } },
        },
      },
      orderBy: { itemOrder: 'asc' },
    });

    // Group by selectedVendorName
    const groupMap = new Map();
    let totalItems = 0;
    let assignedItems = 0;
    let totalApprovedValue = 0;

    for (const it of items) {
      totalItems++;
      if (!it.selectedVendorName) continue;
      assignedItems++;
      const offer = it.offers.find((o) => o.vendor?.vendorName === it.selectedVendorName);
      const unitPrice = offer?.unitPrice || 0;
      const total = offer?.totalPrice || unitPrice * (it.qtyToBuy || 0);
      totalApprovedValue += total;

      if (!groupMap.has(it.selectedVendorName)) {
        groupMap.set(it.selectedVendorName, {
          vendorName: it.selectedVendorName,
          itemCount: 0,
          totalValue: 0,
          items: [],
        });
      }
      const g = groupMap.get(it.selectedVendorName);
      g.itemCount++;
      g.totalValue += total;
      g.items.push({
        itemCode: it.itemCode,
        itemName: it.itemName,
        profile: it.profile,
        grade: it.grade,
        uom: it.uom,
        qtyToBuy: it.qtyToBuy,
        unitPrice,
        totalPrice: total,
      });
    }

    res.json({
      success: true,
      data: {
        bid: { id: bid.id, bidCode: bid.bidCode, subject: bid.subject, project: bid.project },
        summary: {
          totalItems,
          assignedItems,
          pendingItems: totalItems - assignedItems,
          totalApprovedValue,
          vendorCount: groupMap.size,
        },
        byVendor: Array.from(groupMap.values()).sort((a, b) => b.totalValue - a.totalValue),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function downloadSourceFile(req, res, next) {
  try {
    const bid = await prisma.bidAnalysis.findUnique({
      where: { id: req.params.id },
      select: { sourceFilePath: true, sourceFileName: true },
    });
    if (!bid || !bid.sourceFilePath) {
      return res.status(404).json({
        success: false,
        error: 'File gốc không khả dụng (bid này được tạo trước khi feature lưu file gốc được bật).',
      });
    }
    const fullPath = path.join(__dirname, '../../uploads', bid.sourceFilePath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: 'File đã bị xoá khỏi server.' });
    }
    const downloadName = bid.sourceFileName || path.basename(fullPath);
    res.download(fullPath, downloadName);
  } catch (error) {
    next(error);
  }
}

// ─── PR items available for bidding ─────────────────────────────────────────
// GET /api/v1/prs/items-for-bidding?projectId=...&materialGroupCode=...

async function listItemsForBidding(req, res, next) {
  try {
    const { projectCode, materialGroupCode } = req.query;
    const where = { statusFlag: 'Chờ báo giá' };
    if (materialGroupCode) where.materialGroupCode = materialGroupCode;
    if (projectCode) {
      where.pr = { project: { code: projectCode } };
    }
    const items = await prisma.prDetail.findMany({
      where,
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        profile: true,
        grade: true,
        uom: true,
        reqQty: true,
        reqWeight: true,
        urgency: true,
        requiredDate: true,
        materialGroupCode: true,
        materialSubGroupCode: true,
        prId: true,
        pr: {
          select: {
            prRef: true,
            project: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: [{ urgency: 'desc' }, { itemCode: 'asc' }],
      take: 500,
    });
    res.json({ success: true, data: items, count: items.length });
  } catch (err) {
    next(err);
  }
}

// ─── Preview bidcode (no DB write) ──────────────────────────────────────────
// GET /api/v1/bid-analyses/preview-bidcode?projectCode=25-VPI-I-095&materialGroupCode=VTC&urgent=0

async function previewBidCode(req, res, next) {
  try {
    const { projectCode, materialGroupCode = 'ALL', urgent } = req.query;
    if (!projectCode) {
      return res.status(400).json({ success: false, error: 'projectCode required' });
    }
    const proj = projShort(projectCode);
    const yymm = yymmOf();
    const mat = materialGroupCode || 'ALL';
    const isUrgent = urgent === '1' || urgent === 'true';
    const result = await generateNextBidCode(prisma, {
      projShort: proj,
      yymm,
      mat,
      urgent: isUrgent,
    });
    const parsed = parseBidCode(result.code);
    res.json({
      success: true,
      data: {
        bidCode: result.code,
        seq: result.seq,
        parsed,
        matLabel: MAT_LABELS[mat] || mat,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Create BidAnalysis from PR items ───────────────────────────────────────
// POST /api/v1/bid-analyses/from-pr
// Body: {
//   projectCode: '25-VPI-I-095',
//   prDetailIds: ['uuid1', 'uuid2', ...],
//   subject?: 'optional override',
//   urgent?: false,
//   bidCodeOverride?: 'BID-...',
//   notes?: 'optional'
// }

async function createBidFromPR(req, res, next) {
  try {
    const { projectCode, prDetailIds, subject, urgent = false, bidCodeOverride, notes } = req.body;

    if (!projectCode || !Array.isArray(prDetailIds) || prDetailIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: 'projectCode + prDetailIds[] required' });
    }

    // Fetch project
    const project = await prisma.project.findUnique({ where: { code: projectCode } });
    if (!project) {
      return res.status(404).json({ success: false, error: `Project ${projectCode} không tồn tại` });
    }

    // Fetch PR items
    const items = await prisma.prDetail.findMany({
      where: { id: { in: prDetailIds } },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        profile: true,
        grade: true,
        uom: true,
        reqQty: true,
        materialGroupCode: true,
        urgency: true,
      },
    });

    if (items.length === 0) {
      return res.status(400).json({ success: false, error: 'Không tìm thấy PR item nào' });
    }

    // Derive bidcode components
    const proj = projShort(projectCode);
    const yymm = yymmOf();
    const mat = deriveMatGroup(items);

    // Generate or use override
    let bidCode = bidCodeOverride;
    let parsedOverride = null;
    if (bidCode) {
      parsedOverride = parseBidCode(bidCode);
      if (!parsedOverride) {
        return res
          .status(400)
          .json({ success: false, error: `bidCode override "${bidCode}" sai format` });
      }
      // Check uniqueness
      const existing = await prisma.bidAnalysis.findUnique({ where: { bidCode } });
      if (existing) {
        return res
          .status(409)
          .json({ success: false, error: `bidCode "${bidCode}" đã tồn tại` });
      }
    } else {
      const gen = await generateNextBidCode(prisma, {
        projShort: proj,
        yymm,
        mat,
        urgent,
      });
      bidCode = gen.code;
      parsedOverride = parseBidCode(bidCode);
    }

    const finalSubject = subject || suggestSubject(items, projectCode);

    // Create in transaction: BidAnalysis + BidQuoteItems + PrLinks
    const bid = await prisma.$transaction(async (tx) => {
      const newBid = await tx.bidAnalysis.create({
        data: {
          projectId: project.id,
          bidCode,
          bidCodeProj: parsedOverride.proj,
          bidCodeYymm: parsedOverride.yymm,
          bidCodeMat: parsedOverride.mat,
          bidCodeSeq: parsedOverride.seq,
          bidCodeVariant: parsedOverride.variant,
          bidCodeUrgent: parsedOverride.urgent,
          subject: finalSubject,
          bidDate: new Date(),
          status: 'OPEN',
          notes: notes || null,
        },
      });

      // Create BidQuoteItem per PR item
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await tx.bidQuoteItem.create({
          data: {
            bidId: newBid.id,
            itemOrder: i + 1,
            itemCode: it.itemCode,
            itemName: it.itemName,
            profile: it.profile,
            grade: it.grade,
            uom: it.uom,
            qtyPR: it.reqQty || 0,
            qtyToBuy: it.reqQty || 0,
          },
        });
      }

      // Create junction links
      await tx.bidAnalysisPrLink.createMany({
        data: items.map((it) => ({ bidAnalysisId: newBid.id, prDetailId: it.id })),
        skipDuplicates: true,
      });

      // Mark linked PrDetail as "Đang chào giá" (Workflow B2 → ngăn double-RFQ)
      await tx.prDetail.updateMany({
        where: { id: { in: items.map((it) => it.id) } },
        data: { statusFlag: 'Đang chào giá' },
      });

      // Audit log
      if (req.user) {
        await tx.auditLog.create({
          data: {
            action: 'CREATE_BID_FROM_PR',
            userId: req.user.id,
            entityType: 'BidAnalysis',
            entityId: newBid.id,
            details: JSON.stringify({
              bidCode,
              itemCount: items.length,
              projectCode,
              prDetailIds,
            }),
          },
        });
      }

      return newBid;
    });

    (req.log || logger).info(
      { bidCode, itemCount: items.length, projectCode },
      'BidAnalysis created from PR'
    );

    res.status(201).json({
      success: true,
      data: {
        bid: { id: bid.id, bidCode: bid.bidCode, subject: bid.subject, status: bid.status },
        itemCount: items.length,
        parsed: parsedOverride,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── EXPORT TEMPLATE EXCEL (Sprint M4 — Task E support) ──────────────────────
// GET /api/v1/prs/items-for-bidding/export-template?projectCode=...&materialGroupCode=...
// Returns Excel: 1 sheet "RFQ_Import" với cột prDetailId | itemCode | itemName | profile | uom | reqQty | matGroup | prRef | targetRfqKey
// User chỉ cần điền cột targetRfqKey (mỗi key sẽ tạo 1 BID riêng).
async function exportRfqImportTemplate(req, res, next) {
  try {
    const ExcelJS = require('exceljs');
    const { projectCode, materialGroupCode } = req.query;

    const where = { statusFlag: 'Chờ báo giá' };
    if (materialGroupCode) where.materialGroupCode = materialGroupCode;
    if (projectCode) where.pr = { project: { code: projectCode } };

    const items = await prisma.prDetail.findMany({
      where,
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        profile: true,
        grade: true,
        uom: true,
        reqQty: true,
        urgency: true,
        materialGroupCode: true,
        pr: { select: { prRef: true, project: { select: { code: true } } } },
      },
      orderBy: [{ pr: { prRef: 'asc' } }, { itemCode: 'asc' }],
      take: 2000,
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'IBSHI Procurement Platform';
    wb.created = new Date();
    const ws = wb.addWorksheet('RFQ_Import', {
      properties: { defaultRowHeight: 18 },
      views: [{ state: 'frozen', ySplit: 3 }],
    });

    // Banner row 1
    ws.mergeCells('A1:I1');
    const banner = ws.getCell('A1');
    banner.value = 'IBSHI — Template Import RFQ batch';
    banner.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    banner.alignment = { horizontal: 'center', vertical: 'middle' };
    banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    ws.getRow(1).height = 26;

    // Instruction row 2
    ws.mergeCells('A2:I2');
    const instr = ws.getCell('A2');
    instr.value =
      'Hướng dẫn: Điền cột "targetRfqKey" (cột I) — mỗi giá trị riêng sẽ tạo 1 BID/RFQ riêng. ' +
      'Để trống → bỏ qua dòng. Cùng 1 key (vd. "VTC-Đợt1") → gom chung 1 BID.';
    instr.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF1F3864' } };
    instr.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    instr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDEEBF7' } };
    ws.getRow(2).height = 32;

    // Header row 3
    const headers = [
      { key: 'prDetailId', label: 'prDetailId (KHÔNG sửa)', width: 32 },
      { key: 'prRef', label: 'PR Ref', width: 14 },
      { key: 'itemCode', label: 'Mã VT', width: 18 },
      { key: 'itemName', label: 'Tên VT', width: 36 },
      { key: 'profile', label: 'Quy cách', width: 22 },
      { key: 'uom', label: 'ĐV', width: 8 },
      { key: 'reqQty', label: 'SL', width: 10 },
      { key: 'matGroup', label: 'Nhóm VT (gợi ý)', width: 14 },
      { key: 'targetRfqKey', label: '👉 targetRfqKey (điền)', width: 24 },
    ];
    ws.getRow(3).values = headers.map((h) => h.label);
    headers.forEach((h, i) => {
      ws.getColumn(i + 1).width = h.width;
    });
    const headerRow = ws.getRow(3);
    headerRow.height = 22;
    headerRow.eachCell((cell, col) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: col === 9 ? 'FFED7D31' : 'FF2E75B6' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB7B7B7' } },
        bottom: { style: 'thin', color: { argb: 'FFB7B7B7' } },
        left: { style: 'thin', color: { argb: 'FFB7B7B7' } },
        right: { style: 'thin', color: { argb: 'FFB7B7B7' } },
      };
    });

    // Data rows
    items.forEach((it, i) => {
      const r = ws.addRow([
        it.id,
        it.pr?.prRef || '',
        it.itemCode || '',
        it.itemName || '',
        [it.profile, it.grade].filter(Boolean).join(' · '),
        it.uom || '',
        it.reqQty || 0,
        it.materialGroupCode || 'ALL',
        '', // targetRfqKey — user fills in
      ]);
      const isAlt = i % 2 === 1;
      r.eachCell((cell, col) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.alignment = {
          horizontal: col === 7 ? 'right' : col === 9 ? 'center' : 'left',
          vertical: 'middle',
        };
        cell.border = {
          top: { style: 'hair', color: { argb: 'FFD9D9D9' } },
          bottom: { style: 'hair', color: { argb: 'FFD9D9D9' } },
          left: { style: 'hair', color: { argb: 'FFD9D9D9' } },
          right: { style: 'hair', color: { argb: 'FFD9D9D9' } },
        };
        if (col === 1) {
          cell.font = { name: 'Consolas', size: 9, color: { argb: 'FF666666' } };
        }
        if (col === 9) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
          cell.font = { ...cell.font, bold: true };
        } else if (isAlt) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        }
      });
    });

    // Bottom hint row
    if (items.length > 0) {
      const hintRow = ws.addRow([]);
      ws.mergeCells(`A${hintRow.number}:I${hintRow.number}`);
      const hc = ws.getCell(`A${hintRow.number}`);
      hc.value = `Ví dụ targetRfqKey: "VTC-Đợt1", "VPK-Đợt1", "URGENT-VTC". Tổng ${items.length} items khả dụng.`;
      hc.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF666666' } };
      hc.alignment = { horizontal: 'left' };
    }

    const buf = await wb.xlsx.writeBuffer();
    const fname = `RFQ_Import_Template_${projectCode || 'ALL'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(Buffer.from(buf));
  } catch (err) {
    next(err);
  }
}

// ─── IMPORT RFQ BATCH (Sprint M4 — Task E) ───────────────────────────────────
// POST /api/v1/bid-analyses/import-rfq-batch (multipart, field name: file)
// Body fields: projectCode, urgent (optional '1'/'0')
// Excel format: cột prDetailId (col A) + targetRfqKey (col I)
// Logic: parse → group by targetRfqKey → tạo N BidAnalysis
// Trả về { created: [...], skipped: [...], errors: [...] }
async function importRfqBatch(req, res, next) {
  try {
    const ExcelJS = require('exceljs');
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Vui lòng đính kèm file Excel' });
    }
    const projectCode = req.body.projectCode;
    const urgent = String(req.body.urgent || '0') === '1';
    if (!projectCode) {
      return res.status(400).json({ success: false, error: 'Thiếu projectCode' });
    }

    const project = await prisma.project.findUnique({ where: { code: projectCode } });
    if (!project) {
      return res.status(404).json({ success: false, error: `Project ${projectCode} không tồn tại` });
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.getWorksheet('RFQ_Import') || wb.worksheets[0];
    if (!ws) {
      return res.status(400).json({ success: false, error: 'File không có sheet nào' });
    }

    // Parse rows: bỏ qua row 1-3 (banner/instruction/header), bắt đầu từ row 4
    const parsed = [];
    const errors = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum <= 3) return;
      const prDetailId = String(row.getCell(1).value || '').trim();
      const targetRfqKey = String(row.getCell(9).value || '').trim();
      if (!prDetailId) return;
      if (!targetRfqKey) return; // bỏ qua row không điền key
      // prDetailId thường là CUID 24-25 char hoặc UUID 36 char — check không phải tiêu đề
      if (prDetailId.toLowerCase().includes('prdetailid') || prDetailId.length < 8) {
        errors.push({ row: rowNum, error: `prDetailId "${prDetailId}" trông không hợp lệ` });
        return;
      }
      parsed.push({ row: rowNum, prDetailId, targetRfqKey });
    });

    if (parsed.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Không có row nào hợp lệ (kiểm tra cột prDetailId + targetRfqKey)',
        details: { errors },
      });
    }

    // Validate prDetailIds tồn tại + đang ở 'Chờ báo giá'
    const ids = parsed.map((p) => p.prDetailId);
    const items = await prisma.prDetail.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        profile: true,
        grade: true,
        uom: true,
        reqQty: true,
        materialGroupCode: true,
        statusFlag: true,
        pr: { select: { project: { select: { id: true, code: true } } } },
      },
    });
    const itemMap = new Map(items.map((it) => [it.id, it]));
    const skipped = [];
    const validParsed = parsed.filter((p) => {
      const it = itemMap.get(p.prDetailId);
      if (!it) {
        skipped.push({ ...p, reason: 'prDetailId không tồn tại trong DB' });
        return false;
      }
      if (it.pr?.project?.code !== projectCode) {
        skipped.push({ ...p, reason: `Item thuộc project ${it.pr?.project?.code}, không phải ${projectCode}` });
        return false;
      }
      if (it.statusFlag && it.statusFlag !== 'Chờ báo giá') {
        skipped.push({ ...p, reason: `Item statusFlag="${it.statusFlag}" — đã RFQ rồi` });
        return false;
      }
      return true;
    });

    if (validParsed.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Không có item nào hợp lệ sau validate',
        details: { skipped, errors },
      });
    }

    // Group by targetRfqKey → derive mat per group
    const groups = new Map();
    for (const p of validParsed) {
      if (!groups.has(p.targetRfqKey)) groups.set(p.targetRfqKey, []);
      groups.get(p.targetRfqKey).push(itemMap.get(p.prDetailId));
    }

    const proj = projShort(projectCode);
    const yymm = yymmOf();
    const seqCache = new Map();
    async function nextSeqLocal(mat) {
      const key = `${proj}|${yymm}|${mat}`;
      if (!seqCache.has(key)) {
        const maxRow = await prisma.bidAnalysis.findFirst({
          where: { bidCodeProj: proj, bidCodeYymm: yymm, bidCodeMat: mat },
          orderBy: { bidCodeSeq: 'desc' },
          select: { bidCodeSeq: true },
        });
        seqCache.set(key, (maxRow?.bidCodeSeq || 0) + 1);
      } else {
        seqCache.set(key, seqCache.get(key) + 1);
      }
      return seqCache.get(key);
    }

    const plans = [];
    for (const [key, bucketItems] of groups.entries()) {
      const mat = deriveMatGroup(bucketItems);
      const seq = await nextSeqLocal(mat);
      const seqStr = String(seq).padStart(3, '0');
      const prefix = urgent ? 'BID!' : 'BID';
      const bidCode = `${prefix}-${proj}-${yymm}-${mat}-${seqStr}`;
      const subject = `[${key}] ${suggestSubject(bucketItems, projectCode)}`;
      plans.push({
        key,
        mat,
        items: bucketItems,
        bidCode,
        bidCodeProj: proj,
        bidCodeYymm: yymm,
        bidCodeMat: mat,
        bidCodeSeq: seq,
        bidCodeUrgent: urgent,
        subject: subject.slice(0, 200),
      });
    }

    // Transaction
    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const p of plans) {
        const newBid = await tx.bidAnalysis.create({
          data: {
            projectId: project.id,
            bidCode: p.bidCode,
            bidCodeProj: p.bidCodeProj,
            bidCodeYymm: p.bidCodeYymm,
            bidCodeMat: p.bidCodeMat,
            bidCodeSeq: p.bidCodeSeq,
            bidCodeVariant: null,
            bidCodeUrgent: p.bidCodeUrgent,
            subject: p.subject,
            bidDate: new Date(),
            status: 'OPEN',
            notes: `Import từ Excel — targetRfqKey="${p.key}"`,
          },
        });

        for (let i = 0; i < p.items.length; i++) {
          const it = p.items[i];
          await tx.bidQuoteItem.create({
            data: {
              bidId: newBid.id,
              itemOrder: i + 1,
              itemCode: it.itemCode,
              itemName: it.itemName,
              profile: it.profile,
              grade: it.grade,
              uom: it.uom,
              qtyPR: it.reqQty || 0,
              qtyToBuy: it.reqQty || 0,
            },
          });
        }

        await tx.bidAnalysisPrLink.createMany({
          data: p.items.map((it) => ({ bidAnalysisId: newBid.id, prDetailId: it.id })),
          skipDuplicates: true,
        });

        await tx.prDetail.updateMany({
          where: { id: { in: p.items.map((it) => it.id) } },
          data: { statusFlag: 'Đang chào giá' },
        });

        results.push({
          bidId: newBid.id,
          bidCode: newBid.bidCode,
          subject: newBid.subject,
          itemCount: p.items.length,
          mat: p.mat,
          targetRfqKey: p.key,
        });
      }

      if (req.user) {
        await tx.auditLog.create({
          data: {
            action: 'IMPORT_RFQ_BATCH',
            userId: req.user.id,
            entityType: 'BidAnalysis',
            entityId: 'BULK',
            details: JSON.stringify({
              projectCode,
              fileName: req.file.originalname,
              totalRows: parsed.length,
              validRows: validParsed.length,
              skippedRows: skipped.length,
              bidsCreated: results.length,
              bids: results.map((r) => ({
                bidCode: r.bidCode,
                key: r.targetRfqKey,
                itemCount: r.itemCount,
              })),
            }),
          },
        });
      }

      return results;
    });

    (req.log || logger).info(
      {
        projectCode,
        bidsCreated: created.length,
        validRows: validParsed.length,
        skipped: skipped.length,
        errors: errors.length,
      },
      'RFQ batch imported'
    );

    res.status(201).json({
      success: true,
      data: {
        created,
        skipped,
        errors,
        summary: {
          totalRowsParsed: parsed.length,
          validRows: validParsed.length,
          skippedRows: skipped.length,
          errorRows: errors.length,
          bidsCreated: created.length,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── CREATE N BIDS BY MATERIAL GROUP (Sprint M4 — Task A) ────────────────────
// POST /api/v1/bid-analyses/from-pr-bulk-by-group
// Body: { projectCode, prDetailIds, groupBy?: 'materialGroupCode' (default), urgent?, notesPrefix? }
// Logic: group N items theo MAT → tạo N BidAnalysis trong 1 transaction.
// Trả về { created: [{ bidId, bidCode, subject, itemCount, mat }] }
async function createBidFromPRBulkByGroup(req, res, next) {
  try {
    const {
      projectCode,
      prDetailIds,
      groupBy = 'materialGroupCode',
      urgent = false,
      notesPrefix,
    } = req.body || {};

    if (!projectCode || !Array.isArray(prDetailIds) || prDetailIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: 'projectCode + prDetailIds[] required' });
    }
    if (groupBy !== 'materialGroupCode' && groupBy !== 'materialSubGroupCode') {
      return res
        .status(400)
        .json({ success: false, error: 'groupBy phải là materialGroupCode | materialSubGroupCode' });
    }

    const project = await prisma.project.findUnique({ where: { code: projectCode } });
    if (!project) {
      return res.status(404).json({ success: false, error: `Project ${projectCode} không tồn tại` });
    }

    const items = await prisma.prDetail.findMany({
      where: { id: { in: prDetailIds } },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        profile: true,
        grade: true,
        uom: true,
        reqQty: true,
        materialGroupCode: true,
        materialSubGroupCode: true,
        urgency: true,
        statusFlag: true,
      },
    });

    if (items.length === 0) {
      return res.status(400).json({ success: false, error: 'Không tìm thấy PR item nào' });
    }

    // Filter ra item đã RFQ rồi (statusFlag != 'Chờ báo giá') → bỏ qua, log skipped
    const eligible = items.filter((it) => !it.statusFlag || it.statusFlag === 'Chờ báo giá');
    const skipped = items.length - eligible.length;
    if (eligible.length === 0) {
      return res.status(400).json({
        success: false,
        error: `Tất cả ${items.length} items đã có RFQ. Không tạo thêm.`,
      });
    }

    // Group items theo groupBy field
    const buckets = new Map(); // mat → items[]
    for (const it of eligible) {
      const key = (it[groupBy] || 'ALL').toUpperCase();
      // Chỉ giữ 3-char codes hợp lệ (VTC/VPK/VDK/VBP/VTH/VTS/VTP/ALL); fallback → ALL
      const matCode = MAT_LABELS[key] ? key : 'ALL';
      if (!buckets.has(matCode)) buckets.set(matCode, []);
      buckets.get(matCode).push(it);
    }

    const proj = projShort(projectCode);
    const yymm = yymmOf();

    // Local seq cache để tránh duplicate khi tạo nhiều BID trong cùng (proj, yymm, mat)
    const seqCache = new Map();
    async function nextSeqLocal(mat) {
      const key = `${proj}|${yymm}|${mat}`;
      if (!seqCache.has(key)) {
        const maxRow = await prisma.bidAnalysis.findFirst({
          where: { bidCodeProj: proj, bidCodeYymm: yymm, bidCodeMat: mat },
          orderBy: { bidCodeSeq: 'desc' },
          select: { bidCodeSeq: true },
        });
        seqCache.set(key, (maxRow?.bidCodeSeq || 0) + 1);
      } else {
        seqCache.set(key, seqCache.get(key) + 1);
      }
      return seqCache.get(key);
    }

    // Pre-compute bidcodes (tránh await trong transaction nhiều lần)
    const plans = [];
    for (const [mat, bucketItems] of buckets.entries()) {
      const seq = await nextSeqLocal(mat);
      const seqStr = String(seq).padStart(3, '0');
      const prefix = urgent ? 'BID!' : 'BID';
      const code = `${prefix}-${proj}-${yymm}-${mat}-${seqStr}`;
      const subject = suggestSubject(bucketItems, projectCode);
      plans.push({
        mat,
        items: bucketItems,
        bidCode: code,
        bidCodeProj: proj,
        bidCodeYymm: yymm,
        bidCodeMat: mat,
        bidCodeSeq: seq,
        bidCodeUrgent: urgent,
        subject,
      });
    }

    // 1 transaction tạo tất cả BID + items + links + update statusFlag
    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const p of plans) {
        const newBid = await tx.bidAnalysis.create({
          data: {
            projectId: project.id,
            bidCode: p.bidCode,
            bidCodeProj: p.bidCodeProj,
            bidCodeYymm: p.bidCodeYymm,
            bidCodeMat: p.bidCodeMat,
            bidCodeSeq: p.bidCodeSeq,
            bidCodeVariant: null,
            bidCodeUrgent: p.bidCodeUrgent,
            subject: p.subject,
            bidDate: new Date(),
            status: 'OPEN',
            notes: notesPrefix ? `${notesPrefix} — Auto-grouped by ${p.mat}` : `Auto-grouped by ${p.mat}`,
          },
        });

        for (let i = 0; i < p.items.length; i++) {
          const it = p.items[i];
          await tx.bidQuoteItem.create({
            data: {
              bidId: newBid.id,
              itemOrder: i + 1,
              itemCode: it.itemCode,
              itemName: it.itemName,
              profile: it.profile,
              grade: it.grade,
              uom: it.uom,
              qtyPR: it.reqQty || 0,
              qtyToBuy: it.reqQty || 0,
            },
          });
        }

        await tx.bidAnalysisPrLink.createMany({
          data: p.items.map((it) => ({ bidAnalysisId: newBid.id, prDetailId: it.id })),
          skipDuplicates: true,
        });

        await tx.prDetail.updateMany({
          where: { id: { in: p.items.map((it) => it.id) } },
          data: { statusFlag: 'Đang chào giá' },
        });

        results.push({
          bidId: newBid.id,
          bidCode: newBid.bidCode,
          subject: newBid.subject,
          itemCount: p.items.length,
          mat: p.mat,
        });
      }

      if (req.user) {
        await tx.auditLog.create({
          data: {
            action: 'CREATE_BID_BULK_BY_GROUP',
            userId: req.user.id,
            entityType: 'BidAnalysis',
            entityId: 'BULK',
            details: JSON.stringify({
              projectCode,
              prDetailIdsCount: prDetailIds.length,
              skipped,
              bidsCreated: results.length,
              groupBy,
              urgent,
              bids: results.map((r) => ({ bidCode: r.bidCode, mat: r.mat, itemCount: r.itemCount })),
            }),
          },
        });
      }

      return results;
    });

    (req.log || logger).info(
      { projectCode, bidsCreated: created.length, skipped, urgent },
      'BulkByGroup created'
    );

    res.status(201).json({
      success: true,
      data: { created, skipped, totalBids: created.length },
    });
  } catch (err) {
    next(err);
  }
}

// ─── ENTER VENDOR QUOTE MANUALLY (Workflow Bước 3) ───────────────────────────
// POST /api/v1/bid-analyses/:bidId/quotes
// Body: {
//   vendorName: string, currency?: string, vendorType?: string, notes?: string,
//   items: [{ itemId: string, unitPrice: number, totalPrice?: number, scope?: string, deliveryTerm?: string, remarks?: string }]
// }
async function enterVendorQuote(req, res, next) {
  try {
    const { bidId } = req.params;
    const { vendorName, currency, vendorType, notes, items } = req.body || {};

    if (!vendorName || typeof vendorName !== 'string') {
      return res.status(400).json({ success: false, error: 'Thiếu vendorName' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Cần ít nhất 1 item trong báo giá' });
    }

    const bid = await prisma.bidAnalysis.findUnique({
      where: { id: bidId },
      select: { id: true, subject: true },
    });
    if (!bid) return res.status(404).json({ success: false, error: 'Bid không tồn tại' });

    // Verify all itemIds belong to this bid
    const itemIds = items.map((it) => it.itemId).filter(Boolean);
    const validItems = await prisma.bidQuoteItem.findMany({
      where: { id: { in: itemIds }, bidId },
      select: { id: true },
    });
    const validItemIds = new Set(validItems.map((i) => i.id));
    const badItem = items.find((it) => !validItemIds.has(it.itemId));
    if (badItem) {
      return res
        .status(400)
        .json({ success: false, error: `Item ${badItem.itemId} không thuộc bid này` });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Find or create vendor (matched by bidId + vendorName case-sensitive)
      let vendor = await tx.bidQuoteVendor.findFirst({
        where: { bidId, vendorName },
      });
      if (!vendor) {
        const maxOrder = await tx.bidQuoteVendor.aggregate({
          where: { bidId },
          _max: { vendorOrder: true },
        });
        vendor = await tx.bidQuoteVendor.create({
          data: {
            bidId,
            vendorName,
            vendorOrder: (maxOrder._max.vendorOrder ?? -1) + 1,
            vendorType: vendorType || 'DOMESTIC',
            currency: currency || 'VND',
            notes: notes || null,
          },
        });
      } else if (currency || vendorType || notes !== undefined) {
        vendor = await tx.bidQuoteVendor.update({
          where: { id: vendor.id },
          data: {
            currency: currency || vendor.currency,
            vendorType: vendorType || vendor.vendorType,
            notes: notes ?? vendor.notes,
          },
        });
      }

      // Upsert each offer (by itemId + vendorId)
      let updated = 0;
      let created = 0;
      for (const it of items) {
        const unitPrice = Number(it.unitPrice) || 0;
        const totalPrice = it.totalPrice != null ? Number(it.totalPrice) : 0;
        const existing = await tx.bidQuoteOffer.findFirst({
          where: { itemId: it.itemId, vendorId: vendor.id },
          select: { id: true },
        });
        if (existing) {
          await tx.bidQuoteOffer.update({
            where: { id: existing.id },
            data: {
              unitPrice,
              totalPrice,
              scope: it.scope ?? null,
              deliveryTerm: it.deliveryTerm ?? null,
              remarks: it.remarks ?? null,
              qualitySource: 'MANUAL',
            },
          });
          updated += 1;
        } else {
          await tx.bidQuoteOffer.create({
            data: {
              itemId: it.itemId,
              vendorId: vendor.id,
              unitPrice,
              totalPrice,
              scope: it.scope ?? null,
              deliveryTerm: it.deliveryTerm ?? null,
              remarks: it.remarks ?? null,
              qualitySource: 'MANUAL',
            },
          });
          created += 1;
        }
      }

      // Recompute vendor.totalQuote from offers sum
      const sumAgg = await tx.bidQuoteOffer.aggregate({
        where: { vendorId: vendor.id },
        _sum: { totalPrice: true },
      });
      const newTotal = sumAgg._sum.totalPrice || 0;
      vendor = await tx.bidQuoteVendor.update({
        where: { id: vendor.id },
        data: { totalQuote: newTotal },
      });

      await tx.auditLog.create({
        data: {
          action: 'ENTER_VENDOR_QUOTE',
          userId: req.user?.id || null,
          entityType: 'BidQuoteVendor',
          entityId: vendor.id,
          details: JSON.stringify({
            bidId,
            vendorName,
            offersCreated: created,
            offersUpdated: updated,
            totalQuote: newTotal,
          }),
        },
      });

      return { vendor, created, updated };
    });

    res.status(201).json({
      success: true,
      data: {
        vendor: result.vendor,
        offersCreated: result.created,
        offersUpdated: result.updated,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── CREATE PO from approved BID (Workflow B5 → B6) ─────────────────────────
// POST /api/v1/bid-analyses/:id/create-po
// Pre-condition: BidQuoteItem.selectedVendorName đã được set cho ≥1 item (qua /duyet-bao-gia).
// Logic: group items by selectedVendorName → create 1 PurchaseOrder per vendor + ContractDetail rows.
async function createPoFromBid(req, res, next) {
  try {
    const { id } = req.params;
    const { notes } = req.body || {};

    const bid = await prisma.bidAnalysis.findUnique({
      where: { id },
      include: {
        project: { select: { code: true } },
        items: { orderBy: { itemOrder: 'asc' } },
        vendors: true,
      },
    });
    if (!bid) {
      return res.status(404).json({ success: false, error: 'Bid không tồn tại' });
    }

    // Filter items có vendor đã chọn + skip placeholder rows
    const itemsWithVendor = bid.items.filter((it) => {
      if (!it.selectedVendorName) return false;
      const n = (it.itemName || '').toLowerCase();
      return !n.startsWith('ghi chú') && !n.startsWith('người đề nghị');
    });
    if (itemsWithVendor.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Chưa có item nào được duyệt NCC. Vui lòng chọn NCC ở /duyet-bao-gia trước.',
      });
    }

    // Group items by vendor
    const byVendor = new Map();
    for (const it of itemsWithVendor) {
      const vname = it.selectedVendorName;
      if (!byVendor.has(vname)) byVendor.set(vname, []);
      byVendor.get(vname).push(it);
    }

    // Helper: find offer to get unit price + currency
    const offers = await prisma.bidQuoteOffer.findMany({
      where: { itemId: { in: itemsWithVendor.map((i) => i.id) } },
      include: { vendor: true },
    });

    const offerKey = (itemId, vendorName) =>
      `${itemId}::${vendorName}`;
    const offerMap = new Map();
    for (const o of offers) {
      offerMap.set(offerKey(o.itemId, o.vendor?.vendorName), o);
    }

    // Generate PO code helper (poCode unique)
    const yymmdd = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    let seqStart = 0;
    const seqCount = await prisma.purchaseOrder.count({
      where: { poCode: { startsWith: `PO-${yymmdd}-` } },
    });
    seqStart = seqCount;

    const result = await prisma.$transaction(async (tx) => {
      const createdPOs = [];
      let seq = seqStart;
      for (const [vendorName, items] of byVendor.entries()) {
        seq += 1;
        const poCode = `PO-${yymmdd}-${String(seq).padStart(3, '0')}`;

        // Pick currency from vendor record (fallback VND)
        const vendor = bid.vendors.find((v) => v.vendorName === vendorName);
        const currency = vendor?.currency || 'VND';

        // Compute total from offers
        let totalValue = 0;
        const contractLines = [];
        for (const it of items) {
          const offer = offerMap.get(offerKey(it.id, vendorName));
          const unitPrice = offer?.unitPrice || it.estimateUnitPrice || 0;
          const qty = it.qtyToBuy || it.qtyPR || 0;
          const total = offer?.totalPrice || unitPrice * qty;
          totalValue += total;
          contractLines.push({
            contractType: currency === 'VND' ? 'DOMESTIC' : 'IMPORT',
            dataSource: 'BID_QUOTE',
            projectCode: bid.project?.code || null,
            vendorName,
            actualProfile: it.profile || null,
            actualGrade: it.grade || null,
            contractQty: qty,
            unitPriceNoVAT: unitPrice,
            currency,
            totalNoVAT: total,
            totalWithVAT: total * 1.1,
            status: 'ORDERED',
            notes: it.itemName || it.itemCode || null,
          });
        }

        const po = await tx.purchaseOrder.create({
          data: {
            bidId: id,
            poCode,
            vendorName,
            totalValue,
            currency,
            status: 'ISSUED',
          },
        });

        // Create ContractDetail rows linked to this PO
        for (const line of contractLines) {
          await tx.contractDetail.create({
            data: { ...line, purchaseOrderId: po.id },
          });
        }

        createdPOs.push({
          id: po.id,
          poCode: po.poCode,
          vendorName,
          itemCount: items.length,
          totalValue,
          currency,
        });
      }

      // Update BID status → CONTRACTED
      await tx.bidAnalysis.update({
        where: { id },
        data: {
          status: 'CONTRACTED',
          notes: notes ? `${bid.notes || ''}\n[PO]: ${notes}`.trim() : bid.notes,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE_PO_FROM_BID',
          userId: req.user?.id || null,
          entityType: 'BidAnalysis',
          entityId: id,
          details: JSON.stringify({
            bidCode: bid.bidCode,
            poCount: createdPOs.length,
            poCodes: createdPOs.map((p) => p.poCode),
            totalItems: itemsWithVendor.length,
          }),
        },
      });

      return createdPOs;
    });

    res.status(201).json({
      success: true,
      data: {
        bidId: id,
        bidCode: bid.bidCode,
        purchaseOrders: result,
        totalPOs: result.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── EXPORT RFQ to Excel (2 sheets professional) ────────────────────────────
// GET /api/v1/bid-analyses/:id/export-rfq
// Sử dụng exceljs cho full styling. Palette + structure khớp template-quy-trinh-mua-hang.xlsx Sheet 3.
async function exportRfqExcel(req, res, next) {
  try {
    const ExcelJS = require('exceljs');
    const { id } = req.params;

    const bid = await prisma.bidAnalysis.findUnique({
      where: { id },
      include: {
        project: { select: { code: true, name: true } },
        items: { orderBy: { itemOrder: 'asc' } },
        prLinks: {
          include: {
            prDetail: { include: { pr: { select: { prRef: true } } } },
          },
        },
      },
    });
    if (!bid) {
      return res.status(404).json({ success: false, error: 'RFQ không tồn tại' });
    }

    // Filter noise rows: Roman numerals, section headers, subtotals, notes
    const isRealItem = (it) => {
      const code = (it.itemCode || '').trim();
      const name = (it.itemName || '').trim();
      if (!code && !name) return false;
      if (/^[IVXLCM]+$/i.test(code)) return false;       // II, III, IV...
      if (/^\d+$/.test(code)) return false;              // "1", "2"
      if (/^t[ổoóò]ng/i.test(code) || /^t[ổoóò]ng/i.test(name)) return false;
      if (/^ghi\s*ch[uú]/i.test(name)) return false;
      if (/^ng[uư][ờơ]i\s+đ[ềe]\s+ngh[ịi]/i.test(name)) return false;
      if (/^b[ắa]t\s+đ[ầa]u/i.test(name) || /^k[ếe]t\s+th[uú]c/i.test(name)) return false;
      // Require either profile/grade/uom OR a quantity > 0 to count as real item
      const hasSpec =
        (it.profile || '').trim() || (it.grade || '').trim() || (it.uom || '').trim();
      const hasQty = (it.qtyPR || 0) > 0 || (it.qtyToBuy || 0) > 0;
      return Boolean(hasSpec || hasQty);
    };
    const realItems = bid.items.filter(isRealItem);

    const prRefs = Array.from(
      new Set(bid.prLinks.map((l) => l.prDetail?.pr?.prRef).filter(Boolean))
    );
    const userName = req.user?.name || req.user?.username || '';
    const today = new Date().toLocaleDateString('vi-VN');

    // ── Palette (khớp template-quy-trinh-mua-hang Sheet 3) ──────────────────
    const NAVY = 'FF1F3864';
    const BLUE = 'FF2E75B6';
    const LIGHT_BLUE = 'FFDEEBF7';
    const YELLOW = 'FFFFEB9C';
    const GREEN_BAND = 'FF2E75B6';
    const ORANGE_BAND = 'FFED7D31';
    const ROSE_BAND = 'FFC00000';
    const ROW_ALT = 'FFF2F2F2';
    const THIN_BORDER = {
      top: { style: 'thin', color: { argb: 'FFB4B4B4' } },
      left: { style: 'thin', color: { argb: 'FFB4B4B4' } },
      bottom: { style: 'thin', color: { argb: 'FFB4B4B4' } },
      right: { style: 'thin', color: { argb: 'FFB4B4B4' } },
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'IBSHI Procurement Platform';
    wb.created = new Date();

    // ╔════════════════════════════════════════════════════════════════════╗
    // ║ Sheet 1: REQUEST FOR QUOTATION (form NCC chào giá)                ║
    // ╚════════════════════════════════════════════════════════════════════╝
    const ws1 = wb.addWorksheet('Yêu cầu chào giá', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });
    ws1.columns = [
      { width: 6 }, { width: 18 }, { width: 26 }, { width: 18 }, { width: 8 },
      { width: 8 }, { width: 11 }, { width: 13 }, { width: 15 },
      { width: 5 }, { width: 13 }, { width: 15 },
      { width: 5 }, { width: 13 }, { width: 15 },
      { width: 18 }, { width: 22 },
    ];

    // ─ IBSHI company header (rows 1-3) ──────────────────────────────────────
    ws1.mergeCells('A1:E1');
    ws1.getCell('A1').value = 'CÔNG TY CỔ PHẦN CÔNG NGHIỆP NẶNG IBS (IBSHI)';
    ws1.getCell('A1').font = { name: 'Arial', size: 13, bold: true, color: { argb: NAVY } };
    ws1.getCell('A1').alignment = { vertical: 'middle' };

    ws1.mergeCells('A2:E2');
    ws1.getCell('A2').value = 'Shipbuilding & Steel Fabrication  ·  Bộ phận Mua hàng';
    ws1.getCell('A2').font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF595959' } };

    ws1.mergeCells('A3:E3');
    ws1.getCell('A3').value = 'Hotline: ____  ·  Email: muahang@ibs.com.vn';
    ws1.getCell('A3').font = { name: 'Arial', size: 9, color: { argb: 'FF595959' } };

    // Document title (right side, span K1:Q3)
    ws1.mergeCells('K1:Q3');
    const titleCell = ws1.getCell('K1');
    titleCell.value = 'YÊU CẦU CHÀO GIÁ\nREQUEST FOR QUOTATION';
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // Row 4 spacer
    ws1.getRow(4).height = 4;

    // ─ Info block (rows 5-9) — 2 columns left/right ──────────────────────────
    const infoPairs = [
      ['Project / Dự án:', bid.project?.code || '—', 'PR Ref:', prRefs.join(', ') || '—'],
      ['Subject / Hạng mục:', bid.subject || '', 'Số NCC dự kiến:', ''],
      ['Bidcode:', bid.bidCode || bid.legacyBidCode || '—', 'Hạn báo giá:', ''],
      ['Ngày lập:', today, 'Ngưỡng phê duyệt:', ''],
      ['Người lập:', userName, 'Hình thức gửi:', ''],
    ];
    infoPairs.forEach((row, i) => {
      const r = 5 + i;
      // Left label
      const lbl = ws1.getCell(`A${r}`);
      lbl.value = row[0];
      lbl.font = { name: 'Arial', size: 10.5, bold: true };
      lbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
      lbl.alignment = { vertical: 'middle' };
      lbl.border = THIN_BORDER;
      // Left value
      ws1.mergeCells(`B${r}:E${r}`);
      const val = ws1.getCell(`B${r}`);
      val.value = row[1];
      val.font = { name: 'Arial', size: 10.5 };
      val.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
      val.alignment = { vertical: 'middle' };
      val.border = THIN_BORDER;
      // Right label
      const lbl2 = ws1.getCell(`J${r}`);
      lbl2.value = row[2];
      lbl2.font = { name: 'Arial', size: 10.5, bold: true };
      lbl2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
      lbl2.alignment = { vertical: 'middle' };
      lbl2.border = THIN_BORDER;
      // Right value
      ws1.mergeCells(`K${r}:Q${r}`);
      const val2 = ws1.getCell(`K${r}`);
      val2.value = row[3];
      val2.font = { name: 'Arial', size: 10.5 };
      val2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
      val2.alignment = { vertical: 'middle' };
      val2.border = THIN_BORDER;
      ws1.getRow(r).height = 22;
    });

    // Row 10 spacer
    ws1.getRow(10).height = 6;

    // ─ Section header band (row 11): grouped column titles ──────────────────
    const bandRow = 11;
    ws1.mergeCells(`A${bandRow}:F${bandRow}`);
    let bandCell = ws1.getCell(`A${bandRow}`);
    bandCell.value = 'Phạm vi công việc / Scope';
    bandCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    bandCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    bandCell.alignment = { horizontal: 'center', vertical: 'middle' };
    bandCell.border = THIN_BORDER;

    ws1.mergeCells(`G${bandRow}:I${bandRow}`);
    bandCell = ws1.getCell(`G${bandRow}`);
    bandCell.value = 'Dự toán baseline';
    bandCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_BAND } };
    bandCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    bandCell.alignment = { horizontal: 'center', vertical: 'middle' };
    bandCell.border = THIN_BORDER;

    ws1.mergeCells(`J${bandRow}:L${bandRow}`);
    bandCell = ws1.getCell(`J${bandRow}`);
    bandCell.value = 'NCC 1: [TÊN]';
    bandCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE_BAND } };
    bandCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    bandCell.alignment = { horizontal: 'center', vertical: 'middle' };
    bandCell.border = THIN_BORDER;

    ws1.mergeCells(`M${bandRow}:O${bandRow}`);
    bandCell = ws1.getCell(`M${bandRow}`);
    bandCell.value = 'NCC 2: [TÊN]';
    bandCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE_BAND } };
    bandCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    bandCell.alignment = { horizontal: 'center', vertical: 'middle' };
    bandCell.border = THIN_BORDER;

    ws1.mergeCells(`P${bandRow}:Q${bandRow}`);
    bandCell = ws1.getCell(`P${bandRow}`);
    bandCell.value = 'Lựa chọn / Ghi chú';
    bandCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSE_BAND } };
    bandCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    bandCell.alignment = { horizontal: 'center', vertical: 'middle' };
    bandCell.border = THIN_BORDER;
    ws1.getRow(bandRow).height = 22;

    // ─ Column header (row 12) ───────────────────────────────────────────────
    const colHeader = [
      'No.', 'Mã VT', 'Profile / Quy cách', 'Grade / Mác thép', 'SL', 'ĐVT',
      'Số lượng', 'Đơn giá', 'Thành tiền',
      'V?', 'Đơn giá', 'Thành tiền',
      'V?', 'Đơn giá', 'Thành tiền',
      'NCC chọn', 'Ghi chú',
    ];
    const hdrRowIdx = 12;
    const hdr = ws1.getRow(hdrRowIdx);
    hdr.values = colHeader;
    hdr.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 10, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = THIN_BORDER;
    });
    hdr.height = 28;

    // ─ Item rows ────────────────────────────────────────────────────────────
    const startRow = hdrRowIdx + 1;
    realItems.forEach((it, idx) => {
      const qty = Number(it.qtyToBuy || it.qtyPR || 0);
      const unit = Number(it.estimateUnitPrice || 0);
      const total = Number(it.estimateTotal || qty * unit || 0);
      const r = startRow + idx;
      const row = ws1.getRow(r);
      row.values = [
        idx + 1,
        it.itemCode || '',
        it.profile || '',
        it.grade || '',
        qty,
        it.uom || '',
        qty,
        unit,
        total,
        '', '', '', // NCC 1: V?, đơn giá, thành tiền
        '', '', '', // NCC 2
        '', '', // Lựa chọn + Ghi chú
      ];
      const altFill = idx % 2 === 1 ? ROW_ALT : null;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.border = THIN_BORDER;
        cell.alignment = {
          vertical: 'middle',
          horizontal:
            colNumber === 1 || colNumber === 5 || colNumber === 6 ? 'center' : 'left',
          wrapText: true,
        };
        // Right-align numeric columns (price/quantity)
        if ([5, 7, 8, 9, 11, 12, 14, 15].includes(colNumber)) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          // Quantity cols (5, 7) cho 3 chữ số thập phân; price cols cho ngàn separator
          cell.numFmt = colNumber === 5 || colNumber === 7 ? '#,##0.###' : '#,##0';
        }
        if (altFill) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: altFill } };
        }
      });
      row.height = 20;
    });

    // ─ Total row ────────────────────────────────────────────────────────────
    const totalRowIdx = startRow + realItems.length;
    if (realItems.length > 0) {
      ws1.mergeCells(`A${totalRowIdx}:H${totalRowIdx}`);
      const tCell = ws1.getCell(`A${totalRowIdx}`);
      tCell.value = 'TỔNG DỰ TOÁN (chưa VAT)';
      tCell.font = { name: 'Arial', size: 10.5, bold: true };
      tCell.alignment = { horizontal: 'right', vertical: 'middle' };
      tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
      tCell.border = THIN_BORDER;
      const sumCell = ws1.getCell(`I${totalRowIdx}`);
      sumCell.value = realItems.reduce(
        (s, it) =>
          s +
          Number(it.estimateTotal || (it.estimateUnitPrice || 0) * (it.qtyToBuy || it.qtyPR || 0)),
        0
      );
      sumCell.font = { name: 'Arial', size: 10.5, bold: true };
      sumCell.numFmt = '#,##0';
      sumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
      sumCell.alignment = { horizontal: 'right', vertical: 'middle' };
      sumCell.border = THIN_BORDER;
      ws1.getRow(totalRowIdx).height = 22;
    }

    // ─ Signature block (3 rows below) ───────────────────────────────────────
    const sigStart = totalRowIdx + 3;
    const sigRow1 = ws1.getRow(sigStart);
    sigRow1.values = ['', '', 'Người lập', '', '', '', 'Trưởng bộ phận', '', '', '', 'Giám đốc TM', '', '', '', '', '', ''];
    sigRow1.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 10, bold: true };
      cell.alignment = { horizontal: 'center' };
    });
    const sigRow2 = ws1.getRow(sigStart + 1);
    sigRow2.values = ['', '', '(Ký, ghi rõ họ tên)', '', '', '', '(Ký, ghi rõ họ tên)', '', '', '', '(Ký, ghi rõ họ tên)', '', '', '', '', '', ''];
    sigRow2.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF595959' } };
      cell.alignment = { horizontal: 'center' };
    });
    ws1.getRow(sigStart + 2).height = 50;

    // Freeze panes — header + first 12 rows
    ws1.views = [{ state: 'frozen', xSplit: 0, ySplit: hdrRowIdx, activeCell: `A${hdrRowIdx + 1}` }];

    // ╔════════════════════════════════════════════════════════════════════╗
    // ║ Sheet 2: RFQ Log (nhật ký nội bộ)                                 ║
    // ╚════════════════════════════════════════════════════════════════════╝
    const ws2 = wb.addWorksheet('RFQ Log');
    ws2.columns = [
      { width: 5 }, { width: 14 }, { width: 22 }, { width: 16 }, { width: 32 },
      { width: 22 }, { width: 14 }, { width: 16 }, { width: 12 },
    ];
    ws2.mergeCells('A1:I1');
    ws2.getCell('A1').value = 'NHẬT KÝ HỎI GIÁ — RFQ LOG (IBSHI)';
    ws2.getCell('A1').font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    ws2.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    ws2.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws2.getRow(1).height = 28;

    ws2.mergeCells('A2:I2');
    ws2.getCell('A2').value = 'Theo dõi tất cả các lần hỏi giá NCC — đảm bảo ≥2 NCC được hỏi cho mỗi PR';
    ws2.getCell('A2').font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF595959' } };
    ws2.getCell('A2').alignment = { horizontal: 'center' };

    const log_hdr = ws2.getRow(4);
    log_hdr.values = ['#', 'Ngày gửi RFQ', 'Mã PR', 'Dự án', 'Hạng mục', 'NCC được hỏi', 'Kênh gửi', 'Ngày phản hồi', 'Status'];
    log_hdr.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = THIN_BORDER;
    });
    log_hdr.height = 24;

    const logRow = ws2.getRow(5);
    logRow.values = [
      1,
      today,
      prRefs.join(', ') || '',
      bid.project?.code || '',
      bid.subject || '',
      '',
      '',
      '',
      'OPEN',
    ];
    logRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.border = THIN_BORDER;
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber === 1 || colNumber === 9 ? 'center' : 'left',
        wrapText: true,
      };
    });
    logRow.height = 22;

    // ─ Send response ─────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const filename = `RFQ_${bid.bidCode || bid.id.slice(0, 8)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
}

// ─── CANCEL RFQ (Workflow B2 rollback) ───────────────────────────────────────
// DELETE /api/v1/bid-analyses/:id
// Chỉ cho phép cancel khi:
//   - status = 'OPEN' (chưa nhận báo giá)
//   - không có BidQuoteVendor nào responded (vendor.totalQuote > 0)
// Khi cancel: xóa BidAnalysis + cascade xóa BidQuoteItem/BidQuoteVendor/BidAnalysisPrLink,
// revert PrDetail.statusFlag về 'Chờ báo giá'.
async function cancelBidAnalysis(req, res, next) {
  try {
    const { id } = req.params;

    const bid = await prisma.bidAnalysis.findUnique({
      where: { id },
      include: {
        vendors: { select: { id: true, totalQuote: true } },
        prLinks: { select: { prDetailId: true } },
      },
    });
    if (!bid) {
      return res.status(404).json({ success: false, error: 'RFQ không tồn tại' });
    }
    if (bid.status !== 'OPEN' && bid.status !== 'DRAFT') {
      return res.status(409).json({
        success: false,
        error: `Không thể huỷ RFQ ở trạng thái ${bid.status}`,
      });
    }
    const hasResponses = bid.vendors.some((v) => (v.totalQuote || 0) > 0);
    if (hasResponses) {
      return res.status(409).json({
        success: false,
        error: 'Không thể huỷ — đã có NCC gửi báo giá. Xóa thủ công nếu cần.',
      });
    }

    const prDetailIds = bid.prLinks.map((l) => l.prDetailId);

    await prisma.$transaction(async (tx) => {
      // Revert linked PrDetail.statusFlag → 'Chờ báo giá'
      if (prDetailIds.length > 0) {
        await tx.prDetail.updateMany({
          where: { id: { in: prDetailIds } },
          data: { statusFlag: 'Chờ báo giá' },
        });
      }

      // Cascade delete (rely on FK ON DELETE CASCADE for BidQuoteItem/Vendor/PrLink)
      await tx.bidAnalysisPrLink.deleteMany({ where: { bidAnalysisId: id } });
      // BidQuoteVendor → BidQuoteOffer cascade via FK. BidQuoteItem too.
      await tx.bidQuoteOffer.deleteMany({
        where: { vendor: { bidId: id } },
      });
      await tx.bidQuoteVendor.deleteMany({ where: { bidId: id } });
      await tx.bidQuoteItem.deleteMany({ where: { bidId: id } });
      await tx.bidAnalysis.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          action: 'CANCEL_BID_ANALYSIS',
          userId: req.user?.id || null,
          entityType: 'BidAnalysis',
          entityId: id,
          details: JSON.stringify({
            bidCode: bid.bidCode,
            prDetailIdsRevertedToChờBáoGiá: prDetailIds.length,
          }),
        },
      });
    });

    res.json({
      success: true,
      data: { id, bidCode: bid.bidCode, prDetailsReverted: prDetailIds.length },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadBidAnalyses,
  listBidAnalyses,
  getBidAnalysisDetail,
  selectVendor,
  selectItemVendor,
  getApprovalSummary,
  downloadSourceFile,
  listItemsForBidding,
  previewBidCode,
  createBidFromPR,
  createBidFromPRBulkByGroup,
  exportRfqImportTemplate,
  importRfqBatch,
  enterVendorQuote,
  cancelBidAnalysis,
  exportRfqExcel,
  createPoFromBid,
};
