// Shared types for F04 Alert Center components

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
export type FlagKind = 'ORPHAN_INVOICE' | 'CHƯA_XUẤT_HĐ' | 'PQLDA_KHÔNG_INV';

export interface AlertRecord {
  canonical_key: string;
  flags: string[];
  severity: Severity;
  bid_du_toan_vnd: number;
  pqlda_du_toan_vnd: number;
  invoice_thuc_xuat_vnd: number;
  invoice_n: number;
  delta_pqlda_vs_invoice_vnd: number;
  pct_invoice_vs_pqlda: number | null;
  pct_invoice_vs_bid: number | null;
  in_bid: boolean;
  in_pqlda: boolean;
  in_invoice: boolean;
  raw_codes_bid: string[];
  raw_codes_pqlda: string[];
  raw_codes_invoice: string[];
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_note: string | null;
}

export interface AlertSummary {
  high: number;
  medium: number;
  low: number;
  totalResolved: number;
  lastAuditDate: string | null;
  totalFlagged: number;
}
