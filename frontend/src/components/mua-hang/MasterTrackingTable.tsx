'use client';

/**
 * MasterTrackingTable — Bảng "Theo Dõi Vật Tư Dự Án"
 *
 * Layout 1:1 với sheet master tracking trong file mẫu Excel
 * (vd: '25-VPI-I-095' sheet 119 cols × 680 rows).
 *
 * 12 cụm cột chính:
 *   ┌─ A. Đánh giá ─┐ ┌─ B. Item info ─┐ ┌─ C. Net Qty ─┐
 *   ┌─ D. REVs (lần dự trù) ─┐ ┌─ E. Total Ordered + Remarks ─┐
 *   ┌─ F. Tận dụng tồn kho ─┐ ┌─ G. KL phải mua sắm ─┐
 *   ┌─ H. VẬT TƯ TRONG NƯỚC (DOM contract — 13 cols) ─┐
 *   ┌─ I. ĐÃ MUA TRONG NƯỚC + QC ─┐
 *   ┌─ J. MUA SẮM NƯỚC NGOÀI (IMP contract — 18 cols) ─┐
 *   ┌─ K. ĐÃ MUA NHẬP KHẨU + QC ─┐
 *   ┌─ L. TỔNG ĐÃ MUA + So sánh + Đánh giá cuối ─┐
 */

import React, { useMemo, useState } from 'react';
import type { PRDetail, ContractDetail, InspectionRecord } from '@/types/procurement';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmtNum = (v?: number | null, dec = 2) =>
  v && v !== 0 ? v.toLocaleString('vi-VN', { maximumFractionDigits: dec }) : '';
