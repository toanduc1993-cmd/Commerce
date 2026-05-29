'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { fetchProjects, type ProjectRow } from '@/lib/api';
import { toast, Toaster } from 'react-hot-toast';

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: string }> = {
  active: {
    label: 'Đang thực hiện',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    icon: 'play_circle',
  },
  'on-hold': {
    label: 'Tạm dừng',
    cls: 'bg-amber-50 text-amber-700 border-amber-300',
    icon: 'pause_circle',
  },
  completed: {
    label: 'Hoàn thành',
    cls: 'bg-slate-100 text-slate-500 border-slate-300',
    icon: 'check_circle',
  },
};

const fmtNum = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'on-hold' | 'completed'>(
    'all'
  );

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchProjects();
        setProjects(data);
      } catch (err) {
        toast.error(`Lỗi tải dự án: ${err instanceof Error ? err.message : 'unknown'}`);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const filtered = projects.filter((p) => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.client && p.client.toLowerCase().includes(q))
    );
  });

  const totalItems = projects.reduce((s, p) => s + p.stats.itemCount, 0);
  const totalWeight = projects.reduce((s, p) => s + p.stats.totalWeight, 0);
  const totalPRs = projects.reduce((s, p) => s + p.stats.prCount, 0);
  const activeCount = projects.filter((p) => p.status === 'active').length;

  return (
    <div className="flex min-h-screen bg-[#f4f6fb]">
      <Toaster position="top-right" />
      <Sidebar />

      <div className="flex-1 ml-64 px-8 pt-8 pb-12 space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-black text-[#1B365D]">Thông Tin Dự Án</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Danh sách dự án và trạng thái mua sắm — dữ liệu real-time từ backend
            </p>
          </div>
          <input
            type="search"
            placeholder="Tìm mã, tên, khách hàng..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs w-64 focus:outline-none focus:border-[#1B365D]"
          />
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: 'Tổng dự án',
              value: projects.length,
              sub: `${activeCount} đang hoạt động`,
              icon: 'folder_open',
              color: '#1B365D',
            },
            {
              label: 'Tổng PR',
              value: totalPRs,
              sub: 'Yêu cầu mua hàng',
              icon: 'description',
              color: '#0d6efd',
            },
            {
              label: 'Mã vật tư',
              value: totalItems,
              sub: 'Tổng items',
              icon: 'inventory_2',
              color: '#198754',
            },
            {
              label: 'Tổng khối lượng',
              value: `${fmtNum(totalWeight / 1000)}T`,
              sub: 'Yêu cầu mua',
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
                <div className="text-[10px] text-slate-400 mt-0.5">{k.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2">
          {(
            [
              { k: 'all', l: 'Tất cả', count: projects.length },
              {
                k: 'active',
                l: 'Đang thực hiện',
                count: projects.filter((p) => p.status === 'active').length,
              },
              {
                k: 'on-hold',
                l: 'Tạm dừng',
                count: projects.filter((p) => p.status === 'on-hold').length,
              },
              {
                k: 'completed',
                l: 'Hoàn thành',
                count: projects.filter((p) => p.status === 'completed').length,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              onClick={() => setFilterStatus(t.k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                filterStatus === t.k
                  ? 'bg-[#1B365D] text-white border-[#1B365D]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-[#1B365D]'
              }`}
            >
              {t.l} <span className="opacity-60">({t.count})</span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-[#1B365D] text-white">
              <tr>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">
                  Mã dự án
                </th>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">
                  Tên dự án
                </th>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">
                  Khách hàng
                </th>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">
                  Ref No
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider">
                  Trạng thái
                </th>
                <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider">
                  PR
                </th>
                <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider">
                  Mã VT
                </th>
                <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider">
                  Hạng mục GC
                </th>
                <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider">
                  KL (T)
                </th>
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider">
                  Cập nhật
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-slate-400 text-xs">
                    <span className="material-symbols-outlined animate-spin text-[20px] align-middle mr-2">
                      progress_activity
                    </span>
                    Đang tải dữ liệu…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400 text-xs">
                    <span className="material-symbols-outlined text-[40px] block mx-auto opacity-30">
                      folder_off
                    </span>
                    Không có dự án nào khớp filter
                  </td>
                </tr>
              )}
              {filtered.map((p, idx) => {
                const status = STATUS_CONFIG[p.status] || STATUS_CONFIG['active'];
                return (
                  <tr
                    key={p.id}
                    className={`border-t border-slate-100 hover:bg-slate-50 ${idx % 2 ? 'bg-slate-50/30' : ''}`}
                  >
                    <td className="px-3 py-2 font-mono font-bold text-[#1B365D]">{p.code}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700">{p.name}</td>
                    <td className="px-3 py-2 text-slate-500">{p.client || '—'}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-400">
                      {p.refNo || '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${status.cls}`}
                      >
                        <span className="material-symbols-outlined text-[11px]">{status.icon}</span>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-slate-700">
                      {p.stats.prCount}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-slate-700">
                      {p.stats.itemCount}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500">
                      {p.stats.fabCategoryCount}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-[#0d6efd]">
                      {fmtNum(p.stats.totalWeight / 1000)}
                    </td>
                    <td className="px-3 py-2 text-center text-[10px] text-slate-400">
                      {new Date(p.updatedAt).toLocaleDateString('vi-VN')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
