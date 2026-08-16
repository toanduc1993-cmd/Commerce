const prisma = require('../lib/prisma');

// ═══════════════════════════════════════════════════════════════════════════
// HÀM DÙNG CHUNG — thêm 16/08/2026 khi dựng lưới phân bổ.
// ═══════════════════════════════════════════════════════════════════════════

/** Đọc một số thực từ thân yêu cầu. Rỗng / không đọc được → 0. */
const soThuc = (v) => {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Đọc một mốc ngày. Trả về:
 *   null      — ô để trống, cố ý xoá ngày
 *   Date      — đọc được
 *   undefined — CÓ gửi giá trị nhưng KHÔNG đọc được (gọi phải báo lỗi, không âm thầm bỏ)
 */
const docNgay = (v) => {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** Ô rỗng = không số lượng, không khối lượng, không ngày → xoá khỏi cơ sở dữ liệu. */
const oRong = (qty, weight, ngay) => qty === 0 && weight === 0 && !ngay;

/**
 * GET /api/v1/prs/:prId/fab-allocations
 * Lấy toàn bộ phân bổ hạng mục gia công của một PR
 * Response: { prId, items: [{ prDetailId, itemCode, allocations: [{ categoryCode, qty, weight }] }] }
 */
const getFabAllocations = async (req, res, next) => {
  try {
    const { prId } = req.params;

    const prDetails = await prisma.prDetail.findMany({
      where: { prId },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        profile: true,
        uom: true,
        reqQty: true,
        reqWeight: true,
        fabAllocations: {
          include: {
            fabricationCategory: {
              select: { id: true, code: true, name: true, sortOrder: true },
            },
          },
          orderBy: { fabricationCategory: { sortOrder: 'asc' } },
        },
      },
      orderBy: { itemCode: 'asc' },
    });

    const items = prDetails.map((d) => ({
      prDetailId: d.id,
      itemCode: d.itemCode,
      itemName: d.itemName,
      profile: d.profile,
      uom: d.uom,
      reqQty: d.reqQty,
      reqWeight: d.reqWeight,
      totalAllocatedQty: d.fabAllocations.reduce((s, a) => s + a.qty, 0),
      totalAllocatedWeight: d.fabAllocations.reduce((s, a) => s + a.weight, 0),
      allocations: d.fabAllocations.map((a) => ({
        id: a.id,
        categoryId: a.fabricationCategoryId,
        categoryCode: a.fabricationCategory.code,
        categoryName: a.fabricationCategory.name,
        qty: a.qty,
        weight: a.weight,
        ngayCanTaiCongTruong: a.ngayCanTaiCongTruong,
      })),
    }));

    res.status(200).json({ success: true, prId, count: items.length, items });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/prs/details/:prDetailId/fab-allocations
 * Lấy phân bổ của 1 PrDetail cụ thể
 */
const getFabAllocationsForDetail = async (req, res, next) => {
  try {
    const { prDetailId } = req.params;

    const detail = await prisma.prDetail.findUnique({
      where: { id: prDetailId },
      include: {
        fabAllocations: {
          include: { fabricationCategory: true },
          orderBy: { fabricationCategory: { sortOrder: 'asc' } },
        },
      },
    });

    if (!detail) return res.status(404).json({ success: false, error: 'PrDetail không tồn tại.' });

    const totalAllocated = detail.fabAllocations.reduce((s, a) => s + a.qty, 0);
    const remaining = detail.reqQty - totalAllocated;

    res.status(200).json({
      success: true,
      prDetailId,
      itemCode: detail.itemCode,
      reqQty: detail.reqQty,
      totalAllocatedQty: totalAllocated,
      remainingQty: remaining,
      isFullyAllocated: remaining <= 0,
      allocations: detail.fabAllocations.map((a) => ({
        id: a.id,
        categoryId: a.fabricationCategoryId,
        categoryCode: a.fabricationCategory.code,
        categoryName: a.fabricationCategory.name,
        qty: a.qty,
        weight: a.weight,
        ngayCanTaiCongTruong: a.ngayCanTaiCongTruong,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/prs/details/:prDetailId/fab-allocations
 * Lưu (upsert) toàn bộ phân bổ hạng mục cho 1 PrDetail
 * Body: { allocations: [{ fabricationCategoryId, qty, weight }] }
 *
 * Business rule: SUM(qty) <= PrDetail.reqQty
 */
const saveFabAllocations = async (req, res, next) => {
  try {
    const { prDetailId } = req.params;
    const { allocations } = req.body;

    if (!allocations || !Array.isArray(allocations)) {
      return res.status(400).json({ error: 'Body phải có field allocations (array).' });
    }

    const detail = await prisma.prDetail.findUnique({ where: { id: prDetailId } });
    if (!detail) return res.status(404).json({ success: false, error: 'PrDetail không tồn tại.' });

    // Validate: tổng qty không vượt reqQty
    const totalQty = allocations.reduce((s, a) => s + (parseFloat(a.qty) || 0), 0);
    if (totalQty > detail.reqQty + 0.001) {
      // tolerance nhỏ cho float
      return res.status(400).json({
        success: false,
        error: `Tổng phân bổ (${totalQty.toFixed(3)} ${detail.uom}) vượt số lượng yêu cầu mua (${detail.reqQty} ${detail.uom}).`,
        totalQty,
        reqQty: detail.reqQty,
        overage: totalQty - detail.reqQty,
      });
    }

    // 16/08/2026 — kiểm ngày TRƯỚC khi mở giao dịch, để một ngày sai không ghi được nửa vời.
    for (const alloc of allocations) {
      if (!alloc?.fabricationCategoryId) continue;
      if (docNgay(alloc.ngayCanTaiCongTruong) === undefined) {
        return res.status(400).json({
          success: false,
          error: `Ngày cần tại công trường không đọc được: "${alloc.ngayCanTaiCongTruong}".`,
        });
      }
    }

    // Upsert trong transaction
    await prisma.$transaction(async (tx) => {
      for (const alloc of allocations) {
        const { fabricationCategoryId, qty, weight } = alloc;
        if (!fabricationCategoryId) continue;

        const qtyVal = soThuc(qty);
        const weightVal = soThuc(weight);
        const ngay = docNgay(alloc.ngayCanTaiCongTruong);

        // 16/08/2026 — trước đây chỉ cần qty = 0 là xoá, nên một ô có khối lượng
        // mà chưa điền số lượng sẽ bị mất trắng. Nay phải rỗng cả ba mới xoá.
        if (oRong(qtyVal, weightVal, ngay)) {
          await tx.prDetailFabAllocation.deleteMany({
            where: { prDetailId, fabricationCategoryId },
          });
        } else {
          await tx.prDetailFabAllocation.upsert({
            where: {
              prDetailId_fabricationCategoryId: { prDetailId, fabricationCategoryId },
            },
            update: { qty: qtyVal, weight: weightVal, ngayCanTaiCongTruong: ngay },
            create: {
              prDetailId,
              fabricationCategoryId,
              qty: qtyVal,
              weight: weightVal,
              ngayCanTaiCongTruong: ngay,
            },
          });
        }
      }
    });

    // Audit log
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          action: 'UPDATE_FAB_ALLOCATION',
          userId: req.user.id,
          entityType: 'PrDetail',
          entityId: prDetailId,
          details: JSON.stringify({ allocations, totalQty }),
        },
      });
    }

    // Trả về trạng thái sau khi lưu
    const updated = await prisma.prDetailFabAllocation.findMany({
      where: { prDetailId },
      include: { fabricationCategory: { select: { code: true, name: true } } },
      orderBy: { fabricationCategory: { sortOrder: 'asc' } },
    });

    res.status(200).json({
      success: true,
      message: `Đã lưu ${updated.length} phân bổ hạng mục cho ${detail.itemCode}.`,
      totalAllocatedQty: totalQty,
      remainingQty: detail.reqQty - totalQty,
      isFullyAllocated: Math.abs(detail.reqQty - totalQty) < 0.001,
      allocations: updated.map((a) => ({
        categoryCode: a.fabricationCategory.code,
        categoryName: a.fabricationCategory.name,
        qty: a.qty,
        weight: a.weight,
        ngayCanTaiCongTruong: a.ngayCanTaiCongTruong,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/prs/details/:prDetailId/fab-allocations
 * Xóa toàn bộ phân bổ của 1 PrDetail (reset)
 */
const clearFabAllocations = async (req, res, next) => {
  try {
    const { prDetailId } = req.params;
    const result = await prisma.prDetailFabAllocation.deleteMany({ where: { prDetailId } });
    res
      .status(200)
      .json({ success: true, deleted: result.count, message: `Đã xóa ${result.count} phân bổ.` });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/projects/:projectId/fab-categories
 * Lấy danh sách hạng mục gia công của một project
 */
const getProjectFabCategories = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const cats = await prisma.fabricationCategory.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true, sortOrder: true },
    });
    res.status(200).json({ success: true, projectId, count: cats.length, categories: cats });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// QUẢN LÝ DANH MỤC HẠNG MỤC CHẾ TẠO — thêm 15/08/2026
// Anh Hưng chốt phương án B: mỗi dự án có bộ hạng mục riêng, khai ở đây.
// Trước đây chỉ có đầu đọc; muốn thêm hạng mục phải sửa thẳng cơ sở dữ liệu.
// ═══════════════════════════════════════════════════════════════════════════

/** Chuẩn hoá một dòng hạng mục từ thân yêu cầu hoặc từ file Excel. */
const chuanHoaHangMuc = (row, i) => {
  const code = String(row.code ?? row['Mã hạng mục'] ?? '').trim();
  const name = String(row.name ?? row['Tên hạng mục'] ?? '').trim();
  const thu = row.sortOrder ?? row['Thứ tự'];
  const ghiChu = row.ghiChu ?? row['Ghi chú'];
  return {
    code,
    name,
    sortOrder: Number.isFinite(Number(thu)) && String(thu).trim() !== '' ? Number(thu) : i + 1,
    ghiChu: ghiChu == null || String(ghiChu).trim() === '' ? null : String(ghiChu).trim(),
  };
};

/**
 * POST /api/v1/projects/:projectId/fab-categories
 * Thêm MỘT hạng mục.
 */
const createFabCategory = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const duAn = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!duAn) return res.status(404).json({ error: 'Không tìm thấy dự án' });

    const hm = chuanHoaHangMuc(req.body ?? {}, 0);
    if (!hm.code) return res.status(400).json({ error: 'Thiếu mã hạng mục' });
    if (!hm.name) return res.status(400).json({ error: 'Thiếu tên hạng mục' });

    const trung = await prisma.fabricationCategory.findFirst({
      where: { projectId, code: hm.code },
      select: { id: true },
    });
    if (trung) return res.status(409).json({ error: `Mã "${hm.code}" đã có trong dự án này` });

    const tao = await prisma.fabricationCategory.create({ data: { projectId, ...hm } });
    res.status(201).json({ success: true, category: tao });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/fab-categories/:id
 */
const updateFabCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cu = await prisma.fabricationCategory.findUnique({ where: { id } });
    if (!cu) return res.status(404).json({ error: 'Không tìm thấy hạng mục' });

    const hm = chuanHoaHangMuc({ ...cu, ...req.body }, (cu.sortOrder ?? 1) - 1);
    if (!hm.code) return res.status(400).json({ error: 'Thiếu mã hạng mục' });
    if (!hm.name) return res.status(400).json({ error: 'Thiếu tên hạng mục' });

    if (hm.code !== cu.code) {
      const trung = await prisma.fabricationCategory.findFirst({
        where: { projectId: cu.projectId, code: hm.code, NOT: { id } },
        select: { id: true },
      });
      if (trung) return res.status(409).json({ error: `Mã "${hm.code}" đã có trong dự án này` });
    }

    const moi = await prisma.fabricationCategory.update({ where: { id }, data: hm });
    res.json({ success: true, category: moi });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/fab-categories/:id
 * Từ chối xoá nếu hạng mục đã có phân bổ — không để mất dữ liệu ngầm.
 */
const deleteFabCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const hm = await prisma.fabricationCategory.findUnique({ where: { id } });
    if (!hm) return res.status(404).json({ error: 'Không tìm thấy hạng mục' });

    const soPhanBo = await prisma.prDetailFabAllocation.count({ where: { fabricationCategoryId: id } });
    if (soPhanBo > 0) {
      return res.status(409).json({
        error: `Hạng mục "${hm.code}" đang có ${soPhanBo} dòng phân bổ. Gỡ phân bổ trước rồi mới xoá được.`,
        soPhanBo,
      });
    }

    await prisma.fabricationCategory.delete({ where: { id } });
    res.json({ success: true, deleted: hm.code });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/projects/:projectId/fab-categories/import
 * Nhập hàng loạt. Trùng mã trong cùng dự án thì CẬP NHẬT, không đẻ dòng mới.
 * Thân: { rows: [{ code, name, sortOrder?, ghiChu? }] }
 */
const importFabCategories = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const duAn = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, code: true } });
    if (!duAn) return res.status(404).json({ error: 'Không tìm thấy dự án' });

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows || rows.length === 0) return res.status(400).json({ error: 'Không có dòng nào để nhập' });
    if (rows.length > 500) return res.status(400).json({ error: 'Tối đa 500 dòng một lần nhập' });

    const hopLe = [];
    const loi = [];
    const daThay = new Set();
    rows.forEach((r, i) => {
      const hm = chuanHoaHangMuc(r, i);
      const dong = i + 2; // dòng 1 là tiêu đề trong file Excel
      if (!hm.code) return loi.push({ dong, ly_do: 'thiếu mã hạng mục' });
      if (!hm.name) return loi.push({ dong, ly_do: `mã "${hm.code}" thiếu tên hạng mục` });
      if (daThay.has(hm.code)) return loi.push({ dong, ly_do: `mã "${hm.code}" bị lặp trong chính file` });
      daThay.add(hm.code);
      hopLe.push(hm);
    });

    if (hopLe.length === 0) {
      return res.status(400).json({ error: 'Không dòng nào hợp lệ', loi });
    }

    const ketQua = await prisma.$transaction(
      hopLe.map((hm) =>
        prisma.fabricationCategory.upsert({
          where: { projectId_code: { projectId, code: hm.code } },
          update: { name: hm.name, sortOrder: hm.sortOrder, ghiChu: hm.ghiChu },
          create: { projectId, ...hm },
        })
      )
    );

    res.json({
      success: true,
      duAn: duAn.code,
      soDongNhan: rows.length,
      soDongNhap: ketQua.length,
      soDongBoQua: loi.length,
      loi,
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// LƯỚI PHÂN BỔ CHẾ TẠO — thêm 16/08/2026
// Anh Hưng chốt phương án B: dòng = vật tư của dự án, cột = hạng mục của CHÍNH
// dự án đó, ô = số lượng · khối lượng · ngày cần vật tư tại công trường.
// Tiến độ đo bằng NGÀY: so ngày cần tại công trường với ngày hàng thực về
// (ContractDetail.arrivedDate).
// ═══════════════════════════════════════════════════════════════════════════

const MO_TA_VAT_TU = {
  id: true,
  itemCode: true,
  itemName: true,
  profile: true,
  grade: true,
  uom: true,
  reqQty: true,
  reqWeight: true,
  toBuyQty: true,
  requiredDate: true,
};

/**
 * GET /api/v1/projects/:projectId/fab-allocations
 * Toàn bộ dữ liệu để dựng lưới phân bổ của một dự án.
 */
const getProjectFabAllocations = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const duAn = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, code: true, name: true },
    });
    if (!duAn) return res.status(404).json({ success: false, error: 'Không tìm thấy dự án' });

    const hangMucs = await prisma.fabricationCategory.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true, sortOrder: true },
    });

    const chiTiets = await prisma.prDetail.findMany({
      where: { pr: { projectId } },
      select: {
        ...MO_TA_VAT_TU,
        pr: { select: { id: true, prRef: true, docNo: true, revNo: true } },
        fabAllocations: {
          select: { fabricationCategoryId: true, qty: true, weight: true, ngayCanTaiCongTruong: true },
        },
        // Ngày hàng thực về — mốc để đo tiến độ theo ngày.
        contracts: { select: { arrivedDate: true } },
      },
      orderBy: [{ pr: { docNo: 'asc' } }, { pr: { revNo: 'asc' } }, { itemCode: 'asc' }],
    });

    // Chỉ giữ ô thuộc hạng mục còn sống của dự án. Nếu một hạng mục bị xoá
    // (chỉ xoá được khi không còn phân bổ) thì ô mồ côi không lọt vào lưới.
    const hangMucSong = new Set(hangMucs.map((h) => h.id));

    const items = chiTiets.map((d) => {
      const o = {};
      let tongQty = 0;
      let tongWeight = 0;
      let ngayCanSomNhat = null;

      for (const a of d.fabAllocations) {
        if (!hangMucSong.has(a.fabricationCategoryId)) continue;
        o[a.fabricationCategoryId] = {
          qty: a.qty,
          weight: a.weight,
          ngayCan: a.ngayCanTaiCongTruong,
        };
        tongQty += a.qty;
        tongWeight += a.weight;
        if (a.ngayCanTaiCongTruong) {
          if (!ngayCanSomNhat || a.ngayCanTaiCongTruong < ngayCanSomNhat) {
            ngayCanSomNhat = a.ngayCanTaiCongTruong;
          }
        }
      }

      const ngayVe = d.contracts.map((c) => c.arrivedDate).filter(Boolean);
      const soDongHD = d.contracts.length;
      const soDongDaVe = ngayVe.length;
      // Hàng về ĐỦ mới tính là về: lấy mốc muộn nhất, và chỉ khi mọi dòng hợp
      // đồng đều có ngày về. Còn một dòng chưa về thì vật tư chưa đủ để chế tạo.
      const ngayHangVe =
        soDongHD > 0 && soDongDaVe === soDongHD
          ? new Date(Math.max(...ngayVe.map((x) => x.getTime())))
          : null;

      return {
        prDetailId: d.id,
        prId: d.pr.id,
        prRef: d.pr.prRef,
        docNo: d.pr.docNo,
        revNo: d.pr.revNo,
        itemCode: d.itemCode,
        itemName: d.itemName,
        profile: d.profile,
        grade: d.grade,
        uom: d.uom,
        reqQty: d.reqQty,
        reqWeight: d.reqWeight,
        toBuyQty: d.toBuyQty,
        requiredDate: d.requiredDate,
        tongQty,
        tongWeight,
        conLai: d.reqQty - tongQty,
        // reqQty = 0 nghĩa là chưa có trần để đối chiếu, không phải "vượt trần".
        vuotTran: d.reqQty > 0 && tongQty > d.reqQty + 0.001,
        khongCoTran: d.reqQty <= 0,
        ngayCanSomNhat,
        ngayHangVe,
        soDongHD,
        soDongDaVe,
        o,
      };
    });

    const soODaPhanBo = items.reduce((s, i) => s + Object.keys(i.o).length, 0);

    res.status(200).json({
      success: true,
      duAn,
      hangMucs,
      soVatTu: items.length,
      soHangMuc: hangMucs.length,
      soODaPhanBo,
      items,
    });
  } catch (error) {
    next(error);
  }
};

/** Trần an toàn cho một lần lưu hàng loạt. */
const TRAN_SO_O = 2000;

/**
 * POST /api/v1/projects/:projectId/fab-allocations/bulk
 * Lưu nhiều ô của lưới trong MỘT giao dịch — tất cả hoặc không gì cả.
 * Thân: { cells: [{ prDetailId, fabricationCategoryId, qty, weight, ngayCanTaiCongTruong }] }
 */
const saveProjectFabAllocationsBulk = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const duAn = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, code: true },
    });
    if (!duAn) return res.status(404).json({ success: false, error: 'Không tìm thấy dự án' });

    const cells = Array.isArray(req.body?.cells) ? req.body.cells : null;
    if (!cells) {
      return res.status(400).json({ success: false, error: 'Thân yêu cầu phải có mảng cells.' });
    }
    if (cells.length === 0) {
      return res.status(400).json({ success: false, error: 'Không có ô nào để lưu.' });
    }
    if (cells.length > TRAN_SO_O) {
      return res.status(400).json({
        success: false,
        error: `Tối đa ${TRAN_SO_O} ô một lần lưu; lần này gửi ${cells.length} ô.`,
      });
    }

    // ── Hạng mục và vật tư PHẢI thuộc đúng dự án trên URL ────────────────────
    // Không tin id do trình duyệt gửi lên: đây là chốt chặn ghi chéo dự án.
    const hangMucs = await prisma.fabricationCategory.findMany({
      where: { projectId },
      select: { id: true, code: true },
    });
    const idHangMuc = new Set(hangMucs.map((h) => h.id));

    const idVatTu = [...new Set(cells.map((c) => String(c?.prDetailId ?? '')).filter(Boolean))];
    const vatTus = await prisma.prDetail.findMany({
      where: { id: { in: idVatTu }, pr: { projectId } },
      select: { id: true, itemCode: true, uom: true, reqQty: true },
    });
    const theoId = new Map(vatTus.map((d) => [d.id, d]));

    // ── Soát từng ô ──────────────────────────────────────────────────────────
    const loi = [];
    const oHopLe = [];
    const daThay = new Set();

    cells.forEach((c, i) => {
      const prDetailId = String(c?.prDetailId ?? '');
      const fabricationCategoryId = String(c?.fabricationCategoryId ?? '');
      const o = i + 1;

      if (!theoId.has(prDetailId)) {
        return loi.push({ o, ly_do: 'vật tư không có hoặc không thuộc dự án này' });
      }
      if (!idHangMuc.has(fabricationCategoryId)) {
        return loi.push({ o, ly_do: 'hạng mục không có hoặc không thuộc dự án này' });
      }

      const khoa = `${prDetailId}|${fabricationCategoryId}`;
      if (daThay.has(khoa)) return loi.push({ o, ly_do: 'ô này bị gửi trùng hai lần' });
      daThay.add(khoa);

      const ngay = docNgay(c?.ngayCanTaiCongTruong);
      if (ngay === undefined) {
        return loi.push({ o, ly_do: `ngày cần tại công trường không đọc được: "${c?.ngayCanTaiCongTruong}"` });
      }

      const qty = soThuc(c?.qty);
      const weight = soThuc(c?.weight);
      if (qty < 0 || weight < 0) {
        return loi.push({ o, ly_do: 'số lượng và khối lượng không được âm' });
      }

      oHopLe.push({ prDetailId, fabricationCategoryId, qty, weight, ngay });
    });

    if (loi.length > 0) {
      return res.status(400).json({
        success: false,
        error: `${loi.length} ô không hợp lệ — chưa ghi gì cả.`,
        loi,
      });
    }

    // ── Kiểm trần: gộp ô gửi lên với ô đã có sẵn trong cơ sở dữ liệu ──────────
    // Chỉ cộng những ô cũ KHÔNG bị lần lưu này ghi đè, rồi cộng giá trị mới.
    const daCo = await prisma.prDetailFabAllocation.findMany({
      where: { prDetailId: { in: idVatTu } },
      select: { prDetailId: true, fabricationCategoryId: true, qty: true },
    });
    const biGhiDe = new Set(oHopLe.map((o) => `${o.prDetailId}|${o.fabricationCategoryId}`));

    const tongTheoVatTu = new Map();
    const cong = (id, v) => tongTheoVatTu.set(id, (tongTheoVatTu.get(id) ?? 0) + v);
    for (const a of daCo) {
      if (!biGhiDe.has(`${a.prDetailId}|${a.fabricationCategoryId}`)) cong(a.prDetailId, a.qty);
    }
    for (const o of oHopLe) cong(o.prDetailId, o.qty);

    const vuot = [];
    const canhBao = [];
    for (const [id, tong] of tongTheoVatTu) {
      const d = theoId.get(id);
      if (!d) continue;
      if (d.reqQty > 0) {
        if (tong > d.reqQty + 0.001) {
          vuot.push({
            itemCode: d.itemCode,
            uom: d.uom,
            tongPhanBo: Number(tong.toFixed(3)),
            reqQty: d.reqQty,
            vuot: Number((tong - d.reqQty).toFixed(3)),
          });
        }
      } else if (tong > 0) {
        // Không chặn: 9/507 vật tư của VPI-095 có reqQty = 0 nên không có trần
        // để đối chiếu. Chặn thì không nhập được gì; im lặng thì giấu mất.
        canhBao.push({
          itemCode: d.itemCode,
          ly_do: 'vật tư chưa có số lượng yêu cầu mua nên không đối chiếu được trần',
        });
      }
    }

    if (vuot.length > 0) {
      return res.status(400).json({
        success: false,
        error: `${vuot.length} vật tư có tổng phân bổ vượt số lượng yêu cầu mua — chưa ghi gì cả.`,
        vuot,
      });
    }

    // ── Ghi: một giao dịch, tất cả hoặc không gì cả ───────────────────────────
    const dsXoa = oHopLe.filter((o) => oRong(o.qty, o.weight, o.ngay));
    const dsGhi = oHopLe.filter((o) => !oRong(o.qty, o.weight, o.ngay));

    const viec = [];
    if (dsXoa.length > 0) {
      viec.push(
        prisma.prDetailFabAllocation.deleteMany({
          where: {
            OR: dsXoa.map((o) => ({
              prDetailId: o.prDetailId,
              fabricationCategoryId: o.fabricationCategoryId,
            })),
          },
        })
      );
    }
    for (const o of dsGhi) {
      viec.push(
        prisma.prDetailFabAllocation.upsert({
          where: {
            prDetailId_fabricationCategoryId: {
              prDetailId: o.prDetailId,
              fabricationCategoryId: o.fabricationCategoryId,
            },
          },
          update: { qty: o.qty, weight: o.weight, ngayCanTaiCongTruong: o.ngay },
          create: {
            prDetailId: o.prDetailId,
            fabricationCategoryId: o.fabricationCategoryId,
            qty: o.qty,
            weight: o.weight,
            ngayCanTaiCongTruong: o.ngay,
          },
        })
      );
    }
    if (req.user) {
      viec.push(
        prisma.auditLog.create({
          data: {
            action: 'UPDATE_FAB_ALLOCATION_BULK',
            userId: req.user.id,
            entityType: 'Project',
            entityId: projectId,
            // Chỉ ghi số đếm — thân đầy đủ có thể tới 2.000 ô.
            details: JSON.stringify({
              duAn: duAn.code,
              soOGhi: dsGhi.length,
              soOXoa: dsXoa.length,
              soVatTu: tongTheoVatTu.size,
            }),
          },
        })
      );
    }

    const ketQua = await prisma.$transaction(viec);
    const soOXoa = dsXoa.length > 0 ? (ketQua[0]?.count ?? 0) : 0;

    res.status(200).json({
      success: true,
      message: `Đã lưu ${dsGhi.length} ô, xoá ${soOXoa} ô trống.`,
      soOGhi: dsGhi.length,
      soOXoa,
      soVatTu: tongTheoVatTu.size,
      canhBao,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFabAllocations,
  getFabAllocationsForDetail,
  saveFabAllocations,
  clearFabAllocations,
  getProjectFabCategories,
  createFabCategory,
  updateFabCategory,
  deleteFabCategory,
  importFabCategories,
  getProjectFabAllocations,
  saveProjectFabAllocationsBulk,
};
