-- ═══════════════════════════════════════════════════════════════════════════
-- Ảnh chụp nguyên trạng + CHỐT AN TOÀN — phiên nghiệm thu giao diện 14/08/2026
-- ═══════════════════════════════════════════════════════════════════════════
-- Hai gói thử:
--   A = BID-VPI095-2605-VTC-003  18ca5448-9e43-45b0-a1a1-45e9c19223f4  PER_BID   11 dòng  4 NCC
--   B = BID-VPI095-2604-VTC-008  e11ba7ca-f670-4c0d-a2b4-5935af5aad8e  PER_ITEM  39 dòng  3 NCC
--
-- VÌ SAO CÓ CHỐT AN TOÀN: có 3 trạng thái trong phiên thử làm create-po CHẠY THẬT
--   · gói A giao cả gói cho "Ngọc Hiếu"        → 9/9 dòng hợp lệ  → 1 PO
--   · gói B chạy tự chọn giá thấp nhất          → 27/27 hợp lệ     → 3 PO
--   · gói B nhóm VTC01 → GNEE                   → 5/5 hợp lệ       → 1 PO
-- Ràng buộc CHECK(false) làm mọi lệnh INSERT vào PurchaseOrder thất bại ⇒ cả giao
-- dịch của createPoFromBid bị huỷ: không PO, không ContractDetail, không CONTRACTED.
-- NOT VALID = không kiểm 0 dòng sẵn có ⇒ không viết lại bảng.
--
-- Chạy: psql "$PGURL" -v ON_ERROR_STOP=1 -f backend/scripts/snapshot_ui_test_20260814.sql
-- Hoàn tác: backend/scripts/restore_ui_test_20260814.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Toàn bộ dòng BidAnalysis của 2 gói (đủ mọi cột, kể cả updatedAt mà SQL thô không tự trả lại được)
DROP TABLE IF EXISTS "_backup_BidAnalysis_uitest_20260814";
CREATE TABLE "_backup_BidAnalysis_uitest_20260814" AS
SELECT * FROM "BidAnalysis"
WHERE id IN ('18ca5448-9e43-45b0-a1a1-45e9c19223f4','e11ba7ca-f670-4c0d-a2b4-5935af5aad8e');

-- 2. Cột phê duyệt cấp dòng của cả 50 dòng (11 + 39)
DROP TABLE IF EXISTS "_backup_BidQuoteItem_uitest_20260814";
CREATE TABLE "_backup_BidQuoteItem_uitest_20260814" AS
SELECT id, "bidId", "itemOrder", "itemCode", "selectedVendorName", "selectedAt", "selectedBy"
FROM "BidQuoteItem"
WHERE "bidId" IN ('18ca5448-9e43-45b0-a1a1-45e9c19223f4','e11ba7ca-f670-4c0d-a2b4-5935af5aad8e');

-- 3. Cờ NCC trúng — KHÔNG nằm trong 5 số nền của đề bài nhưng phiên thử sẽ xoá sạch.
--    Nguyên trạng: gói A bật cờ ở 'APEC/NGỌC HIẾU' (vendorOrder 3); gói B không có cờ nào.
DROP TABLE IF EXISTS "_backup_BidQuoteVendor_uitest_20260814";
CREATE TABLE "_backup_BidQuoteVendor_uitest_20260814" AS
SELECT id, "bidId", "vendorName", "vendorOrder", "isWinner"
FROM "BidQuoteVendor"
WHERE "bidId" IN ('18ca5448-9e43-45b0-a1a1-45e9c19223f4','e11ba7ca-f670-4c0d-a2b4-5935af5aad8e');

-- 4. 11 chỉ tiêu nền toàn kho — để câu kiểm chứng cuối phiên đối chiếu bằng máy
DROP TABLE IF EXISTS "_backup_baseline_uitest_20260814";
CREATE TABLE "_backup_baseline_uitest_20260814" AS
          SELECT 'PurchaseOrder'::text AS chi_tieu, count(*)::bigint AS so_luong FROM "PurchaseOrder"
UNION ALL SELECT 'ContractDetail',              count(*) FROM "ContractDetail"
UNION ALL SELECT 'BidQuoteItem_selectedVendor', count(*) FROM "BidQuoteItem" WHERE "selectedVendorName" IS NOT NULL
UNION ALL SELECT 'BidQuoteItem_selectedAt',     count(*) FROM "BidQuoteItem" WHERE "selectedAt" IS NOT NULL
UNION ALL SELECT 'BidQuoteItem_selectedBy',     count(*) FROM "BidQuoteItem" WHERE "selectedBy" IS NOT NULL
UNION ALL SELECT 'BidAnalysis_SELECTED',        count(*) FROM "BidAnalysis" WHERE status='SELECTED'
UNION ALL SELECT 'BidAnalysis_OPEN',            count(*) FROM "BidAnalysis" WHERE status='OPEN'
UNION ALL SELECT 'BidGroupSelection',           count(*) FROM "BidGroupSelection"
UNION ALL SELECT 'BidVendorScore',              count(*) FROM "BidVendorScore"
UNION ALL SELECT 'BidQuoteVendor_isWinner',     count(*) FROM "BidQuoteVendor" WHERE "isWinner"
UNION ALL SELECT 'AuditLog',                    count(*) FROM "AuditLog";

-- 5. CHỐT AN TOÀN
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "_guard_no_po_20260814" CHECK (false) NOT VALID;

-- 6. Kiểm chứng: mốc phải đúng, ảnh chụp phải đủ, chốt phải có mặt
DO $$
DECLARE n_po INT; n_cd INT; n_sel INT; n_sa INT; n_sb INT; n_selected INT; n_open INT;
        n_grp INT; n_score INT; n_win INT; n_guard INT; n_bid INT; n_item INT; n_vendor INT;
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
  SELECT count(*) INTO n_bid      FROM "_backup_BidAnalysis_uitest_20260814";
  SELECT count(*) INTO n_item     FROM "_backup_BidQuoteItem_uitest_20260814";
  SELECT count(*) INTO n_vendor   FROM "_backup_BidQuoteVendor_uitest_20260814";

  IF n_po<>0 OR n_cd<>2994 OR n_sel<>508 OR n_sa<>0 OR n_sb<>0
     OR n_selected<>187 OR n_open<>64 OR n_grp<>0 OR n_score<>0 OR n_win<>68 THEN
    RAISE EXCEPTION 'MOC KHONG KHOP — khong duoc bat dau thu. po=% cd=% duyet=% selAt=% selBy=% SELECTED=% OPEN=% nhom=% diem=% winner=%',
      n_po,n_cd,n_sel,n_sa,n_sb,n_selected,n_open,n_grp,n_score,n_win;
  END IF;
  IF n_guard<>1 THEN RAISE EXCEPTION 'Chot an toan chua duoc tao'; END IF;
  IF n_bid<>2 OR n_item<>50 OR n_vendor<>7 THEN
    RAISE EXCEPTION 'Anh chup thieu: bid=% item=% vendor=% (can 2 / 50 / 7)', n_bid,n_item,n_vendor;
  END IF;

  RAISE NOTICE 'OK — moc dung, da chup 2 goi / 50 dong / 7 NCC, CHOT AN TOAN DA BAT.';
END $$;

COMMIT;
