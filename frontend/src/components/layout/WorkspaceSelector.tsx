'use client';

/**
 * components/layout/WorkspaceSelector.tsx — UI-1-3 UI piece
 *
 * Project picker dropdown — sits at top of Sidebar.
 * Selected project = "focus" for all data views.
 */
import { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';

export function WorkspaceSelector() {
  const { project, setProject, allProjects } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
          <div className="label">Workspace</div>
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
        <div className="absolute left-4 right-4 top-full mt-1 bg-white rounded-lg shadow-lg border border-slate-200 z-50 max-h-80 overflow-y-auto">
          <button
            onClick={() => {
              setProject(null);
              setOpen(false);
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
          {allProjects.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setProject(p);
                setOpen(false);
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
