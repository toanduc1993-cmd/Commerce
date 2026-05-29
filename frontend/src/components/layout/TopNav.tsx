'use client';

import { usePathname } from 'next/navigation';
import { useState, useRef } from 'react';
import type { PRStatus } from '@/types/procurement';

interface WorkflowStep {
  key: PRStatus | 'all';
  label: string;
  icon: string;
  count?: number;
}

interface TopNavProps {
  onFileChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onGeneratePO: () => void;
  isLoading: boolean;
  onOpenUpload?: () => void;
  onSearch?: (q: string) => void;
  searchPlaceholder?: string;
  // Workflow submenu — chỉ /pr page cung cấp
  workflowSteps?: WorkflowStep[];
  activeStep?: PRStatus | 'all';
  onStepChange?: (step: PRStatus | 'all') => void;
}

const STEP_CLS: Record<string, string> = {
  all: 'bg-slate-600 text-white',
  'Chờ báo giá': 'bg-slate-500 text-white',
  'Đang đàm phán': 'bg-amber-500 text-white',
  'Đã ký HĐ': 'bg-blue-600  text-white',
  'Hàng đang về': 'bg-indigo-500 text-white',
  'Đã nghiệm thu': 'bg-teal-500  text-white',
  'Đã nhập kho': 'bg-emerald-500 text-white',
};

export function TopNav({
  onGeneratePO,
  isLoading,
  onOpenUpload,
  onSearch,
  searchPlaceholder = 'Tìm kiếm...',
  workflowSteps,
  activeStep,
  onStepChange,
}: TopNavProps) {
  const pathname = usePathname();
  const [dropOpen, setDropOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openDrop = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setDropOpen(true);
  };
  const closeDrop = () => {
    closeTimer.current = setTimeout(() => setDropOpen(false), 150);
  };

  const activeStepObj = workflowSteps?.find((s) => s.key === activeStep);

  return (
    <header className="fixed top-0 right-0 left-64 h-16 z-40 bg-white border-b border-slate-200/80 flex items-center px-6 shadow-sm gap-4">
      {/* Brand */}
      <div className="text-base font-black text-[#1B365D] tracking-tighter whitespace-nowrap shrink-0">
        IBS HI PROCUREMENT
      </div>

      {/* ── "Tiến độ mua hàng" dropdown (chỉ khi /pr) ───────── */}
      {workflowSteps && (
        <div className="relative shrink-0" onMouseEnter={openDrop} onMouseLeave={closeDrop}>
          {/* Trigger button */}
          <button
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-bold transition-all ${
              dropOpen
                ? 'bg-[#1B365D] text-white shadow-md'
                : 'bg-slate-100 text-[#1B365D] hover:bg-[#1B365D]/10'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">timeline</span>
            Tiến độ mua hàng
            {/* Active step badge (khi đang filter) */}
            {activeStep && activeStep !== 'all' && (
              <span className="px-1.5 py-0.5 bg-white/20 text-[7.5px] font-black rounded-full uppercase border border-white/30">
                {activeStep}
              </span>
            )}
            <span
              className={`material-symbols-outlined text-[13px] transition-transform ${dropOpen ? 'rotate-180' : ''}`}
            >
              expand_more
            </span>
          </button>

          {/* Dropdown panel */}
          {dropOpen && (
            <div
              className="absolute top-full left-0 mt-1.5 w-68 bg-white rounded-xl shadow-2xl border border-slate-100 py-2 z-50"
              style={{ minWidth: '260px' }}
              onMouseEnter={openDrop}
              onMouseLeave={closeDrop}
            >
              <div className="px-4 pt-1 pb-2 border-b border-slate-50">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                  Lọc theo bước mua hàng
                </p>
              </div>
              <div className="py-1">
                {workflowSteps.map((step, idx) => {
                  const isStepActive = activeStep === step.key;
                  const activeCls = STEP_CLS[step.key] || STEP_CLS['all'];
                  return (
                    <div key={step.key}>
                      {/* Divider sau "Tất cả" */}
                      {idx === 1 && <div className="my-1 mx-3 border-t border-slate-100" />}
                      <button
                        onClick={() => {
                          onStepChange?.(step.key);
                          setDropOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left text-[11.5px] transition-all ${
                          isStepActive
                            ? `${activeCls} mx-2 rounded-lg`
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                        style={isStepActive ? { width: 'calc(100% - 16px)' } : {}}
                      >
                        <span
                          className={`material-symbols-outlined text-[15px] ${isStepActive ? 'text-white/90' : 'text-slate-400'}`}
                        >
                          {step.icon}
                        </span>
                        <span className={`flex-1 font-medium ${isStepActive ? 'font-bold' : ''}`}>
                          {step.label}
                        </span>
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            isStepActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {step.count ?? 0}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[14px]">
          search
        </span>
        <input
          className="w-full pl-8 pr-4 py-1.5 bg-slate-50 border border-slate-200 focus:border-[#1B365D]/40 focus:ring-2 focus:ring-[#1B365D]/10 rounded-lg text-xs outline-none transition-all"
          placeholder={searchPlaceholder}
          type="text"
          onChange={(e) => onSearch?.(e.target.value)}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* ── Right: action buttons ───────────────────────────── */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onGeneratePO}
          className="bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 rounded-lg font-bold text-xs shadow transition-all active:scale-95 whitespace-nowrap"
        >
          Cấp PO Hàng Loạt
        </button>

        <button
          onClick={onOpenUpload}
          disabled={isLoading}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold text-xs shadow transition-all active:scale-95 whitespace-nowrap ${
            isLoading
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : 'bg-[#1B365D] text-white hover:bg-[#2a5298]'
          }`}
        >
          {isLoading ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[13px]">
                progress_activity
              </span>{' '}
              Đang xử lý...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[13px]">upload_file</span> Upload Dữ
              Liệu
            </>
          )}
        </button>

        <div className="flex items-center gap-2 text-slate-400">
          {(['notifications', 'settings', 'help'] as const).map((icon) => (
            <button key={icon} className="hover:text-[#1B365D] transition-colors">
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
            </button>
          ))}
        </div>

        <div className="w-8 h-8 rounded-full bg-[#1B365D]/10 flex items-center justify-center border-2 border-[#1B365D]/20 shrink-0">
          <span className="material-symbols-outlined text-[#1B365D] text-[16px]">person</span>
        </div>
      </div>
    </header>
  );
}
