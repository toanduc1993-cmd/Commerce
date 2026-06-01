'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
  checkInventoryForPR,
  importStockData,
  bulkUpdateRemainQty,
  type InventoryCheckRow,
  type InventoryCheckResult,
  type StockImportRow,
} from '@/lib/api';
import { PurchaseHistoryPanel } from '@/components/PurchaseHistoryPanel';

type SubTab = 'import' | 'compare';

interface ParsedStockRow {
  itemCode: string;
  itemName?: string;
  availableQty: number;
  uom?: string;
  rowIndex: number;
}

interface MatchPreviewRow extends ParsedStockRow {
  matchStatus: 'EXACT' | 'NOT_FOUND';
  prDetailId?: string;
  prItemName?: string;
  reqQty?: number;
}

function StatusBadge({ status }: { status: 'HAS_STOCK' | 'PARTIAL' | 'NO_STOCK' }) {
  const map = {
    HAS_STOCK: { label: 'Đủ tồn', cls: 'bg-emerald-100 text-emerald-700' },
    PARTIAL: { label: 'Một phần', cls: 'bg-amber-100 text-amber-700' },
    NO_STOCK: { label: 'Không có', cls: 'bg-slate-100 text-slate-500' },
  };
  const { label, cls } = map[status];
  return <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${cls}`}>{label}</span>;
}

function StockBar({ reqQty, available }: { reqQty: number; available: number }) {
  const pct = reqQty > 0 ? Math.min(100, Math.round((available / reqQty) * 100)) : 0;
  const color = pct >= 100 ? 'bg-emerald-400' : pct > 0 ? 'bg-amber-400' : 'bg-slate-200';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-slate-100 rounded overflow-hidden">
        <div className={`h-full ${color} rounded transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-slate-500 tabular-nums">{pct}%</span>
    </div>
  );
}

