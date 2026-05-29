'use client';

/**
 * /mua-hang — Module "Theo Dõi Mua Hàng"
 *
 * Gộp 2 module cũ:
 *   1. /pr "Yêu Cầu Vật Tư" — workflow mua sắm 6 bước + PRTable + upload
 *   2. /theo-doi-vat-tu — format bảng chi tiết theo file PR 090
 *
 * Dùng tab switcher để chuyển giữa 2 view, chia sẻ cùng data source.
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';
import { MasterTrackingTable } from '@/components/mua-hang/MasterTrackingTable';
import { PR090DetailView } from '@/components/mua-hang/PR090DetailView';
import { UpdateProcurementModal } from '@/components/mua-hang/UpdateProcurementModal';
import { CreateRfqModal } from '@/components/CreateRfqModal';
import { TableSearch, ColumnFilter, ActiveFilterChips } from '@/components/data-table';
import { useTableFilters } from '@/hooks/useTableFilters';
import { toast, Toaster } from 'react-hot-toast';
import type { PRDetail, PRStatus, FabricationCategory } from '@/types/procurement';
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

type ViewMode = 'workflow' | 'detail';

export default function MuaHangPage() {
  const router = useRouter();

  // View mode tab: workflow (default) hoặc detail PR-090
  const [viewMode, setViewMode] = useState<ViewMode>('workflow');

  // Shared state giữa 2 view
  const [prs, setPrs] = useState<PRDetail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeStep, setActiveStep] = useState<PRStatus | 'all'>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showCreateRfqModal, setShowCreateRfqModal] = useState(false);
  const [isUsingMock, setIsUsingMock] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewProjectIds, setViewProjectIds] = useState<string[]>(['p002']);

  const activeFabCats = getActiveFabCategories(viewProjectIds);

  // ─── Reload PR data từ backend (dùng cho cả mount và sau update) ────────
  const reloadPrs = async () => {
    if (typeof window === 'undefined' || !localStorage.getItem('ibshi_authed')) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/prs`, {
        credentials: 'include',
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
      const { ensureCsrfToken } = await import('@/lib/api');
      const csrfToken = await ensureCsrfToken();
      const res = await fetch(`${API_URL}/api/v1/prs/import`, {
        method: 'POST',
        credentials: 'include',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
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
        if (!viewProjectIds.includes(project.id)) setViewProjectIds([project.id]);

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

  const handleToggleProject = (pid: string) => {
    setViewProjectIds((prev) => {
      if (prev.includes(pid)) {
        const next = prev.filter((x) => x !== pid);
        return next.length ? next : prev;
      }
      return [...prev, pid];
    });
  };

  // ─── Filter PR data theo project đang chọn ─────────────────────────────
  // Dùng cho CẢ Workflow tab và PR-090 tab (đồng bộ)
  const selectedProjectCodes = PROJECTS.filter((p) => viewProjectIds.includes(p.id)).map(
    (p) => p.code
  );
  const prsByProject = prs.filter((p) => {
    // Nếu item có pr.project.code → match theo code
    if (p.pr?.project?.code) return selectedProjectCodes.includes(p.pr.project.code);
    // Fallback: match theo prefix itemCode (I95 → 25-VPI-I-095, I90 → 25-BRA-I-090)
    const prefix = p.itemCode.match(/^I(\d{2})/)?.[1];
    if (!prefix) return true; // không xác định được → hiển thị
    return selectedProjectCodes.some((code) => code.includes(`-I-0${prefix}`));
  });

  // Filter thêm theo workflow step (chỉ áp dụng tab Workflow)
  const stepFiltered =
    activeStep === 'all' ? prsByProject : prsByProject.filter((p) => p.statusFlag === activeStep);

  // ─── Search + per-column filter (1+2 user request) ────────────────────────
  // Đặt SAU step filter để search/filter chạy trên dữ liệu của step hiện tại
  const tableFilters = useTableFilters<PRDetail>({
    searchFields: ['itemCode', 'itemName', 'profile', 'grade', 'remarks'],
    columns: {
      itemCode: { type: 'text', label: 'Mã VT' },
      itemName: { type: 'text', label: 'Tên VT' },
      profile: { type: 'text', label: 'Quy cách' },
      grade: { type: 'text', label: 'Mác thép' },
      uom: { type: 'select', label: 'Đơn vị', options: ['kg', 'tấn', 'm2', 'm', 'chiếc', 'bộ', 'sets', 'lít'] },
      materialGroupCode: {
        type: 'multiSelect',
        label: 'Nhóm VT',
        options: ['VTC', 'VPK', 'VDK', 'VBP', 'VTH', 'VTS', 'VTP'],
      },
      statusFlag: {
        type: 'multiSelect',
        label: 'Trạng thái',
        options: [
          'Chờ báo giá',
          'Đang đàm phán',
          'Đã ký HĐ',
          'Hàng đang về',
          'Đã nghiệm thu',
          'Đã nhập kho',
        ],
      },
      urgency: { type: 'select', label: 'Độ ưu tiên', options: ['Normal', 'High', 'Critical'] },
      reqQty: { type: 'numberRange', label: 'SL yêu cầu' },
      toBuyQty: { type: 'numberRange', label: 'SL cần mua' },
      requiredDate: { type: 'dateRange', label: 'Ngày cần' },
    },
  });

  // Sync global search query (từ TopNav) into table filters
  useEffect(() => {
    tableFilters.setSearch(searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

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
          defaultProjectId={viewProjectIds[0]}
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
        {/* ── Top nav — KHÔNG hiện workflow dropdown (tránh trùng với tab) ─── */}
        <TopNav
          onFileChange={() => {}}
          onGeneratePO={() => toast('Tính năng sẽ hoạt động khi backend kết nối.', { icon: 'ℹ️' })}
          isLoading={isLoading}
          onOpenUpload={() => setShowUploadModal(true)}
          onSearch={(q) => setSearchQuery(q)}
          searchPlaceholder="Tìm mã, tên, profile, nhà CC, số HĐ..."
        />

        {/* ── Bar duy nhất: Tab switcher + Workflow step chips + Project pills ── */}
        <div className="mt-16 border-b border-slate-200 bg-white px-4 py-2 flex items-center gap-3 shrink-0 shadow-sm">
          {/* Tab switcher — điểm điều hướng chính */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => setViewMode('workflow')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded text-[10.5px] font-bold transition-all ${
                viewMode === 'workflow'
                  ? 'bg-white text-[#1B365D] shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">timeline</span>
              Workflow Mua Sắm
            </button>
            <button
              onClick={() => setViewMode('detail')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded text-[10.5px] font-bold transition-all ${
                viewMode === 'detail'
                  ? 'bg-white text-[#1B365D] shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">table_view</span>
              Bảng Chi Tiết (PR-090)
            </button>
          </div>

          {/* Workflow step chips — chỉ hiện khi workflow mode */}
          {viewMode === 'workflow' && (
            <>
              <div className="w-px h-7 bg-slate-200 shrink-0" />
              <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
                {navWorkflowSteps.map((step) => {
                  const isStepActive = activeStep === step.key;
                  return (
                    <button
                      key={step.key}
                      onClick={() => setActiveStep(step.key)}
                      title={step.label}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold whitespace-nowrap transition-all ${
                        isStepActive
                          ? 'bg-[#1B365D] text-white shadow-sm'
                          : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[12px]">{step.icon}</span>
                      <span>{step.label}</span>
                      <span
                        className={`px-1 rounded text-[8px] font-black ${
                          isStepActive ? 'bg-white/20 text-white' : 'bg-white text-slate-400'
                        }`}
                      >
                        {step.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Create RFQ button */}
          <button
            onClick={() => setShowCreateRfqModal(true)}
            title="Tạo yêu cầu báo giá mới từ các PR item đang chờ"
            className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-[var(--color-brand)] hover:opacity-90 text-white rounded-lg text-[10px] font-bold shadow-sm transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            Tạo RFQ mới
          </button>

          {/* Update procurement button */}
          <button
            onClick={() => setShowUpdateModal(true)}
            title="Cập nhật tình trạng mua sắm từ file Excel master tracking"
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-sm transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-[14px]">sync_alt</span>
            Cập nhật mua sắm
          </button>

          {/* Project selector pills — luôn hiện, bên phải */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[8px] font-black text-slate-400 uppercase mr-1">
              Dự án ({activeFabCats.length} hạng mục):
            </span>
            {PROJECTS.map((p) => {
              const isActive = viewProjectIds.includes(p.id);
              const fabCount = (FAB_CAT_MAP[p.id] ?? []).length;
              return (
                <button
                  key={p.id}
                  onClick={() => handleToggleProject(p.id)}
                  title={`${p.name} — ${fabCount} hạng mục gia công`}
                  className={`px-2 py-0.5 rounded-full text-[8.5px] font-bold border transition-all ${
                    isActive
                      ? 'bg-[#1B365D] text-white border-[#1B365D]'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-[#1B365D]'
                  }`}
                >
                  {p.code.split('-').slice(0, 3).join('-')}
                  {isActive && <span className="ml-1 opacity-70 text-[7px]">({fabCount}✦)</span>}
                </button>
              );
            })}
            {isUsingMock && (
              <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-bold rounded-full uppercase">
                Demo
              </span>
            )}
          </div>
        </div>

        {/* ── Filter toolbar (search + column filters + active chips) ───── */}
        <div className="border-b border-slate-200 bg-white px-4 py-2 flex flex-col gap-2 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[280px] max-w-md">
              <TableSearch
                value={tableFilters.search}
                onChange={tableFilters.setSearch}
                placeholder="Tìm mã, tên, profile, mác, ghi chú..."
                resultCount={filteredPrs.length}
                totalCount={stepFiltered.length}
              />
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <span className="label mr-1">Lọc cột:</span>
              {(
                [
                  'itemCode',
                  'itemName',
                  'profile',
                  'grade',
                  'uom',
                  'materialGroupCode',
                  'statusFlag',
                  'urgency',
                  'reqQty',
                  'toBuyQty',
                  'requiredDate',
                ] as const
              ).map((col) => (
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

        {/* ── View content ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'workflow' ? (
            <MasterTrackingTable prs={filteredPrs} isLoading={isLoading} />
          ) : (
            <PR090DetailView prs={tableFilters.apply(prsByProject)} isLoading={isLoading} />
          )}
        </div>
      </div>
    </div>
  );
}
