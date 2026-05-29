'use client';

/**
 * components/data-table/ActiveFilterChips.tsx
 * Hiển thị filters đang active dưới dạng chip + button "Xóa tất cả"
 */
import type { UseTableFiltersResult, ColumnFilterValue } from '@/hooks/useTableFilters';

interface Props<T> {
  filters: UseTableFiltersResult<T>;
  searchLabel?: string;
}

const summarize = (v: ColumnFilterValue): string => {
  if (!v) return '';
  if (v.type === 'text') return `chứa "${v.value}"`;
  if (v.type === 'select') return `= ${v.value}`;
  if (v.type === 'multiSelect') return `∈ {${v.values.join(', ')}}`;
  if (v.type === 'numberRange') {
    const a = v.min != null ? v.min : '–∞';
    const b = v.max != null ? v.max : '+∞';
    return `[${a}, ${b}]`;
  }
  if (v.type === 'dateRange') {
    return `${v.from ?? '...'} → ${v.to ?? '...'}`;
  }
  return '';
};

export function ActiveFilterChips<T>({ filters, searchLabel = 'Tìm' }: Props<T>) {
  if (filters.activeCount === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="label">Đang lọc</span>
      {filters.search.trim() && (
        <span className="badge badge-info inline-flex items-center gap-1">
          {searchLabel}: &quot;{filters.search}&quot;
          <button
            type="button"
            onClick={() => filters.setSearch('')}
            className="hover:opacity-70"
            title="Bỏ tìm kiếm"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </span>
      )}
      {Object.entries(filters.columnFilters).map(([key, v]) => {
        if (!v) return null;
        const lbl = filters.config[key]?.label ?? key;
        const summary = summarize(v);
        if (!summary) return null;
        return (
          <span key={key} className="badge badge-info inline-flex items-center gap-1">
            <span className="font-semibold">{lbl}</span>
            <span>{summary}</span>
            <button
              type="button"
              onClick={() => filters.clearColumn(key)}
              className="hover:opacity-70"
              title={`Bỏ lọc ${lbl}`}
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={() => filters.clearAll()}
        className="text-caption text-[var(--color-danger)] hover:underline ml-2"
      >
        Xóa tất cả
      </button>
    </div>
  );
}
