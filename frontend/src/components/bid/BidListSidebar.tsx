// F-BID-B: BidListSidebar — single source of truth cho sidebar list bids.
// Thay thế sidebar dup ở B4 (so-sanh-bao-gia) và B5 (duyet-bao-gia) — identical.
'use client';

import type { BidAnalysisRow } from '@/lib/api';

interface BidListSidebarProps {
  bids: BidAnalysisRow[];
  selectedBidId: string | null;
  onSelect: (bidId: string) => void;
  isLoading?: boolean;
  title?: string;
  subtitle?: (bids: BidAnalysisRow[]) => string;
}

export function BidListSidebar({
  bids,
  selectedBidId,
  onSelect,
  isLoading = false,
  title = 'Danh Sách Báo Giá',
  subtitle,
}: BidListSidebarProps) {
  const subtitleText = subtitle ? subtitle(bids) : `${bids.length} đợt báo giá`;
  return (
    <div className="w-72 border-r border-slate-200 bg-white overflow-y-auto shrink-0">
      <div className="px-4 py-3 border-b border-slate-200 sticky top-0 bg-white z-10">
        <h2 className="text-sm font-black text-[#1B365D]">{title}</h2>
        <p className="text-[10px] text-slate-400">{subtitleText}</p>
      </div>
      {isLoading && (
        <div className="p-4 text-center text-slate-400 text-xs">
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
        </div>
      )}
      {bids.map((b) => {
        const winner = b.vendors.find((v) => v.isWinner);
        const isActive = b.id === selectedBidId;
        return (
          <button
            key={b.id}
            onClick={() => onSelect(b.id)}
            className={`w-full text-left px-4 py-2.5 border-b border-slate-100 transition-colors ${
              isActive ? 'bg-[#1B365D]/10 border-l-4 border-l-[#1B365D]' : 'hover:bg-slate-50'
            }`}
          >
            <div className="text-[11px] font-bold text-[#1B365D] truncate">{b.bidCode}</div>
            <div className="text-[9px] text-slate-500 truncate">{b.subject}</div>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className="text-[8px] bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                {b._count?.items || 0} items
              </span>
              <span className="text-[8px] bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                {b.vendors.length} NCC
              </span>
              {winner && (
                <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">
                  ✓ {winner.vendorName.slice(0, 12)}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
