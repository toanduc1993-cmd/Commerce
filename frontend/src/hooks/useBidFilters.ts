// F-BID-B: Single source of truth cho filter logic của BID pages.
// Thay thế filter logic dup ở B2 (yeu-cau-bao-gia) và B3 (bao-gia).

import { useTableFilters } from '@/hooks/useTableFilters';
import { PROJECTS } from '@/context/ProjectContext';
import type { BidAnalysisRow } from '@/lib/api';

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Đang mở' },
  { value: 'EVALUATING', label: 'Đang đánh giá' },
  { value: 'SELECTED', label: 'Đã chọn NCC' },
  { value: 'CONTRACTED', label: 'Đã ký HĐ' },
  { value: 'CANCELLED', label: 'Đã huỷ' },
];

export function useBidFilters() {
  return useTableFilters<BidAnalysisRow>({
    searchFields: ['bidCode', 'subject'],
    columns: {
      bidCode: { type: 'text', label: 'Mã RFQ / Bid' },
      subject: { type: 'text', label: 'Chủ đề' },
      'project.code': {
        type: 'select',
        label: 'Dự án',
        options: PROJECTS.map((p) => ({ value: p.code, label: p.code })),
      },
      status: {
        type: 'multiSelect',
        label: 'Trạng thái',
        options: STATUS_OPTIONS,
      },
      bidDate: { type: 'dateRange', label: 'Ngày RFQ / BID' },
    },
  });
}

export { STATUS_OPTIONS };
