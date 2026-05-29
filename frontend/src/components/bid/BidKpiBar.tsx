// F-BID-B: BidKpiBar — single source of truth cho KPI cards của BID pages.
// Thay thế KPI cards dup ở B2 (yeu-cau-bao-gia) và B3 (bao-gia).
'use client';

import type { BidAnalysisRow } from '@/lib/api';
import { fmtMoney } from '@/lib/format';

interface KpiCard {
  label: string;
  value: string | number;
  sub: string;
  icon: string;
}

interface BidKpiBarProps {
  bids: BidAnalysisRow[];
  variant?: 'requests' | 'received' | 'full';
}

function computeCards(bids: BidAnalysisRow[], variant: BidKpiBarProps['variant'] = 'full'): KpiCard[] {
  const total = bids.length;
  const totalVendorResponses = bids.reduce((s, b) => s + (b.vendors?.length || 0), 0);
  const waitingForSelection = bids.filter((b) => b.status === 'OPEN' || b.status === 'EVALUATING').length;
  const selectedCount = bids.filter((b) => b.status === 'SELECTED' || b.status === 'CONTRACTED').length;
  const totalItems = bids.reduce((s, b) => s + (b._count?.items || 0), 0);
  const uniqueVendors = new Set(bids.flatMap((b) => b.vendors.map((v) => v.vendorName))).size;

  if (variant === 'requests') {
    return [
      { label: 'Tổng RFQ', value: total, sub: 'Yêu cầu báo giá đã tạo', icon: 'forward_to_inbox' },
      {
        label: 'Báo giá nhận được',
        value: totalVendorResponses,
        sub: `TB ${total > 0 ? (totalVendorResponses / total).toFixed(1) : 0} NCC/RFQ`,
        icon: 'mark_email_read',
      },
      { label: 'Chờ chọn NCC', value: waitingForSelection, sub: 'OPEN + EVALUATING', icon: 'pending_actions' },
      { label: 'Đã chọn NCC', value: selectedCount, sub: 'SELECTED + CONTRACTED', icon: 'verified' },
    ];
  }

  if (variant === 'received') {
    return [
      { label: 'Tổng đợt báo giá', value: total, sub: `${selectedCount} đã chọn NCC`, icon: 'request_quote' },
      { label: 'Tổng items', value: totalItems, sub: 'Trong tất cả bids', icon: 'inventory_2' },
      { label: 'Vendors tham gia', value: uniqueVendors, sub: 'NCC khác nhau', icon: 'domain' },
      {
        label: 'Tỷ lệ đã chọn',
        value: total > 0 ? `${Math.round((selectedCount / total) * 100)}%` : '0%',
        sub: 'Bids có NCC trúng',
        icon: 'verified',
      },
    ];
  }

  // full: combined
  return [
    { label: 'Tổng BID', value: total, sub: `${selectedCount} đã duyệt NCC`, icon: 'request_quote' },
    {
      label: 'Báo giá nhận',
      value: totalVendorResponses,
      sub: `TB ${total > 0 ? (totalVendorResponses / total).toFixed(1) : 0} NCC/BID`,
      icon: 'mark_email_read',
    },
    { label: 'Chờ chọn NCC', value: waitingForSelection, sub: 'OPEN + EVALUATING', icon: 'pending_actions' },
    { label: 'Đã duyệt NCC', value: selectedCount, sub: 'SELECTED + CONTRACTED', icon: 'verified' },
  ];
}

export function BidKpiBar({ bids, variant = 'full' }: BidKpiBarProps) {
  const cards = computeCards(bids, variant);
  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((k) => (
        <div
          key={k.label}
          className="bg-white rounded-lg p-4 shadow-sm border-l-4"
          style={{ borderLeftColor: 'var(--color-brand)' }}
        >
          <div className="flex items-start gap-3">
            <span
              className="material-symbols-outlined text-[28px]"
              style={{ color: 'var(--color-brand)' }}
            >
              {k.icon}
            </span>
            <div>
              <div className="label">{k.label}</div>
              <div className="text-display mt-0.5">{k.value}</div>
              <div className="text-caption text-slate-400">{k.sub}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
