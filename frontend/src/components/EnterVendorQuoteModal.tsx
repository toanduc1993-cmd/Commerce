'use client';

/**
 * EnterVendorQuoteModal.tsx — Nhập báo giá NCC
 *
 * 2 tab:
 *   1. Upload file (Excel/PDF) — recommended, có file gốc để kiểm tra audit
 *   2. Nhập tay — fallback khi NCC báo qua Zalo/điện thoại
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ensureCsrfToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';

// ─── Types ─────────────────────────────────────────────────────────────────

interface BidItem {
  id: string;
  itemCode?: string | null;
  itemName?: string | null;
  uom?: string | null;
  qtyToBuy?: number;
  qtyPR?: number;
}

interface BidVendor {
  id: string;
  vendorName: string;
  currency?: string;
  vendorType?: string;
  quoteFilePath?: string | null;
  quoteFileName?: string | null;
}

interface BidDetail {
  id: string;
  bidCode?: string | null;
  subject?: string | null;
  items: BidItem[];
  vendors: BidVendor[];
}

interface ParsedRow {
  rowNum: number;
  itemName: string;
  qty: number;
  uom: string;
  unitPrice: number;
  totalPrice: number;
  scope: string;
  matchedItemId: string | null;
  matchedItemName: string | null;
  matchScore: number;
}

interface UploadPreview {
  type: 'excel' | 'pdf' | 'excel_no_data';
  relPath: string;
  fileName: string;
  sheetName?: string;
  totalRows?: number;
  matchedCount?: number;
  rows?: ParsedRow[];
  message?: string;
}

interface ItemQuote {
  itemId: string;
  itemName: string;
  uom: string;
  qty: number;
  unitPrice: string;
  totalPrice: string;
  scope: 'V' | 'X' | '';
  manualTotal: boolean;
}

// ─── Main component ────────────────────────────────────────────────────────

export function EnterVendorQuoteModal({
  bidId,
  onClose,
  onSaved,
}: {
  bidId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<'upload' | 'manual'>('upload');
  const [loading, setLoading] = useState(true);
  const [bid, setBid] = useState<BidDetail | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/bid-analyses/${bidId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { toast.error(d.error || 'Không tải được bid'); onClose(); return; }
        setBid(d.data);
      })
      .catch((e) => { toast.error(`Lỗi: ${e.message}`); onClose(); })
      .finally(() => setLoading(false));
  }, [bidId, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-h3 font-semibold">Nhập báo giá NCC</h2>
            {bid && (
              <p className="text-meta text-gray-500 mt-0.5">
                {bid.bidCode || '(không mã)'} — {bid.subject || ''}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Đóng">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6 gap-1 pt-3">
          <button
            onClick={() => setTab('upload')}
            className={`px-4 py-2 text-body rounded-t font-medium border-b-2 transition-colors ${
              tab === 'upload'
                ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] mr-1.5 align-middle">upload_file</span>
            Upload file báo giá
            <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">
              Khuyến nghị
            </span>
          </button>
          <button
            onClick={() => setTab('manual')}
            className={`px-4 py-2 text-body rounded-t font-medium border-b-2 transition-colors ${
              tab === 'manual'
                ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] mr-1.5 align-middle">edit_note</span>
            Nhập tay
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="p-10 text-center text-gray-500">Đang tải chi tiết bid…</div>
        ) : !bid ? (
          <div className="p-10 text-center text-red-500">Không tải được bid</div>
        ) : tab === 'upload' ? (
          <UploadTab bid={bid} bidId={bidId} onClose={onClose} onSaved={onSaved} />
        ) : (
          <ManualTab bid={bid} bidId={bidId} onClose={onClose} onSaved={onSaved} />
        )}
      </div>
    </div>
  );
}

// ─── Upload Tab ────────────────────────────────────────────────────────────

function UploadTab({
  bid, bidId, onClose, onSaved,
}: { bid: BidDetail; bidId: string; onClose: () => void; onSaved: () => void }) {
  const [dragging, setDragging]     = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [preview, setPreview]       = useState<UploadPreview | null>(null);
  const [editedRows, setEditedRows] = useState<ParsedRow[]>([]);
  const [vendorName, setVendorName] = useState('');
  const [vendorType, setVendorType] = useState<'DOMESTIC' | 'IMPORT'>('DOMESTIC');
  const [currency, setCurrency]     = useState<'VND' | 'USD'>('VND');
  const [notes, setNotes]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    setUploading(true);
    setPreview(null);
    const csrfToken = await ensureCsrfToken();
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`${API_URL}/api/v1/bid-analyses/${bidId}/upload-quote`, {
        method: 'POST',
        credentials: 'include',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
        body: fd,
      });
      const data = await r.json();
      if (!r.ok || !data.success) throw new Error(data.error || 'Upload thất bại');
      setPreview(data);
      if (data.rows) setEditedRows(data.rows);
    } catch (e) {
      toast.error(`Lỗi upload: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }, [bidId]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  async function handleConfirm() {
    if (!vendorName.trim()) { toast.error('Vui lòng nhập tên NCC'); return; }
    if (!preview?.relPath) { toast.error('Chưa có file để xác nhận'); return; }

    const rows = editedRows.filter((r) => r.matchedItemId && r.unitPrice > 0);
    if (rows.length === 0) { toast.error('Không có dòng nào có giá > 0 và khớp item'); return; }

    setSubmitting(true);
    const toastId = toast.loading('Đang lưu…');
    try {
      const csrfToken = await ensureCsrfToken();
      const r = await fetch(`${API_URL}/api/v1/bid-analyses/${bidId}/confirm-quote-upload`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({
          vendorName: vendorName.trim(),
          vendorType, currency,
          notes: notes.trim() || undefined,
          relPath:  preview.relPath,
          fileName: preview.fileName,
          rows,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.success) throw new Error(data.error || 'Lưu thất bại');
      toast.success(
        `Đã lưu ${vendorName}: ${data.data.offersCreated} mới + ${data.data.offersUpdated} cập nhật`,
        { id: toastId }
      );
      onSaved(); onClose();
    } catch (e) {
      toast.error(`Lỗi: ${(e as Error).message}`, { id: toastId });
      setSubmitting(false);
    }
  }

  function updateRow(idx: number, patch: Partial<ParsedRow>) {
    setEditedRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  const matchedCount = editedRows.filter((r) => r.matchedItemId && r.unitPrice > 0).length;

  return (
    <div className="p-6 space-y-5">
      {/* Dropzone */}
      {!preview && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
          }`}
        >
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.pdf,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {uploading ? (
            <div className="text-gray-500">
              <span className="material-symbols-outlined text-4xl animate-spin block mx-auto mb-2">progress_activity</span>
              Đang đọc file…
            </div>
          ) : (
            <>
              <span className="material-symbols-outlined text-5xl text-gray-300 block mx-auto mb-3">upload_file</span>
              <p className="text-body font-medium text-gray-700">Kéo thả file vào đây hoặc nhấn để chọn</p>
              <p className="text-meta text-gray-400 mt-1">Hỗ trợ: Excel (.xlsx/.xls), PDF — tối đa 30MB</p>
              <p className="text-meta text-blue-600 mt-2">
                File Excel NCC fill vào template IBSHI sẽ được đọc giá tự động
              </p>
            </>
          )}
        </div>
      )}

      {/* PDF result */}
      {preview?.type === 'pdf' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-600 mt-0.5">picture_as_pdf</span>
            <div>
              <p className="text-body font-medium text-amber-800">File PDF đã lưu thành công</p>
              <p className="text-meta text-amber-700 mt-1">{preview.fileName}</p>
              <p className="text-meta text-gray-600 mt-2">{preview.message}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setPreview(null)} className="text-meta px-3 py-1.5 border rounded hover:bg-white">
                  Chọn file khác
                </button>
                <button onClick={() => { setPreview(null); }} className="text-meta px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">
                  Nhập giá tay cho file này
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Excel no data */}
      {preview?.type === 'excel_no_data' && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-body font-medium text-yellow-800">Không đọc được bảng giá từ Excel</p>
          <p className="text-meta text-gray-600 mt-1">{preview.message}</p>
          <p className="text-meta text-gray-500 mt-1">File đã lưu: {preview.fileName}</p>
          <button onClick={() => setPreview(null)} className="mt-3 text-meta px-3 py-1.5 border rounded hover:bg-white">
            Chọn file khác
          </button>
        </div>
      )}

      {/* Excel preview */}
      {preview?.type === 'excel' && preview.rows && (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-4 rounded-lg bg-gray-50 border px-4 py-3 text-meta">
            <span className="material-symbols-outlined text-green-600">check_circle</span>
            <span className="font-medium text-gray-700">
              {preview.fileName}
            </span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-600">{preview.totalRows} dòng đọc được</span>
            <span className="text-gray-500">·</span>
            <span className={matchedCount === 0 ? 'text-red-600 font-medium' : 'text-green-700 font-medium'}>
              {matchedCount} dòng khớp item BID
            </span>
            <button
              onClick={() => { setPreview(null); setEditedRows([]); }}
              className="ml-auto text-gray-400 hover:text-gray-600"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Vendor info */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="block text-meta font-medium text-gray-700 mb-1">
                Tên NCC <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                list="vendor-suggestions-upload"
                className="w-full px-3 py-2 border rounded text-body"
                placeholder="VD: Ngọc Hiếu, VSAN, Hoàng Hà..."
              />
              <datalist id="vendor-suggestions-upload">
                {bid.vendors.map((v) => <option key={v.id} value={v.vendorName} />)}
              </datalist>
              {bid.vendors.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className="text-meta text-gray-500">Đã có:</span>
                  {bid.vendors.map((v) => (
                    <button key={v.id} type="button"
                      onClick={() => { setVendorName(v.vendorName); if (v.currency) setCurrency(v.currency as 'VND'|'USD'); }}
                      className="text-meta px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      {v.vendorName}
                      {v.quoteFileName && <span className="ml-1 text-green-600">📎</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-meta font-medium text-gray-700 mb-1">Loại</label>
              <select value={vendorType} onChange={(e) => setVendorType(e.target.value as 'DOMESTIC'|'IMPORT')}
                className="w-full px-3 py-2 border rounded text-body">
                <option value="DOMESTIC">Nội địa</option>
                <option value="IMPORT">Nhập khẩu</option>
              </select>
            </div>
            <div>
              <label className="block text-meta font-medium text-gray-700 mb-1">Tiền tệ</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as 'VND'|'USD')}
                className="w-full px-3 py-2 border rounded text-body">
                <option value="VND">VND</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          {/* Preview table */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 border-b flex items-center justify-between">
              <span className="text-meta font-medium text-gray-700">
                Xem trước & chỉnh sửa trước khi lưu
              </span>
              <span className="text-meta text-gray-500">
                Dòng chưa khớp sẽ không được lưu
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-meta">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-2 py-2 text-left text-gray-600">Tên trong file NCC</th>
                    <th className="px-2 py-2 text-left text-gray-600">Khớp với item BID</th>
                    <th className="px-2 py-2 text-right w-20 text-gray-600">SL</th>
                    <th className="px-2 py-2 text-right w-32 text-gray-600">Đơn giá</th>
                    <th className="px-2 py-2 text-right w-32 text-gray-600">Thành tiền</th>
                    <th className="px-2 py-2 text-center w-16 text-gray-600">Scope</th>
                  </tr>
                </thead>
                <tbody>
                  {editedRows.map((row, idx) => (
                    <tr key={idx}
                      className={`border-t ${
                        !row.matchedItemId ? 'bg-red-50/40' :
                        row.unitPrice > 0 ? 'bg-green-50/20' : 'bg-yellow-50/30'
                      }`}
                    >
                      <td className="px-2 py-1.5 max-w-[200px]">
                        <span className="truncate block" title={row.itemName}>{row.itemName}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        {row.matchedItemId ? (
                          <span className="text-green-700 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">check_circle</span>
                            <span className="truncate max-w-[150px]" title={row.matchedItemName || ''}>
                              {row.matchedItemName}
                            </span>
                            <span className="text-gray-400 ml-1">{row.matchScore}%</span>
                          </span>
                        ) : (
                          <span className="text-red-500 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">cancel</span>
                            Không khớp
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">
                        {row.qty.toLocaleString('vi-VN')}
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" min="0" step="any"
                          value={row.unitPrice || ''}
                          onChange={(e) => {
                            const u = parseFloat(e.target.value) || 0;
                            updateRow(idx, { unitPrice: u, totalPrice: Math.round(u * row.qty) });
                          }}
                          className="w-full px-2 py-1 border rounded text-right tabular-nums text-[13px]"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" min="0" step="any"
                          value={row.totalPrice || ''}
                          onChange={(e) => updateRow(idx, { totalPrice: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1 border rounded text-right tabular-nums text-[13px]"
                          placeholder="auto"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={row.scope}
                          onChange={(e) => updateRow(idx, { scope: e.target.value as 'V'|'X' })}
                          className="w-full px-1 py-1 border rounded text-center text-[13px]">
                          <option value="V">V</option>
                          <option value="X">X</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <label className="block text-meta font-medium text-gray-700 mb-1">Ghi chú</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 border rounded text-body"
              placeholder="Điều kiện giao hàng, thanh toán, hiệu lực báo giá..." />
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 flex items-start gap-3">
            <span className="material-symbols-outlined text-blue-600 mt-0.5 shrink-0">info</span>
            <div className="text-meta text-blue-800">
              <strong>File gốc đã lưu</strong> — có thể download lại để kiểm tra audit.{' '}
              Báo giá lưu với <code>qualitySource=FILE_UPLOAD</code>.{' '}
              Dòng màu đỏ (không khớp item) sẽ không được lưu.
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center border-t pt-4">
            <span className="text-meta text-gray-500">
              {matchedCount} / {editedRows.length} dòng sẽ được lưu
            </span>
            <div className="flex gap-2">
              <button onClick={onClose} disabled={submitting}
                className="px-4 py-2 text-body border rounded hover:bg-gray-100">
                Hủy
              </button>
              <button onClick={handleConfirm} disabled={submitting || matchedCount === 0 || !vendorName.trim()}
                className="px-4 py-2 text-body bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                {submitting ? 'Đang lưu…' : `Xác nhận lưu ${matchedCount} dòng`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* No preview — just footer cancel */}
      {!preview && !uploading && (
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-body border rounded hover:bg-gray-100">
            Hủy
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Manual Tab ────────────────────────────────────────────────────────────

function ManualTab({
  bid, bidId, onClose, onSaved,
}: { bid: BidDetail; bidId: string; onClose: () => void; onSaved: () => void }) {
  const [vendorName, setVendorName] = useState('');
  const [vendorType, setVendorType] = useState<'DOMESTIC' | 'IMPORT'>('DOMESTIC');
  const [currency, setCurrency]     = useState<'VND' | 'USD'>('VND');
  const [notes, setNotes]           = useState('');
  const [submitting, setSubmitting] = useState(false);

  const realItems = useMemo(() =>
    (bid.items || []).filter((it) => {
      const n = (it.itemName || '').toLowerCase();
      return !n.startsWith('ghi chú') && !n.startsWith('người đề nghị');
    }),
  [bid.items]);

  const [items, setItems] = useState<ItemQuote[]>(() =>
    realItems.map((it) => ({
      itemId: it.id,
      itemName: it.itemName || it.itemCode || '(không tên)',
      uom: it.uom || '',
      qty: Number(it.qtyToBuy || it.qtyPR || 0),
      unitPrice: '', totalPrice: '', scope: 'V', manualTotal: false,
    }))
  );

  const grandTotal = useMemo(
    () => items.reduce((s, it) => s + (parseFloat(it.totalPrice) || 0), 0),
    [items]
  );

  function updateItem(idx: number, patch: Partial<ItemQuote>) {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      const row = next[idx];
      if (!row.manualTotal && (patch.unitPrice !== undefined)) {
        const u = parseFloat(row.unitPrice);
        if (!isNaN(u) && row.qty) row.totalPrice = String(Math.round(u * row.qty));
        else if (!row.unitPrice) row.totalPrice = '';
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (!vendorName.trim()) { toast.error('Vui lòng nhập tên NCC'); return; }
    const validItems = items
      .filter((it) => it.unitPrice && parseFloat(it.unitPrice) > 0)
      .map((it) => ({
        itemId: it.itemId,
        unitPrice: parseFloat(it.unitPrice),
        totalPrice: parseFloat(it.totalPrice) || 0,
        scope: it.scope || null,
      }));
    if (validItems.length === 0) { toast.error('Cần ít nhất 1 item có đơn giá > 0'); return; }
    setSubmitting(true);
    const toastId = toast.loading('Đang lưu báo giá…');
    try {
      const csrfToken = await ensureCsrfToken();
      const r = await fetch(`${API_URL}/api/v1/bid-analyses/${bidId}/quotes`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        body: JSON.stringify({ vendorName: vendorName.trim(), vendorType, currency, notes: notes.trim() || undefined, items: validItems }),
      });
      const data = await r.json();
      if (!r.ok || !data.success) throw new Error(data.error || 'Lưu thất bại');
      toast.success(`Đã lưu ${vendorName}: ${data.data.offersCreated} mới + ${data.data.offersUpdated} cập nhật`, { id: toastId });
      onSaved(); onClose();
    } catch (e) {
      toast.error(`Lỗi: ${(e as Error).message}`, { id: toastId });
      setSubmitting(false);
    }
  }

  return (
    <div className="p-5 space-y-4">
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
        <span className="material-symbols-outlined text-amber-600 mt-0.5 shrink-0">warning</span>
        <p className="text-meta text-amber-800">
          Nhập tay không có file gốc để kiểm tra. Dùng tab <strong>Upload file</strong> nếu NCC đã gửi Excel/PDF.
        </p>
      </div>

      {/* Vendor info */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="block text-meta font-medium text-gray-700 mb-1">
            Tên NCC <span className="text-red-500">*</span>
          </label>
          <input type="text" value={vendorName} onChange={(e) => setVendorName(e.target.value)}
            list="vendor-suggestions-manual" className="w-full px-3 py-2 border rounded text-body"
            placeholder="VD: Ngọc Hiếu, VSAN, Hoàng Hà..." />
          <datalist id="vendor-suggestions-manual">
            {bid.vendors.map((v) => <option key={v.id} value={v.vendorName} />)}
          </datalist>
          {bid.vendors.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-meta text-gray-500">Đã có:</span>
              {bid.vendors.map((v) => (
                <button key={v.id} type="button"
                  onClick={() => { setVendorName(v.vendorName); if (v.currency === 'USD' || v.currency === 'VND') setCurrency(v.currency); }}
                  className="text-meta px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100">
                  {v.vendorName}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-meta font-medium text-gray-700 mb-1">Loại</label>
          <select value={vendorType} onChange={(e) => setVendorType(e.target.value as 'DOMESTIC'|'IMPORT')}
            className="w-full px-3 py-2 border rounded text-body">
            <option value="DOMESTIC">Nội địa</option>
            <option value="IMPORT">Nhập khẩu</option>
          </select>
        </div>
        <div>
          <label className="block text-meta font-medium text-gray-700 mb-1">Tiền tệ</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as 'VND'|'USD')}
            className="w-full px-3 py-2 border rounded text-body">
            <option value="VND">VND</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      {/* Items grid */}
      <div className="border rounded overflow-hidden">
        <table className="w-full text-meta">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2 text-left">Tên vật tư</th>
              <th className="px-2 py-2 text-right w-20">SL</th>
              <th className="px-2 py-2 text-left w-16">ĐVT</th>
              <th className="px-2 py-2 text-right w-32">Đơn giá</th>
              <th className="px-2 py-2 text-right w-36">Thành tiền</th>
              <th className="px-2 py-2 text-center w-16">Scope</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="px-2 py-4 text-center text-gray-500">Bid chưa có item nào.</td></tr>
            ) : (
              items.map((it, idx) => (
                <tr key={it.itemId} className="border-t hover:bg-gray-50">
                  <td className="px-2 py-1.5">{it.itemName}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{it.qty.toLocaleString('vi-VN')}</td>
                  <td className="px-2 py-1.5">{it.uom}</td>
                  <td className="px-2 py-1.5">
                    <input type="number" min="0" step="any" value={it.unitPrice}
                      onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                      className="w-full px-2 py-1 border rounded text-right tabular-nums" placeholder="0" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" min="0" step="any" value={it.totalPrice}
                      onChange={(e) => updateItem(idx, { totalPrice: e.target.value, manualTotal: true })}
                      className="w-full px-2 py-1 border rounded text-right tabular-nums" placeholder="auto" />
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={it.scope}
                      onChange={(e) => updateItem(idx, { scope: e.target.value as 'V'|'X'|'' })}
                      className="w-full px-1 py-1 border rounded text-center">
                      <option value="V">V</option>
                      <option value="X">X</option>
                      <option value="">—</option>
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-gray-50 font-medium">
            <tr>
              <td colSpan={4} className="px-2 py-2 text-right">Tổng cộng:</td>
              <td className="px-2 py-2 text-right tabular-nums">{grandTotal.toLocaleString('vi-VN')} {currency}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div>
        <label className="block text-meta font-medium text-gray-700 mb-1">Ghi chú</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          className="w-full px-3 py-2 border rounded text-body"
          placeholder="Điều kiện giao hàng, thanh toán, hiệu lực báo giá..." />
      </div>

      <p className="text-meta text-gray-500">
        ℹ️ Báo giá lưu với <code>qualitySource=MANUAL</code>. Item bỏ trống đơn giá sẽ không được tạo offer.
      </p>

      <div className="flex justify-end gap-2 border-t pt-4">
        <button onClick={onClose} disabled={submitting}
          className="px-4 py-2 text-body border rounded hover:bg-gray-100">Hủy</button>
        <button onClick={handleSubmit} disabled={submitting || items.length === 0}
          className="px-4 py-2 text-body bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          {submitting ? 'Đang lưu…' : 'Lưu báo giá'}
        </button>
      </div>
    </div>
  );
}
