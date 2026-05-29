// ══════════════════════════════════════════════════════════════════════════════
// PR ROW VALIDATOR — Gate 1 filter
// Kiểm tra từng row đã parse, lọc bỏ header/footer/total/noise
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Chuyển giá trị có thể là text/dashes thành số
 */
function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v)
    .replace(/,/g, '.')
    .replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/**
 * Gate 1 — dùng field _* từ universal parser
 * Trả về: { skip: true } | { valid: true, normalized: {...} } | { row_number, status, errors }
 */
function validateRow(row, index) {
  let itemCode = String(row._itemCode || '').trim();
  let itemName = String(row._itemName || '').trim();

  // Bỏ qua dòng trống
  if (!itemCode && !itemName) return { skip: true };

  // ─── Trường hợp đặc biệt: CSV cấu trúc IBSHI ───
  // Item col = số thứ tự (1,2,3...) và tên vật tư ở Description col
  // → Dùng Description làm itemCode nếu Description trông như mã vật tư
  // VD: "1" | "VTT.CSON.050 - Chổi sơn 5cm" → itemCode = "VTT.CSON.050", itemName = "Chổi sơn 5cm"
  if (/^\d+$/.test(itemCode) && itemName) {
    const dashSplit = itemName.match(/^([A-Z0-9][A-Z0-9._\-]+)\s*[-–]\s*(.+)$/i);
    if (dashSplit) {
      itemCode = dashSplit[1].trim();
      itemName = dashSplit[2].trim();
    } else if (itemName.length <= 40) {
      // Chỉ fallback nếu description đủ ngắn để làm mã
      itemCode = itemName;
    } else {
      // Description quá dài → không phải item code, skip
      return { skip: true };
    }
  }

  if (!itemCode) return { skip: true };

  // Bỏ qua dòng header lọt qua, footer, tổng cộng, signature block
  if (/^(item|stt|mã|no\.?|\/length)$/i.test(itemCode)) return { skip: true };
  if (/^(description|chi tiết|mô tả|content|quy cách)$/i.test(itemCode)) return { skip: true };
  if (
    /^(project budget|ngân sách|tổng cộng|grand total|chữ ký|người lập|tổng)/i.test(itemCode)
  )
    return { skip: true };

  // Footer keywords của mẫu PR: REMARKS, PRIORITY, CRITICAL, ASSIGN COST, PURPOSE, signature block
  if (
    /^(remarks|priority|critical|assign\s*cost|for\s*in-house|purpose|lost\/damaged|spares|consumables|req'?d\s*as|name\b|position\b|signature\b|date\b|tên\b|vị\s*trí|ngày\b)/i.test(
      itemCode
    )
  )
    return { skip: true };

  // Bỏ qua dòng số thứ tự thuần tuý (1,2,3...) còn sót
  if (/^\d+$/.test(itemCode)) return { skip: true };

  // ─── LỌC NOISE DÀI ────────────────────────────────────────────────────
  // Mã vật tư hợp lệ tối đa ~40 chars (VD: "I95-VTC01-031", "A.01", "PL10x2000X12000")
  // Bất cứ text nào dài hơn 60 chars không phải mã vật tư → skip
  // (thường là ghi chú cảnh báo, remarks, mô tả kỹ thuật)
  if (itemCode.length > 60) return { skip: true };

  // Bỏ qua nếu chứa câu văn tiếng Việt đặc trưng (ghi chú cảnh báo)
  const noisePhrases =
    /vật liệu|chỉ số|yêu cầu|nguồn gốc|đề nghị|thông báo|không được|báo cáo test|chuyển đổi|tồn kho/i;
  if (noisePhrases.test(itemCode)) return { skip: true };

  // Bỏ qua ghi chú dài không có số
  if (itemCode.length > 50 && !/[0-9]/.test(itemCode)) return { skip: true };

  // Bỏ qua sub-group header (VTC01 / VPK / VDK / VTC02 ... là group code không phải item)
  // Các group code luôn match pattern "^(VTC|VPK|VDK|VBP|VTH|VTS|VTP)\d{0,2}$"
  // VD: "VTC01", "VPK", "VDK02" → skip
  // Item code thật có format khác: "I95-VTC01-001", "A.01", "I90-B-044"
  if (/^(VTC|VPK|VDK|VBP|VTH|VTS|VTP)\d{0,2}$/i.test(itemCode)) return { skip: true };
  if (/^[A-Z]{1,3}\.?$/.test(itemCode) && !row._qty1 && !row._qty2 && !row._unitWeight)
    return { skip: true };

  // Bỏ qua dòng đánh số cột (merged-cell side effect)
  if (/^[1-9]$/.test(itemCode) && /^\d+$/.test(itemName)) return { skip: true };

  // Chỉ từ chối khi KHÔNG có tên vật tư
  if (!itemName) {
    if (itemCode.length > 5) {
      itemName = itemCode;
    } else {
      return {
        row_number: index + 2,
        status: 'Lỗi Format',
        errors: [`[Item ${itemCode}] Thiếu mô tả / chi tiết vật tư`],
      };
    }
  }

  return {
    valid: true,
    normalized: {
      itemCode,
      itemName,
      profile: String(row._profile || '').trim(),
      grade: String(row._grade || '').trim(),
      uom: String(row._uom || 'kg').trim() || 'kg',
      unitWeight: String(row._unitWeight || ''),
      netQty: String(row._qty1 || ''),
      reqQty: String(row._qty2 || ''),
    },
  };
}

module.exports = {
  validateRow,
  toNum,
};
