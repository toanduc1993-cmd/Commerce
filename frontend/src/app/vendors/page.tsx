// ============================================================
// PAGE: /vendors — Vendor Master full CRUD
// ============================================================

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import {
  fetchVendorsMaster,
  fetchVendorMasterDetail,
  createVendorMaster,
  updateVendorMaster,
  deleteVendorMaster,
  seedVendorsFromHistory,
  type VendorMaster,
  type VendorMasterDetail,
} from '@/lib/api';
import { toast, Toaster } from 'react-hot-toast';

const fmtMoney = (v: number) => {
  if (v >= 1e9) return `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  return v.toLocaleString('vi-VN');
};

const EMPTY_FORM: Partial<VendorMaster> = {
  name: '',
  shortName: '',
  taxCode: '',
  address: '',
  city: '',
  country: 'Việt Nam',
  phone: '',
  email: '',
  website: '',
  contactName: '',
  contactTitle: '',
  contactPhone: '',
  contactEmail: '',
  categories: '',
  vendorType: 'DOMESTIC',
  rating: null,
  status: 'ACTIVE',
  notes: '',
};

export default function VendorsPage() {
  const [vendors, setVendors] = useState<VendorMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'DOMESTIC' | 'IMPORT' | 'MIXED'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'ACTIVE' | 'INACTIVE' | 'BLACKLIST'>(
    'ACTIVE'
  );

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<VendorMaster>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Detail drawer
  const [detail, setDetail] = useState<VendorMasterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchVendorsMaster();
      setVendors(data);
    } catch (err) {
      toast.error(`Lỗi tải NCC: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = vendors.filter((v) => {
    if (filterType !== 'all' && v.vendorType !== filterType) return false;
    if (filterStatus !== 'all' && v.status !== filterStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      (v.shortName || '').toLowerCase().includes(q) ||
      (v.taxCode || '').toLowerCase().includes(q)
    );
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (v: VendorMaster) => {
    setEditingId(v.id);
    setForm({ ...v });
    setShowForm(true);
  };

  const openDetail = async (v: VendorMaster) => {
    setDetailLoading(true);
    setDetail({ ...v, contracts: [] });
    try {
      const d = await fetchVendorMasterDetail(v.id);
      if (d) setDetail(d);
    } catch (err) {
      toast.error(`Lỗi tải chi tiết: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name?.trim()) {
      toast.error('Vui lòng nhập tên NCC');
      return;
    }
    setSaving(true);
    try {
      const r = editingId
        ? await updateVendorMaster(editingId, form)
        : await createVendorMaster(form);
      if (r.success) {
        toast.success(editingId ? 'Đã cập nhật NCC' : 'Đã tạo NCC mới');
        setShowForm(false);
        load();
      } else {
        toast.error(r.error || 'Lỗi không xác định');
      }
    } catch (err) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (v: VendorMaster, hard = false) => {
    const msg = hard
      ? `Xoá VĨNH VIỄN NCC "${v.name}"? Hành động này không thể hoàn tác.`
      : `Đưa NCC "${v.name}" vào trạng thái INACTIVE?`;
    if (!confirm(msg)) return;
    try {
      const r = await deleteVendorMaster(v.id, hard);
      if (r.success) {
        toast.success(hard ? 'Đã xoá vĩnh viễn' : 'Đã chuyển INACTIVE');
        setDetail(null);
        load();
      } else {
        toast.error(r.error || 'Lỗi xoá NCC');
      }
    } catch (err) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  };

  const handleSeed = async () => {
    if (!confirm('Auto-seed NCC từ hợp đồng & báo giá đã import?')) return;
    try {
      const r = await seedVendorsFromHistory();
      if (r.success) {
        toast.success(r.message || 'Seed thành công');
        load();
      } else {
        toast.error('Seed thất bại');
      }
    } catch (err) {
      toast.error(`Lỗi seed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  };

  const totalValue = vendors.reduce((s, v) => s + (v.stats?.totalValue || 0), 0);
  const totalContracts = vendors.reduce((s, v) => s + (v.stats?.contractCount || 0), 0);
  const importCount = vendors.filter((v) => v.vendorType === 'IMPORT').length;

  return (
    <div className="flex min-h-screen bg-[#f4f6fb]">
      <Toaster position="top-right" />
      <Sidebar />

      <div className="flex-1 ml-64 px-8 pt-8 pb-12 space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-black text-[#1B365D]">Nhà Cung Cấp</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Vendor Master — Quản lý thông tin NCC, MST, liên hệ, lịch sử giao dịch
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Tìm tên, MST..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs w-56 focus:outline-none focus:border-[#1B365D]"
            />
            <button
              onClick={handleSeed}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:border-[#1B365D] hover:text-[#1B365D] flex items-center gap-1.5"
              title="Auto-tạo NCC từ hợp đồng & báo giá đã import"
            >
              <span className="material-symbols-outlined text-[16px]">sync</span>
              Seed
            </button>
            <button
              onClick={openCreate}
              className="px-3 py-1.5 bg-[#1B365D] text-white rounded-lg text-xs font-bold hover:bg-[#0f2340] flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Thêm NCC
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: 'Tổng NCC',
              value: vendors.length,
              sub: `${importCount} nhập khẩu · ${vendors.length - importCount} trong nước`,
              icon: 'domain',
              color: '#1B365D',
            },
            {
              label: 'Đang hoạt động',
              value: vendors.filter((v) => v.status === 'ACTIVE').length,
              sub: 'Status ACTIVE',
              icon: 'check_circle',
              color: '#198754',
            },
            {
              label: 'Hợp đồng',
              value: totalContracts,
              sub: 'Đã & đang ký',
              icon: 'description',
              color: '#0d6efd',
            },
            {
              label: 'Tổng giá trị',
              value: fmtMoney(totalValue),
              sub: 'VND (chưa VAT)',
              icon: 'payments',
              color: '#fd7e14',
            },
          ].map((k) => (
            <div
              key={k.label}
              className="bg-white border-l-4 rounded-lg p-4 shadow-sm flex items-start gap-3"
              style={{ borderLeftColor: k.color }}
            >
              <span
                className="material-symbols-outlined text-[28px] shrink-0"
                style={{ color: k.color }}
              >
                {k.icon}
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
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
            {(
              [
                { k: 'all', l: 'Tất cả' },
                { k: 'DOMESTIC', l: 'Trong nước' },
                { k: 'IMPORT', l: 'Nhập khẩu' },
                { k: 'MIXED', l: 'Cả hai' },
              ] as const
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setFilterType(t.k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  filterType === t.k
                    ? 'bg-[#1B365D] text-white border-[#1B365D]'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-[#1B365D]'
                }`}
              >
                {t.l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {(
              [
                { k: 'ACTIVE', l: 'Active' },
                { k: 'INACTIVE', l: 'Inactive' },
                { k: 'BLACKLIST', l: 'Blacklist' },
                { k: 'all', l: 'Hiện tất cả' },
              ] as const
            ).map((s) => (
              <button
                key={s.k}
                onClick={() => setFilterStatus(s.k)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                  filterStatus === s.k
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-700'
                }`}
              >
                {s.l}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-[#1B365D] text-white">
              <tr>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider w-10">
                  #
                </th>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">
                  Tên NCC
                </th>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">
                  MST
                </th>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">
                  Liên hệ
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider">
                  Loại
                </th>
                <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider">
                  HĐ
                </th>
                <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider">
                  Tổng giá trị
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider">
                  Status
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400 text-xs">
                    <span className="material-symbols-outlined animate-spin text-[20px] align-middle mr-2">
                      progress_activity
                    </span>
                    Đang tải…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400 text-xs">
                    <span className="material-symbols-outlined text-[40px] block mx-auto opacity-30">
                      domain_disabled
                    </span>
                    Không tìm thấy NCC
                  </td>
                </tr>
              )}
              {filtered.map((v, idx) => (
                <tr
                  key={v.id}
                  onClick={() => openDetail(v)}
                  className={`border-t border-slate-100 hover:bg-blue-50/50 cursor-pointer ${
                    idx % 2 ? 'bg-slate-50/30' : ''
                  }`}
                >
                  <td className="px-3 py-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <div className="font-bold text-[#1B365D]">{v.name}</div>
                    {v.shortName && (
                      <div className="text-[9px] text-slate-400 mt-0.5">{v.shortName}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
                    {v.taxCode || '—'}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-slate-500">
                    {v.contactName || '—'}
                    {v.contactPhone && (
                      <div className="text-[9px] text-slate-400">{v.contactPhone}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        v.vendorType === 'IMPORT'
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-300'
                          : v.vendorType === 'MIXED'
                            ? 'bg-amber-50 text-amber-700 border border-amber-300'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                      }`}
                    >
                      {v.vendorType === 'IMPORT'
                        ? 'Nhập khẩu'
                        : v.vendorType === 'MIXED'
                          ? 'Cả hai'
                          : 'Trong nước'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-slate-700">
                    {v.stats?.contractCount || 0}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-[#0d6efd]">
                    {fmtMoney(v.stats?.totalValue || 0)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        v.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : v.status === 'BLACKLIST'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {v.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(v);
                        }}
                        className="p-1 rounded hover:bg-blue-100 text-blue-600"
                        title="Sửa"
                      >
                        <span className="material-symbols-outlined text-[14px]">edit</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(v, false);
                        }}
                        className="p-1 rounded hover:bg-amber-100 text-amber-600"
                        title="Chuyển INACTIVE"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          visibility_off
                        </span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(v, true);
                        }}
                        className="p-1 rounded hover:bg-red-100 text-red-600"
                        title="Xoá vĩnh viễn"
                      >
                        <span className="material-symbols-outlined text-[14px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Create/Edit Modal ──────────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[#1B365D] text-white px-6 py-3 flex items-center justify-between">
              <h2 className="text-sm font-black">
                {editingId ? 'Chỉnh sửa NCC' : 'Thêm NCC mới'}
              </h2>
              <button onClick={() => setShowForm(false)} className="hover:opacity-80">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Basic info */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                  Thông tin cơ bản
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Tên NCC *"
                    value={form.name || ''}
                    onChange={(v) => setForm({ ...form, name: v })}
                  />
                  <Field
                    label="Tên viết tắt"
                    value={form.shortName || ''}
                    onChange={(v) => setForm({ ...form, shortName: v })}
                  />
                  <Field
                    label="Mã số thuế (MST)"
                    value={form.taxCode || ''}
                    onChange={(v) => setForm({ ...form, taxCode: v })}
                  />
                  <Field
                    label="Mã code nội bộ"
                    value={form.code || ''}
                    onChange={(v) => setForm({ ...form, code: v })}
                  />
                  <div className="col-span-2">
                    <Field
                      label="Địa chỉ"
                      value={form.address || ''}
                      onChange={(v) => setForm({ ...form, address: v })}
                    />
                  </div>
                  <Field
                    label="Thành phố"
                    value={form.city || ''}
                    onChange={(v) => setForm({ ...form, city: v })}
                  />
                  <Field
                    label="Quốc gia"
                    value={form.country || ''}
                    onChange={(v) => setForm({ ...form, country: v })}
                  />
                  <Field
                    label="Điện thoại"
                    value={form.phone || ''}
                    onChange={(v) => setForm({ ...form, phone: v })}
                  />
                  <Field
                    label="Email"
                    value={form.email || ''}
                    onChange={(v) => setForm({ ...form, email: v })}
                  />
                  <div className="col-span-2">
                    <Field
                      label="Website"
                      value={form.website || ''}
                      onChange={(v) => setForm({ ...form, website: v })}
                    />
                  </div>
                </div>
              </div>

              {/* Contact person */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                  Người liên hệ
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Họ tên"
                    value={form.contactName || ''}
                    onChange={(v) => setForm({ ...form, contactName: v })}
                  />
                  <Field
                    label="Chức vụ"
                    value={form.contactTitle || ''}
                    onChange={(v) => setForm({ ...form, contactTitle: v })}
                  />
                  <Field
                    label="Điện thoại"
                    value={form.contactPhone || ''}
                    onChange={(v) => setForm({ ...form, contactPhone: v })}
                  />
                  <Field
                    label="Email"
                    value={form.contactEmail || ''}
                    onChange={(v) => setForm({ ...form, contactEmail: v })}
                  />
                </div>
              </div>

              {/* Classification */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                  Phân loại
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Loại NCC
                    </label>
                    <select
                      value={form.vendorType || 'DOMESTIC'}
                      onChange={(e) => setForm({ ...form, vendorType: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#1B365D]"
                    >
                      <option value="DOMESTIC">Trong nước</option>
                      <option value="IMPORT">Nhập khẩu</option>
                      <option value="MIXED">Cả hai</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Status
                    </label>
                    <select
                      value={form.status || 'ACTIVE'}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#1B365D]"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="BLACKLIST">Blacklist</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Rating (1-5)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={form.rating ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          rating: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#1B365D]"
                    />
                  </div>
                  <div className="col-span-3">
                    <Field
                      label="Ngành hàng cung cấp (phân cách bằng dấu phẩy)"
                      value={form.categories || ''}
                      onChange={(v) => setForm({ ...form, categories: v })}
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Ghi chú
                    </label>
                    <textarea
                      value={form.notes || ''}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#1B365D]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:border-slate-400"
              >
                Huỷ
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 bg-[#1B365D] text-white rounded-lg text-xs font-bold hover:bg-[#0f2340] disabled:opacity-50"
              >
                {saving ? 'Đang lưu…' : editingId ? 'Cập nhật' : 'Tạo mới'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Detail Drawer ──────────────────────────────────────────── */}
      {detail && (
        <div
          className="fixed inset-0 bg-black/40 z-[90] flex justify-end"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[#1B365D] text-white px-6 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black">{detail.name}</h2>
                {detail.shortName && (
                  <div className="text-[10px] opacity-70">{detail.shortName}</div>
                )}
              </div>
              <button onClick={() => setDetail(null)} className="hover:opacity-80">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <InfoRow label="MST" value={detail.taxCode} />
                <InfoRow label="Code" value={detail.code} />
                <InfoRow
                  label="Loại"
                  value={
                    detail.vendorType === 'IMPORT'
                      ? 'Nhập khẩu'
                      : detail.vendorType === 'MIXED'
                        ? 'Cả hai'
                        : 'Trong nước'
                  }
                />
                <InfoRow label="Status" value={detail.status} />
                <InfoRow label="Quốc gia" value={detail.country} />
                <InfoRow label="Thành phố" value={detail.city} />
                <div className="col-span-2">
                  <InfoRow label="Địa chỉ" value={detail.address} />
                </div>
                <InfoRow label="Điện thoại" value={detail.phone} />
                <InfoRow label="Email" value={detail.email} />
                <div className="col-span-2">
                  <InfoRow label="Website" value={detail.website} />
                </div>
                <InfoRow label="Liên hệ" value={detail.contactName} />
                <InfoRow label="Chức vụ" value={detail.contactTitle} />
                <InfoRow label="SĐT liên hệ" value={detail.contactPhone} />
                <InfoRow label="Email liên hệ" value={detail.contactEmail} />
                <div className="col-span-2">
                  <InfoRow label="Ngành hàng" value={detail.categories} />
                </div>
                {detail.notes && (
                  <div className="col-span-2">
                    <InfoRow label="Ghi chú" value={detail.notes} />
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-[9px] font-black uppercase text-blue-600 tracking-wider">
                    Số HĐ
                  </div>
                  <div className="text-xl font-black text-[#1B365D] mt-1">
                    {detail.stats?.contractCount || 0}
                  </div>
                </div>
                <div className="bg-orange-50 rounded-lg p-3">
                  <div className="text-[9px] font-black uppercase text-orange-600 tracking-wider">
                    Tổng giá trị
                  </div>
                  <div className="text-xl font-black text-[#1B365D] mt-1">
                    {fmtMoney(detail.stats?.totalValue || 0)}
                  </div>
                </div>
              </div>

              {/* Contract history */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                  Lịch sử giao dịch {detail.contracts.length > 0 && `(${detail.contracts.length})`}
                </div>
                {detailLoading ? (
                  <div className="text-center py-6 text-slate-400 text-xs">Đang tải…</div>
                ) : detail.contracts.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-lg">
                    Chưa có hợp đồng nào
                  </div>
                ) : (
                  <div className="bg-slate-50 rounded-lg overflow-hidden">
                    <table className="w-full text-[10px]">
                      <thead className="bg-slate-200 text-slate-600">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-black">HĐ</th>
                          <th className="px-2 py-1.5 text-left font-black">Ngày</th>
                          <th className="px-2 py-1.5 text-left font-black">Item</th>
                          <th className="px-2 py-1.5 text-right font-black">Giá trị</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.contracts.map((c) => (
                          <tr key={c.id} className="border-t border-slate-200">
                            <td className="px-2 py-1 font-mono font-bold text-[#1B365D]">
                              {c.contractNo || '—'}
                            </td>
                            <td className="px-2 py-1 text-slate-500">
                              {c.contractDate
                                ? new Date(c.contractDate).toLocaleDateString('vi-VN')
                                : '—'}
                            </td>
                            <td className="px-2 py-1 text-slate-600 truncate max-w-[200px]">
                              {c.prDetail?.itemName || c.prDetail?.itemCode || '—'}
                              {c.prDetail?.pr?.project?.code && (
                                <span className="text-slate-400 text-[9px] ml-1">
                                  [{c.prDetail.pr.project.code}]
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-right font-mono font-bold">
                              {fmtMoney(c.totalNoVAT || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  onClick={() => {
                    setDetail(null);
                    openEdit(detail);
                  }}
                  className="px-4 py-1.5 bg-[#1B365D] text-white rounded-lg text-xs font-bold hover:bg-[#0f2340]"
                >
                  Chỉnh sửa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#1B365D]"
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">{label}</div>
      <div className="text-slate-700 mt-0.5">{value || '—'}</div>
    </div>
  );
}
