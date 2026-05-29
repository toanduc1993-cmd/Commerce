// ============================================================
// COMPONENT: WorkflowProgress.tsx
// Thanh tiến trình milestone mua sắm (static UI)
// ============================================================

'use client';

interface Milestone {
  icon: string;
  label: string;
  date: string;
  active?: boolean;
  done?: boolean;
}

const MILESTONES: Milestone[] = [
  { icon: 'description', label: 'Yêu cầu', date: '10/10', done: true },
  { icon: 'request_quote', label: 'Báo giá', date: '12/10', done: true },
  { icon: 'find_replace', label: 'Làm rõ KT', date: '14/10', done: true },
  { icon: 'how_to_reg', label: 'Phê duyệt', date: '15/10', done: true },
  { icon: 'verified', label: 'Phát hành PO', date: '18/10', done: true },
  { icon: 'local_shipping', label: 'Đang về', date: 'Dự kiến: 05/11', active: true },
  { icon: 'warehouse', label: 'Đã nhập kho', date: 'Chờ xử lý', done: false },
];

export function WorkflowProgress() {
  return (
    <div className="bg-surface-container-low p-8 rounded-xl mb-8">
      <h2 className="text-sm font-bold text-primary mb-6 flex items-center space-x-2">
        <span className="material-symbols-outlined text-sm">account_tree</span>
        <span>QUY TRÌNH XỬ LÝ</span>
      </h2>

      <div className="flex items-center justify-between relative px-4">
        {/* Background track */}
        <div className="absolute top-5 left-0 right-0 h-1 bg-slate-200 z-0 mx-8" />
        {/* Progress fill (~5/7 = done) */}
        <div className="absolute top-5 left-0 w-[72%] h-1 bg-primary z-0 mx-8" />

        {MILESTONES.map((m) => (
          <div key={m.label} className="relative z-10 flex flex-col items-center">
            {m.active ? (
              <div className="w-12 h-12 rounded-full bg-surface-container-lowest border-4 border-primary text-primary flex items-center justify-center shadow-xl mb-2 -mt-1 outline outline-4 outline-surface-container-low">
                <span className="material-symbols-outlined">{m.icon}</span>
              </div>
            ) : m.done ? (
              <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-lg mb-2 outline outline-4 outline-surface-container-low">
                <span className="material-symbols-outlined text-sm">{m.icon}</span>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center mb-2 outline outline-4 outline-surface-container-low">
                <span className="material-symbols-outlined text-sm">{m.icon}</span>
              </div>
            )}
            <span
              className={`text-[10px] font-bold uppercase tracking-tighter text-center max-w-[80px] ${
                m.active
                  ? 'text-primary font-extrabold'
                  : m.done
                    ? 'text-primary'
                    : 'text-slate-400'
              }`}
            >
              {m.label}
            </span>
            <span
              className={`text-[9px] mt-1 ${m.done || m.active ? 'text-on-surface-variant' : 'text-slate-300'}`}
            >
              {m.date}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
