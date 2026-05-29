/**
 * bidAnalysisParser.js — Parse các sheet "BID ANALYSIS - GIẢI TRÌNH MUA SẮM"
 *
 * Mỗi sheet có format:
 *   Row 1: Title
 *   Row 3: Project (col 2 = "PROJECT No/ Dự án: 25-VPI-I-095")
 *   Row 5: Subject
 *   Row 8 (group headers): No, CONTENT, Phạm vi, Dự toán, Đã mua, [VENDOR_NAME × N], Lựa chọn, Ghi chú
 *   Row 9 (sub-headers): Item, Description, Profile, Grade, Grade mua, SL Mua, SL PR, KL/SL, Đơn giá, Thành tiền (DT), Thành tiền (đã mua), [VENDOR_1, VENDOR_2, ...], Lựa chọn, Ghi chú
 *   Row 10 (3rd-level sub-header): Phạm vi, Đơn giá, Thành tiền (cho mỗi vendor)
 *   Row 11: Tổng (sum row)
 *   Row 12+: Items
 *
 * Mỗi vendor chiếm 3 cột liên tiếp (Phạm vi, Đơn giá, Thành tiền)
 */

const XLSX = require('xlsx');

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function toNum(v) {
  if (v === null || v === undefined || v === '' || v === '#N/A' || v === 'N/A') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v)
    .replace(/,/g, '.')
    .replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim().replace(/\s+/g, ' ');
}

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// ─── DETECTION ───────────────────────────────────────────────────────────────

/**
 * Check sheet có phải BID ANALYSIS không
 */
function isBidAnalysisSheet(ws) {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (!raw[0]) return false;
  const r1 = (raw[0] || []).map((c) => norm(c)).join(' ');
  return r1.includes('bid analysis') || r1.includes('giải trình mua sắm');
}

/**
 * Find tất cả các BID ANALYSIS sheets trong workbook
 */
function findBidSheets(wb) {
  const result = [];
  for (const name of wb.SheetNames) {
    if (isBidAnalysisSheet(wb.Sheets[name])) {
      result.push(name);
    }
  }
  return result;
}

// ─── PARSER ──────────────────────────────────────────────────────────────────

/**
 * Parse 1 BID ANALYSIS sheet → cấu trúc { meta, vendors, items }
 */
