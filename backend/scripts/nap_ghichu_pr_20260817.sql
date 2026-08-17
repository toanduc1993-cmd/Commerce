-- 46 dòng còn mang dấu 'Imported from <file>.xlsx' do import_pr_mto_from_packages.py
-- ghi đè. Trích lại từ chính file PR nguồn được 4 ghi chú thật; 42 dòng còn lại
-- ô nguồn vốn trống.
--
-- Dấu 'Imported from …' KHÔNG phải ghi chú nghiệp vụ mà giao diện lại hiển thị nó
-- như ghi chú. Đặt về NULL cho đúng bản chất. Nguồn gốc không mất: chuỗi này vẫn
-- nằm ở "PurchaseRequisition".client của đúng hai phiếu đó.
--
-- Ảnh chụp lùi lại: _backup_PrDetail_remarks_20260817 (chụp trước đợt nạp ghi chú).
BEGIN;

DO $$
DECLARE n int;
BEGIN
  IF to_regclass('public."_backup_PrDetail_remarks_20260817"') IS NULL THEN
    RAISE EXCEPTION 'DỪNG: thiếu ảnh chụp _backup_PrDetail_remarks_20260817';
  END IF;
  SELECT count(*) INTO n FROM "PrDetail" WHERE remarks LIKE 'Imported from %';
  IF n <> 46 THEN RAISE EXCEPTION 'DỪNG: còn % dòng mang dấu (chờ 46)', n; END IF;
END $$;

UPDATE "PrDetail" SET remarks = v.gc, "updatedAt" = now()
FROM (VALUES
  ('071-B-1',  'Rev01-bổ sung mới. Số lượng, tiêu chuẩn mua theo bản vẽ: I71-ANCHOR BOLT M42'),
  ('071-B-2',  'Rev01-bổ sung mới'),
  ('VISC-A-9', '1BOTL+1NUT'),
  ('VISC-A-10','1 BOLT+1NUT+WASHER.REV01-BỔ SUNG')
) AS v(ma, gc)
WHERE "PrDetail"."itemCode" = v.ma AND "PrDetail".remarks LIKE 'Imported from %';

UPDATE "PrDetail" SET remarks = NULL, "updatedAt" = now()
WHERE remarks LIKE 'Imported from %';

DO $$
DECLARE n_rac int; n_moi int;
BEGIN
  SELECT count(*) INTO n_rac FROM "PrDetail" WHERE remarks LIKE 'Imported from %';
  SELECT count(*) INTO n_moi FROM "PrDetail" WHERE "itemCode" IN ('071-B-1','071-B-2','VISC-A-9','VISC-A-10') AND remarks IS NOT NULL;
  IF n_rac <> 0 THEN RAISE EXCEPTION 'DỪNG: còn % dấu rác', n_rac; END IF;
  IF n_moi <> 4 THEN RAISE EXCEPTION 'DỪNG: chỉ % / 4 ghi chú được nạp', n_moi; END IF;
  RAISE NOTICE 'ĐẠT: 4 ghi chú nạp xong, 0 dấu rác còn lại';
END $$;

COMMIT;
