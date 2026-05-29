'use client';

/**
 * components/data-table/ColumnFilter.tsx — Per-column filter dropdown
 * Variants: text (contains), select (single), multiSelect, numberRange, dateRange
 */
import { useEffect, useRef, useState } from 'react';
import type { ColumnFilterConfig, ColumnFilterValue } from '@/hooks/useTableFilters';

interface Props<T> {
  column: string;
  label?: string;
  config: ColumnFilterConfig<T>;
  value: ColumnFilterValue;
  onChange: (v: ColumnFilterValue) => void;
  /** Click outside the dropdown closes it */
  align?: 'left' | 'right';
}

const isActive = (v: ColumnFilterValue): boolean => {
  if (!v) return false;
  if (v.type === 'text') return Boolean(v.value);
  if (v.type === 'select') return v.value != null && v.value !== '';
  if (v.type === 'multiSelect') return v.values.length > 0;
  if (v.type === 'numberRange') return v.min != null || v.max != null;
  if (v.type === 'dateRange') return Boolean(v.from || v.to);
  return false;
};

const optLabel = (o: string | { value: string; label: string }): string =>
  typeof o === 'string' ? o : o.label;
const optValue = (o: string | { value: string; label: string }): string =>
  typeof o === 'string' ? o : o.value;

export function ColumnFilter<T>({ column, label, config, value, onChange, align = 'left' }: Props<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = isActive(value);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const displayLabel = label ?? config.label ?? column;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] hover:bg-slate-200 ${
          active ? 'bg-[var(--color-info-soft)] text-[var(--color-info)]' : 'text-slate-500'
        }`}
        title={`Lọc theo ${displayLabel}`}
      >
        <span className="material-symbols-outlined text-[14px]">
          {active ? 'filter_alt' : 'filter_list'}
        </span>
        {active && <span className="font-bold">●</span>}
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 p-3 min-w-[220px] ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="text-caption font-semibold text-slate-700 mb-2 flex items-center justify-between">
            <span>Lọc: {displayLabel}</span>
            {active && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-[10px] text-[var(--color-danger)] hover:underline"
              >
                Xóa
              </button>
            )}
          </div>

          {config.type === 'text' && (
            <input
              type="text"
              autoFocus
              placeholder="Chứa..."
              value={value?.type === 'text' ? value.value : ''}
              onChange={(e) => onChange({ type: 'text', value: e.target.value })}
              className="w-full px-2 py-1 text-body border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--color-info)]"
            />
          )}

          {config.type === 'select' && config.options && (
            <select
              autoFocus
              value={value?.type === 'select' ? value.value ?? '' : ''}
              onChange={(e) => onChange({ type: 'select', value: e.target.value || null })}
              className="w-full px-2 py-1 text-body border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-info)]"
            >
              <option value="">— Tất cả —</option>
              {config.options.map((o) => (
                <option key={optValue(o)} value={optValue(o)}>
                  {optLabel(o)}
                </option>
              ))}
            </select>
          )}

          {config.type === 'multiSelect' && config.options && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {config.options.map((o) => {
                const v = optValue(o);
                const checked =
                  value?.type === 'multiSelect' && value.values.includes(v);
                return (
                  <label
                    key={v}
                    className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const cur = value?.type === 'multiSelect' ? value.values : [];
                        const next = e.target.checked
                          ? [...cur, v]
                          : cur.filter((x) => x !== v);
                        onChange({ type: 'multiSelect', values: next });
                      }}
                    />
                    <span className="text-body">{optLabel(o)}</span>
                  </label>
                );
              })}
            </div>
          )}

          {config.type === 'numberRange' && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Từ"
                value={value?.type === 'numberRange' ? value.min ?? '' : ''}
                onChange={(e) =>
                  onChange({
                    type: 'numberRange',
                    min: e.target.value === '' ? undefined : Number(e.target.value),
                    max: value?.type === 'numberRange' ? value.max : undefined,
                  })
                }
                className="w-24 px-2 py-1 text-body border border-slate-300 rounded"
              />
              <span className="text-slate-400">–</span>
              <input
                type="number"
                placeholder="Đến"
                value={value?.type === 'numberRange' ? value.max ?? '' : ''}
                onChange={(e) =>
                  onChange({
                    type: 'numberRange',
                    min: value?.type === 'numberRange' ? value.min : undefined,
                    max: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                className="w-24 px-2 py-1 text-body border border-slate-300 rounded"
              />
            </div>
          )}

          {config.type === 'dateRange' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={value?.type === 'dateRange' ? value.from ?? '' : ''}
                onChange={(e) =>
                  onChange({
                    type: 'dateRange',
                    from: e.target.value || undefined,
                    to: value?.type === 'dateRange' ? value.to : undefined,
                  })
                }
                className="px-2 py-1 text-body border border-slate-300 rounded"
              />
              <span className="text-slate-400">–</span>
              <input
                type="date"
                value={value?.type === 'dateRange' ? value.to ?? '' : ''}
                onChange={(e) =>
                  onChange({
                    type: 'dateRange',
                    from: value?.type === 'dateRange' ? value.from : undefined,
                    to: e.target.value || undefined,
                  })
                }
                className="px-2 py-1 text-body border border-slate-300 rounded"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
