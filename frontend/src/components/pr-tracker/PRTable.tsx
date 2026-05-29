// ============================================================
// PRTable.tsx v5 — Thứ tự cột ĐÚNG theo mẫu PR I-095-ENG-001-REV 08
//
// Mẫu PR (sheet PR, row 9-10):
//   STT | Mô tả | Profile | Mác | ĐVT | Đ.Trọng
//   | SL tinh + KL tinh
//   | Đã dự trù (SL+KL) [Previous Ordered]
//   | Dự trù hiện tại (SL+KL) [Current Ordered]
//   | Tổng dự trù (SL+KL) [Total Ordered]
//   | Ghi chú
//   | [Fab cats: SL+KL mỗi hạng]
//
// Trong hệ thống theo dõi, map thành:
//   STT | MÃ | Mô tả | Profile | Mác | ĐVT | Đ.Trọng
//   | SL PR (tinh) + KL PR (tinh)
//   | Đã mua DOM (SL+KL+Tiền)   ← "Đã dự trù/Previous Ordered"
//   | Đã mua IMP (SL+KL+CIF)    ← "Dự trù hiện tại/Current"
//   | Tổng mua (SL+KL) + Chênh  ← "Tổng dự trù/Total Ordered"
//   | Tồn kho tận dụng
//   | Ghi chú
//   | [Fab cats: SL mỗi hạng mục gia công]
//   | Đánh giá | Tiến độ | HĐ
// ============================================================
'use client';

import React, { useState, useMemo } from 'react';
import { StatusBadge } from './StatusBadge';
import type { PRDetail, MaterialGroup, FabricationCategory } from '@/types/procurement';
import { MATERIAL_GROUPS, FAB_CATEGORIES_I090 } from '@/lib/mockPRData';
import { FabAllocationModal } from './FabAllocationModal';
import { ProcurementWorkflowPanel } from '@/components/mua-hang/ProcurementWorkflowPanel';
import { WORKFLOW_STEPS, STEP_STATUS_STYLE } from '@/components/mua-hang/workflowSteps';

interface PRTableProps {
  prs: PRDetail[];
  isLoading: boolean;
  onToggleStatus: (pr: PRDetail) => void;
  onBulkToggleStatus?: (ids: string[]) => void;
  searchQuery?: string;
  fabCategories?: FabricationCategory[];
  materialGroups?: MaterialGroup[];
  onAllocate?: (
    prDetailId: string,
    allocations: { fabricationCategoryId: string; qty: number; weight: number }[]
  ) => Promise<void>;
}

// ─── Helpers ───────────────────────────────────────────────────
const n = (v: number | undefined | null, dec = 2): string => {
  if (!v || isNaN(v) || v === 0) return '—';
  return v.toLocaleString('vi-VN', { maximumFractionDigits: dec });
};
const money = (v: number): string => {
  if (!v || v === 0) return '—';
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + ' tỷ';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + ' tr';
  return v.toLocaleString('vi-VN');
};

// ─── Status configs ─────────────────────────────────────────────
const STATUS_CFG: Record<string, { cls: string; icon: string }> = {
  'Cho bao gia': { cls: 'bg-slate-100 text-slate-600 border-slate-300', icon: 'hourglass_empty' },
  'Dang dam phan': { cls: 'bg-amber-50 text-amber-700 border-amber-300', icon: 'handshake' },
  'Da ky HD': { cls: 'bg-blue-50 text-blue-700 border-blue-300', icon: 'description' },
  'Hang dang ve': { cls: 'bg-indigo-50 text-indigo-700 border-indigo-300', icon: 'local_shipping' },
  'Da nghiem thu': { cls: 'bg-teal-50 text-teal-700 border-teal-300', icon: 'verified' },
  'Da nhap kho': { cls: 'bg-emerald-50 text-emerald-700 border-emerald-300', icon: 'warehouse' },
};
const MS_CFG: Record<string, { cls: string; icon: string }> = {
  Đủ: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'check_circle' },
  Thiếu: { cls: 'bg-red-50 text-red-700 border-red-200', icon: 'error' },
  Thừa: { cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'warning' },
};
const GROUP_COLORS: Record<string, string> = {
  VTC: 'bg-blue-700',
  VPK: 'bg-violet-700',
  VDK: 'bg-amber-700',
  VBP: 'bg-slate-600',
  VTH: 'bg-orange-700',
  VTS: 'bg-teal-700',
};

