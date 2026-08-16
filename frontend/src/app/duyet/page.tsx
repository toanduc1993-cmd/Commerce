'use client';

/**
 * /duyet — MERGED B4 + B5 (F-BID-B chống trùng lặp)
 *
 * Sidebar: BidListSidebar (1 component thay B4+B5 identical sidebar)
 * Tab "⚖️ So sánh": matrix items × vendors read-only — thay B4 /so-sanh-bao-gia
 * Tab "✓ Duyệt + PO": SelectionModeChooser + 5 mode views — thay B5 /duyet-bao-gia
 *
 * 1 fetch fetchBidAnalyses, 1 BidListSidebar, 1 data context shared by both tabs.
 */

import { useEffect, useMemo, useState, Suspense, Fragment } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import { BidListSidebar } from '@/components/bid/BidListSidebar';
import { SelectionModeChooser } from '@/components/bid/SelectionModeChooser';
import type { SelectionMode } from '@/lib/bid-status';
import {
  fetchBidAnalyses,
  fetchBidAnalysisDetail,
  selectBidVendor,
  selectItemVendor,
  fetchApprovalSummary,
  createPoFromBid,
  selectGroupVendor,
  autoSelectMinPrice,
  scoreVendor,
  fetchVendorScores,
  type BidAnalysisRow,
  type ApprovalSummary,
  type VendorScoreRow,
} from '@/lib/api';
import { toast, Toaster } from 'react-hot-toast';
import { fmtMoney, fmtNum } from '@/lib/format';
import {
  offerOf,
  currencyOf,
  hasMixedCurrency,
  isCheapest,
  deltaVsMin,
  hasAnyQuote,
  groupItems,
} from '@/lib/bid-compare';

type Tab = 'compare' | 'approve';

function DuyetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bidIdFromUrl = searchParams.get('bid');
  const initialTab = (searchParams.get('tab') as Tab) || 'compare';

  const [tab, setTab] = useState<Tab>(initialTab);
  const [bidList, setBidList] = useState<BidAnalysisRow[]>([]);
  const [selectedBidId, setSelectedBidId] = useState<string | null>(bidIdFromUrl);
  const [bidDetail, setBidDetail] = useState<BidAnalysisRow | null>(null);
  const [summary, setSummary] = useState<ApprovalSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [creatingPO, setCreatingPO] = useState(false);
  const [invalidLines, setInvalidLines] = useState<
    Array<{ itemCode?: string | null; vendorName?: string | null; lyDo: string }> | null
  >(null);

  // Sync tab from URL
  useEffect(() => {
    const t = searchParams.get('tab') as Tab | null;
    if (t === 'compare' || t === 'approve') setTab(t);
  }, [searchParams]);

  // Load bid list
  useEffect(() => {
    if (!localStorage.getItem('ibshi_authed')) {
      router.push('/login');
      return;
    }
    (async () => {
      try {
        const data = await fetchBidAnalyses();
        setBidList(data);
        if (!selectedBidId && data.length > 0) setSelectedBidId(data[0].id);
      } catch (err) {
        toast.error(`Lỗi: ${err instanceof Error ? err.message : 'unknown'}`);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  // Load detail + summary when bid changes
  const reloadDetail = async (bidId: string) => {
    setIsLoadingDetail(true);
    try {
      const [d, s] = await Promise.all([
        fetchBidAnalysisDetail(bidId),
        fetchApprovalSummary(bidId),
      ]);
      setBidDetail(d);
      setSummary(s);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (!selectedBidId) return;
    reloadDetail(selectedBidId);
  }, [selectedBidId]);

  // ── Approve tab handlers ───────────────────────────────────────────────────

  // PER_BID — 1 NCC cho toàn bộ gói (gán xuống mọi dòng)
  const handleSelectVendorAllItems = async (vendorId: string, vendorName: string) => {
    if (!selectedBidId) return;
    const soDong = bidDetail?.items?.length || 0;
    if (!confirm(`Giao toàn bộ ${soDong} dòng của gói này cho ${vendorName}?`)) return;
    try {
      const r = await selectBidVendor(selectedBidId, vendorId);
      if (!r.success) throw new Error(r.error || 'Không rõ lỗi');
      toast.success(`✅ ${vendorName} — đã gán ${r.itemsApplied ?? soDong} dòng`);
      await reloadDetail(selectedBidId);
    } catch (err) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  };

  // PER_GROUP — 1 NCC cho cả nhóm vật tư
  const handleSelectGroupVendor = async (groupCode: string, vendorName: string) => {
    if (!selectedBidId) return;
    try {
      const r = await selectGroupVendor(selectedBidId, groupCode, vendorName);
      if (!r.success) throw new Error(r.error || 'Không rõ lỗi');
      toast.success(`✅ Nhóm ${groupCode} → ${vendorName} (${r.applied ?? 0} dòng)`);
      await reloadDetail(selectedBidId);
    } catch (err) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  };

  // AUTO_MIN_PRICE — hệ thống tự chọn NCC rẻ nhất
  const handleAutoMinPrice = async () => {
    if (!selectedBidId) return;
    if (!confirm('Để hệ thống tự chọn NCC rẻ nhất cho từng dòng? Lựa chọn thủ công hiện có sẽ bị ghi đè.')) return;
    const id = toast.loading('Đang chọn tự động...');
    try {
      const r = await autoSelectMinPrice(selectedBidId);
      if (!r.success) throw new Error(r.error || 'Không rõ lỗi');
      toast.success(
        `Đã chọn ${r.updated} dòng · bỏ qua ${r.skipped} dòng không đủ điều kiện (tiền tệ ${r.bidCurrency})`,
        { id, duration: 6000 }
      );
      await reloadDetail(selectedBidId);
    } catch (err) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'unknown'}`, { id });
    }
  };

  const handleSelectItemVendor = async (itemId: string, vendorName: string | null) => {
    if (!selectedBidId) return;
    setSavingItemId(itemId);
    try {
      const r = await selectItemVendor(selectedBidId, itemId, vendorName);
      if (r.success) {
        toast.success(vendorName ? `✓ Đã duyệt: ${vendorName}` : '✓ Đã bỏ duyệt', { duration: 1500 });
        await reloadDetail(selectedBidId);
      } else {
        toast.error(r.error || 'Lỗi không xác định');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi mạng');
    } finally {
      setSavingItemId(null);
    }
  };

  const handleCreatePO = async () => {
    if (!selectedBidId || !bidDetail || creatingPO) return;
    const assigned = summary?.summary.assignedItems || 0;
    const total = summary?.summary.totalItems || 0;
    const msg =
      assigned === 0
        ? 'Chưa duyệt NCC cho item nào. Hãy chọn NCC ở dropdown từng dòng.'
        : assigned < total
          ? `Đã duyệt ${assigned}/${total} items. Tạo PO ngay (chỉ items đã duyệt)?`
          : `Đã duyệt đủ ${total}/${total} items. Tạo PO?`;
    if (assigned === 0) { toast.error(msg); return; }
    if (!confirm(msg)) return;

    setCreatingPO(true);
    const toastId = toast.loading('Đang tạo PO + chi tiết hợp đồng...');
    try {
      const data = await createPoFromBid(selectedBidId);
      if (!data.success || !data.data) throw new Error(data.error || 'Không rõ lỗi');
      const pos = data.data.purchaseOrders;
      toast.success(
        `Đã tạo ${data.data.totalPOs} PO: ${pos.map((p) => p.poCode).join(', ')}`,
        { id: toastId, duration: 5000 }
      );
      const refreshed = await fetchBidAnalyses();
      setBidList(refreshed);
      await reloadDetail(selectedBidId);
    } catch (e) {
      // Backend chặn dòng đơn giá 0 (P0-3) → liệt kê ra cho biết phải sửa dòng nào
      const err = e as Error & { body?: { invalidLines?: Array<{ itemCode?: string | null; vendorName?: string | null; lyDo: string }> } };
      const loi = err.body?.invalidLines;
      if (loi?.length) {
        setInvalidLines(loi);
        toast.error(`${loi.length} dòng chưa hợp lệ — xem bảng bên dưới`, { id: toastId, duration: 6000 });
      } else {
        toast.error(`Lỗi tạo PO: ${err.message}`, { id: toastId });
      }
    } finally {
      setCreatingPO(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-[#f4f6fb]">
      <Toaster position="top-right" />
      <Sidebar />

      <div className="flex-1 ml-64 flex h-screen overflow-hidden">
        {/* Single shared sidebar — 1 component thay B4+B5 identical */}
        <BidListSidebar
          bids={bidList}
          selectedBidId={selectedBidId}
          onSelect={setSelectedBidId}
          isLoading={isLoading}
          title="Duyệt Báo Giá"
        />

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!bidDetail && (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              {isLoadingDetail ? (
                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
              ) : (
                'Chọn 1 đợt báo giá để bắt đầu'
              )}
            </div>
          )}

          {bidDetail && (
            <>
              {/* Detail header — shared between tabs */}
              <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-lg font-black text-[#1B365D]">{bidDetail.subject}</h1>
                    <p className="text-xs text-slate-500 mt-1">
                      <span className="font-mono font-bold">{bidDetail.bidCode}</span>
                      {bidDetail.project?.code && (
                        <span className="ml-3">Dự án: <strong>{bidDetail.project.code}</strong></span>
                      )}
                      {bidDetail.sourceSheetName && (
                        <span className="ml-3 text-slate-400">Sheet: <em>{bidDetail.sourceSheetName}</em></span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {tab === 'approve' && bidDetail.status !== 'CONTRACTED' && (
                      <button
                        type="button"
                        onClick={handleCreatePO}
                        disabled={creatingPO || (summary?.summary.assignedItems || 0) === 0}
                        className="text-xs bg-[#1B365D] text-white px-3 py-1.5 rounded font-bold inline-flex items-center gap-1 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          (summary?.summary.assignedItems || 0) === 0
                            ? 'Cần chọn NCC cho ít nhất 1 item trước'
                            : `Tạo PO + HĐ cho ${summary?.summary.assignedItems} items đã duyệt`
                        }
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {creatingPO ? 'progress_activity' : 'handshake'}
                        </span>
                        {creatingPO ? 'Đang tạo...' : 'Tạo PO / HĐ'}
                      </button>
                    )}
                    {tab === 'approve' && bidDetail.status === 'CONTRACTED' && (
                      <Link
                        href="/hop-dong"
                        className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded font-bold inline-flex items-center gap-1 hover:opacity-90"
                      >
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        Đã có PO — Xem /hop-dong
                      </Link>
                    )}
                    {tab === 'approve' && bidDetail.sourceFilePath && (
                      <a
                        href="#"
                        onClick={async (e) => {
                          e.preventDefault();
                          const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005'}/api/v1/bid-analyses/${bidDetail.id}/download`;
                          const _dlToken = typeof window !== 'undefined' ? localStorage.getItem('ibshi_token') : null;
                          const r = await fetch(url, { credentials: 'include', headers: _dlToken ? { Authorization: `Bearer ${_dlToken}` } : undefined });
                          if (!r.ok) { toast.error('Không tải được file'); return; }
                          const blob = await r.blob();
                          const a = document.createElement('a');
                          a.href = URL.createObjectURL(blob);
                          a.download = bidDetail.sourceFileName || 'bao-gia.xlsx';
                          a.click();
                          URL.revokeObjectURL(a.href);
                        }}
                        className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded font-bold flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">download</span>
                        Tải file gốc
                      </a>
                    )}
                    <Link
                      href="/bao-gia"
                      className="text-xs text-slate-500 hover:text-[#1B365D] flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                      Danh sách
                    </Link>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-0 border-b border-slate-200 mt-4">
                  {(
                    [
                      { key: 'compare', label: '⚖️ So sánh báo giá' },
                      { key: 'approve', label: '✓ Duyệt + PO' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${
                        tab === t.key
                          ? 'border-[#1B365D] text-[#1B365D]'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-auto">
                {tab === 'compare' && <CompareTab bidDetail={bidDetail} />}
                {tab === 'approve' && (
                  <ApproveTab
                    bidDetail={bidDetail}
                    summary={summary}
                    selectedBidId={selectedBidId!}
                    savingItemId={savingItemId}
                    invalidLines={invalidLines}
                    onSelectItemVendor={handleSelectItemVendor}
                    onSelectVendorAllItems={handleSelectVendorAllItems}
                    onSelectGroupVendor={handleSelectGroupVendor}
                    onAutoMinPrice={handleAutoMinPrice}
                    onModeChange={(newMode) => {
                      setBidDetail((d) => (d ? { ...d, selectionMode: newMode } : d));
                      setInvalidLines(null);
                      if (selectedBidId) reloadDetail(selectedBidId);
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab: So sánh (CHỈ ĐỌC) ───────────────────────────────────────────────────
// 13/08/2026: bỏ nút "Chọn NCC này" theo quyết định anh Hưng — chỉ còn MỘT đường
// phê duyệt duy nhất ở tab Duyệt. Tab này thuần để nhìn và đối chiếu giá.

function CompareTab({ bidDetail }: { bidDetail: BidAnalysisRow }) {
  const [chiHienCoBaoGia, setChiHienCoBaoGia] = useState(false);
  const vendors = bidDetail.vendors;
  const tronTien = hasMixedCurrency(vendors);

  const dsMuc = (bidDetail.items || []).filter((it) => !chiHienCoBaoGia || hasAnyQuote(it));
  const soMucRong = (bidDetail.items || []).length - (bidDetail.items || []).filter(hasAnyQuote).length;

  return (
    <>
      {/* Thẻ tóm tắt từng NCC */}
      <div className="px-6 pt-4 pb-3 border-b border-slate-100 bg-white">
        {tronTien && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <span className="material-symbols-outlined text-amber-600 text-[18px]">warning</span>
            <p className="text-[11px] text-amber-800">
              <b>Gói này trộn nhiều loại tiền.</b> Giá thấp nhất được chấm <b>riêng trong từng loại tiền</b>,
              không so số thô giữa VND và USD. Mỗi ô giá đều ghi rõ loại tiền.
            </p>
          </div>
        )}
        <div className="grid grid-cols-4 gap-3">
          {vendors.map((v) => (
            <div
              key={v.id}
              className={`rounded-lg p-3 border-2 ${
                v.isWinner ? 'bg-emerald-50 border-emerald-500 shadow-md' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                    {v.vendorType === 'IMPORT' ? '🌏 Nhập khẩu' : '🇻🇳 Trong nước'} · {currencyOf(v)}
                  </div>
                  <div className="text-sm font-bold text-[#1B365D]">{v.vendorName}</div>
                  <div className="text-lg font-black text-[#0d6efd] mt-1">
                    {fmtMoney(v.totalQuote, v.currency)}
                  </div>
                </div>
                {v.isWinner && (
                  <span className="material-symbols-outlined text-emerald-600 text-[24px]">verified</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bộ lọc dòng rỗng */}
      <div className="px-6 py-2 border-b border-slate-100 bg-slate-50/60 flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={chiHienCoBaoGia}
            onChange={(e) => setChiHienCoBaoGia(e.target.checked)}
            className="accent-[#1B365D]"
          />
          Chỉ hiện mục có báo giá
        </label>
        {soMucRong > 0 && (
          <span className="text-[10px] text-slate-400">
            ({soMucRong} mục chưa NCC nào báo giá{chiHienCoBaoGia ? ' — đang ẩn' : ''})
          </span>
        )}
      </div>

      {/* Ma trận so sánh */}
      <div className="overflow-auto">
        <table className="w-full text-[10px]">
          <thead className="bg-[#1B365D] text-white sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Mã</th>
              <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Mô tả</th>
              <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Quy cách</th>
              <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Mác</th>
              <th className="px-2 py-2 text-right text-[9px] font-black uppercase">SL mua</th>
              <th className="px-2 py-2 text-right text-[9px] font-black uppercase">SL PR</th>
              <th className="px-2 py-2 text-right text-[9px] font-black uppercase bg-[#0d2b4e]">Dự toán</th>
              <th className="px-2 py-2 text-right text-[9px] font-black uppercase bg-[#0d2b4e]">Đã mua</th>
              {vendors.map((v) => (
                <th
                  key={v.id}
                  colSpan={4}
                  className={`px-2 py-2 text-center text-[9px] font-black uppercase ${
                    v.isWinner ? 'bg-emerald-700' : 'bg-[#2a5298]'
                  }`}
                >
                  {v.isWinner && '🏆 '}{v.vendorName}
                  <span className="ml-1 font-normal opacity-70">({currencyOf(v)})</span>
                </th>
              ))}
              <th className="px-2 py-2 text-left text-[9px] font-black uppercase">NCC duyệt</th>
            </tr>
            <tr>
              <th colSpan={8} className="bg-[#1d3f6b]"></th>
              {vendors.map((v) => (
                <Fragment key={`sub-${v.id}`}>
                  <th className="px-1 py-1 bg-[#37547a] text-white text-[8px] font-bold">Phạm vi</th>
                  <th className="px-1 py-1 bg-[#37547a] text-white text-[8px] font-bold">Đơn giá</th>
                  <th className="px-1 py-1 bg-[#37547a] text-white text-[8px] font-bold">Chênh</th>
                  <th className="px-1 py-1 bg-[#37547a] text-white text-[8px] font-bold">Thành tiền</th>
                </Fragment>
              ))}
              <th className="bg-[#37547a]"></th>
            </tr>
          </thead>
          <tbody>
            {dsMuc.map((it, idx) => (
              <tr key={it.id} className={`border-t border-slate-100 ${idx % 2 ? 'bg-slate-50/30' : ''}`}>
                <td className="px-2 py-1.5 font-mono font-bold text-[#1B365D] text-[10px]">{it.itemCode || '—'}</td>
                <td className="px-2 py-1.5 truncate max-w-[200px]" title={it.itemName || ''}>{it.itemName}</td>
                <td className="px-2 py-1.5 font-mono text-[9px] text-slate-600">{it.profile || '—'}</td>
                <td className="px-2 py-1.5 font-mono text-[9px]">{it.grade || '—'}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtNum(it.qtyToBuy)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-500">{fmtNum(it.qtyPR)}</td>
                <td className="px-2 py-1.5 text-right font-mono font-bold text-slate-700">{fmtMoney(it.estimateTotal)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-500">{fmtMoney(it.alreadyBoughtAmount)}</td>
                {vendors.map((v) => {
                  const offer = offerOf(it, v.id);
                  const cur = currencyOf(v);
                  const reNhat = isCheapest(it, v, vendors);
                  const chenh = deltaVsMin(it, v, vendors);
                  const khongChao = offer && !(offer.unitPrice > 0);
                  const chuThich = offer
                    ? [
                        offer.deliveryTerm ? `Giao hàng: ${offer.deliveryTerm}` : null,
                        offer.remarks ? `Ghi chú: ${offer.remarks}` : null,
                        reNhat ? `Giá thấp nhất (${cur})` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : 'NCC không báo giá mục này';
                  return (
                    <Fragment key={`${it.id}-${v.id}`}>
                      <td className={`px-1 py-1.5 text-center text-[9px] ${v.isWinner ? 'bg-emerald-50' : ''}`}>
                        {offer?.scope || '—'}
                      </td>
                      <td
                        className={`px-1 py-1.5 text-right font-mono text-[9px] ${
                          reNhat ? 'bg-yellow-100 font-bold text-emerald-700' : ''
                        } ${v.isWinner ? 'bg-emerald-50' : ''} ${khongChao ? 'text-slate-300' : ''}`}
                        title={chuThich}
                      >
                        {offer && offer.unitPrice > 0 ? (
                          <>
                            {fmtNum(offer.unitPrice, 0)}
                            <span className="ml-0.5 text-[7px] text-slate-400">{cur}</span>
                            {(offer.deliveryTerm || offer.remarks) && (
                              <span className="ml-0.5 text-[8px] text-slate-400">*</span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td
                        className={`px-1 py-1.5 text-right font-mono text-[8px] ${
                          v.isWinner ? 'bg-emerald-50' : ''
                        } ${chenh ? 'text-rose-600' : 'text-slate-300'}`}
                        title={chenh ? `Đắt hơn NCC rẻ nhất ${fmtNum(chenh.amount, 0)} ${cur}/đơn vị` : ''}
                      >
                        {chenh ? `+${chenh.pct.toFixed(1)}%` : reNhat ? 'rẻ nhất' : '—'}
                      </td>
                      <td
                        className={`px-1 py-1.5 text-right font-mono text-[9px] font-semibold ${
                          v.isWinner ? 'bg-emerald-50 text-emerald-700' : ''
                        }`}
                      >
                        {offer && offer.totalPrice > 0 ? fmtMoney(offer.totalPrice, cur) : '—'}
                      </td>
                    </Fragment>
                  );
                })}
                <td className="px-2 py-1.5 text-[9px]">
                  {it.selectedVendorName ? (
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold">
                      {it.selectedVendorName}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-6 py-3 text-[10px] text-slate-400">
        Bảng này chỉ để xem. Dấu <b>*</b> = NCC có ghi điều kiện giao hàng hoặc ghi chú — rê chuột để đọc.
        Muốn duyệt NCC, chuyển sang tab <b>Duyệt + PO</b>.
      </p>
    </>
  );
}

// ── Tab: Duyệt + PO ──────────────────────────────────────────────────────────

function ApproveTab({
  bidDetail,
  summary,
  selectedBidId,
  savingItemId,
  invalidLines,
  onSelectItemVendor,
  onSelectVendorAllItems,
  onSelectGroupVendor,
  onAutoMinPrice,
  onModeChange,
}: {
  bidDetail: BidAnalysisRow;
  summary: ApprovalSummary | null;
  selectedBidId: string;
  savingItemId: string | null;
  invalidLines: Array<{ itemCode?: string | null; vendorName?: string | null; lyDo: string }> | null;
  onSelectItemVendor: (itemId: string, vendorName: string | null) => void;
  onSelectVendorAllItems: (vendorId: string, vendorName: string) => void;
  onSelectGroupVendor: (groupCode: string, vendorName: string) => void;
  onAutoMinPrice: () => void;
  onModeChange: (mode: SelectionMode, resetCount: number) => void;
}) {
  const mode = (bidDetail.selectionMode as SelectionMode) || 'PER_ITEM';
  return (
    <div className="overflow-auto">
      {/* Summary stats */}
      {summary && (
        <div className="px-6 pt-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="text-[9px] font-black uppercase text-slate-400">Tổng items</div>
              <div className="text-xl font-black text-[#1B365D] mt-0.5">{summary.summary.totalItems}</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
              <div className="text-[9px] font-black uppercase text-emerald-600">Đã duyệt</div>
              <div className="text-xl font-black text-emerald-700 mt-0.5">{summary.summary.assignedItems}</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
              <div className="text-[9px] font-black uppercase text-amber-600">Chờ duyệt</div>
              <div className="text-xl font-black text-amber-700 mt-0.5">{summary.summary.pendingItems}</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <div className="text-[9px] font-black uppercase text-blue-600">Tổng giá trị</div>
              <div className="text-xl font-black text-blue-700 mt-0.5">{fmtMoney(summary.summary.totalApprovedValue)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Dòng chưa hợp lệ — backend chặn khi tạo PO (P0-3) */}
      {invalidLines && invalidLines.length > 0 && (
        <div className="px-6 pt-4">
          <div className="rounded-lg border border-rose-300 bg-rose-50 p-3">
            <div className="text-[11px] font-black text-rose-800 mb-1.5">
              Không tạo được đơn hàng — {invalidLines.length} dòng chưa hợp lệ
            </div>
            <ul className="text-[10px] text-rose-700 space-y-0.5 max-h-40 overflow-auto">
              {invalidLines.map((l, i) => (
                <li key={`${l.itemCode}-${i}`}>
                  <span className="font-mono font-bold">{l.itemCode || '(không mã)'}</span>
                  {l.vendorName ? ` — NCC duyệt: ${l.vendorName}` : ''} — {l.lyDo}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-rose-600 mt-1.5">
              Đổi sang NCC có báo giá cho dòng đó, hoặc bỏ duyệt dòng đó rồi tạo lại.
            </p>
          </div>
        </div>
      )}

      {/* Chọn chế độ */}
      <div className="px-6 pt-4">
        <SelectionModeChooser
          bidAnalysisId={bidDetail.id}
          currentMode={mode}
          itemsCount={bidDetail._count?.items || bidDetail.items?.length || 0}
          // Số nhóm vật tư THẬT, lấy từ groupCode backend gắn — không còn đoán bằng
          // cách cắt chữ đầu của tên vật tư như trước (P2-6).
          uniqueGroups={groupItems(bidDetail.items || []).length || 1}
          onModeChange={onModeChange}
        />
      </div>

      {/* Khung thao tác riêng cho từng chế độ (nối 13/08 — trước đây 3 chế độ không có gì) */}
      {mode === 'PER_BID' && (
        <PerBidPanel bidDetail={bidDetail} onSelectVendorAllItems={onSelectVendorAllItems} />
      )}
      {mode === 'PER_GROUP' && (
        <PerGroupPanel bidDetail={bidDetail} onSelectGroupVendor={onSelectGroupVendor} />
      )}
      {mode === 'AUTO_MIN_PRICE' && (
        <AutoMinPricePanel bidDetail={bidDetail} onRun={onAutoMinPrice} />
      )}
      {mode === 'MANUAL_WEIGHTED' && (
        <WeightedPanel
          bidDetail={bidDetail}
          selectedBidId={selectedBidId}
          onSelectVendorAllItems={onSelectVendorAllItems}
        />
      )}

      {/* Bảng từng dòng — luôn hiện để đối chiếu kết quả của mọi chế độ */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-[#1B365D] uppercase tracking-wide">
            {mode === 'PER_ITEM' ? '1. Chọn NCC cho từng dòng' : '1. Kết quả theo từng dòng'}
          </h2>
          <span className="text-[10px] text-slate-400">
            {mode === 'PER_ITEM'
              ? 'Chọn ở cột "NCC duyệt" — bảng tổng hợp tự cập nhật bên dưới'
              : 'Vẫn sửa tay được từng dòng nếu cần'}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-[#1B365D] text-white">
              <tr>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase">Item</th>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase">Mô tả</th>
                <th className="px-3 py-2 text-left text-[9px] font-black uppercase">Profile / Grade</th>
                <th className="px-3 py-2 text-right text-[9px] font-black uppercase">SL mua</th>
                {bidDetail.vendors.map((v) => (
                  <th
                    key={v.id}
                    className="px-2 py-2 text-right text-[9px] font-black uppercase bg-[#2a5298]"
                    title={v.vendorName}
                  >
                    {v.vendorName.length > 18 ? v.vendorName.slice(0, 15) + '…' : v.vendorName}
                  </th>
                ))}
                <th className="px-3 py-2 text-center text-[9px] font-black uppercase bg-emerald-700 min-w-[180px]">
                  NCC duyệt
                </th>
              </tr>
            </thead>
            <tbody>
              {bidDetail.items?.map((it, idx) => {
                const isSaving = savingItemId === it.id;
                return (
                  <tr
                    key={it.id}
                    className={`border-t border-slate-100 ${
                      it.selectedVendorName ? 'bg-emerald-50/40' : idx % 2 ? 'bg-slate-50/40' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-mono font-bold text-[#1B365D] text-[10px]">{it.itemCode || '—'}</td>
                    <td className="px-3 py-2 truncate max-w-[200px]" title={it.itemName || ''}>{it.itemName}</td>
                    <td className="px-3 py-2 text-[9px] text-slate-600">
                      {it.profile || '—'}
                      {it.grade && <div className="text-[8px] text-slate-400">{it.grade}</div>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtNum(it.qtyToBuy)} {it.uom}</td>
                    {bidDetail.vendors.map((v) => {
                      // Ghép theo vendorId — cùng một hàm với tab So sánh (P0-1)
                      const offer = offerOf(it, v.id);
                      const cur = currencyOf(v);
                      const isMin = isCheapest(it, v, bidDetail.vendors);
                      const chenh = deltaVsMin(it, v, bidDetail.vendors);
                      const isChosen = it.selectedVendorName === v.vendorName;
                      return (
                        <td
                          key={`${it.id}-${v.id}`}
                          className={`px-2 py-2 text-right font-mono text-[9px] ${
                            isChosen
                              ? 'bg-emerald-100 font-bold text-emerald-800'
                              : isMin
                                ? 'bg-yellow-50 font-bold text-yellow-700'
                                : ''
                          }`}
                          title={
                            offer
                              ? [
                                  `${fmtMoney(offer.unitPrice, cur)}/đơn vị × ${fmtNum(it.qtyToBuy)} = ${fmtMoney(offer.totalPrice, cur)}`,
                                  offer.deliveryTerm ? `Giao hàng: ${offer.deliveryTerm}` : null,
                                  offer.remarks ? `Ghi chú: ${offer.remarks}` : null,
                                  chenh ? `Đắt hơn NCC rẻ nhất ${chenh.pct.toFixed(1)}%` : null,
                                ]
                                  .filter(Boolean)
                                  .join('\n')
                              : 'NCC không báo giá mục này'
                          }
                        >
                          {offer && offer.unitPrice > 0 ? (
                            <div>
                              <div>
                                {fmtNum(offer.unitPrice, 0)}
                                <span className="ml-0.5 text-[7px] text-slate-400">{cur}</span>
                              </div>
                              <div className="text-[8px] text-slate-500">
                                {fmtMoney(offer.totalPrice, cur)}
                              </div>
                              {chenh && (
                                <div className="text-[8px] text-rose-500">+{chenh.pct.toFixed(1)}%</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 bg-emerald-50/30">
                      <select
                        value={it.selectedVendorName || ''}
                        onChange={(e) => onSelectItemVendor(it.id, e.target.value || null)}
                        disabled={isSaving}
                        className={`w-full px-2 py-1 text-[10px] border rounded font-bold ${
                          it.selectedVendorName
                            ? 'border-emerald-500 bg-white text-emerald-700'
                            : 'border-slate-300 bg-white text-slate-500'
                        } ${isSaving ? 'opacity-50' : ''}`}
                      >
                        <option value="">— Chưa duyệt —</option>
                        {bidDetail.vendors.map((v) => (
                          <option key={v.id} value={v.vendorName}>{v.vendorName}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Bảng tổng hợp phê duyệt */}
      <div className="px-6 pb-8">
        <h2 className="text-sm font-black text-[#1B365D] uppercase tracking-wide mb-3">
          2. Bảng tổng hợp phê duyệt
          {summary && summary.summary.vendorCount > 0 && (
            <span className="ml-2 text-[10px] font-normal text-slate-400">
              ({summary.summary.vendorCount} NCC · {summary.summary.assignedItems}/{summary.summary.totalItems} items duyệt)
            </span>
          )}
        </h2>

        {!summary || summary.byVendor.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
            Chưa duyệt item nào — bảng tổng hợp sẽ xuất hiện khi chọn NCC ở trên
          </div>
        ) : (
          <div className="space-y-4">
            {summary.byVendor.map((vg) => (
              <div key={vg.vendorName} className="bg-white rounded-xl border border-emerald-200 overflow-hidden shadow-sm">
                <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-200 flex items-center justify-between">
                  <div>
                    <span className="material-symbols-outlined text-emerald-600 text-[18px] align-middle mr-1">verified</span>
                    <span className="text-sm font-black text-emerald-800">{vg.vendorName}</span>
                    <span className="ml-2 text-[10px] text-emerald-600">{vg.itemCount} items</span>
                  </div>
                  <div className="text-sm font-black text-emerald-700">{fmtMoney(vg.totalValue)}</div>
                </div>
                <table className="w-full text-[10px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-[8px] font-black uppercase text-slate-500">Item</th>
                      <th className="px-3 py-1.5 text-left text-[8px] font-black uppercase text-slate-500">Mô tả</th>
                      <th className="px-3 py-1.5 text-left text-[8px] font-black uppercase text-slate-500">Profile/Grade</th>
                      <th className="px-3 py-1.5 text-right text-[8px] font-black uppercase text-slate-500">SL</th>
                      <th className="px-3 py-1.5 text-right text-[8px] font-black uppercase text-slate-500">Đơn giá</th>
                      <th className="px-3 py-1.5 text-right text-[8px] font-black uppercase text-slate-500">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vg.items.map((it, idx) => (
                      <tr key={`${vg.vendorName}-${idx}`} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 font-mono font-bold text-[#1B365D]">{it.itemCode || '—'}</td>
                        <td className="px-3 py-1.5 truncate max-w-[200px]" title={it.itemName || ''}>{it.itemName}</td>
                        <td className="px-3 py-1.5 text-[9px] text-slate-600">
                          {it.profile || '—'}
                          {it.grade && <span className="ml-1 text-slate-400">/{it.grade}</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">{fmtNum(it.qtyToBuy)} {it.uom}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{fmtNum(it.unitPrice, 0)}</td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-700">{fmtMoney(it.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Khung thao tác cho 4 chế độ ngoài PER_ITEM ───────────────────────────────
// Nối 13/08/2026. Trước đó ô chọn chế độ có đủ 5 lựa chọn nhưng phía dưới luôn chỉ
// là bảng PER_ITEM — 3 chế độ PER_GROUP / AUTO_MIN_PRICE / MANUAL_WEIGHTED có API
// backend nhưng giao diện không gọi lần nào.

function KhungChon({ tieuDe, moTa, children }: { tieuDe: string; moTa: string; children: React.ReactNode }) {
  return (
    <div className="px-6 pt-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-black text-[#1B365D]">{tieuDe}</h3>
        <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{moTa}</p>
        {children}
      </div>
    </div>
  );
}

/** PER_BID — 1 NCC trúng toàn bộ gói. */
function PerBidPanel({
  bidDetail,
  onSelectVendorAllItems,
}: {
  bidDetail: BidAnalysisRow;
  onSelectVendorAllItems: (vendorId: string, vendorName: string) => void;
}) {
  const soDong = bidDetail.items?.length || 0;
  return (
    <KhungChon
      tieuDe="Chọn 1 nhà cung cấp cho toàn bộ gói"
      moTa={`Nhà cung cấp được chọn sẽ được gán cho cả ${soDong} dòng của gói này.`}
    >
      <div className="grid grid-cols-4 gap-3">
        {bidDetail.vendors.map((v) => {
          const dangChon = v.isWinner;
          return (
            <div
              key={v.id}
              className={`rounded-lg border-2 p-3 ${
                dangChon ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="text-sm font-bold text-[#1B365D]">{v.vendorName}</div>
              <div className="text-[10px] text-slate-400 mb-1">
                {v.vendorType === 'IMPORT' ? 'Nhập khẩu' : 'Trong nước'} · {currencyOf(v)}
              </div>
              <div className="text-base font-black text-[#0d6efd]">
                {fmtMoney(v.totalQuote, v.currency)}
              </div>
              <button
                type="button"
                onClick={() => onSelectVendorAllItems(v.id, v.vendorName)}
                disabled={dangChon}
                className="mt-2 w-full px-2 py-1 text-[10px] font-bold rounded bg-[#1B365D] text-white hover:bg-[#2a5298] disabled:bg-emerald-600 disabled:cursor-default"
              >
                {dangChon ? '✓ Đang chọn' : 'Giao cả gói cho NCC này'}
              </button>
            </div>
          );
        })}
      </div>
    </KhungChon>
  );
}

/** PER_GROUP — mỗi nhóm vật tư 1 NCC. */
function PerGroupPanel({
  bidDetail,
  onSelectGroupVendor,
}: {
  bidDetail: BidAnalysisRow;
  onSelectGroupVendor: (groupCode: string, vendorName: string) => void;
}) {
  const nhom = groupItems(bidDetail.items || []);
  return (
    <KhungChon
      tieuDe="Chọn nhà cung cấp theo nhóm vật tư"
      moTa={`${nhom.length} nhóm — suy từ mã vật tư (token giữa, vd I95-VTC01-12 → VTC01). Chọn NCC cho nhóm nào thì mọi dòng trong nhóm đó được gán NCC ấy.`}
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-1.5 text-left text-[9px] font-black uppercase text-slate-500">Nhóm</th>
            <th className="px-3 py-1.5 text-right text-[9px] font-black uppercase text-slate-500">Số dòng</th>
            <th className="px-3 py-1.5 text-right text-[9px] font-black uppercase text-slate-500">Đã duyệt</th>
            <th className="px-3 py-1.5 text-left text-[9px] font-black uppercase text-slate-500">NCC cho cả nhóm</th>
          </tr>
        </thead>
        <tbody>
          {nhom.map((g) => {
            const daDuyet = g.items.filter((i) => i.selectedVendorName).length;
            const dsNcc = [...new Set(g.items.map((i) => i.selectedVendorName).filter(Boolean))];
            const dongNhat = dsNcc.length === 1 ? (dsNcc[0] as string) : '';
            return (
              <tr key={g.groupCode} className="border-t border-slate-100">
                <td className="px-3 py-2 font-bold text-[#1B365D]">{g.groupLabel}</td>
                <td className="px-3 py-2 text-right font-mono">{g.items.length}</td>
                <td className="px-3 py-2 text-right font-mono">
                  <span className={daDuyet === g.items.length ? 'text-emerald-600 font-bold' : 'text-slate-500'}>
                    {daDuyet}/{g.items.length}
                  </span>
                  {dsNcc.length > 1 && (
                    <span className="ml-1 text-[9px] text-amber-600" title={dsNcc.join(', ')}>
                      ({dsNcc.length} NCC khác nhau)
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={dongNhat}
                    onChange={(e) => e.target.value && onSelectGroupVendor(g.groupCode, e.target.value)}
                    className="w-full max-w-[240px] px-2 py-1 text-[10px] border border-slate-300 rounded bg-white font-bold"
                  >
                    <option value="">— Chọn NCC cho cả nhóm —</option>
                    {bidDetail.vendors.map((v) => (
                      <option key={v.id} value={v.vendorName}>
                        {v.vendorName}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </KhungChon>
  );
}

/** AUTO_MIN_PRICE — hệ thống tự chọn giá thấp nhất. */
function AutoMinPricePanel({
  bidDetail,
  onRun,
}: {
  bidDetail: BidAnalysisRow;
  onRun: () => void;
}) {
  const items = bidDetail.items || [];
  const coBaoGia = items.filter(hasAnyQuote).length;
  const tronTien = hasMixedCurrency(bidDetail.vendors);
  return (
    <KhungChon
      tieuDe="Tự động chọn nhà cung cấp rẻ nhất"
      moTa="Hệ thống duyệt từng dòng, chọn NCC có đơn giá thấp nhất. Chỉ xét báo giá có phạm vi 'V' (có chào), đơn giá lớn hơn 0 và cùng loại tiền với gói. Hoà giá thì lấy NCC theo thứ tự chữ cái."
    >
      <div className="flex items-center gap-4">
        <div className="text-[11px] text-slate-600">
          <div>
            Dòng có báo giá dùng được: <b>{coBaoGia}</b> / {items.length}
          </div>
          {tronTien && (
            <div className="text-amber-700 mt-0.5">
              ⚠️ Gói trộn nhiều loại tiền — dòng nào lệch loại tiền của gói sẽ bị bỏ qua, không tự chọn.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={coBaoGia === 0}
          className="ml-auto px-4 py-2 text-xs font-bold rounded bg-[#1B365D] text-white hover:bg-[#2a5298] disabled:opacity-40"
        >
          Chạy chọn tự động
        </button>
      </div>
    </KhungChon>
  );
}

/** MANUAL_WEIGHTED — chấm điểm NCC theo trọng số rồi áp NCC cao điểm nhất. */
function WeightedPanel({
  bidDetail,
  selectedBidId,
  onSelectVendorAllItems,
}: {
  bidDetail: BidAnalysisRow;
  selectedBidId: string;
  onSelectVendorAllItems: (vendorId: string, vendorName: string) => void;
}) {
  const [scores, setScores] = useState<VendorScoreRow[]>([]);
  const [nhap, setNhap] = useState<Record<string, { gia: string; chatLuong: string; thanhToan: string }>>({});
  const [dangLuu, setDangLuu] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchVendorScores(selectedBidId);
        setScores(r.data || []);
      } catch {
        setScores([]);
      }
    })();
  }, [selectedBidId]);

  const luu = async (vendorName: string) => {
    const v = nhap[vendorName] || { gia: '', chatLuong: '', thanhToan: '' };
    const so = [Number(v.gia), Number(v.chatLuong), Number(v.thanhToan)];
    if (so.some((n) => Number.isNaN(n) || n < 0 || n > 100)) {
      toast.error('Điểm phải từ 0 đến 100');
      return;
    }
    setDangLuu(vendorName);
    try {
      const r = await scoreVendor(selectedBidId, {
        vendorName,
        priceScore: so[0],
        qualityScore: so[1],
        paymentScore: so[2],
      });
      if (!r.success) throw new Error(r.error || 'Không rõ lỗi');
      const lai = await fetchVendorScores(selectedBidId);
      setScores(lai.data || []);
      toast.success(`Đã chấm điểm ${vendorName}`);
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setDangLuu(null);
    }
  };

  const xepHang = [...scores].sort((a, b) => b.overallScore - a.overallScore);
  const dan = xepHang[0];
  const vendorDan = dan ? bidDetail.vendors.find((v) => v.vendorName === dan.vendorName) : null;

  return (
    <KhungChon
      tieuDe="Chấm điểm nhà cung cấp theo trọng số"
      moTa="Cho điểm 0–100 ở ba tiêu chí. Điểm tổng = giá 50% + chất lượng 30% + điều kiện thanh toán 20%. Chấm xong có thể giao cả gói cho NCC cao điểm nhất."
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-1.5 text-left text-[9px] font-black uppercase text-slate-500">Nhà cung cấp</th>
            <th className="px-2 py-1.5 text-center text-[9px] font-black uppercase text-slate-500">Giá (50%)</th>
            <th className="px-2 py-1.5 text-center text-[9px] font-black uppercase text-slate-500">Chất lượng (30%)</th>
            <th className="px-2 py-1.5 text-center text-[9px] font-black uppercase text-slate-500">Thanh toán (20%)</th>
            <th className="px-2 py-1.5 text-right text-[9px] font-black uppercase text-slate-500">Điểm tổng</th>
            <th className="px-2 py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {bidDetail.vendors.map((v) => {
            const daCham = scores.find((s) => s.vendorName === v.vendorName);
            const o = nhap[v.vendorName] || {
              gia: daCham ? String(daCham.priceScore) : '',
              chatLuong: daCham ? String(daCham.qualityScore) : '',
              thanhToan: daCham ? String(daCham.paymentScore) : '',
            };
            const dat = (k: 'gia' | 'chatLuong' | 'thanhToan', val: string) =>
              setNhap((p) => ({ ...p, [v.vendorName]: { ...o, [k]: val } }));
            return (
              <tr key={v.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-bold text-[#1B365D]">
                  {v.vendorName}
                  {dan?.vendorName === v.vendorName && <span className="ml-1 text-emerald-600">★</span>}
                </td>
                {(['gia', 'chatLuong', 'thanhToan'] as const).map((k) => (
                  <td key={k} className="px-2 py-2 text-center">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={o[k]}
                      onChange={(e) => dat(k, e.target.value)}
                      className="w-16 px-1 py-0.5 text-[10px] text-center border border-slate-300 rounded"
                    />
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-mono font-black text-[#1B365D]">
                  {daCham ? daCham.overallScore.toFixed(1) : '—'}
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => luu(v.vendorName)}
                    disabled={dangLuu === v.vendorName}
                    className="px-2 py-1 text-[10px] font-bold rounded bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40"
                  >
                    {dangLuu === v.vendorName ? 'Đang lưu…' : 'Lưu điểm'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {dan && vendorDan && (
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
          <span className="text-[11px] text-emerald-800">
            Cao điểm nhất: <b>{dan.vendorName}</b> ({dan.overallScore.toFixed(1)} điểm)
          </span>
          <button
            type="button"
            onClick={() => onSelectVendorAllItems(vendorDan.id, vendorDan.vendorName)}
            className="ml-auto px-3 py-1 text-[10px] font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Giao cả gói cho NCC này
          </button>
        </div>
      )}
    </KhungChon>
  );
}

export default function DuyetPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Đang tải...</div>}>
      <DuyetContent />
    </Suspense>
  );
}
