'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { ensureCsrfToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';

interface Props {
  canonicalKey: string;
  resolved: boolean;
  onChanged: () => void;
}

export function MarkResolvedButton({ canonicalKey, resolved, onChanged }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    const verb = resolved ? 'unresolve' : 'resolve';
    const toastId = toast.loading(resolved ? 'Đang mở lại alert…' : 'Đang đánh dấu resolved…');
    try {
      const csrfToken = await ensureCsrfToken();
      const res = await fetch(
        `${API_URL}/api/v1/alerts/${encodeURIComponent(canonicalKey)}/${verb}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          body: verb === 'resolve' ? JSON.stringify({}) : undefined,
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(resolved ? 'Đã mở lại alert' : 'Đã đánh dấu resolved', { id: toastId });
      onChanged();
    } catch (e) {
      toast.error(`Lỗi: ${(e as Error).message}`, { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`text-caption inline-flex items-center gap-1 px-2 py-1 rounded ${
        resolved
          ? 'badge-success hover:opacity-80'
          : 'bg-[var(--color-brand)] text-white hover:opacity-90'
      } disabled:opacity-50`}
    >
      <span className="material-symbols-outlined text-[14px]">
        {resolved ? 'undo' : 'task_alt'}
      </span>
      {busy ? '...' : resolved ? 'Mở lại' : 'Resolved'}
    </button>
  );
}
