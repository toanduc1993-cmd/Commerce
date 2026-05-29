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

import { useState, useMemo } from 'react';
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

const FAB_AREAS = [
  { code: 'INLET-U1', name: 'VẬT TƯ INLET U1' },
  { code: 'SCR-U1', name: 'VẬT TƯ SCR-U1' },
  { code: 'BURNER-U1', name: 'VẬT TƯ BURNER-U1' },
  { code: 'BASE-PLATE-U1', name: 'VẬT TƯ BASE PLATE+STACK TEMPLATE-U1' },
  { code: 'OUTLET-DUCT-U1', name: 'VẬT TƯ OUTLET DUCT-U1' },
  { code: 'TOP-BEAM-U1', name: 'VẬT TƯ TOP BEAM-U1' },
  { code: 'BOX1-U1', name: 'VẬT TƯ BOX 1-U1' },
  { code: 'BOX2-U1', name: 'VẬT TƯ BOX 2-U1' },
  { code: 'BOX3-U1', name: 'VẬT TƯ BOX 3-U1' },
  { code: 'BOX4-U1', name: 'VẬT TƯ BOX 4-U1' },
  { code: 'BOX5-U1', name: 'VẬT TƯ BOX5-U1' },
  { code: 'BOX6-U1', name: 'VẬT TƯ BOX6-U1' },
  { code: 'STACK-U1', name: 'VẬT TƯ STACK-U1' },
  { code: 'STAIR-TOWER-U1', name: 'VẬT TƯ STAIR TOWER-U1' },
  { code: 'BUMPER-U1', name: 'VẬT TƯ BUMPER-U1' },
  { code: 'SCR-BAFER-FRAME-U1', name: 'VẬT TƯ SCR BAFER-FRAME-U1' },
  { code: 'ATTIC-BASEMENT-U1', name: 'VẬT TƯ ATTIC-BASEMENT PANEL-U1' },
  { code: 'FIELD-TOP-SPOOL-U1', name: 'FIELD INSTALLED TOP SPOOL-U1' },
];

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
const GROUP_ROW =
  'bg-[#dbeafe] border border-slate-400 text-[9px] font-black text-[#1B365D] px-2 py-1.5';

// ─── COMPONENT ────────────────────────────────────────────────────────────────

interface PR090DetailViewProps {
  prs: PRDetail[];
  isLoading?: boolean;
}

