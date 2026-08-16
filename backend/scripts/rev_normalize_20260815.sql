-- rev_normalize_20260815.sql
-- Tách prRef thành mã phiếu gốc (docNo) + số lần dự trù (revNo).
-- Anh Hưng chốt 15/08/2026: "một lần dự trù là một PHIÊN BẢN MỚI của cùng một phiếu".
--
-- Nguyên tắc:
--   · CHỈ THÊM cột, không xoá, không sửa prRef — prRef vẫn là bản gốc để đối chiếu.
--   · Giá trị nạp bằng câu lệnh tường minh cho từng phiếu, sinh từ bản phân tách đã
--     trình anh Hưng — không dùng regex trong SQL, để hai bên không thể hiểu khác nhau.
--   · revNo = 0 nghĩa là bản gốc. NULL nghĩa là phiếu nhập hàng loạt, không có khái niệm lần.
--   · Gỡ bỏ: ALTER TABLE "PurchaseRequisition" DROP COLUMN "docNo", DROP COLUMN "revNo";

BEGIN;

-- ── 1. Ảnh chụp trước khi đụng ──
DROP TABLE IF EXISTS "_backup_PurchaseRequisition_20260815";
CREATE TABLE "_backup_PurchaseRequisition_20260815" AS
  SELECT * FROM "PurchaseRequisition";

-- ── 2. Thêm cột ──
ALTER TABLE "PurchaseRequisition"
  ADD COLUMN IF NOT EXISTS "docNo" TEXT,
  ADD COLUMN IF NOT EXISTS "revNo" INTEGER;

COMMENT ON COLUMN "PurchaseRequisition"."docNo" IS
  'Mã phiếu gốc, đã bỏ phần REV. Ví dụ: A260-2025';
COMMENT ON COLUMN "PurchaseRequisition"."revNo" IS
  'Lần dự trù. 0 = bản gốc, 1..n = phiên bản sau. NULL = phiếu nhập hàng loạt.';

