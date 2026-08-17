'use client';

/**
 * PR090DetailView — bảng chi tiết theo format file PR 090
 *
 * GIỮ NGUYÊN 100% cấu trúc cột gốc từ module /theo-doi-vat-tu:
 *  - Sticky left columns (STT, Description, Profile)
 *  - Net Quantity (Qty + Weight)
 *  - Previous Ordered (Qty + Weight)
 *  - 9 cột "Dự trù lần 0-8" (Qty + Weight) — toggle ẩn/hiện
 *  - Total Ordered (Qty + Weight)
 *  - Remarks
 *  - 18 fab area cols: INLET, SCR, BURNER, BASE PLATE, OUTLET DUCT, TOP BEAM,
 *    BOX 1-6, STACK, STAIR TOWER, BUMPER, SCR BAFER-FRAME, ATTIC-BASEMENT, FIELD TOP SPOOL
 *  - Summary: QTY/1U, QTY/2U, WEIGHT/1U, WEIGHT/2U
 *  - Group by category (VTC01-04, VPK, VDK)
 *  - Grand total row
 *
 * Data: nhận `prs: PRDetail[]` từ parent và map sang cấu trúc VatTuItem
 * — đồng bộ với tab Workflow (cùng nguồn, cùng filter project).
 */

import { Fragment, useState, useMemo } from 'react';
import Link from 'next/link';
import type { PRDetail } from '@/types/procurement';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface DuTruRev {
  lan: number; // 0, 1, 2, ..., 8
  qty: number;
  weight: number;
  revNote?: string;
}

interface FabAlloc {
  code: string;
  name: string;
  qty: number;
  weight: number;
}

interface VatTuItem {
  /** 17/08: mã phiếu PR của dòng — dùng cho lối tắt sang bước 1b và 1c. */
  prId: string;
  prRef: string;
  /** 17/08: mã dự án của dòng. Trước đây bảng gộp mọi dự án mà không cột nào
   *  cho biết dòng thuộc dự án nào — sau khi nạp 63 dự án thì không đọc nổi. */
  duAn: string;
  id: string;
  stt: string; // I95-VTC01-001
  description: string; // Tôn tấm
  profile: string; // PL10x2000X12000
  grade: string; // SS400 | A572-GR50
  unit: string; // m2 | m | pcs | kg
  unitWeight: number; // Kg/m2,m,pcs
  netQty: number;
  netWeight: number;
  previousQty: number;
  previousWeight: number;
  duTruRevs: DuTruRev[];
  totalQty: number;
  totalWeight: number;
  remarks: string;
  fabAllocs: FabAlloc[];
  qty1U: number;
  qty2U: number;
  weight1U: number;
  weight2U: number;
}

