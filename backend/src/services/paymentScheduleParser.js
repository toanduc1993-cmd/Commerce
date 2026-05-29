/**
 * paymentScheduleParser.js — Parse sheet "Kế hoạch thanh toán"
 *
 * Format:
 *   Row 1: Header (STT, SUPPLIER, SALE CONTRACT, Dự án, VALUE, PAYMENTS,
 *          SIGN DATE, L/C, ETD, ETA, DOCUMENT, Kế hoạch thanh toán,
 *          Deadline of L/C, Note)
 *   Row 2+: Data rows
 *   Footer rows: tổng số tiền cần thanh toán trong tháng X
 */

const XLSX = require('xlsx');

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function toNum(v) {
  if (v === null || v === undefined || v === '' || v === 'N/A' || v === '#N/A') return 0;
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
  if (typeof v === 'string' && (v === 'N/A' || v.trim() === '')) return null;
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

function isPaymentSheet(ws) {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (raw.length < 2) return false;
  // Check row 1 contains key headers
  const r1 = (raw[0] || []).map((c) => norm(c)).join(' ');
  return (
    (r1.includes('supplier') || r1.includes('sale contract')) &&
    (r1.includes('payment') || r1.includes('etd') || r1.includes('eta'))
  );
}

function findPaymentSheet(wb) {
  // Tên thông dụng
  const knownNames = ['kế hoạch thanh toán', 'kế hoạch tt', 'payment schedule', 'thanh toán'];
  for (const name of wb.SheetNames) {
    const lower = norm(name);
    if (knownNames.some((k) => lower.includes(k))) return name;
  }
  // Detect by content
  for (const name of wb.SheetNames) {
    if (isPaymentSheet(wb.Sheets[name])) return name;
  }
  return null;
}

// ─── PARSER ──────────────────────────────────────────────────────────────────

function parsePaymentSchedule(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = findPaymentSheet(wb);
  if (!sheetName) {
    return { sheetName: null, parsed: 0, schedules: [] };
  }

  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Header at row 0
  const header = raw[0] || [];
  const colMap = {};
  for (let c = 0; c < header.length; c++) {
    const cell = norm(header[c]);
    if (!cell) continue;
    if (cell === 'stt' || cell === 'no.') colMap.stt = c;
    else if (cell === 'supplier' || cell.includes('nhà cung cấp')) colMap.supplier = c;
    else if (cell.includes('sale contract') || cell.includes('số hợp đồng')) colMap.saleContract = c;
    else if (cell === 'dự án' || cell === 'project') colMap.projectCode = c;
    else if (cell.includes('value') || cell.includes('giá trị')) colMap.value = c;
    else if (cell === 'payments' || cell === 'payment' || cell.includes('phương thức'))
      colMap.paymentMethod = c;
    else if (cell.includes('sign date') || cell === 'ngày ký') colMap.signDate = c;
    else if (cell === 'l/c' || cell === 'lc' || (cell.includes('l/c') && !cell.includes('deadline')))
      colMap.lcDate = c;
    else if (cell === 'etd' || cell.includes('etd')) colMap.etd = c;
    else if (cell === 'eta' || cell.includes('eta')) colMap.eta = c;
    else if (cell === 'document' || cell.includes('chứng từ')) colMap.documentDate = c;
    else if (cell.includes('kế hoạch thanh toán') || cell.includes('tháng thanh toán'))
      colMap.paymentMonth = c;
    else if (cell.includes('deadline')) colMap.lcDeadline = c;
    else if (cell === 'note' || cell === 'notet' || cell.includes('ghi chú')) colMap.notes = c;
  }

  if (colMap.supplier === undefined) {
    return { sheetName, parsed: 0, schedules: [], error: 'Không tìm thấy cột Supplier' };
  }

  // Data rows từ row 1
  const schedules = [];
  for (let r = 1; r < raw.length; r++) {
    const row = raw[r];
    if (!row) continue;
    const supplier = toStr(row[colMap.supplier]);
    if (!supplier) continue;
    // Skip footer rows (chỉ có total amount, không có supplier name)
    if (
      /tổng|sum|total|đơn nhập khẩu/i.test(supplier) ||
      /số tiền cần thanh toán/i.test(supplier)
    )
      continue;

    schedules.push({
      rowOrder: r,
      stt: toStr(row[colMap.stt]) || String(r),
      supplier,
      saleContract: toStr(row[colMap.saleContract]) || null,
      projectCode: toStr(row[colMap.projectCode]) || null,
      value: toNum(row[colMap.value]),
      currency: 'USD', // CIF Hải Phòng → mặc định USD; có thể detect từ value
      paymentMethod: toStr(row[colMap.paymentMethod]) || null,
      signDate: toDate(row[colMap.signDate]),
      lcDate: toDate(row[colMap.lcDate]),
      etd: toDate(row[colMap.etd]),
      eta: toDate(row[colMap.eta]),
      documentDate: toDate(row[colMap.documentDate]),
      paymentMonth: toStr(row[colMap.paymentMonth]) || null,
      lcDeadline: toDate(row[colMap.lcDeadline]),
      notes: toStr(row[colMap.notes]) || null,
    });
  }

  return {
    sheetName,
    parsed: schedules.length,
    schedules,
  };
}

module.exports = {
  parsePaymentSchedule,
  findPaymentSheet,
};
