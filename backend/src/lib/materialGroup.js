// Suy ra mã nhóm vật tư cho 1 dòng BID — dùng cho chế độ chọn thầu PER_GROUP.
//
// Vì sao cần: BidQuoteItem KHÔNG có khoá ngoại sang Material nên không đọc thẳng
// được materialSubGroupCode. Quy ước mã vật tư của phòng đặt mã nhóm ở token giữa:
//   I95-VTC01-12  → VTC01 (thép carbon)
//   I95-VPK-019   → VPK   (bu lông, đai ốc)
// Đối chiếu 2.188 dòng thực tế: VPK 546 · VTC01 406 · VDK 261 · VTC04 139 · VTC02 58 · VTC03 18.
//
// ⚠️ Đây là suy luận từ mã, KHÔNG phải quan hệ dữ liệu thật. Hướng lâu dài vẫn là
// nối BidQuoteItem → Material.materialSubGroupCode (mục P2-6 trong báo cáo rà soát 13/08).

const MA_NHOM = /^V[A-Z]{2}\d{0,2}$/; // VPK · VTC01 · VDK03 …
const KHAC = 'KHAC';

/**
 * @param {{itemCode?: string|null, grade?: string|null}} item
 * @returns {string} mã nhóm, hoặc 'KHAC' nếu không suy được
 */
function groupCodeOf(item) {
  const code = (item?.itemCode || '').trim().toUpperCase();
  if (code) {
    const token = code.split('-')[1];
    if (token && MA_NHOM.test(token)) return token;
  }
  // Không có mã nhóm trong mã vật tư → gom theo mác thép để vẫn chia được lô
  const grade = (item?.grade || '').trim().toUpperCase();
  if (grade) return `MAC:${grade}`;
  return KHAC;
}

/** Nhãn hiển thị cho người dùng. */
function groupLabel(groupCode) {
  if (!groupCode || groupCode === KHAC) return 'Chưa phân nhóm';
  if (groupCode.startsWith('MAC:')) return `Mác ${groupCode.slice(4)}`;
  return groupCode;
}

module.exports = { groupCodeOf, groupLabel, KHAC };
