'use client';

// Module 1a — Yêu cầu mua hàng (PR).
// Thân nằm ở components/mua-hang/TrangVatTu.tsx, dùng chung với /theo-doi-mua-hang.
import { TrangVatTu } from '@/components/mua-hang/TrangVatTu';

export default function TrangYeuCauMua() {
  // Đợt 2 tách module, 15/08/2026 — khoá về bảng chi tiết PR.
  // Bảng theo dõi (hợp đồng, đã mua, QC, so sánh) đã chuyển hẳn sang
  // /theo-doi-mua-hang. Màn này chỉ còn danh mục hàng hoá theo PR.
  return <TrangVatTu khoaCheDo="detail" />;
}
