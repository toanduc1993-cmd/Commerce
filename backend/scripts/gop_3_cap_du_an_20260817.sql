-- ============================================================================
-- Gộp 3 cặp dự án trùng: 009/PKG-009, 068/PKG-068, 075/PKG-075
-- Ngày 17/08/2026. Quyết định của anh Hưng: "trùng thì ghi đè, không trùng thì bổ sung".
--
-- KẾT LUẬN ĐIỀU TRA (đo thật, có vòng phản biện):
--  · Bên mã trần (009/068/075) GIỮ — nắm toàn bộ 410 dòng ContractDetail (11+194+205).
--  · Bên PKG-* XOÁ — 0 tham chiếu ở cả 12 bảng, 0 mã vật tư mà bên kia không có.
--  · KHÔNG chép materialGroupCode/materialSubGroupCode: hai cột này do
--    import_pr_mto_from_packages.py dòng 64-72 sinh máy móc từ CHỮ CÁI section
--    (A->VTC, B->VPK), không đọc tên/mác vật tư. 47/229 giá trị của 068 sai nghiệp vụ;
--    ở 009 thì A-14/A-15 là TẤM LẤY SÁNG composite lại bị đóng dấu "thép carbon".
--  · KHÔNG chép số lượng: trình nạp MTO nhét KHỐI LƯỢNG (kg) vào reqQty trong khi
--    uom vẫn ghi m2/m, và gán cứng toBuyQty = remainQty = reqQty.
--  · KHÔNG chép profile: cả 34 ô chỉ lặp bề dày trong ngoặc (PL6 -> "PL6 (6)"),
--    riêng A-78 còn sai (PL1 -> "PL1 (2)").
--  · CHÉP duy nhất 4 ô grade của 068 (A-1..A-4): "BRASS" -> "BRASS-JIS -C2600 OR C2680".
--    Đối chiếu đúng chuỗi trong file nguồn I-068-ENG-001-REV 04 (PR).xlsx.
--
-- Ảnh chụp lùi lại: _backup_{PrDetail,Project,PurchaseRequisition}_gop_20260817
-- Chạy: psql ... -v ON_ERROR_STOP=1 -f gop_3_cap_du_an_20260817.sql   (MỘT lần gọi)
-- ============================================================================

BEGIN;

-- ── Chốt 0: ảnh chụp phải tồn tại, nếu không thì không có đường lùi ──────────
DO $$
BEGIN
  -- Tên bảng có chữ hoa: to_regclass hạ chữ thường mọi định danh KHÔNG có nháy kép,
  -- nên bắt buộc bọc nháy kép bên trong chuỗi, nếu không sẽ báo thiếu bảng dù bảng có thật.
  IF to_regclass('public."_backup_PrDetail_gop_20260817"') IS NULL
     OR to_regclass('public."_backup_Project_gop_20260817"') IS NULL
     OR to_regclass('public."_backup_PurchaseRequisition_gop_20260817"') IS NULL THEN
    RAISE EXCEPTION 'DỪNG: thiếu bảng ảnh chụp _backup_*_gop_20260817';
  END IF;
END $$;

-- ── Chốt 0b: ghi lại mốc ContractDetail NGAY LÚC MỞ giao dịch ────────────────
-- Không dùng hằng số cứng: số hợp đồng thay đổi theo hoạt động hằng ngày của
-- ứng dụng, hằng số nhớ từ phiên trước sẽ bắn nhầm. Điều cần bảo đảm là việc gộp
-- KHÔNG làm số này đổi, chứ không phải nó bằng một con số cụ thể nào.
CREATE TEMP TABLE _moc_truoc ON COMMIT DROP AS SELECT count(*) AS n_ct FROM "ContractDetail";

-- ── Chốt 1: mốc đầu vào phải đúng như lúc điều tra ───────────────────────────
DO $$
DECLARE n_pd int; n_pr int; n_pj int;
BEGIN
  SELECT count(*) INTO n_pd FROM "PrDetail";
  SELECT count(*) INTO n_pr FROM "PurchaseRequisition";
  SELECT count(*) INTO n_pj FROM "Project";
  IF (n_pd, n_pr, n_pj) <> (6339, 107, 66) THEN
    RAISE EXCEPTION 'DỪNG: mốc đầu vào lệch — PrDetail=% (chờ 6339), PR=% (chờ 107), Project=% (chờ 66)', n_pd, n_pr, n_pj;
  END IF;
END $$;

