-- P1-5 — Đánh số lại BidQuoteVendor.vendorOrder cho duy nhất trong từng BID.
--
-- Vì sao: 60 BID có hai NCC trùng vendorOrder. Giao diện so sánh ghép báo giá vào cột
-- theo vendorOrder nên cột sau hiển thị giá của cột trước (22 ô sai thật trên 3 BID,
-- 57 BID còn lại tiềm ẩn). Báo cáo: docs/RA-SOAT-LOGIC-SO-SANH-DUYET-BAO-GIA-20260813.md
--
-- Nguyên tắc: GIỮ NGUYÊN thứ tự tương đối đang có (sắp theo vendorOrder, rồi createdAt,
-- rồi id để ổn định), chỉ đánh lại số cho liên tục 0,1,2… trong từng BID.
--
-- Chạy: psql "$DATABASE_URL" -1 -f backend/scripts/fix_vendor_order_20260813.sql
-- Lùi:  xem cuối file.

BEGIN;

-- 1. Sao lưu nguyên trạng (không xoá gì — theo luật vault)
DROP TABLE IF EXISTS "_backup_BidQuoteVendor_order_20260813";
CREATE TABLE "_backup_BidQuoteVendor_order_20260813" AS
SELECT id, "bidId", "vendorName", "vendorOrder" FROM "BidQuoteVendor";

-- 2. Đánh số lại
WITH thu_tu AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY "bidId"
           ORDER BY "vendorOrder" NULLS LAST, "createdAt", id
         ) - 1 AS so_moi
  FROM "BidQuoteVendor"
)
UPDATE "BidQuoteVendor" v
SET "vendorOrder" = t.so_moi
FROM thu_tu t
WHERE v.id = t.id AND v."vendorOrder" IS DISTINCT FROM t.so_moi;

-- 3. Kiểm chứng: phải còn 0 cặp trùng
DO $$
DECLARE con_trung INT;
BEGIN
  SELECT count(*) INTO con_trung FROM (
    SELECT "bidId","vendorOrder" FROM "BidQuoteVendor" GROUP BY 1,2 HAVING count(*) > 1
  ) x;
  IF con_trung > 0 THEN
    RAISE EXCEPTION 'Van con % cap vendorOrder trung — huy toan bo', con_trung;
  END IF;
  RAISE NOTICE 'OK: khong con vendorOrder trung trong bat ky BID nao';
END $$;

COMMIT;

-- ─── ĐƯỜNG LÙI ───────────────────────────────────────────────────────────────
-- Bỏ ràng buộc duy nhất trước (nếu đã tạo), rồi trả số cũ:
--   DROP INDEX IF EXISTS "BidQuoteVendor_bidId_vendorOrder_key";
--   UPDATE "BidQuoteVendor" v SET "vendorOrder" = b."vendorOrder"
--   FROM "_backup_BidQuoteVendor_order_20260813" b WHERE v.id = b.id;
