'use client';

/**
 * components/CreateRfqModal.tsx — Tạo BID/RFQ mới từ PR items (B-CPVT-018)
 *
 * Workflow:
 *   1. Chọn project (default = workspace)
 *   2. Multi-select PR items (status='Chờ báo giá') filtered by project
 *   3. Subject auto-suggest from items, user override
 *   4. Bidcode live preview (call /preview-bidcode endpoint)
 *   5. Submit → POST /api/v1/bid-analyses/from-pr → close modal + callback
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { PROJECTS } from '@/context/ProjectContext';
import { ensureCsrfToken } from '@/lib/api';
import { BidCodeDisplay } from './BidCodeDisplay';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';

interface PrItem {
  id: string;
  itemCode: string;
  itemName: string;
  profile?: string | null;
  grade?: string | null;
  uom?: string | null;
  reqQty: number;
  urgency: string;
  materialGroupCode?: string | null;
  pr?: { prRef?: string; project?: { code?: string; name?: string } } | null;
}

const MAT_OPTIONS = [
  { value: '', label: '— Tự động —' },
  { value: 'VTC', label: 'VTC — Thép chính' },
  { value: 'VPK', label: 'VPK — Phụ kiện, bu lông' },
  { value: 'VDK', label: 'VDK — Đóng kiện' },
  { value: 'VBP', label: 'VBP — Biện pháp' },
  { value: 'VTH', label: 'VTH — Tiêu hao' },
  { value: 'VTS', label: 'VTS — Sơn & xử lý bề mặt' },
  { value: 'VTP', label: 'VTP — Dự phòng' },
];

export function CreateRfqModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (bid: { id: string; bidCode: string; subject?: string | null }) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1); // 1 = chọn items, 2 = xác nhận
  const [projectCode, setProjectCode] = useState<string>(PROJECTS[0]?.code || '');
  const [matFilter, setMatFilter] = useState<string>('');
  const [items, setItems] = useState<PrItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [search, setSearch] = useState('');
  const [lastClickedId, setLastClickedId] = useState<string | null>(null); // Task D — shift+click range anchor
  const [prRefSelector, setPrRefSelector] = useState<string>(''); // Task B — bulk select theo PR Ref

  const [subject, setSubject] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [groupByMat, setGroupByMat] = useState(false); // Task A — tự gom theo Nhóm VT
  const [previewCode, setPreviewCode] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isAuthed =
    typeof window !== 'undefined' ? !!localStorage.getItem('ibshi_authed') : false;

  // Load PR items when project/filter changes
  useEffect(() => {
    if (!projectCode || !isAuthed) return;
    setIsLoadingItems(true);
    const params = new URLSearchParams({ projectCode });
    if (matFilter) params.set('materialGroupCode', matFilter);
    fetch(`${API_URL}/api/v1/prs/items-for-bidding?${params}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setItems(d.data || []);
        else toast.error(d.error || 'Lỗi tải PR items');
      })
      .catch((e) => toast.error(`Lỗi mạng: ${e.message}`))
      .finally(() => setIsLoadingItems(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCode, matFilter]);

  // Load preview bidcode when step 2
  useEffect(() => {
    if (step !== 2 || !projectCode) return;
    setPreviewLoading(true);
    // Pick mat from selected items
    const selectedItems = items.filter((it) => selectedIds.has(it.id));
    const matCounts: Record<string, number> = {};
    selectedItems.forEach((it) => {
      const m = it.materialGroupCode || 'ALL';
      matCounts[m] = (matCounts[m] || 0) + 1;
    });
    const codes = Object.keys(matCounts);
    let mat = 'ALL';
    if (codes.length === 1) mat = codes[0];
    else if (codes.length > 1) {
      const top = codes.sort((a, b) => matCounts[b] - matCounts[a])[0];
      mat = matCounts[top] / selectedItems.length > 0.6 ? top : 'MIX';
    }
    const params = new URLSearchParams({
      projectCode,
      materialGroupCode: mat,
      urgent: urgent ? '1' : '0',
    });
    fetch(`${API_URL}/api/v1/bid-analyses/preview-bidcode?${params}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setPreviewCode(d.data.bidCode);
      })
      .catch(() => {})
      .finally(() => setPreviewLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, projectCode, urgent, selectedIds.size]);

  // Auto-fill subject from selected items
  useEffect(() => {
    if (step !== 2 || subject) return;
    const selectedItems = items.filter((it) => selectedIds.has(it.id));
    const names = [...new Set(selectedItems.map((i) => i.itemName).filter(Boolean))];
    const head = names.slice(0, 3).join(', ');
    const more = names.length > 3 ? ` và ${names.length - 3} mã khác` : '';
    setSubject(head ? `Mua ${head}${more} cho DA ${projectCode}` : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.itemCode?.toLowerCase().includes(q) ||
        it.itemName?.toLowerCase().includes(q) ||
        it.profile?.toLowerCase().includes(q)
    );
  }, [items, search]);

  // Task D — shift+click range select. anchor = lastClickedId, target = id click hiện tại
  const handleRowClick = (id: string, e: React.MouseEvent | { shiftKey?: boolean }) => {
    const shift = (e as React.MouseEvent).shiftKey;
    if (shift && lastClickedId && lastClickedId !== id) {
      const ids = filtered.map((it) => it.id);
      const a = ids.indexOf(lastClickedId);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelectedIds((prev) => {
          const next = new Set(prev);
          // Toggle hành vi theo trạng thái anchor: nếu anchor được chọn → add range, ngược lại → remove
          const anchorSelected = prev.has(lastClickedId);
          for (let i = lo; i <= hi; i++) {
            if (anchorSelected) next.add(ids[i]);
            else next.delete(ids[i]);
          }
          return next;
        });
        return;
      }
    }
    // Click thường — toggle 1 item
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastClickedId(id);
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map((it) => it.id)));
  const clearSelection = () => setSelectedIds(new Set());

  // Task B — Bulk select theo PR Ref. List PR refs có trong items hiện tại.
  const prRefs = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((it) => {
      const ref = it.pr?.prRef;
      if (ref) map.set(ref, (map.get(ref) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ref, count]) => ({ ref, count }));
  }, [items]);

  const selectByPrRef = (ref: string) => {
    if (!ref) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((it) => {
        if (it.pr?.prRef === ref) next.add(it.id);
      });
      return next;
    });
    setPrRefSelector('');
  };

  // Số nhóm VT distinct trong selection (để hint cho Task A toggle)
  const distinctMats = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (selectedIds.has(it.id)) set.add(it.materialGroupCode || 'ALL');
    });
    return Array.from(set);
  }, [items, selectedIds]);

  const handleSubmit = async () => {
    if (!projectCode || selectedIds.size === 0) {
      toast.error('Chọn project + ít nhất 1 PR item');
      return;
    }
    setSubmitting(true);
    try {
      const csrfToken = await ensureCsrfToken();
      const mutHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) mutHeaders['X-CSRF-Token'] = csrfToken;
      if (groupByMat) {
        // Task A — Tạo N BID gom theo Nhóm VT
        const r = await fetch(`${API_URL}/api/v1/bid-analyses/from-pr-bulk-by-group`, {
          method: 'POST',
          credentials: 'include',
          headers: mutHeaders,
          body: JSON.stringify({
            projectCode,
            prDetailIds: Array.from(selectedIds),
            groupBy: 'materialGroupCode',
            urgent,
            notesPrefix: subject.trim() || undefined,
          }),
        });
        const d = await r.json();
        if (!r.ok || !d.success) {
          toast.error(d.error || `HTTP ${r.status}`);
          return;
        }
        const created = d.data.created || [];
        toast.success(
          `✅ Đã tạo ${created.length} RFQ (gom theo nhóm VT): ${created.map((b: { bidCode: string }) => b.bidCode).join(', ')}`,
          { duration: 6000 }
        );
        // onCreated nhận BID đầu tiên (modal close + redirect)
        if (created[0]) {
          onCreated({
            id: created[0].bidId,
            bidCode: created[0].bidCode,
            subject: created[0].subject,
          });
        } else {
          onClose();
        }
        return;
      }

      // Default — Tạo 1 BID
      const r = await fetch(`${API_URL}/api/v1/bid-analyses/from-pr`, {
        method: 'POST',
        credentials: 'include',
        headers: mutHeaders,
        body: JSON.stringify({
          projectCode,
          prDetailIds: Array.from(selectedIds),
          subject: subject.trim() || undefined,
          urgent,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        toast.error(d.error || `HTTP ${r.status}`);
        return;
      }
      toast.success(`✅ Tạo BID ${d.data.bid.bidCode} — ${d.data.itemCount} items`);
      onCreated(d.data.bid);
    } catch (e) {
      toast.error(`Lỗi mạng: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[var(--color-brand)] text-white px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-h3 text-white">Tạo Yêu Cầu Báo Giá (RFQ) mới</div>
            <div className="text-caption text-blue-200 mt-0.5">
              Bước {step}/2 · {step === 1 ? 'Chọn PR items để gom thành 1 BID' : 'Xác nhận & tạo'}
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {step === 1 ? (
          <>
            {/* Step 1: Filter + select items */}
            <div className="px-6 py-3 border-b border-slate-200 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="label">Dự án</span>
                <select
                  value={projectCode}
                  onChange={(e) => setProjectCode(e.target.value)}
                  className="px-2 py-1 text-body border border-slate-300 rounded bg-white"
                >
                  {PROJECTS.map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="label">Nhóm VT</span>
                <select
                  value={matFilter}
                  onChange={(e) => setMatFilter(e.target.value)}
                  className="px-2 py-1 text-body border border-slate-300 rounded bg-white"
                >
                  {MAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã/tên/profile..."
                className="flex-1 min-w-[200px] px-3 py-1 text-body border border-slate-300 rounded"
              />
              <div className="text-caption text-slate-500">
                <span className="font-bold text-[var(--color-info)]">{selectedIds.size}</span> /{' '}
                {filtered.length} chọn
              </div>
              <button
                onClick={selectAll}
                className="px-2 py-1 text-caption font-semibold text-[var(--color-info)] hover:underline"
              >
                Chọn tất cả
              </button>
              <button
                onClick={clearSelection}
                className="px-2 py-1 text-caption font-semibold text-slate-500 hover:underline"
              >
                Bỏ chọn
              </button>
              {prRefs.length > 0 && (
                <select
                  value={prRefSelector}
                  onChange={(e) => selectByPrRef(e.target.value)}
                  className="px-2 py-1 text-caption border border-slate-300 rounded bg-white"
                  title="Chọn nhanh tất cả items thuộc 1 PR"
                >
                  <option value="">📌 Theo PR Ref ▾</option>
                  {prRefs.map(({ ref, count }) => (
                    <option key={ref} value={ref}>
                      {ref} ({count} items)
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="px-6 py-1 border-b border-slate-200 bg-slate-50 text-caption text-slate-500 flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px] align-middle">info</span>
              <span>
                Mẹo: <kbd className="px-1 bg-white border border-slate-300 rounded text-[10px]">Shift</kbd>+click để chọn cả 1 dải hàng;
                dropdown <strong>📌 Theo PR Ref</strong> để chọn nhanh tất cả items của 1 PR.
              </span>
            </div>

            {/* Items table */}
            <div className="flex-1 overflow-auto px-6 py-3">
              {isLoadingItems ? (
                <div className="text-center py-8 text-slate-400">
                  <span className="material-symbols-outlined animate-spin mr-2">
                    progress_activity
                  </span>
                  Đang tải PR items...
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <span className="material-symbols-outlined text-[36px] block mx-auto opacity-30">
                    inbox
                  </span>
                  <p className="text-body mt-2">
                    Không có PR item nào ở trạng thái &quot;Chờ báo giá&quot; cho project này
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-white border-b border-slate-200">
                    <tr>
                      <th className="px-2 py-2 w-8"></th>
                      <th className="px-2 py-2 text-left label">Mã VT</th>
                      <th className="px-2 py-2 text-left label">Tên VT</th>
                      <th className="px-2 py-2 text-left label">Quy cách</th>
                      <th className="px-2 py-2 text-right label">SL</th>
                      <th className="px-2 py-2 text-left label">ĐV</th>
                      <th className="px-2 py-2 text-left label">PR ref</th>
                      <th className="px-2 py-2 text-left label">Nhóm</th>
                      <th className="px-2 py-2 text-center label">Khẩn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((it) => {
                      const checked = selectedIds.has(it.id);
                      return (
                        <tr
                          key={it.id}
                          className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer ${
                            checked ? 'bg-[var(--color-info-soft)]' : ''
                          }`}
                          onClick={(e) => handleRowClick(it.id, e)}
                        >
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleRowClick(it.id, {})}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-caption font-mono">{it.itemCode}</td>
                          <td className="px-2 py-1.5 text-body">{it.itemName}</td>
                          <td className="px-2 py-1.5 text-caption text-slate-500">
                            {it.profile} {it.grade && `· ${it.grade}`}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-emphasis">
                            {it.reqQty?.toLocaleString('vi-VN') || '0'}
                          </td>
                          <td className="px-2 py-1.5 text-caption">{it.uom || '—'}</td>
                          <td className="px-2 py-1.5 text-caption text-slate-500">
                            {it.pr?.prRef || '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            <span className="badge badge-info">
                              {it.materialGroupCode || 'ALL'}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {it.urgency === 'High' && <span className="badge badge-warning">High</span>}
                            {it.urgency === 'Critical' && (
                              <span className="badge badge-danger">Critical</span>
                            )}
                            {it.urgency === 'Normal' && (
                              <span className="text-caption text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
              <button
                onClick={onClose}
                className="px-4 py-2 text-body text-slate-600 hover:text-slate-800"
              >
                Hủy
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={selectedIds.size === 0}
                className={`px-4 py-2 rounded-md text-body font-semibold ${
                  selectedIds.size === 0
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-[var(--color-brand)] text-white hover:opacity-90'
                }`}
              >
                Tiếp theo · {selectedIds.size} items
                <span className="material-symbols-outlined text-[16px] align-middle ml-1">
                  arrow_forward
                </span>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Step 2: Confirm + preview bidcode + subject */}
            <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="label mb-1">
                  Bidcode (auto-generated)
                  {groupByMat && distinctMats.length > 1 && (
                    <span className="ml-2 text-caption text-[var(--color-info)] font-semibold">
                      · Sẽ tạo {distinctMats.length} mã (mỗi nhóm 1)
                    </span>
                  )}
                </div>
                {previewLoading ? (
                  <div className="text-body text-slate-400">
                    <span className="material-symbols-outlined animate-spin mr-1 text-[16px] align-middle">
                      progress_activity
                    </span>
                    Đang tạo mã...
                  </div>
                ) : groupByMat && distinctMats.length > 1 ? (
                  <div className="text-caption text-slate-500">
                    Preview: <code className="font-mono">BID-{projectCode}-YYMM-[{distinctMats.join('|')}]-NNN</code> ·
                    seq sẽ cấp khi tạo
                  </div>
                ) : (
                  <BidCodeDisplay bidCode={previewCode} subject={subject || undefined} />
                )}
              </div>

              <div>
                <label className="label">Subject (mô tả nội dung BID) *</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="VD: Mua thép tấm SS400 cho INLET-U1 — Đợt 1"
                  className="w-full mt-1 px-3 py-2 text-body border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--color-info)]"
                />
                <p className="text-caption text-slate-400 mt-1">
                  Mô tả ngắn giúp user nhìn vào hiểu ngay BID này về cái gì
                </p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
                <span className="text-body">Đánh dấu khẩn cấp (bidcode sẽ có prefix BID!)</span>
              </label>

              <div
                className={`border rounded-lg p-3 ${
                  groupByMat ? 'bg-[var(--color-info-soft)] border-[var(--color-info)]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={groupByMat}
                    onChange={(e) => setGroupByMat(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="text-body font-semibold">
                      🧰 Tự gom theo Nhóm VT — Tạo {distinctMats.length} RFQ riêng biệt
                    </div>
                    <div className="text-caption text-slate-500 mt-0.5">
                      Khi bật: hệ thống tách items thành <strong>{distinctMats.length}</strong> bid theo nhóm (
                      {distinctMats.join(', ') || '—'}), mỗi nhóm → 1 RFQ riêng.
                      <br />
                      Khi tắt: gộp tất cả {selectedIds.size} items vào 1 BID duy nhất (nhóm = MIX nếu khác nhau).
                    </div>
                    {groupByMat && distinctMats.length === 1 && (
                      <div className="text-caption text-amber-600 mt-1">
                        ⚠️ Chỉ có 1 nhóm — kết quả giống chế độ tắt.
                      </div>
                    )}
                  </div>
                </label>
              </div>

              <div className="bg-slate-50 rounded-lg p-4">
                <div className="label mb-2">Tóm tắt</div>
                <div className="grid grid-cols-2 gap-2 text-body">
                  <div>
                    <span className="text-slate-500">Dự án:</span>{' '}
                    <span className="text-emphasis">{projectCode}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Số PR items:</span>{' '}
                    <span className="text-emphasis">{selectedIds.size}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Trạng thái khởi tạo:</span>{' '}
                    <span className="badge badge-info">OPEN</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Ngày tạo:</span>{' '}
                    <span className="text-emphasis">{new Date().toLocaleDateString('vi-VN')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 text-body text-slate-600 hover:text-slate-800"
              >
                <span className="material-symbols-outlined text-[16px] align-middle">arrow_back</span>{' '}
                Quay lại chọn items
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || (!groupByMat && !subject.trim())}
                className={`px-4 py-2 rounded-md text-body font-semibold ${
                  submitting || (!groupByMat && !subject.trim())
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-[var(--color-success)] text-white hover:opacity-90'
                }`}
              >
                {submitting
                  ? 'Đang tạo...'
                  : groupByMat && distinctMats.length > 1
                    ? `Tạo ${distinctMats.length} RFQ`
                    : 'Tạo BID & Đóng modal'}
                <span className="material-symbols-outlined text-[16px] align-middle ml-1">
                  check
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
