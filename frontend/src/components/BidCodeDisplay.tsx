'use client';

/**
 * components/BidCodeDisplay.tsx — Smart bidcode renderer (B-CPVT-018)
 *
 * 3-layer display:
 *   1. Subject (h3, primary description)
 *   2. Bidcode (mono, sortable ID)
 *   3. Badges (parsed segments: project · month · material · #seq · urgent?)
 *
 * Usage:
 *   <BidCodeDisplay bidCode="BID-VPI095-2606-VTC-001" subject="..." />
 *   <BidCodeDisplay bidCode="..." compact />  (just badges, no subject)
 */
import { useMemo } from 'react';

const MAT_LABELS: Record<string, string> = {
  VTC: 'Thép chính',
  VPK: 'Phụ kiện, bu lông',
  VDK: 'Đóng kiện',
  VBP: 'Biện pháp',
  VTH: 'Tiêu hao',
  VTS: 'Sơn & xử lý bề mặt',
  VTP: 'Dự phòng',
  MIX: 'Nhiều nhóm',
  ALL: 'Tất cả',
};

const BIDCODE_REGEX = /^BID(!?)-([A-Z0-9]{3,8})-(\d{4})-([A-Z]{3})-(\d{3})([A-Z])?$/;

export interface ParsedBidCode {
  raw: string;
  urgent: boolean;
  proj: string;
  yymm: string;
  year: number;
  month: number;
  monthLabel: string;
  mat: string;
  matLabel: string;
  seq: number;
  variant: string | null;
}

export function parseBidCode(code: string | null | undefined): ParsedBidCode | null {
  if (!code) return null;
  const m = code.match(BIDCODE_REGEX);
  if (!m) return null;
  const [, urgent, proj, yymm, mat, seq, variant] = m;
  const yy = parseInt(yymm.slice(0, 2), 10);
  const mm = parseInt(yymm.slice(2, 4), 10);
  const year = 2000 + yy;
  return {
    raw: code,
    urgent: Boolean(urgent),
    proj,
    yymm,
    year,
    month: mm,
    monthLabel: `${String(mm).padStart(2, '0')}/${year}`,
    mat,
    matLabel: MAT_LABELS[mat] || mat,
    seq: parseInt(seq, 10),
    variant: variant || null,
  };
}

interface Props {
  bidCode: string | null | undefined;
  legacyBidCode?: string | null;
  subject?: string | null;
  compact?: boolean;
  showLegacy?: boolean;
  /** Click handler on the whole component (e.g. to open detail) */
  onClick?: () => void;
}

export function BidCodeDisplay({
  bidCode,
  legacyBidCode,
  subject,
  compact = false,
  showLegacy = false,
  onClick,
}: Props) {
  const parsed = useMemo(() => parseBidCode(bidCode), [bidCode]);

  // Fallback: legacy format
  if (!parsed) {
    return (
      <div className={onClick ? 'cursor-pointer' : ''} onClick={onClick}>
        {subject && !compact && (
          <div className="text-h3 text-[var(--color-brand)]">{subject}</div>
        )}
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {legacyBidCode || bidCode ? (
            <code className="text-body font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
              {legacyBidCode || bidCode}
            </code>
          ) : (
            <code className="text-caption text-slate-400 italic">— Chưa có mã —</code>
          )}
          {legacyBidCode && (
            <span
              className="badge badge-warning text-[10px]"
              title="Mã legacy — chưa migrate sang format mới"
            >
              Legacy
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={onClick ? 'cursor-pointer' : ''} onClick={onClick}>
      {subject && !compact && (
        <div className="text-h3 text-[var(--color-brand)] mb-1" title={subject}>
          {subject}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <code
          className={`font-mono text-emphasis px-2 py-0.5 rounded ${
            parsed.urgent
              ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
              : 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
          }`}
          title={legacyBidCode && legacyBidCode !== bidCode ? `Mã cũ (audit): ${legacyBidCode}` : undefined}
        >
          {parsed.raw}
        </code>
        {!compact && (
          <div className="flex items-center gap-1 flex-wrap">
            <Badge icon="folder_open" label={parsed.proj} title="Dự án" />
            <Badge icon="calendar_month" label={parsed.monthLabel} title="Tháng tạo" />
            <Badge
              icon="inventory_2"
              label={`${parsed.matLabel} (${parsed.mat})`}
              title="Nhóm vật tư"
            />
            <Badge icon="tag" label={`#${parsed.seq}${parsed.variant || ''}`} title="STT trong tháng" />
            {parsed.urgent && (
              <Badge icon="priority_high" label="Khẩn" tone="danger" title="Đơn khẩn cấp" />
            )}
            {parsed.variant && (
              <Badge
                icon="restart_alt"
                label={`Re-issue ${parsed.variant}`}
                tone="warning"
                title="Lần gửi lại"
              />
            )}
          </div>
        )}
      </div>
      {showLegacy && legacyBidCode && legacyBidCode !== bidCode && (
        <div className="mt-1 text-caption text-slate-400">
          Legacy: <code className="font-mono">{legacyBidCode}</code>
        </div>
      )}
    </div>
  );
}

function Badge({
  icon,
  label,
  tone,
  title,
}: {
  icon: string;
  label: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
}) {
  const cls = tone ? `badge-${tone}` : 'badge-info';
  return (
    <span className={`badge ${cls} inline-flex items-center gap-1`} title={title}>
      <span className="material-symbols-outlined text-[12px]">{icon}</span>
      <span>{label}</span>
    </span>
  );
}