const fmtNum0 = (v?: number | null) => fmtNum(v, 0);
const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '';
const fmtMoney = (v?: number | null) => {
  if (!v) return '';
  if (v >= 1e9) return (v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
  if (v >= 1e6) return (v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' tr';
  return v.toLocaleString('vi-VN');
};

const getContracts = (pr: PRDetail): ContractDetail[] =>
  ((pr.contracts || []) as ContractDetail[]) ?? [];
const getDOM = (pr: PRDetail) => getContracts(pr).filter((c) => c.contractType === 'DOMESTIC');
const getIMP = (pr: PRDetail) => getContracts(pr).filter((c) => c.contractType === 'IMPORT');
const getInspections = (contracts: ContractDetail[]): InspectionRecord[] =>
  contracts.flatMap((c) => c.inspections || []);

// Sum helpers
const sumQty = (arr: { contractQty?: number; deliveredQty?: number }[]) =>
  arr.reduce((s, c) => s + (c.deliveredQty || c.contractQty || 0), 0);
const sumWeight = (arr: { contractWeight?: number; deliveredWeight?: number }[]) =>
  arr.reduce((s, c) => s + (c.deliveredWeight || c.contractWeight || 0), 0);
const sumNoVAT = (arr: { totalNoVAT?: number }[]) =>
  arr.reduce((s, c) => s + (c.totalNoVAT || 0), 0);

// ─── STYLES ──────────────────────────────────────────────────────────────────

// Group header colors
const G = {
  eval: 'bg-[#7a5c2e] text-white',
  item: 'bg-[#1B365D] text-white',
  netQty: 'bg-[#1e4976] text-white',
  rev: 'bg-[#37547a] text-white',
  total: 'bg-[#0d2b4e] text-white',
  remain: 'bg-[#5b21b6] text-white',
  toBuy: 'bg-[#7c3aed] text-white',
  domContract: 'bg-[#047857] text-white',
  domPurchased: 'bg-[#059669] text-white',
  domQC: 'bg-[#0d9488] text-white',
  impContract: 'bg-[#1d3f6b] text-white',
  impPurchased: 'bg-[#3730a3] text-white',
  impQC: 'bg-[#5b21b6] text-white',
  totalBought: 'bg-[#0d2b4e] text-white',
  diff: 'bg-[#7c2d12] text-white',
  evalEnd: 'bg-[#7a5c2e] text-white',
};

// Cell base classes
const TD = 'border border-slate-300 text-right text-[9px] font-mono px-1 py-0.5 whitespace-nowrap';
const TD_TEXT = 'border border-slate-300 text-left text-[9px] px-1 py-0.5';
const TD_CENTER = 'border border-slate-300 text-center text-[9px] px-1 py-0.5';
const TD_DATE = 'border border-slate-300 text-center text-[8.5px] px-1 py-0.5';

const TH = (color: string) =>
  `border border-slate-400 px-1 py-1 text-center text-[8.5px] font-black whitespace-nowrap ${color}`;
const TH2 =
  'border border-slate-400 px-1 py-0.5 text-center text-[7.5px] font-bold bg-[#2a5298] text-white whitespace-nowrap';

// ─── COMPONENT ───────────────────────────────────────────────────────────────

interface MasterTrackingTableProps {
  prs: PRDetail[];
  isLoading?: boolean;
}

export function MasterTrackingTable({ prs, isLoading }: MasterTrackingTableProps) {
  // Tự động detect số lần REVs từ data — mặc định show 5 lần (toggle để xem hết)
  const [showAllRevs, setShowAllRevs] = useState(false);
  const REV_COUNT = showAllRevs ? 16 : 5;

  // Group PR theo materialSubGroupCode (VTC01, VTC02, VPK, VDK)
  const grouped = useMemo(() => {
    const m = new Map<string, PRDetail[]>();
    for (const pr of prs) {
      const code = pr.materialSubGroupCode || pr.materialGroupCode || 'OTHER';
      if (!m.has(code)) m.set(code, []);
      m.get(code)!.push(pr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [prs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
        Đang tải dữ liệu...
      </div>
    );
  }
  if (prs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
        <span className="material-symbols-outlined text-[48px] opacity-30">inventory_2</span>
        <div className="text-sm">Chưa có dữ liệu — upload PR để bắt đầu</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b border-slate-200 bg-white px-4 py-2 flex items-center gap-3 shrink-0">
        <span className="text-sm font-bold text-[#1B365D]">Bảng Theo Dõi Vật Tư</span>
        <span className="text-xs text-slate-400">{prs.length} mã vật tư</span>
        <button
          onClick={() => setShowAllRevs((v) => !v)}
          className={`ml-auto flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition-all ${
            showAllRevs
              ? 'bg-[#1B365D] text-white border-[#1B365D]'
              : 'bg-white border-slate-300 text-slate-600 hover:border-[#1B365D]'
          }`}
        >
          <span className="material-symbols-outlined text-[12px]">layers</span>
          {showAllRevs ? 'Thu gọn 5 REV' : 'Xem hết 16 REV'}
        </button>
      </div>

      {/* Table area — scroll horizontal + vertical */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="border-collapse text-[9px]" style={{ minWidth: 'max-content' }}>
          <thead className="sticky top-0 z-30">
            {/* ═══ ROW 1: Group headers ═══ */}
            <tr>
              {/* Đánh giá đầu */}
              <th rowSpan={2} className={`${TH(G.eval)} sticky left-0 z-40 w-16 min-w-[64px]`}>
                Đánh giá
                <br />
                (Đầu)
              </th>

              {/* Item info — sticky */}
              <th rowSpan={2} className={`${TH(G.item)} sticky left-16 z-40 w-20 min-w-[80px]`}>
                Item/
                <br />
                STT
              </th>
              <th rowSpan={2} className={`${TH(G.item)} sticky left-36 z-40 w-44 min-w-[180px]`}>
                Description/
                <br />
                Chi tiết
              </th>
              <th rowSpan={2} className={`${TH(G.item)} w-32 min-w-[128px]`}>
                Profile/
                <br />
                Vật tư
              </th>
              <th rowSpan={2} className={`${TH(G.item)} w-24 min-w-[96px]`}>
                Grade/
                <br />
                Mác vật liệu
              </th>
              <th rowSpan={2} className={`${TH(G.item)} w-12 min-w-[48px]`}>
                Unit/
                <br />
                ĐVT
              </th>
              <th rowSpan={2} className={`${TH(G.item)} w-16 min-w-[64px]`}>
                U.Weight
                <br />
                (kg/m²,m,pcs)
              </th>

              {/* Net Quantity */}
              <th colSpan={2} className={TH(G.netQty)}>
                Net Quantity/
                <br />
                Số lượng tinh
              </th>

              {/* REVs */}
              <th colSpan={REV_COUNT * 2} className={TH(G.rev)}>
                Current Ordered/
                <br />
                Dự trù lần 0 → {REV_COUNT - 1}
              </th>

              {/* Total Ordered */}
              <th colSpan={2} className={TH(G.total)}>
                Total Ordered/
                <br />
                Tổng dự trù
              </th>

              {/* Remarks */}
              <th rowSpan={2} className={`${TH(G.total)} w-20 min-w-[80px]`}>
                Remarks/
                <br />
                Ghi chú
              </th>

              {/* Tận dụng tồn kho */}
              <th colSpan={5} className={TH(G.remain)}>
                Tận dụng tồn kho/
                <br />
                Remain Stock
              </th>

              {/* KL phải mua */}
              <th colSpan={2} className={TH(G.toBuy)}>
                Khối lượng phải mua sắm/
                <br />
                Total order
              </th>

              {/* Material handover date */}
              <th rowSpan={2} className={`${TH(G.toBuy)} w-16 min-w-[64px]`}>
                Material
                <br />
                Available
                <br />
                Date
              </th>

              {/* DOMESTIC contract */}
              <th colSpan={13} className={TH(G.domContract)}>
                VẬT TƯ TRONG NƯỚC/
                <br />
                Domestic Contract
              </th>

              {/* DOM purchased */}
              <th colSpan={2} className={TH(G.domPurchased)}>
                ĐÃ MUA
                <br />
                TRONG NƯỚC
              </th>

              {/* DOM QC */}
              <th colSpan={4} className={TH(G.domQC)}>
                QC Nghiệm thu
                <br />
                (DOM)
              </th>

              {/* IMPORT contract */}
              <th colSpan={18} className={TH(G.impContract)}>
                MUA SẮM NƯỚC NGOÀI/
                <br />
                Import Contract
              </th>

              {/* IMP purchased */}
              <th colSpan={2} className={TH(G.impPurchased)}>
                ĐÃ MUA
                <br />
                NHẬP KHẨU
              </th>

              {/* IMP QC */}
              <th colSpan={4} className={TH(G.impQC)}>
                Nghiệm thu
                <br />
                (IMP)
              </th>

              {/* Total Bought */}
              <th colSpan={2} className={TH(G.totalBought)}>
                TỔNG ĐÃ MUA
                <br />
                (DOM + IMP)
              </th>

              {/* Diff vs PR */}
              <th colSpan={2} className={TH(G.diff)}>
                So sánh
                <br />
                với PR
              </th>

              {/* Đánh giá cuối */}
              <th rowSpan={2} className={`${TH(G.evalEnd)} w-14 min-w-[56px]`}>
                Đánh giá
                <br />
                (Cuối)
              </th>

              {/* Remarks cuối */}
              <th rowSpan={2} className={`${TH(G.evalEnd)} w-20 min-w-[80px]`}>
                Remarks/
                <br />
                Ghi chú
              </th>
            </tr>

            {/* ═══ ROW 2: Sub-headers ═══ */}
            <tr>
              {/* Net Qty */}
              <th className={TH2}>Q.Ty</th>
              <th className={TH2}>Weight (Kg)</th>

              {/* REVs — Q.Ty + Weight pairs */}
              {Array.from({ length: REV_COUNT }).map((_, i) => (
                <React.Fragment key={`rev${i}`}>
                  <th className={TH2}>
                    Lần {i}
                    <br />
                    Q.Ty
                  </th>
                  <th className={TH2}>
                    Lần {i}
                    <br />
                    Weight
                  </th>
                </React.Fragment>
              ))}

              {/* Total Ordered */}
              <th className={TH2}>Q.Ty</th>
              <th className={TH2}>Weight (Kg)</th>

              {/* Tận dụng tồn kho */}
              <th className={TH2}>Report No</th>
              <th className={TH2}>Q.Ty</th>
              <th className={TH2}>Weight (Kg)</th>
              <th className={TH2}>Ngày ACC</th>
              <th className={TH2}>Remarks</th>

              {/* KL phải mua */}
              <th className={TH2}>Q.Ty</th>
              <th className={TH2}>Weight (Kg)</th>

              {/* DOM contract sub-headers (13 cols) */}
              <th className={TH2}>Số HĐ</th>
              <th className={TH2}>NCC</th>
              <th className={TH2}>Profile HĐ</th>
              <th className={TH2}>Grade HĐ</th>
              <th className={TH2}>KL theo HĐ</th>
              <th className={TH2}>Ngày ký</th>
              <th className={TH2}>Handover Q.Ty</th>
              <th className={TH2}>Handover Weight</th>
              <th className={TH2}>Đơn giá (chưa VAT)</th>
              <th className={TH2}>Tổng cả VAT</th>
              <th className={TH2}>%VAT</th>
              <th className={TH2}>Tổng chưa VAT</th>
              <th className={TH2}>BG sản xuất</th>

              {/* DOM purchased */}
              <th className={TH2}>Q.Ty</th>
              <th className={TH2}>Weight</th>

              {/* DOM QC */}
              <th className={TH2}>Report No</th>
              <th className={TH2}>Insp Date</th>
              <th className={TH2}>KL Acc</th>
              <th className={TH2}>Result</th>

              {/* IMP contract (18 cols) */}
              <th className={TH2}>Số HĐ</th>
              <th className={TH2}>NCC</th>
              <th className={TH2}>Profile HĐ</th>
              <th className={TH2}>Grade HĐ</th>
              <th className={TH2}>KL HĐ</th>
              <th className={TH2}>Ngày ký</th>
              <th className={TH2}>Handover Q.Ty</th>
              <th className={TH2}>Handover Weight</th>
              <th className={TH2}>Đơn giá (USD)</th>
              <th className={TH2}>Total HĐ</th>
              <th className={TH2}>Ngày mở L/C</th>
              <th className={TH2}>Cảng xuất</th>
              <th className={TH2}>CIF Hải Phòng</th>
              <th className={TH2}>Ngày thanh toán</th>
              <th className={TH2}>Hải quan</th>
              <th className={TH2}>Ngày hàng về</th>
              <th className={TH2}>Mời QC</th>
              <th className={TH2}>BG sản xuất</th>

              {/* IMP purchased */}
              <th className={TH2}>Q.Ty</th>
              <th className={TH2}>Weight</th>

              {/* IMP QC */}
              <th className={TH2}>Report No</th>
              <th className={TH2}>Insp Date</th>
              <th className={TH2}>KL Acc</th>
              <th className={TH2}>Result</th>

              {/* Total Bought */}
              <th className={TH2}>Q.Ty</th>
              <th className={TH2}>Weight</th>

              {/* Diff vs PR */}
              <th className={TH2}>Diff Q.Ty</th>
              <th className={TH2}>Diff Weight</th>
            </tr>
          </thead>

          <tbody>
            {grouped.map(([code, items]) => {
              const sample = items[0];
              const groupName = sample.materialSubGroupName || sample.materialGroupName || code;
              return (
                <React.Fragment key={code}>
                  {/* Group header row */}
                  <tr>
                    <td
                      colSpan={100}
                      className="bg-[#dbeafe] border border-slate-400 px-3 py-1 text-[10px] font-black text-[#1B365D] sticky left-0"
                    >
                      {code} — {groupName}
                      <span className="ml-3 text-[9px] font-normal text-slate-500">
                        ({items.length} mã vật tư)
                      </span>
                    </td>
                  </tr>

                  {/* Item rows */}
                  {items.map((pr, idx) => {
                    const dom = getDOM(pr);
                    const imp = getIMP(pr);
                    const domInsp = getInspections(dom);
                    const impInsp = getInspections(imp);
                    const domTotalQty = sumQty(dom);
                    const domTotalWt = sumWeight(dom);
                    const domTotalVAT = dom.reduce((s, c) => s + (c.totalWithVAT || 0), 0);
                    const domTotalNoVAT = sumNoVAT(dom);
                    const impTotalQty = sumQty(imp);
                    const impTotalWt = sumWeight(imp);
                    const impTotal = sumNoVAT(imp);
                    const grandQty = domTotalQty + impTotalQty;
                    const grandWt = domTotalWt + impTotalWt;
                    const diffQty = grandQty - (pr.reqQty || 0);
                    const diffWt = grandWt - (pr.reqWeight || 0);
                    const evaluation =
                      diffQty < -0.5 ? 'Thiếu' : diffQty > 0.5 ? 'Thừa' : grandQty > 0 ? 'Đủ' : '';
                    const evalCls =
                      evaluation === 'Đủ'
                        ? 'bg-emerald-100 text-emerald-700 font-bold'
                        : evaluation === 'Thiếu'
                          ? 'bg-red-100 text-red-700 font-bold'
                          : evaluation === 'Thừa'
                            ? 'bg-amber-100 text-amber-700 font-bold'
                            : 'text-slate-300';

                    // Take first contract of each type for display
                    const dom1 = dom[0];
                    const imp1 = imp[0];
                    const domI1 = domInsp[0];
                    const impI1 = impInsp[0];

                    const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40';

                    return (
                      <tr key={pr.id} className={`${rowBg} hover:bg-blue-50/30`}>
                        {/* Đánh giá đầu — alias của cuối */}
                        <td className={`${TD_CENTER} sticky left-0 z-10 ${rowBg} ${evalCls}`}>
                          {evaluation || '—'}
                        </td>

                        {/* Item/STT */}
                        <td
                          className={`${TD_TEXT} sticky left-16 z-10 ${rowBg} font-mono font-bold text-[#1B365D]`}
                          title={pr.itemCode}
                        >
                          <div className="truncate max-w-[78px]">{pr.itemCode}</div>
                        </td>

                        {/* Description */}
                        <td
                          className={`${TD_TEXT} sticky left-36 z-10 ${rowBg}`}
                          title={pr.itemName}
                        >
                          <div className="truncate max-w-[170px]">{pr.itemName}</div>
                        </td>

                        {/* Profile */}
                        <td className={`${TD_TEXT} font-mono`} title={pr.profile}>
                          <div className="truncate max-w-[120px]">{pr.profile || ''}</div>
                        </td>

                        {/* Grade */}
                        <td className={`${TD_TEXT} font-mono font-bold text-[#1B365D]`}>
                          <div className="truncate max-w-[88px]">{pr.grade || ''}</div>
                        </td>

                        {/* Unit */}
                        <td className={TD_CENTER}>{pr.uom || ''}</td>

                        {/* U.Weight */}
                        <td className={TD}>{fmtNum(pr.unitWeight, 3)}</td>

                        {/* Net Quantity */}
                        <td className={`${TD} font-semibold text-slate-800`}>
                          {fmtNum(pr.netQty)}
                        </td>
                        <td className={`${TD} text-slate-600`}>{fmtNum0(pr.netWeight)}</td>

                        {/* REVs (16 lần × 2 cols = 32) — chưa có data từ DB nên để trống */}
                        {Array.from({ length: REV_COUNT }).map((_, i) => (
                          <React.Fragment key={`rev${i}`}>
                            <td className={`${TD} text-slate-300`}>—</td>
                            <td className={`${TD} text-slate-300`}>—</td>
                          </React.Fragment>
                        ))}

                        {/* Total Ordered */}
                        <td className={`${TD} font-bold text-[#0d2b4e]`}>{fmtNum(pr.reqQty)}</td>
                        <td className={`${TD} font-bold text-[#0d2b4e]`}>
                          {fmtNum0(pr.reqWeight)}
                        </td>

                        {/* Remarks */}
                        <td className={`${TD_TEXT} text-[8px] text-slate-500`} title={pr.remarks}>
                          <div className="truncate max-w-[78px]">{pr.remarks || ''}</div>
                        </td>

                        {/* Tận dụng tồn kho — placeholder, schema chưa có */}
                        <td className={TD_TEXT}></td>
                        <td className={`${TD} text-violet-700`}>
                          {pr.remainQty ? fmtNum(pr.remainQty) : ''}
                        </td>
                        <td className={`${TD} text-violet-700`}>
                          {pr.remainWeight ? fmtNum0(pr.remainWeight) : ''}
                        </td>
                        <td className={TD_DATE}></td>
                        <td className={TD_TEXT}></td>

                        {/* KL phải mua */}
                        <td className={`${TD} text-violet-700`}>
                          {pr.toBuyQty ? fmtNum(pr.toBuyQty) : ''}
                        </td>
                        <td className={`${TD} text-violet-700`}>
                          {pr.toBuyWeight ? fmtNum0(pr.toBuyWeight) : ''}
                        </td>

                        {/* Material available date */}
                        <td className={TD_DATE}></td>

                        {/* DOMESTIC CONTRACT 13 cols */}
                        <td
                          className={`${TD_TEXT} font-mono text-emerald-700`}
                          title={dom1?.contractNo || ''}
                        >
                          <div className="truncate max-w-[100px]">{dom1?.contractNo || ''}</div>
                        </td>
                        <td
                          className={`${TD_TEXT} font-bold text-emerald-700`}
                          title={dom1?.vendorName || ''}
                        >
                          <div className="truncate max-w-[100px]">{dom1?.vendorName || ''}</div>
                        </td>
                        <td
                          className={`${TD_TEXT} font-mono text-[8px]`}
                          title={dom1?.actualProfile || ''}
                        >
                          <div className="truncate max-w-[100px]">{dom1?.actualProfile || ''}</div>
                        </td>
                        <td className={`${TD_TEXT} font-mono text-[8px]`}>
                          <div className="truncate max-w-[80px]">{dom1?.actualGrade || ''}</div>
                        </td>
                        <td className={TD}>{fmtNum0(dom1?.contractWeight)}</td>
                        <td className={TD_DATE}>{fmtDate(dom1?.contractDate)}</td>
                        <td className={TD}>{fmtNum(dom1?.deliveredQty)}</td>
                        <td className={TD}>{fmtNum0(dom1?.deliveredWeight)}</td>
                        <td className={TD}>{fmtMoney(dom1?.unitPriceNoVAT)}</td>
                        <td className={`${TD} text-emerald-700`}>{fmtMoney(dom1?.totalWithVAT)}</td>
                        <td className={TD}>{dom1?.vatRate ? `${dom1.vatRate}%` : ''}</td>
                        <td className={`${TD} font-bold text-emerald-700`}>
                          {fmtMoney(dom1?.totalNoVAT)}
                        </td>
                        <td className={TD_DATE}>{fmtDate(dom1?.handoverToProductDate)}</td>

                        {/* DOM purchased (aggregate of all DOM contracts) */}
                        <td className={`${TD} font-bold text-emerald-700`}>
                          {fmtNum(domTotalQty)}
                        </td>
                        <td className={`${TD} font-bold text-emerald-700`}>
                          {fmtNum0(domTotalWt)}
                        </td>

                        {/* DOM QC */}
                        <td className={`${TD_TEXT} font-mono text-[8px]`}>
                          <div className="truncate max-w-[80px]">{domI1?.reportNo || ''}</div>
                        </td>
                        <td className={TD_DATE}>{fmtDate(domI1?.inspectionDate)}</td>
                        <td className={TD}>{fmtNum0(domI1?.acceptedWeight)}</td>
                        <td className={TD_CENTER}>
                          {domI1?.result && (
                            <span
                              className={`px-1 rounded text-[8px] font-bold ${
                                /pass|đạt/i.test(domI1.result)
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {domI1.result}
                            </span>
                          )}
                        </td>

                        {/* IMPORT CONTRACT 18 cols */}
                        <td
                          className={`${TD_TEXT} font-mono text-indigo-700`}
                          title={imp1?.contractNo || ''}
                        >
                          <div className="truncate max-w-[100px]">{imp1?.contractNo || ''}</div>
                        </td>
                        <td
                          className={`${TD_TEXT} font-bold text-indigo-700`}
                          title={imp1?.vendorName || ''}
                        >
                          <div className="truncate max-w-[100px]">{imp1?.vendorName || ''}</div>
                        </td>
                        <td className={`${TD_TEXT} font-mono text-[8px]`}>
                          <div className="truncate max-w-[100px]">{imp1?.actualProfile || ''}</div>
                        </td>
                        <td className={`${TD_TEXT} font-mono text-[8px]`}>
                          <div className="truncate max-w-[80px]">{imp1?.actualGrade || ''}</div>
                        </td>
                        <td className={TD}>{fmtNum0(imp1?.contractWeight)}</td>
                        <td className={TD_DATE}>{fmtDate(imp1?.contractDate)}</td>
                        <td className={TD}>{fmtNum(imp1?.deliveredQty)}</td>
                        <td className={TD}>{fmtNum0(imp1?.deliveredWeight)}</td>
                        <td className={TD}>
                          {imp1?.unitPriceNoVAT ? `$${fmtNum(imp1.unitPriceNoVAT, 2)}` : ''}
                        </td>
                        <td className={`${TD} font-bold text-indigo-700`}>
                          {imp1?.totalNoVAT ? `$${fmtNum0(imp1.totalNoVAT)}` : ''}
                        </td>
                        <td className={TD_DATE}>{fmtDate(imp1?.importLCDate)}</td>
                        <td className={`${TD_TEXT} text-[8px]`}>
                          <div className="truncate max-w-[80px]">{imp1?.exportPort || ''}</div>
                        </td>
                        <td className={TD_DATE}>{fmtDate(imp1?.cifDate)}</td>
                        <td className={TD_DATE}>{fmtDate(imp1?.paymentDate)}</td>
                        <td className={TD_DATE}>{fmtDate(imp1?.customsDate)}</td>
                        <td className={`${TD_DATE} font-bold text-indigo-700`}>
                          {fmtDate(imp1?.arrivedDate)}
                        </td>
                        <td className={TD_DATE}>{fmtDate(imp1?.qcInvitationDate)}</td>
                        <td className={TD_DATE}>{fmtDate(imp1?.handoverToProductDate)}</td>

                        {/* IMP purchased */}
                        <td className={`${TD} font-bold text-indigo-700`}>{fmtNum(impTotalQty)}</td>
                        <td className={`${TD} font-bold text-indigo-700`}>{fmtNum0(impTotalWt)}</td>

                        {/* IMP QC */}
                        <td className={`${TD_TEXT} font-mono text-[8px]`}>
                          <div className="truncate max-w-[80px]">{impI1?.reportNo || ''}</div>
                        </td>
                        <td className={TD_DATE}>{fmtDate(impI1?.inspectionDate)}</td>
                        <td className={TD}>{fmtNum0(impI1?.acceptedWeight)}</td>
                        <td className={TD_CENTER}>
                          {impI1?.result && (
                            <span
                              className={`px-1 rounded text-[8px] font-bold ${
                                /pass|đạt/i.test(impI1.result)
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {impI1.result}
                            </span>
                          )}
                        </td>

                        {/* TỔNG ĐÃ MUA */}
                        <td className={`${TD} font-black text-[#0d2b4e]`}>{fmtNum(grandQty)}</td>
                        <td className={`${TD} font-black text-[#0d2b4e]`}>{fmtNum0(grandWt)}</td>

                        {/* So sánh với PR */}
                        <td
                          className={`${TD} font-bold ${
                            diffQty < 0
                              ? 'text-red-600'
                              : diffQty > 0
                                ? 'text-amber-600'
                                : 'text-slate-400'
                          }`}
                        >
                          {diffQty !== 0 ? (diffQty > 0 ? '+' : '') + fmtNum(diffQty) : ''}
                        </td>
                        <td
                          className={`${TD} ${
                            diffWt < 0
                              ? 'text-red-600'
                              : diffWt > 0
                                ? 'text-amber-600'
                                : 'text-slate-400'
                          }`}
                        >
                          {diffWt !== 0 ? (diffWt > 0 ? '+' : '') + fmtNum0(diffWt) : ''}
                        </td>

                        {/* Đánh giá cuối */}
                        <td className={`${TD_CENTER} ${evalCls}`}>{evaluation || '—'}</td>

                        {/* Remarks cuối — chia sẻ với cột ghi chú đầu */}
                        <td className={`${TD_TEXT} text-[8px] text-slate-500`}>
                          <div className="truncate max-w-[78px]">
                            {domTotalNoVAT + impTotal > 0 && (
                              <span className="text-emerald-700 font-mono">
                                {fmtMoney(domTotalNoVAT + impTotal)}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
