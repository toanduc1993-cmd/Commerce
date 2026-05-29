'use strict';
/**
 * bidQuoteUploadController.js
 *
 * Endpoints:
 *   POST /bid-analyses/:bidId/upload-quote
 *     - Nhận file Excel/PDF từ NCC
 *     - Excel → parse giá → trả preview (rows matched với items của BID)
 *     - PDF  → chỉ lưu file, trả { type:'pdf', filePath, fileName }
 *
 *   POST /bid-analyses/:bidId/confirm-quote-upload
 *     - Nhận preview đã xác nhận → tạo BidQuoteVendor + BidQuoteOffer
 *     - Gán quoteFilePath/quoteFileName vào vendor record
 *
 *   GET  /bid-analyses/:bidId/quote-files
 *     - List vendors có file đính kèm (download links)
 */

const path = require('path');
const ExcelJS = require('exceljs');
const prisma = require('../lib/prisma');

const UPLOADS_BASE = path.join(__dirname, '../../uploads/bid-quotes');
const API_BASE = process.env.API_BASE_URL || 'http://localhost:5005';

// ─── Helper: detect header row & parse Excel ───────────────────────────────

/**
 * Tìm row header có chứa từ khoá "đơn giá" / "unit price" / "price"
 * Trả về { headerRowIdx, colMap: { itemName, unitPrice, totalPrice, qty, uom, scope } }
 */
function detectHeader(worksheet) {
  const keywords = {
    itemName:   ['tên vật tư', 'vật tư', 'tên hàng', 'mô tả', 'description', 'material', 'item'],
    unitPrice:  ['đơn giá', 'unit price', 'price', 'giá', 'đơn giá ncc', 'đơn giá (vnd)', 'đơn giá (usd)'],
    totalPrice: ['thành tiền', 'total', 'tổng tiền', 'amount'],
    qty:        ['số lượng', 'slg', 'qty', 'quantity', 'sl'],
    uom:        ['đvt', 'đơn vị', 'unit', 'uom'],
    scope:      ['scope', 'phạm vi'],
  };

  for (let r = 1; r <= Math.min(20, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r);
    const colMap = {};
    row.eachCell({ includeEmpty: false }, (cell, colIdx) => {
      const val = String(cell.value || '').toLowerCase().trim();
      for (const [field, kws] of Object.entries(keywords)) {
        if (!colMap[field] && kws.some((kw) => val.includes(kw))) {
          colMap[field] = colIdx;
        }
      }
    });
    // Require at least itemName + unitPrice
    if (colMap.itemName && colMap.unitPrice) {
      return { headerRowIdx: r, colMap };
    }
  }
  return null;
}

function cellNum(row, colIdx) {
  if (!colIdx) return null;
  const v = row.getCell(colIdx).value;
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,\s]/g, ''));
  return isNaN(n) ? null : n;
}

function cellStr(row, colIdx) {
  if (!colIdx) return '';
  const v = row.getCell(colIdx).value;
  if (v == null) return '';
  return String(v).trim();
}

// ─── Fuzzy match parsed row name → BID item ────────────────────────────────

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9àáảãạăắặẳẵằâấầẩẫậđèéẹẻẽêếềệểễìíịỉĩòóọỏõôốồộổỗơớờợởỡùúụủũưứừựửữỳýỵỷỹ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  // Token overlap
  const ta = new Set(na.split(' ').filter(Boolean));
  const tb = new Set(nb.split(' ').filter(Boolean));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

