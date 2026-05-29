const XLSX = require('xlsx');

// ══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL FILE PARSER — hỗ trợ nhiều định dạng PR thực tế
// Chiến lược: index-based mapping thay vì header-name matching
// Lý do: Mỗi phòng ban dùng tên cột khác nhau; chỉ có vị trí cột là ổn định
// ══════════════════════════════════════════════════════════════════════════════

// Patterns nhận diện từng loại cột — order ưu tiên
const PATTERNS = {
  itemCode: [
    /^item$/i,
    /^stt$/i,
    /item\s*\/\s*stt/i,
    /^m[aã]\s*(v[aậ]t\s*t[uư]|vật liệu)?$/i,
    /^no\.?$/i,
  ],
  itemName: [/description/i, /chi\s*ti[eế]t/i, /m[oô]\s*t[aả]/i, /quy\s*c[aá]ch/i, /content/i],
  profile: [/profile/i, /v[aậ]t\s*t[uư]/i, /size/i, /specification/i],
  grade: [/grade/i, /m[aá]c/i, /material\s*grade/i],
  uom: [/unit(?!\s*weight)/i, /[đd][oơ]n\s*v[iị]/i, /uom/i, /\bunit\b/i],
  unitWeight: [
    /unit\s*weight/i,
    /[đd]\.\s*tr[oọ]ng/i,
    /u\.weight/i,
    /kg\s*\/\s*m/i,
    /weight\s*\(/i,
  ],
  qty1: [
    /net\s*quantity/i,
    /s[oố]\s*l[uư][oợ]ng\s*tinh/i,
    /initial\s*approved/i,
    /balance/i,
    /q'?ty/i,
    /s[oố]\s*l[uư][oợ]ng\s*\(/i,
  ],
  qty2: [/current\s*ordered/i, /previous\s*ordered/i, /d[uự]\s*tr[uù]/i],
};

/**
 * Tìm row đầu tiên trong mảng raw có ít nhất 1 ô khớp pattern "header dữ liệu"
 * Trả về { rowIndex, colMap, headerRow } hoặc null
 */
function detectHeaderAndCols(raw) {
  const scoreRow = (row) => {
    const norm = row.map((c) => String(c || '').trim());
    let score = 0;
    if (norm.some((c) => PATTERNS.itemCode.some((p) => p.test(c)))) score += 3;
    if (norm.some((c) => PATTERNS.itemName.some((p) => p.test(c)))) score += 3;
    if (norm.some((c) => PATTERNS.uom.some((p) => p.test(c)))) score += 1;
    if (norm.some((c) => PATTERNS.qty1.some((p) => p.test(c)))) score += 1;
    return score;
  };

  let bestRowIdx = -1,
    bestScore = 3;
  for (let i = 0; i < Math.min(25, raw.length); i++) {
    const s = scoreRow(raw[i]);
    if (s > bestScore) {
      bestScore = s;
      bestRowIdx = i;
    }
  }
  if (bestRowIdx === -1) return null;

  // Merge header rows nếu có sub-header ngay sau (CSV bị wrap)
  const headerRow = [...raw[bestRowIdx]];
  if (bestRowIdx + 1 < raw.length) {
    const nextRow = raw[bestRowIdx + 1];
    const nextHasText = nextRow.filter((c) => c && String(c).trim()).length >= 2;
    if (nextHasText) {
      nextRow.forEach((c, i) => {
        if (c && String(c).trim() && !headerRow[i]) {
          headerRow[i] = c;
        }
      });
    }
  }

  const colMap = {};
  headerRow.forEach((cell, idx) => {
    const s = String(cell || '')
      .replace(/[\r\n]+/g, ' ')
      .trim();
    if (!s) return;
    for (const [key, patterns] of Object.entries(PATTERNS)) {
      if (colMap[key] !== undefined) continue;
      if (patterns.some((p) => p.test(s))) {
        colMap[key] = idx;
      }
    }
  });

  return { rowIndex: bestRowIdx, colMap, headerRow };
}

/**
 * Đọc 1 sheet raw (mảng 2D) → mảng object chuẩn hoá với field _itemCode, _itemName, ...
 */
function parseSheetRaw(raw, headerInfo) {
  const { rowIndex, colMap } = headerInfo;
  const result = [];

  // Tìm điểm bắt đầu data — bỏ qua sub-header rows ngay sau header
  let dataStart = rowIndex + 1;
  for (let i = rowIndex + 1; i < Math.min(rowIndex + 5, raw.length); i++) {
    const row = raw[i];
    const itemCell = String(row[colMap.itemCode] ?? '').trim();
    const isSubHeader =
      !itemCell ||
      /^(s[oố]\s*l|q'?ty|weight|số lượng|khối lượng|trọng lượng|ph[aạ]m\s*vi)/i.test(itemCell) ||
      (row.filter((c) => c !== '' && c != null).every((c) => Number.isInteger(+c) && +c > 0) &&
        +row.filter((c) => c !== '')[0] === 1);
    if (isSubHeader) {
      dataStart = i + 1;
    } else {
      break;
    }
  }

  for (let i = dataStart; i < raw.length; i++) {
    const row = raw[i];
    if (row.every((c) => c === '' || c == null)) continue;

    const get = (key) => {
      if (colMap[key] === undefined) return '';
      return String(row[colMap[key]] ?? '').trim();
    };

    const itemCode = get('itemCode');
    const itemName = get('itemName');

    // Bỏ qua dòng footer / chữ ký / tổng cộng
    if (
      /^(requested|reviewed|approved|name:|position:|signature:|date:|tổng\s*cộng|grand\s*total|người\s*lập)/i.test(
        itemCode
      ) ||
      /^(requested|reviewed|approved|name:|position:|signature:|date:|tổng\s*cộng|grand\s*total|người\s*lập)/i.test(
        itemName
      )
    )
      continue;

    result.push({
      _itemCode: itemCode,
      _itemName: itemName,
      _profile: get('profile'),
      _grade: get('grade'),
      _uom: get('uom'),
      _unitWeight: get('unitWeight'),
      _qty1: get('qty1'),
      _qty2: get('qty2'),
    });
  }
  return result;
}

/**
 * Tìm sheet tốt nhất trong workbook (có nhiều data nhất sau khi parse)
 */
function findBestSheet(wb) {
  let best = { name: wb.SheetNames[0], count: 0, info: null };
  for (const name of wb.SheetNames) {
    if (
      name.startsWith('~') ||
      name.toLowerCase().includes('tổng hợp') ||
      name.toLowerCase().includes('tonghop') ||
      name.toLowerCase() === 'sheet1'
    )
      continue;
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const info = detectHeaderAndCols(raw);
    if (!info) continue;
    const rows = parseSheetRaw(raw, info);
    const valid = rows.filter((r) => r._itemCode && r._itemName).length;
    if (valid > best.count) {
      best = { name, count: valid, info, raw };
    }
  }
  return best;
}

/**
 * Parse CSV với auto-detect delimiter và xử lý header phân mảnh
 */
function parseCSVFlex(buffer) {
  // Detect encoding
  let text;
  const bom = buffer.slice(0, 3);
  if (bom[0] === 0xef && bom[1] === 0xbb && bom[2] === 0xbf) {
    text = buffer.slice(3).toString('utf8');
  } else {
    try {
      text = buffer.toString('utf8');
      if (text.includes('\uFFFD')) throw new Error();
    } catch (_) {
      text = buffer.toString('latin1');
    }
  }

  // Detect delimiter: ';' or ',' or '\t'
  const firstLines = text.split('\n').slice(0, 5).join('\n');
  const countSemi = (firstLines.match(/;/g) || []).length;
  const countComma = (firstLines.match(/,/g) || []).length;
  const countTab = (firstLines.match(/\t/g) || []).length;
  const delim =
    countSemi >= countComma && countSemi >= countTab ? ';' : countTab >= countComma ? '\t' : ',';

  // Parse thô: split dòng + split cột (handle quoted fields)
  const lines = text.split(/\r?\n/);
  const raw = lines.map((line) => {
    const cols = [];
    let inQuote = false,
      cur = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === delim && !inQuote) {
        cols.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur);
    return cols;
  });

  return raw;
}

/**
 * Main parse entry point — parse XLSX hoặc CSV buffer thành mảng row chuẩn hoá
 */
async function parseFileBuffer(buffer, originalname = '') {
  const isXLSX = originalname.match(/\.(xlsx|xls)$/i) || (buffer[0] === 0x50 && buffer[1] === 0x4b);

  let rows;

  if (isXLSX) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const best = findBestSheet(wb);

    if (!best.info) {
      // Fallback: đọc sheet 0 thông thường
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawFallback = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const infoFallback = detectHeaderAndCols(rawFallback);
      if (!infoFallback) return [];
      rows = parseSheetRaw(rawFallback, infoFallback);
    } else {
      rows = parseSheetRaw(best.raw, best.info);
    }
  } else {
    const raw = parseCSVFlex(buffer);
    const info = detectHeaderAndCols(raw);
    if (!info) return [];
    rows = parseSheetRaw(raw, info);
  }

  return rows;
}

module.exports = {
  parseFileBuffer,
  detectHeaderAndCols,
  parseSheetRaw,
  findBestSheet,
  parseCSVFlex,
};
