'use client';

import type { AlertSummary } from './types';

interface Props {
  summary: AlertSummary | null;
  loading: boolean;
}

export function AlertKpiCards({ summary, loading }: Props) {
  const cards = [
    {
      label: 'HIGH — Orphan invoice',
      value: summary?.high ?? 0,
      sub: 'Có invoice nhưng không BID/PQLDA',
      accent: 'var(--color-danger)',
      icon: 'priority_high',
    },
    {
      label: 'MEDIUM — Chưa xuất HĐ',
      value: summary?.medium ?? 0,
      sub: 'BID có nhưng chưa xuất hợp đồng',
      accent: 'var(--color-warning)',
      icon: 'pending_actions',
    },
    {
      label: 'LOW — PQLDA chưa invoice',
      value: summary?.low ?? 0,
      sub: 'Có thể đang trong tiến độ',
      accent: 'var(--color-info)',
      icon: 'schedule',
    },
    {
      label: 'Đã resolve',
      value: summary?.totalResolved ?? 0,
      sub: summary
        ? `Còn lại ${summary.totalFlagged - summary.totalResolved}/${summary.totalFlagged} open`
        : '—',
      accent: 'var(--color-success)',
      icon: 'task_alt',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-lg border bg-white p-4 flex items-start gap-3"
          style={{ borderLeftColor: c.accent, borderLeftWidth: 4 }}
        >
          <span
            className="material-symbols-outlined text-[28px]"
            style={{ color: c.accent }}
            aria-hidden
          >
            {c.icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="label">{c.label}</div>
            <div className="text-display tabular-nums">
              {loading ? '…' : c.value.toLocaleString('vi-VN')}
            </div>
            <div className="text-caption text-slate-500 mt-1 truncate">{c.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
