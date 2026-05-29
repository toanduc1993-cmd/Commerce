// ============================================================
// F-BID-A: SelectionModeChooser — chọn 1 trong 5 mode duyệt NCC.
// Khi user switch mode → confirm dialog warn về reset selection.
// Save → PATCH /api/v1/bid-analyses/:id/selection-mode
// ============================================================
'use client';

import { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  SELECTION_MODES,
  suggestSelectionMode,
  type SelectionMode,
} from '@/lib/bid-status';
import { ensureCsrfToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';

export interface SelectionModeChooserProps {
  bidAnalysisId: string;
  currentMode: SelectionMode;
  itemsCount: number;
  uniqueGroups: number;
  onModeChange?: (newMode: SelectionMode, resetCount: number) => void;
  disabled?: boolean;
  className?: string;
}

export function SelectionModeChooser({
  bidAnalysisId,
  currentMode,
  itemsCount,
  uniqueGroups,
  onModeChange,
  disabled = false,
  className = '',
}: SelectionModeChooserProps) {
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<SelectionMode | null>(null);

  const suggested = useMemo(
    () => suggestSelectionMode(itemsCount, uniqueGroups),
    [itemsCount, uniqueGroups]
  );

  async function commit(mode: SelectionMode) {
    if (mode === currentMode) {
      setPending(null);
      return;
    }
    setSaving(true);
    try {
      const csrfToken = await ensureCsrfToken();
      const res = await fetch(`${API_URL}/api/v1/bid-analyses/${bidAnalysisId}/selection-mode`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      toast.success(
        data.resetCount > 0
          ? `Đã chuyển sang ${mode}, reset ${data.resetCount} lựa chọn cũ`
          : `Đã chuyển sang ${mode}`
      );
      onModeChange?.(mode, data.resetCount ?? 0);
    } catch (e) {
      toast.error(`Lỗi đổi mode: ${(e as Error).message}`);
    } finally {
      setSaving(false);
      setPending(null);
    }
  }

  function handleSelect(mode: SelectionMode) {
    if (disabled || saving) return;
    if (mode === currentMode) return;
    setPending(mode);
  }

  return (
    <div className={`bg-white rounded-lg border border-slate-200 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Chế độ chọn nhà cung cấp</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {itemsCount} items · {uniqueGroups} nhóm vật tư · gợi ý:{' '}
            <span className="font-mono font-bold text-blue-600">{suggested}</span>
          </p>
        </div>
        {currentMode !== suggested && (
          <button
            type="button"
            onClick={() => handleSelect(suggested)}
            className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold"
            disabled={disabled || saving}
          >
            Dùng gợi ý
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {SELECTION_MODES.map((m) => {
          const active = m.key === currentMode;
          const isSuggested = m.key === suggested;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => handleSelect(m.key)}
              disabled={disabled || saving}
              className={`text-left p-3 rounded-lg border-2 transition-all ${
                active
                  ? 'border-blue-600 bg-blue-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              } ${disabled || saving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
              title={m.bestFor}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`material-symbols-outlined text-[20px] ${
                    active ? 'text-blue-600' : 'text-slate-400'
                  }`}
                >
                  {m.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-xs font-bold ${
                        active ? 'text-blue-900' : 'text-slate-700'
                      }`}
                    >
                      {m.label}
                    </span>
                    {isSuggested && !active && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                        Gợi ý
                      </span>
                    )}
                    {active && (
                      <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold">
                        Đang dùng
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-tight">{m.description}</p>
                  <p className="text-[10px] text-slate-400 mt-1 italic">Phù hợp: {m.bestFor}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {pending && pending !== currentMode && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => !saving && setPending(null)}
          role="dialog"
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-lg font-black text-slate-900 mb-2">
              Xác nhận chuyển sang {pending}?
            </h4>
            <p className="text-sm text-slate-600 mb-4">
              Khi chuyển từ <strong>{currentMode}</strong> sang <strong>{pending}</strong>, các lựa
              chọn NCC hiện tại có thể bị reset (item-level selections, BID-level winner, group
              selections, vendor scores). Tiếp tục?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={saving}
                className="px-3 py-1.5 rounded text-sm font-bold text-slate-700 hover:bg-slate-100"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => commit(pending)}
                disabled={saving}
                className="px-3 py-1.5 rounded text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : `Xác nhận → ${pending}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