-- ── Chốt 2: bên PKG-* phải sạch tham chiếu, kiểm LẠI ngay trong giao dịch ────
DO $$
DECLARE n int;
BEGIN
  WITH b AS (SELECT id FROM "Project" WHERE code IN ('PKG-009','PKG-068','PKG-075')),
       bp AS (SELECT r.id FROM "PurchaseRequisition" r JOIN b ON b.id=r."projectId"),
       bd AS (SELECT d.id FROM "PrDetail" d JOIN bp ON bp.id=d."prId")
  SELECT (SELECT count(*) FROM "ContractDetail" WHERE "prDetailId" IN (SELECT id FROM bd))
       + (SELECT count(*) FROM "ContractDetail" WHERE "projectCode" IN ('PKG-009','PKG-068','PKG-075'))
       + (SELECT count(*) FROM "BidAnalysis" WHERE "projectId" IN (SELECT id FROM b) OR "prId" IN (SELECT id FROM bp) OR "prDetailId" IN (SELECT id FROM bd))
       + (SELECT count(*) FROM "BidAnalysisPrLink" WHERE "prDetailId" IN (SELECT id FROM bd))
       + (SELECT count(*) FROM "PrDetailFabAllocation" WHERE "prDetailId" IN (SELECT id FROM bd))
       + (SELECT count(*) FROM "TechComment" WHERE "prDetailId" IN (SELECT id FROM bd))
       + (SELECT count(*) FROM "HardPegging" WHERE "prDetailId" IN (SELECT id FROM bd))
       + (SELECT count(*) FROM "FabricationCategory" WHERE "projectId" IN (SELECT id FROM b))
       + (SELECT count(*) FROM "ProjectBudget" WHERE "projectId" IN (SELECT id FROM b))
       + (SELECT count(*) FROM "PaymentSchedule" WHERE "projectId" IN (SELECT id FROM b))
    INTO n;
  IF n <> 0 THEN
    RAISE EXCEPTION 'DỪNG: bên PKG-* còn % tham chiếu, xoá sẽ mất dữ liệu', n;
  END IF;
END $$;

-- ── Chốt 3: bên PKG-* không được có mã vật tư nào mà bên giữ chưa có ─────────
DO $$
DECLARE n int;
BEGIN
  WITH m AS (
    SELECT CASE WHEN p.code LIKE 'PKG-%' THEN 'B' ELSE 'A' END AS ben,
           regexp_replace(p.code,'^PKG-','') AS goi,
           upper(regexp_replace(regexp_replace(d."itemCode",'^(068|075|009|MCDD)-',''),'[^A-Z0-9]','','gi')) AS k
    FROM "PrDetail" d
    JOIN "PurchaseRequisition" r ON r.id=d."prId"
    JOIN "Project" p ON p.id=r."projectId"
    WHERE p.code IN ('009','PKG-009','068','PKG-068','075','PKG-075'))
  SELECT count(*) INTO n
  FROM (SELECT goi,k FROM m WHERE ben='B' EXCEPT SELECT goi,k FROM m WHERE ben='A') x;
  IF n <> 0 THEN
    RAISE EXCEPTION 'DỪNG: bên PKG-* có % mã vật tư KHÔNG có ở bên giữ — phải bổ sung trước khi xoá', n;
  END IF;
END $$;

-- ── Việc 1: bổ sung ngược 4 ô mác vật liệu của 068 ───────────────────────────
UPDATE "PrDetail" a
   SET grade = 'BRASS-JIS -C2600 OR C2680', "updatedAt" = now()
 WHERE a."itemCode" IN ('A-1','A-2','A-3','A-4')
   AND a.grade = 'BRASS'
   AND a."prId" = (SELECT r.id FROM "PurchaseRequisition" r
                     JOIN "Project" p ON p.id=r."projectId" WHERE p.code='068');

-- ── Việc 2: xoá bên PKG-* (dòng -> phiếu -> dự án) ───────────────────────────
DELETE FROM "PrDetail" d
 USING "PurchaseRequisition" r, "Project" p
 WHERE d."prId"=r.id AND r."projectId"=p.id AND p.code IN ('PKG-009','PKG-068','PKG-075');

DELETE FROM "PurchaseRequisition" r
 USING "Project" p
 WHERE r."projectId"=p.id AND p.code IN ('PKG-009','PKG-068','PKG-075');

DELETE FROM "Project" WHERE code IN ('PKG-009','PKG-068','PKG-075');

-- ── Chốt 4: mốc đầu ra phải khớp từng con số, lệch là huỷ cả giao dịch ───────
DO $$
DECLARE n_pd int; n_pr int; n_pj int; n_grade int; n_ct int; n_ct_dau int;
BEGIN
  SELECT count(*) INTO n_pd FROM "PrDetail";
  SELECT count(*) INTO n_pr FROM "PurchaseRequisition";
  SELECT count(*) INTO n_pj FROM "Project";
  SELECT count(*) INTO n_grade FROM "PrDetail" WHERE grade='BRASS-JIS -C2600 OR C2680' AND "itemCode" IN ('A-1','A-2','A-3','A-4');
  SELECT count(*) INTO n_ct FROM "ContractDetail";
  SELECT n_ct_truoc.n_ct INTO n_ct_dau FROM _moc_truoc AS n_ct_truoc;
  IF n_pd <> 6052 THEN RAISE EXCEPTION 'DỪNG: PrDetail=% (chờ 6052)', n_pd; END IF;
  IF n_pr <> 104  THEN RAISE EXCEPTION 'DỪNG: PurchaseRequisition=% (chờ 104)', n_pr; END IF;
  IF n_pj <> 63   THEN RAISE EXCEPTION 'DỪNG: Project=% (chờ 63)', n_pj; END IF;
  IF n_grade <> 4 THEN RAISE EXCEPTION 'DỪNG: mác đồng thau=% (chờ 4)', n_grade; END IF;
  IF n_ct <> n_ct_dau THEN RAISE EXCEPTION 'DỪNG: ContractDetail đổi từ % thành % — việc gộp đã cuốn mất hợp đồng', n_ct_dau, n_ct; END IF;
  RAISE NOTICE 'ĐẠT: PrDetail=% PR=% Project=% mác đồng thau=% ContractDetail=% (không đổi)', n_pd, n_pr, n_pj, n_grade, n_ct;
END $$;

COMMIT;
