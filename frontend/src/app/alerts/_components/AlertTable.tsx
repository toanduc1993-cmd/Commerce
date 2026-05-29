'use client';

import { MarkResolvedButton } from './MarkResolvedButton';
import type { AlertRecord, Severity } from './types';

interface Props {
  data: AlertRecord[];
  loading: boolean;
  onChanged: () => void;
}

const SEVERITY_BADGE: Record<Severity, string> = {
  HIGH: 'badge-danger',
  MEDIUM: 'badge-warning',
  LOW: 'badge-info',
};

const FLAG_LABEL: Record<string, string> = {
  ORPHAN_INVOICE: 'Orphan Inv',
  CHƯA_XUẤT_HĐ: 'Chưa xuất HĐ',
  PQLDA_KHÔNG_INV: 'PQLDA chưa Inv',
};

function fmtMoney(v: number): string {
  if (!v) return '—';
  if (v >= 1e9) return `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} tr`;
  return v.toLocaleString('vi-VN');
}

export function AlertTable({ data, loading, onChanged }: Props) {
  if (loading) {
    return <div className="bg-white border rounded-lg p-6 text-center text-slate-500">Đang tải…</div>;
  }
  if (data.length === 0) {
    return (
      <div className="bg-white border rounded-lg p-8 text-center text-slate-500">
        <span className="material-symbols-outlined text-[36px] opacity-40 block mb-2">
          inbox
        </span>
        Không có alert khớp filter hiện tại.
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-meta">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Canonical key</th>
              <th className="px-3 py-2 text-left">Mức</th>
              <th className="px-3 py-2 text-left">Flag</th>
              <th className="px-3 py-2 text-right">BID dự toán</th>
              <th className="px-3 py-2 text-right">PQLDA</th>
              <th className="px-3 py-2 text-right">Invoice (n)</th>
              <th className="px-3 py-2 text-right">Δ PQLDA−Inv</th>
              <th className="px-3 py-2 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr
                key={r.canonical_key}
                className={`border-t ${r.resolved ? 'bg-slate-50/60 text-slate-500' : ''}`}
              >
                <td className="px-3 py-1.5 font-mono text-body">{r.canonical_key}</td>
                <td className="px-3 py-1.5">
                  <span className={`badge ${SEVERITY_BADGE[r.severity]}`}>{r.severity}</span>
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {r.flags.map((f) => (
                      <span
                        key={f}
                        className="badge badge-brand"
                        title={f}
                      >
                        {FLAG_LABEL[f] || f}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtMoney(r.bid_du_toan_vnd)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtMoney(r.pqlda_du_toan_vnd)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtMoney(r.invoice_thuc_xuat_vnd)}
                  {r.invoice_n > 0 && (
                    <span className="text-caption text-slate-400 ml-1">({r.invoice_n})</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  <span
                    className={r.delta_pqlda_vs_invoice_vnd < 0 ? 'text-[var(--color-danger)]' : ''}
                  >
                    {fmtMoney(r.delta_pqlda_vs_invoice_vnd)}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-center">
                  <MarkResolvedButton
                    canonicalKey={r.canonical_key}
                    resolved={r.resolved}
                    onChanged={onChanged}
                  />
                  {r.resolved && r.resolved_by && (
                    <div className="text-caption text-slate-400 mt-0.5">
                      {r.resolved_at ? new Date(r.resolved_at).toLocaleDateString('vi-VN') : ''}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card stack */}
      <div className="md:hidden divide-y">
        {data.map((r) => (
          <div key={r.canonical_key} className={`p-3 ${r.resolved ? 'bg-slate-50/60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-body">{r.canonical_key}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className={`badge ${SEVERITY_BADGE[r.severity]}`}>{r.severity}</span>
                  {r.flags.map((f) => (
                    <span key={f} className="badge badge-brand">
                      {FLAG_LABEL[f] || f}
                    </span>
                  ))}
                </div>
              </div>
              <MarkResolvedButton
                canonicalKey={r.canonical_key}
                resolved={r.resolved}
                onChanged={onChanged}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-caption">
              <div>
                <div className="label">BID</div>
                <div className="tabular-nums">{fmtMoney(r.bid_du_toan_vnd)}</div>
              </div>
              <div>
                <div className="label">PQLDA</div>
                <div className="tabular-nums">{fmtMoney(r.pqlda_du_toan_vnd)}</div>
              </div>
              <div>
                <div className="label">Invoice</div>
                <div className="tabular-nums">
                  {fmtMoney(r.invoice_thuc_xuat_vnd)}
                  {r.invoice_n > 0 && <span className="text-slate-400"> ({r.invoice_n})</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
