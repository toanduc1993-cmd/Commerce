'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  fetchPurchaseHistorySummary,
  type PurchaseHistorySummary,
  type PurchaseHistoryTransaction,
} from '@/lib/api';

interface Props {
  itemCode: string;
  itemName?: string;
  onClose: () => void;
}

function fmt(n: number | null | undefined, currency = 'VND') {
  if (!n) return '—';
  if (currency === 'VND') return n.toLocaleString('vi-VN') + ' ₫';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ' + currency;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

function fmtQty(n: number, uom?: string) {
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 3 }) + (uom ? ' ' + uom : '');
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  PARTIAL_DELIVERY: 'bg-amber-100 text-amber-700',
  PENDING: 'bg-slate-100 text-slate-600',
  ORDERED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-600',
};

const TYPE_LABELS: Record<string, string> = {
  DOMESTIC: 'Nội địa',
  IMPORT: 'Nhập khẩu',
};

export function PurchaseHistoryPanel({ itemCode, itemName, onClose }: Props) {
  const [data, setData] = useState<PurchaseHistorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPurchaseHistorySummary(itemCode);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [itemCode]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="w-[520px] bg-white h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-[var(--color-surface-container,#e5eeff)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-caption text-slate-500 uppercase tracking-wide font-medium">Lịch sử mua hàng</div>
              <div className="font-semibold text-[var(--color-brand,#002046)] truncate">{itemCode}</div>
              {itemName && <div className="text-body text-slate-600 truncate mt-0.5">{itemName}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`/lich-su-mua-hang?itemCodes=${encodeURIComponent(itemCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-caption text-[var(--color-brand)] hover:underline"
              >
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                Xem đầy đủ
              </a>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                aria-label="Đóng"
              >
                <span className="material-symbols-outlined text-[20px] text-slate-500">close</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <span className="material-symbols-outlined animate-spin text-[28px] mr-2">progress_activity</span>
              Đang tải...
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 rounded-lg text-red-600 text-body">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          {!loading && !error && data && !data.found && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <span className="material-symbols-outlined text-[40px]">search_off</span>
              <div className="text-body">Chưa có lịch sử mua hàng cho mã này</div>
            </div>
          )}

          {!loading && !error && data?.found && data.summary && (
            <>
              {/* KPI chips */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--color-surface-container,#e5eeff)] rounded-xl p-3">
                  <div className="text-caption text-slate-500">Số giao dịch</div>
                  <div className="text-title font-semibold text-[var(--color-brand,#002046)]">
                    {data.summary.totalTransactions}
                  </div>
                </div>
                <div className="bg-[var(--color-surface-container,#e5eeff)] rounded-xl p-3">
                  <div className="text-caption text-slate-500">Nhà cung cấp</div>
                  <div className="text-title font-semibold text-[var(--color-brand,#002046)]">
                    {data.summary.totalVendors}
                  </div>
                </div>
                <div className="bg-[var(--color-surface-container,#e5eeff)] rounded-xl p-3">
                  <div className="text-caption text-slate-500">Giá gần nhất</div>
                  <div className="text-body font-semibold text-slate-800">
                    {fmt(data.summary.latestPrice)}
                  </div>
                  <div className="text-caption text-slate-400">{fmtDate(data.summary.latestDate)}</div>
                </div>
                <div className="bg-[var(--color-surface-container,#e5eeff)] rounded-xl p-3">
                  <div className="text-caption text-slate-500">Giá TB (no VAT)</div>
                  <div className="text-body font-semibold text-slate-800">
                    {fmt(data.summary.avgUnitPrice)}
                  </div>
                  <div className="text-caption text-slate-400">
                    {fmt(data.summary.minUnitPrice)} – {fmt(data.summary.maxUnitPrice)}
                  </div>
                </div>
              </div>

              {/* Vendor bar chart */}
              {data.vendorSummary.length > 0 && (
                <div>
                  <div className="text-body font-semibold text-slate-700 mb-2">Nhà cung cấp đã mua</div>
                  <div className="space-y-2">
                    {data.vendorSummary.map((v) => {
                      const maxQty = Math.max(...data.vendorSummary.map((x) => x.totalQty), 1);
                      const pct = Math.round((v.totalQty / maxQty) * 100);
                      return (
                        <div key={v.vendorName} className="flex items-center gap-2">
                          <div className="w-28 text-caption text-slate-600 truncate">{v.vendorName}</div>
                          <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                            <div
                              className="h-full bg-[var(--color-brand,#002046)]/70 rounded transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="text-caption text-slate-500 w-14 text-right">
                            {fmtQty(v.totalQty, data.uom)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent transactions table */}
              <div>
                <div className="text-body font-semibold text-slate-700 mb-2">10 giao dịch gần nhất</div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-caption">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500">
                        <th className="px-2 py-2 text-left font-medium">Ngày</th>
                        <th className="px-2 py-2 text-left font-medium">NCC</th>
                        <th className="px-2 py-2 text-right font-medium">Số lượng</th>
                        <th className="px-2 py-2 text-right font-medium">Đơn giá</th>
                        <th className="px-2 py-2 text-left font-medium">DA</th>
                        <th className="px-2 py-2 text-left font-medium">Loại</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.recentTransactions.map((t: PurchaseHistoryTransaction) => (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="px-2 py-2 whitespace-nowrap">{fmtDate(t.contractDate)}</td>
                          <td className="px-2 py-2 max-w-[100px] truncate" title={t.vendorName || ''}>
                            {t.vendorName || '—'}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {fmtQty(t.contractQty, data.uom)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {fmt(t.unitPriceNoVAT, t.currency)}
                          </td>
                          <td className="px-2 py-2 text-slate-500 max-w-[60px] truncate" title={t.projectCode || ''}>
                            {t.projectCode || '—'}
                          </td>
                          <td className="px-2 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-600'}`}>
                              {TYPE_LABELS[t.contractType] || t.contractType}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
