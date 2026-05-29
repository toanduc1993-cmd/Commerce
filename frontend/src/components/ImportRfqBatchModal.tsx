'use client';

/**
 * components/ImportRfqBatchModal.tsx — Sprint M4 Task E
 * Import Excel batch để tạo N RFQ song song theo targetRfqKey.
 *
 * Flow:
 *   1. Chọn project + tải mẫu Excel (pre-fill items 'Chờ báo giá')
 *   2. User điền cột targetRfqKey trong Excel
 *   3. Upload Excel → BE parse + group + tạo N BID
 *   4. Hiển thị kết quả: bao nhiêu BID, skip rows, errors
 */
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { PROJECTS } from '@/context/ProjectContext';
import { ensureCsrfToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';

interface CreatedBid {
  bidId: string;
  bidCode: string;
  subject: string;
  itemCount: number;
  mat: string;
  targetRfqKey: string;
}

interface SkippedRow {
  row: number;
  prDetailId: string;
  targetRfqKey: string;
  reason: string;
}

interface ImportResponse {
  created: CreatedBid[];
  skipped: SkippedRow[];
  errors: { row: number; error: string }[];
  summary: {
    totalRowsParsed: number;
    validRows: number;
    skippedRows: number;
    errorRows: number;
    bidsCreated: number;
  };
}

export function ImportRfqBatchModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [projectCode, setProjectCode] = useState<string>(PROJECTS[0]?.code || '');
  const [urgent, setUrgent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const handleDownloadTemplate = async () => {
    if (!projectCode) {
      toast.error('Chọn project trước');
      return;
    }
    const toastId = toast.loading('Đang tải mẫu Excel…');
    try {
      const r = await fetch(
        `${API_URL}/api/v1/prs/items-for-bidding/export-template?projectCode=${encodeURIComponent(projectCode)}`,
        { credentials: 'include' }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `RFQ_Import_Template_${projectCode}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`Đã tải ${a.download}`, { id: toastId });
    } catch (e) {
      toast.error(`Lỗi tải mẫu: ${(e as Error).message}`, { id: toastId });
    }
  };

  const handleFile = (f: File | null) => {
    if (!f) return setFile(null);
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('File phải có đuôi .xlsx');
      return;
    }
    if (f.size > 30 * 1024 * 1024) {
      toast.error('File quá 30 MB');
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file || !projectCode) {
      toast.error('Cần chọn project + file Excel');
      return;
    }
    setSubmitting(true);
    const toastId = toast.loading('Đang import…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('projectCode', projectCode);
      fd.append('urgent', urgent ? '1' : '0');
      const csrfToken = await ensureCsrfToken();
      const r = await fetch(`${API_URL}/api/v1/bid-analyses/import-rfq-batch`, {
        method: 'POST',
        credentials: 'include',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
        body: fd,
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        toast.error(d.error || `HTTP ${r.status}`, { id: toastId });
        if (d.details) setResult({ ...d.details, summary: { totalRowsParsed: 0, validRows: 0, skippedRows: d.details.skipped?.length || 0, errorRows: d.details.errors?.length || 0, bidsCreated: 0 }, created: [] } as ImportResponse);
        return;
      }
      setResult(d.data as ImportResponse);
      toast.success(`✅ Tạo ${d.data.created.length} RFQ từ file`, { id: toastId, duration: 5000 });
      onCreated();
    } catch (e) {
      toast.error(`Lỗi: ${(e as Error).message}`, { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-[var(--color-brand)] text-white px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-h3 text-white">📥 Import RFQ batch từ Excel</div>
            <div className="text-caption text-blue-200 mt-0.5">
              Tải mẫu · điền cột <code>targetRfqKey</code> · upload lại → tạo N RFQ trong 1 phát
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {/* Step 1 — Pick project + download template */}
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-emphasis mb-2">
              <span className="badge badge-info mr-2">Bước 1</span>
              Chọn dự án + Tải mẫu Excel
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value)}
                className="px-2 py-1.5 text-body border border-slate-300 rounded bg-white"
              >
                {PROJECTS.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-caption text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={urgent}
                  onChange={(e) => setUrgent(e.target.checked)}
                />
                Đánh dấu khẩn (prefix BID!)
              </label>
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[var(--color-success)] text-white text-caption font-semibold hover:opacity-90"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                Tải mẫu Excel
              </button>
            </div>
            <p className="text-caption text-slate-500 mt-2">
              Mẫu bao gồm tất cả items "Chờ báo giá" của dự án. Mở file, điền cột{' '}
              <strong className="text-[var(--color-brand)]">targetRfqKey</strong> (cột I, nền vàng).
              Cùng key → gom chung 1 BID. Bỏ trống → bỏ qua.
            </p>
          </div>

          {/* Step 2 — Upload */}
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-emphasis mb-2">
              <span className="badge badge-info mr-2">Bước 2</span>
              Upload Excel đã điền
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files[0] || null);
              }}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-[var(--color-info)] bg-[var(--color-info-soft)]'
                  : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
              }`}
              onClick={() => document.getElementById('import-rfq-file')?.click()}
            >
              <input
                id="import-rfq-file"
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <div>
                  <span className="material-symbols-outlined text-[36px] text-[var(--color-success)]">
                    upload_file
                  </span>
                  <div className="text-body font-semibold mt-1">{file.name}</div>
                  <div className="text-caption text-slate-500">
                    {(file.size / 1024).toFixed(1)} KB · click để đổi file
                  </div>
                </div>
              ) : (
                <div>
                  <span className="material-symbols-outlined text-[36px] text-slate-400">
                    cloud_upload
                  </span>
                  <div className="text-body mt-1">Kéo file vào đây hoặc click để chọn</div>
                  <div className="text-caption text-slate-400">Chỉ chấp nhận .xlsx (max 30 MB)</div>
                </div>
              )}
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="text-emphasis">
                <span className="badge badge-success mr-2">Kết quả</span>
                Tóm tắt
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { l: 'Rows hợp lệ', v: result.summary.validRows, c: 'text-[var(--color-success)]' },
                  {
                    l: 'BID đã tạo',
                    v: result.summary.bidsCreated,
                    c: 'text-[var(--color-brand)]',
                  },
                  { l: 'Skip', v: result.summary.skippedRows, c: 'text-amber-600' },
                  { l: 'Error', v: result.summary.errorRows, c: 'text-[var(--color-danger)]' },
                ].map((k) => (
                  <div key={k.l} className="bg-slate-50 rounded p-2">
                    <div className="label">{k.l}</div>
                    <div className={`text-h3 font-bold ${k.c}`}>{k.v}</div>
                  </div>
                ))}
              </div>

              {result.created.length > 0 && (
                <div>
                  <div className="text-caption font-semibold text-slate-600 mb-1">
                    Danh sách BID đã tạo:
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {result.created.map((b) => (
                      <div
                        key={b.bidId}
                        className="flex items-center gap-2 px-2 py-1 bg-[var(--color-success-soft)] rounded text-caption"
                      >
                        <code className="font-mono font-bold text-[var(--color-success)]">
                          {b.bidCode}
                        </code>
                        <span className="text-slate-500">·</span>
                        <span className="badge badge-info">{b.mat}</span>
                        <span className="text-slate-700">{b.itemCount} items</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-500 italic">key: "{b.targetRfqKey}"</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.skipped.length > 0 && (
                <details className="text-caption">
                  <summary className="cursor-pointer text-amber-700 font-semibold">
                    ⚠️ {result.skipped.length} rows bị skip
                  </summary>
                  <div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                    {result.skipped.map((s, i) => (
                      <div key={i} className="text-slate-600">
                        Row {s.row}: <code className="font-mono">{s.prDetailId.slice(0, 12)}…</code> —{' '}
                        {s.reason}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {result.errors.length > 0 && (
                <details className="text-caption">
                  <summary className="cursor-pointer text-[var(--color-danger)] font-semibold">
                    ❌ {result.errors.length} rows có lỗi
                  </summary>
                  <div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <div key={i} className="text-slate-600">
                        Row {e.row}: {e.error}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-body text-slate-600 hover:text-slate-800"
          >
            {result ? 'Đóng' : 'Hủy'}
          </button>
          {!result && (
            <button
              onClick={handleUpload}
              disabled={!file || submitting}
              className={`px-4 py-2 rounded-md text-body font-semibold inline-flex items-center gap-1 ${
                !file || submitting
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-[var(--color-brand)] text-white hover:opacity-90'
              }`}
            >
              {submitting ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[16px]">
                    progress_activity
                  </span>
                  Đang import…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">upload</span>
                  Import RFQ batch
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
