-- ═══════════════════════════════════════════════════════════════════════════
-- nap_material_tu_kho_20260817.sql
-- Nối tầng _index của kho Obsidian về bảng Material.
--
-- Nguồn: IBSHI/mua-hang/_index/{unit_weight_derived_v1,material_subgroup_map_v1}.ndjson
-- Khoá nối: ma_vat_tu_root  ==  Material.rootKey  (khớp 4.440/4.440)
--
-- NGUYÊN TẮC: CHỈ lấp ô đang TRỐNG. Không đè lên giá trị đã có.
--   Kho cập nhật lần cuối 26/05/2026, cơ sở dữ liệu chạy tới 08/2026 — đè là đi lùi.
--   Chỗ nào hai bên khác nhau thì xuất ra bảng _review_* để anh Hưng xem, không tự chọn.
--
-- Dữ liệu nạp qua 2 bảng tạm _nap_uw / _nap_sg (đã \copy từ CSV trước khi chạy file này).
-- DDL/DML áp tay bằng psql theo RULE CỨNG #6 — KHÔNG prisma migrate dev.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. Chụp ảnh trước khi đụng ────────────────────────────────────────────
DROP TABLE IF EXISTS "_backup_Material_20260817";
CREATE TABLE "_backup_Material_20260817" AS SELECT * FROM "Material";

-- ── 1. Chốt mốc đầu vào; lệch là dừng, không ghi gì ───────────────────────
DO $$
DECLARE n_mat int; n_uw int; n_sg int;
BEGIN
  SELECT count(*) INTO n_mat FROM "Material";
  SELECT count(*) INTO n_uw  FROM _nap_uw;
  SELECT count(*) INTO n_sg  FROM _nap_sg;
  IF n_mat <> 4440 THEN RAISE EXCEPTION 'Material có % dòng, mong đợi 4440', n_mat; END IF;
  IF n_uw  <> 1576 THEN RAISE EXCEPTION '_nap_uw có % dòng, mong đợi 1576', n_uw; END IF;
  IF n_sg  <> 4440 THEN RAISE EXCEPTION '_nap_sg có % dòng, mong đợi 4440', n_sg; END IF;
  RAISE NOTICE 'Mốc đầu vào OK: Material 4440 · khối lượng 1576 · mã nhóm 4440';
END $$;

-- ── 2. Ghi lại chỗ HAI BÊN KHÁC NHAU, trước khi lấp ───────────────────────
-- Không sửa gì ở đây. Đây là danh sách để anh Hưng soi rồi quyết sau.
DROP TABLE IF EXISTS "_review_Material_lech_20260817";
CREATE TABLE "_review_Material_lech_20260817" AS
  SELECT m.id, m."rootKey", m.name, m.profile, m.uom,
         'khối lượng'::text                AS truong,
         m."unitWeightAvg"::text              AS gia_tri_csdl,
         u.kg_per_unit::text                  AS gia_tri_kho,
         round((100*abs(u.kg_per_unit-m."unitWeightAvg")/nullif(m."unitWeightAvg",0))::numeric,1)::text || '%' AS lech,
         u.method || ' · ' || u.confidence  AS cach_suy_ra_o_kho
  FROM "Material" m JOIN _nap_uw u ON u.root_key = m."rootKey"
  WHERE m."unitWeightAvg" > 0
    AND abs(u.kg_per_unit - m."unitWeightAvg") / nullif(m."unitWeightAvg",0) > 0.05
  UNION ALL
  SELECT m.id, m."rootKey", m.name, m.profile, m.uom,
         'mã nhóm', m."materialSubGroupCode", s.subgroup_code, NULL,
         s.rule || ' · ' || s.confidence
  FROM "Material" m JOIN _nap_sg s ON s.root_key = m."rootKey"
  WHERE m."materialSubGroupCode" IS NOT NULL
    AND m."materialSubGroupCode" <> s.subgroup_code;

-- ── 3. Lấp khối lượng đơn vị — chỉ ô đang trống ───────────────────────────
UPDATE "Material" m
   SET "unitWeightAvg" = u.kg_per_unit, "updatedAt" = now()
  FROM _nap_uw u
 WHERE u.root_key = m."rootKey"
   AND (m."unitWeightAvg" IS NULL OR m."unitWeightAvg" = 0)
   AND u.kg_per_unit > 0;

-- ── 4. Lấp mã nhóm — chỉ ô đang trống, và chỉ mã ĐÃ CÓ trong MaterialSubGroup ──
-- 534 dòng thuộc VPK03 / VPK04 / VTC05 sẽ KHÔNG lấp ở bước này: ba mã đó chưa
-- có trong danh mục nên khoá ngoại sẽ chặn. Chờ anh Hưng quyết có thêm hay không.
UPDATE "Material" m
   SET "materialSubGroupCode" = s.subgroup_code, "updatedAt" = now()
  FROM _nap_sg s
 WHERE s.root_key = m."rootKey"
   AND m."materialSubGroupCode" IS NULL
   AND EXISTS (SELECT 1 FROM "MaterialSubGroup" g WHERE g.code = s.subgroup_code);

-- ── 5. Kiểm kết quả; sai là hoàn tác toàn bộ ──────────────────────────────
DO $$
DECLARE con_thieu_kl int; con_thieu_nhom int; tong int; mo_coi int;
BEGIN
  SELECT count(*) INTO tong FROM "Material";
  IF tong <> 4440 THEN RAISE EXCEPTION 'Số dòng Material đổi thành % — phải là 4440', tong; END IF;

  SELECT count(*) INTO mo_coi FROM "Material" m
   WHERE m."materialSubGroupCode" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM "MaterialSubGroup" g WHERE g.code = m."materialSubGroupCode");
  IF mo_coi > 0 THEN RAISE EXCEPTION '% dòng có mã nhóm không tồn tại trong danh mục', mo_coi; END IF;

  SELECT count(*) INTO con_thieu_kl   FROM "Material" WHERE "unitWeightAvg" IS NULL OR "unitWeightAvg" = 0;
  SELECT count(*) INTO con_thieu_nhom FROM "Material" WHERE "materialSubGroupCode" IS NULL;
  RAISE NOTICE 'Sau khi nạp: còn thiếu khối lượng %, còn thiếu mã nhóm %', con_thieu_kl, con_thieu_nhom;
  IF con_thieu_kl   <> 2044 THEN RAISE EXCEPTION 'Khối lượng còn thiếu %, mong đợi 2044', con_thieu_kl; END IF;
  IF con_thieu_nhom <> 534  THEN RAISE EXCEPTION 'Mã nhóm còn thiếu %, mong đợi 534',  con_thieu_nhom; END IF;
END $$;

COMMIT;

-- Hoàn tác nếu cần:
--   UPDATE "Material" m SET "unitWeightAvg" = b."unitWeightAvg",
--          "materialSubGroupCode" = b."materialSubGroupCode"
--     FROM "_backup_Material_20260817" b WHERE b.id = m.id;
