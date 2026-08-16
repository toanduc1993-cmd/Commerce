-- ═══════════════════════════════════════════════════════════════════════════
-- HOÀN TÁC phiên nghiệm thu giao diện 14/08/2026 — trả dữ liệu về đúng nguyên trạng
-- ═══════════════════════════════════════════════════════════════════════════
-- Ba gói bị đụng:
--   A = BID-VPI095-2605-VTC-003  18ca5448-9e43-45b0-a1a1-45e9c19223f4  → OPEN / PER_BID
--   B = BID-VPI095-2604-VTC-008  e11ba7ca-f670-4c0d-a2b4-5935af5aad8e  → OPEN / PER_ITEM
--   C = (mã gói rỗng)            7284cbcd-6820-4e40-bf12-662216224566  → chỉ gỡ 3 dòng anh Hưng
--       bấm thử lúc 02:58 (I109-VTC01-024/025/026); trạng thái gói KHÔNG đổi (vẫn SELECTED).
--
-- NGUYÊN TẮC: cột nghiệp vụ ghi bằng HẰNG SỐ đã đo trước phiên, KHÔNG chép từ ảnh chụp —
-- để một ảnh chụp sai không thể tự hợp thức hoá chính nó. Riêng updatedAt lấy từ ảnh chụp
-- vì @updatedAt của Prisma nằm phía client, SQL thô không tự trả lại được.
--
-- GIỮ NGUYÊN AuditLog — đó là bằng chứng của phiên thử (luật vault: không xoá dấu vết).
-- KHÔNG đụng _backup_BidQuoteVendor_order_20260813 và _backup_test_po_20260813.
--
-- Chạy: psql "$PGURL" -v ON_ERROR_STOP=1 -f backend/scripts/restore_ui_test_20260814.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Nếu (dù đã có chốt) vẫn lọt đơn hàng nào của 2 gói thử — chụp lại rồi xoá
DROP TABLE IF EXISTS "_backup_po_uitest_20260814";
CREATE TABLE "_backup_po_uitest_20260814" AS
SELECT po.id AS po_id, po."poCode", po."vendorName", po."totalValue", po.currency,
       po."bidId", po."issuedAt", cd.id AS contract_id
FROM "PurchaseOrder" po
LEFT JOIN "ContractDetail" cd ON cd."purchaseOrderId" = po.id
WHERE po."bidId" IN ('18ca5448-9e43-45b0-a1a1-45e9c19223f4','e11ba7ca-f670-4c0d-a2b4-5935af5aad8e');

DELETE FROM "ContractDetail" WHERE "purchaseOrderId" IN (
  SELECT id FROM "PurchaseOrder"
   WHERE "bidId" IN ('18ca5448-9e43-45b0-a1a1-45e9c19223f4','e11ba7ca-f670-4c0d-a2b4-5935af5aad8e'));
DELETE FROM "PurchaseOrder"
 WHERE "bidId" IN ('18ca5448-9e43-45b0-a1a1-45e9c19223f4','e11ba7ca-f670-4c0d-a2b4-5935af5aad8e');

-- 2. Gỡ lựa chọn cấp dòng — cả 53 dòng trong ảnh chụp đều có nguyên trạng RỖNG
UPDATE "BidQuoteItem"
   SET "selectedVendorName" = NULL, "selectedAt" = NULL, "selectedBy" = NULL
 WHERE id IN (SELECT id FROM "_backup_BidQuoteItem_uitest_20260814")
   AND ("selectedVendorName" IS NOT NULL OR "selectedAt" IS NOT NULL OR "selectedBy" IS NOT NULL);

-- 3. Lựa chọn theo nhóm + điểm chấm NCC của 2 gói thử — nguyên trạng: 0 dòng
DELETE FROM "BidGroupSelection"
 WHERE "bidAnalysisId" IN ('18ca5448-9e43-45b0-a1a1-45e9c19223f4','e11ba7ca-f670-4c0d-a2b4-5935af5aad8e');
DELETE FROM "BidVendorScore"
 WHERE "bidAnalysisId" IN ('18ca5448-9e43-45b0-a1a1-45e9c19223f4','e11ba7ca-f670-4c0d-a2b4-5935af5aad8e');

-- 4. Cờ NCC trúng: gói A chỉ 'APEC/NGỌC HIẾU' (vendorOrder 3) bật, gói B không cờ nào
UPDATE "BidQuoteVendor" SET "isWinner" = false
 WHERE "bidId" IN ('18ca5448-9e43-45b0-a1a1-45e9c19223f4','e11ba7ca-f670-4c0d-a2b4-5935af5aad8e')
   AND "isWinner";
UPDATE "BidQuoteVendor" SET "isWinner" = true
 WHERE "bidId" = '18ca5448-9e43-45b0-a1a1-45e9c19223f4' AND "vendorOrder" = 3;

-- 5. Hai dòng BidAnalysis — hằng số cho cột nghiệp vụ, updatedAt lấy từ ảnh chụp
UPDATE "BidAnalysis" b SET status='OPEN', "selectionMode"='PER_BID', "selectedVendorId"=NULL,
       "approvedBy"=NULL, "approvedAt"=NULL, "weightingCriteria"=NULL, "updatedAt"=s."updatedAt"
  FROM "_backup_BidAnalysis_uitest_20260814" s
 WHERE b.id=s.id AND b.id='18ca5448-9e43-45b0-a1a1-45e9c19223f4';

