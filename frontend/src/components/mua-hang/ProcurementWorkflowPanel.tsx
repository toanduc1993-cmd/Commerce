'use client';

/**
 * ProcurementWorkflowPanel — Hiển thị 11-step workflow cho 1 PrDetail
 *
 * Steps:
 *   1. Tiếp nhận yêu cầu (PR)
 *   2. Gửi báo giá (RFQ)
 *   3. Tiếp nhận báo giá
 *   4. So sánh báo giá
 *   5. Làm rõ kỹ thuật
 *   6. Chuyển đổi vật tư
 *   7. Ký hợp đồng (DOM/IMP)
 *   8. Giao hàng (LC, CIF, Arrived)
 *   9. Nghiệm thu QC
 *  10. Bàn giao sản xuất
 *  11. Thanh toán
 *
 * Mỗi bước hiện trạng thái + chi tiết (vendor, số HĐ, ngày, giá trị)
 */

import type { PRDetail, ContractDetail, InspectionRecord } from '@/types/procurement';

const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

const fmtMoney = (v: number, currency = 'VND') => {
  if (!v) return '—';
  if (currency === 'USD') return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (v >= 1e9) return `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  return v.toLocaleString('vi-VN');
};

const fmtNum = (v: number, dec = 2) =>
  v ? v.toLocaleString('vi-VN', { maximumFractionDigits: dec }) : '—';

interface StepProps {
  num: number;
  title: string;
  status: 'done' | 'active' | 'pending' | 'skipped';
  date?: string;
  children?: React.ReactNode;
}

function Step({ num, title, status, date, children }: StepProps) {
  const cfg = {
    done: {
      bg: 'bg-emerald-500',
      text: 'text-white',
      border: 'border-emerald-500',
      dotBg: 'bg-emerald-500',
      icon: 'check',
    },
    active: {
      bg: 'bg-amber-100',
      text: 'text-amber-700',
      border: 'border-amber-500',
      dotBg: 'bg-amber-500',
      icon: 'pending',
    },
    pending: {
      bg: 'bg-slate-100',
      text: 'text-slate-400',
      border: 'border-slate-300',
      dotBg: 'bg-slate-300',
      icon: 'circle',
    },
    skipped: {
      bg: 'bg-slate-50',
      text: 'text-slate-300',
      border: 'border-slate-200',
      dotBg: 'bg-slate-200',
      icon: 'remove',
    },
  }[status];

  return (
    <div className="flex gap-3">
      {/* Step number circle */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-7 h-7 rounded-full ${cfg.dotBg} flex items-center justify-center text-white text-[10px] font-black shadow-sm`}
        >
          {status === 'done' ? (
            <span className="material-symbols-outlined text-[14px]">check</span>
          ) : (
            num
          )}
        </div>
        <div
          className={`flex-1 w-0.5 ${status === 'done' ? 'bg-emerald-300' : 'bg-slate-200'} mt-1`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 pb-3">
        <div className="flex items-baseline gap-2">
          <div
            className={`text-[10px] font-bold ${status === 'pending' ? 'text-slate-400' : 'text-[#1B365D]'}`}
          >
            {title}
          </div>
          {date && <div className="text-[9px] text-slate-400">{fmtDate(date)}</div>}
        </div>
        {children && <div className="mt-1">{children}</div>}
      </div>
    </div>
  );
}

interface ProcurementWorkflowPanelProps {
  pr: PRDetail;
}