// ─── GROUP HEADER ROW ──────────────────────────────────────────
function GroupHeader({
  group,
  items,
  fabCats,
  isExpanded,
  onToggle,
}: {
  group: MaterialGroup;
  items: PRDetail[];
  fabCats: FabricationCategory[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const totalReqWeight = items.reduce((s, i) => s + (i.reqWeight || 0), 0);
  const totalBoughtW = items.reduce((s, i) => s + (i.totalPurchasedWeight || 0), 0);
  const totalBoughtQ = items.reduce((s, i) => s + (i.totalPurchasedQty || 0), 0);
  const totalNoVAT = items.reduce(
    (s, i) => s + (i.domesticTotalNoVAT || 0) + (i.importTotalNoVAT || 0),
    0
  );
  const duCount = items.filter((i) => i.materialStatus === 'Đủ').length;
  const thieuCount = items.filter((i) => i.materialStatus === 'Thiếu').length;
  const thuaCount = items.filter((i) => i.materialStatus === 'Thừa').length;

  // Total cols = 7 fixed + 2(SL+KL PR) + 3(DOM) + 3(IMP) + 2(Tổng+Chênh) + 1(Tồn) + 1(GhiChú)
  //            + fabCats * 1 + 11 (workflow steps) = 30 + fabCats.length
  const totalCols = 30 + fabCats.length;

  return (
    <tr className="cursor-pointer hover:bg-[#c9dcf8] select-none bg-[#dbeafe]" onClick={onToggle}>
      <td colSpan={totalCols} className="border border-slate-400 px-0 py-0 text-[#1B365D]">
        <div className="flex items-center gap-3 px-3 py-1.5">
          <div
            className={`w-5 h-5 rounded flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 ${GROUP_COLORS[group.code] || 'bg-[#1B365D]'}`}
          >
            {group.letter}
          </div>
          <div className="flex items-baseline gap-2 flex-1">
            <span className="font-black text-[10px] text-[#1B365D] uppercase tracking-wide">
              {group.code}
            </span>
            <span className="text-[9.5px] font-black text-[#1B365D]">— {group.name}</span>
            <span className="text-[9px] text-[#1B365D]/60">/ {group.nameEn}</span>
          </div>
          <div className="flex items-center gap-3 text-[9px] text-[#1B365D]">
            <span>
              <strong>{items.length}</strong> mã
            </span>
            {totalReqWeight > 0 && (
              <span>
                PR: <strong>{n(totalReqWeight / 1000, 1)}T</strong>
              </span>
            )}
            {totalBoughtW > 0 && (
              <span>
                Đã mua: <strong className="text-emerald-700">{n(totalBoughtW / 1000, 1)}T</strong>
              </span>
            )}
            {totalBoughtQ > 0 && totalReqWeight === 0 && (
              <span>
                Đã mua: <strong className="text-emerald-700">{n(totalBoughtQ, 0)}</strong> SL
              </span>
            )}
            {totalNoVAT > 0 && (
              <span>
                Giá trị: <strong>{money(totalNoVAT)}</strong>
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {duCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                Đủ {duCount}
              </span>
            )}
            {thieuCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-red-100 text-red-800 border border-red-300">
                Thiếu {thieuCount}
              </span>
            )}
            {thuaCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                Thừa {thuaCount}
              </span>
            )}
          </div>
          <span className="material-symbols-outlined text-[#1B365D]/60 text-[15px]">
            {isExpanded ? 'expand_less' : 'expand_more'}
          </span>
        </div>
      </td>
    </tr>
  );
}

// ─── ITEM ROW ──────────────────────────────────────────────────
// Thứ tự cột theo mẫu PR:
//  1: STT
//  2: MÃ (itemCode)
//  3: Mô tả (itemName)
//  4: Profile
//  5: Mác
//  6: ĐVT
//  7: Đ.Trọng (unitWeight)
//  8-9: SL tinh + KL tinh (reqQty, reqWeight) ← Net Quantity
//  10-12: Đã mua DOM (SL+KL+Tiền) ← Previous Ordered
//  13-15: Đã mua IMP (SL+KL+CIF) ← Current Ordered
//  16-17: Tổng mua (SL+KL) ← Total Ordered SL+KL
//  18: Chênh SL (diffQty)
//  19: Tồn kho tận dụng (remainQty)
//  20: Ghi chú ← Remarks
//  21..N: Fab cats (SL phân bổ mỗi hạng) ← VẬT TƯ INLET U1, SCR-U1...
//  N+1: Đánh giá
//  N+2: Tiến độ
//  N+3: HĐ
function ItemRow({
  pr,
  index,
  fabCats,
}: {
  pr: PRDetail;
  index: number;
  fabCats: FabricationCategory[];
  onToggleStatus?: (pr: PRDetail) => void;
  onOpenAllocate?: (pr: PRDetail) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Format PR-090: unified slate-300 borders, compact cells, 9px numeric text
  const CELL_NUM =
    'border border-slate-300 text-right text-[9px] font-mono px-1 py-1 whitespace-nowrap';
  const CELL_TEXT = 'border border-slate-300 text-left text-[9px] px-1 py-1';
  const CELL_CENTER = 'border border-slate-300 text-center text-[9px] px-1 py-1';

  return (
    <>
      <tr className={`hover:bg-blue-50/30 transition-colors ${expanded ? 'bg-blue-50/20' : ''}`}>
        {/* 1. STT */}
        <td className={`${CELL_CENTER} text-slate-400 font-mono w-8`}>{index + 1}</td>

        {/* 2. Item/STT — cap width */}
        <td className={`${CELL_TEXT} min-w-[80px] max-w-[130px]`}>
          <div
            className="font-mono text-[9.5px] font-bold text-[#1B365D] leading-tight truncate"
            title={pr.itemCode}
          >
            {pr.itemCode}
          </div>
          {pr.materialSubGroupCode && (
            <div className="text-[8px] text-slate-400 mt-0.5">{pr.materialSubGroupCode}</div>
          )}
        </td>

        {/* 3. Description/Chi tiết — cap width + line clamp để noise text không chiếm hết viewport */}
        <td className={`${CELL_TEXT} min-w-[130px] max-w-[200px]`}>
          <div
            className="text-[9.5px] font-semibold text-slate-800 leading-tight truncate"
            title={pr.itemName}
          >
            {pr.itemName}
          </div>
        </td>

        {/* 4. Profile/Vật tư */}
        <td className={`${CELL_TEXT} min-w-[90px]`}>
          <div
            className="text-[9px] font-mono text-slate-600 truncate max-w-[150px]"
            title={pr.profile}
          >
            {pr.profile || '—'}
          </div>
        </td>

        {/* 5. Grade/Mác vật liệu */}
        <td className={`${CELL_CENTER} font-mono font-bold text-[#1B365D] whitespace-nowrap`}>
          {pr.grade || '—'}
        </td>

        {/* 6. Unit/Đơn vị */}
        <td className={`${CELL_CENTER} text-slate-600`}>{pr.uom}</td>

        {/* 7. U.Weight/Đ.Trọng */}
        <td className={`${CELL_NUM} text-slate-500`}>{pr.unitWeight ? n(pr.unitWeight, 3) : ''}</td>

        {/* 8-9. Net Quantity */}
        <td className={`${CELL_NUM} font-semibold text-slate-800`}>{n(pr.reqQty, 2)}</td>
        <td className={`${CELL_NUM} text-slate-500`}>{n(pr.reqWeight, 0)}</td>

        {/* 10-12. Domestic (DOM) */}
        <td className={`${CELL_NUM} text-emerald-700 font-semibold`}>
          {n(pr.domesticTotalQty, 2)}
        </td>
        <td className={`${CELL_NUM} text-emerald-700`}>{n(pr.domesticTotalWeight, 0)}</td>
        <td className={`${CELL_NUM} text-emerald-700`}>{money(pr.domesticTotalNoVAT)}</td>

        {/* 13-15. Import (IMP) */}
        <td className={`${CELL_NUM} text-indigo-700 font-semibold`}>
          {pr.importTotalQty > 0 ? n(pr.importTotalQty, 2) : ''}
        </td>
        <td className={`${CELL_NUM} text-indigo-700`}>
          {pr.importTotalWeight > 0 ? n(pr.importTotalWeight, 0) : ''}
        </td>
        <td className={`${CELL_NUM} text-indigo-700`}>
          {pr.importCIFTotal > 0 ? money(pr.importCIFTotal) : ''}
        </td>

        {/* 16-17. Total Ordered */}
        <td className={`${CELL_NUM} font-black text-[#0d2b4e]`}>{n(pr.totalPurchasedQty, 2)}</td>
        <td className={`${CELL_NUM} font-black text-[#0d2b4e]`}>{n(pr.totalPurchasedWeight, 0)}</td>
        {/* 18. Diff / Chênh SL */}
        <td
          className={`${CELL_NUM} font-bold ${
            pr.diffQty < 0 ? 'text-red-600' : pr.diffQty > 0 ? 'text-amber-600' : 'text-slate-400'
          }`}
        >
          {pr.diffQty !== 0 ? (pr.diffQty > 0 ? '+' : '') + n(pr.diffQty, 2) : ''}
        </td>

        {/* 19. Stock / Tồn kho */}
        <td className={`${CELL_NUM} text-violet-700`}>
          {pr.remainQty > 0 ? n(pr.remainQty, 2) : ''}
        </td>

        {/* 20. Remarks / Ghi chú */}
        <td className={`${CELL_TEXT} max-w-[100px] text-[8px] text-slate-500`}>
          <div className="truncate" title={pr.remarks}>
            {pr.remarks || ''}
          </div>
        </td>

        {/* 21..N. Fab allocations */}
        {fabCats.map((cat) => {
          const alloc = pr.fabAllocations?.find((a) => a.categoryCode === cat.code);
          return (
            <td
              key={cat.id}
              className={`${CELL_NUM} ${
                alloc && alloc.qty > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-200'
              }`}
            >
              {alloc ? n(alloc.qty, 2) : ''}
            </td>
          );
        })}

        {/* 11 Workflow Step cells — render full data */}
        {WORKFLOW_STEPS.map((step) => {
          const s = step.getStatus(pr);
          const style = STEP_STATUS_STYLE[s.status];
          return (
            <td
              key={step.key}
              className={`border border-slate-300 align-top px-1 py-1 ${step.width}`}
              title={step.label}
            >
              {/* Status top bar */}
              <div className={`h-0.5 -mx-1 -mt-1 mb-1 ${style.topBar}`} />
              {step.renderCell(pr)}
            </td>
          );
        })}
      </tr>

      {/* WORKFLOW DETAIL PANEL — full-width row khi expanded */}
      {expanded && (
        <tr className="bg-slate-50/30 border-b-2 border-slate-200">
          <td colSpan={30 + fabCats.length} className="p-3">
            <ProcurementWorkflowPanel pr={pr} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────
export function PRTable({
  prs,
  isLoading,
  onToggleStatus,
  onBulkToggleStatus,
  searchQuery = '',
  fabCategories,
  materialGroups,
  onAllocate,
}: PRTableProps) {
  const fabCats = fabCategories || FAB_CATEGORIES_I090;
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['VTC', 'VPK', 'VDK']));
  const [viewMode, setViewMode] = useState<'group' | 'flat'>('group');
  const [allocatingItem, setAllocatingItem] = useState<PRDetail | null>(null);
  const [isSavingAlloc, setIsSavingAlloc] = useState(false);

  const handleOpenAllocate = (pr: PRDetail) => setAllocatingItem(pr);
  const handleSaveAlloc = async (
    prDetailId: string,
    allocations: { fabricationCategoryId: string; qty: number; weight: number }[]
  ) => {
    if (!onAllocate) {
      setAllocatingItem(null);
      return;
    }
    setIsSavingAlloc(true);
    try {
      await onAllocate(prDetailId, allocations);
      setAllocatingItem(null);
    } finally {
      setIsSavingAlloc(false);
    }
  };
  const toggleGroup = (code: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!searchQuery) return prs;
    const q = searchQuery.toLowerCase();
    return prs.filter(
      (p) =>
        p.itemCode.toLowerCase().includes(q) ||
        p.itemName.toLowerCase().includes(q) ||
        p.profile?.toLowerCase().includes(q) ||
        p.grade?.toLowerCase().includes(q)
    );
  }, [prs, searchQuery]);

  const grouped = useMemo(() => {
    const map = new Map<string, PRDetail[]>();
    MATERIAL_GROUPS.forEach((g) => map.set(g.code, []));
    filtered.forEach((pr) => {
      const code = pr.materialGroupCode || 'VTC';
      if (!map.has(code)) map.set(code, []);
      map.get(code)!.push(pr);
    });
    return map;
  }, [filtered]);

  if (isLoading)
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <span className="material-symbols-outlined text-4xl text-slate-300 animate-spin">
          refresh
        </span>
        <p className="text-sm text-slate-400 mt-3">Đang tải dữ liệu...</p>
      </div>
    );

  if (prs.length === 0)
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <span className="material-symbols-outlined text-5xl text-slate-200">assignment</span>
        <p className="text-slate-400 mt-3">Chưa có vật tư. Import file CSV/XLSX để bắt đầu.</p>
      </div>
    );

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
          <span className="text-sm font-bold text-[#1B365D]">Bảng Theo Dõi Vật Tư</span>
          <span className="text-xs text-slate-400">{filtered.length} mã vật tư</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'group' ? 'flat' : 'group')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${viewMode === 'group' ? 'bg-[#1B365D] text-white' : 'bg-white text-slate-600 border border-slate-300'}`}
            >
              {viewMode === 'group' ? 'Phân nhóm' : 'Danh sách'}
            </button>
            <button
              onClick={() => setExpandedGroups(new Set(MATERIAL_GROUPS.map((g) => g.code)))}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100"
            >
              Mở tất cả
            </button>
            <button
              onClick={() => setExpandedGroups(new Set())}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100"
            >
              Thu tất cả
            </button>
          </div>
        </div>

        {/* Scrollable table area — both horizontal and vertical */}
        <div className="flex-1 overflow-auto min-h-0">
          <table
            className="w-full text-[9px] border-collapse"
            style={{ minWidth: `${1200 + fabCats.length * 75}px` }}
          >
            <thead className="sticky top-0 z-30">
              {/* ══ ROW 1: Group-level headers — format PR-090 (navy blue đồng bộ) ══ */}
              <tr>
                {/* Cột định danh (7 cột) — bilingual Eng/Vi */}
                <th
                  rowSpan={2}
                  className="px-1 py-1 text-center bg-[#1B365D] text-white border border-slate-400 text-[8.5px] font-black sticky left-0 z-20 w-8"
                >
                  #
                </th>
                <th
                  rowSpan={2}
                  className="px-1 py-1 text-center bg-[#1B365D] text-white border border-slate-400 text-[8.5px] font-black min-w-[80px]"
                >
                  Item/
                  <br />
                  STT
                </th>
                <th
                  rowSpan={2}
                  className="px-1 py-1 text-center bg-[#1B365D] text-white border border-slate-400 text-[8.5px] font-black min-w-[130px]"
                >
                  Description/
                  <br />
                  Chi tiết
                </th>
                <th
                  rowSpan={2}
                  className="px-1 py-1 text-center bg-[#1B365D] text-white border border-slate-400 text-[8.5px] font-black min-w-[90px]"
                >
                  Profile/
                  <br />
                  Vật tư
                </th>
                <th
                  rowSpan={2}
                  className="px-1 py-1 text-center bg-[#1B365D] text-white border border-slate-400 text-[8.5px] font-black"
                >
                  Grade/
                  <br />
                  Mác vật liệu
                </th>
                <th
                  rowSpan={2}
                  className="px-1 py-1 text-center bg-[#1B365D] text-white border border-slate-400 text-[8.5px] font-black"
                >
                  Unit/
                  <br />
                  Đơn vị
                </th>
                <th
                  rowSpan={2}
                  className="px-1 py-1 text-center bg-[#1B365D] text-white border border-slate-400 text-[8.5px] font-black"
                >
                  U.Weight/
                  <br />
                  Đ.Trọng
                  <br />
                  (Kg/m²,m,pcs)
                </th>

                {/* Net Quantity/ Số lượng tinh */}
                <th
                  colSpan={2}
                  className="px-1 py-1 text-center bg-[#1e4976] text-white border border-slate-400 text-[8.5px] font-black"
                >
                  Net Quantity/
                  <br />
                  Số lượng tinh
                </th>

                {/* Domestic / Đã mua Trong Nước */}
                <th
                  colSpan={3}
                  className="px-1 py-1 text-center bg-[#37547a] text-white border border-slate-400 text-[8.5px] font-black"
                >
                  Domestic Ordered/
                  <br />
                  Đã mua trong nước (DOM)
                </th>

                {/* Import / Đã mua Nhập Khẩu */}
                <th
                  colSpan={3}
                  className="px-1 py-1 text-center bg-[#1d3f6b] text-white border border-slate-400 text-[8.5px] font-black"
                >
                  Import Ordered/
                  <br />
                  Đã mua nhập khẩu (IMP)
                </th>

                {/* Total Ordered / Tổng dự trù */}
                <th
                  colSpan={3}
                  className="px-1 py-1 text-center bg-[#0d2b4e] text-white border border-slate-400 text-[8.5px] font-black"
                >
                  Total Ordered/
                  <br />
                  Tổng dự trù
                </th>

                {/* Stock / Tồn kho */}
                <th
                  rowSpan={2}
                  className="px-1 py-1 text-center bg-[#1B365D] text-white border border-slate-400 text-[8.5px] font-black"
                >
                  Stock/
                  <br />
                  Tồn kho
                </th>

                {/* Remarks / Ghi chú */}
                <th
                  rowSpan={2}
                  className="px-1 py-1 text-center bg-[#1B365D] text-white border border-slate-400 text-[8.5px] font-black min-w-[80px]"
                >
                  Remarks/
                  <br />
                  Ghi chú
                </th>

                {/* Fabrication allocation / Hạng mục gia công */}
                {fabCats.length > 0 && (
                  <th
                    colSpan={fabCats.length}
                    className="px-1 py-1 text-center bg-[#0f4c81] text-white border border-slate-400 text-[7.5px] font-black"
                  >
                    Fabrication Allocation/
                    <br />
                    Phân bổ hạng mục gia công
                  </th>
                )}

                {/* 11-step Workflow Mua Sắm */}
                <th
                  colSpan={WORKFLOW_STEPS.length}
                  className="px-1 py-1 text-center bg-[#0a1f38] text-white border border-slate-400 text-[8.5px] font-black"
                >
                  Workflow/
                  <br />
                  11 bước mua sắm
                </th>
              </tr>

              {/* ══ ROW 2: Sub-column headers — medium navy ══ */}
              <tr>
                {/* Net Qty */}
                <th className="px-1 py-0.5 text-center bg-[#2a5298] text-white border border-slate-400 text-[8px] font-bold">
                  Q.Ty/
                  <br />
                  SL tinh
                </th>
                <th className="px-1 py-0.5 text-center bg-[#2a5298] text-white border border-slate-400 text-[8px] font-bold">
                  Weight/
                  <br />
                  KL (Kg)
                </th>
                {/* DOM */}
                <th className="px-1 py-0.5 text-center bg-[#2a5298] text-white border border-slate-400 text-[8px] font-bold">
                  Q.Ty/
                  <br />
                  SL
                </th>
                <th className="px-1 py-0.5 text-center bg-[#2a5298] text-white border border-slate-400 text-[8px] font-bold">
                  Weight/
                  <br />
                  KL (Kg)
                </th>
                <th className="px-1 py-0.5 text-center bg-[#2a5298] text-white border border-slate-400 text-[8px] font-bold">
                  Value/
                  <br />
                  Tiền
                </th>
                {/* IMP */}
                <th className="px-1 py-0.5 text-center bg-[#2a5298] text-white border border-slate-400 text-[8px] font-bold">
                  Q.Ty/
                  <br />
                  SL
                </th>
                <th className="px-1 py-0.5 text-center bg-[#2a5298] text-white border border-slate-400 text-[8px] font-bold">
                  Weight/
                  <br />
                  KL (Kg)
                </th>
                <th className="px-1 py-0.5 text-center bg-[#2a5298] text-white border border-slate-400 text-[8px] font-bold">
                  CIF/
                  <br />
                  Giá CIF
                </th>
                {/* Total */}
                <th className="px-1 py-0.5 text-center bg-[#2a5298] text-white border border-slate-400 text-[8px] font-bold">
                  Q.Ty/
                  <br />
                  Tổng SL
                </th>
                <th className="px-1 py-0.5 text-center bg-[#2a5298] text-white border border-slate-400 text-[8px] font-bold">
                  Weight/
                  <br />
                  KL (Kg)
                </th>
                <th className="px-1 py-0.5 text-center bg-[#2a5298] text-white border border-slate-400 text-[8px] font-bold">
                  Diff/
                  <br />
                  Chênh SL
                </th>
                {/* Fab cats */}
                {fabCats.map((cat) => (
                  <th
                    key={cat.id}
                    className="px-1 py-0.5 text-center bg-[#163966] text-white border border-slate-400 text-[7.5px] font-bold max-w-[70px]"
                  >
                    <div className="truncate" title={cat.name}>
                      {cat.code}
                    </div>
                  </th>
                ))}
                {/* 11 Workflow Step columns — bilingual label theo file mẫu */}
                {WORKFLOW_STEPS.map((step, idx) => (
                  <th
                    key={step.key}
                    title={step.label}
                    className={`px-1 py-0.5 text-center bg-[#163966] text-white border border-slate-400 text-[8px] font-bold ${step.width}`}
                  >
                    <div className="text-[7px] opacity-70 font-mono">BƯỚC {idx + 1}</div>
                    <div className="text-[8px] leading-tight">{step.label}</div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {viewMode === 'group'
                ? MATERIAL_GROUPS.map((group) => {
                    const items = grouped.get(group.code) || [];
                    if (items.length === 0) return null;
                    const isExpanded = expandedGroups.has(group.code);
                    return (
                      <React.Fragment key={group.code}>
                        <GroupHeader
                          group={group}
                          items={items}
                          fabCats={fabCats}
                          isExpanded={isExpanded}
                          onToggle={() => toggleGroup(group.code)}
                        />
                        {isExpanded &&
                          items.map((pr, idx) => (
                            <ItemRow
                              key={pr.id}
                              pr={pr}
                              index={idx}
                              fabCats={fabCats}
                              onToggleStatus={onToggleStatus}
                              onOpenAllocate={handleOpenAllocate}
                            />
                          ))}
                        {isExpanded && (
                          <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-[11px]">
                            <td colSpan={7} className="px-3 py-2 text-right text-slate-500 italic">
                              Cộng nhóm {group.code} ({items.length} mã):
                            </td>
                            <td className="px-2 py-2 text-right font-mono">
                              {n(
                                items.reduce((s, i) => s + (i.reqQty || 0), 0),
                                2
                              )}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-slate-500">
                              {n(
                                items.reduce((s, i) => s + (i.reqWeight || 0), 0),
                                0
                              )}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-emerald-700">
                              {n(
                                items.reduce((s, i) => s + (i.domesticTotalQty || 0), 0),
                                2
                              )}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-emerald-700">
                              {n(
                                items.reduce((s, i) => s + (i.domesticTotalWeight || 0), 0),
                                0
                              )}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-emerald-700">
                              {money(items.reduce((s, i) => s + (i.domesticTotalNoVAT || 0), 0))}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-indigo-700">
                              {n(
                                items.reduce((s, i) => s + (i.importTotalQty || 0), 0),
                                2
                              )}
                            </td>
                            <td colSpan={2} className="px-2 py-2"></td>
                            <td className="px-2 py-2 text-right font-mono font-bold">
                              {n(
                                items.reduce((s, i) => s + (i.totalPurchasedQty || 0), 0),
                                2
                              )}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-slate-600">
                              {n(
                                items.reduce((s, i) => s + (i.totalPurchasedWeight || 0), 0),
                                0
                              )}
                            </td>
                            <td colSpan={3} className="px-2 py-2"></td>
                            {fabCats.map((cat) => (
                              <td
                                key={cat.id}
                                className="px-2 py-2 text-right font-mono text-sky-700"
                              >
                                {n(
                                  items.reduce((s, i) => {
                                    const a = i.fabAllocations?.find(
                                      (a) => a.categoryCode === cat.code
                                    );
                                    return s + (a?.qty || 0);
                                  }, 0),
                                  2
                                )}
                              </td>
                            ))}
                            <td colSpan={3} className="px-2 py-2"></td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                : filtered.map((pr, idx) => (
                    <ItemRow
                      key={pr.id}
                      pr={pr}
                      index={idx}
                      fabCats={fabCats}
                      onToggleStatus={onToggleStatus}
                      onOpenAllocate={handleOpenAllocate}
                    />
                  ))}

              {/* GRAND TOTAL */}
              <tr className="bg-[#1B365D] text-white font-bold text-[11px] border-t-2 border-[#1B365D]">
                <td
                  colSpan={7}
                  className="px-3 py-2.5 text-right uppercase tracking-wide text-blue-200"
                >
                  Tổng cộng ({filtered.length} mã):
                </td>
                <td className="px-2 py-2.5 text-right font-mono">
                  {n(
                    filtered.reduce((s, i) => s + (i.reqQty || 0), 0),
                    2
                  )}
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-blue-200">
                  {n(
                    filtered.reduce((s, i) => s + (i.reqWeight || 0), 0),
                    0
                  )}
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-emerald-300">
                  {n(
                    filtered.reduce((s, i) => s + (i.domesticTotalQty || 0), 0),
                    2
                  )}
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-emerald-300">
                  {n(
                    filtered.reduce((s, i) => s + (i.domesticTotalWeight || 0), 0),
                    0
                  )}
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-emerald-300">
                  {money(filtered.reduce((s, i) => s + (i.domesticTotalNoVAT || 0), 0))}
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-indigo-300">
                  {n(
                    filtered.reduce((s, i) => s + (i.importTotalQty || 0), 0),
                    2
                  )}
                </td>
                <td colSpan={2} className="px-2 py-2.5"></td>
                <td className="px-2 py-2.5 text-right font-mono">
                  {n(
                    filtered.reduce((s, i) => s + (i.totalPurchasedQty || 0), 0),
                    2
                  )}
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-blue-200">
                  {n(
                    filtered.reduce((s, i) => s + (i.totalPurchasedWeight || 0), 0),
                    0
                  )}
                </td>
                <td colSpan={3} className="px-2 py-2.5"></td>
                {fabCats.map((cat) => (
                  <td key={cat.id} className="px-2 py-2.5 text-right font-mono text-sky-300">
                    {n(
                      filtered.reduce((s, i) => {
                        const a = i.fabAllocations?.find((a) => a.categoryCode === cat.code);
                        return s + (a?.qty || 0);
                      }, 0),
                      2
                    )}
                  </td>
                ))}
                <td colSpan={3} className="px-2 py-2.5"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {allocatingItem && (
        <FabAllocationModal
          item={allocatingItem}
          fabCategories={fabCats}
          onSave={handleSaveAlloc}
          onClose={() => setAllocatingItem(null)}
          isSaving={isSavingAlloc}
        />
      )}
    </>
  );
}
