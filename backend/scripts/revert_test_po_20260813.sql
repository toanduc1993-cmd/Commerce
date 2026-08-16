-- HOÀN TÁC dữ liệu do phiên thử P0-3 lỡ tạo (13/08/2026).
--
-- Bối cảnh: script kiểm chứng "chặn dòng 0 đồng" chạy tiếp bước 2 (đổi sang NCC có giá)
-- và tạo THẬT 1 đơn hàng PO-260813-001 (GNEE, 548,17) + 1 dòng ContractDetail trên gói
-- BID-VPI095-2604-VTC-008. Đây là dữ liệu rác của phiên thử, không phải nghiệp vụ thật.
--
-- Trạng thái gốc của gói = OPEN (căn cứ: số gói SELECTED vẫn đúng 187 như đo đầu phiên,
-- tổng 251 = 187 SELECTED + 63 OPEN + 1 CONTRACTED ⇒ gói này đi ra từ nhóm OPEN).
--
-- Chạy: psql "$DATABASE_URL" -1 -f backend/scripts/revert_test_po_20260813.sql

BEGIN;

-- Sao lưu trước khi xoá (không xoá trắng — theo luật vault)
DROP TABLE IF EXISTS "_backup_test_po_20260813";
CREATE TABLE "_backup_test_po_20260813" AS
SELECT po.id AS po_id, po."poCode", po."vendorName", po."totalValue", po."bidId",
       cd.id AS contract_id, cd."totalNoVAT", cd.notes
FROM "PurchaseOrder" po
LEFT JOIN "ContractDetail" cd ON cd."purchaseOrderId" = po.id
WHERE po."poCode" = 'PO-260813-001';

-- 1. Xoá dòng hợp đồng thuộc PO thử
DELETE FROM "ContractDetail"
WHERE "purchaseOrderId" IN (SELECT id FROM "PurchaseOrder" WHERE "poCode" = 'PO-260813-001');

-- 2. Xoá đơn hàng thử
DELETE FROM "PurchaseOrder" WHERE "poCode" = 'PO-260813-001';

-- 3. Trả trạng thái gói về OPEN
UPDATE "BidAnalysis" SET status = 'OPEN'
WHERE id = 'e11ba7ca-f670-4c0d-a2b4-5935af5aad8e' AND status = 'CONTRACTED';

-- 4. Gỡ lựa chọn NCC của dòng đã dùng để thử
UPDATE "BidQuoteItem"
SET "selectedVendorName" = NULL, "selectedAt" = NULL, "selectedBy" = NULL
WHERE id = '2fe41bf8-6231-44a0-a9c3-43b568594de1';

-- 5. Kiểm chứng
DO $$
DECLARE con_po INT; con_duyet INT; tt TEXT;
BEGIN
  SELECT count(*) INTO con_po FROM "PurchaseOrder" WHERE "poCode" = 'PO-260813-001';
  SELECT count(*) INTO con_duyet FROM "BidQuoteItem"
    WHERE "bidId" = 'e11ba7ca-f670-4c0d-a2b4-5935af5aad8e' AND "selectedVendorName" IS NOT NULL;
  SELECT status INTO tt FROM "BidAnalysis" WHERE id = 'e11ba7ca-f670-4c0d-a2b4-5935af5aad8e';
  IF con_po <> 0 OR con_duyet <> 0 OR tt <> 'OPEN' THEN
    RAISE EXCEPTION 'Hoan tac chua sach: po=% duyet=% trangthai=%', con_po, con_duyet, tt;
  END IF;
  RAISE NOTICE 'OK: da hoan tac sach — 0 PO thu, 0 dong duyet, trang thai OPEN';
END $$;

COMMIT;

-- GIỮ LẠI nhật ký kiểm toán (AuditLog) của phiên thử — đó là bằng chứng P0-4 hoạt động,
-- và luật vault không cho xoá dấu vết.
