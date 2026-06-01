'use client';
// v2026-05-30b

/**
 * MasterTrackingTable — Bảng "Theo Dõi Vật Tư Dự Án"
 *
 * Layout 1:1 với sheet master tracking trong file mẫu Excel
 * (vd: '25-VPI-I-095' sheet 119 cols × 680 rows).
 *
 * 12 cụm cột chính:
 *   ┌─ A. Đánh giá ─┐ ┌─ B. Item info ─┐ ┌─ C. Net Qty ─┐
 *   ┌─ D. REVs (lần dự trù) ─┐ ┌─ E. Total Ordered + Remarks ─┐
 *   ┌─ F. Tận dụng tồn kho ─┐ ┌─ G. KL phải mua sắm ─┐
 *   ┌─ H. VẬT TƯ TRONG NƯỚC (DOM contract — 13 cols) ─┐
 *   ┌─ I. ĐÃ MUA TRONG NƯỚC + QC ─┐
 *   ┌─ J. MUA SẮM NƯỚC NGOÀI (IMP contract — 18 cols) ─┐
 *   ┌─ K. ĐÃ MUA NHẬP KHẨU + QC ─┐
 *   ┌─ L. TỔNG ĐÃ MUA + So sánh + Đánh giá cuối ─┐
 */

import React, { useMemo, useState, useCallback } from 'react';
import type { PRDetail, ContractDetail, InspectionRecord } from '@/types/procurement';
import { ColumnFilter } from '@/components/data-table';
import type { UseTableFiltersResult } from '@/hooks/useTableFilters';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmtNum = (v?: number | null, dec = 2) =>
  v && v !== 0 ? v.toLocaleString('vi-VN', { maximumFractionDigits: dec }) : '';
const fmtNum0 = (v?: number | null) => fmtNum(v, 0);
const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '';
const fmtMoney = (v?: number | null) => {
  if (!v) return '';
  if (v >= 1e9) return (v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
  if (v >= 1e6) return (v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' tr';
  return v.toLocaleString('vi-VN');
};

const getContracts = (pr: PRDetail): ContractDetail[] =>
  ((pr.contracts || []) as ContractDetail[]) ?? [];
const getDOM = (pr: PRDetail) => getContracts(pr).filter((c) => c.contractType === 'DOMESTIC');
const getIMP = (pr: PRDetail) => getContracts(pr).filter((c) => c.contractType === 'IMPORT');
const getInspections = (contracts: ContractDetail[]): InspectionRecord[] =>
  contracts.flatMap((c) => c.inspections || []);

// Sum helpers
const sumQty = (arr: { contractQty?: number; deliveredQty?: number }[]) =>
  arr.reduce((s, c) => s + (c.deliveredQty || c.contractQty || 0), 0);
const sumWeight = (arr: { contractWeight?: number; deliveredWeight?: number }[]) =>
  arr.reduce((s, c) => s + (c.deliveredWeight || c.contractWeight || 0), 0);
const sumNoVAT = (arr: { totalNoVAT?: number }[]) =>
  arr.reduce((s, c) => s + (c.totalNoVAT || 0), 0);

// ─── STYLES ──────────────────────────────────────────────────────────────────

// Group header colors
const G = {
  eval: 'bg-[#7a5c2e] text-white',
  item: 'bg-[#1B365D] text-white',
  netQty: 'bg-[#1e4976] text-white',
  rev: 'bg-[#37547a] text-white',
  total: 'bg-[#0d2b4e] text-white',
  remain: 'bg-[#5b21b6] text-white',
  toBuy: 'bg-[#7c3aed] text-white',
  domContract: 'bg-[#047857] text-white',
  domPurchased: 'bg-[#059669] text-white',
  domQC: 'bg-[#0d9488] text-white',
  impContract: 'bg-[#1d3f6b] text-white',
  impPurchased: 'bg-[#3730a3] text-white',
  impQC: 'bg-[#5b21b6] text-white',
  totalBought: 'bg-[#0d2b4e] text-white',
  diff: 'bg-[#7c2d12] text-white',
  evalEnd: 'bg-[#7a5c2e] text-white',
};

// Cell base classes
const TD = 'border border-slate-300 text-right text-[9px] font-mono px-1 py-0.5 whitespace-nowrap';
const TD_TEXT = 'border border-slate-300 text-left text-[9px] px-1 py-0.5';
const TD_CENTER = 'border border-slate-300 text-center text-[9px] px-1 py-0.5';
const TD_DATE = 'border border-slate-300 text-center text-[8.5px] px-1 py-0.5';

const TH = (color: string) =>
  `border border-slate-400 px-1 py-1 text-center text-[8.5px] font-black whitespace-nowrap ${color}`;
const TH2 =
  'border border-slate-400 px-1 py-0.5 text-center text-[7.5px] font-bold bg-[#2a5298] text-white whitespace-nowrap';

// ─── STICKY COLUMN OFFSETS ────────────────────────────────────────────────────
// Dùng JS object thay vì Tailwind left-* hardcode để offsets luôn chính xác
// khi thay đổi width cột sticky
// Không còn cột KQ sticky đầu — 4 sticky cols: Dự án, Item, Description (+ KQ ở cuối, không sticky)
const STICKY_W = { project: 96, item: 80, desc: 176 } as const;
const STICKY_LEFT = {
  project: 0,
  item: STICKY_W.project,                          // 96
  desc: STICKY_W.project + STICKY_W.item,          // 176
} as const;

// ─── COL GROUP VISIBILITY ─────────────────────────────────────────────────────

const defaultColGroupVis = {
  netQty: true,
  revs: false,      // collapsed by default — open khi cần xem REV history
  totalOrdered: true,
  remain: false,    // collapsed by default
  toBuy: true,
  domContract: true,
  domPurchased: true,
  domQC: false,     // collapsed by default
  impContract: true,
  impPurchased: true,
  impQC: false,     // collapsed by default
  totalBought: true,
  diff: true,
};
type ColGroupKey = keyof typeof defaultColGroupVis;

// Collapsed th style
const TH_COLLAPSED = 'border border-slate-400 w-3 min-w-[12px] cursor-pointer text-center bg-slate-200 hover:bg-slate-300 transition-colors';
// Collapsed td placeholder style
const TD_PLACEHOLDER = 'w-3 min-w-[12px] border border-slate-200 bg-slate-50/80';

// ─── SHARED SUB-COMPONENTS (ngoài MasterTrackingTable để React không recreate type mỗi render) ──

interface ToggleBtnProps { groupKey: ColGroupKey; isOpen: boolean; onToggle: (k: ColGroupKey) => void; }
const ToggleBtn = React.memo(function ToggleBtn({ groupKey, isOpen, onToggle }: ToggleBtnProps) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(groupKey); }}
      className="inline-flex items-center justify-center ml-1 opacity-70 hover:opacity-100"
      title={isOpen ? 'Ẩn nhóm cột' : 'Hiện nhóm cột'}
    >
      <span className="material-symbols-outlined text-[10px] leading-none">
        {isOpen ? 'chevron_left' : 'chevron_right'}
      </span>
    </button>
  );
});

