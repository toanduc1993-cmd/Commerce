'use client';

/**
 * /bao-gia — MERGED B2 + B3 (F-BID-B chống trùng lặp)
 *
 * Tab "📋 Yêu cầu" (OPEN): tạo RFQ, theo dõi NCC chưa gửi — thay B2 /yeu-cau-bao-gia
 * Tab "📥 Đã nhận BG" (EVALUATING+): upload, view báo giá — thay B3 /bao-gia cũ
 *
 * 1 fetch useBidAnalyses, 1 BidKpiBar, 1 BidRowActions, 1 VendorsPanel, 1 useBidFilters.
 */

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import {
  fetchBidAnalyses,
  uploadBidAnalysesFile,
  type BidAnalysisRow,
} from '@/lib/api';
import { PROJECTS } from '@/context/ProjectContext';
import { toast, Toaster } from 'react-hot-toast';
import { TableSearch, ColumnFilter, ActiveFilterChips } from '@/components/data-table';
import { SkeletonTable } from '@/components/Skeleton';
import { BidCodeDisplay } from '@/components/BidCodeDisplay';
import { CreateRfqModal } from '@/components/CreateRfqModal';
import { ImportRfqBatchModal } from '@/components/ImportRfqBatchModal';
import { EnterVendorQuoteModal } from '@/components/EnterVendorQuoteModal';
import { BidKpiBar } from '@/components/bid/BidKpiBar';
import { BidRowActions } from '@/components/bid/BidRowActions';
import { VendorsPanel } from '@/components/bid/VendorsPanel';
import { useBidFilters } from '@/hooks/useBidFilters';
import { fmtDate, fmtMoney } from '@/lib/format';
import { STATUS_CFG } from '@/lib/bid-status';
import type { BidStatus } from '@/lib/bid-status';

type Tab = 'requests' | 'received';

function BaoGiaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'requests';

  const [tab, setTab] = useState<Tab>(initialTab);
  const [bids, setBids] = useState<BidAnalysisRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [quoteBidId, setQuoteBidId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProject, setUploadProject] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    try {
      const data = await fetchBidAnalyses();
      setBids(data);
    } catch (err) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  };

  useEffect(() => {
    if (!localStorage.getItem('ibshi_authed')) {
      router.push('/login');
      return;
    }
    (async () => {
      try {
        const data = await fetchBidAnalyses();
        setBids(data);
      } catch (err) {
        toast.error(`Lỗi: ${err instanceof Error ? err.message : 'unknown'}`);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  // Sync tab from URL
  useEffect(() => {
    const t = searchParams.get('tab') as Tab | null;
    if (t === 'requests' || t === 'received') setTab(t);
  }, [searchParams]);

  const tableFilters = useBidFilters();

  // Tab-specific filtering
  const tabBids =
    tab === 'requests'
      ? bids.filter((b) => b.status === 'OPEN' || b.status === 'EVALUATING')
      : bids.filter((b) => b.status !== 'OPEN' || (b.vendors?.length || 0) > 0);

  const filtered = tableFilters.apply(tabBids);

  const sumReceivedValue = (b: BidAnalysisRow): { vnd: number; usd: number } => {
    let vnd = 0;
    let usd = 0;
    for (const v of b.vendors || []) {
      if (v.currency === 'USD') usd += v.totalQuote;
      else vnd += v.totalQuote;
    }
    return { vnd, usd };
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    const toastId = toast.loading(`Đang xử lý ${uploadFile.name}…`);
    try {
      const r = await uploadBidAnalysesFile(uploadFile, uploadProject || undefined);
      toast.dismiss(toastId);
      if (r.success) {
        toast.success(`✅ ${r.message}`, { duration: 5000 });
        setShowUpload(false);
        setUploadFile(null);
        await reload();
      } else {
        toast.error(`❌ ${r.error}`);
      }
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(`❌ ${err instanceof Error ? err.message : 'Lỗi mạng'}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f4f6fb]">
      <Toaster position="top-right" />
      <Sidebar />

      <div className="flex-1 ml-64 px-8 pt-8 pb-12 space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 text-caption text-slate-400">
              <span>Quy trình mua sắm</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="font-semibold text-[var(--color-brand)]">Bước 2–3: Yêu cầu & Nhận báo giá</span>
            </div>
            <h1 className="text-h1 mt-1">Báo Giá Vật Tư</h1>
            <p className="text-caption text-slate-500 mt-0.5">
              Tạo RFQ → Theo dõi NCC gửi báo giá → Upload & quản lý báo giá nhận được
            </p>
          </div>
          <div className="flex items-center gap-2">
            {tab === 'requests' ? (
              <>
                <button
                  onClick={() => setShowImport(true)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-white border border-[var(--color-brand)] text-[var(--color-brand)] text-body font-semibold hover:bg-[var(--color-brand-soft)] shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">upload_file</span>
                  Import batch
                </button>
                <button
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-md bg-[var(--color-brand)] text-white text-body font-semibold hover:opacity-90 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Tạo RFQ mới
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowUpload(true)}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-md bg-[var(--color-brand)] text-white text-body font-semibold hover:opacity-90 shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">upload</span>
                Upload Báo Giá
              </button>
            )}
          </div>
        </div>

        {/* Modals */}
        {showCreate && (
          <CreateRfqModal
            onClose={() => setShowCreate(false)}
            onCreated={(bid) => {
              setShowCreate(false);
              reload();
              toast.success(`RFQ ${bid.bidCode} đã tạo`);
            }}
          />
        )}
        {showImport && (
          <ImportRfqBatchModal
            onClose={() => setShowImport(false)}
            onCreated={() => reload()}
          />
        )}
        {quoteBidId && (
          <EnterVendorQuoteModal
            bidId={quoteBidId}
            onClose={() => setQuoteBidId(null)}
            onSaved={() => reload()}
          />
        )}

        {/* KPI bar */}
        <BidKpiBar bids={bids} variant={tab === 'requests' ? 'requests' : 'received'} />

        {/* Tabs */}
        <div className="flex gap-0 border-b border-slate-200">
          {(
            [
              { key: 'requests', icon: 'forward_to_inbox', label: '📋 Yêu cầu báo giá', count: bids.filter((b) => b.status === 'OPEN' || b.status === 'EVALUATING').length },
              { key: 'received', icon: 'request_quote', label: '📥 Đã nhận báo giá', count: bids.filter((b) => b.status !== 'OPEN' || (b.vendors?.length || 0) > 0).length },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2.5 text-body font-semibold border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-[var(--color-brand)] text-[var(--color-brand)]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[260px] max-w-md">
              <TableSearch
                value={tableFilters.search}
                onChange={tableFilters.setSearch}
                placeholder="Tìm mã RFQ, chủ đề..."
                resultCount={filtered.length}
                totalCount={tabBids.length}
              />
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <span className="label">Lọc:</span>
              {(['bidCode', 'subject', 'project.code', 'status', 'bidDate'] as const).map((col) => (
                <div key={col} className="flex items-center">
                  <span className="text-caption text-slate-500 mr-1">
                    {tableFilters.config[col]?.label ?? col}
                  </span>
                  <ColumnFilter
                    column={col}
                    config={tableFilters.config[col]}
                    value={tableFilters.columnFilters[col] ?? null}
                    onChange={(v) => tableFilters.setColumnFilter(col, v)}
                  />
                </div>
              ))}
            </div>
          </div>
          {tableFilters.activeCount > 0 && <ActiveFilterChips filters={tableFilters} />}
        </div>

        {/* Table */}
        {isLoading ? (
          <SkeletonTable rows={6} cols={7} />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-[var(--color-brand)] text-white">
                <tr>
                  <th className="px-3 py-2 text-left label text-white w-8"></th>
                  <th className="px-3 py-2 text-left label text-white">Mã RFQ / Bid</th>
                  <th className="px-3 py-2 text-left label text-white">Chủ đề</th>
                  <th className="px-3 py-2 text-left label text-white">Dự án</th>
                  <th className="px-3 py-2 text-center label text-white">Ngày</th>
                  <th className="px-3 py-2 text-center label text-white">NCC</th>
                  <th className="px-3 py-2 text-right label text-white">Tổng giá trị</th>
                  <th className="px-3 py-2 text-center label text-white">Trạng thái</th>
                  <th className="px-3 py-2 text-center label text-white">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-400">
                      <span className="material-symbols-outlined text-[40px] block mx-auto opacity-30">
                        {tab === 'requests' ? 'forward_to_inbox' : 'request_quote'}
                      </span>
                      <p className="text-body mt-2">
                        {tab === 'requests'
                          ? 'Chưa có RFQ — tạo từ PR hoặc upload BID analysis'
                          : 'Chưa có báo giá nhận — upload file Excel để bắt đầu'}
                      </p>
                      {tab === 'requests' && (
                        <Link
                          href="/mua-hang"
                          className="inline-flex items-center gap-1 mt-3 px-3 py-1.5 rounded-md bg-[var(--color-brand)] text-white text-body font-semibold"
                        >
                          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                          Đi tới PR
                        </Link>
                      )}
                    </td>
                  </tr>
                )}
                {filtered.map((b) => {
                  const isExpanded = expandedId === b.id;
                  const statusCfg = STATUS_CFG[b.status as BidStatus] || STATUS_CFG['OPEN'];
                  const value = sumReceivedValue(b);
                  const winner = b.vendors.find((v) => v.isWinner);
                  return (
                    <>
                      <tr
                        key={b.id}
                        className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : b.id)}
                      >
                        <td className="px-3 py-2">
                          <span
                            className="material-symbols-outlined text-[18px] text-slate-400 transition-transform"
                            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}
                          >
                            chevron_right
                          </span>
                        </td>
                        <td className="px-3 py-2" colSpan={2}>
                          <BidCodeDisplay
                            bidCode={b.bidCode}
                            legacyBidCode={(b as BidAnalysisRow & { legacyBidCode?: string }).legacyBidCode}
                            subject={b.subject}
                            compact={false}
                          />
                        </td>
                        <td className="px-3 py-2 text-body">{b.project?.code || '—'}</td>
                        <td className="px-3 py-2 text-center text-caption text-slate-500">
                          {fmtDate(b.bidDate)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="badge badge-info">{b.vendors?.length || 0}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-emphasis">
                          {tab === 'requests' ? (
                            <>
                              {value.vnd > 0 && <div className="font-mono">{fmtMoney(value.vnd, 'VND')}</div>}
                              {value.usd > 0 && <div className="font-mono text-caption text-slate-500">{fmtMoney(value.usd, 'USD')}</div>}
                              {value.vnd === 0 && value.usd === 0 && <span className="text-slate-300">—</span>}
                            </>
                          ) : (
                            winner ? (
                              <span className="font-mono font-bold text-[var(--color-brand)]">
                                {fmtMoney(winner.totalQuote, winner.currency)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`badge ${statusCfg.color}`}>{statusCfg.label}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <BidRowActions
                            bid={b}
                            onReload={reload}
                            onEnterQuote={(id) => setQuoteBidId(id)}
                          />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${b.id}-detail`} className="bg-slate-50">
                          <td colSpan={9} className="px-6 py-4">
                            <VendorsPanel
                              bid={b}
                              onEnterQuote={() => setQuoteBidId(b.id)}
                              showDetailFetch={tab === 'received'}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Modal (tab received) */}
      {showUpload && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ background: 'var(--color-brand)' }}
            >
              <div>
                <div className="text-white font-black text-sm">Upload Báo Giá</div>
                <div className="text-blue-200 text-[10px]">
                  Excel "Theo dõi dự án" — sẽ parse tất cả sheets BID ANALYSIS
                </div>
              </div>
              <button onClick={() => setShowUpload(false)} className="text-white/60 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label mb-1 block">Dự án (optional)</label>
                <select
                  value={uploadProject}
                  onChange={(e) => setUploadProject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded text-xs"
                >
                  <option value="">— Tự động detect từ file —</option>
                  {PROJECTS.map((p) => (
                    <option key={p.id} value={p.code}>{p.code} — {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label mb-1 block">
                  File Excel <span className="text-red-500">*</span>
                </label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-[var(--color-brand)]"
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setUploadFile(f);
                      e.target.value = '';
                    }}
                  />
                  {uploadFile ? (
                    <div className="text-emerald-600 text-xs font-bold">
                      <span className="material-symbols-outlined text-[16px] align-middle mr-1">check_circle</span>
                      {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(1)} MB)
                    </div>
                  ) : (
                    <div className="text-slate-400 text-xs">Click để chọn file .xlsx</div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowUpload(false)}
                  className="flex-1 px-4 py-2 text-xs font-bold border border-slate-200 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!uploadFile || isUploading}
                  className={`flex-1 px-4 py-2 text-xs font-bold rounded-lg text-white ${
                    !uploadFile || isUploading
                      ? 'bg-slate-300'
                      : 'bg-[var(--color-brand)] hover:opacity-90'
                  }`}
                >
                  {isUploading ? 'Đang xử lý...' : 'Upload & Parse'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BaoGiaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Đang tải...</div>}>
      <BaoGiaContent />
    </Suspense>
  );
}
