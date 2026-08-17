'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  fetchTechThreadsByPR,
  addTechComment,
  updateTechThreadStatus,
  type TechThreadRow,
  type TechThreadsResult,
  type TechCommentItem,
  type PrLineOption,
} from '@/lib/api';
import { Sidebar } from '@/components/layout/Sidebar';
import { PurchaseHistoryPanel } from '@/components/PurchaseHistoryPanel';
import { useWorkspace } from '@/context/WorkspaceContext';

const STATUS_CONFIG = {
  PENDING: { label: 'Chưa làm rõ', cls: 'bg-slate-100 text-slate-500', icon: 'pending' },
  IN_DISCUSSION: { label: 'Đang trao đổi', cls: 'bg-violet-100 text-violet-700', icon: 'chat' },
  CLARIFIED: { label: 'Đã làm rõ', cls: 'bg-emerald-100 text-emerald-700', icon: 'check_circle' },
  SUBSTITUTION_REQUESTED: { label: 'Xin chuyển đổi', cls: 'bg-amber-100 text-amber-700', icon: 'swap_horiz' },
  APPROVED: { label: 'Đã duyệt', cls: 'bg-emerald-100 text-emerald-700', icon: 'verified' },
  REJECTED: { label: 'Từ chối', cls: 'bg-red-100 text-red-600', icon: 'cancel' },
};

const COMMENT_TYPE_LABELS: Record<string, string> = {
  QUESTION: 'Câu hỏi',
  ANSWER: 'Trả lời',
  SUBSTITUTION_REQUEST: 'Xin chuyển đổi',
  APPROVAL: 'Duyệt',
  REJECTION: 'Từ chối',
  NOTE: 'Ghi chú',
};

const COMMENT_TYPE_COLORS: Record<string, string> = {
  QUESTION: 'bg-blue-50 text-blue-700 border-blue-200',
  ANSWER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SUBSTITUTION_REQUEST: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVAL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTION: 'bg-red-50 text-red-700 border-red-200',
  NOTE: 'bg-slate-50 text-slate-600 border-slate-200',
};

const ROLE_COLORS: Record<string, string> = {
  MUA_HANG: 'bg-blue-600',
  KY_THUAT: 'bg-violet-600',
  ADMIN: 'bg-slate-700',
  QC: 'bg-emerald-600',
  BOD: 'bg-amber-600',
};

