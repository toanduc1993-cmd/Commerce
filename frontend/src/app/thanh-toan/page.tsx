'use client';

/**
 * /thanh-toan — Module 5: Kế Hoạch Thanh Toán
 *
 * UI giống sheet "Kế hoạch thanh toán" trong file Excel.
 * Group by tháng (Tháng 2, Tháng 3, ...).
 * Upload Excel để parse + import.
 */

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import {
  fetchPaymentSchedules,
  uploadPaymentSchedulesFile,
  updatePaymentScheduleStatus,
  type PaymentScheduleRow,
} from '@/lib/api';
import { PROJECTS } from '@/context/ProjectContext';
import { toast, Toaster } from 'react-hot-toast';
import { TableSearch, ColumnFilter, ActiveFilterChips } from '@/components/data-table';
import { useTableFilters } from '@/hooks/useTableFilters';

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—';
const fmtMoney = (v: number, currency = 'USD') => {
  if (!v) return '—';
  if (currency === 'USD') return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (v >= 1e9) return `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} tr`;
  return v.toLocaleString('vi-VN');
};

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  PLANNED: { label: 'Kế hoạch', cls: 'bg-blue-100 text-blue-700 border-blue-300' },
  DUE: { label: 'Sắp đến hạn', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
  PAID: { label: 'Đã thanh toán', cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  OVERDUE: { label: 'Quá hạn', cls: 'bg-red-100 text-red-700 border-red-300' },
};

export default function ThanhToanPage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<PaymentScheduleRow[]>([]);
  const [summary, setSummary] = useState<
    Array<{ month: string; count: number; totalValue: number }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProject, setUploadProject] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setIsLoading(true);
    try {
      const r = await fetchPaymentSchedules();
      setSchedules(r.data);
      setSummary(r.summary);
    } catch (err) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!localStorage.getItem('ibshi_authed')) {
      router.push('/login');
      return;
    }
    reload();
  }, [router]);

  // ─── Search + per-column filter ──────────────────────────────────────────
  const tableFilters = useTableFilters<PaymentScheduleRow>({
    searchFields: ['supplier', 'saleContract'],
    columns: {
      supplier: { type: 'text', label: 'NCC' },
      saleContract: { type: 'text', label: 'Sale Contract' },
      projectCode: {
        type: 'select',
        label: 'Dự án',
        options: PROJECTS.map((p) => ({ value: p.code, label: p.code })),
      },
      paymentMonth: { type: 'text', label: 'Tháng TT' },
      status: {
        type: 'multiSelect',
        label: 'Trạng thái',
        options: [
          { value: 'PLANNED', label: 'Kế hoạch' },
          { value: 'DUE', label: 'Sắp đến hạn' },
          { value: 'PAID', label: 'Đã thanh toán' },
          { value: 'OVERDUE', label: 'Quá hạn' },
        ],
      },
      paymentMethod: { type: 'text', label: 'Phương thức' },
      value: { type: 'numberRange', label: 'Giá trị' },
      signDate: { type: 'dateRange', label: 'Ngày ký' },
      lcDeadline: { type: 'dateRange', label: 'Deadline L/C' },
    },
  });

  // Sync legacy pills
  useEffect(() => {
    tableFilters.setSearch(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  useEffect(() => {
    if (filterMonth === 'all') tableFilters.clearColumn('paymentMonth');
    else tableFilters.setColumnFilter('paymentMonth', { type: 'text', value: filterMonth });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMonth]);
  useEffect(() => {
    if (filterStatus === 'all') tableFilters.clearColumn('status');
    else tableFilters.setColumnFilter('status', { type: 'multiSelect', values: [filterStatus] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);
  useEffect(() => {
    if (filterProject === 'all') tableFilters.clearColumn('projectCode');
    else tableFilters.setColumnFilter('projectCode', { type: 'select', value: filterProject });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterProject]);

  const filtered = tableFilters.apply(schedules);

  const handleUpload = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    const toastId = toast.loading(`Đang xử lý ${uploadFile.name}…`);
    try {
      const r = await uploadPaymentSchedulesFile(uploadFile, uploadProject || undefined);
      toast.dismiss(toastId);
      if (r.success) {
        toast.success(`✅ ${r.message}`, { duration: 5000 });
        setShowUpload(false);
        setUploadFile(null);
        await reload();
      } else {
        toast.error(`❌ ${r.error || 'Lỗi không xác định'}`);
      }
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(`❌ ${err instanceof Error ? err.message : 'Lỗi mạng'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    if (!confirm('Đánh dấu khoản này đã thanh toán?')) return;
    try {
      await updatePaymentScheduleStatus(id, {
        status: 'PAID',
        paidDate: new Date().toISOString(),
      });
      toast.success('✅ Đã đánh dấu thanh toán');
      reload();
    } catch (err) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  };

  const totalValue = filtered.reduce((s, x) => s + (x.value || 0), 0);
  const paidCount = filtered.filter((s) => s.status === 'PAID').length;

  return (
    <div className="flex min-h-screen bg-[#f4f6fb]">
      <Toaster position="top-right" />
      <Sidebar />

      <div className="flex-1 ml-64 px-8 pt-8 pb-12 space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-black text-[#1B365D]">Kế Hoạch Thanh Toán</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Lịch thanh toán theo tháng · Phương thức T/T, LC, DP · Quản lý L/C deadline
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-72">
              <TableSearch
                value={search}
                onChange={setSearch}
                placeholder="Tìm NCC, sale contract..."
                resultCount={filtered.length}
                totalCount={schedules.length}
              />
            </div>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow"
            >
              <span className="material-symbols-outlined text-[14px]">upload</span>
              Upload
            </button>
          </div>
        </div>

        {/* Summary by month */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              l: 'Tổng entries',
              v: schedules.length,
              sub: `${paidCount} đã thanh toán`,
              i: 'payments',
              c: '#1B365D',
            },
            {
              l: 'Tổng giá trị (USD)',
              v: fmtMoney(totalValue, 'USD'),
              sub: 'Lọc hiện tại',
              i: 'attach_money',
              c: '#198754',
            },
            {
              l: 'Tháng cần TT',
              v: summary.length,
              sub: 'Period khác nhau',
              i: 'calendar_month',
              c: '#0d6efd',
            },
            {
              l: 'NCC cần TT',
              v: new Set(schedules.map((s) => s.supplier)).size,
              sub: 'Vendors',
              i: 'domain',
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

        {/* Month buckets summary */}
        {summary.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-xs font-black text-[#1B365D] mb-2">Tổng quan theo tháng</h3>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilterMonth('all')}
                className={`px-3 py-1.5 rounded-lg border transition-all ${
                  filterMonth === 'all'
                    ? 'bg-[#1B365D] text-white border-[#1B365D]'
                    : 'bg-slate-50 border-slate-200 hover:border-[#1B365D]'
                }`}
              >
                <div className="text-[10px] font-bold uppercase">Tất cả</div>
                <div className="text-sm font-black">{schedules.length} mục</div>
              </button>
              {summary.map((s) => (
                <button
                  key={s.month}
                  onClick={() => setFilterMonth(s.month)}
                  className={`px-3 py-1.5 rounded-lg border transition-all ${
                    filterMonth === s.month
                      ? 'bg-[#1B365D] text-white border-[#1B365D]'
                      : 'bg-slate-50 border-slate-200 hover:border-[#1B365D]'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase">{s.month}</div>
                  <div className="text-sm font-black">{s.count} mục</div>
                  <div className="text-[9px] opacity-70">{fmtMoney(s.totalValue, 'USD')}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Toolbar: Status pills + Project select + Per-column filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label">Trạng thái</span>
            {['all', 'PLANNED', 'DUE', 'PAID', 'OVERDUE'].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                  filterStatus === s
                    ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-[var(--color-brand)]'
                }`}
              >
                {s === 'all' ? 'Tất cả' : STATUS_CFG[s]?.label || s}
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
              <option value="DA 095">DA 095</option>
              <option value="DA 090">DA 090</option>
            </select>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <span className="label">Lọc cột:</span>
            {(
              ['supplier', 'saleContract', 'paymentMethod', 'value', 'signDate', 'lcDeadline'] as const
            ).map((col) => (
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
            ))}
          </div>

          {tableFilters.activeCount > 0 && <ActiveFilterChips filters={tableFilters} />}
        </div>

        {/* Table — y format Excel "Kế hoạch thanh toán" */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-[10px]">
            <thead className="bg-[#1B365D] text-white">
              <tr>
                <th className="px-2 py-2 text-center text-[9px] font-black uppercase">STT</th>
                <th className="px-2 py-2 text-left text-[9px] font-black uppercase">SUPPLIER</th>
                <th className="px-2 py-2 text-left text-[9px] font-black uppercase">
                  Sale Contract
                </th>
                <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Dự án</th>
                <th className="px-2 py-2 text-right text-[9px] font-black uppercase">
                  Value (USD)
                </th>
                <th className="px-2 py-2 text-center text-[9px] font-black uppercase">Payment</th>
                <th className="px-2 py-2 text-center text-[9px] font-black uppercase">Sign Date</th>
                <th className="px-2 py-2 text-center text-[9px] font-black uppercase">L/C</th>
                <th className="px-2 py-2 text-center text-[9px] font-black uppercase">ETD</th>
                <th className="px-2 py-2 text-center text-[9px] font-black uppercase">ETA</th>
                <th className="px-2 py-2 text-center text-[9px] font-black uppercase">Doc</th>
                <th className="px-2 py-2 text-center text-[9px] font-black uppercase">KH TT</th>
                <th className="px-2 py-2 text-center text-[9px] font-black uppercase">
                  L/C deadline
                </th>
                <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Note</th>
                <th className="px-2 py-2 text-center text-[9px] font-black uppercase">
                  Trạng thái
                </th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={16} className="text-center py-8 text-slate-400">
                    <span className="material-symbols-outlined animate-spin">
                      progress_activity
                    </span>
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={16} className="text-center py-12 text-slate-400 text-xs">
                    Chưa có kế hoạch thanh toán
                  </td>
                </tr>
              )}
              {filtered.map((s, idx) => {
                const status = STATUS_CFG[s.status] || STATUS_CFG['PLANNED'];
                return (
                  <tr
                    key={s.id}
                    className={`border-t border-slate-100 hover:bg-slate-50 ${idx % 2 ? 'bg-slate-50/30' : ''}`}
                  >
                    <td className="px-2 py-1.5 text-center font-mono text-slate-400">{idx + 1}</td>
                    <td className="px-2 py-1.5 font-bold text-[#1B365D]">{s.supplier}</td>
                    <td className="px-2 py-1.5 font-mono text-[9px] text-slate-600">
                      {s.saleContract || '—'}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[9px]">{s.projectCode || '—'}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold text-emerald-700">
                      {fmtMoney(s.value, s.currency)}
                    </td>
                    <td className="px-2 py-1.5 text-center text-[9px]">
                      <span className="px-1.5 py-0.5 bg-slate-100 rounded font-bold">
                        {s.paymentMethod || '—'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center text-[9px]">{fmtDate(s.signDate)}</td>
                    <td className="px-2 py-1.5 text-center text-[9px]">{fmtDate(s.lcDate)}</td>
                    <td className="px-2 py-1.5 text-center text-[9px]">{fmtDate(s.etd)}</td>
                    <td className="px-2 py-1.5 text-center text-[9px] font-bold">
                      {fmtDate(s.eta)}
                    </td>
                    <td className="px-2 py-1.5 text-center text-[9px]">
                      {fmtDate(s.documentDate)}
                    </td>
                    <td className="px-2 py-1.5 text-center text-[9px] font-bold text-[#0d6efd]">
                      {s.paymentMonth || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-center text-[9px] text-red-600">
                      {fmtDate(s.lcDeadline)}
                    </td>
                    <td className="px-2 py-1.5 text-[9px] text-slate-500 max-w-[180px] truncate">
                      {s.notes || ''}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border ${status.cls}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {s.status !== 'PAID' && (
                        <button
                          onClick={() => handleMarkPaid(s.id)}
                          title="Đánh dấu đã thanh toán"
                          className="text-emerald-600 hover:text-emerald-800"
                        >
                          <span className="material-symbols-outlined text-[16px]">paid</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="bg-[#1B365D] px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-white font-black text-sm">Upload Kế Hoạch Thanh Toán</div>
                <div className="text-blue-200 text-[10px]">
                  Excel có sheet &ldquo;Kế hoạch thanh toán&rdquo;
                </div>
              </div>
              <button
                onClick={() => setShowUpload(false)}
                className="text-white/60 hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <select
                value={uploadProject}
                onChange={(e) => setUploadProject(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded text-xs"
              >
                <option value="">— Tự động detect —</option>
                {PROJECTS.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.code}
                  </option>
                ))}
              </select>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-[#1B365D]"
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setUploadFile(f);
                    e.target.value = '';
                  }}
                />
                {uploadFile ? (
                  <div className="text-emerald-600 text-xs font-bold">✓ {uploadFile.name}</div>
                ) : (
                  <div className="text-slate-400 text-xs">Click chọn file .xlsx</div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowUpload(false)}
                  className="flex-1 px-4 py-2 text-xs font-bold border border-slate-200 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!uploadFile || isUploading}
                  className="flex-1 px-4 py-2 text-xs font-bold rounded-lg text-white bg-[#1B365D] disabled:bg-slate-300"
                >
                  {isUploading ? 'Đang xử lý...' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
