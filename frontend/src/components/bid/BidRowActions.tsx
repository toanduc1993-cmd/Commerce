// F-BID-B: BidRowActions — single source of truth cho row actions ở bảng danh sách BID.
// Thay thế inline action buttons ở B2 (yeu-cau-bao-gia).
'use client';

import Link from 'next/link';
import { toast } from 'react-hot-toast';
import type { BidAnalysisRow } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';

interface BidRowActionsProps {
  bid: BidAnalysisRow;
  onReload: () => void;
  onEnterQuote: (bidId: string) => void;
  compareHref?: string;
}

export function BidRowActions({ bid, onReload, onEnterQuote, compareHref }: BidRowActionsProps) {
  const href = compareHref ?? `/duyet?tab=compare&bid=${bid.id}`;

  const handleExport = async () => {
    if (typeof window === 'undefined' || !localStorage.getItem('ibshi_authed')) return;
    const toastId = toast.loading('Đang tải Excel…');
    try {
      const r = await fetch(`${API_URL}/api/v1/bid-analyses/${bid.id}/export-rfq`, {
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `RFQ_${bid.bidCode || bid.id.slice(0, 8)}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`Đã tải ${a.download}`, { id: toastId });
    } catch (e) {
      toast.error(`Lỗi tải Excel: ${(e as Error).message}`, { id: toastId });
    }
  };

  const handleCancel = async () => {
    if (!confirm(`Huỷ RFQ ${bid.bidCode || bid.id.slice(0, 8)}?\nCác PR items sẽ quay lại "Chờ báo giá".`)) return;
    if (typeof window === 'undefined' || !localStorage.getItem('ibshi_authed')) return;
    const toastId = toast.loading('Đang huỷ RFQ…');
    try {
      const { ensureCsrfToken } = await import('@/lib/api');
      const csrfToken = await ensureCsrfToken();
      const r = await fetch(`${API_URL}/api/v1/bid-analyses/${bid.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
      });
      const data = await r.json();
      if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
      toast.success(
        `Đã huỷ ${data.data.bidCode || ''}, ${data.data.prDetailsReverted} PR item về 'Chờ báo giá'`,
        { id: toastId }
      );
      onReload();
    } catch (e) {
      toast.error(`Lỗi huỷ: ${(e as Error).message}`, { id: toastId });
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={handleExport}
        title="Tải RFQ Excel (form NCC chào giá)"
        className="inline-flex items-center gap-0.5 text-caption text-[var(--color-success)] hover:underline"
      >
        <span className="material-symbols-outlined text-[14px]">download</span>
        Excel
      </button>
      <button
        type="button"
        onClick={() => onEnterQuote(bid.id)}
        title="Nhập báo giá NCC"
        className="inline-flex items-center gap-0.5 text-caption text-[var(--color-brand)] hover:underline"
      >
        <span className="material-symbols-outlined text-[14px]">add</span>
        Nhập BG
      </button>
      {bid.status === 'OPEN' && (bid.vendors?.length || 0) === 0 && (
        <button
          type="button"
          onClick={handleCancel}
          title="Huỷ RFQ (PR items trở về Chờ báo giá)"
          className="inline-flex items-center gap-0.5 text-caption text-[var(--color-danger)] hover:underline"
        >
          <span className="material-symbols-outlined text-[14px]">cancel</span>
          Huỷ
        </button>
      )}
      <Link
        href={href}
        className="inline-flex items-center text-caption text-[var(--color-info)] hover:underline"
      >
        So sánh
        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
      </Link>
    </div>
  );
}
