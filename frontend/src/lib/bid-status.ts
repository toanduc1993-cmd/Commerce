// ============================================================
// F-BID-A: Shared BidAnalysis status + selectionMode constants
// ============================================================

export type BidStatus = 'OPEN' | 'EVALUATING' | 'SELECTED' | 'CONTRACTED' | 'CANCELLED';

export type SelectionMode =
  | 'PER_BID'
  | 'PER_ITEM'
  | 'PER_GROUP'
  | 'AUTO_MIN_PRICE'
  | 'MANUAL_WEIGHTED';

export interface StatusConfig {
  label: string;
  color: string; // Tailwind class fragment
  description: string;
}

export const STATUS_CFG: Record<BidStatus, StatusConfig> = {
  OPEN: {
    label: 'Chờ báo giá',
    color: 'bg-slate-100 text-slate-700 border-slate-300',
    description: 'RFQ đã phát hành, đang đợi NCC gửi báo giá',
  },
  EVALUATING: {
    label: 'Đang so sánh',
    color: 'bg-blue-100 text-blue-700 border-blue-300',
    description: 'Đã nhận báo giá, đang đánh giá',
  },
  SELECTED: {
    label: 'Đã duyệt NCC',
    color: 'bg-amber-100 text-amber-800 border-amber-300',
    description: 'Đã chọn NCC, chưa phát hành PO',
  },
  CONTRACTED: {
    label: 'Đã ký HĐ',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    description: 'Đã phát hành PO + HĐ',
  },
  CANCELLED: {
    label: 'Huỷ',
    color: 'bg-rose-100 text-rose-700 border-rose-300',
    description: 'BID đã bị huỷ',
  },
};

export const STATUS_LABEL: Record<BidStatus, string> = Object.fromEntries(
  Object.entries(STATUS_CFG).map(([k, v]) => [k, v.label])
) as Record<BidStatus, string>;

export interface SelectionModeConfig {
  key: SelectionMode;
  label: string;
  description: string;
  icon: string;
  bestFor: string;
}

export const SELECTION_MODES: SelectionModeConfig[] = [
  {
    key: 'PER_BID',
    label: 'Chọn 1 NCC cho toàn bộ BID',
    description: 'Một vendor thắng toàn bộ items trong BID (truyền thống).',
    icon: 'verified_user',
    bestFor: 'BID đơn giản, ít item (<10), 1 nhóm vật tư.',
  },
  {
    key: 'PER_ITEM',
    label: 'Chọn NCC theo từng item',
    description: 'Mỗi item chọn NCC riêng (granular).',
    icon: 'list_alt',
    bestFor: 'BID có nhiều item cùng nhóm, giá biến động.',
  },
  {
    key: 'PER_GROUP',
    label: 'Chọn NCC theo nhóm vật tư',
    description: 'Items group theo material subgroup, mỗi group 1 NCC.',
    icon: 'category',
    bestFor: 'BID >10 items, nhiều nhóm vật tư (>2 groups).',
  },
  {
    key: 'AUTO_MIN_PRICE',
    label: 'Tự động chọn giá thấp nhất',
    description: 'Hệ thống chọn vendor có unitPrice min cho mỗi item.',
    icon: 'auto_awesome',
    bestFor: 'BID tiêu chuẩn, không có ràng buộc chất lượng/payment.',
  },
  {
    key: 'MANUAL_WEIGHTED',
    label: 'Chấm điểm vendor đa tiêu chí',
    description: 'Scorecard cho từng vendor (giá + chất lượng + payment terms).',
    icon: 'scoreboard',
    bestFor: 'BID giá trị lớn, cần đánh giá tổng thể nhiều mặt.',
  },
];

/**
 * Suggest default mode based on BID shape.
 * Per DA spec F-BID-A:
 *   - itemsCount < 10 → PER_BID
 *   - itemsCount >= 10 && uniqueGroups > 2 → PER_GROUP
 *   - itemsCount >= 10 && uniqueGroups === 1 → PER_ITEM
 *   - else → PER_ITEM (default)
 */
export function suggestSelectionMode(itemsCount: number, uniqueGroups: number): SelectionMode {
  if (itemsCount < 10) return 'PER_BID';
  if (uniqueGroups > 2) return 'PER_GROUP';
  if (uniqueGroups === 1) return 'PER_ITEM';
  return 'PER_ITEM';
}
