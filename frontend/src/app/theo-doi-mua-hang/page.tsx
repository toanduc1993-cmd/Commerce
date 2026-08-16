'use client';

// Module Theo dõi mua hàng — tách khỏi /mua-hang ngày 15/08/2026.
// Đợt 1: dùng chung thân với trang Yêu cầu mua, chỉ khoá cứng ở bảng theo dõi.
// Đợt 2 sẽ gỡ các cột thuộc bên yêu cầu ra khỏi bảng này.
import { TrangVatTu } from '@/components/mua-hang/TrangVatTu';

export default function TrangTheoDoiMuaHang() {
  return <TrangVatTu khoaCheDo="workflow" />;
}
