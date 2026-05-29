'use client';

/**
 * hooks/useTableFilters.ts — Generic search + per-column filter state
 *
 * Usage:
 *   const filters = useTableFilters<PRDetail>({
 *     searchFields: ['itemCode', 'itemName', 'profile', 'grade'],
 *     columns: {
 *       statusFlag: { type: 'select', options: STATUS_LIST },
 *       urgency: { type: 'select', options: ['Normal', 'High', 'Critical'] },
 *       reqQty: { type: 'numberRange' },
 *       requiredDate: { type: 'dateRange' },
 *     },
 *   });
 *   const filteredPrs = filters.apply(prs);
 *
 *   <TableSearch value={filters.search} onChange={filters.setSearch} placeholder="..." />
 *   <ColumnFilter column="statusFlag" config={filters.config.statusFlag}
 *                 value={filters.columnFilters.statusFlag} onChange={(v) => filters.setColumnFilter('statusFlag', v)} />
 *   <ActiveFilterChips filters={filters} />
 */
import { useMemo, useState, useCallback } from 'react';

export type ColumnFilterType = 'text' | 'select' | 'multiSelect' | 'numberRange' | 'dateRange';

export interface ColumnFilterConfig<T> {
  type: ColumnFilterType;
  label?: string;
  options?: Array<string | { value: string; label: string }>;
  /** Custom accessor — if column field name != filter key */
  accessor?: (row: T) => unknown;
}

export type ColumnFilterValue =
  | { type: 'text'; value: string }
  | { type: 'select'; value: string | null }
  | { type: 'multiSelect'; values: string[] }
  | { type: 'numberRange'; min?: number; max?: number }
  | { type: 'dateRange'; from?: string; to?: string }
  | null;

export interface UseTableFiltersConfig<T> {
  /** Fields to search across (case-insensitive substring) */
  searchFields: (keyof T | string)[];
  /** Column-specific filter configs keyed by field name */
  columns?: Record<string, ColumnFilterConfig<T>>;
}

export interface UseTableFiltersResult<T> {
  search: string;
  setSearch: (s: string) => void;
  columnFilters: Record<string, ColumnFilterValue>;
  setColumnFilter: (key: string, value: ColumnFilterValue) => void;
  clearColumn: (key: string) => void;
  clearAll: () => void;
  config: Record<string, ColumnFilterConfig<T>>;
  activeCount: number;
  /** Returns filtered array */
  apply: (rows: T[]) => T[];
}

const getField = <T,>(row: T, key: string): unknown => {
  // Support dot path "vendor.name" for nested
  if (!key.includes('.')) return (row as Record<string, unknown>)[key];
  return key.split('.').reduce<unknown>((acc, k) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[k];
  }, row);
};

const toStr = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  return JSON.stringify(v);
};

export function useTableFilters<T>(cfg: UseTableFiltersConfig<T>): UseTableFiltersResult<T> {
  const [search, setSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterValue>>({});

  const setColumnFilter = useCallback((key: string, value: ColumnFilterValue) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearColumn = useCallback((key: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSearch('');
    setColumnFilters({});
  }, []);

  const activeCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n++;
    for (const v of Object.values(columnFilters)) {
      if (!v) continue;
      if (v.type === 'text' && v.value) n++;
      else if (v.type === 'select' && v.value) n++;
      else if (v.type === 'multiSelect' && v.values.length > 0) n++;
      else if (v.type === 'numberRange' && (v.min != null || v.max != null)) n++;
      else if (v.type === 'dateRange' && (v.from || v.to)) n++;
    }
    return n;
  }, [search, columnFilters]);

  const apply = useCallback(
    (rows: T[]): T[] => {
      let out = rows;
      const q = search.trim().toLowerCase();
      if (q) {
        out = out.filter((row) =>
          cfg.searchFields.some((f) => toStr(getField(row, f as string)).toLowerCase().includes(q))
        );
      }
      for (const [key, f] of Object.entries(columnFilters)) {
        if (!f) continue;
        const acc = cfg.columns?.[key]?.accessor;
        const get = (row: T) => (acc ? acc(row) : getField(row, key));
        if (f.type === 'text' && f.value) {
          const v = f.value.toLowerCase();
          out = out.filter((row) => toStr(get(row)).toLowerCase().includes(v));
        } else if (f.type === 'select' && f.value != null) {
          out = out.filter((row) => toStr(get(row)) === f.value);
        } else if (f.type === 'multiSelect' && f.values.length > 0) {
          const set = new Set(f.values);
          out = out.filter((row) => set.has(toStr(get(row))));
        } else if (f.type === 'numberRange') {
          if (f.min != null) out = out.filter((row) => Number(get(row)) >= f.min!);
          if (f.max != null) out = out.filter((row) => Number(get(row)) <= f.max!);
        } else if (f.type === 'dateRange') {
          if (f.from) out = out.filter((row) => toStr(get(row)) >= f.from!);
          if (f.to) out = out.filter((row) => toStr(get(row)) <= f.to!);
        }
      }
      return out;
    },
    [search, columnFilters, cfg]
  );

  return {
    search,
    setSearch,
    columnFilters,
    setColumnFilter,
    clearColumn,
    clearAll,
    config: cfg.columns ?? {},
    activeCount,
    apply,
  };
}
