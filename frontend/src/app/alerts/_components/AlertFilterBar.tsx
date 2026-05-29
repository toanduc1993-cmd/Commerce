'use client';

import type { Severity } from './types';

interface Props {
  severity: Severity | 'ALL';
  setSeverity: (s: Severity | 'ALL') => void;
  search: string;
  setSearch: (s: string) => void;
  showResolved: boolean;
  setShowResolved: (b: boolean) => void;
}

const SEVERITY_OPTIONS: { key: Severity | 'ALL'; label: string; cls: string }[] = [
  { key: 'ALL', label: 'Tất cả', cls: 'bg-slate-100 text-slate-700' },
  { key: 'HIGH', label: 'HIGH', cls: 'badge-danger' },
  { key: 'MEDIUM', label: 'MEDIUM', cls: 'badge-warning' },
  { key: 'LOW', label: 'LOW', cls: 'badge-info' },
];

export function AlertFilterBar({
  severity,
  setSeverity,
  search,
  setSearch,
  showResolved,
  setShowResolved,
}: Props) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 bg-white border rounded-lg p-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="label mr-1">Mức:</span>
        {SEVERITY_OPTIONS.map((o) => {
          const active = severity === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setSeverity(o.key)}
              className={`px-2.5 py-1 rounded text-caption font-medium transition ${
                active
                  ? o.cls + ' ring-2 ring-offset-1 ring-slate-300'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 relative">
        <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
          search
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm canonical_key (vd: 23-052)…"
          className="w-full pl-8 pr-2 py-1.5 border rounded text-body"
        />
      </div>

      <label className="inline-flex items-center gap-2 text-body whitespace-nowrap">
        <input
          type="checkbox"
          checked={showResolved}
          onChange={(e) => setShowResolved(e.target.checked)}
          className="h-4 w-4"
        />
        Hiện cả đã resolve
      </label>
    </div>
  );
}