export function ProcurementWorkflowPanel({ pr }: ProcurementWorkflowPanelProps) {
  const contracts = (pr.contracts || []) as ContractDetail[];
  const domContracts = contracts.filter((c) => c.contractType === 'DOMESTIC');
  const impContracts = contracts.filter((c) => c.contractType === 'IMPORT');
  const allInspections: InspectionRecord[] = contracts.flatMap((c) => c.inspections || []);

  // Workflow status calculation
  const hasContract = contracts.length > 0;
  const hasDelivery = contracts.some((c) => (c.deliveredQty || 0) > 0 || c.arrivedDate);
  const hasInspection = allInspections.length > 0;
  const hasInspectionPass = allInspections.some((i) => /pass|đạt|ok/i.test(i.result || ''));
  const hasHandoverProd = contracts.some((c) => c.handoverToProductDate);
  const hasPayment = contracts.some((c) => c.paymentDate);

  // Step status helpers
  const stepStatus = (cond: boolean, prevDone = true): StepProps['status'] => {
    if (cond) return 'done';
    if (prevDone) return 'active';
    return 'pending';
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 rounded-lg border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-[18px] text-[#1B365D]">timeline</span>
        <div className="text-xs font-black text-[#1B365D]">QUY TRÌNH MUA SẮM — {pr.itemCode}</div>
        <div className="text-[9px] text-slate-400 ml-auto">{pr.itemName}</div>
      </div>

      {/* ─── 11-step timeline ───────────────────────────────────── */}
      <div>
        {/* Step 1: Tiếp nhận PR */}
        <Step num={1} title="Tiếp nhận yêu cầu (PR)" status="done" date={pr.pr?.createdAt}>
          <div className="text-[10px] text-slate-600">
            <span className="font-mono font-bold">{pr.itemCode}</span> · SL yêu cầu:{' '}
            <strong>
              {fmtNum(pr.reqQty)} {pr.uom}
            </strong>{' '}
            · KL: <strong>{fmtNum(pr.reqWeight, 0)} kg</strong>
            {pr.profile && <span className="ml-2 text-slate-400">· Profile: {pr.profile}</span>}
            {pr.grade && <span className="ml-2 text-slate-400">· Mác: {pr.grade}</span>}
          </div>
        </Step>

        {/* Step 2: Gửi báo giá (RFQ) */}
        <Step num={2} title="Gửi báo giá (RFQ)" status={stepStatus(hasContract)}>
          <div className="text-[10px] text-slate-500">
            {hasContract
              ? 'Đã gửi yêu cầu báo giá đến nhà cung cấp'
              : 'Chưa gửi RFQ — nhấn "Phát RFQ" trong workflow'}
          </div>
        </Step>

        {/* Step 3: Tiếp nhận báo giá */}
        <Step num={3} title="Tiếp nhận báo giá" status={stepStatus(hasContract)}>
          <div className="text-[10px] text-slate-500">
            {hasContract ? `${contracts.length} báo giá đã nhận` : 'Chưa có báo giá'}
          </div>
        </Step>

        {/* Step 4: So sánh báo giá */}
        <Step num={4} title="So sánh báo giá" status={stepStatus(hasContract)}>
          <div className="text-[10px] text-slate-500">
            {hasContract ? 'Đã so sánh giá / vendor / điều khoản' : '—'}
          </div>
        </Step>

        {/* Step 5: Làm rõ kỹ thuật */}
        <Step
          num={5}
          title="Làm rõ kỹ thuật"
          status={stepStatus(
            contracts.some(
              (c) =>
                (c.actualProfile && c.actualProfile !== pr.profile) ||
                (c.actualGrade && c.actualGrade !== pr.grade)
            ),
            hasContract
          )}
        >
          {contracts.some((c) => c.actualProfile && c.actualProfile !== pr.profile) && (
            <div className="text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 inline-block">
              ⚠️ Spec thực tế khác PR — cần làm rõ
            </div>
          )}
        </Step>

        {/* Step 6: Chuyển đổi vật tư */}
        <Step
          num={6}
          title="Chuyển đổi vật tư"
          status={stepStatus(!!pr.remarks?.includes('chuyển đổi'), hasContract)}
        >
          {pr.remarks && (
            <div className="text-[10px] text-slate-600 italic">&ldquo;{pr.remarks}&rdquo;</div>
          )}
        </Step>

        {/* Step 7: Ký hợp đồng */}
        <Step
          num={7}
          title={`Ký hợp đồng${hasContract ? ` (${contracts.length})` : ''}`}
          status={stepStatus(hasContract)}
        >
          <div className="space-y-1.5">
            {domContracts.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded p-2">
                <div className="text-[9px] font-black text-emerald-700 uppercase tracking-wider">
                  Hợp đồng trong nước (DOM) — {domContracts.length}
                </div>
                {domContracts.map((c) => (
                  <div
                    key={c.id}
                    className="text-[10px] text-slate-700 mt-1 grid grid-cols-2 gap-x-3"
                  >
                    <div>
                      <span className="font-bold">📄 {c.contractNo || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">NCC:</span>{' '}
                      <strong className="text-[#1B365D]">{c.vendorName || '—'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Ngày ký:</span> {fmtDate(c.contractDate)}
                    </div>
                    <div>
                      <span className="text-slate-400">SL HĐ:</span>{' '}
                      <strong>
                        {fmtNum(c.contractQty)} {pr.uom}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Đơn giá:</span>{' '}
                      <strong>{fmtMoney(c.unitPriceNoVAT, c.currency)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Tổng tiền:</span>{' '}
                      <strong className="text-emerald-700">
                        {fmtMoney(c.totalNoVAT, c.currency)}
                      </strong>{' '}
                      <span className="text-slate-400">(chưa VAT {c.vatRate}%)</span>
                    </div>
                    {c.actualProfile && c.actualProfile !== pr.profile && (
                      <div className="col-span-2 text-amber-700">
                        ⚠️ Spec HĐ: <em>{c.actualProfile}</em>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {impContracts.length > 0 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded p-2">
                <div className="text-[9px] font-black text-indigo-700 uppercase tracking-wider">
                  Hợp đồng nhập khẩu (IMP) — {impContracts.length}
                </div>
                {impContracts.map((c) => (
                  <div
                    key={c.id}
                    className="text-[10px] text-slate-700 mt-1 grid grid-cols-2 gap-x-3"
                  >
                    <div>
                      <span className="font-bold">📄 {c.contractNo || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">NCC:</span>{' '}
                      <strong className="text-[#1B365D]">{c.vendorName || '—'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Cảng xuất:</span> {c.exportPort || '—'}
                    </div>
                    <div>
                      <span className="text-slate-400">Ngày ký:</span> {fmtDate(c.contractDate)}
                    </div>
                    <div>
                      <span className="text-slate-400">Đơn giá:</span>{' '}
                      <strong>{fmtMoney(c.unitPriceNoVAT, c.currency)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Tổng tiền:</span>{' '}
                      <strong className="text-indigo-700">
                        {fmtMoney(c.totalNoVAT, c.currency)}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Step>

        {/* Step 8: Giao hàng */}
        <Step num={8} title="Giao hàng / Vận chuyển" status={stepStatus(hasDelivery, hasContract)}>
          <div className="space-y-1">
            {contracts.map((c) => (
              <div key={`delivery-${c.id}`} className="text-[10px] text-slate-600">
                {c.contractType === 'IMPORT' && (
                  <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 bg-white px-2 py-1 rounded border border-slate-100">
                    {c.importLCDate && (
                      <div>
                        <span className="text-slate-400">LC:</span> {fmtDate(c.importLCDate)}
                      </div>
                    )}
                    {c.cifDate && (
                      <div>
                        <span className="text-slate-400">CIF:</span> {fmtDate(c.cifDate)}
                      </div>
                    )}
                    {c.customsDate && (
                      <div>
                        <span className="text-slate-400">Hải quan:</span> {fmtDate(c.customsDate)}
                      </div>
                    )}
                    {c.arrivedDate && (
                      <div>
                        <span className="text-slate-400">Hàng về:</span>{' '}
                        <strong>{fmtDate(c.arrivedDate)}</strong>
                      </div>
                    )}
                    {(c.deliveredQty || 0) > 0 && (
                      <div className="col-span-3">
                        <span className="text-slate-400">SL giao:</span>{' '}
                        <strong>
                          {fmtNum(c.deliveredQty || 0)} {pr.uom}
                        </strong>
                        {' / '}
                        <strong>{fmtNum(c.deliveredWeight || 0, 0)} kg</strong>
                      </div>
                    )}
                  </div>
                )}
                {c.contractType === 'DOMESTIC' && (c.deliveredQty || 0) > 0 && (
                  <div className="bg-white px-2 py-1 rounded border border-slate-100">
                    <span className="text-slate-400">SL giao thực tế:</span>{' '}
                    <strong>
                      {fmtNum(c.deliveredQty || 0)} {pr.uom}
                    </strong>{' '}
                    · <strong>{fmtNum(c.deliveredWeight || 0, 0)} kg</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Step>

        {/* Step 9: Nghiệm thu QC */}
        <Step
          num={9}
          title={`Nghiệm thu QC${hasInspection ? ` (${allInspections.length})` : ''}`}
          status={hasInspectionPass ? 'done' : stepStatus(hasInspection, hasDelivery)}
        >
          {allInspections.length === 0 && (
            <div className="text-[10px] text-slate-400">Chưa có biên bản nghiệm thu</div>
          )}
          {allInspections.map((ins) => (
            <div
              key={ins.id}
              className="text-[10px] text-slate-700 grid grid-cols-2 gap-x-3 bg-white px-2 py-1 rounded border border-slate-100 mt-1"
            >
              <div>
                <span className="font-bold">📋 {ins.reportNo || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400">Ngày KT:</span> {fmtDate(ins.inspectionDate)}
              </div>
              <div>
                <span className="text-slate-400">SL kiểm:</span>{' '}
                <strong>{fmtNum(ins.inspectedQty)}</strong>
              </div>
              <div>
                <span className="text-slate-400">KL đạt:</span>{' '}
                <strong>{fmtNum(ins.acceptedWeight, 0)} kg</strong>
              </div>
              {ins.result && (
                <div className="col-span-2">
                  <span className="text-slate-400">Kết quả:</span>{' '}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      /pass|đạt|ok/i.test(ins.result)
                        ? 'bg-emerald-100 text-emerald-700'
                        : /fail|không đạt/i.test(ins.result)
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {ins.result}
                  </span>
                </div>
              )}
            </div>
          ))}
        </Step>

        {/* Step 10: Bàn giao sản xuất */}
        <Step
          num={10}
          title="Bàn giao sản xuất"
          status={stepStatus(hasHandoverProd, hasInspectionPass)}
          date={contracts.find((c) => c.handoverToProductDate)?.handoverToProductDate}
        >
          {hasHandoverProd && (
            <div className="text-[10px] text-emerald-700">✓ Đã bàn giao vật tư cho sản xuất</div>
          )}
        </Step>

        {/* Step 11: Thanh toán */}
        <Step
          num={11}
          title="Thanh toán"
          status={stepStatus(hasPayment, hasHandoverProd)}
          date={contracts.find((c) => c.paymentDate)?.paymentDate}
        >
          {hasPayment ? (
            <div className="text-[10px] text-emerald-700">
              ✓ Đã thanh toán {fmtMoney(contracts.reduce((s, c) => s + (c.totalNoVAT || 0), 0))}
            </div>
          ) : (
            <div className="text-[10px] text-slate-500">
              Tổng giá trị:{' '}
              <strong>{fmtMoney(contracts.reduce((s, c) => s + (c.totalNoVAT || 0), 0))}</strong>{' '}
              (chưa thanh toán)
            </div>
          )}
        </Step>
      </div>
    </div>
  );
}
