/**
 * workflowSteps.tsx — 11 bước workflow mua sắm với render cell đầy đủ
 *
 * Mỗi bước render 1 cell trong PRTable, hiển thị tất cả các trường dữ liệu
 * tương ứng từ ContractDetail / InspectionRecord / PrDetail.
 */

import type { ReactNode } from 'react';
import type { PRDetail, ContractDetail, InspectionRecord } from '@/types/procurement';

export type StepStatus = 'done' | 'active' | 'pending' | 'skipped' | 'warning';

export interface StepInfo {
  status: StepStatus;
  count?: number;
}

export interface WorkflowStepDef {
  key: string;
  label: string;
  shortLabel: string;
  icon: string;
  width: string; // Tailwind class
  getStatus: (pr: PRDetail) => StepInfo;
  renderCell: (pr: PRDetail) => ReactNode;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      })
    : '';

const fmtNum = (v?: number | null, dec = 0) =>
  v && v !== 0 ? v.toLocaleString('vi-VN', { maximumFractionDigits: dec }) : '';

const fmtMoney = (v?: number | null, currency = 'VND') => {
  if (!v) return '';
  if (currency === 'USD') return `$${(v / 1000).toFixed(0)}k`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}tỷ`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}tr`;
  return v.toLocaleString('vi-VN');
};

const getContracts = (pr: PRDetail): ContractDetail[] => (pr.contracts || []) as ContractDetail[];
const getInspections = (pr: PRDetail): InspectionRecord[] =>
  getContracts(pr).flatMap((c) => c.inspections || []);

// ─── STATUS COLORS ───────────────────────────────────────────────────────────

