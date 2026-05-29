// ============================================================
// UI-4-3: Keyboard shortcuts cheatsheet modal
// Press ? to open; Esc to close.
// ============================================================
'use client';

import { useEffect, useState } from 'react';

interface Shortcut {
  keys: string[];
  description: string;
  scope: 'global' | 'list' | 'detail';
}

const SHORTCUTS: Shortcut[] = [
  // Global
  { keys: ['?'], description: 'Mở/đóng bảng phím tắt này', scope: 'global' },
  { keys: ['Esc'], description: 'Đóng modal hiện tại', scope: 'global' },
  { keys: ['g', 'd'], description: 'Đi tới Dashboard', scope: 'global' },
  { keys: ['g', 'p'], description: 'Đi tới Mua hàng (PR list)', scope: 'global' },
  { keys: ['g', 'b'], description: 'Đi tới Báo giá (RFQ list)', scope: 'global' },
  { keys: ['g', 'h'], description: 'Đi tới Hợp đồng', scope: 'global' },
  { keys: ['g', 't'], description: 'Đi tới Thanh toán', scope: 'global' },
  { keys: ['g', 'w'], description: 'Đi tới Kho (warehouse)', scope: 'global' },
  { keys: ['g', 'a'], description: 'Đi tới Alerts', scope: 'global' },

  // List
  { keys: ['/'], description: 'Focus ô tìm kiếm', scope: 'list' },
  { keys: ['n'], description: 'Hành động "New" (Tạo PR/RFQ tuỳ trang)', scope: 'list' },
  { keys: ['j'], description: 'Xuống dòng tiếp theo', scope: 'list' },
  { keys: ['k'], description: 'Lên dòng trước', scope: 'list' },
  { keys: ['Enter'], description: 'Mở chi tiết dòng', scope: 'list' },

  // Detail
  { keys: ['e'], description: 'Edit / chuyển sang chế độ chỉnh sửa', scope: 'detail' },
  { keys: ['s'], description: 'Save (khi đang edit)', scope: 'detail' },
  { keys: ['Backspace'], description: 'Quay lại danh sách', scope: 'detail' },
];

const KEY_NAV: Record<string, string> = {
  d: '/dashboard',
  p: '/mua-hang',
  b: '/bao-gia',
  h: '/hop-dong',
  t: '/thanh-toan',
  w: '/warehouse',
  a: '/alerts',
};

export function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);
  const [pendingG, setPendingG] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore khi đang gõ trong input/textarea/contenteditable
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Toggle modal trên ?
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setOpen((v) => !v);
        setPendingG(false);
        return;
      }

      if (open && e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }

      // g-prefix navigation (vim-like)
      if (e.key === 'g' && !pendingG) {
        setPendingG(true);
        // Reset sau 1.5s nếu không nhấn key tiếp
        setTimeout(() => setPendingG(false), 1500);
        return;
      }

      if (pendingG && KEY_NAV[e.key]) {
        e.preventDefault();
        setPendingG(false);
        window.location.href = KEY_NAV[e.key];
      } else if (pendingG) {
        setPendingG(false);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, pendingG]);

  if (!open) {
    return pendingG ? (
      <div className="fixed bottom-4 right-4 bg-slate-900 text-white text-xs px-3 py-1.5 rounded shadow-lg z-50">
        <kbd className="font-mono font-bold">g</kbd> ...waiting for next key (d/p/b/h/t/w/a)
      </div>
    ) : null;
  }

  const byScope = {
    global: SHORTCUTS.filter((s) => s.scope === 'global'),
    list: SHORTCUTS.filter((s) => s.scope === 'list'),
    detail: SHORTCUTS.filter((s) => s.scope === 'detail'),
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-label="Bảng phím tắt"
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900">Phím tắt</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Nhấn <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono">?</kbd>{' '}
              bất cứ đâu để mở/đóng bảng này
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100"
            aria-label="Đóng"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {(['global', 'list', 'detail'] as const).map((scope) => (
            <section key={scope}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                {scope === 'global' ? 'Toàn cục' : scope === 'list' ? 'Trang danh sách' : 'Trang chi tiết'}
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  {byScope[scope].map((s) => (
                    <tr key={s.description} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 w-32">
                        <span className="inline-flex items-center gap-1">
                          {s.keys.map((k, i) => (
                            <span key={i} className="inline-flex items-center gap-0.5">
                              {i > 0 && <span className="text-slate-400 text-xs">→</span>}
                              <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs font-mono font-bold text-slate-700 shadow-sm">
                                {k}
                              </kbd>
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="py-2 text-slate-700">{s.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>

        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-3 text-xs text-slate-500">
          Phím <kbd className="px-1 bg-white rounded text-[10px] font-mono">g</kbd> là prefix navigation kiểu vim — đợi tối đa 1.5s cho key tiếp theo.
        </div>
      </div>
    </div>
  );
}
