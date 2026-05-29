// ============================================================
// PAGE: /warehouse — Theo dõi hàng về kho + QC + Bàn giao SX
// Source: ContractDetail (arrivedDate, qcInvitationDate, handoverToProductDate)
//         + InspectionRecord (QC results)
// Không track real-time inventory — chỉ track milestones
// ============================================================

'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import {
  fetchArrivals,
  fetchArrivalStats,
  updateArrival,
  addInspection,
  deleteInspectionRecord,
  type ArrivalRow,
  type ArrivalStats,
} from '@/lib/api';
import { toast, Toaster } from 'react-hot-toast';

const QC_CFG: Record<string, { label: string; cls: string; icon: string }> = {
  PENDING: {
    label: 'Chờ QC',
    cls: 'bg-amber-50 text-amber-700 border-amber-300',
    icon: 'hourglass_empty',
  },
  PASSED: {
    label: 'Đạt',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    icon: 'verified',
  },
  FAILED: {
    label: 'Không đạt',
    cls: 'bg-red-50 text-red-700 border-red-300',
    icon: 'cancel',
  },
  PARTIAL: {
    label: 'Đạt một phần',
    cls: 'bg-orange-50 text-orange-700 border-orange-300',
    icon: 'warning',
  },
};

const fmtNum = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('vi-VN') : '—');
const fmtWeight = (kg: number) =>
  kg >= 1000 ? `${(kg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}t` : `${fmtNum(kg)}kg`;

