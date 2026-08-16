'use client';

/**
 * TrangVatTu — thân dùng chung cho hai module của bước 1.
 *
 *   · /mua-hang           → Yêu cầu mua hàng (PR). Khoá 'detail': chỉ danh mục hàng
 *                            hoá theo PR và các phiên bản (REV).
 *   · /theo-doi-mua-hang  → Theo dõi mua hàng. Khoá 'workflow': tồn kho, hợp đồng
 *                            trong nước và nhập khẩu, đã mua, QC, so sánh với PR.
 *
 * Lịch sử tách (anh Hưng duyệt 15/08/2026):
 *   đợt 1 — dựng module mới, hai trang chạy song song trên cùng thân, chưa cắt cột.
 *   đợt 2 — cắt cột: gỡ nhóm "Dự trù lần 0 → n" khỏi bảng theo dõi (thay bằng một cột
 *           "Ký theo REV"), khoá /mua-hang về bảng chi tiết, ẩn ô chọn chế độ xem.
 *   đợt 3 — nối liên kết sang các module khác (chưa làm).
 *   đợt 4 — dọn màn PR (chưa làm).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';
import { MasterTrackingTable } from '@/components/mua-hang/MasterTrackingTable';
import { PR090DetailView } from '@/components/mua-hang/PR090DetailView';
import { UpdateProcurementModal } from '@/components/mua-hang/UpdateProcurementModal';
import { CreateRfqModal } from '@/components/CreateRfqModal';
import { ActiveFilterChips } from '@/components/data-table';
import { useTableFilters } from '@/hooks/useTableFilters';
import { toast, Toaster } from 'react-hot-toast';
import type { PRDetail, PRStatus, FabricationCategory, ContractDetail } from '@/types/procurement';
import { FAB_CATEGORIES_I090, FAB_CATEGORIES_I095 } from '@/lib/mockPRData';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';
import { PROJECTS, type Project } from '@/context/ProjectContext';

// ─── Quy trình mua sắm 6 bước ────────────────────────────────────────────────

const WORKFLOW_STEPS: { key: PRStatus | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: 'Tất cả', icon: 'list_alt' },
  { key: 'Chờ báo giá', label: 'Chờ báo giá', icon: 'hourglass_empty' },
  { key: 'Đang đàm phán', label: 'Đàm phán', icon: 'handshake' },
  { key: 'Đã ký HĐ', label: 'Đã ký HĐ', icon: 'description' },
  { key: 'Hàng đang về', label: 'Hàng đang về', icon: 'local_shipping' },
  { key: 'Đã nghiệm thu', label: 'Nghiệm thu', icon: 'verified' },
  { key: 'Đã nhập kho', label: 'Đã nhập kho', icon: 'warehouse' },
];

const STATUS_FLOW: PRStatus[] = [
  'Chờ báo giá',
  'Đang đàm phán',
  'Đã ký HĐ',
  'Hàng đang về',
  'Đã nghiệm thu',
  'Đã nhập kho',
];

const nextStatus = (cur: PRStatus): PRStatus =>
  STATUS_FLOW[Math.min(STATUS_FLOW.indexOf(cur) + 1, STATUS_FLOW.length - 1)];

// ─── Map project id → fab categories ─────────────────────────────────────────

const FAB_CAT_MAP: Record<string, FabricationCategory[]> = {
  p001: FAB_CATEGORIES_I095, // VPI-I-095 (BISON/VOGT — SCR System)
  p002: FAB_CATEGORIES_I090, // VPI-I-090 (BRADEN — Air Duct & Filtration)
};

function getActiveFabCategories(projectIds: string[]): FabricationCategory[] {
  const merged = new Map<string, FabricationCategory>();
  for (const pid of projectIds) {
    const cats = FAB_CAT_MAP[pid] ?? [];
    for (const cat of cats) {
      if (!merged.has(cat.code)) merged.set(cat.code, cat);
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

// ─── Upload Modal ────────────────────────────────────────────────────────────

function UploadModal({
  onClose,
  onUpload,
  isLoading,
}: {
  onClose: () => void;
  onUpload: (file: File, project: Project) => void;
  isLoading: boolean;
}) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDrag, setIsDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDrag(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.csv') || f.name.endsWith('.xlsx'))) setFile(f);
    else toast.error('Chỉ chấp nhận file .csv hoặc .xlsx');
  };

  const canSubmit = !!selectedProject && !!file && !isLoading;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="bg-[#1B365D] px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-white font-black text-sm">Upload Dữ Liệu PR Vật Tư</div>
            <div className="text-blue-200 text-[10px] mt-0.5">
              Yêu cầu chọn dự án trước khi upload
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-700 mb-2">
              <span className="w-4 h-4 bg-[#1B365D] text-white rounded-full flex items-center justify-center text-[9px] font-black shrink-0">
                1
              </span>
              Chọn dự án <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
              {PROJECTS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProject(p)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 text-left transition-all ${
                    selectedProject?.id === p.id
                      ? 'border-[#1B365D] bg-[#1B365D]/5'
                      : 'border-slate-200 hover:border-[#1B365D]/40'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selectedProject?.id === p.id
                        ? 'border-[#1B365D] bg-[#1B365D]'
                        : 'border-slate-300'
                    }`}
                  >
                    {selectedProject?.id === p.id && (
                      <span className="material-symbols-outlined text-white text-[12px]">
                        check
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-black text-[#1B365D]">{p.code}</div>
                    <div className="text-[10px] text-slate-500 truncate">{p.name}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-700 mb-2">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${
                  selectedProject ? 'bg-[#1B365D] text-white' : 'bg-slate-300 text-slate-500'
                }`}
              >
                2
              </span>
              Chọn file Excel / CSV
              {!selectedProject && (
                <span className="text-slate-400 font-normal normal-case">(chọn dự án trước)</span>
              )}
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (selectedProject) setIsDrag(true);
              }}
              onDragLeave={() => setIsDrag(false)}
              onDrop={selectedProject ? handleDrop : undefined}
              onClick={() => selectedProject && fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                !selectedProject
                  ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-50'
                  : isDrag
                    ? 'border-[#1B365D] bg-[#1B365D]/5 cursor-copy'
                    : 'border-slate-300 hover:border-[#1B365D]/60 cursor-pointer hover:bg-[#1B365D]/3'
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                disabled={!selectedProject}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFile(f);
                  e.target.value = '';
                }}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-emerald-600">
                  <span className="material-symbols-outlined text-[20px]">check_circle</span>
                  <div className="text-left">
                    <div className="text-xs font-bold">{file.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="ml-2 text-slate-400 hover:text-red-500"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[32px] text-slate-300 mb-2">
                    upload_file
                  </span>
                  <div className="text-xs font-bold text-slate-500">Kéo thả file vào đây</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    hoặc click để chọn — .csv, .xlsx, .xls
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={() => canSubmit && onUpload(file!, selectedProject!)}
              disabled={!canSubmit}
              className={`flex-1 px-4 py-2 text-xs font-bold rounded-lg text-white transition-all ${
                canSubmit
                  ? 'bg-[#1B365D] hover:bg-[#2a5298] shadow'
                  : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-[14px]">
                    progress_activity
                  </span>
                  Đang xử lý...
                </span>
              ) : (
                `Upload ${selectedProject ? `→ ${selectedProject.code}` : ''}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

// ─── Moi dữ liệu từ mảng hợp đồng cho bộ lọc ─────────────────────────────────
// 15/08/2026 — `contractNo`, `vendorName`… không nằm ở cấp dòng mà trong `contracts`.
// Một dòng vật tư có thể có nhiều hợp đồng cùng loại: nối lại để lọc theo chuỗi con
// vẫn tìm được, còn với số thì lấy giá trị đầu tiên có thật.
type LoaiHD = 'DOMESTIC' | 'IMPORT';
const locHopDong = (r: PRDetail, loai: LoaiHD) =>
  (r.contracts ?? []).filter((c) => c.contractType === loai);
const hopDong = (r: PRDetail, loai: LoaiHD, truong: keyof ContractDetail): string =>
  locHopDong(r, loai)
    .map((c) => c[truong])
    .filter((v) => v != null && v !== '')
    .join(' | ');
const soHopDong = (r: PRDetail, loai: LoaiHD, truong: keyof ContractDetail): number | undefined => {
  for (const c of locHopDong(r, loai)) {
    const v = c[truong];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
};

type ViewMode = 'workflow' | 'detail';

interface Props {
  /** Khoá cứng chế độ xem. Bỏ trống = người dùng tự chọn (trang /mua-hang hiện tại).
   *  '/theo-doi-mua-hang' truyền 'workflow' để chỉ hiện bảng theo dõi. */
  khoaCheDo?: ViewMode;
}