UPDATE "BidAnalysis" b SET status='OPEN', "selectionMode"='PER_ITEM', "selectedVendorId"=NULL,
       "approvedBy"=NULL, "approvedAt"=NULL, "weightingCriteria"=NULL, "updatedAt"=s."updatedAt"
  FROM "_backup_BidAnalysis_uitest_20260814" s
 WHERE b.id=s.id AND b.id='e11ba7ca-f670-4c0d-a2b4-5935af5aad8e';

-- 6. Gỡ chốt an toàn (bắt buộc — để lại thì prisma migrate diff sau này sẽ đòi xoá)
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT IF EXISTS "_guard_no_po_20260814";

-- 7. Kiểm chứng ba tầng: 10 chỉ tiêu nền · diff hai chiều với ảnh chụp · chốt đã gỡ
DO $$
DECLARE n_po INT; n_cd INT; n_sel INT; n_sa INT; n_sb INT; n_selected INT; n_open INT;
        n_grp INT; n_score INT; n_win INT; n_guard INT; d_bid INT; d_item INT; d_vendor INT; n_audit INT;
BEGIN
  SELECT count(*) INTO n_po       FROM "PurchaseOrder";
  SELECT count(*) INTO n_cd       FROM "ContractDetail";
  SELECT count(*) INTO n_sel      FROM "BidQuoteItem" WHERE "selectedVendorName" IS NOT NULL;
  SELECT count(*) INTO n_sa       FROM "BidQuoteItem" WHERE "selectedAt" IS NOT NULL;
  SELECT count(*) INTO n_sb       FROM "BidQuoteItem" WHERE "selectedBy" IS NOT NULL;
  SELECT count(*) INTO n_selected FROM "BidAnalysis"  WHERE status='SELECTED';
  SELECT count(*) INTO n_open     FROM "BidAnalysis"  WHERE status='OPEN';
  SELECT count(*) INTO n_grp      FROM "BidGroupSelection";
  SELECT count(*) INTO n_score    FROM "BidVendorScore";
  SELECT count(*) INTO n_win      FROM "BidQuoteVendor" WHERE "isWinner";
  SELECT count(*) INTO n_guard    FROM pg_constraint WHERE conname='_guard_no_po_20260814';
  SELECT count(*) INTO n_audit    FROM "AuditLog";

  IF n_po<>0 OR n_cd<>2994 OR n_sel<>508 OR n_sa<>0 OR n_sb<>0
     OR n_selected<>187 OR n_open<>64 OR n_grp<>0 OR n_score<>0 OR n_win<>68 THEN
    RAISE EXCEPTION 'CHUA VE NEN: po=% cd=% duyet=% selAt=% selBy=% SELECTED=% OPEN=% nhom=% diem=% winner=%',
      n_po,n_cd,n_sel,n_sa,n_sb,n_selected,n_open,n_grp,n_score,n_win;
  END IF;
  IF n_guard<>0 THEN RAISE EXCEPTION 'Chot an toan chua duoc go'; END IF;

  SELECT count(*) INTO d_bid FROM (
    (SELECT * FROM "BidAnalysis" WHERE id IN ('18ca5448-9e43-45b0-a1a1-45e9c19223f4','e11ba7ca-f670-4c0d-a2b4-5935af5aad8e')
     EXCEPT SELECT * FROM "_backup_BidAnalysis_uitest_20260814")
    UNION ALL
    (SELECT * FROM "_backup_BidAnalysis_uitest_20260814"
     EXCEPT SELECT * FROM "BidAnalysis" WHERE id IN ('18ca5448-9e43-45b0-a1a1-45e9c19223f4','e11ba7ca-f670-4c0d-a2b4-5935af5aad8e'))) x;

  SELECT count(*) INTO d_item FROM (
    (SELECT id,"bidId","itemOrder","itemCode","selectedVendorName","selectedAt","selectedBy" FROM "BidQuoteItem"
      WHERE id IN (SELECT id FROM "_backup_BidQuoteItem_uitest_20260814")
     EXCEPT SELECT * FROM "_backup_BidQuoteItem_uitest_20260814")
    UNION ALL
    (SELECT * FROM "_backup_BidQuoteItem_uitest_20260814"
     EXCEPT SELECT id,"bidId","itemOrder","itemCode","selectedVendorName","selectedAt","selectedBy" FROM "BidQuoteItem"
      WHERE id IN (SELECT id FROM "_backup_BidQuoteItem_uitest_20260814"))) y;

  SELECT count(*) INTO d_vendor FROM (
    (SELECT id,"bidId","vendorName","vendorOrder","isWinner" FROM "BidQuoteVendor"
      WHERE "bidId" IN ('18ca5448-9e43-45b0-a1a1-45e9c19223f4','e11ba7ca-f670-4c0d-a2b4-5935af5aad8e')
     EXCEPT SELECT * FROM "_backup_BidQuoteVendor_uitest_20260814")
    UNION ALL
    (SELECT * FROM "_backup_BidQuoteVendor_uitest_20260814"
     EXCEPT SELECT id,"bidId","vendorName","vendorOrder","isWinner" FROM "BidQuoteVendor"
      WHERE "bidId" IN ('18ca5448-9e43-45b0-a1a1-45e9c19223f4','e11ba7ca-f670-4c0d-a2b4-5935af5aad8e'))) z;

  IF d_bid<>0 OR d_item<>0 OR d_vendor<>0 THEN
    RAISE EXCEPTION 'Con lech so voi anh chup: BidAnalysis=% BidQuoteItem=% BidQuoteVendor=%', d_bid,d_item,d_vendor;
  END IF;

  RAISE NOTICE 'OK — da ve dung nguyen trang. AuditLog = % dong (dau phien 158, GIU LAI).', n_audit;
END $$;

COMMIT;
