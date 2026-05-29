// F-BID-B: VendorsPanel — single source of truth cho vendor expand panel.
// Thay thế VendorsExpandPanel (B2) và VendorQuotationsPanel (B3) — gần như identical.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchBidAnalysisDetail, type BidAnalysisRow } from '@/lib/api';
import { fmtMoney } from '@/lib/format';

interface VendorsPanelProps {
  bid: BidAnalysisRow;
  onEnterQuote?: () => void;
  compareHref?: string; // link to compare page — default /duyet?tab=compare&bid=<id>
  showDetailFetch?: boolean; // true → fetch per-item stats (B3 mode)
}

export function VendorsPanel({
  bid,
  onEnterQuote,
  compareHref,
  showDetailFetch = false,
}: VendorsPanelProps) {
  const [detail, setDetail] = useState<BidAnalysisRow | null>(null);
  const [loading, setLoading] = useState(false);

  const href = compareHref ?? `/duyet?tab=compare&bid=${bid.id}`;

  useEffect(() => {
    if (!showDetailFetch) return;
    let cancelled = false;
    setLoading(true);
    fetchBidAnalysisDetail(bid.id)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bid.id, showDetailFetch]);

  const vendors = (showDetailFetch ? detail?.vendors : bid.vendors) || bid.vendors || [];

  if (loading) {
    return (
      <div className="text-center py-3 text-slate-400 text-body">
        <span className="material-symbols-outlined animate-spin mr-1 text-[16px] align-middle">
          progress_activity
        </span>
        Đang tải báo giá chi tiết...
      </div>
    );
  }

  if (vendors.length === 0) {
    return (
      <div className="text-center py-6 text-slate-500 text-body space-y-3">
        <div>
          <span className="material-symbols-outlined text-[24px] opacity-50 align-middle mr-1">
            inbox
          </span>
          Chưa có NCC nào gửi báo giá cho RFQ này
        </div>
        {onEnterQuote && (
          <button
            onClick={onEnterQuote}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-caption rounded bg-[var(--color-brand)] text-white hover:opacity-90"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            Nhập báo giá NCC đầu tiên
          </button>
        )}
      </div>
    );
  }

  // Per-item stats (used in showDetailFetch mode)
  const offersByVendor = new Map<string, { items: number }>();
  if (showDetailFetch && detail) {
    for (const item of detail.items || []) {
      for (const off of item.offers || []) {
        const cur = offersByVendor.get(off.vendorId) || { items: 0 };
        cur.items += 1;
        offersByVendor.set(off.vendorId, cur);
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-h3 text-[var(--color-brand)]">
          {vendors.length} nhà cung cấp đã gửi báo giá
          {showDetailFetch && detail?.bidCode && (
            <> · <code className="text-body">{detail.bidCode}</code></>
          )}
        </h3>
        <div className="flex items-center gap-3">
          {onEnterQuote && (
            <button
              onClick={onEnterQuote}
              className="text-caption inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--color-brand)] text-white hover:opacity-90"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              Nhập báo giá NCC
            </button>
          )}
          <Link
            href={href}
            className="text-caption text-[var(--color-info)] hover:underline inline-flex items-center gap-1"
          >
            Xem chi tiết so sánh
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[...vendors]
          .sort((a, b) => a.vendorOrder - b.vendorOrder)
          .map((v) => {
            const stats = offersByVendor.get(v.id);
            return (
              <div
                key={v.id}
                className={`rounded-lg border p-3 ${
                  v.isWinner
                    ? 'border-[var(--color-success)] bg-[var(--color-success-soft)]'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-emphasis truncate" title={v.vendorName}>
                      {v.vendorName}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <span className={`badge ${v.vendorType === 'IMPORT' ? 'badge-warning' : 'badge-info'}`}>
                        {v.vendorType === 'IMPORT' ? 'Nhập khẩu' : 'Trong nước'}
                      </span>
                      <span className="badge badge-info">{v.currency}</span>
                      {v.isWinner && (
                        <span className="badge badge-success">
                          <span className="material-symbols-outlined text-[12px]">verified</span>
                          Trúng
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div
                  className={`mt-2 pt-2 border-t border-slate-100 ${
                    stats ? 'grid grid-cols-2 gap-2' : ''
                  }`}
                >
                  {stats && (
                    <div>
                      <div className="label">Số item báo</div>
                      <div className="text-h3 font-mono text-[var(--color-brand)]">{stats.items}</div>
                    </div>
                  )}
                  <div className={stats ? 'text-right' : ''}>
                    <div className="label">Tổng báo giá</div>
                    <div className="text-h3 font-mono text-[var(--color-brand)]">
                      {fmtMoney(v.totalQuote, v.currency)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