export function TrangVatTu({ khoaCheDo }: Props = {}) {
  const router = useRouter();

  // View mode tab: workflow (default) hoặc detail PR-090
  const [viewModeTuChon, setViewMode] = useState<ViewMode>('workflow');
  // Khi trang cha khoá chế độ thì bỏ qua lựa chọn của người dùng.
  const viewMode: ViewMode = khoaCheDo ?? viewModeTuChon;

  // Shared state giữa 2 view
  const [prs, setPrs] = useState<PRDetail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeStep, setActiveStep] = useState<PRStatus | 'all'>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showCreateRfqModal, setShowCreateRfqModal] = useState(false);
  const [isUsingMock, setIsUsingMock] = useState(false);

  // Điều khiển REV columns — lift lên page để dùng ở toolbar bar chính
  const [showAllRevs, setShowAllRevs] = useState(false);

  // REV selection per project: 'all' | 'latest' | number (0-based rev index)
  const [selectedRevByProject, setSelectedRevByProject] = useState<Record<string, 'all' | 'latest' | number>>({});
  const [revDropOpen, setRevDropOpen] = useState(false);
  const revDropRef = useRef<HTMLDivElement>(null);

  // Dropdown "Hành động"
  const [actionDropOpen, setActionDropOpen] = useState(false);
  const actionDropRef = useRef<HTMLDivElement>(null);
  const closeActionDrop = useCallback(() => setActionDropOpen(false), []);

  // Dropdown "Tình trạng hàng hóa"
  const [statusDropOpen, setStatusDropOpen] = useState(false);
  const statusDropRef = useRef<HTMLDivElement>(null);

  // Dropdown "Theo dự án" (view mode + project filter)
  const [viewDropOpen, setViewDropOpen] = useState(false);
  const viewDropRef = useRef<HTMLDivElement>(null);

  // Đóng dropdown khi click ngoài
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (actionDropOpen && actionDropRef.current && !actionDropRef.current.contains(e.target as Node)) {
        setActionDropOpen(false);
      }
      if (statusDropOpen && statusDropRef.current && !statusDropRef.current.contains(e.target as Node)) {
        setStatusDropOpen(false);
      }
      if (viewDropOpen && viewDropRef.current && !viewDropRef.current.contains(e.target as Node)) {
        setViewDropOpen(false);
      }
      if (revDropOpen && revDropRef.current && !revDropRef.current.contains(e.target as Node)) {
        setRevDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [actionDropOpen, statusDropOpen, viewDropOpen, revDropOpen]);

  // Tất cả projects — fab categories dùng cho PR-090 detail
  const allProjectIds = PROJECTS.map((p) => p.id);
  const activeFabCats = getActiveFabCategories(allProjectIds);

  // ─── Reload PR data từ backend (dùng cho cả mount và sau update) ────────
  const reloadPrs = async () => {
    if (typeof window === 'undefined' || !localStorage.getItem('ibshi_authed')) return;
    try {
      const token = localStorage.getItem('ibshi_token');
      const res = await fetch(`${API_URL}/api/v1/prs`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: AbortSignal.timeout(8000),
      });
      const d = await res.json();
      if (d.success && Array.isArray(d.data)) {
        setPrs(d.data);
      }
    } catch {
      /* backend offline — giữ array hiện tại */
    }
  };

  useEffect(() => {
    reloadPrs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Upload PR file ─────────────────────────────────────────────────────
  const handleUpload = async (file: File, project: Project) => {
    if (typeof window === 'undefined' || !localStorage.getItem('ibshi_authed')) {
      toast('Chưa đăng nhập — vui lòng đăng nhập để upload dữ liệu.', { icon: '🔒' });
      return;
    }

    // Fix MIME type cho .xlsx (browser đôi khi không set)
    let uploadFile = file;
    if (file.name.match(/\.xlsx?$/i)) {
      const correctMime = file.name.toLowerCase().endsWith('.xlsx')
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/vnd.ms-excel';
      if (!file.type || file.type !== correctMime) {
        uploadFile = new File([file], file.name, { type: correctMime });
      }
    }

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('projectCode', project.code);
    formData.append('projectName', project.name);
    formData.append('department', 'ENGINEERING');

    setIsLoading(true);
    const toastId = toast.loading(`Đang xử lý ${file.name}…`);

    try {
      const token = localStorage.getItem('ibshi_token');
      const uploadHeaders: Record<string, string> = {};
      if (token) uploadHeaders['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/v1/prs/import`, {
        method: 'POST',
        credentials: 'include',
        headers: uploadHeaders,
        body: formData,
        signal: AbortSignal.timeout(60000),
      });

      const result = await res.json();
      toast.dismiss(toastId);

      if (result.success) {
        const count = result.valid_items_extracted as number;
        const warnings = result.warnings as string | undefined;
        toast.success(
          `✅ Đã nhập ${count} mã vật tư vào ${project.code}` + (warnings ? ` (${warnings})` : '')
        );
        // Sau upload, tự set filter dự án vừa upload
        tableFilters.setColumnFilter('projectCode', { type: 'multiSelect', values: [project.code] });

        // Reload danh sách PR sau import
        try {
          const { fetchPRList } = await import('@/lib/api');
          const fresh = await fetchPRList(project.id);
          if (fresh.length > 0) {
            setPrs(fresh);
            setIsUsingMock(false);
          }
        } catch {
          /* giữ nguyên nếu fetch fail */
        }
        setShowUploadModal(false);
      } else {
        const msg = (result.error || result.message || 'Lỗi không xác định') as string;
        if (res.status === 503) {
          toast.error('⏳ DB đang khởi động lại. Thử lại sau 5 giây.', { duration: 8000 });
        } else if (res.status === 400 || res.status === 422) {
          toast.error(`⚠️ ${msg}`, { duration: 10000 });
        } else {
          toast.error(`❌ ${msg}`);
        }
      }
    } catch (err) {
      toast.dismiss(toastId);
      const isTimeout = err instanceof Error && err.name === 'TimeoutError';
      toast.error(
        isTimeout
          ? '⏱ Upload timeout (60s). File quá lớn hoặc server bận.'
          : '❌ Không kết nối được server. Kiểm tra backend port 5005.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Workflow handlers ──────────────────────────────────────────────────
  const handleToggleStatus = (pr: PRDetail) => {
    const next = nextStatus(pr.statusFlag);
    setPrs((prev) => prev.map((p) => (p.id === pr.id ? { ...p, statusFlag: next } : p)));
    toast.success(`${pr.itemCode}: → ${next}`);
  };

  const handleBulkToggleStatus = (prIds: string[]) => {
    setPrs((prev) =>
      prev.map((p) => (prIds.includes(p.id) ? { ...p, statusFlag: nextStatus(p.statusFlag) } : p))
    );
    toast.success(`Đã chuyển bước ${prIds.length} mục`);
  };

  // Hiển thị toàn bộ PR — filter dự án được xử lý trực tiếp trong bảng qua ColumnFilter
  const prsByProject = prs;

  // Filter thêm theo workflow step (chỉ áp dụng tab Workflow)
  const stepFiltered =
    activeStep === 'all' ? prsByProject : prsByProject.filter((p) => p.statusFlag === activeStep);

  // ─── Search + per-column filter ───────────────────────────────────────────
  // ─── Danh sách dự án cho bộ lọc ────────────────────────────────────────────
  // 15/08/2026 — dựng từ CHÍNH dữ liệu đang có, không đọc hằng số `PROJECTS`.
  // Bản cũ đọc hằng số nên chỉ biết 4 dự án, trong khi dữ liệu thật có 12 mã:
  // 867/1.816 dòng (48%) không lọc tới được, còn 2 dự án trong hằng số thì rỗng
  // mà vẫn hiện. Tên đầy đủ vẫn lấy từ `PROJECTS` khi có; mã lạ vẫn hiện, chỉ
  // thiếu tên. Dự án mới xuất hiện trong dữ liệu là tự vào danh sách.
  // 15/08: tên nay lấy từ API (bảng Project đã có tên thật), hằng số chỉ còn dự phòng.
  const projectOptions = React.useMemo(() => {
    const dem = new Map<string, number>();
    for (const pr of prs) {
      const code = pr.pr?.project?.code ?? '';
      if (code) dem.set(code, (dem.get(code) ?? 0) + 1);
    }
    // Tên lấy từ chính dữ liệu — bảng Project trong cơ sở dữ liệu đã có tên thật cho
    // cả 12 mã, kể cả PKG-* (anh Hưng xác nhận 15/08: đó là dự án thật).
    // Hằng số PROJECTS chỉ còn dùng để dự phòng tên và để GIỮ LẠI dự án chưa có dòng nào.
    const ten = new Map<string, string>();
    for (const pr of prs) {
      const p = pr.pr?.project;
      if (p?.code && p.name && !ten.has(p.code)) ten.set(p.code, p.name);
    }
    for (const p of PROJECTS) if (!ten.has(p.code)) ten.set(p.code, p.name);

    const ra = [...dem.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([code, count]) => ({ code, name: ten.get(code) ?? '', count }));

    // Dự án trong danh mục nhưng chưa có dòng nào vẫn phải hiện, kèm số 0 —
    // anh Hưng chốt 15/08 mục 18: "giữ lại". Xếp cuối vì chưa có việc.
    for (const p of PROJECTS) {
      if (!dem.has(p.code)) ra.push({ code: p.code, name: p.name, count: 0 });
    }
    return ra;
  }, [prs]);

  const tableFilters = useTableFilters<PRDetail>({
    searchFields: ['itemCode', 'itemName', 'profile', 'grade', 'remarks'],
    columns: {
      projectCode: {
        type: 'multiSelect',
        label: 'Dự án',
        options: projectOptions.map((p) => ({ value: p.code, label: p.code })),
        accessor: (row) => row.pr?.project?.code ?? '',
      },
      // 15/08/2026 — nhãn hộp lọc phải TRÙNG tên cột đang hiện trên bảng.
      // Bản cũ đặt tên riêng ('Tên VT', 'Quy cách'…) nên bấm lọc ở cột
      // "Description/Chi tiết" lại thấy hộp ghi "Lọc: Tên VT" — hai tên cho một cột.
      itemCode: { type: 'text', label: 'Item/STT' },
      itemName: { type: 'text', label: 'Description/Chi tiết' },
      profile: { type: 'text', label: 'Profile/Vật tư' },
      grade: { type: 'text', label: 'Grade/Mác' },
      uom: { type: 'select', label: 'Unit/ĐVT', options: ['kg', 'tấn', 'm2', 'm', 'chiếc', 'bộ', 'sets', 'lít'] },
      materialGroupCode: {
        type: 'multiSelect',
        label: 'Nhóm VT',
        options: ['VTC', 'VPK', 'VDK', 'VBP', 'VTH', 'VTS', 'VTP'],
      },
      urgency: { type: 'select', label: 'Độ ưu tiên', options: ['Normal', 'High', 'Critical'] },
      // Hai cột này đều mang tên "Q.Ty" trên bảng, khác nhau ở nhóm — phải ghi kèm nhóm
      reqQty: { type: 'numberRange', label: 'Khối lượng phải mua sắm › Q.Ty' },
      unitWeight: { type: 'numberRange', label: 'U.Weight' },
      netQtyFilter: { type: 'numberRange', label: 'Net Quantity › Q.Ty' },

      // ── 15/08/2026 · mục 19 — bổ sung bộ lọc cho các cột còn thiếu ──
      // Đồng thời sửa hai chỗ trỏ sai phát hiện khi rà:
      //   · `contractNo` và `vendorName` KHÔNG có ở cấp dòng — chúng nằm trong mảng
      //     `contracts`. Bộ lọc cũ đọc `row.contractNo` (luôn undefined) nên bấm vào
      //     lọc không ra gì. Giờ dùng accessor moi vào đúng hợp đồng.
      //   · Trong nước và nhập khẩu trước đây dùng CHUNG một khoá lọc, hai nút bấm
      //     nhưng chỉ một bộ lọc. Nay tách đôi.
      netWeight: { type: 'numberRange', label: 'Net Quantity › Weight (Kg)' },
      reqWeight: { type: 'numberRange', label: 'Total Ordered › Weight (Kg)' },
      remainQty: { type: 'numberRange', label: 'Tận dụng tồn kho › Q.Ty' },
      remainWeight: { type: 'numberRange', label: 'Tận dụng tồn kho › Weight (Kg)' },
      toBuyQty: { type: 'numberRange', label: 'Khối lượng phải mua sắm › Q.Ty' },
      toBuyWeight: { type: 'numberRange', label: 'Khối lượng phải mua sắm › Weight (Kg)' },
      remarks: { type: 'text', label: 'Remarks/Ghi chú' },
      // Đợt 2 tách module — cột "Ký theo REV" thay cho cả nhóm Dự trù lần 0→n
      revNo: { type: 'numberRange', label: 'Ký theo REV', accessor: (r) => r.pr?.revNo ?? undefined },
      requiredDate: { type: 'dateRange', label: 'Material Available Date' },
      statusFlag: { type: 'select', label: 'Tình trạng hàng', options: WORKFLOW_STEPS.filter((w) => w.key !== 'all').map((w) => w.label) },

      // Hợp đồng trong nước
      domContractNo: { type: 'text', label: 'Trong nước › Số HĐ', accessor: (r) => hopDong(r, 'DOMESTIC', 'contractNo') },
      domVendor: { type: 'text', label: 'Trong nước › NCC', accessor: (r) => hopDong(r, 'DOMESTIC', 'vendorName') },
      domSpec: { type: 'text', label: 'Trong nước › Spec HĐ', accessor: (r) => hopDong(r, 'DOMESTIC', 'actualProfile') },
      domSignDate: { type: 'dateRange', label: 'Trong nước › Ngày ký', accessor: (r) => hopDong(r, 'DOMESTIC', 'contractDate') },
      domHandoverDate: { type: 'dateRange', label: 'Trong nước › Handover Date', accessor: (r) => hopDong(r, 'DOMESTIC', 'handoverDate') },
      domUnitPrice: { type: 'numberRange', label: 'Trong nước › Đơn giá NoVAT', accessor: (r) => soHopDong(r, 'DOMESTIC', 'unitPriceNoVAT') },
      domTotal: { type: 'numberRange', label: 'Trong nước › Tổng NoVAT', accessor: (r) => soHopDong(r, 'DOMESTIC', 'totalNoVAT') },

      // Hợp đồng nhập khẩu
      impContractNo: { type: 'text', label: 'Nhập khẩu › Số HĐ', accessor: (r) => hopDong(r, 'IMPORT', 'contractNo') },
      impVendor: { type: 'text', label: 'Nhập khẩu › NCC', accessor: (r) => hopDong(r, 'IMPORT', 'vendorName') },
      impSpec: { type: 'text', label: 'Nhập khẩu › Spec HĐ', accessor: (r) => hopDong(r, 'IMPORT', 'actualProfile') },
      impSignDate: { type: 'dateRange', label: 'Nhập khẩu › Ngày ký', accessor: (r) => hopDong(r, 'IMPORT', 'contractDate') },
      impExportPort: { type: 'text', label: 'Nhập khẩu › Cảng xuất', accessor: (r) => hopDong(r, 'IMPORT', 'exportPort') },
      impArrivedDate: { type: 'dateRange', label: 'Nhập khẩu › Ngày hàng về', accessor: (r) => hopDong(r, 'IMPORT', 'arrivedDate') },
      impUnitPrice: { type: 'numberRange', label: 'Nhập khẩu › Đơn giá (USD)', accessor: (r) => soHopDong(r, 'IMPORT', 'unitPriceNoVAT') },
      impTotal: { type: 'numberRange', label: 'Nhập khẩu › Total HĐ', accessor: (r) => soHopDong(r, 'IMPORT', 'totalNoVAT') },
    },
  });

  const filteredPrs = tableFilters.apply(stepFiltered);

  const countStep = (key: PRStatus | 'all') =>
    key === 'all' ? prsByProject.length : prsByProject.filter((p) => p.statusFlag === key).length;
  const navWorkflowSteps = WORKFLOW_STEPS.map((s) => ({ ...s, count: countStep(s.key) }));

  return (
    <div className="flex min-h-screen bg-[#f4f6fb]">
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onUpload={handleUpload}
          isLoading={isLoading}
        />
      )}
      {showUpdateModal && (
        <UpdateProcurementModal
          onClose={() => setShowUpdateModal(false)}
          onSuccess={() => {
            reloadPrs();
          }}
          projects={PROJECTS}
          defaultProjectId={PROJECTS[0].id}
        />
      )}
      {showCreateRfqModal && (
        <CreateRfqModal
          onClose={() => setShowCreateRfqModal(false)}
          onCreated={(bid) => {
            setShowCreateRfqModal(false);
            toast.success(`Đã tạo ${bid.bidCode} — chuyển sang trang Báo giá`);
            router.push(`/bao-gia?tab=requests&bid=${bid.id}`);
          }}
        />
      )}
      <Sidebar />

      <div className="flex-1 ml-64 flex flex-col h-screen overflow-hidden">
        {/* ── Top nav — search only, upload đã chuyển vào dropdown Hành động ─── */}
        <TopNav
          onFileChange={() => {}}
          onGeneratePO={() => toast('Tính năng sẽ hoạt động khi backend kết nối.', { icon: 'ℹ️' })}
          isLoading={isLoading}
          onSearch={(q) => tableFilters.setSearch(q)}
          searchPlaceholder="Tìm mã, tên, profile, nhà CC, số HĐ..."
        />

        {/* ── Bar chính: Dropdown view + Dropdown tình trạng + REV toggle + Hành động ── */}
        <div className="mt-16 border-b border-slate-200 bg-white px-4 py-2 flex items-center gap-2 shrink-0 shadow-sm">

          {/* ── Dropdown 1: "Theo dự án" — chọn dự án + view mode ── */}
          <div className="relative shrink-0" ref={viewDropRef}>
            <button
              onClick={() => setViewDropOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10.5px] font-bold border transition-all ${
                viewDropOpen
                  ? 'bg-[#1B365D] text-white border-[#1B365D] shadow'
                  : 'bg-white border-slate-300 text-slate-700 hover:border-[#1B365D]'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">folder_open</span>
              <span>
                {viewMode === 'detail' ? 'PR-090' : (
                  tableFilters.columnFilters['projectCode']?.type === 'multiSelect' && (tableFilters.columnFilters['projectCode'] as { type: 'multiSelect'; values: string[] }).values.length > 0
                    ? (tableFilters.columnFilters['projectCode'] as { type: 'multiSelect'; values: string[] }).values.join(', ')
                    : 'Tất cả dự án'
                )}
              </span>
              <span className={`material-symbols-outlined text-[12px] transition-transform ${viewDropOpen ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>

            {viewDropOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-2xl border border-slate-100 py-1.5 z-50">
                {/* Section: View mode — chỉ hiện khi trang cha KHÔNG khoá chế độ.
                    Sau đợt 2, /mua-hang khoá 'detail' và /theo-doi-mua-hang khoá 'workflow'
                    nên ô chọn này không còn ý nghĩa ở cả hai trang. */}
                {!khoaCheDo && (
                <>
                <div className="px-3 py-1 border-b border-slate-50 mb-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Chế độ xem</p>
                </div>
                <button
                  onClick={() => { setViewMode('workflow'); setViewDropOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors ${
                    viewMode === 'workflow' ? 'bg-[#1B365D]/8 text-[#1B365D] font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">timeline</span>
                  <span>Workflow Mua Sắm</span>
                  {viewMode === 'workflow' && <span className="ml-auto material-symbols-outlined text-[13px] text-[#1B365D]">check</span>}
                </button>
                <button
                  onClick={() => { setViewMode('detail'); setViewDropOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors ${
                    viewMode === 'detail' ? 'bg-[#1B365D]/8 text-[#1B365D] font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">table_view</span>
                  <span>Bảng Chi Tiết (PR-090)</span>
                  {viewMode === 'detail' && <span className="ml-auto material-symbols-outlined text-[13px] text-[#1B365D]">check</span>}
                </button>
                </>
                )}

                {/* Section: Lọc theo dự án (chỉ khi workflow) */}
                {viewMode === 'workflow' && (
                  <>
                    <div className="px-3 py-1 border-t border-b border-slate-50 mt-1 mb-1">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Lọc theo dự án</p>
                    </div>
                    {/* Tất cả */}
                    {(() => {
                      const activeVals = tableFilters.columnFilters['projectCode']?.type === 'multiSelect'
                        ? (tableFilters.columnFilters['projectCode'] as { type: 'multiSelect'; values: string[] }).values
                        : [];
                      const isAll = activeVals.length === 0;
                      return (
                        <button
                          onClick={() => { tableFilters.setColumnFilter('projectCode', null); setViewDropOpen(false); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors ${
                            isAll ? 'bg-[#1B365D]/8 text-[#1B365D] font-bold' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[15px]">select_all</span>
                          <span>Tất cả dự án</span>
                          <span className="ml-auto text-[9px] font-mono text-slate-400">{prsByProject.length}</span>
                          {isAll && <span className="material-symbols-outlined text-[13px] text-[#1B365D]">check</span>}
                        </button>
                      );
                    })()}
                    {projectOptions.map((p) => {
                      const activeVals = tableFilters.columnFilters['projectCode']?.type === 'multiSelect'
                        ? (tableFilters.columnFilters['projectCode'] as { type: 'multiSelect'; values: string[] }).values
                        : [];
                      const isActive = activeVals.includes(p.code);
                      const count = p.count;
                      return (
                        <button
                          key={p.code}
                          onClick={() => {
                            tableFilters.setColumnFilter('projectCode', { type: 'multiSelect', values: [p.code] });
                            setViewDropOpen(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors ${
                            isActive ? 'bg-[#1B365D]/8 text-[#1B365D] font-bold' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[15px]">folder</span>
                          <div className="flex-1 text-left min-w-0">
                            <div className="font-bold text-[10px]">{p.code}</div>
                            <div className="text-[9px] text-slate-400 truncate">
                              {p.name || 'chưa có trong danh mục dự án'}
                            </div>
                          </div>
                          <span className="text-[9px] font-mono text-slate-400">{count}</span>
                          {isActive && <span className="material-symbols-outlined text-[13px] text-[#1B365D]">check</span>}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-slate-200 shrink-0" />

          {/* ── Dropdown 2: "Tình trạng hàng hóa" — workflow steps ── */}
          {viewMode === 'workflow' && (
            <div className="relative shrink-0" ref={statusDropRef}>
              {(() => {
                const activeStepObj = navWorkflowSteps.find((s) => s.key === activeStep);
                return (
                  <button
                    onClick={() => setStatusDropOpen((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10.5px] font-bold border transition-all ${
                      statusDropOpen
                        ? 'bg-[#1B365D] text-white border-[#1B365D] shadow'
                        : activeStep !== 'all'
                          ? 'bg-[#1B365D]/8 text-[#1B365D] border-[#1B365D]/30'
                          : 'bg-white border-slate-300 text-slate-700 hover:border-[#1B365D]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">{activeStepObj?.icon ?? 'local_shipping'}</span>
                    <span>{activeStep === 'all' ? 'Tình trạng hàng' : activeStepObj?.label}</span>
                    {activeStep !== 'all' && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black ${statusDropOpen ? 'bg-white/20 text-white' : 'bg-[#1B365D]/10 text-[#1B365D]'}`}>
                        {activeStepObj?.count ?? 0}
                      </span>
                    )}
                    <span className={`material-symbols-outlined text-[12px] transition-transform ${statusDropOpen ? 'rotate-180' : ''}`}>
                      expand_more
                    </span>
                  </button>
                );
              })()}

              {statusDropOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-2xl border border-slate-100 py-1.5 z-50">
                  <div className="px-3 py-1 border-b border-slate-50 mb-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tình trạng hàng hóa</p>
                  </div>
                  {navWorkflowSteps.map((step, idx) => {
                    const isActive = activeStep === step.key;
                    return (
                      <React.Fragment key={step.key}>
                        {idx === 1 && <div className="my-1 mx-3 border-t border-slate-100" />}
                        <button
                          onClick={() => { setActiveStep(step.key); setStatusDropOpen(false); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors ${
                            isActive ? 'bg-[#1B365D]/8 text-[#1B365D] font-bold' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[15px]">{step.icon}</span>
                          <span className="flex-1 text-left">{step.label}</span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isActive ? 'bg-[#1B365D]/15 text-[#1B365D]' : 'bg-slate-100 text-slate-500'}`}>
                            {step.count}
                          </span>
                          {isActive && <span className="material-symbols-outlined text-[13px] text-[#1B365D]">check</span>}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex-1" />

          {/* Info: số VT hiển thị + demo dot */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] text-slate-400 font-mono">{filteredPrs.length} VT</span>
            {isUsingMock && (
              <span title="Đang dùng dữ liệu demo" className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            )}
          </div>

          {/* Nút REV đã gỡ — đợt 2 tách module, 15/08/2026.
              Ô chọn REV chỉ phục vụ nhóm cột "Dự trù lần 0 → n" của bảng theo dõi,
              mà nhóm đó nay thuộc về module Yêu cầu mua hàng (anh Hưng chốt 13a).
              Bảng theo dõi giờ chỉ còn một cột "Ký theo REV" nên không cần ô chọn. */}

          {/* Dropdown "Hành động" — gộp Upload + Tạo RFQ + Cập nhật mua sắm */}
          <div className="relative shrink-0" ref={actionDropRef}>
            <button
              onClick={() => setActionDropOpen((v) => !v)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                actionDropOpen
                  ? 'bg-[#1B365D] text-white border-[#1B365D] shadow'
                  : 'bg-white border-slate-300 text-slate-700 hover:border-[#1B365D]'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">bolt</span>
              Hành động
              <span className={`material-symbols-outlined text-[12px] transition-transform ${actionDropOpen ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>

            {actionDropOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-2xl border border-slate-100 py-1.5 z-50">
                <div className="px-3 py-1 border-b border-slate-50 mb-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Hành động</p>
                </div>
                <button
                  onClick={() => { setShowUploadModal(true); closeActionDrop(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px] text-[#1B365D]">upload_file</span>
                  <span className="font-medium">Upload PR mới</span>
                </button>
                <button
                  onClick={() => { setShowCreateRfqModal(true); closeActionDrop(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px] text-[var(--color-brand)]">add_circle</span>
                  <span className="font-medium">Tạo RFQ mới</span>
                </button>
                <button
                  onClick={() => { setShowUpdateModal(true); closeActionDrop(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px] text-emerald-600">sync_alt</span>
                  <span className="font-medium">Cập nhật mua sắm</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Active filter chips — chỉ hiện khi có filter active ────── */}
        {tableFilters.activeCount > 0 && (
          <div className="border-b border-slate-200 bg-white px-4 py-1.5 shrink-0">
            <ActiveFilterChips filters={tableFilters} />
          </div>
        )}

        {/* ── View content ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'workflow' ? (
            <MasterTrackingTable prs={filteredPrs} isLoading={isLoading} tableFilters={tableFilters} />
          ) : (
            <PR090DetailView prs={tableFilters.apply(prsByProject)} isLoading={isLoading} />
          )}
        </div>
      </div>
    </div>
  );
}
