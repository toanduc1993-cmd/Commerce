/**
 * procurementUpdater.js — v2 (dynamic header detection)
 *
 * Parse file Excel "Theo dõi dự án" với khả năng tự nhận diện cấu trúc cột.
 * Mỗi project có offset cột khác nhau (vd 090: col 9-164, 095: col 12-119,
 * 097: col 9-110, G-07: col 7-94, 078: col 10-131) nhưng layout TƯƠNG ĐỐI
 * giống nhau:
 *
 *   ┌─ Item info ─┐ ┌─ Net Qty ─┐ ┌─ Dự trù lần 0..N ─┐ ┌─ Total ─┐
 *   │ Item, Description, Profile, Grade, Unit, U.Weight, ... │
 *   ┌─ Total Ordered ─┐ Remarks  Tận dụng tồn kho  KL phải mua sắm
 *   ┌─ VẬT TƯ TRONG NƯỚC (DOM) ─┐  ┌─ ĐÃ MUA TRONG NƯỚC ─┐  ┌─ QC ─┐
 *   ┌─ Mua sắm nước ngoài (IMP) ─┐ ┌─ ĐÃ MUA NHẬP KHẨU ─┐ ┌─ QC ─┐
 *   ┌─ TỔNG ─┐  So sánh PR  Đánh giá
 *
 * Strategy:
 *  1. Find header row (contains "Item/STT")
 *  2. Build colIdx map by scanning header text + section markers
 *  3. Detect sub-headers (row+1) để xác định offset trong group
 *  4. Parse data rows
 */

const XLSX = require('xlsx');

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v).replace(/,/g, '.').replace(/[^\d.\-]/g, '');
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

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Map "Đánh giá" string từ Excel → MaterialStatus enum
 */
function mapEvaluation(v) {
  if (!v) return null;
  const s = normalize(v);
  if (s.includes('đủ') && !s.includes('thiếu')) return 'Đủ';
  if (s.includes('thiếu')) return 'Thiếu';
  if (s.includes('thừa')) return 'Thừa';
  return null;
}

/**
 * Đoán statusFlag từ workflow data trong row
 */
function inferStatusFlag({
  domContractNo,
  impContractNo,
  domQCResult,
  impQCResult,
  domHandoverProdDate,
  impHandoverProdDate,
  totalPurchasedQty,
  reqQty,
  arrivedDate,
}) {
  const hasContract = !!(domContractNo || impContractNo);
  const hasQCPass =
    /pass|đạt|ok/i.test(domQCResult || '') || /pass|đạt|ok/i.test(impQCResult || '');
  const hasHandover = !!(domHandoverProdDate || impHandoverProdDate);

  if (hasHandover) return 'Đã nhập kho';
  if (hasQCPass) return 'Đã nghiệm thu';
  if (arrivedDate || (totalPurchasedQty > 0 && totalPurchasedQty >= reqQty * 0.9))
    return 'Hàng đang về';
  if (hasContract) return 'Đã ký HĐ';
  if (totalPurchasedQty > 0) return 'Đang đàm phán';
  return null;
}

// ─── HEADER DETECTION ────────────────────────────────────────────────────────

/**
 * Tìm row chứa "Item/STT" header (row 1-15)
 */
function findHeaderRow(raw) {
  for (let r = 0; r < Math.min(15, raw.length); r++) {
    const row = raw[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = normalize(row[c]);
      if (cell.includes('item') && cell.includes('stt')) return r;
    }
  }
  return -1;
}

/**
 * Build column index map từ header row + sub-header row
 *
 * Returns: { itemCode: 11, itemName: 12, ..., domBlock: { contractNo: 62, ... }, impBlock: {...} }
 */
