// ============================================================
// F-BID-A: Dev test page cho SelectionModeChooser (DA approved 2026-05-28 12:25)
// GUARD: chỉ accessible NODE_ENV=development; KHÔNG link sidebar.
// ============================================================
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import { SelectionModeChooser } from '@/components/bid/SelectionModeChooser';
import { fetchBidAnalyses, type BidAnalysisRow } from '@/lib/api';
import { SELECTION_MODES, type SelectionMode } from '@/lib/bid-status';

interface BidWithMode extends BidAnalysisRow {
  selectionMode?: SelectionMode;
}

export default function SelectionModeTestPage() {
  const router = useRouter();
  const [bids, setBids] = useState<BidWithMode[]>([]);
  const [selectedBid, setSelectedBid] = useState<BidWithMode | null>(null);
  const [isProd, setIsProd] = useState(false);

  useEffect(() => {
    // Guard: chỉ run trong dev
    if (process.env.NODE_ENV === 'production') {
      setIsProd(true);
      return;
    }
    if (!localStorage.getItem('ibshi_authed')) {
      router.push('/login');
      return;
    }
    fetchBidAnalyses().then((data) => {
      setBids(data as BidWithMode[]);
      if (data.length > 0) setSelectedBid(data[0] as BidWithMode);
    });
  }, [router]);

  if (isProd) {
    return (
      <div className="p-8 max-w-xl mx-auto mt-12 bg-red-50 border border-red-300 rounded-lg">
        <h1 className="text-lg font-bold text-red-900">Route bị khoá</h1>
        <p className="text-sm text-red-700 mt-1">
          /dev/selection-mode-test chỉ available trong development. NODE_ENV hiện tại = production.
        </p>
      </div>
    );
  }

  // Approximation: unique groups derived từ item name prefix (BidItemRow chưa expose materialGroupCode)
  const uniqueGroups =
    new Set(
      selectedBid?.items
        ?.map((it) => {
          const n = it.itemName || '';
          return n.split(/[\s\-_]/)[0] || '';
        })
        .filter(Boolean)
    ).size || 1;
  const itemsCount = selectedBid?.items?.length || selectedBid?._count?.items || 0;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <Toaster position="top-right" />
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-blue-600">science</span>
            <h1 className="text-xl font-black text-slate-900">F-BID-A Dev Test — Selection Mode Chooser</h1>
            <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
              NODE_ENV=development only
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Test 5 selection modes foundation. Pick a BidAnalysis từ list, chuyển mode, verify behaviour.
            Route này KHÔNG link vào nav — sẽ remove sau khi wire vào /duyet ở Phase B.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: BID list */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 max-h-[80vh] overflow-y-auto">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              BidAnalysis ({bids.length})
            </h2>
            <div className="space-y-1">
              {bids.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBid(b)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs ${
                    selectedBid?.id === b.id
                      ? 'bg-blue-50 border border-blue-300 text-blue-900'
                      : 'hover:bg-slate-50 border border-transparent text-slate-700'
                  }`}
                >
                  <div className="font-mono font-bold">{b.bidCode || b.id.slice(0, 8)}</div>
                  <div className="text-slate-500 truncate">{b.subject || '(no subject)'}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                    <span>Mode:</span>
                    <span className="font-mono font-bold text-blue-700">
                      {b.selectionMode || 'PER_ITEM'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: chooser + 5 mode preview */}
          <div className="lg:col-span-2 space-y-4">
            {selectedBid ? (
              <>
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Selected BID
                  </h3>
                  <p className="text-sm font-mono text-slate-900 mt-1">
                    {selectedBid.bidCode || selectedBid.id}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">{selectedBid.subject}</p>
                  <div className="text-[11px] text-slate-500 mt-2 flex items-center gap-3">
                    <span>Items: {itemsCount}</span>
                    <span>Unique groups: {uniqueGroups}</span>
                    <span>Current mode: <strong>{selectedBid.selectionMode || 'PER_ITEM'}</strong></span>
                  </div>
                </div>

                <SelectionModeChooser
                  bidAnalysisId={selectedBid.id}
                  currentMode={(selectedBid.selectionMode as SelectionMode) || 'PER_ITEM'}
                  itemsCount={itemsCount}
                  uniqueGroups={uniqueGroups}
                  onModeChange={(newMode) => {
                    setSelectedBid({ ...selectedBid, selectionMode: newMode });
                    setBids(
                      bids.map((b) => (b.id === selectedBid.id ? { ...b, selectionMode: newMode } : b))
                    );
                  }}
                />

                {/* 5 modes side-by-side preview (DA bonus suggestion 12:25) */}
                <details className="bg-white rounded-lg border border-slate-200 p-4">
                  <summary className="text-xs font-bold text-slate-700 cursor-pointer">
                    Side-by-side preview tất cả 5 modes (read-only)
                  </summary>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
                    {SELECTION_MODES.map((m) => (
                      <div
                        key={m.key}
                        className="p-2 rounded border border-slate-200 bg-slate-50"
                      >
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[16px] text-slate-500">
                            {m.icon}
                          </span>
                          <span className="text-[11px] font-bold">{m.label.split(' ')[0]}...</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                          {m.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
                Chọn 1 BidAnalysis từ list bên trái.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