interface ColFProps { col: string; align?: 'left' | 'right'; tableFilters?: UseTableFiltersResult<PRDetail>; }
const ColF = React.memo(function ColF({ col, align, tableFilters }: ColFProps) {
  if (!tableFilters || !tableFilters.config[col]) return null;
  return (
    <ColumnFilter
      column={col}
      config={tableFilters.config[col]}
      value={tableFilters.columnFilters[col] ?? null}
      onChange={(v) => tableFilters.setColumnFilter(col, v)}
      align={align}
    />
  );
});

// ─── COMPONENT ───────────────────────────────────────────────────────────────

interface MasterTrackingTableProps {
  prs: PRDetail[];
  isLoading?: boolean;
  tableFilters?: UseTableFiltersResult<PRDetail>;
  showAllRevs?: boolean;
  selectedRevByProject?: Record<string, 'all' | 'latest' | number>;
}

// ─── STABLE EMPTY OBJECT — tránh tạo {} mới mỗi render khi prop bị omit ──────
const EMPTY_REV_SEL: Record<string, 'all' | 'latest' | number> = {};

export function MasterTrackingTable({ prs, isLoading, tableFilters, showAllRevs = false, selectedRevByProject = EMPTY_REV_SEL }: MasterTrackingTableProps) {
  // ── Column group visibility state — initializer fn để đảm bảo default collapsed mỗi mount ──
  const [colGroupVis, setColGroupVis] = useState<typeof defaultColGroupVis>(() => ({ ...defaultColGroupVis }));

  // stable callback — không recreate mỗi render
  const toggleGroup = useCallback(
    (key: ColGroupKey) => setColGroupVis((v) => ({ ...v, [key]: !v[key] })),
    []
  );

  const REV_COUNT = showAllRevs ? 16 : 5;

  // getRevIndices — stable với useMemo trên selectedRevByProject + REV_COUNT
  const getRevIndices = useCallback(
    (projectCode: string): number[] => {
      const sel = selectedRevByProject[projectCode];
      if (!sel || sel === 'all') return Array.from({ length: REV_COUNT }, (_, i) => i);
      if (sel === 'latest') return [REV_COUNT - 1];
      return [Math.min(sel as number, REV_COUNT - 1)];
    },
    [selectedRevByProject, REV_COUNT]
  );

  // Số cột REV tối đa để header row dùng colSpan nhất quán
  const maxRevCols = REV_COUNT * 2;

  // Group PR theo materialSubGroupCode (VTC01, VTC02, VPK, VDK)
  const grouped = useMemo(() => {
    const m = new Map<string, PRDetail[]>();
    for (const pr of prs) {
      const code = pr.materialSubGroupCode || pr.materialGroupCode || 'OTHER';
      if (!m.has(code)) m.set(code, []);
      m.get(code)!.push(pr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [prs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
        Đang tải dữ liệu...
      </div>
    );
  }
  if (prs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
        <span className="material-symbols-outlined text-[48px] opacity-30">inventory_2</span>
        <div className="text-sm">Chưa có dữ liệu — upload PR để bắt đầu</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Table area — scroll horizontal + vertical */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="border-collapse text-[9px]" style={{ minWidth: 'max-content' }}>
          <thead className="sticky top-0 z-30">
            {/* ═══ ROW 1: Group headers ═══ */}
            <tr>
              {/* Dự án — cột sticky đầu tiên */}
              <th
                rowSpan={2}
                className={`${TH(G.item)} sticky z-40`}
                style={{ left: STICKY_LEFT.project, width: STICKY_W.project, minWidth: STICKY_W.project }}
              >
                <div className="flex items-center justify-center gap-0.5">
                  Dự án
                  <ColF col="projectCode" align="left" tableFilters={tableFilters} />
                </div>
              </th>

              {/* Item info */}
              <th
                rowSpan={2}
                className={`${TH(G.item)} sticky z-40 min-w-[${STICKY_W.item}px]`}
                style={{ left: STICKY_LEFT.item, width: STICKY_W.item }}
              >
                <div className="flex items-center justify-center gap-0.5">
                  Item/STT
                  <ColF col="itemCode" tableFilters={tableFilters} />
                </div>
              </th>
              <th
                rowSpan={2}
                className={`${TH(G.item)} sticky z-40 min-w-[${STICKY_W.desc}px]`}
                style={{ left: STICKY_LEFT.desc, width: STICKY_W.desc }}
              >
                <div className="flex items-center justify-center gap-0.5">
                  Description/Chi tiết
                  <ColF col="itemName" tableFilters={tableFilters} />
                </div>
              </th>
              <th rowSpan={2} className={`${TH(G.item)} w-32 min-w-[128px]`}>
                <div className="flex items-center justify-center gap-0.5">
                  Profile/Vật tư
                  <ColF col="profile" tableFilters={tableFilters} />
                </div>
              </th>
              <th rowSpan={2} className={`${TH(G.item)} w-24 min-w-[96px]`}>
                <div className="flex items-center justify-center gap-0.5">
                  Grade/Mác
                  <ColF col="grade" tableFilters={tableFilters} />
                </div>
              </th>
              <th rowSpan={2} className={`${TH(G.item)} w-12 min-w-[48px]`}>
                <div className="flex items-center justify-center gap-0.5">
                  Unit/ĐVT
                  <ColF col="uom" tableFilters={tableFilters} />
                </div>
              </th>
              <th rowSpan={2} className={`${TH(G.item)} w-16 min-w-[64px]`}>
                <div className="flex items-center justify-center gap-0.5">
                  U.Weight
                  <br />
                  (kg/m²,m,pcs)
                  <ColF col="unitWeight" tableFilters={tableFilters} />
                </div>
              </th>

              {/* ── Net Quantity ── */}
              {colGroupVis.netQty ? (
                <th colSpan={2} className={TH(G.netQty)}>
                  <div className="flex items-center justify-center">
                    Net Quantity/
                    <br />
                    Số lượng tinh
                    <ToggleBtn groupKey="netQty" isOpen={colGroupVis["netQty"]} onToggle={toggleGroup} />
                  </div>
                </th>
              ) : (
                <th
                  colSpan={1}
                  className={TH_COLLAPSED}
                  onClick={() => toggleGroup('netQty')}
                  title="Hiện nhóm Net Quantity"
                >
                  <span className="material-symbols-outlined text-[10px] leading-none text-slate-500">
                    chevron_right
                  </span>
                </th>
              )}

              {/* ── REVs ── */}
              {colGroupVis.revs ? (
                <th colSpan={maxRevCols} className={TH(G.rev)}>
                  <div className="flex items-center justify-center">
                    Current Ordered/
                    <br />
                    Dự trù lần 0 → {REV_COUNT - 1}
                    <ToggleBtn groupKey="revs" isOpen={colGroupVis["revs"]} onToggle={toggleGroup} />
                  </div>
                </th>
              ) : (
                <th
                  colSpan={1}
                  className={TH_COLLAPSED}
                  onClick={() => toggleGroup('revs')}
                  title="Hiện nhóm REVs"
                >
                  <span className="material-symbols-outlined text-[10px] leading-none text-slate-500">
                    chevron_right
                  </span>
                </th>
              )}

              {/* ── Total Ordered ── */}
              {colGroupVis.totalOrdered ? (
                <th colSpan={2} className={TH(G.total)}>
                  <div className="flex items-center justify-center">
                    Total Ordered/
                    <br />
                    Tổng dự trù
                    <ToggleBtn groupKey="totalOrdered" isOpen={colGroupVis["totalOrdered"]} onToggle={toggleGroup} />
                  </div>
                </th>
              ) : (
                <th
                  colSpan={1}
                  className={TH_COLLAPSED}
                  onClick={() => toggleGroup('totalOrdered')}
                  title="Hiện nhóm Total Ordered"
                >
                  <span className="material-symbols-outlined text-[10px] leading-none text-slate-500">
                    chevron_right
                  </span>
                </th>
              )}

              {/* Remarks — rowSpan=2, không thuộc group nào */}
              <th rowSpan={2} className={`${TH(G.total)} w-20 min-w-[80px]`}>
                Remarks/
                <br />
                Ghi chú
              </th>

              {/* ── Tận dụng tồn kho ── */}
              {colGroupVis.remain ? (
                <th colSpan={5} className={TH(G.remain)}>
                  <div className="flex items-center justify-center">
                    Tận dụng tồn kho/
                    <br />
                    Remain Stock
                    <ToggleBtn groupKey="remain" isOpen={colGroupVis["remain"]} onToggle={toggleGroup} />
                  </div>
                </th>
              ) : (
                <th
                  colSpan={1}
                  className={TH_COLLAPSED}
                  onClick={() => toggleGroup('remain')}
                  title="Hiện nhóm Remain Stock"
                >
                  <span className="material-symbols-outlined text-[10px] leading-none text-slate-500">
                    chevron_right
                  </span>
                </th>
              )}

              {/* ── KL phải mua ── */}
              {colGroupVis.toBuy ? (
                <th colSpan={2} className={TH(G.toBuy)}>
                  <div className="flex items-center justify-center">
                    Khối lượng phải mua sắm/
                    <br />
                    Total order
                    <ToggleBtn groupKey="toBuy" isOpen={colGroupVis["toBuy"]} onToggle={toggleGroup} />
                  </div>
                </th>
              ) : (
                <th
                  colSpan={1}
                  className={TH_COLLAPSED}
                  onClick={() => toggleGroup('toBuy')}
                  title="Hiện nhóm KL phải mua"
                >
                  <span className="material-symbols-outlined text-[10px] leading-none text-slate-500">
                    chevron_right
                  </span>
                </th>
              )}

              {/* Material Available Date — rowSpan=2, không thuộc group nào */}
              <th rowSpan={2} className={`${TH(G.toBuy)} w-16 min-w-[64px]`}>
                Material
                <br />
                Available
                <br />
                Date
              </th>

              {/* ── DOMESTIC contract ── */}
              {colGroupVis.domContract ? (
                <th colSpan={11} className={TH(G.domContract)}>
                  <div className="flex items-center justify-center">
                    VẬT TƯ TRONG NƯỚC/
                    <br />
                    Domestic Contract
                    <ToggleBtn groupKey="domContract" isOpen={colGroupVis["domContract"]} onToggle={toggleGroup} />
                  </div>
                </th>
              ) : (
                <th
                  colSpan={1}
                  className={TH_COLLAPSED}
                  onClick={() => toggleGroup('domContract')}
                  title="Hiện nhóm DOM Contract"
                >
                  <span className="material-symbols-outlined text-[10px] leading-none text-slate-500">
                    chevron_right
                  </span>
                </th>
              )}

              {/* ── DOM purchased ── */}
              {colGroupVis.domPurchased ? (
                <th colSpan={2} className={TH(G.domPurchased)}>
                  <div className="flex items-center justify-center">
                    ĐÃ MUA
                    <br />
                    TRONG NƯỚC
                    <ToggleBtn groupKey="domPurchased" isOpen={colGroupVis["domPurchased"]} onToggle={toggleGroup} />
                  </div>
                </th>
              ) : (
                <th
                  colSpan={1}
                  className={TH_COLLAPSED}
                  onClick={() => toggleGroup('domPurchased')}
                  title="Hiện nhóm Đã mua trong nước"
                >
                  <span className="material-symbols-outlined text-[10px] leading-none text-slate-500">
                    chevron_right
                  </span>
                </th>
              )}

              {/* ── DOM QC ── */}
              {colGroupVis.domQC ? (
                <th colSpan={4} className={TH(G.domQC)}>
                  <div className="flex items-center justify-center">
                    QC Nghiệm thu
                    <br />
                    (DOM)
                    <ToggleBtn groupKey="domQC" isOpen={colGroupVis["domQC"]} onToggle={toggleGroup} />
                  </div>
                </th>
              ) : (
                <th
                  colSpan={1}
                  className={TH_COLLAPSED}
                  onClick={() => toggleGroup('domQC')}
                  title="Hiện nhóm QC DOM"
                >
                  <span className="material-symbols-outlined text-[10px] leading-none text-slate-500">
                    chevron_right
                  </span>
                </th>
              )}

              {/* ── IMPORT contract ── */}
              {colGroupVis.impContract ? (
                <th colSpan={16} className={TH(G.impContract)}>
                  <div className="flex items-center justify-center">
                    MUA SẮM NƯỚC NGOÀI/
                    <br />
                    Import Contract
                    <ToggleBtn groupKey="impContract" isOpen={colGroupVis["impContract"]} onToggle={toggleGroup} />
                  </div>
                </th>
              ) : (
                <th
                  colSpan={1}
                  className={TH_COLLAPSED}
                  onClick={() => toggleGroup('impContract')}
                  title="Hiện nhóm IMP Contract"
                >
                  <span className="material-symbols-outlined text-[10px] leading-none text-slate-500">
                    chevron_right
                  </span>
                </th>
              )}

              {/* ── IMP purchased ── */}
              {colGroupVis.impPurchased ? (
                <th colSpan={2} className={TH(G.impPurchased)}>
                  <div className="flex items-center justify-center">
                    ĐÃ MUA
                    <br />
                    NHẬP KHẨU
                    <ToggleBtn groupKey="impPurchased" isOpen={colGroupVis["impPurchased"]} onToggle={toggleGroup} />
                  </div>
                </th>
              ) : (
                <th
                  colSpan={1}
                  className={TH_COLLAPSED}
                  onClick={() => toggleGroup('impPurchased')}
                  title="Hiện nhóm Đã mua nhập khẩu"
                >
                  <span className="material-symbols-outlined text-[10px] leading-none text-slate-500">
                    chevron_right
                  </span>
                </th>
              )}

              {/* ── IMP QC ── */}
              {colGroupVis.impQC ? (
                <th colSpan={4} className={TH(G.impQC)}>
                  <div className="flex items-center justify-center">
                    Nghiệm thu
                    <br />
                    (IMP)
                    <ToggleBtn groupKey="impQC" isOpen={colGroupVis["impQC"]} onToggle={toggleGroup} />
                  </div>
                </th>
              ) : (
                <th
                  colSpan={1}
                  className={TH_COLLAPSED}
                  onClick={() => toggleGroup('impQC')}
                  title="Hiện nhóm QC IMP"
                >
                  <span className="material-symbols-outlined text-[10px] leading-none text-slate-500">
                    chevron_right
                  </span>
                </th>
              )}

              {/* ── Total Bought ── */}
              {colGroupVis.totalBought ? (
                <th colSpan={2} className={TH(G.totalBought)}>
                  <div className="flex items-center justify-center">
                    TỔNG ĐÃ MUA
                    <br />
                    (DOM + IMP)
                    <ToggleBtn groupKey="totalBought" isOpen={colGroupVis["totalBought"]} onToggle={toggleGroup} />
                  </div>
                </th>
              ) : (
                <th
                  colSpan={1}
                  className={TH_COLLAPSED}
                  onClick={() => toggleGroup('totalBought')}
                  title="Hiện nhóm Tổng đã mua"
                >
                  <span className="material-symbols-outlined text-[10px] leading-none text-slate-500">
                    chevron_right
                  </span>
                </th>
              )}

              {/* ── Diff vs PR ── */}
              {colGroupVis.diff ? (
                <th colSpan={2} className={TH(G.diff)}>
                  <div className="flex items-center justify-center">
                    So sánh
                    <br />
                    với PR
                    <ToggleBtn groupKey="diff" isOpen={colGroupVis["diff"]} onToggle={toggleGroup} />
                  </div>
                </th>
              ) : (
                <th
                  colSpan={1}
                  className={TH_COLLAPSED}
                  onClick={() => toggleGroup('diff')}
                  title="Hiện nhóm So sánh vs PR"
                >
                  <span className="material-symbols-outlined text-[10px] leading-none text-slate-500">
                    chevron_right
                  </span>
                </th>
              )}

              {/* Đánh giá cuối */}
              <th rowSpan={2} className={`${TH(G.evalEnd)} w-14 min-w-[56px]`}>
                KQ
                <br />
                Mua
              </th>
            </tr>

            {/* ═══ ROW 2: Sub-headers ═══ */}
            <tr>
              {/* Net Qty sub-headers — only when visible */}
              {colGroupVis.netQty && (
                <>
                  <th className={TH2}>
                    <div className="flex items-center justify-center gap-0.5">
                      Q.Ty
                      <ColF col="netQtyFilter" tableFilters={tableFilters} />
                    </div>
                  </th>
                  <th className={TH2}>Weight (Kg)</th>
                </>
              )}

              {/* REVs sub-headers — only when visible */}
              {colGroupVis.revs && (
                <>
                  {Array.from({ length: REV_COUNT }).map((_, i) => (
                    <React.Fragment key={`rev${i}`}>
                      <th className={TH2}>
                        Lần {i}
                        <br />
                        Q.Ty
                      </th>
                      <th className={TH2}>
                        Lần {i}
                        <br />
                        Weight
                      </th>
                    </React.Fragment>
                  ))}
                </>
              )}

              {/* Total Ordered sub-headers */}
              {colGroupVis.totalOrdered && (
                <>
                  <th className={TH2}>Q.Ty</th>
                  <th className={TH2}>Weight (Kg)</th>
                </>
              )}

              {/* Remain sub-headers */}
              {colGroupVis.remain && (
                <>
                  <th className={TH2}>Report No</th>
                  <th className={TH2}>Q.Ty</th>
                  <th className={TH2}>Weight (Kg)</th>
                  <th className={TH2}>Ngày ACC</th>
                  <th className={TH2}>Remarks</th>
                </>
              )}

              {/* ToBuy sub-headers */}
              {colGroupVis.toBuy && (
                <>
                  <th className={TH2}>
                    <div className="flex items-center justify-center gap-0.5">
                      Q.Ty <ColF col="reqQty" tableFilters={tableFilters} />
                    </div>
                  </th>
                  <th className={TH2}>Weight (Kg)</th>
                </>
              )}

              {/* DOM contract sub-headers (11 cols — gộp Profile+Grade HĐ, gộp VAT, bỏ BG sản xuất) */}
              {colGroupVis.domContract && (
                <>
                  <th className={TH2}>
                    <div className="flex items-center justify-center gap-0.5">
                      Số HĐ <ColF col="contractNo" tableFilters={tableFilters} />
                    </div>
                  </th>
                  <th className={TH2}>
                    <div className="flex items-center justify-center gap-0.5">
                      NCC <ColF col="vendorName" tableFilters={tableFilters} />
                    </div>
                  </th>
                  <th className={TH2}>Spec HĐ</th>
                  <th className={TH2}>KL theo HĐ</th>
                  <th className={TH2}>Ngày ký</th>
                  <th className={TH2}>Handover Q.Ty</th>
                  <th className={TH2}>Handover Weight</th>
                  <th className={TH2}>Đơn giá NoVAT</th>
                  <th className={TH2}>Tổng NoVAT</th>
                  <th className={TH2}>%VAT</th>
                  <th className={TH2}>Handover Date</th>
                </>
              )}

              {/* DOM purchased sub-headers */}
              {colGroupVis.domPurchased && (
                <>
                  <th className={TH2}>Q.Ty</th>
                  <th className={TH2}>Weight</th>
                </>
              )}

              {/* DOM QC sub-headers */}
              {colGroupVis.domQC && (
                <>
                  <th className={TH2}>Report No</th>
                  <th className={TH2}>Insp Date</th>
                  <th className={TH2}>KL Acc</th>
                  <th className={TH2}>Result</th>
                </>
              )}

              {/* IMP contract sub-headers (16 cols — gộp Profile+Grade HĐ, bỏ BG sản xuất) */}
              {colGroupVis.impContract && (
                <>
                  <th className={TH2}>
                    <div className="flex items-center justify-center gap-0.5">
                      Số HĐ <ColF col="contractNo" tableFilters={tableFilters} />
                    </div>
                  </th>
                  <th className={TH2}>
                    <div className="flex items-center justify-center gap-0.5">
                      NCC <ColF col="vendorName" tableFilters={tableFilters} />
                    </div>
                  </th>
                  <th className={TH2}>Spec HĐ</th>
                  <th className={TH2}>KL HĐ</th>
                  <th className={TH2}>Ngày ký</th>
                  <th className={TH2}>Handover Q.Ty</th>
                  <th className={TH2}>Handover Weight</th>
                  <th className={TH2}>Đơn giá (USD)</th>
                  <th className={TH2}>Total HĐ</th>
                  <th className={TH2}>Ngày mở L/C</th>
                  <th className={TH2}>Cảng xuất</th>
                  <th className={TH2}>CIF Hải Phòng</th>
                  <th className={TH2}>Ngày TT</th>
                  <th className={TH2}>Hải quan</th>
                  <th className={TH2}>Ngày hàng về</th>
                  <th className={TH2}>Mời QC</th>
                </>
              )}

              {/* IMP purchased sub-headers */}
              {colGroupVis.impPurchased && (
                <>
                  <th className={TH2}>Q.Ty</th>
                  <th className={TH2}>Weight</th>
                </>
              )}

              {/* IMP QC sub-headers */}
              {colGroupVis.impQC && (
                <>
                  <th className={TH2}>Report No</th>
                  <th className={TH2}>Insp Date</th>
                  <th className={TH2}>KL Acc</th>
                  <th className={TH2}>Result</th>
                </>
              )}

              {/* Total Bought sub-headers */}
              {colGroupVis.totalBought && (
                <>
                  <th className={TH2}>Q.Ty</th>
                  <th className={TH2}>Weight</th>
                </>
              )}

              {/* Diff sub-headers */}
              {colGroupVis.diff && (
                <>
                  <th className={TH2}>Diff Q.Ty</th>
                  <th className={TH2}>Diff Weight</th>
                </>
              )}
            </tr>
          </thead>

          <tbody>
            {grouped.map(([code, items]) => {
              const sample = items[0];
              const groupName = sample.materialSubGroupName || sample.materialGroupName || code;
              return (
                <React.Fragment key={code}>
                  {/* Group header row */}
                  <tr>
                    <td
                      colSpan={100}
                      className="bg-[#dbeafe] border border-slate-400 px-3 py-1 text-[10px] font-black text-[#1B365D] sticky left-0"
                    >
                      {code} — {groupName}
                      <span className="ml-3 text-[9px] font-normal text-slate-500">
                        ({items.length} mã vật tư)
                      </span>
                    </td>
                  </tr>

                  {/* Item rows */}
                  {items.map((pr, idx) => {
                    const dom = getDOM(pr);
                    const imp = getIMP(pr);
                    const domInsp = getInspections(dom);
                    const impInsp = getInspections(imp);
                    const domTotalQty = sumQty(dom);
                    const domTotalWt = sumWeight(dom);
                    const domTotalVAT = dom.reduce((s, c) => s + (c.totalWithVAT || 0), 0);
                    const domTotalNoVAT = sumNoVAT(dom);
                    const impTotalQty = sumQty(imp);
                    const impTotalWt = sumWeight(imp);
                    const impTotal = sumNoVAT(imp);
                    const grandQty = domTotalQty + impTotalQty;
                    const grandWt = domTotalWt + impTotalWt;
                    const diffQty = grandQty - (pr.reqQty || 0);
                    const diffWt = grandWt - (pr.reqWeight || 0);
                    const evaluation =
                      diffQty < -0.5 ? 'Thiếu' : diffQty > 0.5 ? 'Thừa' : grandQty > 0 ? 'Đủ' : '';
                    const evalCls =
                      evaluation === 'Đủ'
                        ? 'bg-emerald-100 text-emerald-700 font-bold'
                        : evaluation === 'Thiếu'
                          ? 'bg-red-100 text-red-700 font-bold'
                          : evaluation === 'Thừa'
                            ? 'bg-amber-100 text-amber-700 font-bold'
                            : 'text-slate-300';

                    // Take first contract of each type for display
                    const dom1 = dom[0];
                    const imp1 = imp[0];
                    const domI1 = domInsp[0];
                    const impI1 = impInsp[0];

                    const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40';

                    // Suppress unused variable warning for domTotalVAT which is used indirectly
                    void domTotalVAT;

                    return (
                      <tr key={pr.id} className={`${rowBg} hover:bg-blue-50/30`}>
                        {/* Dự án — sticky đầu tiên */}
                        <td
                          className={`${TD_TEXT} sticky z-10 ${rowBg} text-[8px] font-bold text-[#1B365D]`}
                          style={{ left: STICKY_LEFT.project }}
                          title={pr.pr?.project?.name ?? ''}
                        >
                          <div className="truncate max-w-[88px]">
                            {pr.pr?.project?.code ?? '—'}
                          </div>
                        </td>

                        {/* Item/STT */}
                        <td
                          className={`${TD_TEXT} sticky z-10 ${rowBg} font-mono font-bold text-[#1B365D]`}
                          style={{ left: STICKY_LEFT.item }}
                          title={pr.itemCode}
                        >
                          <div className="truncate max-w-[78px]">{pr.itemCode}</div>
                        </td>

                        {/* Description */}
                        <td
                          className={`${TD_TEXT} sticky z-10 ${rowBg}`}
                          style={{ left: STICKY_LEFT.desc }}
                          title={pr.itemName}
                        >
                          <div className="truncate max-w-[170px]">{pr.itemName}</div>
                        </td>

                        {/* Profile */}
                        <td className={`${TD_TEXT} font-mono`} title={pr.profile}>
                          <div className="truncate max-w-[120px]">{pr.profile || ''}</div>
                        </td>

                        {/* Grade */}
                        <td className={`${TD_TEXT} font-mono font-bold text-[#1B365D]`}>
                          <div className="truncate max-w-[88px]">{pr.grade || ''}</div>
                        </td>

                        {/* Unit */}
                        <td className={TD_CENTER}>{pr.uom || ''}</td>

                        {/* U.Weight */}
                        <td className={TD}>{fmtNum(pr.unitWeight, 3)}</td>

                        {/* ── Net Quantity group ── */}
                        {colGroupVis.netQty ? (
                          <>
                            <td className={`${TD} font-semibold text-slate-800`}>
                              {fmtNum(pr.netQty)}
                            </td>
                            <td className={`${TD} text-slate-600`}>{fmtNum0(pr.netWeight)}</td>
                          </>
                        ) : (
                          <td className={TD_PLACEHOLDER} />
                        )}

                        {/* ── REVs group ── */}
                        {colGroupVis.revs ? (
                          (() => {
                            const projectCode = pr.pr?.project?.code ?? '';
                            const visIndices = getRevIndices(projectCode);
                            const allIndices = Array.from({ length: REV_COUNT }, (_, i) => i);
                            return (
                              <>
                                {allIndices.map((i) =>
                                  visIndices.includes(i) ? (
                                    <React.Fragment key={`rev${i}`}>
                                      <td className={`${TD} text-slate-300`}>—</td>
                                      <td className={`${TD} text-slate-300`}>—</td>
                                    </React.Fragment>
                                  ) : (
                                    <React.Fragment key={`rev${i}`}>
                                      <td className={`${TD_PLACEHOLDER} opacity-30`} />
                                      <td className={`${TD_PLACEHOLDER} opacity-30`} />
                                    </React.Fragment>
                                  )
                                )}
                              </>
                            );
                          })()
                        ) : (
                          <td className={TD_PLACEHOLDER} />
                        )}

                        {/* ── Total Ordered group ── */}
                        {colGroupVis.totalOrdered ? (
                          <>
                            <td className={`${TD} font-bold text-[#0d2b4e]`}>{fmtNum(pr.reqQty)}</td>
                            <td className={`${TD} font-bold text-[#0d2b4e]`}>
                              {fmtNum0(pr.reqWeight)}
                            </td>
                          </>
                        ) : (
                          <td className={TD_PLACEHOLDER} />
                        )}

                        {/* Remarks — not in any toggle group */}
                        <td className={`${TD_TEXT} text-[8px] text-slate-500`} title={pr.remarks}>
                          <div className="truncate max-w-[78px]">{pr.remarks || ''}</div>
                        </td>

                        {/* ── Remain group ── */}
                        {colGroupVis.remain ? (
                          <>
                            <td className={TD_TEXT}></td>
                            <td className={`${TD} text-violet-700`}>
                              {pr.remainQty ? fmtNum(pr.remainQty) : ''}
                            </td>
                            <td className={`${TD} text-violet-700`}>
                              {pr.remainWeight ? fmtNum0(pr.remainWeight) : ''}
                            </td>
                            <td className={TD_DATE}></td>
                            <td className={TD_TEXT}></td>
                          </>
                        ) : (
                          <td className={TD_PLACEHOLDER} />
                        )}

                        {/* ── ToBuy group ── */}
                        {colGroupVis.toBuy ? (
                          <>
                            <td className={`${TD} text-violet-700`}>
                              {pr.toBuyQty ? fmtNum(pr.toBuyQty) : ''}
                            </td>
                            <td className={`${TD} text-violet-700`}>
                              {pr.toBuyWeight ? fmtNum0(pr.toBuyWeight) : ''}
                            </td>
                          </>
                        ) : (
                          <td className={TD_PLACEHOLDER} />
                        )}

                        {/* Material available date — not in any toggle group */}
                        <td className={TD_DATE}></td>

                        {/* ── DOMESTIC CONTRACT group (11 cols) ── */}
                        {colGroupVis.domContract ? (
                          <>
                            <td
                              className={`${TD_TEXT} font-mono text-emerald-700`}
                              title={dom1?.contractNo || ''}
                            >
                              <div className="truncate max-w-[100px]">{dom1?.contractNo || ''}</div>
                            </td>
                            <td
                              className={`${TD_TEXT} font-bold text-emerald-700`}
                              title={dom1?.vendorName || ''}
                            >
                              <div className="truncate max-w-[100px]">{dom1?.vendorName || ''}</div>
                            </td>
                            {/* Spec HĐ = Profile + Grade gộp */}
                            <td
                              className={`${TD_TEXT} font-mono text-[8px]`}
                              title={[dom1?.actualProfile, dom1?.actualGrade].filter(Boolean).join(' · ')}
                            >
                              <div className="truncate max-w-[120px]">
                                {[dom1?.actualProfile, dom1?.actualGrade].filter(Boolean).join(' · ') || ''}
                              </div>
                            </td>
                            <td className={TD}>{fmtNum0(dom1?.contractWeight)}</td>
                            <td className={TD_DATE}>{fmtDate(dom1?.contractDate)}</td>
                            <td className={TD}>{fmtNum(dom1?.deliveredQty)}</td>
                            <td className={TD}>{fmtNum0(dom1?.deliveredWeight)}</td>
                            <td className={TD}>{fmtMoney(dom1?.unitPriceNoVAT)}</td>
                            <td className={`${TD} font-bold text-emerald-700`}>
                              {fmtMoney(dom1?.totalNoVAT)}
                            </td>
                            <td className={TD}>{dom1?.vatRate ? `${dom1.vatRate}%` : ''}</td>
                            <td className={TD_DATE}>{fmtDate(dom1?.handoverToProductDate)}</td>
                          </>
                        ) : (
                          <td className={TD_PLACEHOLDER} />
                        )}

                        {/* ── DOM purchased group ── */}
                        {colGroupVis.domPurchased ? (
                          <>
                            <td className={`${TD} font-bold text-emerald-700`}>
                              {fmtNum(domTotalQty)}
                            </td>
                            <td className={`${TD} font-bold text-emerald-700`}>
                              {fmtNum0(domTotalWt)}
                            </td>
                          </>
                        ) : (
                          <td className={TD_PLACEHOLDER} />
                        )}

                        {/* ── DOM QC group ── */}
                        {colGroupVis.domQC ? (
                          <>
                            <td className={`${TD_TEXT} font-mono text-[8px]`}>
                              <div className="truncate max-w-[80px]">{domI1?.reportNo || ''}</div>
                            </td>
                            <td className={TD_DATE}>{fmtDate(domI1?.inspectionDate)}</td>
                            <td className={TD}>{fmtNum0(domI1?.acceptedWeight)}</td>
                            <td className={TD_CENTER}>
                              {domI1?.result && (
                                <span
                                  className={`px-1 rounded text-[8px] font-bold ${
                                    /pass|đạt/i.test(domI1.result)
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {domI1.result}
                                </span>
                              )}
                            </td>
                          </>
                        ) : (
                          <td className={TD_PLACEHOLDER} />
                        )}

                        {/* ── IMPORT CONTRACT group (16 cols) ── */}
                        {colGroupVis.impContract ? (
                          <>
                            <td
                              className={`${TD_TEXT} font-mono text-indigo-700`}
                              title={imp1?.contractNo || ''}
                            >
                              <div className="truncate max-w-[100px]">{imp1?.contractNo || ''}</div>
                            </td>
                            <td
                              className={`${TD_TEXT} font-bold text-indigo-700`}
                              title={imp1?.vendorName || ''}
                            >
                              <div className="truncate max-w-[100px]">{imp1?.vendorName || ''}</div>
                            </td>
                            {/* Spec HĐ = Profile + Grade gộp */}
                            <td
                              className={`${TD_TEXT} font-mono text-[8px]`}
                              title={[imp1?.actualProfile, imp1?.actualGrade].filter(Boolean).join(' · ')}
                            >
                              <div className="truncate max-w-[120px]">
                                {[imp1?.actualProfile, imp1?.actualGrade].filter(Boolean).join(' · ') || ''}
                              </div>
                            </td>
                            <td className={TD}>{fmtNum0(imp1?.contractWeight)}</td>
                            <td className={TD_DATE}>{fmtDate(imp1?.contractDate)}</td>
                            <td className={TD}>{fmtNum(imp1?.deliveredQty)}</td>
                            <td className={TD}>{fmtNum0(imp1?.deliveredWeight)}</td>
                            <td className={TD}>
                              {imp1?.unitPriceNoVAT ? `$${fmtNum(imp1.unitPriceNoVAT, 2)}` : ''}
                            </td>
                            <td className={`${TD} font-bold text-indigo-700`}>
                              {imp1?.totalNoVAT ? `$${fmtNum0(imp1.totalNoVAT)}` : ''}
                            </td>
                            <td className={TD_DATE}>{fmtDate(imp1?.importLCDate)}</td>
                            <td className={`${TD_TEXT} text-[8px]`}>
                              <div className="truncate max-w-[80px]">{imp1?.exportPort || ''}</div>
                            </td>
                            <td className={TD_DATE}>{fmtDate(imp1?.cifDate)}</td>
                            <td className={TD_DATE}>{fmtDate(imp1?.paymentDate)}</td>
                            <td className={TD_DATE}>{fmtDate(imp1?.customsDate)}</td>
                            <td className={`${TD_DATE} font-bold text-indigo-700`}>
                              {fmtDate(imp1?.arrivedDate)}
                            </td>
                            <td className={TD_DATE}>{fmtDate(imp1?.qcInvitationDate)}</td>
                          </>
                        ) : (
                          <td className={TD_PLACEHOLDER} />
                        )}

                        {/* ── IMP purchased group ── */}
                        {colGroupVis.impPurchased ? (
                          <>
                            <td className={`${TD} font-bold text-indigo-700`}>{fmtNum(impTotalQty)}</td>
                            <td className={`${TD} font-bold text-indigo-700`}>{fmtNum0(impTotalWt)}</td>
                          </>
                        ) : (
                          <td className={TD_PLACEHOLDER} />
                        )}

                        {/* ── IMP QC group ── */}
                        {colGroupVis.impQC ? (
                          <>
                            <td className={`${TD_TEXT} font-mono text-[8px]`}>
                              <div className="truncate max-w-[80px]">{impI1?.reportNo || ''}</div>
                            </td>
                            <td className={TD_DATE}>{fmtDate(impI1?.inspectionDate)}</td>
                            <td className={TD}>{fmtNum0(impI1?.acceptedWeight)}</td>
                            <td className={TD_CENTER}>
                              {impI1?.result && (
                                <span
                                  className={`px-1 rounded text-[8px] font-bold ${
                                    /pass|đạt/i.test(impI1.result)
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {impI1.result}
                                </span>
                              )}
                            </td>
                          </>
                        ) : (
                          <td className={TD_PLACEHOLDER} />
                        )}

                        {/* ── Total Bought group ── */}
                        {colGroupVis.totalBought ? (
                          <>
                            <td className={`${TD} font-black text-[#0d2b4e]`}>{fmtNum(grandQty)}</td>
                            <td className={`${TD} font-black text-[#0d2b4e]`}>{fmtNum0(grandWt)}</td>
                          </>
                        ) : (
                          <td className={TD_PLACEHOLDER} />
                        )}

                        {/* ── Diff group ── */}
                        {colGroupVis.diff ? (
                          <>
                            <td
                              className={`${TD} font-bold ${
                                diffQty < 0
                                  ? 'text-red-600'
                                  : diffQty > 0
                                    ? 'text-amber-600'
                                    : 'text-slate-400'
                              }`}
                            >
                              {diffQty !== 0 ? (diffQty > 0 ? '+' : '') + fmtNum(diffQty) : ''}
                            </td>
                            <td
                              className={`${TD} ${
                                diffWt < 0
                                  ? 'text-red-600'
                                  : diffWt > 0
                                    ? 'text-amber-600'
                                    : 'text-slate-400'
                              }`}
                            >
                              {diffWt !== 0 ? (diffWt > 0 ? '+' : '') + fmtNum0(diffWt) : ''}
                            </td>
                          </>
                        ) : (
                          <td className={TD_PLACEHOLDER} />
                        )}

                        {/* KQ mua sắm (Đủ/Thiếu/Thừa) */}
                        <td className={`${TD_CENTER} ${evalCls}`} title={`Tổng: ${fmtMoney(domTotalNoVAT + impTotal)}`}>
                          {evaluation || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
