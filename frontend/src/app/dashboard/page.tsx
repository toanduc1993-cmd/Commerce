'use client';

/**
 * /dashboard — Bảng Điều Khiển tổng hợp
 *
 * KPI từ /api/v1/dashboard/stats:
 *  - Số dự án / PR / mã VT / khối lượng
 *  - PO breakdown theo status
 *  - Top 5 vendors
 *  - Group breakdown VTC/VPK/VDK/...
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { fetchDashboardStats, type DashboardStats } from '@/lib/api';
import { toast, Toaster } from 'react-hot-toast';

const fmtNum = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
const fmtWeight = (v: number) =>
  `${(v / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}T`;
const fmtMoney = (v: number) => {
  if (v >= 1e9) return `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  return v.toLocaleString('vi-VN');
};

const PO_STATUS_LABEL: Record<string, string> = {
  ISSUED: 'Đã phát',
  PARTIAL_RECEIVED: 'Nhận một phần',
  FULLY_RECEIVED: 'Đã nhận đủ',
  CLOSED: 'Đã đóng',
  CANCELLED: 'Đã huỷ',
};

const PO_STATUS_COLOR: Record<string, string> = {
  ISSUED: '#0d6efd',
  PARTIAL_RECEIVED: '#fd7e14',
  FULLY_RECEIVED: '#198754',
  CLOSED: '#6c757d',
  CANCELLED: '#dc3545',
};

const GROUP_NAME: Record<string, string> = {
  VTC: 'Vật tư chính',
  VPK: 'Phụ kiện, bu lông',
  VDK: 'Vật tư đóng kiện',
  VBP: 'Vật tư biện pháp',
  VTH: 'Vật tư tiêu hao',
  VTS: 'Sơn & xử lý bề mặt',
  VTP: 'Vật tư dự phòng',
  OTHER: 'Khác',
};

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('ibshi_authed')) {
      router.push('/login');
      return;
    }
    (async () => {
      try {
        const data = await fetchDashboardStats();
        setStats(data);
      } catch (err) {
        toast.error(`Lỗi tải stats: ${err instanceof Error ? err.message : 'unknown'}`);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-[#f4f6fb]">
        <Sidebar />
        <div className="flex-1 ml-64 flex items-center justify-center text-slate-400">
          <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
          Đang tải dashboard…
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex min-h-screen bg-[#f4f6fb]">
        <Sidebar />
        <div className="flex-1 ml-64 flex flex-col items-center justify-center text-slate-400 gap-2">
          <span className="material-symbols-outlined text-[48px] opacity-30">warning</span>
          Không tải được dashboard stats — kiểm tra backend
        </div>
      </div>
    );
  }

  // Prepare data for charts
  const maxPOValue = Math.max(...stats.pos.breakdown.map((b) => b.totalValue), 1);
  const maxGroupWeight = Math.max(...stats.groupBreakdown.map((g) => g.requestedWeight), 1);
  const maxVendorValue = Math.max(...stats.topVendors.map((v) => v.value), 1);

  return (
    <div className="flex min-h-screen bg-[#f4f6fb]">
      <Toaster position="top-right" />
      <Sidebar />

      <div className="flex-1 ml-64 px-8 pt-8 pb-12 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-[#1B365D]">Bảng Điều Khiển</h1>
          <p className="text-xs text-slate-400 mt-1">
            Tổng hợp KPI thời gian thực · {new Date().toLocaleString('vi-VN')}
          </p>
        </div>

        {/* Top KPI cards (4) */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: 'Dự án',
              value: stats.projects.total,
              sub: `${stats.projects.active} đang hoạt động`,
              icon: 'folder_open',
              color: '#1B365D',
            },
            {
              label: 'Yêu cầu mua hàng',
              value: stats.prs.total,
              sub: `${fmtNum(stats.prs.items)} mã vật tư`,
              icon: 'description',
              color: '#0d6efd',
            },
            {
              label: 'Đơn đặt hàng',
              value: stats.pos.total,
              sub: `${stats.grns.total} phiếu nhập kho`,
              icon: 'shopping_cart',
              color: '#198754',
            },
            {
              label: 'Hợp đồng',
              value: stats.contracts.count,
              sub: `${fmtMoney(stats.contracts.totalNoVAT)} VND`,
              icon: 'handshake',
              color: '#fd7e14',
            },
          ].map((k) => (
            <div
              key={k.label}
              className="bg-white border-l-4 rounded-lg p-5 shadow-sm flex items-start gap-3"
              style={{ borderLeftColor: k.color }}
            >
              <span
                className="material-symbols-outlined text-[32px] shrink-0"
                style={{ color: k.color }}
              >
                {k.icon}
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {k.label}
                </div>
                <div className="text-3xl font-black text-[#1B365D] leading-tight mt-0.5">
                  {k.value}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{k.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Weight stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: 'KL yêu cầu',
              value: fmtWeight(stats.weights.requested),
              icon: 'request_quote',
              color: '#0d6efd',
              detail: `${fmtNum(stats.weights.requested)} kg`,
            },
            {
              label: 'KL net (sau tận dụng)',
              value: fmtWeight(stats.weights.net),
              icon: 'recycling',
              color: '#198754',
              detail: `${fmtNum(stats.weights.net)} kg`,
            },
            {
              label: 'KL cần mua',
              value: fmtWeight(stats.weights.toBuy),
              icon: 'shopping_bag',
              color: '#fd7e14',
              detail: `${fmtNum(stats.weights.toBuy)} kg`,
            },
          ].map((k) => (
            <div
              key={k.label}
              className="bg-white rounded-lg p-4 shadow-sm flex items-center gap-4"
            >
              <span className="material-symbols-outlined text-[36px]" style={{ color: k.color }}>
                {k.icon}
              </span>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {k.label}
                </div>
                <div className="text-2xl font-black text-[#1B365D] leading-tight mt-1">
                  {k.value}
                </div>
                <div className="text-[9px] text-slate-400">{k.detail}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 2 charts side-by-side */}
        <div className="grid grid-cols-2 gap-6">
          {/* PO Status Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-[#1B365D]">PO theo trạng thái</h2>
              <span className="text-[9px] text-slate-400">Bar chart</span>
            </div>
            {stats.pos.breakdown.length === 0 ? (
              <div className="text-center py-8 text-slate-300 text-xs">Chưa có PO nào</div>
            ) : (
              <div className="space-y-3">
                {stats.pos.breakdown.map((p) => {
                  const pct = (p.totalValue / maxPOValue) * 100;
                  return (
                    <div key={p.status}>
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="font-bold text-slate-600">
                          {PO_STATUS_LABEL[p.status] || p.status}
                          <span className="ml-1 text-slate-400">({p.count})</span>
                        </span>
                        <span className="font-mono font-bold text-[#1B365D]">
                          {fmtMoney(p.totalValue)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: PO_STATUS_COLOR[p.status] || '#6c757d',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Vendors */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-[#1B365D]">Top 5 nhà cung cấp</h2>
              <span className="text-[9px] text-slate-400">Theo giá trị HĐ</span>
            </div>
            {stats.topVendors.length === 0 ? (
              <div className="text-center py-8 text-slate-300 text-xs">Chưa có vendor nào</div>
            ) : (
              <div className="space-y-3">
                {stats.topVendors.map((v, idx) => {
                  const pct = (v.value / maxVendorValue) * 100;
                  return (
                    <div key={v.name}>
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="font-bold text-slate-600">
                          <span className="text-slate-400 mr-1">#{idx + 1}</span>
                          {v.name}
                        </span>
                        <span className="font-mono font-bold text-[#1B365D]">
                          {fmtMoney(v.value)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-[#1B365D] rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Group breakdown table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-black text-[#1B365D]">Phân bổ theo nhóm vật tư</h2>
            <span className="text-[9px] text-slate-400">
              Tổng {stats.groupBreakdown.reduce((s, g) => s + g.itemCount, 0)} mã vật tư
            </span>
          </div>
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">
                  Nhóm
                </th>
                <th className="px-4 py-2 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">
                  Tên
                </th>
                <th className="px-4 py-2 text-right text-[9px] font-black uppercase tracking-wider text-slate-500">
                  Số mã
                </th>
                <th className="px-4 py-2 text-right text-[9px] font-black uppercase tracking-wider text-slate-500">
                  KL yêu cầu
                </th>
                <th className="px-4 py-2 text-right text-[9px] font-black uppercase tracking-wider text-slate-500">
                  KL cần mua
                </th>
                <th className="px-4 py-2 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">
                  Tỉ trọng
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.groupBreakdown.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-300 text-xs">
                    Chưa có dữ liệu phân nhóm
                  </td>
                </tr>
              )}
              {stats.groupBreakdown.map((g) => {
                const pct = (g.requestedWeight / maxGroupWeight) * 100;
                return (
                  <tr key={g.groupCode} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#1B365D] text-white">
                        {g.groupCode}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {GROUP_NAME[g.groupCode] || g.groupCode}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-700">
                      {fmtNum(g.itemCount)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-[#0d6efd]">
                      {fmtWeight(g.requestedWeight)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-amber-700">
                      {fmtWeight(g.purchasedWeight)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#1B365D] to-[#0d6efd] rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
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