interface CategoryGroup {
  code: string; // VTC01 | VTC02 | VTC03 | VTC04 | VPK | VDK
  nameVi: string; // Vật tư chính thép đen
  nameEn: string; // Main-Material
  items: VatTuItem[];
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

// 15/08/2026 — 18 vùng chế tạo ghi cứng ĐÃ GỠ.
// Chúng là hạng mục của đúng MỘT dự án (hệ SCR của VPI-095, đuôi -U1). Dự án
// BRA-090 chỉ có 3 hạng mục hoàn toàn khác mà vẫn bị gán 18 cột kia; 10 dự án
// còn lại chưa khai hạng mục nào. Mã ghi cứng cũng không trùng mã trong cơ sở
// dữ liệu (BOX1-U1 vs BOX-1) nên phân bổ nhập vào cũng không bao giờ hiện ra.
// Anh Hưng chốt phương án B: hạng mục và phân bổ chuyển sang màn riêng
// /hang-muc-che-tao, mỗi dự án một bộ cột của chính nó.

const DU_TRU_REVS = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // 9 lần dự trù

// Khớp với materialDetector của backend (VTC01-04, VPK01-02, VDK01-03, ...)
const CATEGORY_DEFS: Omit<CategoryGroup, 'items'>[] = [
  { code: 'VTC01', nameEn: 'Main-Material (Black Steel)', nameVi: 'Vật tư chính thép đen' },
  { code: 'VTC02', nameEn: 'Main-Material (Alloy)', nameVi: 'Vật tư chính thép hợp kim' },
  { code: 'VTC03', nameEn: 'Gratting-Material', nameVi: 'Vật tư gratting' },
  { code: 'VTC04', nameEn: 'Insulation-Material', nameVi: 'Vật tư bảo ôn' },
  { code: 'VPK01', nameEn: 'Structure Accessory', nameVi: 'Phụ kiện kết cấu' },
  { code: 'VPK02', nameEn: 'Bolt/Nut/Washer', nameVi: 'Bu lông, ecu, vòng đệm' },
  { code: 'VDK01', nameEn: 'Packing Steel', nameVi: 'Thép đóng kiện' },
  { code: 'VDK02', nameEn: 'Packing Accessory', nameVi: 'Phụ kiện đóng kiện' },
  { code: 'VDK03', nameEn: 'Other Items', nameVi: 'Hạng mục khác' },
  { code: 'VBP01', nameEn: 'Temporary Works', nameVi: 'Vật tư biện pháp' },
  { code: 'VTH01', nameEn: 'Welding Consumables', nameVi: 'Vật tư tiêu hao (hàn)' },
  { code: 'VTS01', nameEn: 'Surface Treatment', nameVi: 'Sơn & xử lý bề mặt' },
  { code: 'VTP01', nameEn: 'Spare/Reserve', nameVi: 'Vật tư dự phòng' },
];

// ─── MAPPER: PRDetail[] → CategoryGroup[] ────────────────────────────────────

/**
 * Chuyển PRDetail[] thực tế sang cấu trúc CategoryGroup[] cho bảng PR-090.
 * - Group theo materialSubGroupCode (VTC01, VTC02, VPK01, ...) nếu có
 * - Fallback về materialGroupCode hoặc 'OTHER'
 * - Các trường không có trong schema (duTruRevs, previousOrdered, qty1U/2U) để trống
 */
function prsToGroups(prs: PRDetail[]): CategoryGroup[] {
  const byCode = new Map<string, VatTuItem[]>();

  for (const pr of prs) {
    const code = pr.materialSubGroupCode || pr.materialGroupCode || 'OTHER';
    if (!byCode.has(code)) byCode.set(code, []);

    // Map PRDetail → VatTuItem
    const item: VatTuItem = {
      id: pr.id,
      prId: pr.pr?.id ?? '',
      prRef: pr.pr?.prRef ?? '',
      duAn: pr.pr?.project?.code ?? '—',
      stt: pr.itemCode,
      description: pr.itemName,
      profile: pr.profile || '',
      grade: pr.grade || '',
      unit: pr.uom || '',
      unitWeight: pr.unitWeight || 0,
      netQty: pr.netQty || 0,
      netWeight: pr.netWeight || 0,
      previousQty: 0, // backend chưa có field này
      previousWeight: 0,
      duTruRevs: DU_TRU_REVS.map((lan) => ({ lan, qty: 0, weight: 0 })), // chưa có data
      totalQty: pr.reqQty || 0,
      totalWeight: pr.reqWeight || 0,
      remarks: pr.remarks || '',
      fabAllocs: (pr.fabAllocations || []).map((a) => ({
        code: a.categoryCode,
        name: a.categoryName,
        qty: a.qty,
        weight: a.weight,
      })),
      qty1U: 0, // chưa có trong schema
      qty2U: 0,
      weight1U: 0,
      weight2U: 0,
    };

    byCode.get(code)!.push(item);
  }

  // Sắp xếp theo CATEGORY_DEFS, group không match đẩy xuống cuối
  const result: CategoryGroup[] = [];
  for (const def of CATEGORY_DEFS) {
    const items = byCode.get(def.code);
    if (items && items.length > 0) {
      result.push({ ...def, items });
      byCode.delete(def.code);
    }
  }
  // Group còn lại không khớp CATEGORY_DEFS
  for (const [code, items] of byCode.entries()) {
    if (items.length > 0) {
      result.push({ code, nameEn: 'Other', nameVi: 'Khác', items });
    }
  }
  return result;
}

// ─── HELPER: format numbers ───────────────────────────────────────────────────

const fmt = (v: number, dec = 2) =>
  v === 0 ? '' : v.toLocaleString('vi-VN', { maximumFractionDigits: dec });

// ─── TABLE CELL BASE STYLE ────────────────────────────────────────────────────

const TD = 'border border-slate-300 text-right text-[9px] px-1 py-0.5 whitespace-nowrap';
const TH =
  'border border-slate-400 text-center text-[8.5px] font-black px-1 py-1 bg-[#1B365D] text-white whitespace-nowrap';
const TH2 =
  'border border-slate-400 text-center text-[8px] font-bold px-1 py-0.5 bg-[#2a5298] text-white whitespace-nowrap';
const TH_FAB =
  'border border-slate-400 text-center text-[7.5px] font-black px-1 py-1 bg-[#0f4c81] text-white whitespace-nowrap max-w-[70px]';
const TD_LEFT = 'border border-slate-300 text-left text-[9px] px-1 py-0.5 whitespace-nowrap';
const TD_STICKY = `${TD_LEFT} sticky bg-white z-10`;

// ─── BA CỘT DÍNH BÊN TRÁI ─────────────────────────────────────────────────────
// 15/08/2026 — bản cũ ghi mốc bằng lớp Tailwind tĩnh (left-0 / left-20 / left-[11rem]
// = 0 / 80 / 176px) nhưng bề rộng cột lại do trình duyệt tự nới theo nội dung
// (đo được 144 / 309 / 480px vì TD_LEFT có whitespace-nowrap). Mốc không khớp bề
// rộng ⇒ cột 2 đè cột 1 64px, cột 3 đè cột 2 213px — ở CẢ tiêu đề lẫn thân bảng.
// Nhãn tiêu đề căn giữa nên bị chôn hẳn, dữ liệu căn trái thì ló ra ⇒ nhìn như
// tiêu đề lệch dữ liệu một cột.
// Cách chữa: ghim cứng width + minWidth + maxWidth, mốc tính từ chính bề rộng đó,
// nội dung dài thì cắt bằng truncate và giữ đủ ở thuộc tính title.
// 17/08: cột mã vật tư nay chứa thêm 2 lối tắt (1b, 1c) nên nới 96 → 132.
// Bài học từ bảng theo dõi hôm 15/08: thêm biểu tượng mà không nới là mã bị cắt
// cụt thành "195-VPK…".
const STICKY_W = { duAn: 104, stt: 132, desc: 168, profile: 208 } as const;
const STICKY_LEFT = {
  duAn: 0,
  stt: STICKY_W.duAn,                                        // 104
  desc: STICKY_W.duAn + STICKY_W.stt,                        // 200
  profile: STICKY_W.duAn + STICKY_W.stt + STICKY_W.desc,     // 368
} as const;
const pin = (k: keyof typeof STICKY_W) => ({
  left: STICKY_LEFT[k],
  width: STICKY_W[k],
  minWidth: STICKY_W[k],
  maxWidth: STICKY_W[k],
});
const GROUP_ROW =
  'bg-[#dbeafe] border border-slate-400 text-[9px] font-black text-[#1B365D] px-2 py-1.5';

// ─── COMPONENT ────────────────────────────────────────────────────────────────

interface PR090DetailViewProps {
  prs: PRDetail[];
  isLoading?: boolean;
}

export function PR090DetailView({ prs, isLoading }: PR090DetailViewProps) {
  const [showAllRevs, setShowAllRevs] = useState(false);

  // Map data theo project đang chọn
  const groups = useMemo(() => prsToGroups(prs), [prs]);

  const visibleRevs = showAllRevs ? DU_TRU_REVS : [];

  // 17/08 — anh Hưng: "chọn 1 loại vật tư thì không biết đang mua cho những dự án nào".
  // Đây là danh sách dự án của ĐÚNG tập dòng đang hiện (đã qua tìm kiếm và bộ lọc),
  // nên khi gõ tên một loại vật tư là thấy ngay nó đang mua cho những dự án nào.
  const duAnDangHien = useMemo(() => {
    const dem = new Map<string, number>();
    for (const g of groups) for (const i of g.items) dem.set(i.duAn, (dem.get(i.duAn) ?? 0) + 1);
    return [...dem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [groups]);

  const grandTotalItems = groups.reduce((s, g) => s + g.items.length, 0);
  const grandTotalWeight = groups.reduce(
    (s, g) => s + g.items.reduce((ss, i) => ss + i.netWeight, 0),
    0
  );

  // Empty state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
        Đang tải dữ liệu PR…
      </div>
    );
  }

  if (prs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
        <span className="material-symbols-outlined text-[48px] opacity-30">inventory_2</span>
        <div className="text-sm font-medium">Chưa có dữ liệu PR</div>
        <div className="text-[10px]">Upload file PR hoặc chọn dự án khác để xem</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Controls bar ───────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 bg-white px-4 py-2 flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
            Format PR 090:
          </span>
          <div className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-600">
            {grandTotalItems} mã vật tư
          </div>
          <div className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-600">
            {fmt(grandTotalWeight / 1000, 1)} tấn
          </div>
          <div className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-600">
            {groups.length} nhóm
          </div>
          <div
            className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#1B365D]/10 text-[#1B365D]"
            title={duAnDangHien.map(([m, n]) => `${m}: ${n} mã`).join('\n')}
          >
            {duAnDangHien.length} dự án
          </div>
          {duAnDangHien.length > 0 && duAnDangHien.length <= 6 && (
            <div className="flex items-center gap-1 text-[9px] text-slate-500">
              <span className="material-symbols-outlined text-[12px] text-slate-400">folder</span>
              {duAnDangHien.map(([m, n]) => (
                <span key={m} className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono">
                  {m} <span className="text-slate-400">{n}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowAllRevs((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold border transition-all ${
              showAllRevs
                ? 'bg-[#1B365D] text-white border-[#1B365D]'
                : 'bg-white border-slate-300 text-slate-600 hover:border-[#1B365D]'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">layers</span>
            {showAllRevs ? 'Thu gọn REV' : 'Xem tất cả 9 REV'}
          </button>

          <Link
            href="/hang-muc-che-tao"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-caption text-slate-600 hover:border-[#1B365D] hover:text-[#1B365D] transition-colors"
            title="Khai hạng mục chế tạo và phân bổ vật tư theo hạng mục"
          >
            <span className="material-symbols-outlined text-[15px]">category</span>
            Hạng mục chế tạo
          </Link>
        </div>
      </div>

      {/* ── Main table area ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-max">
          <table className="border-collapse text-[9px]" style={{ tableLayout: 'auto' }}>
            {/* ═══════════════ HEADER ═══════════════ */}
            <thead className="sticky top-0 z-20">
              {/* ── Row 1: Column group headers ─── */}
              <tr>
                <th rowSpan={2} className={`${TH} sticky z-30`} style={pin('duAn')}>
                  Dự án
                </th>
                <th rowSpan={2} className={`${TH} sticky z-30`} style={pin('stt')}>
                  Item/
                  <br />
                  STT
                </th>
                <th rowSpan={2} className={`${TH} sticky z-30`} style={pin('desc')}>
                  Description/
                  <br />
                  Chi tiết
                </th>
                <th rowSpan={2} className={`${TH} sticky z-30`} style={pin('profile')}>
                  Profile/
                  <br />
                  Vật tư
                </th>
                <th rowSpan={2} className={`${TH} w-28`}>
                  Grade/
                  <br />
                  Mác vật liệu
                </th>
                <th rowSpan={2} className={`${TH} w-14`}>
                  Unit/
                  <br />
                  Đơn vị
                </th>
                <th rowSpan={2} className={`${TH} w-20`}>
                  U.Weight/
                  <br />
                  Đ.Trọng
                  <br />
                  (Kg/m²,m,pcs)
                </th>

                {/* Net Quantity */}
                <th colSpan={2} className={`${TH} bg-[#1e4976]`}>
                  Net Quantity/
                  <br />
                  Số lượng tinh
                </th>

                {/* Previous Ordered */}
                <th colSpan={2} className={`${TH} bg-[#37547a]`}>
                  Previous Ordered/
                  <br />
                  Đã dự trù
                </th>

                {/* Current Ordered — each rev */}
                {visibleRevs.map((rev) => (
                  <th key={rev} colSpan={2} className={`${TH} bg-[#1d3f6b] text-[8px]`}>
                    Current Ordered/
                    <br />
                    Dự trù lần {rev}
                  </th>
                ))}

                {/* Total Ordered */}
                <th colSpan={2} className={`${TH} bg-[#0d2b4e]`}>
                  Total Ordered/
                  <br />
                  Tổng dự trù
                </th>

                {/* Remarks */}
                <th rowSpan={2} className={`${TH} w-32`}>
                  Remarks/
                  <br />
                  Ghi chú
                </th>

                {/* Fab areas */}

                {/* Summary */}
                <th rowSpan={2} className={`${TH} bg-[#0a1f38] w-16`}>
                  QTY/
                  <br />
                  1U
                </th>
                <th rowSpan={2} className={`${TH} bg-[#0a1f38] w-16`}>
                  QTY/
                  <br />
                  2U
                </th>
                <th rowSpan={2} className={`${TH} bg-[#0a1f38] w-20`}>
                  WEIGHT/
                  <br />
                  1U
                </th>
                <th rowSpan={2} className={`${TH} bg-[#0a1f38] w-20`}>
                  WEIGHT/
                  <br />
                  2U
                </th>
              </tr>

              {/* ── Row 2: Sub-column headers ─── */}
              <tr>
                <th className={TH2}>
                  Q.Ty/
                  <br />
                  Số lượng
                </th>
                <th className={TH2}>
                  Weight/
                  <br />
                  KL (Kg)
                </th>

                <th className={TH2}>
                  Q.Ty/
                  <br />
                  Số lượng
                </th>
                <th className={TH2}>
                  Weight/
                  <br />
                  KL (Kg)
                </th>

                {visibleRevs.map((rev) => (
                  <Fragment key={`th-rev${rev}`}>
                    <th className={TH2}>
                      Q.Ty/
                      <br />
                      Số lượng
                    </th>
                    <th className={TH2}>
                      Weight/
                      <br />
                      KL (Kg)
                    </th>
                  </Fragment>
                ))}

                <th className={TH2}>
                  Q.Ty/
                  <br />
                  Số lượng
                </th>
                <th className={TH2}>
                  Weight/
                  <br />
                  KL (Kg)
                </th>

              </tr>
            </thead>

            {/* ═══════════════ BODY ═══════════════ */}
            <tbody>
              {groups.map((group) => {
                const grpTotalNetQty = group.items.reduce((s, i) => s + i.netQty, 0);
                const grpTotalNetWeight = group.items.reduce((s, i) => s + i.netWeight, 0);
                const grpTotalQty = group.items.reduce((s, i) => s + i.totalQty, 0);
                const grpTotalWeight = group.items.reduce((s, i) => s + i.totalWeight, 0);

                return (
                  <Fragment key={`grp-${group.code}`}>
                    {/* ── Group header row ── */}
                    <tr>
                      <td colSpan={5} className={`${GROUP_ROW} sticky left-0 z-10`}>
                        {group.code} — {group.nameEn} / {group.nameVi}
                      </td>
                      <td className="border border-slate-400 bg-[#dbeafe]" />
                      <td className="border border-slate-400 bg-[#dbeafe]" />
                      <td className="border border-slate-400 bg-[#dbeafe] text-right text-[9px] font-black px-1">
                        {fmt(grpTotalNetQty)}
                      </td>
                      <td className="border border-slate-400 bg-[#dbeafe] text-right text-[9px] font-black px-1">
                        {fmt(grpTotalNetWeight)}
                      </td>
                      <td className="border border-slate-400 bg-[#dbeafe]" />
                      <td className="border border-slate-400 bg-[#dbeafe]" />
                      {visibleRevs.map((rev) => (
                        <Fragment key={`grp-${group.code}-rev${rev}`}>
                          <td
                            className="border border-slate-400 bg-[#dbeafe] text-right text-[9px] font-black px-1"
                          >
                            {fmt(
                              group.items.reduce(
                                (s, i) => s + (i.duTruRevs.find((r) => r.lan === rev)?.qty ?? 0),
                                0
                              )
                            )}
                          </td>
                          <td
                            className="border border-slate-400 bg-[#dbeafe] text-right text-[9px] font-black px-1"
                          >
                            {fmt(
                              group.items.reduce(
                                (s, i) => s + (i.duTruRevs.find((r) => r.lan === rev)?.weight ?? 0),
                                0
                              )
                            )}
                          </td>
                        </Fragment>
                      ))}
                      <td className="border border-slate-400 bg-[#dbeafe] text-right text-[9px] font-black px-1">
                        {fmt(grpTotalQty)}
                      </td>
                      <td className="border border-slate-400 bg-[#dbeafe] text-right text-[9px] font-black px-1">
                        {fmt(grpTotalWeight)}
                      </td>
                      <td className="border border-slate-400 bg-[#dbeafe]" />
                      <td className="border border-slate-400 bg-[#dbeafe]" />
                      <td className="border border-slate-400 bg-[#dbeafe]" />
                      <td className="border border-slate-400 bg-[#dbeafe]" />
                      <td className="border border-slate-400 bg-[#dbeafe]" />
                    </tr>

                    {/* ── Item rows ── */}
                    {group.items.map((item, idx) => (
                      <tr
                        key={item.id}
                        className={`hover:bg-blue-50/40 transition-colors ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
                        }`}
                      >
                        <td
                          className={`${TD_STICKY} font-mono text-[8px] font-bold text-[#1B365D]`}
                          style={pin('duAn')}
                          title={item.duAn}
                        >
                          <div className="truncate">{item.duAn}</div>
                        </td>
                        {/* Mã vật tư + LỐI TẮT LIÊN BƯỚC sang 1b và 1c.
                            17/08/2026 — chuyển từ màn Theo dõi mua hàng về đây theo chỉ đạo
                            của anh Hưng: 1b và 1c là mục con của bước 1 (Yêu cầu mua), nên
                            lối vào phải nằm ở chính màn PR. */}
                        <td
                          className={`${TD_STICKY} font-mono text-[8px] text-slate-500`}
                          style={pin('stt')}
                          title={item.stt}
                        >
                          <div className="flex items-center gap-1">
                            <div className="truncate flex-1">{item.stt}</div>
                            {item.prId && (
                              <>
                                <Link
                                  href={`/kiem-tra-ton-kho?prId=${item.prId}`}
                                  title={`1b · Đối chiếu tồn kho cho phiếu ${item.prRef}`}
                                  className="shrink-0 w-[13px] h-[13px] inline-flex items-center justify-center text-slate-400 hover:text-[#1B365D] transition-colors overflow-hidden"
                                >
                                  <span className="material-symbols-outlined text-[12px] leading-none">inventory_2</span>
                                </Link>
                                <Link
                                  href={`/lam-ro-ky-thuat?prId=${item.prId}`}
                                  title={`1c · Làm rõ kỹ thuật cho phiếu ${item.prRef}`}
                                  className="shrink-0 w-[13px] h-[13px] inline-flex items-center justify-center text-slate-400 hover:text-[#1B365D] transition-colors overflow-hidden"
                                >
                                  <span className="material-symbols-outlined text-[12px] leading-none">engineering</span>
                                </Link>
                              </>
                            )}
                          </div>
                        </td>
                        <td className={TD_STICKY} style={pin('desc')} title={item.description}>
                          <div className="truncate">{item.description}</div>
                        </td>
                        <td
                          className={`${TD_STICKY} font-mono text-[8.5px]`}
                          style={pin('profile')}
                          title={item.profile}
                        >
                          <div className="truncate">{item.profile}</div>
                        </td>
                        <td className={`${TD_LEFT} w-28 font-bold text-[#1B365D]`}>{item.grade}</td>
                        <td className="border border-slate-300 text-center text-[9px] px-1 py-0.5 w-14">
                          {item.unit}
                        </td>
                        <td className={`${TD} w-20`}>{fmt(item.unitWeight)}</td>

                        {/* Net Qty */}
                        <td className={`${TD} w-20`}>{fmt(item.netQty)}</td>
                        <td className={`${TD} w-24`}>{fmt(item.netWeight)}</td>

                        {/* Previous Ordered */}
                        <td className={`${TD} w-20`}>{fmt(item.previousQty)}</td>
                        <td className={`${TD} w-24`}>{fmt(item.previousWeight)}</td>

                        {/* Dự trù lần 0..8 */}
                        {visibleRevs.map((rev) => {
                          const r = item.duTruRevs.find((d) => d.lan === rev);
                          return (
                            // 15/08/2026 — key phải đặt ở Fragment (phần tử ngoài cùng map trả về),
                            // đặt ở <td> bên trong là React không thấy ⇒ cảnh báo thiếu key.
                            <Fragment key={`${item.id}-rev${rev}`}>
                              <td
                                key={`${item.id}-rev${rev}-qty`}
                                className={`${TD} w-16 ${
                                  r && r.qty !== 0
                                    ? 'text-[#1B365D] font-semibold'
                                    : 'text-slate-300'
                                }`}
                              >
                                {fmt(r?.qty ?? 0)}
                              </td>
                              <td
                                key={`${item.id}-rev${rev}-kg`}
                                className={`${TD} w-20 ${
                                  r && r.weight !== 0
                                    ? 'text-[#1B365D] font-semibold'
                                    : 'text-slate-300'
                                }`}
                              >
                                {fmt(r?.weight ?? 0)}
                              </td>
                            </Fragment>
                          );
                        })}

                        {/* Total Ordered */}
                        <td className={`${TD} w-20 font-black text-[#0d2b4e]`}>
                          {fmt(item.totalQty)}
                        </td>
                        <td className={`${TD} w-24 font-black text-[#0d2b4e]`}>
                          {fmt(item.totalWeight)}
                        </td>

                        {/* Remarks */}
                        <td className={`${TD_LEFT} w-32 text-[8px] text-slate-500`}>
                          {item.remarks}
                        </td>

                        {/* Fab allocations */}

                        {/* QTY/WEIGHT summary */}
                        <td className={`${TD} w-16 text-slate-600`}>{fmt(item.qty1U)}</td>
                        <td className={`${TD} w-16 text-slate-600`}>{fmt(item.qty2U)}</td>
                        <td className={`${TD} w-20 text-slate-600`}>{fmt(item.weight1U)}</td>
                        <td className={`${TD} w-20 text-slate-600`}>{fmt(item.weight2U)}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}

              {/* ══════ GRAND TOTAL ROW ══════ */}
              <tr className="bg-[#1B365D] text-white">
                <td
                  colSpan={5}
                  className="border border-[#2a5298] sticky left-0 z-10 bg-[#1B365D] text-[9px] font-black px-2 py-2"
                >
                  TỔNG CỘNG / GRAND TOTAL
                </td>
                <td className="border border-[#2a5298]" />
                <td className="border border-[#2a5298]" />
                <td className="border border-[#2a5298] text-right text-[9px] font-black px-1">
                  {fmt(groups.reduce((s, g) => s + g.items.reduce((ss, i) => ss + i.netQty, 0), 0))}
                </td>
                <td className="border border-[#2a5298] text-right text-[9px] font-black px-1">
                  {fmt(
                    groups.reduce((s, g) => s + g.items.reduce((ss, i) => ss + i.netWeight, 0), 0)
                  )}
                </td>
                <td className="border border-[#2a5298]" />
                <td className="border border-[#2a5298]" />
                {visibleRevs.map((rev) => (
                  <Fragment key={`grand-rev${rev}`}>
                    <td
                      className="border border-[#2a5298] text-right text-[9px] font-black px-1"
                    >
                      {fmt(
                        groups.reduce(
                          (s, g) =>
                            s +
                            g.items.reduce(
                              (ss, i) => ss + (i.duTruRevs.find((r) => r.lan === rev)?.qty ?? 0),
                              0
                            ),
                          0
                        )
                      )}
                    </td>
                    <td
                      key={`grand-rev${rev}-kg`}
                      className="border border-[#2a5298] text-right text-[9px] font-black px-1"
                    >
                      {fmt(
                        groups.reduce(
                          (s, g) =>
                            s +
                            g.items.reduce(
                              (ss, i) => ss + (i.duTruRevs.find((r) => r.lan === rev)?.weight ?? 0),
                              0
                            ),
                          0
                        )
                      )}
                    </td>
                  </Fragment>
                ))}
                <td className="border border-[#2a5298] text-right text-[9px] font-black px-1">
                  {fmt(
                    groups.reduce((s, g) => s + g.items.reduce((ss, i) => ss + i.totalQty, 0), 0)
                  )}
                </td>
                <td className="border border-[#2a5298] text-right text-[9px] font-black px-1">
                  {fmt(
                    groups.reduce((s, g) => s + g.items.reduce((ss, i) => ss + i.totalWeight, 0), 0)
                  )}
                </td>
                <td className="border border-[#2a5298]" />
                <td className="border border-[#2a5298]" />
                <td className="border border-[#2a5298]" />
                <td className="border border-[#2a5298]" />
                <td className="border border-[#2a5298]" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
