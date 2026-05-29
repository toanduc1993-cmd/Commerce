'use client';

/**
 * /alerts — F04 Alert Center (Reconciliation gaps dashboard)
 *
 * Đọc snapshot `project_reconciliation.json` qua backend, hiển thị 79 alerts
 * với 3 mức (HIGH/MEDIUM/LOW), filter + search + mark resolved.
 *
 * Spec: specs/F04-alert-center.md (ISS-0007 pilot spec-driven workflow).
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Toaster, toast } from 'react-hot-toast';
import { Sidebar } from '@/components/layout/Sidebar';
import { AlertKpiCards } from './_components/AlertKpiCards';
import { AlertFilterBar } from './_components/AlertFilterBar';
import { AlertTable } from './_components/AlertTable';
import type { AlertRecord, AlertSummary, Severity } from './_components/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';

export default function AlertsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AlertRecord[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);

  // Filter state
  const [severity, setSeverity] = useState<Severity | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  async function load() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    const params = new URLSearchParams();
    if (severity !== 'ALL') params.set('severity', severity);
    if (search.trim()) params.set('search', search.trim());
    // Default to open-only; toggle to fetch all (open + resolved)
    if (!showResolved) params.set('resolved', 'false');
    const url = `${API_URL}/api/v1/alerts${params.toString() ? `?${params}` : ''}`;
    try {
      const res = await fetch(url, { credentials: 'include', signal: ctrl.signal });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        toast.error(`Tải alerts thất bại: HTTP ${res.status}`);
        return;
      }
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
        setSummary(json.summary || null);
      } else {
        toast.error(`Tải alerts thất bại: ${json.error || 'không rõ'}`);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('alerts load failed', e);
        toast.error(
          `Không kết nối được API. Kiểm tra NEXT_PUBLIC_API_URL (current: ${API_URL}).`
        );
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  // Initial + filter changes (debounce search 250ms)
  useEffect(() => {
    if (!localStorage.getItem('ibshi_authed')) {
      router.push('/login');
      return;
    }
    const t = setTimeout(() => {
      load();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity, search, showResolved]);

  return (
    <div className="flex h-screen bg-slate-50">
      <Toaster position="top-right" />
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
          {/* Header */}
          <header className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-h2">Alert Center — Reconciliation gaps</h1>
              <p className="text-caption text-slate-500 mt-1">
                Audit snapshot:{' '}
                <span className="font-mono">
                  {summary?.lastAuditDate
                    ? new Date(summary.lastAuditDate).toLocaleDateString('vi-VN')
                    : '—'}
                </span>{' '}
                · Tổng cờ: {summary?.totalFlagged ?? 0} · Spec: F04 (ISS-0007 pilot)
              </p>
            </div>
            <button
              type="button"
              onClick={load}
              className="text-caption inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 hover:bg-white"
            >
              <span className="material-symbols-outlined text-[14px]">refresh</span>
              Tải lại
            </button>
          </header>

          {/* KPI cards */}
          <AlertKpiCards summary={summary} loading={loading} />

          {/* Filter bar */}
          <AlertFilterBar
            severity={severity}
            setSeverity={setSeverity}
            search={search}
            setSearch={setSearch}
            showResolved={showResolved}
            setShowResolved={setShowResolved}
          />

          {/* Table */}
          <AlertTable data={data} loading={loading} onChanged={load} />
        </div>
      </div>
    </div>
  );
}
