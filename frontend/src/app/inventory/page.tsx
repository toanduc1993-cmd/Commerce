'use client';

/**
 * /inventory — Danh mục vật tư (read-only catalog)
 *
 * Track real-time inventory được thực hiện bởi ERP khác.
 * Module này chỉ làm catalog tra cứu mã vật tư từ PrDetail.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { fetchMaterialCatalog, type MaterialCatalogRow } from '@/lib/api';
import { toast, Toaster } from 'react-hot-toast';

const fmtNum = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

const GROUP_COLORS: Record<string, string> = {
  VTC: 'bg-blue-100 text-blue-800',
  VPK: 'bg-purple-100 text-purple-800',
  VDK: 'bg-amber-100 text-amber-800',
  VBP: 'bg-pink-100 text-pink-800',
  VTH: 'bg-cyan-100 text-cyan-800',
  VTS: 'bg-emerald-100 text-emerald-800',
  VTP: 'bg-slate-100 text-slate-800',
};

export default function InventoryPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<MaterialCatalogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');

  useEffect(() => {
    if (!localStorage.getItem('ibshi_authed')) {
      router.push('/login');
      return;
    }
    (async () => {
      try {
        const cat = await fetchMaterialCatalog();
        setCatalog(cat);
      } catch (err) {
        toast.error(`Lỗi tải catalog: ${err instanceof Error ? err.message : 'unknown'}`);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  const groups = Array.from(
    new Set(catalog.map((c) => c.materialGroupCode).filter(Boolean))
  ) as string[];

  const filtered = catalog.filter((c) => {
    if (groupFilter !== 'all' && c.materialGroupCode !== groupFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.itemCode.toLowerCase().includes(q) ||
      c.itemName.toLowerCase().includes(q) ||
      (c.profile && c.profile.toLowerCase().includes(q)) ||
      (c.grade && c.grade.toLowerCase().includes(q))
    );
  });

  const totalWeight = catalog.reduce((s, c) => s + (c.unitWeight || 0), 0);

  return (
    <div className="flex min-h-screen bg-[#f4f6fb]">
      <Toaster position="top-right" />
      <Sidebar />

      <div className="flex-1 ml-64 px-8 pt-8 pb-12 space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-black text-[#1B365D]">Danh Mục Vật Tư</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Master catalog vật tư — tra cứu mã, profile, mác, đơn trọng (read-only).
              Tồn kho real-time được quản lý ở ERP riêng.
            </p>
          </div>
          <input
            type="search"
            placeholder="Tìm mã, tên, profile, mác..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs w-72 focus:outline-none focus:border-[#1B365D]"
          />
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: 'Tổng mã VT',
              value: catalog.length,
              sub: 'Trong catalog',
              icon: 'inventory',
              color: '#1B365D',
            },
            {
              label: 'Số nhóm',
              value: groups.length,
              sub: 'Material groups',
              icon: 'category',
              color: '#0d6efd',
            },
            {
              label: 'Có profile',
              value: catalog.filter((c) => c.profile).length,
              sub: 'Đã định nghĩa profile',
              icon: 'straighten',
              color: '#198754',
            },
            {
              label: 'Có đơn trọng',
              value: catalog.filter((c) => c.unitWeight > 0).length,
              sub: `Trung bình: ${fmtNum(totalWeight / Math.max(1, catalog.length))} kg`,
              icon: 'scale',
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

        {/* Group filter */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setGroupFilter('all')}
            className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${
              groupFilter === 'all'
                ? 'bg-[#1B365D] text-white border-[#1B365D]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-[#1B365D]'
            }`}
          >
            Tất cả ({catalog.length})
          </button>
          {groups.map((g) => {
            const count = catalog.filter((c) => c.materialGroupCode === g).length;
            return (
              <button
                key={g}
                onClick={() => setGroupFilter(g)}
                className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${
                  groupFilter === g
                    ? 'bg-[#1B365D] text-white border-[#1B365D]'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-[#1B365D]'
                }`}
              >
                {g} ({count})
              </button>
            );
          })}
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
                  Mã VT
                </th>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">
                  Tên vật tư
                </th>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">
                  Profile
                </th>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">
                  Mác
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider">
                  ĐVT
                </th>
                <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider">
                  Đ.Trọng (kg)
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider">
                  Nhóm
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider">
                  Sub-group
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400 text-xs">
                    <span className="material-symbols-outlined animate-spin text-[20px] align-middle mr-2">
                      progress_activity
                    </span>
                    Đang tải catalog…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400 text-xs">
                    <span className="material-symbols-outlined text-[40px] block mx-auto opacity-30">
                      inventory
                    </span>
                    Không có vật tư nào phù hợp
                  </td>
                </tr>
              )}
              {filtered.map((c, idx) => (
                <tr
                  key={c.itemCode}
                  className={`border-t border-slate-100 hover:bg-slate-50 ${idx % 2 ? 'bg-slate-50/30' : ''}`}
                >
                  <td className="px-3 py-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                  <td className="px-3 py-2 font-mono font-bold text-[#1B365D]">{c.itemCode}</td>
                  <td className="px-3 py-2 text-slate-700">{c.itemName}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
                    {c.profile || '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] font-bold text-[#1B365D]">
                    {c.grade || '—'}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-500">{c.uom}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">
                    {c.unitWeight ? fmtNum(c.unitWeight) : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {c.materialGroupCode && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          GROUP_COLORS[c.materialGroupCode] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {c.materialGroupCode}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-[10px] text-slate-500 font-mono">
                    {c.materialSubGroupCode || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