function buildColumnMap(headerRow, subRow) {
  const m = {};
  if (!headerRow) return m;

  // Pass 1: Top-level columns (rowSpan=2 — chỉ ở header row)
  for (let c = 0; c < headerRow.length; c++) {
    const cell = normalize(headerRow[c]);
    if (!cell) continue;

    if (m.itemCode === undefined && /^item/i.test(cell) && cell.includes('stt')) m.itemCode = c;
    else if (m.itemName === undefined && /description|chi.*ti[eế]t/i.test(cell)) m.itemName = c;
    else if (m.profile === undefined && /^profile/i.test(cell) && !m.profile) m.profile = c;
    else if (m.grade === undefined && /^grade|m[aá]c.*v[aậ]t.*li[eệ]u/i.test(cell)) m.grade = c;
    else if (m.unit === undefined && /^unit\s*\/?\s*[đd][oơ]n|đơn\s*v[iị]/i.test(cell)) m.unit = c;
    else if (m.unitWeight === undefined && /u\.?weight|đ\.?\s*tr[oọ]ng/i.test(cell))
      m.unitWeight = c;
    else if (m.remarks === undefined && /remarks.*ghi.*ch[uú]/i.test(cell)) m.remarks = c;
  }

  // Pass 2: Section markers (group headers — sub-header row sẽ có chi tiết offset)
  let netQuantityCol = -1;
  let totalOrderedCol = -1;
  let domSectionCol = -1; // VẬT TƯ TRONG NƯỚC
  let domPurchasedCol = -1; // ĐÃ MUA TRONG NƯỚC
  let domQCCol = -1; // QC Nghiệm thu (after DOM purchased)
  let impSectionCol = -1; // Mua sắm nước ngoài
  let impPurchasedCol = -1; // ĐÃ MUA NHẬP KHẨU
  let impQCCol = -1; // Nghiệm thu (after IMP purchased)
  let totalPurchasedCol = -1; // TỔNG ĐÃ MUA
  let diffCol = -1; // So sánh với PR
  let evalCol = -1; // Đánh giá (cuối)
  let remainCol = -1; // Tận dụng tồn kho
  let toBuyCol = -1; // Khối lượng phải mua sắm
  let materialHandoverCol = -1; // Ngày bàn giao vật tư

  for (let c = 0; c < headerRow.length; c++) {
    const cell = normalize(headerRow[c]);
    if (!cell) continue;
    if (/net.*quantity|s[oố].*l[uư][oợ]ng.*tinh/i.test(cell)) netQuantityCol = c;
    else if (/total.*ordered|t[oổ]ng.*d[uự].*tr[uù]/i.test(cell)) totalOrderedCol = c;
    else if (/^v[aậ]t.*t[uư].*trong.*n[uư][oớ]c/i.test(cell)) domSectionCol = c;
    else if (/đ[aã].*mua.*trong.*n[uư][oớ]c/i.test(cell)) domPurchasedCol = c;
    else if (/^qc.*nghi[eệ]m.*thu/i.test(cell) && domQCCol === -1) domQCCol = c;
    else if (/mua.*s[aắ]m.*n[uư][oớ]c.*ngo[aà]i|oversea.*purchase/i.test(cell)) impSectionCol = c;
    else if (/đ[aã].*mua.*nh[aậ]p.*kh[aẩ]u/i.test(cell)) impPurchasedCol = c;
    else if (/^nghi[eệ]m.*thu/i.test(cell) && impQCCol === -1 && c > impSectionCol) impQCCol = c;
    else if (/t[oổ]ng.*đ[aã].*mua/i.test(cell)) totalPurchasedCol = c;
    else if (/so.*s[aá]nh.*v[oớ]i.*s[oố].*l[uư][oợ]ng.*pr/i.test(cell)) diffCol = c;
    else if (/^đ[aá]nh.*gi[aá]/i.test(cell) && c > diffCol) evalCol = c;
    else if (/t[aậ]n.*d[uụ]ng.*t[oồ]n.*kho|^remain/i.test(cell)) remainCol = c;
    else if (/kh[oố]i.*l[uư][oợ]ng.*ph[aả]i.*mua|total.*order(?!ed)/i.test(cell)) toBuyCol = c;
    else if (/ng[aà]y.*b[aà]n.*giao.*v[aậ]t.*t[uư]|material.*available/i.test(cell))
      materialHandoverCol = c;
  }

  // Pass 3: Use sub-row to confirm sub-column positions within groups
  // Sub row có "Q.Ty/S.Lượng" + "Weight/K.Lượng (Kg)" pairs
  const subRowMap = subRow
    ? subRow.map((c) => normalize(c)).reduce((acc, val, i) => ({ ...acc, [i]: val }), {})
    : {};

  // Net Quantity: 2 cells (Q.Ty + Weight) right at netQuantityCol
  if (netQuantityCol >= 0) {
    m.netQty = netQuantityCol;
    m.netWeight = netQuantityCol + 1;
  }

  // Total Ordered: 2 cells
  if (totalOrderedCol >= 0) {
    m.totalOrderedQty = totalOrderedCol;
    m.totalOrderedWeight = totalOrderedCol + 1;
  }

  // Khối lượng phải mua sắm: 2 cells
  if (toBuyCol >= 0) {
    m.toBuyQty = toBuyCol;
    m.toBuyWeight = toBuyCol + 1;
  }

  // Material handover date: 1 cell
  if (materialHandoverCol >= 0) m.materialHandoverDate = materialHandoverCol;

  // Tận dụng tồn kho: 5 cells (Report No, Q.Ty, Weight, Date, Remarks) — 095 layout
  // Tuy nhiên có file chỉ 2 cells (Q.Ty + Weight). Detect bằng sub-row "Report No"
  if (remainCol >= 0) {
    const next = normalize(subRowMap[remainCol]);
    if (/^report/i.test(next)) {
      m.remainReportNo = remainCol;
      m.remainQty = remainCol + 1;
      m.remainWeight = remainCol + 2;
      m.remainAccDate = remainCol + 3;
      m.remainRemarks = remainCol + 4;
    } else {
      m.remainQty = remainCol;
      m.remainWeight = remainCol + 1;
    }
  }

  // ─── DOMESTIC contract block ───
  // Sub-header sequence: Số HĐ, Vendor, Profile, Grade, Contract weight, Date,
  //                      Handover Q'ty, Handover weight, Unit price, Total VAT,
  //                      VAT%, Total noVAT, Bàn giao sản xuất
  if (domSectionCol >= 0) {
    const dom = {};
    // Find each column by scanning sub-row from domSectionCol
    for (let c = domSectionCol; c < (domPurchasedCol > 0 ? domPurchasedCol : domSectionCol + 14); c++) {
      const cell = normalize(subRow[c] || '');
      if (!cell) continue;
      if (/s[oố].*h[oợ]p.*đ[oồ]ng|contract.*no/i.test(cell) && dom.contractNo === undefined)
        dom.contractNo = c;
      else if (/nh[aà].*cung.*c[aấ]p|vendor/i.test(cell) && dom.vendorName === undefined)
        dom.vendorName = c;
      else if (/^profile.*v[aậ]t.*t[uư]/i.test(cell) && dom.actualProfile === undefined)
        dom.actualProfile = c;
      else if (/grade.*m[aá]c.*v[aậ]t.*li[eệ]u/i.test(cell) && dom.actualGrade === undefined)
        dom.actualGrade = c;
      else if (/contract.*weight|k\.l[uư][oợ]ng.*theo.*hđ/i.test(cell) && dom.contractWeight === undefined)
        dom.contractWeight = c;
      else if (/ng[aà]y.*k[yý].*hđ|contract.*date/i.test(cell) && dom.contractDate === undefined)
        dom.contractDate = c;
      else if (/s.*l[uư][oợ]ng.*giao.*h[aà]ng.*th[uự]c.*t[eế]|handover.*q.*ty/i.test(cell) && dom.handoverQty === undefined)
        dom.handoverQty = c;
      else if (/k.*l[uư][oợ]ng.*giao.*h[aà]ng.*th[uự]c.*t[eế]|handover.*weight/i.test(cell) && dom.handoverWeight === undefined)
        dom.handoverWeight = c;
      else if (/đơn.*gi[aá].*unit.*price|unit.*price/i.test(cell) && dom.unitPrice === undefined)
        dom.unitPrice = c;
      else if (/t[oổ]ng.*ti[eề]n.*(c[aả]|bao.*g[oồ]m).*vat|vat.*\(/i.test(cell) && dom.totalWithVAT === undefined)
        dom.totalWithVAT = c;
      else if (/^vat$|^ti[eề]n.*vat|^%.*thu[eế]/i.test(cell) && dom.vatRate === undefined)
        dom.vatRate = c;
      else if (/t[oổ]ng.*ti[eề]n(?!.*c[aả]|.*bao)|t[oổ]ng.*ti[eề]n.*ch[uư]a/i.test(cell) && dom.totalNoVAT === undefined)
        dom.totalNoVAT = c;
      else if (/b[aà]n.*giao.*s[aả]n.*xu[aấ]t|handover.*to.*product/i.test(cell) && dom.handoverToProduct === undefined)
        dom.handoverToProduct = c;
    }
    m.dom = dom;
  }

  // ─── DOMESTIC purchased + QC ───
  if (domPurchasedCol >= 0) {
    m.domPurchasedQty = domPurchasedCol;
    m.domPurchasedWeight = domPurchasedCol + 1;
  }
  if (domQCCol >= 0) {
    // Sub-headers: Report No, Inspection date, Weight Acc, Results
    m.domQC = {
      reportNo: domQCCol,
      inspectionDate: domQCCol + 1,
      weightAccepted: domQCCol + 2,
      result: domQCCol + 3,
    };
  }

  // ─── IMPORT contract block ───
  if (impSectionCol >= 0) {
    const imp = {};
    const impEnd = impPurchasedCol > 0 ? impPurchasedCol : impSectionCol + 18;
    for (let c = impSectionCol; c < impEnd; c++) {
      const cell = normalize(subRow[c] || '');
      if (!cell) continue;
      if (/s[oố].*h[oợ]p.*đ[oồ]ng|contract.*no/i.test(cell) && imp.contractNo === undefined)
        imp.contractNo = c;
      else if (/nh[aà].*cung.*c[aấ]p|vendor/i.test(cell) && imp.vendorName === undefined)
        imp.vendorName = c;
      else if (/^profile.*v[aậ]t.*t[uư]/i.test(cell) && imp.actualProfile === undefined)
        imp.actualProfile = c;
      else if (/grade.*m[aá]c.*v[aậ]t.*li[eệ]u/i.test(cell) && imp.actualGrade === undefined)
        imp.actualGrade = c;
      else if (/^weight.*kh[oố]i.*l[uư][oợ]ng/i.test(cell) && imp.contractWeight === undefined)
        imp.contractWeight = c;
      else if (/ng[aà]y.*k[yý].*hđ|contract.*date/i.test(cell) && imp.contractDate === undefined)
        imp.contractDate = c;
      else if (/s[oố].*l[uư][oợ]ng.*giao.*h[aà]ng.*th[uự]c.*t[eế]|handover.*q.*ty/i.test(cell) && imp.handoverQty === undefined)
        imp.handoverQty = c;
      else if (/kh[oố]i.*l[uư][oợ]ng.*giao.*h[aà]ng.*th[uự]c.*t[eế]|handover/i.test(cell) && imp.handoverWeight === undefined)
        imp.handoverWeight = c;
      else if (/đơn.*gi[aá].*unit.*price|unit.*price/i.test(cell) && imp.unitPrice === undefined)
        imp.unitPrice = c;
      else if (/th[aà]nh.*ti[eề]n.*h[oợ]p.*đ[oồ]ng|total/i.test(cell) && imp.totalNoVAT === undefined)
        imp.totalNoVAT = c;
      else if (/ng[aà]y.*m[oở].*l\/?c|lc.*issued/i.test(cell) && imp.lcDate === undefined)
        imp.lcDate = c;
      else if (/h[aà]ng.*đi.*t[uừ].*c[aả]ng.*n[uư][oớ]c.*ngo[aà]i|export.*port/i.test(cell) && imp.exportPort === undefined)
        imp.exportPort = c;
      else if (/h[aà]ng.*đ[eế]n.*c[aả]ng|cif|haiphong/i.test(cell) && imp.cifDate === undefined)
        imp.cifDate = c;
      else if (/ng[aà]y.*thanh.*to[aá]n|payment.*date/i.test(cell) && imp.paymentDate === undefined)
        imp.paymentDate = c;
      else if (/th[uủ].*t[uụ]c.*h[aả]i.*quan|customs|paper.*work/i.test(cell) && imp.customsDate === undefined)
        imp.customsDate = c;
      else if (/ng[aà]y.*h[aà]ng.*v[eề]|arrived|arived/i.test(cell) && imp.arrivedDate === undefined)
        imp.arrivedDate = c;
      else if (/ng[aà]y.*m[oờ]i.*nghi[eệ]m.*thu|invice.*qc.*date|invoice.*qc/i.test(cell) && imp.qcInvitationDate === undefined)
        imp.qcInvitationDate = c;
      else if (/b[aà]n.*giao.*s[aả]n.*xu[aấ]t|handover.*to.*product/i.test(cell) && imp.handoverToProduct === undefined)
        imp.handoverToProduct = c;
    }
    m.imp = imp;
  }

  // ─── IMPORT purchased + QC ───
  if (impPurchasedCol >= 0) {
    m.impPurchasedQty = impPurchasedCol;
    m.impPurchasedWeight = impPurchasedCol + 1;
  }
  if (impQCCol >= 0) {
    m.impQC = {
      reportNo: impQCCol,
      inspectionDate: impQCCol + 1,
      weightAccepted: impQCCol + 2,
      result: impQCCol + 3,
    };
  }

  // Tổng / Diff / Evaluation
  if (totalPurchasedCol >= 0) {
    m.totalPurchasedQty = totalPurchasedCol;
    m.totalPurchasedWeight = totalPurchasedCol + 1;
  }
  if (diffCol >= 0) {
    m.diffQty = diffCol;
    m.diffWeight = diffCol + 1;
  }
  if (evalCol >= 0) m.evaluation = evalCol;

  return m;
}

// ─── PARSER ──────────────────────────────────────────────────────────────────

/**
 * Tìm sheet master tracking trong workbook
 */
function findMasterSheet(wb) {
  // 1. Tên sheet match pattern dự án (vd: 25-BRA-I-090)
  for (const name of wb.SheetNames) {
    if (/^\d{2}-[A-Z]{3,4}-[A-Z]-?\d{2,3}/i.test(name)) return name;
  }
  // 2. Tên sheet là 3 chữ số (vd: '078', '090')
  for (const name of wb.SheetNames) {
    if (/^0?\d{2,3}$/i.test(name)) {
      const ws = wb.Sheets[name];
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      if (range.e.c >= 80) return name;
    }
  }
  // 3. Sheet có nhiều cột nhất (>= 80) chứa "TRONG NƯỚC" / "NHẬP KHẨU"
  let best = null;
  let maxCols = 0;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const cols = range.e.c + 1;
    if (cols < 80 || cols < maxCols) continue;
    // Check if contains key markers
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const text = JSON.stringify(raw.slice(0, 6)).toLowerCase();
    if (text.includes('trong nước') || text.includes('nhập khẩu')) {
      best = name;
      maxCols = cols;
    }
  }
  return best;
}

