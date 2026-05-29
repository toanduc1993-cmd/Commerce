'use client';

/**
 * UpdateProcurementModal — Cập nhật tình trạng mua sắm từ file Excel
 *
 * Nhận file Excel "Theo dõi dự án" (format master tracking 168 cột) và update:
 *  - PrDetail: remainQty/Weight, toBuyQty/Weight, statusFlag, remarks
 *  - ContractDetail: tạo mới/cập nhật contracts (DOM + IMP) cho từng item
 *  - Tự động create item mới nếu file có item chưa có trong DB
 */

import { useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { updateProcurementFromFile, type ProcurementUpdateResult } from '@/lib/api';
import type { Project } from '@/context/ProjectContext';

interface UpdateProcurementModalProps {
  onClose: () => void;
  onSuccess: () => void;
  projects: Project[];
  defaultProjectId?: string;
}

export function UpdateProcurementModal({
  onClose,
  onSuccess,
  projects,
  defaultProjectId,
}: UpdateProcurementModalProps) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(
    defaultProjectId ? projects.find((p) => p.id === defaultProjectId) || null : null
  );
  const [file, setFile] = useState<File | null>(null);
  const [createMissing, setCreateMissing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ProcurementUpdateResult | null>(null);
  const [isDrag, setIsDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDrag(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.match(/\.xlsx?$/i)) setFile(f);
    else toast.error('Chỉ chấp nhận file .xlsx hoặc .xls');
  };

  const handleSubmit = async () => {
    if (!selectedProject || !file) return;
    setIsLoading(true);
    setResult(null);
    const toastId = toast.loading(`Đang xử lý ${file.name}…`);
    try {
      const r = await updateProcurementFromFile(file, selectedProject.code, createMissing);
      toast.dismiss(toastId);
      setResult(r);
      if (r.success) {
        toast.success(`✅ ${r.message || 'Cập nhật thành công'}`, { duration: 5000 });
        onSuccess();
      } else {
        toast.error(`❌ ${r.error || 'Lỗi không xác định'}`);
      }
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(`❌ ${err instanceof Error ? err.message : 'Lỗi mạng'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const canSubmit = !!selectedProject && !!file && !isLoading;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#1B365D] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-white text-[24px]">sync_alt</span>
            <div>
              <div className="text-white font-black text-sm">Cập Nhật Tình Trạng Mua Sắm</div>
              <div className="text-blue-200 text-[10px] mt-0.5">
                Upload file Excel &ldquo;Theo dõi dự án&rdquo; — tự động cập nhật DB
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Step 1: Project */}
          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-700 mb-2">
              <span className="w-4 h-4 bg-[#1B365D] text-white rounded-full flex items-center justify-center text-[9px] font-black shrink-0">
                1
              </span>
              Chọn dự án cần cập nhật <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
              {projects.map((p) => (
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

          {/* Step 2: File */}
          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-700 mb-2">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${
                  selectedProject ? 'bg-[#1B365D] text-white' : 'bg-slate-300 text-slate-500'
                }`}
              >
                2
              </span>
              Chọn file Excel &ldquo;Theo dõi dự án&rdquo;
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
                    : 'border-slate-300 hover:border-[#1B365D]/60 cursor-pointer'
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
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
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setResult(null);
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
                    File master tracking format IBSHI (.xlsx) — sheet code dự án
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Step 3: Options */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createMissing}
                onChange={(e) => setCreateMissing(e.target.checked)}
                className="w-4 h-4 accent-[#1B365D]"
              />
              <span className="text-[11px] font-bold text-slate-700">
                Tự động tạo mã vật tư mới nếu chưa có trong hệ thống
              </span>
            </label>
            <div className="text-[9px] text-slate-400 ml-6 mt-0.5">
              Khuyến nghị BẬT — file tracking thường có item mới chưa import qua PR
            </div>
          </div>

          {/* Result panel */}
          {result && result.success && result.stats && (
            <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600">check_circle</span>
                <div className="text-xs font-black text-emerald-800">
                  Cập nhật thành công · Sheet: {result.sheetName}
                  {result.format && (
                    <span className="ml-2 px-1.5 py-0.5 bg-emerald-200 text-emerald-800 rounded text-[8px] font-bold uppercase">
                      {result.format}
                    </span>
                  )}
                </div>
              </div>
              {result.notice && (
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800">
                  <span className="material-symbols-outlined text-amber-500 text-[14px] shrink-0 mt-0.5">
                    info
                  </span>
                  <span>{result.notice}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600 pl-7">
                <div>
                  📋 Tổng dòng parse:{' '}
                  <strong className="text-[#1B365D]">{result.stats.totalParsed}</strong>
                </div>
                <div>
                  ✏️ Đã cập nhật: <strong className="text-[#1B365D]">{result.stats.updated}</strong>
                </div>
                <div>
                  🆕 Tạo mới: <strong className="text-emerald-700">{result.stats.created}</strong>
                </div>
                <div>
                  🔍 Đã match: <strong className="text-blue-700">{result.stats.matched}</strong>
                </div>
                <div>
                  📄 Hợp đồng tạo:{' '}
                  <strong className="text-amber-700">{result.stats.contractsCreated}</strong>
                </div>
                <div>
                  🔄 HĐ cập nhật:{' '}
                  <strong className="text-amber-700">{result.stats.contractsUpdated}</strong>
                </div>
                {result.stats.notFound > 0 && (
                  <div className="col-span-2 text-red-600">
                    ⚠️ Không tìm thấy: <strong>{result.stats.notFound}</strong> mã (đã skip)
                  </div>
                )}
              </div>
              {result.stats.errors.length > 0 && (
                <details className="text-[9px] text-red-600 pl-7">
                  <summary className="cursor-pointer font-bold">
                    {result.stats.errors.length} lỗi (click để xem)
                  </summary>
                  <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                    {result.stats.errors.map((e, i) => (
                      <li key={i}>
                        <strong>{e.itemCode}</strong>: {e.error.slice(0, 80)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {!selectedProject && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="material-symbols-outlined text-amber-500 text-[16px]">info</span>
              <span className="text-[10px] text-amber-700">
                Vui lòng chọn dự án trước. Hệ thống sẽ tìm sheet tracking khớp với mã dự án trong
                file Excel.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-3 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            {result?.success ? 'Đóng' : 'Hủy'}
          </button>
          <button
            onClick={handleSubmit}
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
              `Cập nhật ${selectedProject ? `→ ${selectedProject.code}` : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