export const STEP_STATUS_STYLE: Record<StepStatus, { topBar: string; dot: string; text: string }> =
  {
    done: { topBar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700' },
    active: { topBar: 'bg-amber-400', dot: 'bg-amber-400', text: 'text-amber-700' },
    warning: { topBar: 'bg-red-500', dot: 'bg-red-500', text: 'text-red-700' },
    skipped: { topBar: 'bg-slate-300', dot: 'bg-slate-300', text: 'text-slate-400' },
    pending: { topBar: 'bg-slate-200', dot: 'bg-slate-200', text: 'text-slate-300' },
  };

// ─── COMMON RENDER COMPONENTS ────────────────────────────────────────────────

function EmptyCell() {
  return <div className="text-[8px] text-slate-300 italic text-center py-1">—</div>;
}

function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="text-[8.5px] leading-tight">
      <span className="text-slate-400">{label}: </span>
      <span className={`text-slate-700 font-semibold ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ─── STEP DEFINITIONS ────────────────────────────────────────────────────────

export const WORKFLOW_STEPS: WorkflowStepDef[] = [
  // ═══ Step 1: Tiếp nhận PR ═══
  {
    key: 'receive_pr',
    label: 'Tiếp nhận PR',
    shortLabel: 'PR',
    icon: 'request_quote',
    width: 'w-20 min-w-[80px]',
    getStatus: () => ({ status: 'done' }),
    renderCell: (pr) => (
      <div className="space-y-0.5">
        <Field label="SL" value={`${fmtNum(pr.reqQty, 2)} ${pr.uom}`} />
        <Field label="KL" value={`${fmtNum(pr.reqWeight, 0)} kg`} />
        {pr.pr?.createdAt && (
          <div className="text-[8px] text-slate-400">{fmtDate(pr.pr.createdAt)}</div>
        )}
      </div>
    ),
  },

  // ═══ Step 2: Gửi báo giá ═══
  {
    key: 'send_rfq',
    label: 'Gửi báo giá (RFQ)',
    shortLabel: 'RFQ',
    icon: 'send',
    width: 'w-16 min-w-[64px]',
    getStatus: (pr) => {
      const c = getContracts(pr);
      return c.length > 0 ? { status: 'done' } : { status: 'pending' };
    },
    renderCell: (pr) => {
      const c = getContracts(pr);
      if (c.length === 0) return <EmptyCell />;
      const vendors = Array.from(new Set(c.map((x) => x.vendorName).filter(Boolean)));
      return (
        <div className="space-y-0.5">
          <div className="text-[8.5px] font-bold text-emerald-700">{vendors.length} NCC</div>
          <div className="text-[8px] text-slate-500 leading-tight">
            {vendors.slice(0, 2).join(', ')}
          </div>
        </div>
      );
    },
  },

  // ═══ Step 3: Nhận báo giá ═══
  {
    key: 'receive_quote',
    label: 'Nhận báo giá',
    shortLabel: 'BG',
    icon: 'inbox',
    width: 'w-16 min-w-[64px]',
    getStatus: (pr) => {
      const c = getContracts(pr);
      return c.length > 0 ? { status: 'done', count: c.length } : { status: 'pending' };
    },
    renderCell: (pr) => {
      const c = getContracts(pr);
      if (c.length === 0) return <EmptyCell />;
      return (
        <div className="space-y-0.5">
          <div className="text-[8.5px] font-bold text-emerald-700">{c.length} báo giá</div>
          {c.slice(0, 2).map((ct) => (
            <div
              key={ct.id}
              className="text-[8px] text-slate-500 truncate"
              title={ct.vendorName || ''}
            >
              · {ct.vendorName}
            </div>
          ))}
        </div>
      );
    },
  },

  // ═══ Step 4: So sánh báo giá ═══
  {
    key: 'compare_quote',
    label: 'So sánh báo giá',
    shortLabel: 'SS',
    icon: 'compare_arrows',
    width: 'w-16 min-w-[64px]',
    getStatus: (pr) => {
      const c = getContracts(pr);
      if (c.length === 0) return { status: 'pending' };
      if (c.some((x) => x.contractDate)) return { status: 'done' };
      return { status: 'active' };
    },
    renderCell: (pr) => {
      const c = getContracts(pr);
      if (c.length === 0) return <EmptyCell />;
      const winner = c.find((x) => x.contractDate);
      const minPrice = Math.min(...c.map((x) => x.unitPriceNoVAT || Infinity));
      return (
        <div className="space-y-0.5">
          {winner ? (
            <>
              <div className="text-[8.5px] font-bold text-emerald-700">✓ Đã chọn</div>
              <div className="text-[8px] text-slate-600 truncate">{winner.vendorName}</div>
            </>
          ) : (
            <div className="text-[8px] text-amber-600">Đang so sánh</div>
          )}
          {minPrice !== Infinity && (
            <div className="text-[8px] text-slate-500 font-mono">Min: {fmtMoney(minPrice)}</div>
          )}
        </div>
      );
    },
  },

  // ═══ Step 5: Làm rõ kỹ thuật ═══
  {
    key: 'tech_clarify',
    label: 'Làm rõ kỹ thuật',
    shortLabel: 'KT',
    icon: 'help_outline',
    width: 'w-24 min-w-[96px]',
    getStatus: (pr) => {
      const c = getContracts(pr);
      const mismatch = c.some(
        (x) =>
          (x.actualProfile && x.actualProfile !== pr.profile) ||
          (x.actualGrade && x.actualGrade !== pr.grade)
      );
      if (mismatch) return { status: 'warning' };
      if (c.length > 0) return { status: 'done' };
      return { status: 'pending' };
    },
    renderCell: (pr) => {
      const c = getContracts(pr);
      const mismatch = c.find(
        (x) =>
          (x.actualProfile && x.actualProfile !== pr.profile) ||
          (x.actualGrade && x.actualGrade !== pr.grade)
      );
      if (!mismatch) {
        if (c.length > 0)
          return <div className="text-[8px] text-emerald-600 text-center">✓ Khớp</div>;
        return <EmptyCell />;
      }
      return (
        <div className="space-y-0.5 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
          <div className="text-[8px] font-bold text-amber-700">⚠ Khác PR</div>
          {mismatch.actualProfile && (
            <div
              className="text-[8px] text-slate-700 font-mono truncate"
              title={mismatch.actualProfile}
            >
              {mismatch.actualProfile}
            </div>
          )}
        </div>
      );
    },
  },

  // ═══ Step 6: Chuyển đổi vật tư ═══
  {
    key: 'material_swap',
    label: 'Chuyển đổi vật tư',
    shortLabel: 'CĐ',
    icon: 'swap_horiz',
    width: 'w-24 min-w-[96px]',
    getStatus: (pr) => {
      if (pr.remarks && /chuyển\s*đổi/i.test(pr.remarks)) return { status: 'warning' };
      const c = getContracts(pr);
      const swap = c.some((x) => x.actualProfile && x.actualProfile !== pr.profile);
      if (swap) return { status: 'done' };
      return { status: 'skipped' };
    },
    renderCell: (pr) => {
      const c = getContracts(pr);
      const swap = c.find((x) => x.actualProfile && x.actualProfile !== pr.profile);
      if (!swap && !pr.remarks) return <EmptyCell />;
      return (
        <div className="space-y-0.5">
          {swap && (
            <>
              <div className="text-[8px] text-slate-400 truncate" title={pr.profile}>
                Gốc: {pr.profile}
              </div>
              <div
                className="text-[8px] text-emerald-700 font-semibold truncate"
                title={swap.actualProfile || ''}
              >
                → {swap.actualProfile}
              </div>
            </>
          )}
          {pr.remarks && /chuyển\s*đổi/i.test(pr.remarks) && (
            <div className="text-[7.5px] text-amber-700 italic truncate" title={pr.remarks}>
              {pr.remarks}
            </div>
          )}
        </div>
      );
    },
  },

  // ═══ Step 7: Ký hợp đồng (FULL DATA) ═══
  {
    key: 'sign_contract',
    label: 'Ký hợp đồng',
    shortLabel: 'HĐ',
    icon: 'description',
    width: 'w-52 min-w-[208px]',
    getStatus: (pr) => {
      const c = getContracts(pr);
      const signed = c.filter((x) => x.contractNo && x.contractDate);
      if (signed.length === 0) return { status: 'pending' };
      return { status: 'done', count: signed.length };
    },
    renderCell: (pr) => {
      const contracts = getContracts(pr).filter((c) => c.contractNo);
      if (contracts.length === 0) return <EmptyCell />;
      return (
        <div className="space-y-1">
          {contracts.map((c) => (
            <div
              key={c.id}
              className={`p-1 rounded border ${
                c.contractType === 'DOMESTIC'
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-indigo-50 border-indigo-200'
              }`}
            >
              <div className="flex items-baseline gap-1">
                <span
                  className={`px-1 py-0 text-[7px] font-black rounded ${
                    c.contractType === 'DOMESTIC'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 text-white'
                  }`}
                >
                  {c.contractType === 'DOMESTIC' ? 'TN' : 'NK'}
                </span>
                <span
                  className="text-[8.5px] font-mono font-bold text-[#1B365D] truncate"
                  title={c.contractNo || ''}
                >
                  {c.contractNo}
                </span>
              </div>
              <div className="text-[8px] text-slate-700 font-bold truncate mt-0.5">
                {c.vendorName || '—'}
              </div>
              <div className="grid grid-cols-2 gap-x-1 text-[7.5px] text-slate-600 mt-0.5">
                <div>Ngày: {fmtDate(c.contractDate)}</div>
                <div>SL: {fmtNum(c.contractQty, 1)}</div>
                <div className="font-mono">ĐG: {fmtMoney(c.unitPriceNoVAT, c.currency)}</div>
                <div>VAT: {c.vatRate}%</div>
                <div className="col-span-2 font-mono font-bold text-emerald-700">
                  Tổng: {fmtMoney(c.totalNoVAT, c.currency)}
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    },
  },

  // ═══ Step 8: Giao hàng (FULL DATA) ═══
  {
    key: 'delivery',
    label: 'Giao hàng',
    shortLabel: 'GH',
    icon: 'local_shipping',
    width: 'w-44 min-w-[176px]',
    getStatus: (pr) => {
      const c = getContracts(pr);
      if (c.length === 0) return { status: 'pending' };
      const totalDel = c.reduce((s, x) => s + (x.deliveredQty || 0), 0);
      if (totalDel >= pr.reqQty * 0.99) return { status: 'done' };
      if (totalDel > 0) return { status: 'warning' };
      return { status: 'active' };
    },
    renderCell: (pr) => {
      const contracts = getContracts(pr);
      if (contracts.length === 0) return <EmptyCell />;
      return (
        <div className="space-y-1">
          {contracts.map((c) => {
            const isImp = c.contractType === 'IMPORT';
            const hasData =
              (c.deliveredQty || 0) > 0 || c.arrivedDate || c.cifDate || c.importLCDate;
            if (!hasData) return null;
            return (
              <div
                key={c.id}
                className={`p-1 rounded border ${
                  isImp ? 'bg-indigo-50 border-indigo-200' : 'bg-emerald-50 border-emerald-200'
                }`}
              >
                <div className="text-[7px] font-black uppercase tracking-wider opacity-60">
                  {isImp ? 'NHẬP KHẨU' : 'TRONG NƯỚC'}
                </div>
                {(c.deliveredQty || 0) > 0 && (
                  <div className="text-[8px] font-bold text-slate-700">
                    SL giao: {fmtNum(c.deliveredQty, 1)} {pr.uom}
                  </div>
                )}
                {(c.deliveredWeight || 0) > 0 && (
                  <div className="text-[8px] text-slate-600">
                    KL: {fmtNum(c.deliveredWeight, 0)} kg
                  </div>
                )}
                {isImp && (
                  <div className="grid grid-cols-1 gap-0 text-[7.5px] text-slate-600 mt-0.5">
                    {c.importLCDate && <div>LC: {fmtDate(c.importLCDate)}</div>}
                    {c.exportPort && (
                      <div className="truncate" title={c.exportPort}>
                        Cảng: {c.exportPort}
                      </div>
                    )}
                    {c.cifDate && <div>CIF: {fmtDate(c.cifDate)}</div>}
                    {c.customsDate && <div>HQ: {fmtDate(c.customsDate)}</div>}
                    {c.arrivedDate && (
                      <div className="font-bold text-indigo-700">Về: {fmtDate(c.arrivedDate)}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    },
  },

  // ═══ Step 9: Nghiệm thu QC ═══
  {
    key: 'qc_inspection',
    label: 'Nghiệm thu QC',
    shortLabel: 'QC',
    icon: 'verified',
    width: 'w-36 min-w-[144px]',
    getStatus: (pr) => {
      const ins = getInspections(pr);
      if (ins.length === 0) {
        return getContracts(pr).length > 0 ? { status: 'pending' } : { status: 'pending' };
      }
      const fail = ins.some((i) => /fail|không\s*đạt/i.test(i.result || ''));
      if (fail) return { status: 'warning' };
      const pass = ins.some((i) => /pass|đạt|ok/i.test(i.result || ''));
      if (pass) return { status: 'done', count: pass ? ins.length : undefined };
      return { status: 'active' };
    },
    renderCell: (pr) => {
      const inspections = getInspections(pr);
      if (inspections.length === 0) return <EmptyCell />;
      return (
        <div className="space-y-1">
          {inspections.map((ins) => {
            const isPass = /pass|đạt|ok/i.test(ins.result || '');
            const isFail = /fail|không\s*đạt/i.test(ins.result || '');
            return (
              <div
                key={ins.id}
                className={`p-1 rounded border text-[8px] ${
                  isPass
                    ? 'bg-emerald-50 border-emerald-200'
                    : isFail
                      ? 'bg-red-50 border-red-200'
                      : 'bg-amber-50 border-amber-200'
                }`}
              >
                {ins.reportNo && (
                  <div className="font-mono font-bold text-[#1B365D] truncate" title={ins.reportNo}>
                    📋 {ins.reportNo}
                  </div>
                )}
                {ins.inspectionDate && (
                  <div className="text-slate-600">{fmtDate(ins.inspectionDate)}</div>
                )}
                <div className="text-slate-600">
                  KL đạt: <strong>{fmtNum(ins.acceptedWeight, 0)}kg</strong>
                </div>
                {ins.result && (
                  <div
                    className={`font-bold ${
                      isPass ? 'text-emerald-700' : isFail ? 'text-red-700' : 'text-amber-700'
                    }`}
                  >
                    {ins.result}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    },
  },

  // ═══ Step 10: Bàn giao sản xuất ═══
  {
    key: 'handover_prod',
    label: 'Bàn giao sản xuất',
    shortLabel: 'BGSX',
    icon: 'precision_manufacturing',
    width: 'w-20 min-w-[80px]',
    getStatus: (pr) => {
      const c = getContracts(pr);
      if (c.some((x) => x.handoverToProductDate)) return { status: 'done' };
      return { status: 'pending' };
    },
    renderCell: (pr) => {
      const handovers = getContracts(pr).filter((c) => c.handoverToProductDate);
      if (handovers.length === 0) return <EmptyCell />;
      return (
        <div className="space-y-0.5">
          {handovers.map((c) => (
            <div
              key={c.id}
              className="text-[8px] bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200"
            >
              <div className="text-[7px] text-slate-400">
                {c.contractType === 'DOMESTIC' ? 'TN' : 'NK'}
              </div>
              <div className="font-bold text-emerald-700">{fmtDate(c.handoverToProductDate)}</div>
            </div>
          ))}
        </div>
      );
    },
  },

  // ═══ Step 11: Thanh toán ═══
  {
    key: 'payment',
    label: 'Thanh toán',
    shortLabel: 'TT',
    icon: 'payments',
    width: 'w-24 min-w-[96px]',
    getStatus: (pr) => {
      const c = getContracts(pr);
      if (c.length === 0) return { status: 'pending' };
      const paid = c.filter((x) => x.paymentDate);
      if (paid.length === 0) return { status: 'pending' };
      if (paid.length === c.length) return { status: 'done' };
      return { status: 'warning' };
    },
    renderCell: (pr) => {
      const contracts = getContracts(pr);
      if (contracts.length === 0) return <EmptyCell />;
      const totalAmt = contracts.reduce((s, c) => s + (c.totalNoVAT || 0), 0);
      const paid = contracts.filter((c) => c.paymentDate);
      const paidAmt = paid.reduce((s, c) => s + (c.totalNoVAT || 0), 0);
      return (
        <div className="space-y-0.5">
          <div className="text-[8px] text-slate-500">
            Tổng: <span className="font-mono font-bold">{fmtMoney(totalAmt)}</span>
          </div>
          {paid.length > 0 ? (
            <>
              <div className="text-[8px] font-bold text-emerald-700">✓ {fmtMoney(paidAmt)}</div>
              {paid[0].paymentDate && (
                <div className="text-[8px] text-slate-500">{fmtDate(paid[0].paymentDate)}</div>
              )}
            </>
          ) : (
            <div className="text-[8px] text-amber-600">Chưa TT</div>
          )}
        </div>
      );
    },
  },
];