export default function KiemTraTonKhoPage() {
  const searchParams = useSearchParams();
  const prId = searchParams.get('prId') || '';

  const [tab, setTab] = useState<SubTab>('import');
  const [checkResult, setCheckResult] = useState<InventoryCheckResult | null>(null);
  const [editedRemain, setEditedRemain] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Import sub-tab state
  const [dragOver, setDragOver] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [columns, setColumns] = useState<string[]>([]);
  const [qtyColumn, setQtyColumn] = useState('');
  const [codeColumn, setCodeColumn] = useState('');
  const [nameColumn, setNameColumn] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedStockRow[]>([]);
  const [matchPreview, setMatchPreview] = useState<MatchPreviewRow[]>([]);
  const [importStatus, setImportStatus] = useState<'idle' | 'parsed' | 'confirmed'>('idle');
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ upserted: number; errors: number; matchSummary: { exact: number; partial: number; none: number; total: number } | null } | null>(null);

  // History panel
  const [historyPanel, setHistoryPanel] = useState<{ itemCode: string; itemName: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-load comparison if prId provided
  useEffect(() => {
    if (prId && !checkResult) {
      loadCheck();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prId]);

  const loadCheck = useCallback(async () => {
    if (!prId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await checkInventoryForPR(prId);
      setCheckResult(res);
      // Init editedRemain from existing remainQty
      const init: Record<string, number> = {};
      for (const row of res.rows) {
        init[row.prDetailId] = row.suggestedUseFromStock;
      }
      setEditedRemain(init);
      setTab('compare');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải tồn kho');
    } finally {
      setLoading(false);
    }
  }, [prId]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('Chỉ hỗ trợ file Excel (.xlsx, .xls)');
      return;
    }
    setImportFile(file);
    setError(null);
    setImportStatus('idle');

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheetNames = wb.SheetNames;
    setSheets(sheetNames);
    setSelectedSheet(sheetNames[0]);

    const ws = wb.Sheets[sheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    if (json.length > 0) {
      const headers = (json[0] as string[]).map((h) => String(h || '').trim()).filter(Boolean);
      setColumns(headers);
      // Auto-detect columns
      const codeGuess = headers.find((h) => /m[aã]|code|item.*code/i.test(h)) || headers[0];
      const qtyGuess = headers.find((h) => /t[oồ]n|avail|qty|s[oố].*l[uư][oợ]ng/i.test(h)) || headers[1];
      const nameGuess = headers.find((h) => /tên|name|item.*name/i.test(h)) || headers[2];
      setCodeColumn(codeGuess || '');
      setQtyColumn(qtyGuess || '');
      setNameColumn(nameGuess || '');
    }
  }, []);

  const parseRows = useCallback(async () => {
    if (!importFile || !codeColumn || !qtyColumn) return;
    setError(null);

    const buf = await importFile.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[selectedSheet];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

    const rows: ParsedStockRow[] = [];
    for (let i = 0; i < json.length; i++) {
      const row = json[i];
      const code = String(row[codeColumn] || '').trim();
      if (!code) continue;
      const qty = parseFloat(String(row[qtyColumn] || '0').replace(/,/g, '')) || 0;
      rows.push({
        itemCode: code,
        itemName: nameColumn ? String(row[nameColumn] || '') : undefined,
        availableQty: qty,
        rowIndex: i + 2,
      });
    }
    setParsedRows(rows);

    // Build match preview against checkResult (if loaded)
    if (checkResult) {
      const prCodes = new Set(checkResult.rows.map((r) => r.itemCode));
      const prMap = new Map(checkResult.rows.map((r) => [r.itemCode, r]));
      const preview: MatchPreviewRow[] = rows.map((r) => {
        if (prCodes.has(r.itemCode)) {
          const pr = prMap.get(r.itemCode)!;
          return { ...r, matchStatus: 'EXACT', prDetailId: pr.prDetailId, prItemName: pr.itemName, reqQty: pr.reqQty };
        }
        return { ...r, matchStatus: 'NOT_FOUND' };
      });
      setMatchPreview(preview);
    } else {
      setMatchPreview(rows.map((r) => ({ ...r, matchStatus: 'NOT_FOUND' })));
    }
    setImportStatus('parsed');
  }, [importFile, codeColumn, qtyColumn, nameColumn, selectedSheet, checkResult]);

  const handleImportConfirm = useCallback(async () => {
    if (parsedRows.length === 0) return;
    setImportProgress(0);
    const timer = setInterval(() => setImportProgress((p) => Math.min(p + 10, 90)), 100);
    try {
      const payload: StockImportRow[] = parsedRows.map((r) => ({
        itemCode: r.itemCode,
        itemName: r.itemName,
        availableQty: r.availableQty,
      }));
      const res = await importStockData(payload, prId || undefined);
      clearInterval(timer);
      setImportProgress(100);
      setImportResult({ upserted: res.upserted, errors: res.errors, matchSummary: res.matchSummary });
      setImportStatus('confirmed');
      setSuccess(`Đã nhập ${res.upserted} mã tồn kho thành công.`);
      // Reload check if prId
      if (prId) await loadCheck();
    } catch (e) {
      clearInterval(timer);
      setError(e instanceof Error ? e.message : 'Lỗi nhập tồn kho');
    }
  }, [parsedRows, prId, loadCheck]);

  const handleSaveRemain = useCallback(async () => {
    if (!checkResult) return;
    setSaveLoading(true);
    setError(null);
    try {
      const updates = Object.entries(editedRemain).map(([prDetailId, remainQty]) => ({
        prDetailId,
        remainQty,
      }));
      await bulkUpdateRemainQty(updates);
      setSuccess('Đã lưu phân bổ tồn kho. Số lượng cần mua đã được cập nhật.');
      await loadCheck();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi lưu phân bổ');
    } finally {
      setSaveLoading(false);
    }
  }, [checkResult, editedRemain, loadCheck]);

  const exact = matchPreview.filter((r) => r.matchStatus === 'EXACT').length;
  const notFoundInPR = matchPreview.filter((r) => r.matchStatus === 'NOT_FOUND').length;

  return (
    <div className="min-h-screen bg-[var(--color-background,#f8f9ff)]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-caption text-slate-400 mb-1">
              <span>Bước 1</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="font-medium text-slate-600">1b. Kiểm tra tồn kho</span>
            </div>
            <h1 className="text-heading font-bold text-[var(--color-brand,#002046)]">Kiểm Tra Tồn Kho</h1>
            {checkResult && (
              <div className="flex items-center gap-4 mt-2">
                {[
                  { label: 'Tổng SKU', value: checkResult.summary.total, color: 'text-slate-800' },
                  { label: 'Đủ tồn', value: checkResult.summary.hasStock, color: 'text-emerald-600' },
                  { label: 'Một phần', value: checkResult.summary.partial, color: 'text-amber-600' },
                  { label: 'Không có', value: checkResult.summary.noStock, color: 'text-slate-400' },
                ].map((kpi) => (
                  <div key={kpi.label} className="flex items-center gap-1.5">
                    <span className={`text-title font-bold ${kpi.color}`}>{kpi.value}</span>
                    <span className="text-caption text-slate-500">{kpi.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {checkResult && (
            <div className="flex gap-2">
              <button
                onClick={handleSaveRemain}
                disabled={saveLoading}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--color-brand,#002046)] text-white rounded-lg text-body font-semibold hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">save</span>
                {saveLoading ? 'Đang lưu...' : 'Lưu phân bổ tồn'}
              </button>
            </div>
          )}
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 mt-4 border-b border-slate-200">
          {([
            { id: 'import' as SubTab, label: 'Nhập file tồn kho', icon: 'upload_file' },
            { id: 'compare' as SubTab, label: 'Bảng đối chiếu', icon: 'table_view', badge: checkResult?.summary.total },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-body font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-[var(--color-brand,#002046)] text-[var(--color-brand,#002046)]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
              {t.label}
              {'badge' in t && t.badge !== undefined && (
                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mx-8 mt-4 p-3 bg-red-50 rounded-lg text-red-600 text-body flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">error</span>
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}
      {success && (
        <div className="mx-8 mt-4 p-3 bg-emerald-50 rounded-lg text-emerald-700 text-body flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* ── TAB: Nhập file tồn kho ── */}
      {tab === 'import' && (
        <div className="px-8 py-6 max-w-3xl">
          {/* Upload zone */}
          {!importFile && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                dragOver ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5' : 'border-slate-300 hover:border-[var(--color-brand)]/50 hover:bg-slate-50'
              }`}
            >
              <span className="material-symbols-outlined text-[48px] text-slate-300 block mb-3">upload_file</span>
              <div className="text-body font-semibold text-slate-600">Kéo thả file Excel tồn kho vào đây</div>
              <div className="text-caption text-slate-400 mt-1">hoặc click để chọn file (.xlsx, .xls)</div>
              <div className="mt-4 text-caption text-slate-400">
                <div className="font-medium text-slate-500 mb-1">Cột bắt buộc:</div>
                <div>Mã vật tư · Số lượng tồn (onHand/available)</div>
                <div className="mt-0.5 text-slate-300">Cột tuỳ chọn: Tên vật tư · Vị trí kho · ĐVT</div>
              </div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </div>
          )}

          {/* File loaded — column selector */}
          {importFile && importStatus !== 'confirmed' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200">
                <span className="material-symbols-outlined text-[28px] text-emerald-500">description</span>
                <div className="flex-1 min-w-0">
                  <div className="text-body font-semibold text-slate-800 truncate">{importFile.name}</div>
                  <div className="text-caption text-slate-400">{(importFile.size / 1024).toFixed(1)} KB</div>
                </div>
                <button onClick={() => { setImportFile(null); setImportStatus('idle'); setParsedRows([]); setMatchPreview([]); }}
                  className="p-1.5 rounded hover:bg-slate-100">
                  <span className="material-symbols-outlined text-[18px] text-slate-400">close</span>
                </button>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="text-body font-semibold text-slate-700">Chọn sheet & cột dữ liệu</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-caption text-slate-600 font-medium block mb-1">Sheet</label>
                    <select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-body focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]/30">
                      {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-caption text-slate-600 font-medium block mb-1">Cột Mã vật tư *</label>
                    <select value={codeColumn} onChange={(e) => setCodeColumn(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-body focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]/30">
                      {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-caption text-slate-600 font-medium block mb-1">Cột Số lượng tồn *</label>
                    <select value={qtyColumn} onChange={(e) => setQtyColumn(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-body focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]/30">
                      {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-caption text-slate-600 font-medium block mb-1">Cột Tên vật tư (tuỳ chọn)</label>
                    <select value={nameColumn} onChange={(e) => setNameColumn(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-body focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]/30">
                      <option value="">— Không chọn —</option>
                      {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={parseRows} disabled={!codeColumn || !qtyColumn}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-body font-medium disabled:opacity-50 transition-colors">
                  Xem trước dữ liệu
                </button>
              </div>

              {/* Preview table */}
              {importStatus === 'parsed' && matchPreview.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                    <div className="text-body font-semibold text-slate-700">Xem trước ({parsedRows.length} dòng)</div>
                    <div className="flex gap-3 text-caption">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{exact} khớp</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />{notFoundInPR} không trong PR</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-caption">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr className="text-slate-500">
                          <th className="px-3 py-2 text-left font-medium">Mã vật tư (file)</th>
                          <th className="px-3 py-2 text-right font-medium">Tồn kho</th>
                          <th className="px-3 py-2 text-left font-medium">Khớp PR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {matchPreview.slice(0, 100).map((r) => (
                          <tr key={r.rowIndex} className={r.matchStatus === 'EXACT' ? 'bg-emerald-50/40' : ''}>
                            <td className="px-3 py-1.5 font-medium">{r.itemCode}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{r.availableQty.toLocaleString()}</td>
                            <td className="px-3 py-1.5">
                              {r.matchStatus === 'EXACT'
                                ? <span className="flex items-center gap-1 text-emerald-600"><span className="material-symbols-outlined text-[14px]">check_circle</span> Khớp</span>
                                : <span className="text-slate-400">Không trong PR</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Progress */}
                  {importProgress > 0 && importProgress < 100 && (
                    <div className="px-5 py-3">
                      <div className="h-1.5 bg-slate-100 rounded overflow-hidden">
                        <div className="h-full bg-[var(--color-brand)] rounded transition-all" style={{ width: `${importProgress}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="px-5 py-3 border-t border-slate-100 flex gap-2">
                    <button onClick={handleImportConfirm}
                      className="px-5 py-2 bg-[var(--color-brand,#002046)] text-white rounded-lg text-body font-semibold hover:opacity-90 transition-colors">
                      Xác nhận & áp dụng
                    </button>
                    <button onClick={() => { setImportFile(null); setImportStatus('idle'); }}
                      className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-body hover:bg-slate-200 transition-colors">
                      Huỷ
                    </button>
                  </div>
                </div>
              )}

              {/* Import result */}
              {importStatus === 'confirmed' && importResult && (
                <div className="p-5 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                    Nhập tồn kho thành công
                  </div>
                  <div className="text-caption text-emerald-600 space-y-1">
                    <div>Đã nhập: {importResult.upserted} mã • Lỗi: {importResult.errors} mã</div>
                    {importResult.matchSummary && (
                      <div>Khớp với PR: {importResult.matchSummary.exact} đủ tồn · {importResult.matchSummary.partial} một phần · {importResult.matchSummary.none} không có</div>
                    )}
                  </div>
                  <button onClick={() => setTab('compare')} className="text-body text-emerald-700 underline">
                    Xem bảng đối chiếu →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Bảng đối chiếu ── */}
      {tab === 'compare' && (
        <div className="px-8 py-6">
          {!prId && !checkResult && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <span className="material-symbols-outlined text-[48px]">link</span>
              <div className="text-body">Mở trang này từ màn hình PR để xem bảng đối chiếu</div>
              <div className="text-caption">(URL cần có tham số <code className="bg-slate-100 px-1 rounded">prId</code>)</div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <span className="material-symbols-outlined animate-spin text-[28px] mr-2">progress_activity</span>
              Đang tải dữ liệu tồn kho...
            </div>
          )}

          {checkResult && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-caption">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      {['Mã vật tư', 'Tên vật tư', 'Quy cách', 'Mác', 'ĐVT', 'SL yêu cầu', 'Tồn khả dụng', 'Dùng từ tồn', 'Cần mua', 'Tồn / Yêu cầu', 'Trạng thái', 'Hành động'].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {checkResult.rows.map((row: InventoryCheckRow) => {
                      const useFromStock = editedRemain[row.prDetailId] ?? row.suggestedUseFromStock;
                      const needToBuy = Math.max(0, row.reqQty - useFromStock);
                      const avail = row.inventory?.availableQty ?? 0;
                      return (
                        <tr key={row.prDetailId} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2 font-medium text-slate-800">{row.itemCode}</td>
                          <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate" title={row.itemName}>{row.itemName}</td>
                          <td className="px-3 py-2 text-slate-500">{row.profile || '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{row.grade || '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{row.uom}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{row.reqQty.toLocaleString('vi-VN', { maximumFractionDigits: 3 })}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {avail > 0 ? <span className="text-emerald-600 font-medium">{avail.toLocaleString('vi-VN', { maximumFractionDigits: 3 })}</span> : <span className="text-slate-300">0</span>}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={Math.min(avail, row.reqQty)}
                              step={0.001}
                              value={useFromStock}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setEditedRemain((prev) => ({ ...prev, [row.prDetailId]: Math.min(val, avail, row.reqQty) }));
                              }}
                              className="w-24 px-2 py-1 border border-slate-200 rounded text-right tabular-nums text-body focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]/30"
                              disabled={avail === 0}
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--color-brand,#002046)]">
                            {needToBuy.toLocaleString('vi-VN', { maximumFractionDigits: 3 })}
                          </td>
                          <td className="px-3 py-2">
                            <StockBar reqQty={row.reqQty} available={avail} />
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={row.stockStatus} />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => setHistoryPanel({ itemCode: row.itemCode, itemName: row.itemName })}
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-[var(--color-brand)] transition-colors"
                              title="Xem lịch sử mua hàng"
                            >
                              <span className="material-symbols-outlined text-[16px]">history</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History panel */}
      {historyPanel && (
        <PurchaseHistoryPanel
          itemCode={historyPanel.itemCode}
          itemName={historyPanel.itemName}
          onClose={() => setHistoryPanel(null)}
        />
      )}
    </div>
  );
}