-- ── 3. Nạp giá trị ──
UPDATE "PurchaseRequisition" SET "docNo"='I-071-ENG-001', "revNo"=1 WHERE "prRef"='I-071-ENG-001-REV 01';
UPDATE "PurchaseRequisition" SET "docNo"='A012-2026', "revNo"=0 WHERE "prRef"='A012-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A039-2026', "revNo"=0 WHERE "prRef"='A039-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A067-2026', "revNo"=0 WHERE "prRef"='A067-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A085-2026', "revNo"=0 WHERE "prRef"='A085-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A085-2026', "revNo"=1 WHERE "prRef"='A085-2026 Rev 01';
UPDATE "PurchaseRequisition" SET "docNo"='PR-25-BRA-I-090-AUTO-1775581018867', "revNo"=NULL WHERE "prRef"='PR-25-BRA-I-090-AUTO-1775581018867';
UPDATE "PurchaseRequisition" SET "docNo"='A041-2026', "revNo"=0 WHERE "prRef"='A041-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A050-2026', "revNo"=0 WHERE "prRef"='A050-2026';
UPDATE "PurchaseRequisition" SET "docNo"='PR-25-GEN-G-07-AUTO-1775581020370', "revNo"=NULL WHERE "prRef"='PR-25-GEN-G-07-AUTO-1775581020370';
UPDATE "PurchaseRequisition" SET "docNo"='A011-2026', "revNo"=0 WHERE "prRef"='A011-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A091-2026', "revNo"=0 WHERE "prRef"='A091-2026';
UPDATE "PurchaseRequisition" SET "docNo"='PR-25-IBS-I-078-AUTO-1775580995705', "revNo"=NULL WHERE "prRef"='PR-25-IBS-I-078-AUTO-1775580995705';
UPDATE "PurchaseRequisition" SET "docNo"='A004-2026', "revNo"=0 WHERE "prRef"='A004-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A003-2026', "revNo"=0 WHERE "prRef"='A003-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A005-2026', "revNo"=0 WHERE "prRef"='A005-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A006-2026', "revNo"=0 WHERE "prRef"='A006-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A007-2026', "revNo"=0 WHERE "prRef"='A007-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A008-2026', "revNo"=0 WHERE "prRef"='A008-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A010-2026', "revNo"=0 WHERE "prRef"='A010-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A019-2026', "revNo"=0 WHERE "prRef"='A019-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A021-2026', "revNo"=0 WHERE "prRef"='A021-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A032-2026', "revNo"=0 WHERE "prRef"='A032-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A033-2026', "revNo"=0 WHERE "prRef"='A033-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A037-2026', "revNo"=0 WHERE "prRef"='A037-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A042-2026', "revNo"=0 WHERE "prRef"='A042-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A053-2026', "revNo"=0 WHERE "prRef"='A053-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A059-2026', "revNo"=0 WHERE "prRef"='A059-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A060-2026', "revNo"=0 WHERE "prRef"='A060-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A061-2026', "revNo"=0 WHERE "prRef"='A061-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A063-2026', "revNo"=0 WHERE "prRef"='A063-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A074-2026', "revNo"=0 WHERE "prRef"='A074-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A089-2026', "revNo"=0 WHERE "prRef"='A089-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A103-2026', "revNo"=0 WHERE "prRef"='A103-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A107-2026', "revNo"=0 WHERE "prRef"='A107-2026';
UPDATE "PurchaseRequisition" SET "docNo"='A260-2025', "revNo"=0 WHERE "prRef"='A260-2025';
UPDATE "PurchaseRequisition" SET "docNo"='A260-2025', "revNo"=2 WHERE "prRef"='A260-2025 REV 02';
UPDATE "PurchaseRequisition" SET "docNo"='A260-2025', "revNo"=4 WHERE "prRef"='A260-2025 REV 04';
UPDATE "PurchaseRequisition" SET "docNo"='A260-2025', "revNo"=8 WHERE "prRef"='A260-2025 REV 08';
UPDATE "PurchaseRequisition" SET "docNo"='A260-2025', "revNo"=10 WHERE "prRef"='A260-2025 REV 10';
UPDATE "PurchaseRequisition" SET "docNo"='A260-2025', "revNo"=11 WHERE "prRef"='A260-2025 REV 11';
UPDATE "PurchaseRequisition" SET "docNo"='A260-2025', "revNo"=5 WHERE "prRef"='A260-2025 Rev 05';
UPDATE "PurchaseRequisition" SET "docNo"='A260-2025', "revNo"=7 WHERE "prRef"='A260-2025 Rev 07';
UPDATE "PurchaseRequisition" SET "docNo"='A260-2025', "revNo"=9 WHERE "prRef"='A260-2025 Rev 09';
UPDATE "PurchaseRequisition" SET "docNo"='A260-2025', "revNo"=12 WHERE "prRef"='A260-2025 Rev 12';
UPDATE "PurchaseRequisition" SET "docNo"='PR-25-VPI-I-095-AUTO-1775581019533', "revNo"=NULL WHERE "prRef"='PR-25-VPI-I-095-AUTO-1775581019533';
UPDATE "PurchaseRequisition" SET "docNo"='PR-25-WNC-I-097-AUTO-1775581020095', "revNo"=NULL WHERE "prRef"='PR-25-WNC-I-097-AUTO-1775581020095';
UPDATE "PurchaseRequisition" SET "docNo"='24-MCDD-Y-009', "revNo"=3 WHERE "prRef"='24-MCDD-Y-009-REV3';
UPDATE "PurchaseRequisition" SET "docNo"='23-VISC-I-063', "revNo"=1 WHERE "prRef"='23-VISC-I-063-REV01';
UPDATE "PurchaseRequisition" SET "docNo"='I-068-ENG-001', "revNo"=4 WHERE "prRef"='I-068-ENG-001-REV 04';
UPDATE "PurchaseRequisition" SET "docNo"='I-075-ENG-001', "revNo"=2 WHERE "prRef"='I-075-ENG-001-REV2';

-- ── 4. Chỉ mục tra cứu theo phiếu ──
CREATE INDEX IF NOT EXISTS "PurchaseRequisition_project_doc_rev_idx"
  ON "PurchaseRequisition" ("projectId", "docNo", "revNo");

-- ── 5. Chốt: không dòng nào bị bỏ sót ──
DO $$
DECLARE sot int; so_doc int;
BEGIN
  SELECT count(*) INTO sot FROM "PurchaseRequisition" WHERE "docNo" IS NULL;
  IF sot > 0 THEN RAISE EXCEPTION 'Còn % phiếu chưa có docNo — dừng, không commit', sot; END IF;
  SELECT count(DISTINCT ("projectId","docNo")) INTO so_doc FROM "PurchaseRequisition";
  IF so_doc <> 41 THEN RAISE EXCEPTION 'Đếm được % mã phiếu gốc, kỳ vọng 41 — dừng', so_doc; END IF;
  RAISE NOTICE 'OK: % phiếu → % mã phiếu gốc', (SELECT count(*) FROM "PurchaseRequisition"), so_doc;
END $$;

COMMIT;

-- Sinh từ: 15 phiếu có REV · 31 phiếu bản gốc · 5 phiếu nhập hàng loạt
