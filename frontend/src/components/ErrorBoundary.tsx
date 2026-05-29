'use client';

/**
 * components/ErrorBoundary.tsx — S1-4: Catch React render errors
 *
 * Wrap each page or top-level layout to prevent white-screen-of-death.
 * Logs to backend /api/v1/client-errors (best-effort) + shows friendly fallback.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <YourPage />
 *   </ErrorBoundary>
 */
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (err: Error, reset: () => void) => ReactNode;
  scope?: string; // e.g. 'page:/dashboard'
}

interface State {
  err: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, errInfo: { componentStack?: string }) {
    // Best-effort report to backend (S1-4 — backend endpoint stub for now)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';
      void fetch(`${apiUrl}/api/v1/client-errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: this.props.scope || 'unknown',
          message: err.message,
          stack: err.stack?.slice(0, 2000),
          componentStack: errInfo.componentStack?.slice(0, 2000),
          url: typeof window !== 'undefined' ? window.location.href : '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {
        /* swallow — best effort */
      });
    } catch {
      /* noop */
    }
  }

  reset = () => this.setState({ err: null });

  render() {
    const { err } = this.state;
    if (!err) return this.props.children;

    if (this.props.fallback) return this.props.fallback(err, this.reset);

    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background,#f8f9ff)] p-8">
        <div className="max-w-lg w-full bg-white rounded-xl shadow-md border border-slate-200 p-8 text-center">
          <span
            className="material-symbols-outlined text-display"
            style={{ color: 'var(--color-danger, #dc2626)' }}
          >
            error
          </span>
          <h1 className="text-h2 mt-3">Đã xảy ra lỗi</h1>
          <p className="text-body text-slate-600 mt-2">
            Một sự cố không mong muốn vừa xảy ra. Lỗi đã được ghi nhận tự động.
          </p>
          <pre className="text-caption text-slate-500 bg-slate-50 rounded-md p-3 mt-4 text-left overflow-auto max-h-32">
            {err.message}
          </pre>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={this.reset}
              className="badge-info px-4 py-2 rounded-md text-body font-semibold hover:opacity-90"
              style={{ background: 'var(--color-info)', color: 'white' }}
            >
              Thử lại
            </button>
            <button
              onClick={() => (window.location.href = '/dashboard')}
              className="px-4 py-2 rounded-md text-body font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Về Bảng Điều Khiển
            </button>
          </div>
          <p className="text-caption text-slate-400 mt-4">
            Nếu lỗi lặp lại, liên hệ Quản trị viên với mã correlation từ tab Network.
          </p>
        </div>
      </div>
    );
  }
}