function matchItemsToBid(parsedRows, bidItems) {
  return parsedRows.map((row) => {
    let best = null;
    let bestScore = 0;
    for (const item of bidItems) {
      const score = Math.max(
        similarity(row.itemName, item.itemName || ''),
        similarity(row.itemName, item.itemCode || ''),
      );
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return {
      ...row,
      matchedItemId:   bestScore >= 0.3 ? best?.id : null,
      matchedItemName: bestScore >= 0.3 ? (best?.itemName || best?.itemCode) : null,
      matchScore:      Math.round(bestScore * 100),
    };
  });
}

// ─── POST /bid-analyses/:bidId/upload-quote ────────────────────────────────

exports.uploadQuote = async (req, res) => {
  const { bidId } = req.params;

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Không có file' });
  }

  const filePath  = req.file.path;   // absolute
  const fileName  = req.file.originalname;
  const relPath   = `bid-quotes/${bidId}/${req.file.filename}`; // relative from uploads/
  const isPdf     = req.file.mimetype === 'application/pdf';

  // PDF → chỉ lưu, không parse
  if (isPdf) {
    return res.json({
      success: true,
      type: 'pdf',
      relPath,
      fileName,
      message: 'File PDF đã lưu. Vui lòng nhập giá thủ công hoặc để OCRP xử lý.',
    });
  }

  // Excel → parse
  try {
    const bid = await prisma.bidAnalysis.findUnique({
      where: { id: bidId },
      include: { items: { orderBy: { itemOrder: 'asc' } } },
    });
    if (!bid) return res.status(404).json({ success: false, error: 'Bid không tồn tại' });

    const bidItems = (bid.items || []).filter((it) => {
      const n = (it.itemName || '').toLowerCase();
      return !n.startsWith('ghi chú') && !n.startsWith('người đề nghị');
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);

    // Try each sheet, use first that has a detectable header
    let parsedRows = [];
    let sheetName  = '';

    for (const ws of wb.worksheets) {
      const detected = detectHeader(ws);
      if (!detected) continue;

      const { headerRowIdx, colMap } = detected;
      sheetName = ws.name;

      for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
        const row  = ws.getRow(r);
        const name = cellStr(row, colMap.itemName);
        if (!name) continue;

        const unitPrice  = cellNum(row, colMap.unitPrice);
        const totalPrice = cellNum(row, colMap.totalPrice);
        const qty        = cellNum(row, colMap.qty);
        const scope      = cellStr(row, colMap.scope) || 'V';

        parsedRows.push({
          rowNum: r,
          itemName:   name,
          qty:        qty ?? 0,
          uom:        cellStr(row, colMap.uom),
          unitPrice:  unitPrice ?? 0,
          totalPrice: totalPrice ?? (unitPrice && qty ? Math.round(unitPrice * qty) : 0),
          scope:      ['V','X'].includes(scope.toUpperCase()) ? scope.toUpperCase() : 'V',
        });
      }
      if (parsedRows.length > 0) break;
    }

    if (parsedRows.length === 0) {
      return res.json({
        success: true,
        type:    'excel_no_data',
        relPath,
        fileName,
        sheetName,
        message: 'Không phát hiện được bảng giá trong file Excel. Vui lòng nhập tay.',
      });
    }

    // Match parsed rows → BID items
    const matched = matchItemsToBid(parsedRows, bidItems);

    return res.json({
      success: true,
      type:       'excel',
      relPath,
      fileName,
      sheetName,
      totalRows:  parsedRows.length,
      matchedCount: matched.filter((r) => r.matchedItemId).length,
      rows:       matched,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /bid-analyses/:bidId/confirm-quote-upload ────────────────────────

exports.confirmQuoteUpload = async (req, res) => {
  const { bidId } = req.params;
  const {
    vendorName,
    vendorType = 'DOMESTIC',
    currency   = 'VND',
    notes,
    relPath,
    fileName,
    rows,        // [{ matchedItemId, unitPrice, totalPrice, scope }]
  } = req.body;

  if (!vendorName?.trim()) return res.status(400).json({ success: false, error: 'Thiếu tên NCC' });
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ success: false, error: 'Không có dữ liệu dòng' });

  const validRows = rows.filter((r) => r.matchedItemId && (r.unitPrice > 0 || r.totalPrice > 0));
  if (validRows.length === 0) return res.status(400).json({ success: false, error: 'Không có dòng nào khớp với item trong BID' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Upsert vendor
      let vendor = await tx.bidQuoteVendor.findFirst({
        where: { bidId, vendorName: { equals: vendorName.trim(), mode: 'insensitive' } },
      });
      if (!vendor) {
        vendor = await tx.bidQuoteVendor.create({
          data: {
            bidId,
            vendorName: vendorName.trim(),
            vendorType,
            currency,
            notes: notes || null,
            quoteFilePath: relPath  || null,
            quoteFileName: fileName || null,
          },
        });
      } else {
        // Update file info
        vendor = await tx.bidQuoteVendor.update({
          where: { id: vendor.id },
          data: {
            quoteFilePath: relPath  || vendor.quoteFilePath,
            quoteFileName: fileName || vendor.quoteFileName,
            notes: notes || vendor.notes,
          },
        });
      }

      let offersCreated = 0;
      let offersUpdated = 0;
      let grandTotal    = 0;

      for (const row of validRows) {
        const unitPrice  = Number(row.unitPrice)  || 0;
        const totalPrice = Number(row.totalPrice) || 0;
        const scope      = ['V','X'].includes(String(row.scope).toUpperCase()) ? String(row.scope).toUpperCase() : 'V';

        const existing = await tx.bidQuoteOffer.findFirst({
          where: { itemId: row.matchedItemId, vendorId: vendor.id },
        });

        if (existing) {
          await tx.bidQuoteOffer.update({
            where: { id: existing.id },
            data:  { unitPrice, totalPrice, scope, qualitySource: 'FILE_UPLOAD' },
          });
          offersUpdated++;
        } else {
          await tx.bidQuoteOffer.create({
            data: {
              itemId:        row.matchedItemId,
              vendorId:      vendor.id,
              unitPrice,
              totalPrice,
              scope,
              qualitySource: 'FILE_UPLOAD',
            },
          });
          offersCreated++;
        }
        grandTotal += totalPrice || unitPrice;
      }

      // Update vendor totalQuote
      await tx.bidQuoteVendor.update({
        where: { id: vendor.id },
        data:  { totalQuote: grandTotal },
      });

      return { vendorId: vendor.id, offersCreated, offersUpdated, grandTotal };
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /bid-analyses/:bidId/quote-files ──────────────────────────────────

exports.listQuoteFiles = async (req, res) => {
  const { bidId } = req.params;
  try {
    const vendors = await prisma.bidQuoteVendor.findMany({
      where: { bidId, quoteFilePath: { not: null } },
      select: {
        id:            true,
        vendorName:    true,
        quoteFilePath: true,
        quoteFileName: true,
        totalQuote:    true,
        currency:      true,
        isWinner:      true,
        createdAt:     true,
      },
    });

    const result = vendors.map((v) => ({
      ...v,
      downloadUrl: v.quoteFilePath ? `/uploads/${v.quoteFilePath}` : null,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
