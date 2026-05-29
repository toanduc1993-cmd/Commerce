'use client';

/**
 * /hop-dong — Module 4: Quản Lý Hợp Đồng
 *
 * List tất cả contracts được aggregate từ ContractDetail (group by contractNo).
 * Phân biệt DOM/IMP với fields đầy đủ.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { fetchContracts, type ContractRow } from '@/lib/api';
import { PROJECTS } from '@/context/ProjectContext';
import { toast, Toaster } from 'react-hot-toast';
import { TableSearch, ColumnFilter, ActiveFilterChips } from '@/components/data-table';
import { useTableFilters } from '@/hooks/useTableFilters';

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—';
const fmtMoney = (v: number, currency = 'VND') => {
  if (!v) return '—';
  if (currency === 'USD') return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (v >= 1e9) return `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} tr`;
  return v.toLocaleString('vi-VN');
};

export default function HopDongPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'DOMESTIC' | 'IMPORT'>('all');
  const [filterProject, setFilterProject] = useState<string>('all');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem('ibshi_authed')) {
      router.push('/login');
      return;
    }
    (async () => {
      try {
        const data = await fetchContracts();
        setContracts(data);
      } catch (err) {
        toast.error(`Lỗi: ${err instanceof Error ? err.message : 'unknown'}`);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  // ─── Search + per-column filter ──────────────────────────────────────────
  const tableFilters = useTableFilters<ContractRow>({
    searchFields: ['contractNo', 'vendorName'],
    columns: {
      contractNo: { type: 'text', label: 'Số HĐ' },
      vendorName: { type: 'text', label: 'Nhà cung cấp' },
      contractType: {
        type: 'select',
        label: 'Loại',
        options: [
          { value: 'DOMESTIC', label: 'Trong nước' },
          { value: 'IMPORT', label: 'Nhập khẩu' },
        ],
      },
      currency: { type: 'select', label: 'Tiền tệ', options: ['VND', 'USD', 'EUR'] },
      totalNoVAT: { type: 'numberRange', label: 'Giá trị (chưa VAT)' },
      contractDate: { type: 'dateRange', label: 'Ngày ký' },
    },
  });

  // Sync legacy pills with new filter
  useEffect(() => {
    tableFilters.setSearch(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  useEffect(() => {
    if (filterType === 'all') tableFilters.clearColumn('contractType');
    else tableFilters.setColumnFilter('contractType', { type: 'select', value: filterType });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType]);

  // projectCodes is array → custom filter via accessor
  const filtered = tableFilters.apply(contracts).filter((c) => {
    if (filterProject !== 'all' && !c.projectCodes.includes(filterProject)) return false;
    return true;
  });

  const totalContracts = contracts.length;
  const totalValue = contracts.reduce((s, c) => s + c.totalNoVAT, 0);
  const domCount = contracts.filter((c) => c.contractType === 'DOMESTIC').length;
  const impCount = contracts.filter((c) => c.contractType === 'IMPORT').length;

  return (
    <div className="flex min-h-screen bg-[#f4f6fb]">
      <Toaster position="top-right" />
      <Sidebar />

      <div className="flex-1 ml-64 px-8 pt-8 pb-12 space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-black text-[#1B365D]">Quản Lý Hợp Đồng</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Aggregate từ ContractDetail · Phân biệt Trong nước (DOM) / Nhập khẩu (IMP)
            </p>
          </div>
          <div className="w-80">
            <TableSearch
              value={search}
              onChange={setSearch}
              placeholder="Tìm số HĐ, vendor..."
              resultCount={filtered.length}
              totalCount={contracts.length}
            />
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              l: 'Tổng HĐ',
              v: totalContracts,
              sub: `${domCount} TN · ${impCount} NK`,
              i: 'description',
              c: '#1B365D',
            },
            {
              l: 'Trong nước (DOM)',
              v: domCount,
              sub: `${Math.round((domCount / totalContracts) * 100) || 0}%`,
              i: 'home_work',
              c: '#198754',
            },
            {
              l: 'Nhập khẩu (IMP)',
              v: impCount,
              sub: `${Math.round((impCount / totalContracts) * 100) || 0}%`,
              i: 'public',
              c: '#6f42c1',
            },
            {
              l: 'Tổng giá trị',
              v: fmtMoney(totalValue),
              sub: 'VND (chưa VAT)',
              i: 'payments',
              c: '#fd7e14',
            },
          ].map((k) => (
            <div
              key={k.l}
              className="bg-white border-l-4 rounded-lg p-4 shadow-sm flex items-start gap-3"
              style={{ borderLeftColor: k.c }}
            >
              <span className="material-symbols-outlined text-[28px]" style={{ color: k.c }}>
                {k.i}
              </span>
              <div>
                <div className="text-[10px] font-black uppercase text-slate-400">{k.l}</div>
                <div className="text-2xl font-black text-[#1B365D] leading-tight mt-0.5">{k.v}</div>
                <div className="text-[10px] text-slate-400">{k.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar: Type pills + Project select + Per-column filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label">Loại HĐ</span>
            {(['all', 'DOMESTIC', 'IMPORT'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                  filterType === t
                    ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-[var(--color-brand)]'
                }`}
              >
                {t === 'all' ? 'Tất cả' : t === 'DOMESTIC' ? 'Trong nước' : 'Nhập khẩu'}
              </button>
            ))}
            <span className="label ml-3">Dự án</span>
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="px-2 py-1 text-body border border-slate-300 rounded bg-white"
            >
              <option value="all">Tất cả</option>
              {PROJECTS.map((p) => (
                <option key={p.id} value={p.code}>
                  {p.code}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <span className="label">Lọc cột:</span>
            {(['contractNo', 'vendorName', 'currency', 'totalNoVAT', 'contractDate'] as const).map(
              (col) => (
                <div key={col} className="flex items-center">
                  <span className="text-caption text-slate-500 mr-1">
                    {tableFilters.config[col]?.label ?? col}
                  </span>
                  <ColumnFilter
                    column={col}
                    config={tableFilters.config[col]}
                    value={tableFilters.columnFilters[col] ?? null}
                    onChange={(v) => tableFilters.setColumnFilter(col, v)}
                  />
                </div>
              )
            )}
          </div>

          {tableFilters.activeCount > 0 && <ActiveFilterChips filters={tableFilters} />}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-[10px]">
            <thead className="bg-[#1B365D] text-white">
              <tr>
                <th className="w-6"></th>
                <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Loại</th>
                <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Số HĐ</th>
                <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Vendor</th>
                <th className="px-2 py-2 text-center text-[9px] font-black uppercase">Ngày ký</th>
                <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Dự án</th>
                <th className="px-2 py-2 text-right text-[9px] font-black uppercase">Items</th>
                <th className="px-2 py-2 text-right text-[9px] font-black uppercase">SL</th>
                <th className="px-2 py-2 text-right text-[9px] font-black uppercase">KL (kg)</th>
                <th className="px-2 py-2 text-right text-[9px] font-black uppercase">
                  Tổng (chưa VAT)
                </th>
                <th className="px-2 py-2 text-center text-[9px] font-black uppercase">Hàng về</th>
                <th className="px-2 py-2 text-center text-[9px] font-black uppercase">QC</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={12} className="text-center py-8 text-slate-400 text-xs">
                    <span className="material-symbols-outlined animate-spin">
                      progress_activity
                    </span>
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-slate-400 text-xs">
                    Chưa có hợp đồng nào
                  </td>
                </tr>
              )}
              {filtered.map((c) => {
                const key = `${c.contractNo}-${c.vendorName}-${c.contractType}`;
                const isExp = expandedKey === key;
                return (
                  <>
                    <tr
                      key={key}
                      onClick={() => setExpandedKey(isExp ? null : key)}
                      className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="px-1 py-1.5 text-center">
                        <span className="material-symbols-outlined text-[14px] text-slate-400">
                          {isExp ? 'expand_less' : 'expand_more'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`px-1.5 py-0.5 text-[8px] font-black rounded ${
                            c.contractType === 'DOMESTIC'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-indigo-100 text-indigo-700'
                          }`}
                        >
                          {c.contractType === 'DOMESTIC' ? 'TN' : 'NK'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-mono font-bold text-[#1B365D]">
                        {c.contractNo}
                      </td>
                      <td className="px-2 py-1.5 font-bold">{c.vendorName || '—'}</td>
                      <td className="px-2 py-1.5 text-center text-[9px]">
                        {fmtDate(c.contractDate)}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[9px]">
                        {c.projectCodes.join(', ')}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">{c.itemCount}</td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {c.totalQty.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {c.totalWeight.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-emerald-700">
                        {fmtMoney(c.totalNoVAT, c.currency || 'VND')}
                      </td>
                      <td className="px-2 py-1.5 text-center text-[9px]">
                        {c.arrivedDate ? fmtDate(c.arrivedDate) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {c.inspectionCount > 0 ? (
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[8px] font-bold">
                            {c.inspectionCount}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                    {/* Expanded — line items + IMP details */}
                    {isExp && (
                      <tr className="bg-blue-50/30">
                        <td colSpan={12} className="p-4 border-t border-dashed border-blue-200">
                          {c.contractType === 'IMPORT' && (
                            <div className="mb-3 grid grid-cols-4 gap-3 text-[10px]">
                              <div>
                                <span className="text-slate-400">Quốc gia: </span>
                                <strong>{c.vendorCountry || '—'}</strong>
                              </div>
                              <div>
                                <span className="text-slate-400">Cảng xuất: </span>
                                <strong>{c.exportPort || '—'}</strong>
                              </div>
                              <div>
                                <span className="text-slate-400">Ngày mở L/C: </span>
                                <strong>{fmtDate(c.importLCDate)}</strong>
                              </div>
                              <div>
                                <span className="text-slate-400">CIF Hải Phòng: </span>
                                <strong>{fmtDate(c.cifDate)}</strong>
                              </div>
                              <div>
                                <span className="text-slate-400">Ngày thanh toán: </span>
                                <strong>{fmtDate(c.paymentDate)}</strong>
                              </div>
                              <div>
                                <span className="text-slate-400">Hải quan: </span>
                                <strong>{fmtDate(c.customsDate)}</strong>
                              </div>
                              <div>
                                <span className="text-slate-400">Hàng về: </span>
                                <strong>{fmtDate(c.arrivedDate)}</strong>
                              </div>
                              <div>
                                <span className="text-slate-400">Mời QC: </span>
                                <strong>{fmtDate(c.qcInvitationDate)}</strong>
                              </div>
                            </div>
                          )}
                          <div className="text-[10px] font-black uppercase text-slate-500 mb-1">
                            Chi tiết line items ({c.lineItems.length})
                          </div>
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="text-slate-500">
                                <th className="text-left py-1">Mã VT</th>
                                <th className="text-left py-1">Tên</th>
                                <th className="text-left py-1">Profile thực</th>
                                <th className="text-right py-1">SL</th>
                                <th className="text-right py-1">KL</th>
                                <th className="text-right py-1">Đơn giá</th>
                                <th className="text-right py-1">Tổng</th>
                                <th className="text-right py-1">SL giao</th>
                                <th className="text-right py-1">QC</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.lineItems.map((li) => (
                                <tr key={li.id} className="border-t border-slate-100">
                                  <td className="py-1 font-mono font-bold text-[#1B365D]">
                                    {li.itemCode}
                                  </td>
                                  <td className="py-1">{li.itemName}</td>
                                  <td className="py-1 font-mono text-[9px] text-slate-500">
                                    {li.actualProfile || '—'}
                                  </td>
                                  <td className="py-1 text-right font-mono">
                                    {li.contractQty.toLocaleString('vi-VN')}
                                  </td>
                                  <td className="py-1 text-right font-mono">
                                    {li.contractWeight.toLocaleString('vi-VN', {
                                      maximumFractionDigits: 0,
                                    })}
                                  </td>
                                  <td className="py-1 text-right font-mono">
                                    {fmtMoney(li.unitPriceNoVAT, c.currency || 'VND')}
                                  </td>
                                  <td className="py-1 text-right font-mono font-bold text-emerald-700">
                                    {fmtMoney(li.totalNoVAT, c.currency || 'VND')}
                                  </td>
                                  <td className="py-1 text-right font-mono">
                                    {li.deliveredQty || '—'}
                                  </td>
                                  <td className="py-1 text-right">{li.inspectionCount || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
