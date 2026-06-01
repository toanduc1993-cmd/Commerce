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

import { useEffect, useMemo, useState, Suspense } from 'react';
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
  type BidAnalysisRow,
  type ApprovalSummary,
} from '@/lib/api';
import { toast, Toaster } from 'react-hot-toast';
import { fmtMoney, fmtNum } from '@/lib/format';

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

  // ── Compare tab handlers ───────────────────────────────────────────────────

  const handleSelectVendor = async (vendorId: string, vendorName: string) => {
    if (!selectedBidId) return;
    if (!confirm(`Chọn ${vendorName} làm NCC trúng thầu?`)) return;
    try {
      await selectBidVendor(selectedBidId, vendorId);
      toast.success(`✅ Đã chọn ${vendorName}`);
      await reloadDetail(selectedBidId);
    } catch (err) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  };

  // ── Approve tab handlers ───────────────────────────────────────────────────

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
    const toastId = toast.loading('Đang tạo PO + ContractDetail...');
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';
      const token = typeof window !== 'undefined' ? localStorage.getItem('ibshi_token') : null;
      const r = await fetch(`${API_URL}/api/v1/bid-analyses/${selectedBidId}/create-po`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
      const pos = data.data.purchaseOrders;
      toast.success(
        `Đã tạo ${data.data.totalPOs} PO: ${pos.map((p: { poCode: string }) => p.poCode).join(', ')}`,
        { id: toastId, duration: 5000 }
      );
      const refreshed = await fetchBidAnalyses();
      setBidList(refreshed);
      await reloadDetail(selectedBidId);
    } catch (e) {
      toast.error(`Lỗi tạo PO: ${(e as Error).message}`, { id: toastId });
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
                {tab === 'compare' && (
                  <CompareTab
                    bidDetail={bidDetail}
                    onSelectVendor={handleSelectVendor}
                  />
                )}
                {tab === 'approve' && (
                  <ApproveTab
                    bidDetail={bidDetail}
                    summary={summary}
                    selectedBidId={selectedBidId!}
                    savingItemId={savingItemId}
                    onSelectItemVendor={handleSelectItemVendor}
                    onModeChange={(newMode) => {
                      setBidDetail((d) => (d ? { ...d, selectionMode: newMode } : d));
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

// ── Tab: So sánh (read-only matrix) ──────────────────────────────────────────

function CompareTab({
  bidDetail,
  onSelectVendor,
}: {
  bidDetail: BidAnalysisRow;
  onSelectVendor: (vendorId: string, vendorName: string) => void;
}) {
  return (
    <>
      {/* Vendor summary cards */}
      <div className="px-6 pt-4 pb-3 border-b border-slate-100 bg-white">
        <div className="grid grid-cols-4 gap-3">
          {bidDetail.vendors.map((v) => (
            <div
              key={v.id}
              className={`rounded-lg p-3 border-2 ${
                v.isWinner
                  ? 'bg-emerald-50 border-emerald-500 shadow-md'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                    {v.vendorType === 'IMPORT' ? '🌏 Nhập khẩu' : '🇻🇳 Trong nước'}
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
              {!v.isWinner && (
                <button
                  onClick={() => onSelectVendor(v.id, v.vendorName)}
                  className="mt-2 w-full px-2 py-1 text-[10px] font-bold bg-[#1B365D] text-white rounded hover:bg-[#2a5298]"
                >
                  Chọn NCC này
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Comparison matrix */}
      <div className="overflow-auto">
        <table className="w-full text-[10px]">
          <thead className="bg-[#1B365D] text-white sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Item</th>
              <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Description</th>
              <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Profile</th>
              <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Grade</th>
              <th className="px-2 py-2 text-right text-[9px] font-black uppercase">SL Mua</th>
              <th className="px-2 py-2 text-right text-[9px] font-black uppercase">SL PR</th>
              <th className="px-2 py-2 text-right text-[9px] font-black uppercase bg-[#0d2b4e]">DT Tổng</th>
              <th className="px-2 py-2 text-right text-[9px] font-black uppercase bg-[#0d2b4e]">Đã mua</th>
              {bidDetail.vendors.map((v) => (
                <th
                  key={v.id}
                  colSpan={3}
                  className={`px-2 py-2 text-center text-[9px] font-black uppercase ${
                    v.isWinner ? 'bg-emerald-700' : 'bg-[#2a5298]'
                  }`}
                >
                  {v.isWinner && '🏆 '}{v.vendorName}
                </th>
              ))}
              <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Lựa chọn</th>
              <th className="px-2 py-2 text-left text-[9px] font-black uppercase">Ghi chú</th>
            </tr>
            <tr>
              <th colSpan={8} className="bg-[#1d3f6b]"></th>
              {bidDetail.vendors.map((v) => (
                <>
                  <th key={`${v.id}-s`} className="px-1 py-1 bg-[#37547a] text-white text-[8px] font-bold">Phạm vi</th>
                  <th key={`${v.id}-u`} className="px-1 py-1 bg-[#37547a] text-white text-[8px] font-bold">Đơn giá</th>
                  <th key={`${v.id}-t`} className="px-1 py-1 bg-[#37547a] text-white text-[8px] font-bold">Thành tiền</th>
                </>
              ))}
              <th className="bg-[#37547a]"></th>
              <th className="bg-[#37547a]"></th>
            </tr>
          </thead>
          <tbody>
            {bidDetail.items?.map((it, idx) => {
              const minPrice = Math.min(
                ...it.offers.filter((o) => o.unitPrice > 0).map((o) => o.unitPrice),
                Infinity
              );
              return (
                <tr key={it.id} className={`border-t border-slate-100 ${idx % 2 ? 'bg-slate-50/30' : ''}`}>
                  <td className="px-2 py-1.5 font-mono font-bold text-[#1B365D] text-[10px]">{it.itemCode || '—'}</td>
                  <td className="px-2 py-1.5 truncate max-w-[200px]" title={it.itemName || ''}>{it.itemName}</td>
                  <td className="px-2 py-1.5 font-mono text-[9px] text-slate-600">{it.profile || '—'}</td>
                  <td className="px-2 py-1.5 font-mono text-[9px]">{it.grade || '—'}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmtNum(it.qtyToBuy)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-500">{fmtNum(it.qtyPR)}</td>
                  <td className="px-2 py-1.5 text-right font-mono font-bold text-slate-700">{fmtMoney(it.estimateTotal)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-500">{fmtMoney(it.alreadyBoughtAmount)}</td>
                  {bidDetail.vendors.map((v) => {
                    const offer = it.offers.find((o) => o.vendor?.vendorOrder === v.vendorOrder);
                    const isMin = offer && offer.unitPrice > 0 && offer.unitPrice === minPrice;
                    return (
                      <>
                        <td key={`${it.id}-${v.id}-s`} className={`px-1 py-1.5 text-center text-[9px] ${v.isWinner ? 'bg-emerald-50' : ''}`}>{offer?.scope || '—'}</td>
                        <td key={`${it.id}-${v.id}-u`} className={`px-1 py-1.5 text-right font-mono text-[9px] ${isMin ? 'bg-yellow-100 font-bold text-emerald-700' : ''} ${v.isWinner ? 'bg-emerald-50' : ''}`} title={isMin ? 'Giá thấp nhất' : ''}>{offer?.unitPrice ? fmtNum(offer.unitPrice, 0) : '—'}</td>
                        <td key={`${it.id}-${v.id}-t`} className={`px-1 py-1.5 text-right font-mono text-[9px] font-semibold ${v.isWinner ? 'bg-emerald-50 text-emerald-700' : ''}`}>{offer?.totalPrice ? fmtMoney(offer.totalPrice) : '—'}</td>
                      </>
                    );
                  })}
                  <td className="px-2 py-1.5 text-[9px]">
                    {it.selectedVendorName ? (
                      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold">{it.selectedVendorName}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-[8px] text-slate-500 max-w-[150px] truncate">{it.notes || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Tab: Duyệt + PO ──────────────────────────────────────────────────────────

function ApproveTab({
  bidDetail,
  summary,
  selectedBidId,
  savingItemId,
  onSelectItemVendor,
  onModeChange,
}: {
  bidDetail: BidAnalysisRow;
  summary: ApprovalSummary | null;
  selectedBidId: string;
  savingItemId: string | null;
  onSelectItemVendor: (itemId: string, vendorName: string | null) => void;
  onModeChange: (mode: SelectionMode, resetCount: number) => void;
}) {
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

      {/* SelectionModeChooser */}
      <div className="px-6 pt-4">
        <SelectionModeChooser
          bidAnalysisId={bidDetail.id}
          currentMode={(bidDetail.selectionMode as SelectionMode) || 'PER_ITEM'}
          itemsCount={bidDetail._count?.items || bidDetail.items?.length || 0}
          uniqueGroups={
            new Set(
              (bidDetail.items || [])
                .map((it) => (it.itemName || '').split(/[\s\-_]/)[0])
                .filter(Boolean)
            ).size || 1
          }
          onModeChange={onModeChange}
        />
      </div>

      {/* Section 1: Items + dropdown NCC */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-[#1B365D] uppercase tracking-wide">
            1. Chọn NCC cho từng item
          </h2>
          <span className="text-[10px] text-slate-400">
            Click dropdown ở cột &ldquo;NCC duyệt&rdquo; — bảng tổng hợp tự cập nhật bên dưới
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
                const minPrice = Math.min(
                  ...it.offers.filter((o) => o.unitPrice > 0).map((o) => o.unitPrice),
                  Infinity
                );
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
                      const offer = it.offers.find((o) => o.vendor?.vendorName === v.vendorName);
                      const isMin = offer && offer.unitPrice > 0 && offer.unitPrice === minPrice;
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
                          title={offer ? `${fmtMoney(offer.unitPrice)}/u × ${fmtNum(it.qtyToBuy)} = ${fmtMoney(offer.totalPrice)}` : 'Không báo giá'}
                        >
                          {offer && offer.unitPrice > 0 ? (
                            <div>
                              <div>{fmtNum(offer.unitPrice, 0)}</div>
                              <div className="text-[8px] text-slate-500">{fmtMoney(offer.totalPrice)}</div>
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

export default function DuyetPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Đang tải...</div>}>
      <DuyetContent />
    </Suspense>
  );
}
