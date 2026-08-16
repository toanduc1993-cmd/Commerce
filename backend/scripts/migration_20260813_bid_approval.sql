-- Migration 13/08/2026 — dấu vết phê duyệt cấp dòng + ràng buộc vendorOrder duy nhất.
-- Sinh bằng: npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
-- ĐÃ BỎ THỦ CÔNG câu `DROP TABLE "_backup_BidQuoteVendor_order_20260813"` mà diff đề xuất —
-- đó là bảng sao lưu để lùi P1-5, không được xoá (luật vault: không xoá, chỉ lưu trữ).
--
-- Điều kiện tiên quyết: đã chạy fix_vendor_order_20260813.sql (nếu chưa, lệnh CREATE UNIQUE
-- INDEX bên dưới sẽ thất bại vì còn 60 BID trùng vendorOrder).
--
-- Chạy: psql "$DATABASE_URL" -1 -f backend/scripts/migration_20260813_bid_approval.sql
-- Lùi:  ALTER TABLE "BidQuoteItem" DROP COLUMN "selectedAt", DROP COLUMN "selectedBy";
--       DROP INDEX "BidQuoteVendor_bidId_vendorOrder_key";

-- P1-4: ai duyệt / lúc nào, cho từng dòng vật tư
ALTER TABLE "BidQuoteItem" ADD COLUMN "selectedAt" TIMESTAMP(3),
                           ADD COLUMN "selectedBy" TEXT;

-- P1-5: vendorOrder duy nhất trong 1 BID
CREATE UNIQUE INDEX "BidQuoteVendor_bidId_vendorOrder_key"
  ON "BidQuoteVendor"("bidId", "vendorOrder");
