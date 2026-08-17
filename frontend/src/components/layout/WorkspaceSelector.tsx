'use client';

/**
 * components/layout/WorkspaceSelector.tsx — UI-1-3 UI piece
 *
 * Project picker dropdown — sits at top of Sidebar.
 * Selected project = "focus" for all data views.
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';

export function WorkspaceSelector() {
  const { project, setProject, allProjects, dangTai } = useWorkspace();
  const [open, setOpen] = useState(false);
  // 17/08: danh sách từ 4 lên 66 dự án — cuộn tay tìm một dự án là cực hình,
  // nên thêm ô lọc ngay trong menu.
  const [tim, setTim] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const hienThi = useMemo(() => {
    const t = tim.trim().toLowerCase();
    if (!t) return allProjects;
    return allProjects.filter(
      (p) => p.code.toLowerCase().includes(t) || p.name.toLowerCase().includes(t)
    );
  }, [allProjects, tim]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setTim('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={ref} className="relative px-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 bg-white hover:border-[var(--color-brand)] transition-colors text-left"
        aria-expanded={open}
      >
        <span
          className="material-symbols-outlined"
          style={{ color: project ? 'var(--color-brand)' : 'var(--color-warning)' }}
        >
          {project ? 'folder_open' : 'all_inclusive'}
        </span>
        <div className="flex-1 min-w-0">
          {/* Bỏ nhãn "Workspace" 14/08/2026 — logo phía trên đã nói rõ đây là gì,
              giữ lại chỉ làm đầu thanh dọc rối thêm. Nút chọn dự án giữ nguyên. */}
          <div className="text-h3 truncate">
            {project ? project.code : 'Tất cả dự án'}
          </div>
          {project && (
            <div className="text-caption text-slate-500 truncate">{project.name}</div>
          )}
        </div>
        <span className="material-symbols-outlined text-slate-400 text-[18px]">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="absolute left-4 right-4 top-full mt-1 bg-white rounded-lg shadow-lg border border-slate-200 z-50 max-h-[60vh] overflow-y-auto">
          {/* Ô lọc — dính trên đầu khi cuộn */}
          <div className="sticky top-0 bg-white border-b border-slate-100 p-2 z-10">
            <input
              autoFocus
              value={tim}
              onChange={(e) => setTim(e.target.value)}
              placeholder={`Lọc trong ${allProjects.length} dự án…`}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-caption focus:outline-none focus:border-[var(--color-brand)]"
            />
            {dangTai && (
              <div className="text-caption text-slate-400 mt-1 px-0.5">Đang nạp danh sách dự án…</div>
            )}
          </div>
          <button
            onClick={() => {
              setProject(null);
              setOpen(false);
              setTim('');
            }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 ${
              !project ? 'bg-[var(--color-info-soft)]' : ''
            }`}
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ color: 'var(--color-warning)' }}
            >
              all_inclusive
            </span>
            <span className="text-emphasis">Tất cả dự án</span>
            {!project && (
              <span className="material-symbols-outlined ml-auto text-[18px] text-[var(--color-info)]">
                check
              </span>
            )}
          </button>
          {hienThi.length === 0 && (
            <div className="px-3 py-4 text-caption text-slate-400 text-center">
              Không có dự án nào khớp “{tim}”
            </div>
          )}
          {hienThi.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setProject(p);
                setOpen(false);
                setTim('');
              }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 ${
                project?.id === p.id ? 'bg-[var(--color-info-soft)]' : ''
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={{ color: 'var(--color-brand)' }}
              >
                folder_open
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-emphasis truncate">{p.code}</div>
                <div className="text-caption text-slate-500 truncate">{p.name}</div>
              </div>
              {project?.id === p.id && (
                <span className="material-symbols-outlined text-[18px] text-[var(--color-info)]">
                  check
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
