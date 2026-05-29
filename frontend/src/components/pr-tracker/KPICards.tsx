// ============================================================
// COMPONENT: KPICards.tsx
// 4 KPI thực tế khớp với CSV: Đủ / Thiếu / Thừa / Tỷ lệ hoàn thành
// ============================================================

'use client';

import type { PRDetail } from '@/types/procurement';

interface KPICardsProps {
  prs: PRDetail[];
}

function computeKPI(prs: PRDetail[]) {
  const total = prs.length;
  const sufficient = prs.filter((p) => p.materialStatus === 'Đủ').length;
  const short = prs.filter((p) => p.materialStatus === 'Thiếu').length;
  const excess = prs.filter((p) => p.materialStatus === 'Thừa').length;
  const hasDomestic = prs.filter((p) => p.domesticTotalQty > 0).length;
  const hasImport = prs.filter((p) => p.importTotalQty > 0).length;
  const completionRate = total ? Math.round(((sufficient + excess) / total) * 100) : 0;
  const shortRate = total ? Math.round((short / total) * 100) : 0;

  return { total, sufficient, short, excess, hasDomestic, hasImport, completionRate, shortRate };
}

interface KPICardProps {
  label: string;
  value: string;
  unit?: string;
  borderColor: string;
  sub: React.ReactNode;
  progressBar?: number; // 0-100
}

function KPICard({ label, value, unit, borderColor, sub, progressBar }: KPICardProps) {
  return (
    <div
      className="bg-surface-container-lowest p-6 rounded-xl border-l-4 shadow-sm"
      style={{ borderLeftColor: borderColor }}
    >
      <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
        {label}
      </p>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-black text-primary">{value}</span>
        {unit && <span className="text-sm font-medium text-on-surface-variant mb-1">{unit}</span>}
      </div>
      {progressBar !== undefined && (
        <div className="w-full bg-surface-container h-1.5 mt-3 rounded-full overflow-hidden">
          <div
            className="bg-blue-600 h-full transition-all duration-500"
            style={{ width: `${progressBar}%` }}
          />
        </div>
      )}
      <div className="mt-2 text-[10px] flex items-center font-bold">{sub}</div>
    </div>
  );
}

export function KPICards({ prs }: KPICardsProps) {
  const k = computeKPI(prs);
  const shortHigh = k.shortRate > 10;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      {/* 1. Tổng mã vật tư */}
      <KPICard
        label="Tổng Mã Vật Tư"
        value={String(k.total)}
        unit="Mã"
        borderColor="#1B365D"
        sub={
          <span className="text-slate-400 flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">layers</span>
            {k.hasDomestic} trong nước · {k.hasImport} nhập khẩu
          </span>
        }
      />

      {/* 2. Tỷ lệ đủ vật tư */}
      <KPICard
        label="Tỷ lệ Đủ Vật Tư"
        value={`${k.completionRate}%`}
        borderColor="#10b981"
        progressBar={k.completionRate}
        sub={
          <span className="text-emerald-600 flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">check_circle</span>
            {k.sufficient} Đủ · {k.excess} Thừa / {k.total}
          </span>
        }
      />

      {/* 3. Mã đang thiếu */}
      <KPICard
        label="Mã Đang Thiếu"
        value={String(k.short)}
        unit="Mã"
        borderColor="#ef4444"
        sub={
          <span
            className={`${shortHigh ? 'text-red-500' : 'text-slate-400'} flex items-center gap-1`}
          >
            <span className="material-symbols-outlined text-xs">
              {shortHigh ? 'error' : 'check'}
            </span>
            {shortHigh ? `${k.shortRate}% cần xử lý gấp` : 'Trong mức kiểm soát'}
          </span>
        }
      />

      {/* 4. Nguồn mua */}
      <KPICard
        label="Nguồn Cung Ứng"
        value={`${k.hasDomestic + k.hasImport}`}
        unit="Hợp đồng"
        borderColor="#f59e0b"
        sub={
          <span className="text-amber-600 flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">local_shipping</span>
            {k.hasDomestic} TN · {k.hasImport} NK
          </span>
        }
      />
    </div>
  );
}
