'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  fetchPurchaseHistory,
  type PurchaseHistoryItem,
  type PurchaseHistoryTransaction,
  type PurchaseHistoryVendorSummary,
} from '@/lib/api';

function fmt(n: number | null | undefined, currency = 'VND') {
  if (!n && n !== 0) return '—';
  if (currency === 'VND') return n.toLocaleString('vi-VN') + ' ₫';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ' + currency;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
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

function VendorBarChart({ vendors, maxBar = 200 }: { vendors: PurchaseHistoryVendorSummary[]; maxBar?: number }) {
  const maxQty = Math.max(...vendors.map((v) => v.totalQty), 1);
  return (
    <div className="space-y-1.5">
      {vendors.slice(0, 8).map((v) => {
        const pct = Math.round((v.totalQty / maxQty) * maxBar);
        return (
          <div key={v.vendorName} className="flex items-center gap-3">
            <div className="w-32 text-caption text-slate-700 truncate" title={v.vendorName}>
              {v.vendorName}
            </div>
            <div
              className="h-6 bg-[var(--color-brand,#002046)]/80 rounded flex items-center px-2 text-[10px] text-white font-medium transition-all"
              style={{ width: `${pct}px`, minWidth: '8px' }}
            >
              {pct > 40 ? v.txCount + ' HĐ' : ''}
            </div>
            <div className="text-caption text-slate-500 shrink-0">
              {fmt(v.avgPrice)} / đvt
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PriceTrendChart({ transactions }: { transactions: PurchaseHistoryTransaction[] }) {
  const sorted = [...transactions]
    .filter((t) => t.contractDate && t.unitPriceNoVAT > 0)
    .sort((a, b) => new Date(a.contractDate!).getTime() - new Date(b.contractDate!).getTime());

  if (sorted.length < 2) {
    return <div className="text-caption text-slate-400 py-4">Cần ít nhất 2 giao dịch để hiển thị xu hướng giá</div>;
  }

  const W = 460, H = 120, PAD = { top: 10, right: 10, bottom: 28, left: 60 };
  const prices = sorted.map((t) => t.unitPriceNoVAT);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const points = sorted.map((t, i) => {
    const x = PAD.left + (i / (sorted.length - 1)) * innerW;
    const y = PAD.top + (1 - (t.unitPriceNoVAT - minP) / range) * innerH;
    return { x, y, t };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-[10px]" style={{ height: H }}>
      {/* Grid lines */}
      {[0, 0.5, 1].map((frac) => {
        const y = PAD.top + frac * innerH;
        const price = maxP - frac * range;
        return (
          <g key={frac}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#e2e8f0" strokeWidth={1} />
            <text x={PAD.left - 4} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize={9}>
              {(price / 1000).toFixed(0)}k
            </text>
          </g>
        );
      })}
      {/* Line */}
      <path d={pathD} fill="none" stroke="var(--color-brand,#002046)" strokeWidth={2} strokeLinejoin="round" />
      {/* Dots + labels */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill="var(--color-brand,#002046)" />
          {(i === 0 || i === points.length - 1) && (
            <text x={p.x} y={p.y - 7} textAnchor="middle" fill="#475569" fontSize={9}>
              {fmtDate(p.t.contractDate)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export default function LichSuMuaHangPage() {
  const searchParams = useSearchParams();
  const initialCodes = searchParams.get('itemCodes') || '';

  const [inputValue, setInputValue] = useState(initialCodes);
  const [activeItemCodes, setActiveItemCodes] = useState<string[]>(
    initialCodes ? initialCodes.split(',').map((s) => s.trim()).filter(Boolean) : []
  );
  const [results, setResults] = useState<PurchaseHistoryItem[]>([]);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemCode, setSelectedItemCode] = useState<string | null>(null);
  const [vendorFilter, setVendorFilter] = useState('');
  const didAutoLoad = useRef(false);

  const doSearch = useCallback(async (codes: string[]) => {
    if (codes.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPurchaseHistory(codes);
      setResults(res.data);
      setNotFound(res.notFound);
      if (res.data.length > 0) setSelectedItemCode(res.data[0].itemCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!didAutoLoad.current && activeItemCodes.length > 0) {
      didAutoLoad.current = true;
      doSearch(activeItemCodes);
    }
  }, [activeItemCodes, doSearch]);

  const handleSearch = () => {
    const codes = inputValue.split(',').map((s) => s.trim()).filter(Boolean);
    setActiveItemCodes(codes);
    doSearch(codes);
  };

  const selectedItem = results.find((r) => r.itemCode === selectedItemCode);
  const filteredTx = selectedItem?.transactions.filter((t) =>
    vendorFilter ? t.vendorName?.toLowerCase().includes(vendorFilter.toLowerCase()) : true
  ) ?? [];

  return (
    <div className="min-h-screen bg-[var(--color-background,#f8f9ff)]">
      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-heading font-bold text-[var(--color-brand,#002046)]">Lịch Sử Mua Hàng</h1>
            <p className="text-body text-slate-500 mt-0.5">Tra cứu lịch sử đơn giá, nhà cung cấp và khối lượng theo mã vật tư</p>
          </div>
        </div>

        {/* Search bar */}
        <div className="mt-4 flex gap-3">
          <div className="flex-1 relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
              search
            </span>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Nhập mã vật tư, cách nhau bằng dấu phẩy (VD: I95-VTC-001, I95-VTC-002)"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-body focus:outline-none focus:ring-2 focus:ring-[var(--color-brand,#002046)]/30 focus:border-[var(--color-brand,#002046)]"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !inputValue.trim()}
            className="px-5 py-2.5 bg-[var(--color-brand,#002046)] text-white rounded-lg text-body font-semibold hover:bg-[var(--color-brand,#002046)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Đang tìm...' : 'Tra cứu'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-8 mt-4 p-4 bg-red-50 rounded-lg text-red-600 text-body flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {error}
        </div>
      )}

      {/* Not found chips */}
      {notFound.length > 0 && (
        <div className="mx-8 mt-4 flex flex-wrap gap-2 items-center">
          <span className="text-caption text-slate-500">Không tìm thấy:</span>
          {notFound.map((c) => (
            <span key={c} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-caption">{c}</span>
          ))}
        </div>
      )}

      {/* Main content */}
      {results.length > 0 && (
        <div className="flex gap-0 mt-0">
          {/* SKU sidebar */}
          {results.length > 1 && (
            <div className="w-56 shrink-0 bg-white border-r border-slate-200 h-[calc(100vh-160px)] overflow-y-auto sticky top-0">
              <div className="p-3 border-b border-slate-100">
                <div className="text-caption text-slate-500 font-medium">{results.length} mã vật tư</div>
              </div>
              {results.map((item) => (
                <button
                  key={item.itemCode}
                  onClick={() => setSelectedItemCode(item.itemCode)}
                  className={`w-full text-left px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                    selectedItemCode === item.itemCode ? 'bg-[var(--color-brand,#002046)]/5 border-l-2 border-l-[var(--color-brand,#002046)]' : ''
                  }`}
                >
                  <div className="text-caption font-semibold text-slate-800 truncate">{item.itemCode}</div>
                  <div className="text-caption text-slate-500 truncate">{item.itemName}</div>
                  <div className="text-[10px] text-slate-400">{item.summary.totalTransactions} giao dịch</div>
                </button>
              ))}
            </div>
          )}

          {/* Detail area */}
          {selectedItem && (
            <div className="flex-1 px-8 py-6 space-y-6 overflow-y-auto">
              {/* Item header */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-heading font-bold text-[var(--color-brand,#002046)]">
                      {selectedItem.itemCode}
                    </div>
                    <div className="text-body text-slate-600 mt-0.5">{selectedItem.itemName}</div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedItem.profile && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-caption">{selectedItem.profile}</span>
                      )}
                      {selectedItem.grade && (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-caption">{selectedItem.grade}</span>
                      )}
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-caption">{selectedItem.uom}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 shrink-0">
                    {[
                      { label: 'Giao dịch', value: selectedItem.summary.totalTransactions },
                      { label: 'Nhà cung cấp', value: selectedItem.summary.totalVendors },
                      { label: 'Tổng mua', value: selectedItem.summary.totalQtyBought.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' ' + selectedItem.uom },
                    ].map((kpi) => (
                      <div key={kpi.label} className="text-right">
                        <div className="text-title font-bold text-[var(--color-brand,#002046)]">{kpi.value}</div>
                        <div className="text-caption text-slate-500">{kpi.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Price range */}
                <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                  {[
                    { label: 'Giá thấp nhất', value: fmt(selectedItem.summary.minUnitPrice) },
                    { label: 'Giá trung bình', value: fmt(selectedItem.summary.avgUnitPrice) },
                    { label: 'Giá cao nhất', value: fmt(selectedItem.summary.maxUnitPrice) },
                  ].map((p) => (
                    <div key={p.label}>
                      <div className="text-caption text-slate-500">{p.label}</div>
                      <div className="text-body font-semibold text-slate-800">{p.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-2 gap-5">
                {/* Vendor bar */}
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="text-body font-semibold text-slate-700 mb-3">Khối lượng theo NCC</div>
                  <VendorBarChart vendors={selectedItem.vendorSummary} />
                </div>

                {/* Price trend */}
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="text-body font-semibold text-slate-700 mb-3">Xu hướng đơn giá (VNĐ/đvt)</div>
                  <PriceTrendChart transactions={selectedItem.transactions} />
                </div>
              </div>

              {/* Transaction table */}
              <div className="bg-white rounded-xl border border-slate-200">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="text-body font-semibold text-slate-700">
                    Danh sách giao dịch ({filteredTx.length})
                  </div>
                  <input
                    type="text"
                    value={vendorFilter}
                    onChange={(e) => setVendorFilter(e.target.value)}
                    placeholder="Lọc theo NCC..."
                    className="w-44 px-3 py-1.5 border border-slate-200 rounded-lg text-caption focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]/30"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-caption">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                        {['Ngày ký', 'Số HĐ', 'NCC', 'Số lượng', 'Đơn giá (no VAT)', 'Tổng (no VAT)', 'Dự án', 'PR', 'Loại', 'Trạng thái'].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredTx.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2 whitespace-nowrap">{fmtDate(t.contractDate)}</td>
                          <td className="px-3 py-2 text-slate-500">{t.contractNo || '—'}</td>
                          <td className="px-3 py-2 font-medium max-w-[140px] truncate" title={t.vendorName || ''}>{t.vendorName || '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{t.contractQty.toLocaleString('vi-VN', { maximumFractionDigits: 3 })} {selectedItem.uom}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(t.unitPriceNoVAT, t.currency)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(t.totalNoVAT, t.currency)}</td>
                          <td className="px-3 py-2 text-slate-500">{t.projectCode || '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{t.prRef || '—'}</td>
                          <td className="px-3 py-2">
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">
                              {TYPE_LABELS[t.contractType] || t.contractType}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-600'}`}>
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredTx.length === 0 && (
                        <tr>
                          <td colSpan={10} className="px-3 py-8 text-center text-slate-400">Không có giao dịch nào</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && results.length === 0 && activeItemCodes.length > 0 && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
          <span className="material-symbols-outlined text-[56px]">search_off</span>
          <div className="text-title font-medium">Không tìm thấy lịch sử mua hàng</div>
          <div className="text-body">Thử với mã vật tư khác</div>
        </div>
      )}

      {!loading && results.length === 0 && activeItemCodes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-300 gap-3">
          <span className="material-symbols-outlined text-[64px]">history</span>
          <div className="text-title font-medium text-slate-400">Nhập mã vật tư để tra cứu</div>
          <div className="text-body text-slate-300">Hỗ trợ tra nhiều mã cùng lúc (tối đa 50)</div>
        </div>
      )}
    </div>
  );
}