function Avatar({ name, role }: { name: string; role?: string }) {
  const initials = name.split(' ').map((w) => w[0]).slice(-2).join('').toUpperCase();
  const color = ROLE_COLORS[role || ''] || 'bg-slate-500';
  return (
    <div className={`w-7 h-7 rounded-full ${color} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
      {initials || '?'}
    </div>
  );
}

function fmtDate(d: string) {
  const dt = new Date(d);
  const now = new Date();
  const diff = (now.getTime() - dt.getTime()) / 1000;
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return Math.floor(diff / 60) + ' phút trước';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h trước';
  return dt.toLocaleDateString('vi-VN');
}

// ─── TechPanel (slide-in) ─────────────────────────────────────────────────────

interface TechPanelProps {
  row: TechThreadRow;
  onClose: () => void;
  onUpdated: () => void;
}

function TechPanel({ row, onClose, onUpdated }: TechPanelProps) {
  const [newContent, setNewContent] = useState('');
  const [commentType, setCommentType] = useState('NOTE');
  const [threadStatus, setThreadStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!newContent.trim()) return;
    setSubmitting(true);
    try {
      await addTechComment(row.prDetailId, {
        content: newContent.trim(),
        commentType,
        threadStatus: threadStatus || undefined,
      });
      setNewContent('');
      setCommentType('NOTE');
      setThreadStatus(null);
      onUpdated();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (status: string, note?: string) => {
    try {
      await updateTechThreadStatus(row.prDetailId, { threadStatus: status, note });
      onUpdated();
    } catch {
      // ignore
    }
  };

  const currentStatus = row.threadStatus;
  const cfg = STATUS_CONFIG[currentStatus as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDING;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[480px] bg-white h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-[var(--color-surface-container,#e5eeff)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-caption text-slate-500 uppercase tracking-wide font-medium">Làm rõ kỹ thuật</div>
              <div className="font-semibold text-[var(--color-brand,#002046)] truncate">{row.itemCode}</div>
              <div className="text-body text-slate-600 truncate">{row.itemName}</div>
              <div className="flex items-center gap-3 mt-1.5 text-caption text-slate-500">
                <span>YC: {row.reqQty.toLocaleString()} {row.uom}</span>
                <span>Mua: {row.toBuyQty.toLocaleString()} {row.uom}</span>
                {row.grade && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{row.grade}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`flex items-center gap-1 px-2 py-1 rounded text-caption font-medium ${cfg.cls}`}>
                <span className="material-symbols-outlined text-[14px]">{cfg.icon}</span>
                {cfg.label}
              </span>
              <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-200">
                <span className="material-symbols-outlined text-[20px] text-slate-500">close</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick status actions */}
        {currentStatus === 'SUBSTITUTION_REQUESTED' && (
          <div className="px-5 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-amber-600">swap_horiz</span>
            <span className="text-caption text-amber-700 flex-1 font-medium">Đang chờ duyệt chuyển đổi vật tư</span>
            <button onClick={() => handleStatusChange('APPROVED', 'Chuyển đổi vật tư được duyệt')}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded text-caption font-medium hover:bg-emerald-700">
              Duyệt
            </button>
            <button onClick={() => handleStatusChange('REJECTED', 'Yêu cầu chuyển đổi bị từ chối')}
              className="px-3 py-1.5 bg-red-500 text-white rounded text-caption font-medium hover:bg-red-600">
              Từ chối
            </button>
          </div>
        )}

        {/* Comments */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {row.comments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-300 gap-2">
              <span className="material-symbols-outlined text-[36px]">chat_bubble_outline</span>
              <div className="text-caption">Chưa có trao đổi nào</div>
            </div>
          )}
          {row.comments.map((c: TechCommentItem) => (
            <div key={c.id} className="flex gap-2.5">
              <Avatar name={c.authorName} role={c.authorRole} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-caption font-semibold text-slate-800">{c.authorName}</span>
                  <span className={`px-1.5 py-0 rounded border text-[10px] font-medium ${COMMENT_TYPE_COLORS[c.commentType] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                    {COMMENT_TYPE_LABELS[c.commentType] || c.commentType}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-auto">{fmtDate(c.createdAt)}</span>
                </div>
                <div className={`p-3 rounded-lg text-body text-slate-700 ${COMMENT_TYPE_COLORS[c.commentType]?.split(' ').slice(0, 1).join('') || 'bg-slate-50'}`}>
                  {c.content}
                </div>
                {c.threadStatus && (
                  <div className="mt-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_CONFIG[c.threadStatus as keyof typeof STATUS_CONFIG]?.cls || 'bg-slate-100 text-slate-500'}`}>
                      → {STATUS_CONFIG[c.threadStatus as keyof typeof STATUS_CONFIG]?.label || c.threadStatus}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* New comment */}
        <div className="px-5 py-4 border-t border-slate-200 space-y-3">
          {/* Quick tags */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { type: 'QUESTION', label: 'Hỏi kỹ thuật', status: 'IN_DISCUSSION' },
              { type: 'ANSWER', label: 'Trả lời', status: 'CLARIFIED' },
              { type: 'SUBSTITUTION_REQUEST', label: 'Xin chuyển đổi', status: 'SUBSTITUTION_REQUESTED' },
              { type: 'NOTE', label: 'Ghi chú', status: null },
            ].map((q) => (
              <button
                key={q.type}
                onClick={() => { setCommentType(q.type); if (q.status) setThreadStatus(q.status); }}
                className={`px-2.5 py-1 rounded text-caption font-medium border transition-colors ${
                  commentType === q.type
                    ? `${COMMENT_TYPE_COLORS[q.type]} border-current`
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit(); }}
            placeholder="Nhập nội dung trao đổi... (Ctrl+Enter để gửi)"
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-body resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30 focus:border-[var(--color-brand)]"
          />
          <div className="flex items-center justify-between">
            {threadStatus && (
              <span className={`text-caption px-2 py-0.5 rounded ${STATUS_CONFIG[threadStatus as keyof typeof STATUS_CONFIG]?.cls || 'bg-slate-100 text-slate-500'}`}>
                Chuyển trạng thái → {STATUS_CONFIG[threadStatus as keyof typeof STATUS_CONFIG]?.label}
              </span>
            )}
            <div className="flex gap-2 ml-auto">
              {threadStatus && (
                <button onClick={() => setThreadStatus(null)} className="text-caption text-slate-400 hover:text-slate-600 px-2 py-1">
                  Bỏ chuyển trạng thái
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={!newContent.trim() || submitting}
                className="px-4 py-2 bg-[var(--color-brand,#002046)] text-white rounded-lg text-caption font-semibold hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Đang gửi...' : 'Gửi'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SKU Card ─────────────────────────────────────────────────────────────────

function SkuCard({ row, onOpenPanel, onOpenHistory, onQuickStatus }: {
  row: TechThreadRow;
  onOpenPanel: () => void;
  onOpenHistory: () => void;
  onQuickStatus: (status: string, note: string) => Promise<void>;
}) {
  const cfg = STATUS_CONFIG[row.threadStatus as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDING;
  const borderColor = {
    PENDING: 'border-slate-200',
    IN_DISCUSSION: 'border-violet-300',
    CLARIFIED: 'border-emerald-300',
    SUBSTITUTION_REQUESTED: 'border-amber-400',
    APPROVED: 'border-emerald-400',
    REJECTED: 'border-red-300',
  }[row.threadStatus] || 'border-slate-200';

  return (
    <div className={`bg-white rounded-xl border ${borderColor} p-4 hover:shadow-sm transition-shadow`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[var(--color-brand,#002046)]">{row.itemCode}</span>
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-caption font-medium ${cfg.cls}`}>
              <span className="material-symbols-outlined text-[12px]">{cfg.icon}</span>
              {cfg.label}
            </span>
            {row.urgency !== 'Normal' && (
              <span className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-[10px] font-medium">{row.urgency}</span>
            )}
          </div>
          <div className="text-body text-slate-600 mt-0.5 truncate">{row.itemName}</div>
          <div className="flex items-center gap-3 mt-1 text-caption text-slate-400">
            {row.profile && <span>{row.profile}</span>}
            {row.grade && <span className="text-blue-600">{row.grade}</span>}
            <span>YC: {row.reqQty.toLocaleString()} {row.uom}</span>
            <span>Mua: {row.toBuyQty.toLocaleString()} {row.uom}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={onOpenHistory} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-[var(--color-brand)]" title="Lịch sử">
            <span className="material-symbols-outlined text-[16px]">history</span>
          </button>
          <button onClick={onOpenPanel} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-[var(--color-brand)]" title="Mở thread">
            <span className="material-symbols-outlined text-[16px]">chat</span>
          </button>
        </div>
      </div>

      {/* Latest comment preview */}
      {row.latestComment && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-start gap-2">
            <Avatar name={row.latestComment.authorName} role={row.latestComment.authorRole} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-caption font-semibold text-slate-700">{row.latestComment.authorName}</span>
                <span className="text-[10px] text-slate-400">{fmtDate(row.latestComment.createdAt)}</span>
                <span className="ml-auto text-caption text-slate-400">{row.commentCount} tin nhắn</span>
              </div>
              <div className="text-caption text-slate-500 line-clamp-2 mt-0.5">{row.latestComment.content}</div>
            </div>
          </div>
        </div>
      )}

      {/* Substitution quick-actions */}
      {row.threadStatus === 'SUBSTITUTION_REQUESTED' && (
        <div className="mt-3 pt-3 border-t border-amber-100 flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px] text-amber-600">swap_horiz</span>
          <span className="text-caption text-amber-700 flex-1">Chờ duyệt chuyển đổi vật tư</span>
          <button onClick={() => onQuickStatus('APPROVED', 'Chuyển đổi vật tư được duyệt')}
            className="px-3 py-1 bg-emerald-600 text-white rounded text-[10px] font-medium hover:bg-emerald-700">
            Duyệt
          </button>
          <button onClick={() => onQuickStatus('REJECTED', 'Yêu cầu chuyển đổi bị từ chối')}
            className="px-3 py-1 bg-red-500 text-white rounded text-[10px] font-medium hover:bg-red-600">
            Từ chối
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Biểu mẫu nêu yêu cầu làm rõ ──────────────────────────────────────────────
// Bắt buộc đi kèm việc lọc danh sách, KHÔNG phải phần trang trí. Sau khi màn 1c chỉ
// còn hiện dòng đã có yêu cầu, đây là đường DUY NHẤT tạo được yêu cầu mới — bỏ nó
// thì màn hình trống vĩnh viễn.

function BieuMauNeuYeuCau({
  prLines, daCoYeuCau, onCreated,
}: {
  prLines: PrLineOption[];
  daCoYeuCau: Set<string>;
  onCreated: () => Promise<void>;
}) {
  const [mo, setMo] = useState(false);
  const [tim, setTim] = useState('');
  const [chon, setChon] = useState<PrLineOption | null>(null);
  const [loai, setLoai] = useState('QUESTION');
  const [noiDung, setNoiDung] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  const conLai = useMemo(
    () => prLines.filter((l) => !daCoYeuCau.has(l.id)),
    [prLines, daCoYeuCau],
  );
  const ketQua = useMemo(() => {
    const s = tim.trim().toLowerCase();
    const nguon = s
      ? conLai.filter((l) => l.itemCode.toLowerCase().includes(s) || l.itemName.toLowerCase().includes(s))
      : conLai;
    return nguon.slice(0, 50);
  }, [conLai, tim]);

  const LOAI = [
    { id: 'QUESTION', nhan: 'Hỏi kỹ thuật', tt: 'IN_DISCUSSION' },
    { id: 'SUBSTITUTION_REQUEST', nhan: 'Xin chuyển đổi', tt: 'SUBSTITUTION_REQUESTED' },
    { id: 'NOTE', nhan: 'Ghi chú', tt: 'PENDING' },
  ];

  const gui = async () => {
    if (!chon || !noiDung.trim()) return;
    setDangGui(true);
    setLoi(null);
    try {
      await addTechComment(chon.id, {
        content: noiDung.trim(),
        commentType: loai,
        threadStatus: LOAI.find((x) => x.id === loai)?.tt ?? 'PENDING',
      });
      // Dòng vừa nêu chỉ lọt qua bộ lọc ở lần gọi API kế tiếp — bắt buộc tải lại,
      // quên chỗ này thì bấm Gửi xong màn vẫn trống, người dùng tưởng mất dữ liệu.
      await onCreated();
      setChon(null); setNoiDung(''); setTim(''); setMo(false);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : 'Không gửi được');
    } finally {
      setDangGui(false);
    }
  };

  if (!mo) {
    return (
      <button
        onClick={() => setMo(true)}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-300 rounded-xl text-body text-slate-500 hover:border-[var(--color-brand,#002046)] hover:text-[var(--color-brand,#002046)] transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">add_comment</span>
        Nêu một yêu cầu làm rõ
      </button>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-body font-semibold text-slate-800">Nêu yêu cầu làm rõ</div>
        <button onClick={() => setMo(false)} className="text-slate-400 hover:text-slate-600">
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className="mb-4">
        <label className="block text-caption text-slate-500 mb-1.5">Chọn dòng vật tư của phiếu</label>
        {chon ? (
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="min-w-0">
              <span className="text-body font-semibold text-slate-800">{chon.itemCode}</span>
              <span className="text-caption text-slate-500 ml-2 truncate">{chon.itemName}</span>
            </div>
            <button onClick={() => setChon(null)} className="text-caption text-slate-400 hover:text-slate-600 shrink-0 ml-3">
              đổi
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={tim}
              onChange={(e) => setTim(e.target.value)}
              placeholder={`Tìm trong ${conLai.length} dòng chưa có yêu cầu…`}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-caption focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]/30"
            />
            {tim.trim() !== '' && (
              <div className="mt-1 max-h-52 overflow-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {ketQua.length === 0 && (
                  <div className="px-3 py-2 text-caption text-slate-400">Không có dòng nào khớp</div>
                )}
                {ketQua.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => { setChon(l); setTim(''); }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50"
                  >
                    <span className="text-caption font-semibold text-slate-700">{l.itemCode}</span>
                    <span className="text-caption text-slate-500 ml-2">{l.itemName}</span>
                    {l.grade && <span className="text-caption text-slate-400 ml-2">{l.grade}</span>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mb-4">
        <label className="block text-caption text-slate-500 mb-1.5">Loại</label>
        <div className="flex gap-1.5">
          {LOAI.map((x) => (
            <button
              key={x.id}
              onClick={() => setLoai(x.id)}
              className={`px-3 py-1.5 rounded-lg text-caption font-medium transition-colors ${
                loai === x.id
                  ? 'bg-[var(--color-brand,#002046)] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {x.nhan}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-caption text-slate-500 mb-1.5">Nội dung</label>
        <textarea
          value={noiDung}
          onChange={(e) => setNoiDung(e.target.value)}
          rows={3}
          placeholder="Ví dụ: bản vẽ cho phép hai tiêu chuẩn, xin xác nhận mua theo tiêu chuẩn nào."
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-caption focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]/30"
        />
      </div>

      {loi && (
        <div className="mb-3 px-3 py-2 bg-red-50 rounded-lg text-caption text-red-600">{loi}</div>
      )}

      <button
        onClick={gui}
        disabled={!chon || !noiDung.trim() || dangGui}
        className="px-4 py-2 bg-[var(--color-brand,#002046)] text-white rounded-lg text-body font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        {dangGui ? 'Đang gửi…' : 'Gửi yêu cầu'}
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LamRoKyThuatPage() {
  const searchParams = useSearchParams();
  const prId = searchParams.get('prId') || '';
  const { project: duAnThanhBen } = useWorkspace();

  const [data, setData] = useState<TechThreadsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPanel, setSelectedPanel] = useState<TechThreadRow | null>(null);
  const [historyPanel, setHistoryPanel] = useState<{ itemCode: string; itemName: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterSearch, setFilterSearch] = useState('');

  const load = useCallback(async () => {
    if (!prId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTechThreadsByPR(prId);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [prId]);

  useEffect(() => { load(); }, [load]);

  const handleQuickStatus = async (prDetailId: string, status: string, note: string) => {
    try {
      await updateTechThreadStatus(prDetailId, { threadStatus: status, note });
      await load();
    } catch {
      // ignore
    }
  };

  const filteredRows = data?.rows.filter((r) => {
    if (filterStatus !== 'ALL' && r.threadStatus !== filterStatus) return false;
    if (filterSearch) {
      const s = filterSearch.toLowerCase();
      return r.itemCode.toLowerCase().includes(s) || r.itemName.toLowerCase().includes(s);
    }
    return true;
  }) ?? [];

  const summary = data?.summary;

  return (
    // 15/08/2026 — khung chuẩn giống /mua-hang và /duyet:
    //   · có thanh menu (M-01). Trước đây trang này không dựng Sidebar nên bấm vào là mất
    //     sạch điều hướng.
    //   · cột dọc h-screen overflow-hidden; tiêu đề, thẻ đếm và thanh lọc nằm ngoài vùng cuộn
    //     nên luôn thấy (M-04). Trước đây cả trang cao 51.949px — 58 màn hình — cuộn xuống
    //     12% là thanh lọc và nút Tạo RFQ đã ra khỏi màn, muốn lọc lại phải cuộn ngược lên đầu.
    <div className="flex min-h-screen bg-[#f4f6fb]">
      <Sidebar />
      <div className="flex-1 ml-64 flex flex-col h-screen overflow-hidden">
      {/* Header + thẻ đếm + thanh lọc — đứng yên, không cuộn theo */}
      <div className="bg-white border-b border-slate-200 px-8 py-5 shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-caption text-slate-400 mb-1">
              <span>Bước 1</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="font-medium text-slate-600">1c. Làm rõ kỹ thuật</span>
              {data?.project && (
                <>
                  <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                  <span className="text-slate-500">{data.project.code}</span>
                  <span className="text-slate-400">· phiếu {data.pr.prRef}</span>
                </>
              )}
            </div>
            <h1 className="text-h1">Làm Rõ Kỹ Thuật</h1>
            {summary && (
              <div className="flex flex-wrap items-center gap-4 mt-2">
                {[
                  // 'Tổng SKU' cũ mơ hồ — tổng của phiếu hay tổng đang hiện? Tách hẳn ra,
                  // để không lặp lại chuyện 230 dòng vô can bị đọc thành 230 việc phải làm.
                  { label: 'dòng của phiếu', value: summary.total, color: 'text-slate-800' },
                  { label: 'có yêu cầu làm rõ', value: summary.raised, color: 'text-slate-800' },
                  { label: 'đang vướng', value: summary.openIssues, color: summary.openIssues ? 'text-amber-600' : 'text-slate-400' },
                  { label: 'đã làm rõ', value: summary.clarified + summary.approved, color: 'text-emerald-600' },
                  { label: 'từ chối', value: summary.rejected, color: 'text-red-500' },
                ].map((kpi) => (
                  <div key={kpi.label} className="flex items-center gap-1.5">
                    <span className={`text-title font-bold ${kpi.color}`}>{kpi.value}</span>
                    <span className="text-caption text-slate-500">{kpi.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {summary && (
            <div className="flex items-center gap-2">
              <a
                href={`/bao-gia?prId=${prId}`}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--color-brand,#002046)] text-white rounded-lg text-body font-semibold hover:opacity-90 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">forward_to_inbox</span>
                Tạo RFQ ({summary.readyForRFQ}/{summary.total} SKU sẵn sàng)
              </a>
            </div>
          )}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1 max-w-xs">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">search</span>
            <input
              type="text"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="Tìm mã, tên vật tư..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-caption focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]/30"
            />
          </div>
          <div className="flex gap-1">
            {[
              // Nhãn cũ 'Chưa làm rõ' khớp 230/230 dòng vì mọi dòng đều bị gán PENDING.
              // Nay danh sách chỉ còn dòng CÓ yêu cầu, PENDING mang nghĩa thật: đã nêu,
              // chưa ai xử lý.
              { id: 'ALL', label: 'Tất cả' },
              { id: 'PENDING', label: 'Chưa xử lý' },
              { id: 'IN_DISCUSSION', label: 'Đang trao đổi' },
              { id: 'SUBSTITUTION_REQUESTED', label: 'Xin chuyển đổi' },
              { id: 'CLARIFIED', label: 'Đã làm rõ' },
              { id: 'APPROVED', label: 'Đã duyệt' },
              { id: 'REJECTED', label: 'Từ chối' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterStatus(f.id)}
                className={`px-3 py-1.5 rounded-lg text-caption font-medium transition-colors ${
                  filterStatus === f.id
                    ? 'bg-[var(--color-brand,#002046)] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Vùng cuộn: chỉ danh sách thẻ cuộn ── */}
      <div className="flex-1 overflow-auto min-h-0">
      {/* Content */}
      <div className="px-8 py-6">
        {!prId && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <span className="material-symbols-outlined text-[48px]">link</span>
            <div className="text-body">Mở trang này từ màn hình PR</div>
            <div className="text-caption">(URL cần có tham số <code className="bg-slate-100 px-1 rounded">prId</code>)</div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <span className="material-symbols-outlined animate-spin text-[28px] mr-2">progress_activity</span>
            Đang tải...
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 rounded-lg text-red-600 text-body flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            {error}
          </div>
        )}

        {/* Băng vàng CHỈ hiện khi phiếu thuộc dự án khác dự án đang chọn ở thanh bên.
            Cố ý chỉ cảnh báo, KHÔNG tự đổi lựa chọn: WorkspaceContext ghi vào
            localStorage nên tự nhảy dự án sẽ kéo theo mọi màn khác. */}
        {data?.project && duAnThanhBen && data.project.code !== duAnThanhBen.code && (
          <div className="mb-4 flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
            <span className="material-symbols-outlined text-[18px] text-amber-600">warning</span>
            <div className="text-caption text-amber-800">
              Thanh bên đang chọn <strong>{duAnThanhBen.code}</strong>, nhưng phiếu này thuộc{' '}
              <strong>{data.project.code}</strong> — {data.project.name}.
            </div>
          </div>
        )}

        {!loading && prId && !error && data && (
          <>
            {data.rows.length === 0 ? (
              // Chưa ai nêu yêu cầu nào. KHÔNG dùng dấu tích xanh: 'xong rồi' và
              // 'chưa ai bắt đầu' là hai chuyện khác hẳn nhau.
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2 mb-4">
                <span className="material-symbols-outlined text-[44px]">engineering</span>
                <div className="text-body text-slate-500">Chưa có yêu cầu làm rõ nào cho phiếu này</div>
                <div className="text-caption text-center max-w-md">
                  Danh sách này chỉ hiện những dòng vật tư thật sự cần kỹ thuật làm rõ.
                  Cả {data.summary.total} dòng của phiếu hiện không vướng gì.
                </div>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2 mb-4">
                <span className="material-symbols-outlined text-[44px]">filter_alt_off</span>
                <div className="text-body">
                  Bộ lọc đang ẩn hết {data.rows.length} yêu cầu
                </div>
              </div>
            ) : null}

            <div className="mb-5 max-w-3xl">
              <BieuMauNeuYeuCau
                prLines={data.prLines}
                daCoYeuCau={new Set(data.rows.map((r) => r.prDetailId))}
                onCreated={load}
              />
            </div>
          </>
        )}

        {/* M-07 — 15/08/2026: trước đây `grid-cols-1 max-w-3xl` nên 434 thẻ xếp một cột,
                  chỉ dùng ~1.010px trong màn 1.512px và trang cao 51.949px.
                  Xếp nhiều cột theo bề ngang: hẹp thì tự về một cột. */}
              {filteredRows.length > 0 && (
              <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
          {filteredRows.map((row) => (
            <SkuCard
              key={row.prDetailId}
              row={row}
              onOpenPanel={() => setSelectedPanel(row)}
              onOpenHistory={() => setHistoryPanel({ itemCode: row.itemCode, itemName: row.itemName })}
              onQuickStatus={async (status, note) => {
                await handleQuickStatus(row.prDetailId, status, note);
              }}
            />
          ))}
        </div>
              )}
      </div>

      </div>{/* hết vùng cuộn */}

      {/* Panels */}
      {selectedPanel && (
        <TechPanel
          row={selectedPanel}
          onClose={() => setSelectedPanel(null)}
          onUpdated={async () => {
            await load();
            // Re-sync selectedPanel with fresh data
            setData((prev) => {
              if (!prev) return prev;
              const updated = prev.rows.find((r) => r.prDetailId === selectedPanel.prDetailId);
              if (updated) setSelectedPanel(updated);
              return prev;
            });
          }}
        />
      )}

      {historyPanel && (
        <PurchaseHistoryPanel
          itemCode={historyPanel.itemCode}
          itemName={historyPanel.itemName}
          onClose={() => setHistoryPanel(null)}
        />
      )}
      </div>
    </div>
  );
}
