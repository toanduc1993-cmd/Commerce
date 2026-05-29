'use client';

/**
 * components/data-table/TableSearch.tsx — Search input bar
 * Cmd/Ctrl+K hotkey để focus, Esc để clear
 */
import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  resultCount?: number;
  totalCount?: number;
  className?: string;
}

export function TableSearch({
  value,
  onChange,
  placeholder = 'Tìm kiếm...',
  resultCount,
  totalCount,
  className = '',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`relative flex items-center ${className}`}>
      <span className="material-symbols-outlined absolute left-3 text-slate-400 text-[20px] pointer-events-none">
        search
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('');
            inputRef.current?.blur();
          }
        }}
        placeholder={placeholder}
        className="w-full pl-10 pr-24 py-2 rounded-lg border border-slate-300 bg-white text-body focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent"
      />
      <div className="absolute right-2 flex items-center gap-1">
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            title="Xóa tìm kiếm (Esc)"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
        {totalCount != null && (
          <span className="text-caption text-slate-400 px-2 whitespace-nowrap">
            {resultCount != null && resultCount !== totalCount ? (
              <>
                <span className="font-semibold text-[var(--color-info)]">{resultCount}</span>
                <span className="text-slate-300">/</span>
                {totalCount}
              </>
            ) : (
              totalCount
            )}
          </span>
        )}
        <kbd className="hidden sm:inline-block text-[10px] font-mono text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
          ⌘K
        </kbd>
      </div>
    </div>
  );
}
