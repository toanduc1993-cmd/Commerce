// ============================================================
// UI-2-1: Per-PR progress timeline (dynamic, derived from PR data)
// Khác với WorkflowProgress.tsx (static demo) — component này nhận
// 1 PRDetail record + render đúng stage theo statusFlag + downstream data.
// ============================================================
'use client';

import type { PRDetail } from '@/types/procurement';

interface Stage {
  key: string;
  icon: string;
  label: string;
  description: string;
}

const STAGES: Stage[] = [
  { key: 'requested', icon: 'description', label: 'Yêu cầu', description: 'PR đã tạo' },
  { key: 'sourcing', icon: 'request_quote', label: 'Báo giá', description: 'RFQ đang nhận quote' },
  { key: 'evaluating', icon: 'compare_arrows', label: 'So sánh', description: 'Đánh giá NCC' },
  { key: 'approved', icon: 'how_to_reg', label: 'Phê duyệt', description: 'NCC + giá chốt' },
  { key: 'po_issued', icon: 'verified', label: 'Phát hành PO', description: 'PO đã ký' },
  { key: 'in_transit', icon: 'local_shipping', label: 'Đang về', description: 'Hàng đang giao' },
  { key: 'received', icon: 'warehouse', label: 'Nhập kho', description: 'GRN + QC pass' },
];

// Map status → stage index (0-indexed, 6 = received)
function deriveStageIndex(pr: PRDetail): number {
  const flag = (pr.statusFlag || '').toLowerCase().trim();
  if (flag.includes('nhập kho') || flag.includes('hoàn tất') || flag.includes('received')) return 6;
  if (flag.includes('đang về') || flag.includes('vận chuyển') || flag.includes('transit')) return 5;
  if (flag.includes('phát hành po') || flag.includes('po') || flag.includes('issued')) return 4;
  if (flag.includes('phê duyệt') || flag.includes('approved') || flag.includes('selected')) return 3;
  if (flag.includes('so sánh') || flag.includes('evaluating')) return 2;
  if (flag.includes('chờ báo giá') || flag.includes('báo giá') || flag.includes('sourcing')) return 1;
  return 0;
}

export interface PRProgressTimelineProps {
  pr: PRDetail;
  compact?: boolean;
  className?: string;
}

export function PRProgressTimeline({ pr, compact = false, className = '' }: PRProgressTimelineProps) {
  const activeIdx = deriveStageIndex(pr);
  const progress = activeIdx === STAGES.length - 1 ? 100 : (activeIdx / (STAGES.length - 1)) * 100;

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`} aria-label={`Tiến trình: ${STAGES[activeIdx].label}`}>
        {STAGES.map((s, i) => (
          <div
            key={s.key}
            className={`h-1.5 flex-1 rounded ${
              i < activeIdx
                ? 'bg-emerald-500'
                : i === activeIdx
                  ? 'bg-blue-500'
                  : 'bg-slate-200'
            }`}
            title={s.label}
          />
        ))}
        <span className="text-[10px] font-bold text-slate-600 ml-1 whitespace-nowrap">
          {STAGES[activeIdx].label}
        </span>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-slate-200 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold text-slate-600 uppercase tracking-wide">
          Tiến trình mua sắm
        </div>
        <div className="text-[10px] text-slate-400">
          {Math.round(progress)}% · stage {activeIdx + 1}/{STAGES.length}
        </div>
      </div>

      <div className="relative">
        {/* Background + progress fill */}
        <div className="absolute top-4 left-4 right-4 h-1 bg-slate-200 rounded z-0" />
        <div
          className="absolute top-4 left-4 h-1 bg-gradient-to-r from-emerald-500 to-blue-500 rounded z-10 transition-all"
          style={{ width: `calc(${progress}% - 1rem)` }}
        />

        <div className="flex items-start justify-between relative z-20">
          {STAGES.map((stage, i) => {
            const done = i < activeIdx;
            const active = i === activeIdx;
            return (
              <div
                key={stage.key}
                className="flex flex-col items-center min-w-0 flex-1"
                title={stage.description}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm border-2 ${
                    active
                      ? 'bg-white border-blue-500 text-blue-600 ring-4 ring-blue-100'
                      : done
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">{stage.icon}</span>
                </div>
                <span
                  className={`mt-1 text-[10px] font-semibold text-center leading-tight ${
                    active ? 'text-blue-700' : done ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
        <span className="font-bold text-slate-700">Hiện tại:</span>{' '}
        <span className="italic">{pr.statusFlag || STAGES[activeIdx].description}</span>
      </div>
    </div>
  );
}