/**
 * Parse file Excel buffer → cấu trúc updates
 */
function parseProcurementUpdate(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const sheetName = findMasterSheet(wb);
  if (!sheetName) {
    throw new Error(
      `Không tìm thấy sheet master tracking. Sheets có sẵn: ${wb.SheetNames.slice(0, 10).join(', ')}${wb.SheetNames.length > 10 ? '...' : ''}`
    );
  }

  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Find header row
  const headerRowIdx = findHeaderRow(raw);
  if (headerRowIdx === -1) {
    throw new Error(`Sheet "${sheetName}" không có header row chứa "Item/STT".`);
  }

  const headerRow = raw[headerRowIdx];
  const subRow = raw[headerRowIdx + 1] || [];
  const colMap = buildColumnMap(headerRow, subRow);

  if (colMap.itemCode === undefined) {
    throw new Error(
      `Không xác định được vị trí cột "Item/STT" trong sheet "${sheetName}". Header row: ${headerRowIdx + 1}`
    );
  }

  // Data starts after header (skip header + sub-header + col-index row)
  // Most files: header @ row 4 → data @ row 7-8
  let dataStart = headerRowIdx + 2;
  // Skip rows that look like sub-header (contain "Q.Ty", "Weight", numbers only)
  for (let i = dataStart; i < Math.min(dataStart + 5, raw.length); i++) {
    const row = raw[i];
    if (!row) continue;
    const itemCell = toStr(row[colMap.itemCode]);
    if (!itemCell) {
      dataStart = i + 1;
      continue;
    }
    // Skip if it's a number index row (1, 2, 3...) — kiểm tra cả row toàn số nguyên liên tiếp
    const allInts = row.filter((c) => c !== null && c !== undefined && c !== '').every((c) => Number.isInteger(+c));
    if (allInts && !isNaN(+itemCell) && +itemCell <= 200) {
      dataStart = i + 1;
      continue;
    }
    // Skip Total / group rows
    if (/^total$|^t[oổ]ng/i.test(itemCell)) {
      dataStart = i + 1;
      continue;
    }
    break;
  }

  const updates = [];

  for (let r = dataStart; r < raw.length; r++) {
    const row = raw[r];
    if (!row || row.length === 0) continue;

    const get = (c) => (c !== undefined && c >= 0 ? row[c] : undefined);
    const itemCode = toStr(get(colMap.itemCode));
    if (!itemCode) continue;

    // Skip noise/headers
    if (itemCode.length < 3 || itemCode.length > 60) continue;
    if (/^[a-z]{1,3}\.?$/i.test(itemCode)) continue; // Group letters: A. B. I.
    if (/^(VTC|VPK|VDK|VBP|VTH|VTS|VTP)\d{0,2}$/i.test(itemCode)) continue;
    if (/^\d+$/.test(itemCode)) continue;
    if (/^(item|stt|description|chi.*ti[eế]t|mô.*t[aả]|total|t[oổ]ng|remarks|priority|critical|name|position|signature|date)/i.test(itemCode))
      continue;

    const itemName = toStr(get(colMap.itemName));
    if (!itemName) continue;

    // ─── Item info ───
    const itemInfo = {
      itemCode,
      itemName,
      profile: toStr(get(colMap.profile)),
      grade: toStr(get(colMap.grade)),
      uom: toStr(get(colMap.unit)) || 'kg',
      unitWeight: toNum(get(colMap.unitWeight)),
      netQty: toNum(get(colMap.netQty)),
      netWeight: toNum(get(colMap.netWeight)),
      reqQty: toNum(get(colMap.totalOrderedQty)) || toNum(get(colMap.netQty)),
      reqWeight: toNum(get(colMap.totalOrderedWeight)) || toNum(get(colMap.netWeight)),
    };

    // ─── PrDetail update fields ───
    const update = {
      remainQty: toNum(get(colMap.remainQty)),
      remainWeight: toNum(get(colMap.remainWeight)),
      toBuyQty: toNum(get(colMap.toBuyQty)),
      toBuyWeight: toNum(get(colMap.toBuyWeight)),
      requiredDate: toDate(get(colMap.materialHandoverDate)),
      remarks: toStr(get(colMap.remarks)) || null,
    };

    // ─── DOMESTIC contract ───
    const contracts = [];
    const inspections = [];
    let domContractNo = null;
    let domHandoverProdDate = null;

    if (colMap.dom && colMap.dom.contractNo !== undefined) {
      domContractNo = toStr(get(colMap.dom.contractNo));
      if (domContractNo) {
        domHandoverProdDate = toDate(get(colMap.dom.handoverToProduct));
        contracts.push({
          contractType: 'DOMESTIC',
          contractNo: domContractNo,
          vendorName: toStr(get(colMap.dom.vendorName)) || null,
          actualProfile: toStr(get(colMap.dom.actualProfile)) || null,
          actualGrade: toStr(get(colMap.dom.actualGrade)) || null,
          contractQty: toNum(get(colMap.dom.handoverQty)),
          contractWeight: toNum(get(colMap.dom.contractWeight)),
          contractDate: toDate(get(colMap.dom.contractDate)),
          unitPriceNoVAT: toNum(get(colMap.dom.unitPrice)),
          currency: 'VND',
          vatRate: toNum(get(colMap.dom.vatRate)) || 10,
          totalNoVAT: toNum(get(colMap.dom.totalNoVAT)),
          totalWithVAT: toNum(get(colMap.dom.totalWithVAT)),
          deliveredQty: toNum(get(colMap.dom.handoverQty)),
          deliveredWeight: toNum(get(colMap.dom.handoverWeight)),
          handoverToProductDate: domHandoverProdDate,
          status: domHandoverProdDate ? 'COMPLETED' : 'ORDERED',
        });
      }
    }

    // DOM purchased + QC inspection
    if (colMap.domQC && colMap.domQC.reportNo !== undefined) {
      const reportNo = toStr(get(colMap.domQC.reportNo));
      const insDate = toDate(get(colMap.domQC.inspectionDate));
      const weightAcc = toNum(get(colMap.domQC.weightAccepted));
      const result = toStr(get(colMap.domQC.result));
      if (reportNo || insDate || weightAcc || result) {
        inspections.push({
          contractType: 'DOMESTIC',
          // Match với contract DOMESTIC vừa thêm (sẽ bind sau khi insert contract)
          inspectionType: 'DOMESTIC',
          reportNo: reportNo || null,
          inspectionDate: insDate,
          inspectedQty: toNum(get(colMap.domPurchasedQty)),
          inspectedWeight: toNum(get(colMap.domPurchasedWeight)),
          acceptedQty: toNum(get(colMap.domPurchasedQty)),
          acceptedWeight: weightAcc,
          result: result || null,
        });
      }
    }

    // ─── IMPORT contract ───
    let impContractNo = null;
    let impHandoverProdDate = null;
    let impArrivedDate = null;

    if (colMap.imp && colMap.imp.contractNo !== undefined) {
      impContractNo = toStr(get(colMap.imp.contractNo));
      if (impContractNo) {
        impHandoverProdDate = toDate(get(colMap.imp.handoverToProduct));
        impArrivedDate = toDate(get(colMap.imp.arrivedDate));
        contracts.push({
          contractType: 'IMPORT',
          contractNo: impContractNo,
          vendorName: toStr(get(colMap.imp.vendorName)) || null,
          vendorCountry: toStr(get(colMap.imp.exportPort)) || null,
          actualProfile: toStr(get(colMap.imp.actualProfile)) || null,
          actualGrade: toStr(get(colMap.imp.actualGrade)) || null,
          contractQty: toNum(get(colMap.imp.handoverQty)),
          contractWeight: toNum(get(colMap.imp.contractWeight)),
          contractDate: toDate(get(colMap.imp.contractDate)),
          unitPriceNoVAT: toNum(get(colMap.imp.unitPrice)),
          currency: 'USD',
          totalNoVAT: toNum(get(colMap.imp.totalNoVAT)),
          totalWithVAT: toNum(get(colMap.imp.totalNoVAT)), // Imp file thường không tách VAT
          deliveredQty: toNum(get(colMap.imp.handoverQty)),
          deliveredWeight: toNum(get(colMap.imp.handoverWeight)),
          importLCDate: toDate(get(colMap.imp.lcDate)),
          exportPort: toStr(get(colMap.imp.exportPort)) || null,
          cifDate: toDate(get(colMap.imp.cifDate)),
          paymentDate: toDate(get(colMap.imp.paymentDate)),
          customsDate: toDate(get(colMap.imp.customsDate)),
          arrivedDate: impArrivedDate,
          qcInvitationDate: toDate(get(colMap.imp.qcInvitationDate)),
          handoverToProductDate: impHandoverProdDate,
          status: impHandoverProdDate ? 'COMPLETED' : impArrivedDate ? 'PARTIAL_DELIVERY' : 'ORDERED',
        });
      }
    }

    // IMP purchased + QC inspection
    if (colMap.impQC && colMap.impQC.reportNo !== undefined) {
      const reportNo = toStr(get(colMap.impQC.reportNo));
      const insDate = toDate(get(colMap.impQC.inspectionDate));
      const weightAcc = toNum(get(colMap.impQC.weightAccepted));
      const result = toStr(get(colMap.impQC.result));
      if (reportNo || insDate || weightAcc || result) {
        inspections.push({
          contractType: 'IMPORT',
          inspectionType: 'IMPORT',
          reportNo: reportNo || null,
          inspectionDate: insDate,
          inspectedQty: toNum(get(colMap.impPurchasedQty)),
          inspectedWeight: toNum(get(colMap.impPurchasedWeight)),
          acceptedQty: toNum(get(colMap.impPurchasedQty)),
          acceptedWeight: weightAcc,
          result: result || null,
        });
      }
    }

    // ─── Status flag inference ───
    const totalPurchasedQty = toNum(get(colMap.totalPurchasedQty));
    update.statusFlag = inferStatusFlag({
      domContractNo,
      impContractNo,
      domQCResult: colMap.domQC ? toStr(get(colMap.domQC.result)) : '',
      impQCResult: colMap.impQC ? toStr(get(colMap.impQC.result)) : '',
      domHandoverProdDate,
      impHandoverProdDate,
      totalPurchasedQty,
      reqQty: itemInfo.reqQty,
      arrivedDate: impArrivedDate,
    });

    // Đánh giá → materialStatus (lưu vào remarks vì schema không có materialStatus enum)
    const evalText = colMap.evaluation !== undefined ? mapEvaluation(get(colMap.evaluation)) : null;
    if (evalText && !update.remarks) update.remarks = `Đánh giá: ${evalText}`;

    // Clean update fields (remove null/0/empty)
    const cleanUpdate = {};
    for (const [k, v] of Object.entries(update)) {
      if (v === null || v === undefined) continue;
      if (typeof v === 'number' && v === 0) continue;
      if (typeof v === 'string' && !v) continue;
      cleanUpdate[k] = v;
    }

    updates.push({
      itemCode,
      itemInfo,
      update: cleanUpdate,
      contracts,
      inspections,
    });
  }

  return {
    sheetName,
    format: 'master-tracking-v2',
    rowsParsed: updates.length,
    columnMap: colMap,
    updates,
  };
}

module.exports = {
  parseProcurementUpdate,
  buildColumnMap,
  findHeaderRow,
  findMasterSheet,
};
