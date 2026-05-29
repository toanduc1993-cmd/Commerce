// ============================================================
// COMPONENT: StatusBadge.tsx — Updated for new PRStatus types
// ============================================================

'use client';

import type { PRStatus, MaterialStatus } from '@/types/procurement';

type BadgeStatus = PRStatus | MaterialStatus;

interface StatusBadgeProps {
  status: BadgeStatus;
  onClick?: () => void;
}

const STATUS_CONFIG: Record<BadgeStatus, { className: string; icon: string }> = {
  'Chờ báo giá': {
    className: 'bg-slate-100 text-slate-500 border border-slate-300',
    icon: 'hourglass_empty',
  },
  'Đang đàm phán': {
    className: 'bg-amber-50 text-amber-700 border border-amber-300',
    icon: 'handshake',
  },
  'Đã ký HĐ': { className: 'bg-blue-50 text-blue-700 border border-blue-300', icon: 'description' },
  'Hàng đang về': {
    className: 'bg-indigo-50 text-indigo-700 border border-indigo-300',
    icon: 'local_shipping',
  },
  'Đã nghiệm thu': {
    className: 'bg-teal-50 text-teal-700 border border-teal-300',
    icon: 'verified',
  },
  'Đã nhập kho': {
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-300',
    icon: 'warehouse',
  },
  Đủ: {
    className: 'bg-emerald-100 text-emerald-800 border border-emerald-400',
    icon: 'check_circle',
  },
  Thiếu: { className: 'bg-red-50 text-red-700 border border-red-300', icon: 'error' },
  Thừa: { className: 'bg-orange-50 text-orange-700 border border-orange-300', icon: 'warning' },
};

export function StatusBadge({ status, onClick }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    className: 'bg-slate-100 text-slate-500 border border-slate-200',
    icon: 'help',
  };

  return (
    <button
      onClick={onClick}
      title={onClick ? 'Nhấn để chuyển bước tiếp theo' : status}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tight whitespace-nowrap transition-all ${config.className} ${onClick ? 'cursor-pointer hover:opacity-80 active:scale-95' : 'cursor-default'}`}
    >
      <span className="material-symbols-outlined text-[10px]">{config.icon}</span>
      {status}
    </button>
  );
}