export default function WarehousePage() {
  const router = useRouter();
  const [arrivals, setArrivals] = useState<ArrivalRow[]>([]);
  const [stats, setStats] = useState<ArrivalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterQC, setFilterQC] = useState<string>('all');
  const [filterType, setFilterType] = useState<'all' | 'DOMESTIC' | 'IMPORT'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Inspection form
  const [showInspForm, setShowInspForm] = useState<string | null>(null);
  const [inspForm, setInspForm] = useState({
    reportNo: '',
    inspectionDate: new Date().toISOString().slice(0, 10),
    inspectedQty: '',
    inspectedWeight: '',
    acceptedQty: '',
    acceptedWeight: '',
    result: 'Pass',
    remarks: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, st] = await Promise.all([fetchArrivals(), fetchArrivalStats()]);
      setArrivals(list);
      setStats(st);
    } catch (err) {
      toast.error(`Lỗi tải dữ liệu: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('ibshi_authed')) {
      router.push('/login');
      return;
    }
    load();
  }, [router, load]);

  const filtered = arrivals.filter((a) => {
    if (filterQC !== 'all' && a.qcStatus !== filterQC) return false;
    if (filterType !== 'all' && a.contractType !== filterType) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (a.contractNo || '').toLowerCase().includes(q) ||
      (a.vendorName || '').toLowerCase().includes(q) ||
      (a.item.itemCode || '').toLowerCase().includes(q) ||
      (a.item.itemName || '').toLowerCase().includes(q)
    );
  });

  const handleHandover = async (a: ArrivalRow) => {
    if (a.isHandedOver) {
      if (!confirm('Huỷ trạng thái bàn giao sản xuất?')) return;
      const r = await updateArrival(a.id, { handoverToProductDate: null });
      if (r.success) {
        toast.success('Đã huỷ bàn giao');
        load();
      }
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const date = prompt('Ngày bàn giao sản xuất (YYYY-MM-DD):', today);
      if (!date) return;
      const r = await updateArrival(a.id, { handoverToProductDate: date });
      if (r.success) {
        toast.success('Đã đánh dấu bàn giao SX');
        load();
      } else {
        toast.error(r.error || 'Lỗi cập nhật');
      }
    }
  };

  const handleSetArrived = async (a: ArrivalRow) => {
    const today = new Date().toISOString().slice(0, 10);
    const date = prompt('Ngày hàng về kho (YYYY-MM-DD):', a.arrivedDate?.slice(0, 10) || today);
    if (!date) return;
    const r = await updateArrival(a.id, { arrivedDate: date });
    if (r.success) {
      toast.success('Đã cập nhật');
      load();
    }
  };

  const submitInspection = async (cdId: string) => {
    const r = await addInspection(cdId, {
      reportNo: inspForm.reportNo || null,
      inspectionDate: inspForm.inspectionDate || null,
      inspectedQty: Number(inspForm.inspectedQty) || 0,
      inspectedWeight: Number(inspForm.inspectedWeight) || 0,
      acceptedQty: Number(inspForm.acceptedQty) || 0,
      acceptedWeight: Number(inspForm.acceptedWeight) || 0,
      result: inspForm.result,
      remarks: inspForm.remarks || null,
    });
    if (r.success) {
      toast.success('Đã ghi nhận QC');
      setShowInspForm(null);
      setInspForm({
        reportNo: '',
        inspectionDate: new Date().toISOString().slice(0, 10),
        inspectedQty: '',
        inspectedWeight: '',
        acceptedQty: '',
        acceptedWeight: '',
        result: 'Pass',
        remarks: '',
      });
      load();
    } else {
      toast.error(r.error || 'Lỗi');
    }
  };

  const removeInspection = async (id: string) => {
    if (!confirm('Xoá biên bản QC này?')) return;
    const r = await deleteInspectionRecord(id);
    if (r.success) {
      toast.success('Đã xoá');
      load();
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f4f6fb]">
      <Toaster position="top-right" />
      <Sidebar />

      <div className="flex-1 ml-64 px-8 pt-8 pb-12 space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-black text-[#1B365D]">Tồn Kho — Hàng Về & QC</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Track milestone: hàng về → mời QC → kết quả → bàn giao sản xuất
            </p>
          </div>
          <input
            type="search"
            placeholder="Tìm HĐ, vendor, mã vật tư..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs w-72 focus:outline-none focus:border-[#1B365D]"
          />
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-5 gap-4">
          {[
            {
              label: 'Tổng hàng về',
              value: stats?.totalArrivals || 0,
              sub: `${fmtWeight(stats?.totalWeight || 0)}`,
              icon: 'local_shipping',
              color: '#1B365D',
            },
            {
              label: 'QC Đạt',
              value: stats?.passed || 0,
              sub: 'Đã nghiệm thu OK',
              icon: 'verified',
              color: '#198754',
            },
            {
              label: 'QC Không đạt',
              value: stats?.failed || 0,
              sub: 'Cần xử lý',
              icon: 'cancel',
              color: '#dc3545',
            },
            {
              label: 'Chờ QC',
              value: stats?.pending || 0,
              sub: 'Chưa kiểm tra',
              icon: 'hourglass_empty',
              color: '#fd7e14',
            },
            {
              label: 'Bàn giao SX',
              value: stats?.handedOver || 0,
              sub: 'Đã chuyển sản xuất',
              icon: 'engineering',
              color: '#6610f2',
            },
          ].map((k) => (
            <div
              key={k.label}
              className="bg-white border-l-4 rounded-lg p-4 shadow-sm flex items-start gap-3"
              style={{ borderLeftColor: k.color }}
            >
              <span
                className="material-symbols-outlined text-[26px] shrink-0"
                style={{ color: k.color }}
              >
                {k.icon}
              </span>
              <div className="min-w-0">
                <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  {k.label}
                </div>
                <div className="text-2xl font-black text-[#1B365D] leading-tight mt-0.5">
                  {k.value}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{k.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {(['all', 'PENDING', 'PASSED', 'FAILED', 'PARTIAL'] as const).map((s) => {
              const cfg = QC_CFG[s];
              const count =
                s === 'all' ? arrivals.length : arrivals.filter((a) => a.qcStatus === s).length;
              return (
                <button
                  key={s}
                  onClick={() => setFilterQC(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    filterQC === s
                      ? 'bg-[#1B365D] text-white border-[#1B365D]'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-[#1B365D]'
                  }`}
                >
                  {s === 'all' ? 'Tất cả' : cfg?.label || s}{' '}
                  <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {(
              [
                { k: 'all', l: 'Cả hai' },
                { k: 'DOMESTIC', l: 'Trong nước' },
                { k: 'IMPORT', l: 'Nhập khẩu' },
              ] as const
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setFilterType(t.k)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                  filterType === t.k
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-700'
                }`}
              >
                {t.l}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-[#1B365D] text-white">
              <tr>
                <th className="w-8 px-2 py-2"></th>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">
                  HĐ / Vendor
                </th>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">
                  Vật tư
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider">
                  Loại
                </th>
                <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider">
                  SL / Trọng lượng
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider">
                  Hàng về
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider">
                  Mời QC
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider">
                  KQ QC
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider">
                  Bàn giao SX
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider w-20">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-slate-400 text-xs">
                    <span className="material-symbols-outlined animate-spin text-[20px] align-middle mr-2">
                      progress_activity
                    </span>
                    Đang tải…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400 text-xs">
                    <span className="material-symbols-outlined text-[40px] block mx-auto opacity-30">
                      garage_home
                    </span>
                    Không có hàng nào về kho phù hợp filter
                  </td>
                </tr>
              )}
              {filtered.map((a, idx) => {
                const status = QC_CFG[a.qcStatus] || QC_CFG.PENDING;
                const isExp = expandedId === a.id;
                return (
                  <Fragment key={a.id}>
                    <tr
                      className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer ${idx % 2 ? 'bg-slate-50/30' : ''}`}
                      onClick={() => setExpandedId(isExp ? null : a.id)}
                    >
                      <td className="px-2 py-2 text-center text-slate-400">
                        <span className="material-symbols-outlined text-[14px]">
                          {isExp ? 'expand_less' : 'expand_more'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-mono font-bold text-[#1B365D]">
                          {a.contractNo || '—'}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {a.vendorName || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-mono text-[10px] text-[#1B365D] font-bold">
                          {a.item.itemCode || '—'}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[200px]">
                          {a.item.itemName || ''}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            a.contractType === 'IMPORT'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-300'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                          }`}
                        >
                          {a.contractType === 'IMPORT' ? 'NK' : 'TN'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[10px]">
                        <div className="font-semibold text-slate-700">{fmtNum(a.contractQty)}</div>
                        <div className="text-slate-400">{fmtWeight(a.contractWeight)}</div>
                      </td>
                      <td className="px-3 py-2 text-center text-[10px] text-slate-500">
                        {fmtDate(a.arrivedDate)}
                      </td>
                      <td className="px-3 py-2 text-center text-[10px] text-slate-500">
                        {fmtDate(a.qcInvitationDate)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${status.cls}`}
                        >
                          <span className="material-symbols-outlined text-[11px]">
                            {status.icon}
                          </span>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-[10px]">
                        {a.isHandedOver ? (
                          <span className="text-emerald-700 font-bold">
                            {fmtDate(a.handoverToProductDate)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td
                        className="px-3 py-2 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleSetArrived(a)}
                            className="p-1 rounded hover:bg-blue-100 text-blue-600"
                            title="Đặt ngày hàng về"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              event_available
                            </span>
                          </button>
                          <button
                            onClick={() => handleHandover(a)}
                            className={`p-1 rounded ${
                              a.isHandedOver
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'hover:bg-emerald-100 text-emerald-600'
                            }`}
                            title={a.isHandedOver ? 'Đã bàn giao' : 'Bàn giao SX'}
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              engineering
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExp && (
                      <tr className="bg-blue-50/30 border-t border-dashed border-slate-200">
                        <td></td>
                        <td colSpan={9} className="px-4 py-3">
                          <div className="space-y-3">
                            {/* Project info */}
                            {a.project && (
                              <div className="text-[10px] text-slate-500">
                                <span className="font-bold">Dự án:</span>{' '}
                                <span className="text-[#1B365D] font-bold">
                                  {a.project.code}
                                </span>{' '}
                                — {a.project.name}
                                {a.prRef && (
                                  <span className="ml-3">
                                    <span className="font-bold">PR:</span> {a.prRef}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Inspections list */}
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="text-[10px] font-black uppercase text-slate-500">
                                  Biên bản QC ({a.inspections.length})
                                </div>
                                <button
                                  onClick={() => setShowInspForm(a.id)}
                                  className="text-[10px] font-bold text-[#1B365D] hover:underline flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-[12px]">
                                    add_circle
                                  </span>
                                  Thêm QC
                                </button>
                              </div>
                              {a.inspections.length === 0 ? (
                                <div className="text-[10px] text-slate-400 italic">
                                  Chưa có biên bản QC
                                </div>
                              ) : (
                                <table className="w-full text-[10px] bg-white rounded">
                                  <thead className="bg-slate-100 text-slate-600">
                                    <tr>
                                      <th className="px-2 py-1 text-left font-black">Báo cáo</th>
                                      <th className="px-2 py-1 text-left font-black">Ngày</th>
                                      <th className="px-2 py-1 text-right font-black">SL kiểm</th>
                                      <th className="px-2 py-1 text-right font-black">SL đạt</th>
                                      <th className="px-2 py-1 text-center font-black">KQ</th>
                                      <th className="px-2 py-1 text-left font-black">Ghi chú</th>
                                      <th className="w-8"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {a.inspections.map((insp) => (
                                      <tr key={insp.id} className="border-t border-slate-100">
                                        <td className="px-2 py-1 font-mono text-[#1B365D]">
                                          {insp.reportNo || '—'}
                                        </td>
                                        <td className="px-2 py-1 text-slate-500">
                                          {fmtDate(insp.inspectionDate)}
                                        </td>
                                        <td className="px-2 py-1 text-right font-mono">
                                          {fmtNum(insp.inspectedQty)}
                                        </td>
                                        <td className="px-2 py-1 text-right font-mono text-emerald-700">
                                          {fmtNum(insp.acceptedQty)}
                                        </td>
                                        <td className="px-2 py-1 text-center font-bold">
                                          {insp.result || '—'}
                                        </td>
                                        <td className="px-2 py-1 text-slate-500 truncate max-w-[200px]">
                                          {insp.remarks || '—'}
                                        </td>
                                        <td className="px-2 py-1">
                                          <button
                                            onClick={() => removeInspection(insp.id)}
                                            className="text-red-500 hover:text-red-700"
                                          >
                                            <span className="material-symbols-outlined text-[12px]">
                                              close
                                            </span>
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>

                            {/* Add inspection inline form */}
                            {showInspForm === a.id && (
                              <div className="bg-white border border-blue-300 rounded p-3 space-y-2">
                                <div className="grid grid-cols-4 gap-2">
                                  <input
                                    type="text"
                                    placeholder="Số báo cáo"
                                    value={inspForm.reportNo}
                                    onChange={(e) =>
                                      setInspForm({ ...inspForm, reportNo: e.target.value })
                                    }
                                    className="px-2 py-1 border border-slate-200 rounded text-[10px] focus:outline-none focus:border-[#1B365D]"
                                  />
                                  <input
                                    type="date"
                                    value={inspForm.inspectionDate}
                                    onChange={(e) =>
                                      setInspForm({
                                        ...inspForm,
                                        inspectionDate: e.target.value,
                                      })
                                    }
                                    className="px-2 py-1 border border-slate-200 rounded text-[10px]"
                                  />
                                  <input
                                    type="number"
                                    placeholder="SL kiểm"
                                    value={inspForm.inspectedQty}
                                    onChange={(e) =>
                                      setInspForm({ ...inspForm, inspectedQty: e.target.value })
                                    }
                                    className="px-2 py-1 border border-slate-200 rounded text-[10px]"
                                  />
                                  <input
                                    type="number"
                                    placeholder="SL đạt"
                                    value={inspForm.acceptedQty}
                                    onChange={(e) =>
                                      setInspForm({ ...inspForm, acceptedQty: e.target.value })
                                    }
                                    className="px-2 py-1 border border-slate-200 rounded text-[10px]"
                                  />
                                  <input
                                    type="number"
                                    placeholder="TL kiểm (kg)"
                                    value={inspForm.inspectedWeight}
                                    onChange={(e) =>
                                      setInspForm({
                                        ...inspForm,
                                        inspectedWeight: e.target.value,
                                      })
                                    }
                                    className="px-2 py-1 border border-slate-200 rounded text-[10px]"
                                  />
                                  <input
                                    type="number"
                                    placeholder="TL đạt (kg)"
                                    value={inspForm.acceptedWeight}
                                    onChange={(e) =>
                                      setInspForm({
                                        ...inspForm,
                                        acceptedWeight: e.target.value,
                                      })
                                    }
                                    className="px-2 py-1 border border-slate-200 rounded text-[10px]"
                                  />
                                  <select
                                    value={inspForm.result}
                                    onChange={(e) =>
                                      setInspForm({ ...inspForm, result: e.target.value })
                                    }
                                    className="px-2 py-1 border border-slate-200 rounded text-[10px]"
                                  >
                                    <option value="Pass">Đạt</option>
                                    <option value="Fail">Không đạt</option>
                                    <option value="Partial">Đạt một phần</option>
                                    <option value="Pending">Pending</option>
                                  </select>
                                  <input
                                    type="text"
                                    placeholder="Ghi chú"
                                    value={inspForm.remarks}
                                    onChange={(e) =>
                                      setInspForm({ ...inspForm, remarks: e.target.value })
                                    }
                                    className="px-2 py-1 border border-slate-200 rounded text-[10px]"
                                  />
                                </div>
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => setShowInspForm(null)}
                                    className="px-3 py-1 border border-slate-200 rounded text-[10px] font-bold text-slate-600"
                                  >
                                    Huỷ
                                  </button>
                                  <button
                                    onClick={() => submitInspection(a.id)}
                                    className="px-3 py-1 bg-[#1B365D] text-white rounded text-[10px] font-bold"
                                  >
                                    Lưu QC
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
