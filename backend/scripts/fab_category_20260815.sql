-- fab_category_20260815.sql
-- Nền cho module "Phân bổ chế tạo" (anh Hưng chốt phương án B, 15/08/2026).
--
-- Hai việc:
--   1. PrDetailFabAllocation thêm "ngayCanTaiCongTruong" — anh Hưng chốt câu 3:
--      tiến độ tính theo NGÀY CẦN VẬT TƯ TẠI CÔNG TRƯỜNG.
--   2. FabricationCategory thêm ghi chú + chốt duy nhất (projectId, code) để nhập
--      từ Excel không đẻ ra hạng mục trùng mã trong cùng một dự án.
--
-- CHỈ THÊM, không xoá, không sửa dữ liệu sẵn có.
-- DDL áp tay bằng psql theo RULE CỨNG #6 — KHÔNG chạy prisma migrate dev.
-- Gỡ bỏ: xem cuối tệp.

BEGIN;

-- ── Ảnh chụp trước khi đụng ──
DROP TABLE IF EXISTS "_backup_FabricationCategory_20260815";
CREATE TABLE "_backup_FabricationCategory_20260815" AS
  SELECT * FROM "FabricationCategory";

DROP TABLE IF EXISTS "_backup_PrDetailFabAllocation_20260815";
CREATE TABLE "_backup_PrDetailFabAllocation_20260815" AS
  SELECT * FROM "PrDetailFabAllocation";

-- ── 1. Ngày cần vật tư tại công trường ──
ALTER TABLE "PrDetailFabAllocation"
  ADD COLUMN IF NOT EXISTS "ngayCanTaiCongTruong" TIMESTAMP(3);

COMMENT ON COLUMN "PrDetailFabAllocation"."ngayCanTaiCongTruong" IS
  'Ngày cần vật tư TẠI CÔNG TRƯỜNG cho hạng mục này. Mốc để tính tiến độ theo ngày: '
  'so với ngày hàng thực về (ContractDetail.arrivedDate) ra số ngày sớm/muộn.';

-- ── 2. Hạng mục chế tạo: ghi chú + chốt duy nhất theo dự án ──
ALTER TABLE "FabricationCategory"
  ADD COLUMN IF NOT EXISTS "ghiChu" TEXT;

COMMENT ON COLUMN "FabricationCategory"."ghiChu" IS
  'Mô tả thêm về hạng mục chế tạo. Không bắt buộc.';

-- Mã hạng mục phải duy nhất TRONG MỘT dự án (khác dự án được trùng mã).
-- Cần cho việc nhập từ Excel: nhập lại cùng mã thì cập nhật chứ không thêm mới.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FabricationCategory_project_code_key'
  ) THEN
    ALTER TABLE "FabricationCategory"
      ADD CONSTRAINT "FabricationCategory_project_code_key" UNIQUE ("projectId", "code");
  END IF;
END $$;

-- ── Chốt: không mất dòng nào ──
DO $$
DECLARE hm int; pb int;
BEGIN
  SELECT count(*) INTO hm FROM "FabricationCategory";
  SELECT count(*) INTO pb FROM "PrDetailFabAllocation";
  IF hm <> (SELECT count(*) FROM "_backup_FabricationCategory_20260815") THEN
    RAISE EXCEPTION 'Số hạng mục lệch so với ảnh chụp — dừng, không commit';
  END IF;
  IF pb <> (SELECT count(*) FROM "_backup_PrDetailFabAllocation_20260815") THEN
    RAISE EXCEPTION 'Số phân bổ lệch so với ảnh chụp — dừng, không commit';
  END IF;
  RAISE NOTICE 'OK: % hạng mục · % phân bổ · đã thêm cột, chưa đụng dữ liệu', hm, pb;
END $$;

COMMIT;

-- Gỡ bỏ:
--   ALTER TABLE "PrDetailFabAllocation" DROP COLUMN "ngayCanTaiCongTruong";
--   ALTER TABLE "FabricationCategory" DROP COLUMN "ghiChu",
--     DROP CONSTRAINT "FabricationCategory_project_code_key";