export function PR090DetailView({ prs, isLoading }: PR090DetailViewProps) {
  const [showAllRevs, setShowAllRevs] = useState(false);
  const [showFabCols, setShowFabCols] = useState(true);

  // Map data theo project đang chọn
  const groups = useMemo(() => prsToGroups(prs), [prs]);

  const visibleRevs = showAllRevs ? DU_TRU_REVS : [];

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

          <button
            onClick={() => setShowFabCols((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold border transition-all ${
              showFabCols
                ? 'bg-[#1B365D] text-white border-[#1B365D]'
                : 'bg-white border-slate-300 text-slate-600 hover:border-[#1B365D]'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">account_tree</span>
            {showFabCols ? `Ẩn ${FAB_AREAS.length} cột Phân bổ` : 'Hiện cột Phân bổ'}
          </button>
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
                <th rowSpan={2} className={`${TH} w-20 sticky left-0 z-30`}>
                  Item/
                  <br />
                  STT
                </th>
                <th rowSpan={2} className={`${TH} w-48 sticky left-20 z-30`}>
                  Description/
                  <br />
                  Chi tiết
                </th>
                <th rowSpan={2} className={`${TH} w-36 sticky left-[11rem] z-30`}>
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
                {showFabCols &&
                  FAB_AREAS.map((fa) => (
                    <th key={fa.code} colSpan={2} className={`${TH_FAB} leading-tight`}>
                      {fa.name}
                    </th>
                  ))}

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
                  <>
                    <th key={`rev${rev}-qty`} className={TH2}>
                      Q.Ty/
                      <br />
                      Số lượng
                    </th>
                    <th key={`rev${rev}-kg`} className={TH2}>
                      Weight/
                      <br />
                      KL (Kg)
                    </th>
                  </>
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

                {showFabCols &&
                  FAB_AREAS.map((fa) => (
                    <>
                      <th key={`${fa.code}-qty`} className={`${TH2} bg-[#163966] text-[7.5px]`}>
                        Q.Ty/
                        <br />
                        SL(cái,m,m²)
                      </th>
                      <th key={`${fa.code}-kg`} className={`${TH2} bg-[#163966] text-[7.5px]`}>
                        Weight/
                        <br />
                        KL (Kg)
                      </th>
                    </>
                  ))}
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
                  <>
                    {/* ── Group header row ── */}
                    <tr key={`grp-${group.code}`}>
                      <td colSpan={4} className={`${GROUP_ROW} sticky left-0 z-10`}>
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
                        <>
                          <td
                            key={`grp-${group.code}-rev${rev}-q`}
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
                            key={`grp-${group.code}-rev${rev}-w`}
                            className="border border-slate-400 bg-[#dbeafe] text-right text-[9px] font-black px-1"
                          >
                            {fmt(
                              group.items.reduce(
                                (s, i) => s + (i.duTruRevs.find((r) => r.lan === rev)?.weight ?? 0),
                                0
                              )
                            )}
                          </td>
                        </>
                      ))}
                      <td className="border border-slate-400 bg-[#dbeafe] text-right text-[9px] font-black px-1">
                        {fmt(grpTotalQty)}
                      </td>
                      <td className="border border-slate-400 bg-[#dbeafe] text-right text-[9px] font-black px-1">
                        {fmt(grpTotalWeight)}
                      </td>
                      <td className="border border-slate-400 bg-[#dbeafe]" />
                      {showFabCols &&
                        FAB_AREAS.map((fa) => (
                          <>
                            <td
                              key={`grp-${group.code}-${fa.code}-q`}
                              className="border border-slate-400 bg-[#dbeafe] text-right text-[9px] font-black px-1"
                            >
                              {fmt(
                                group.items.reduce(
                                  (s, i) =>
                                    s + (i.fabAllocs.find((a) => a.code === fa.code)?.qty ?? 0),
                                  0
                                )
                              )}
                            </td>
                            <td
                              key={`grp-${group.code}-${fa.code}-w`}
                              className="border border-slate-400 bg-[#dbeafe] text-right text-[9px] font-black px-1"
                            >
                              {fmt(
                                group.items.reduce(
                                  (s, i) =>
                                    s + (i.fabAllocs.find((a) => a.code === fa.code)?.weight ?? 0),
                                  0
                                )
                              )}
                            </td>
                          </>
                        ))}
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
                          className={`${TD_STICKY} left-0 w-20 font-mono text-[8px] text-slate-500`}
                        >
                          {item.stt}
                        </td>
                        <td className={`${TD_STICKY} left-20 w-48`}>{item.description}</td>
                        <td className={`${TD_STICKY} left-[11rem] w-36 font-mono text-[8.5px]`}>
                          {item.profile}
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
                            <>
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
                            </>
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
                        {showFabCols &&
                          FAB_AREAS.map((fa) => {
                            const alloc = item.fabAllocs.find((a) => a.code === fa.code);
                            return (
                              <>
                                <td
                                  key={`${item.id}-${fa.code}-qty`}
                                  className={`${TD} w-16 ${
                                    alloc && alloc.qty > 0
                                      ? 'text-emerald-700 font-semibold'
                                      : 'text-slate-200'
                                  }`}
                                >
                                  {fmt(alloc?.qty ?? 0)}
                                </td>
                                <td
                                  key={`${item.id}-${fa.code}-kg`}
                                  className={`${TD} w-20 ${
                                    alloc && alloc.weight > 0
                                      ? 'text-emerald-700 font-semibold'
                                      : 'text-slate-200'
                                  }`}
                                >
                                  {fmt(alloc?.weight ?? 0)}
                                </td>
                              </>
                            );
                          })}

                        {/* QTY/WEIGHT summary */}
                        <td className={`${TD} w-16 text-slate-600`}>{fmt(item.qty1U)}</td>
                        <td className={`${TD} w-16 text-slate-600`}>{fmt(item.qty2U)}</td>
                        <td className={`${TD} w-20 text-slate-600`}>{fmt(item.weight1U)}</td>
                        <td className={`${TD} w-20 text-slate-600`}>{fmt(item.weight2U)}</td>
                      </tr>
                    ))}
                  </>
                );
              })}

              {/* ══════ GRAND TOTAL ROW ══════ */}
              <tr className="bg-[#1B365D] text-white">
                <td
                  colSpan={4}
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
                  <>
                    <td
                      key={`grand-rev${rev}-qty`}
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
                  </>
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
                {showFabCols &&
                  FAB_AREAS.map((fa) => (
                    <>
                      <td key={`grand-${fa.code}-q`} className="border border-[#2a5298]" />
                      <td key={`grand-${fa.code}-w`} className="border border-[#2a5298]" />
                    </>
                  ))}
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
