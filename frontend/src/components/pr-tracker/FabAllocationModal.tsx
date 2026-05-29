'use client';
/**
 * FabAllocationModal.tsx
 * Modal nhập phân bổ số lượng vật tư theo hạng mục gia công
 *
 * Hiển thị 1 item vật tư + danh sách hạng mục của project
 * User nhập qty (số lượng) cho từng hạng mục
 * Validate: SUM(qty) <= reqQty (không được phân bổ vượt số lượng yêu cầu)
 */

import { useState, useCallback, useEffect } from 'react';
import type { PRDetail, FabricationCategory } from '@/types/procurement';

interface AllocationInput {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  qty: string; // string vì input là text
  weight: string;
}

interface FabAllocationModalProps {
  item: PRDetail;
  fabCategories: FabricationCategory[];
  onClose: () => void;
  onSave: (
    prDetailId: string,
    allocations: { fabricationCategoryId: string; qty: number; weight: number }[]
  ) => Promise<void>;
  isSaving?: boolean;
}

export function FabAllocationModal({
  item,
  fabCategories,
  onClose,
  onSave,
  isSaving = false,
}: FabAllocationModalProps) {
  // Init: điền existing allocations nếu có
  const [allocations, setAllocations] = useState<AllocationInput[]>(() =>
    fabCategories.map((cat) => {
      const existing = item.fabAllocations?.find((a) => a.categoryId === cat.id);
      return {
        categoryId: cat.id,
        categoryCode: cat.code,
        categoryName: cat.name,
        qty: existing ? String(existing.qty) : '',
        weight: existing ? String(existing.weight) : '',
      };
    })
  );

  const [error, setError] = useState<string | null>(null);

  // Tính tổng qty đang nhập
  const totalQty = allocations.reduce((sum, a) => {
    const v = parseFloat(a.qty);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  const reqQty = item.reqQty || item.toBuyQty || 0;
  const remainingQty = reqQty - totalQty;
  const isOver = totalQty > reqQty + 0.001;
  const pctAllocated = reqQty > 0 ? Math.min(100, (totalQty / reqQty) * 100) : 0;

  // Auto-compute weight khi qty thay đổi (nếu có unitWeight)
  const handleQtyChange = useCallback(
    (idx: number, qtyStr: string) => {
      setError(null);
      setAllocations((prev) => {
        const next = [...prev];
        const qty = parseFloat(qtyStr);
        const autoWeight =
          !isNaN(qty) && item.unitWeight
            ? String(((qty * item.unitWeight) / 1000).toFixed(3)) // kg → tấn
            : next[idx].weight;
        next[idx] = {
          ...next[idx],
          qty: qtyStr,
          weight: isNaN(qty) ? next[idx].weight : autoWeight,
        };
        return next;
      });
    },
    [item.unitWeight]
  );

  const handleWeightChange = useCallback((idx: number, val: string) => {
    setAllocations((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], weight: val };
      return next;
    });
  }, []);

  // Phân bổ đều — chia đều reqQty cho tất cả hạng mục
  const handleDistributeEvenly = useCallback(() => {
    if (fabCategories.length === 0) return;
    const perCat = (reqQty / fabCategories.length).toFixed(3);
    setAllocations((prev) =>
      prev.map((a) => ({
        ...a,
        qty: perCat,
        weight: item.unitWeight
          ? String(((parseFloat(perCat) * item.unitWeight) / 1000).toFixed(3))
          : a.weight,
      }))
    );
    setError(null);
  }, [fabCategories.length, reqQty, item.unitWeight]);

  // Xóa hết
  const handleClear = useCallback(() => {
    setAllocations((prev) => prev.map((a) => ({ ...a, qty: '', weight: '' })));
    setError(null);
  }, []);

  const handleSave = async () => {
    if (isOver) {
      setError(`Tổng phân bổ (${totalQty.toFixed(3)}) vượt số lượng yêu cầu (${reqQty}).`);
      return;
    }

    const payload = allocations
      .filter((a) => parseFloat(a.qty) > 0)
      .map((a) => ({
        fabricationCategoryId: a.categoryId,
        qty: parseFloat(a.qty) || 0,
        weight: parseFloat(a.weight) || 0,
      }));

    await onSave(item.id, payload);
  };

  // Color per % allocated
  const barColor = isOver ? '#dc2626' : pctAllocated >= 100 ? '#16a34a' : '#2563eb';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="bg-[#1B365D] px-6 py-4 flex items-start justify-between shrink-0">
          <div>
            <div className="text-white font-black text-sm">Phân Bổ Hạng Mục Gia Công</div>
            <div className="text-blue-200 text-[11px] mt-0.5 font-mono">{item.itemCode}</div>
            <div className="text-blue-300 text-[10px] mt-0.5 truncate max-w-xs">
              {item.itemName}
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white mt-0.5">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* ── Item summary bar ──────────────────────────── */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-6 text-[11px]">
            <div>
              <span className="text-slate-400">QC / VL: </span>
              <span className="font-semibold text-slate-700">
                {item.profile || '—'} / {item.grade || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">ĐVT: </span>
              <span className="font-semibold text-slate-700">{item.uom}</span>
            </div>
            <div>
              <span className="text-slate-400">SL yêu cầu mua: </span>
              <span className="font-bold text-[#1B365D]">
                {reqQty.toLocaleString('vi-VN', { maximumFractionDigits: 3 })}
              </span>
            </div>
            {item.unitWeight > 0 && (
              <div>
                <span className="text-slate-400">ĐL đơn vị: </span>
                <span className="font-semibold text-slate-700">
                  {item.unitWeight} kg/{item.uom}
                </span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-2">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="font-semibold" style={{ color: barColor }}>
                Đã phân bổ: {totalQty.toFixed(3)} / {reqQty} {item.uom} ({pctAllocated.toFixed(1)}%)
              </span>
              {remainingQty > 0 && (
                <span className="text-slate-400">
                  Còn lại: {remainingQty.toFixed(3)} {item.uom}
                </span>
              )}
              {isOver && (
                <span className="text-red-500 font-bold">
                  ⚠ Vượt {(totalQty - reqQty).toFixed(3)} {item.uom}
                </span>
              )}
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(pctAllocated, 110)}%`, background: barColor }}
              />
            </div>
          </div>
        </div>

        {/* ── Allocation inputs ─────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {fabCategories.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <span className="material-symbols-outlined text-[48px] mb-2 block">category</span>
              <div className="text-sm">Project chưa có hạng mục gia công.</div>
              <div className="text-xs mt-1">Liên hệ Admin để cấu hình.</div>
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr>
                  <th className="text-left pb-3 text-slate-500 font-semibold text-[10px] uppercase tracking-wider">
                    Hạng mục gia công
                  </th>
                  <th className="text-right pb-3 text-slate-500 font-semibold text-[10px] uppercase tracking-wider pr-2">
                    Số lượng ({item.uom})
                  </th>
                  <th className="text-right pb-3 text-slate-500 font-semibold text-[10px] uppercase tracking-wider">
                    Trọng lượng (tấn)
                  </th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((alloc, idx) => {
                  const qtyVal = parseFloat(alloc.qty);
                  const hasVal = !isNaN(qtyVal) && qtyVal > 0;
                  return (
                    <tr
                      key={alloc.categoryId}
                      className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#1B365D]/10 text-[#1B365D] text-[9px] font-black shrink-0">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-semibold text-slate-800">{alloc.categoryCode}</div>
                            <div className="text-[10px] text-slate-400">{alloc.categoryName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 pr-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={alloc.qty}
                          onChange={(e) => handleQtyChange(idx, e.target.value)}
                          placeholder="0.000"
                          className={`w-28 text-right px-2 py-1.5 rounded-lg border text-[12px] font-mono transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B365D]/30 ${
                            hasVal
                              ? 'border-[#1B365D]/40 bg-[#1B365D]/5 text-[#1B365D] font-bold'
                              : 'border-slate-200 bg-white text-slate-600'
                          }`}
                        />
                      </td>
                      <td className="py-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={alloc.weight}
                          onChange={(e) => handleWeightChange(idx, e.target.value)}
                          placeholder="0.000"
                          className="w-24 text-right px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-[#1B365D]/30 transition-colors"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td className="pt-3 text-[11px] font-black text-slate-600">TỔNG CỘNG</td>
                  <td className="pt-3 text-right pr-2">
                    <span
                      className={`text-[13px] font-black font-mono ${isOver ? 'text-red-600' : pctAllocated >= 100 ? 'text-emerald-600' : 'text-[#1B365D]'}`}
                    >
                      {totalQty.toFixed(3)}
                    </span>
                    <span className="text-slate-400 text-[10px] ml-1">/ {reqQty}</span>
                  </td>
                  <td className="pt-3 text-right">
                    <span className="text-[13px] font-black font-mono text-slate-600">
                      {allocations.reduce((s, a) => s + (parseFloat(a.weight) || 0), 0).toFixed(3)}
                    </span>
                    <span className="text-slate-400 text-[10px] ml-1">T</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* ── Error message ─────────────────────────────── */}
        {error && (
          <div className="mx-6 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-red-500 text-[16px]">error</span>
            <span className="text-[11px] text-red-700">{error}</span>
          </div>
        )}

        {/* ── Footer actions ────────────────────────────── */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center gap-3 shrink-0">
          {/* Quick actions */}
          <button
            onClick={handleDistributeEvenly}
            title="Chia đều số lượng cho tất cả hạng mục"
            className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 border border-slate-300 rounded-lg hover:bg-white transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
            Chia đều
          </button>
          <button
            onClick={handleClear}
            title="Xóa toàn bộ phân bổ"
            className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
            Xóa hết
          </button>

          <div className="flex-1" />

          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || fabCategories.length === 0 || isOver}
            className={`flex items-center gap-2 px-5 py-2 text-xs font-black rounded-lg text-white transition-all ${
              isSaving || fabCategories.length === 0 || isOver
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-[#1B365D] hover:bg-[#2a5298] shadow-md hover:shadow-lg'
            }`}
          >
            {isSaving ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[14px]">
                  progress_activity
                </span>
                Đang lưu...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[14px]">save</span>
                Lưu phân bổ
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