function parseBidSheet(ws, sheetName) {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (raw.length < 12) return null;

  // ─── Extract meta ───
  const titleRow = (raw[0] || []).find((c) => c) || '';
  const projectRow = raw[2] || [];
  const subjectRow = raw[4] || [];

  const projectText = (projectRow.find((c) => c && /project/i.test(String(c))) || '') + '';
  const projectMatch = projectText.match(/(\d{2}-[A-Z]{3,4}-[A-Z]-?\d{2,3})/i);
  const projectCode = projectMatch ? projectMatch[1] : null;

  const subjectText = subjectRow.find((c) => c && !/^subject/i.test(String(c))) || '';

  // Try date parsing từ sheet name (vd "VSAN 26-1" → 26/1)
  const dateMatch = sheetName.match(/(\d{1,2})[\s\-/.]*(\d{1,2})/);
  let bidDate = null;
  if (dateMatch) {
    const d = parseInt(dateMatch[1], 10);
    const m = parseInt(dateMatch[2], 10);
    if (d <= 31 && m <= 12) {
      bidDate = new Date(2026, m - 1, d);
    }
  }

  // ─── Find header rows ───
  // Row 8 (index 7): Group headers
  // Row 9 (index 8): Sub-headers
  // Row 10 (index 9): 3rd-level sub-headers (Phạm vi, Đơn giá, Thành tiền cho mỗi vendor)
  // Row 11 (index 10): Tổng
  // Row 12+ (index 11+): Items

  let groupHeaderRow = -1;
  let subHeaderRow = -1;
  for (let r = 5; r < Math.min(15, raw.length); r++) {
    const row = raw[r] || [];
    const text = row.map((c) => norm(c)).join(' ');
    if (text.includes('content') && text.includes('phạm vi công việc')) {
      groupHeaderRow = r;
      subHeaderRow = r + 1;
      break;
    }
  }
  if (groupHeaderRow === -1) return null;

  const groupRow = raw[groupHeaderRow] || [];
  const subRow = raw[subHeaderRow] || [];

  // ─── Detect vendor columns ───
  // Vendors có vendor name trong subRow (sau cột "Thành tiền (vnd)" cuối)
  // Mỗi vendor chiếm 3 cột (Phạm vi, Đơn giá, Thành tiền)
  // Columns trước vendor: Item, Description, Profile, Grade, Grade mua, SL Mua, SL PR, KL/SL, Đơn giá DT, Thành tiền DT, Thành tiền đã mua

  // Find vendor start col bằng cách check subRow:
  // Sub row có pattern Item|Description|Profile|Grade|Grade mua|SL Mua|SL PR|KL/SL|ĐG|TT|TT đã mua|VENDOR1|...|VENDOR2|...
  // Vendor name nằm ở subRow, ngay sau "Thành tiền (vnd)" cuối

  const vendors = [];
  const colMap = {};

  // Map standard cols
  for (let c = 0; c < subRow.length; c++) {
    const cell = norm(subRow[c]);
    if (!cell) continue;
    if (cell === 'item' && colMap.item === undefined) colMap.item = c;
    else if (cell.includes('description') && colMap.description === undefined) colMap.description = c;
    else if (cell === 'profile/ vật tư' && colMap.profile === undefined) colMap.profile = c;
    else if (cell.includes('grade') && cell.includes('mác vật liệu mua') && colMap.gradeBuy === undefined)
      colMap.gradeBuy = c;
    else if (cell.includes('grade') && colMap.grade === undefined) colMap.grade = c;
    else if (cell.startsWith('số lượng mua') && colMap.qtyBuy === undefined) colMap.qtyBuy = c;
    else if (cell.startsWith('số lượng pr') && colMap.qtyPR === undefined) colMap.qtyPR = c;
    else if (cell.includes('khối lượng/ số lượng') && colMap.estQty === undefined) colMap.estQty = c;
    else if (cell.includes('đơn giá') && colMap.estUnitPrice === undefined) colMap.estUnitPrice = c;
    else if (cell.includes('thành tiền') && colMap.estTotal === undefined) colMap.estTotal = c;
    else if (cell.includes('thành tiền') && colMap.boughtTotal === undefined) colMap.boughtTotal = c;
  }

  // Find vendor names: cells in subRow after `boughtTotal` that are non-empty + uppercase-ish
  const vendorStartCol = (colMap.boughtTotal ?? colMap.estTotal ?? 10) + 1;
  for (let c = vendorStartCol; c < subRow.length; c++) {
    const cell = toStr(subRow[c]);
    if (!cell) continue;
    // Skip "Lựa chọn" / "Ghi chú" / "Phạm vi"/"Đơn giá"/"Thành tiền"
    if (/^(lựa chọn|ghi chú|phạm vi|đơn giá|thành tiền|đơn vị)/i.test(cell)) continue;
    // Vendor name detected
    vendors.push({
      name: cell,
      vendorOrder: vendors.length,
      colScope: c, // Phạm vi
      colUnitPrice: c + 1, // Đơn giá
      colTotal: c + 2, // Thành tiền
    });
  }

  // Determine if vendor is IMPORT (currency USD) — check group header
  vendors.forEach((v) => {
    const groupHeader = norm(groupRow[v.colScope] || '');
    const r10 = (raw[subHeaderRow + 1] || [])[v.colUnitPrice];
    const unitPriceLabel = norm(r10 || '');
    v.vendorType =
      groupHeader.includes('usd') || unitPriceLabel.includes('usd') ? 'IMPORT' : 'DOMESTIC';
    v.currency = v.vendorType === 'IMPORT' ? 'USD' : 'VND';
  });

  // Find "Lựa chọn" col và "Ghi chú" col
  const lastVendorCol = vendors.length > 0 ? vendors[vendors.length - 1].colTotal : vendorStartCol;
  let selectedCol = -1;
  let notesCol = -1;
  for (let c = lastVendorCol + 1; c < (groupRow.length || 30); c++) {
    const g = norm(groupRow[c]);
    if (g.includes('lựa chọn') && selectedCol === -1) selectedCol = c;
    if (g.includes('ghi chú') && notesCol === -1) notesCol = c;
  }

  // ─── Parse data rows ───
  // Skip total row (row 11 = index 10), bắt đầu từ row 12 (index 11)
  let dataStart = subHeaderRow + 1;
  // Find row "Tổng" và skip
  for (let r = dataStart; r < Math.min(dataStart + 5, raw.length); r++) {
    const cellA = norm(raw[r]?.[0]);
    if (cellA === 'tổng' || cellA.startsWith('tổng')) {
      dataStart = r + 1;
      break;
    }
  }

  const items = [];
  for (let r = dataStart; r < raw.length; r++) {
    const row = raw[r];
    if (!row) continue;
    const itemCode = toStr(row[colMap.item]);
    const itemName = toStr(row[colMap.description]);
    if (!itemCode && !itemName) continue;
    // Skip "Xếp hạng" row
    if (/xếp hạng|tổng/i.test(toStr(row[colMap.description] || row[1]))) continue;
    if (itemCode.length > 100) continue;

    const item = {
      itemCode: itemCode || null,
      itemName: itemName || itemCode || '',
      profile: toStr(row[colMap.profile]) || null,
      grade: toStr(row[colMap.grade]) || null,
      gradeBuy: toStr(row[colMap.gradeBuy]) || null,
      uom: null,
      qtyPR: toNum(row[colMap.qtyPR]),
      qtyToBuy: toNum(row[colMap.qtyBuy]),
      estimateUnitPrice: toNum(row[colMap.estUnitPrice]),
      estimateTotal: toNum(row[colMap.estTotal]),
      alreadyBoughtAmount: toNum(row[colMap.boughtTotal]),
      selectedVendorName: selectedCol >= 0 ? toStr(row[selectedCol]) : null,
      notes: notesCol >= 0 ? toStr(row[notesCol]) : null,
      offers: [],
    };

    // Extract offers cho từng vendor
    for (const v of vendors) {
      const scope = toStr(row[v.colScope]);
      const unitPrice = toNum(row[v.colUnitPrice]);
      const totalPrice = toNum(row[v.colTotal]);
      if (!scope && !unitPrice && !totalPrice) continue;
      item.offers.push({
        vendorOrder: v.vendorOrder,
        vendorName: v.name,
        scope: scope || null,
        unitPrice,
        totalPrice,
      });
    }

    items.push(item);
  }

  // Calc total quote per vendor (sum thành tiền cho mỗi vendor)
  vendors.forEach((v) => {
    v.totalQuote = items.reduce((s, it) => {
      const offer = it.offers.find((o) => o.vendorOrder === v.vendorOrder);
      return s + (offer?.totalPrice || 0);
    }, 0);
  });

  // Determine winner — vendor được chọn nhiều nhất trong selectedVendorName
  const winnerCounts = new Map();
  items.forEach((it) => {
    if (!it.selectedVendorName) return;
    // Match approximate vendor name
    const matched = vendors.find((v) =>
      norm(v.name).includes(norm(it.selectedVendorName).split(' ')[0])
    );
    if (matched) winnerCounts.set(matched.name, (winnerCounts.get(matched.name) || 0) + 1);
  });
  let winnerName = null;
  let maxWins = 0;
  for (const [n, c] of winnerCounts) {
    if (c > maxWins) {
      maxWins = c;
      winnerName = n;
    }
  }
  vendors.forEach((v) => {
    v.isWinner = v.name === winnerName;
  });

  return {
    bidCode: sheetName,
    sheetName,
    subject: toStr(subjectText) || sheetName,
    projectCode,
    bidDate,
    title: toStr(titleRow),
    vendors: vendors.map((v) => ({
      vendorName: v.name,
      vendorOrder: v.vendorOrder,
      vendorType: v.vendorType,
      currency: v.currency,
      totalQuote: v.totalQuote,
      isWinner: v.isWinner,
    })),
    items,
    selectedVendorName: winnerName,
  };
}

/**
 * Parse all BID ANALYSIS sheets in workbook → array of bid analyses
 */
function parseAllBidAnalyses(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetNames = findBidSheets(wb);

  const results = [];
  const errors = [];
  for (const name of sheetNames) {
    try {
      const parsed = parseBidSheet(wb.Sheets[name], name);
      if (parsed && parsed.items.length > 0) results.push(parsed);
    } catch (e) {
      errors.push({ sheet: name, error: e.message.slice(0, 200) });
    }
  }

  return { sheets: sheetNames, parsed: results, errors };
}

module.exports = {
  parseAllBidAnalyses,
  parseBidSheet,
  findBidSheets,
  isBidAnalysisSheet,
};
