'use client';

/**
 * components/Skeleton.tsx — UI-3-2: Loading skeleton primitives
 *
 * Replace "Đang tải..." text with animated bone-like blocks.
 *
 * Usage:
 *   if (isLoading) return <SkeletonPage variant="dashboard" />;
 *   if (isLoading) return <SkeletonTable rows={5} cols={6} />;
 */
import { CSSProperties } from 'react';

const baseStyle: CSSProperties = {
  background: 'linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)',
  backgroundSize: '200% 100%',
  animation: 'skeleton-pulse 1.4s ease-in-out infinite',
};

export function SkeletonBox({
  width = '100%',
  height = '1rem',
  radius = 'var(--radius-md, 0.5rem)',
  className = '',
}: {
  width?: string | number;
  height?: string | number;
  radius?: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{ ...baseStyle, width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function SkeletonLine({ width = '100%' }: { width?: string | number }) {
  return <SkeletonBox width={width} height="0.875rem" radius="var(--radius-sm, 0.25rem)" />;
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <SkeletonBox width={32} height={32} radius="var(--radius-md)" />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="40%" />
          <SkeletonBox width="60%" height="2rem" />
          <SkeletonLine width="50%" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <SkeletonLine width="30%" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }).map((_, c) => (
              <SkeletonLine key={c} width={c === 0 ? '60%' : '90%'} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonPage({ variant = 'default' }: { variant?: 'default' | 'dashboard' | 'list' }) {
  if (variant === 'dashboard') {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={6} cols={5} />
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div className="space-y-4">
        <SkeletonBox height="2.5rem" width="50%" />
        <SkeletonTable rows={10} cols={6} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-8">
      <SkeletonBox height="2rem" width="40%" />
      <SkeletonBox height="1rem" width="60%" />
      <SkeletonTable rows={5} cols={4} />
    </div>
  );
}

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('skeleton-keyframes')) {
  const style = document.createElement('style');
  style.id = 'skeleton-keyframes';
  style.textContent = `@keyframes skeleton-pulse { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`;
  document.head.appendChild(style);
}
