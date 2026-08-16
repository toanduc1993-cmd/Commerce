// ============================================================
// So sánh báo giá giữa các NCC cho CÙNG một mục vật tư.
//
// Dùng chung cho cả tab "So sánh" và tab "Duyệt" của /duyet — trước 13/08/2026 hai tab
// tự ghép theo hai khoá khác nhau (vendorOrder vs vendorName) nên cùng một mục có thể
// hiện hai con số khác nhau. Nay chỉ còn MỘT bộ hàm ở đây.
// Báo cáo gốc: docs/RA-SOAT-LOGIC-SO-SANH-DUYET-BAO-GIA-20260813.md
// ============================================================

import type { BidItemRow, BidOfferRow, BidVendorRow } from './api';

/** Báo giá của đúng NCC này cho đúng mục này. Ghép bằng vendorId — khoá thật, luôn duy nhất. */
export function offerOf(item: BidItemRow, vendorId: string): BidOfferRow | null {
  return item.offers?.find((o) => o.vendorId === vendorId) ?? null;
}

/** Loại tiền của một NCC (mặc định VND). */
export function currencyOf(vendor: BidVendorRow | undefined | null): string {
  return vendor?.currency || 'VND';
}

/** Gói có trộn nhiều loại tiền không — nếu có thì KHÔNG được so số thô giữa các cột. */
export function hasMixedCurrency(vendors: BidVendorRow[]): boolean {
  return new Set(vendors.map((v) => currencyOf(v))).size > 1;
}

/**
 * Đơn giá thấp nhất của một mục, tính RIÊNG cho từng loại tiền.
 * Bỏ qua đơn giá 0 (NCC không chào mục đó — thường scope='X').
 */
export function minPriceByCurrency(
  item: BidItemRow,
  vendors: BidVendorRow[]
): Map<string, number> {
  const viTri = new Map(vendors.map((v) => [v.id, currencyOf(v)]));
  const min = new Map<string, number>();
  for (const o of item.offers || []) {
    if (!(o.unitPrice > 0)) continue;
    const cur = viTri.get(o.vendorId) || 'VND';
    const hienTai = min.get(cur);
    if (hienTai === undefined || o.unitPrice < hienTai) min.set(cur, o.unitPrice);
  }
  return min;
}

/** Báo giá này có phải rẻ nhất TRONG CÙNG loại tiền không. */
export function isCheapest(
  item: BidItemRow,
  vendor: BidVendorRow,
  vendors: BidVendorRow[]
): boolean {
  const offer = offerOf(item, vendor.id);
  if (!offer || !(offer.unitPrice > 0)) return false;
  return minPriceByCurrency(item, vendors).get(currencyOf(vendor)) === offer.unitPrice;
}

/**
 * Đắt hơn NCC rẻ nhất bao nhiêu (cùng loại tiền).
 * null = không so được (không có giá, hoặc chính nó là rẻ nhất).
 */
export function deltaVsMin(
  item: BidItemRow,
  vendor: BidVendorRow,
  vendors: BidVendorRow[]
): { amount: number; pct: number } | null {
  const offer = offerOf(item, vendor.id);
  if (!offer || !(offer.unitPrice > 0)) return null;
  const min = minPriceByCurrency(item, vendors).get(currencyOf(vendor));
  if (min === undefined || min <= 0 || offer.unitPrice === min) return null;
  return {
    amount: offer.unitPrice - min,
    pct: ((offer.unitPrice - min) / min) * 100,
  };
}

/** Số NCC thực sự có chào giá (đơn giá > 0) cho mục này. */
export function countQuotes(item: BidItemRow): number {
  return (item.offers || []).filter((o) => o.unitPrice > 0).length;
}

/** Mục có ít nhất 1 báo giá dùng được — dùng cho bộ lọc ẩn dòng rỗng. */
export function hasAnyQuote(item: BidItemRow): boolean {
  return countQuotes(item) > 0;
}

/** Gom các dòng theo mã nhóm vật tư (backend gắn sẵn `groupCode`). */
export function groupItems(
  items: BidItemRow[]
): Array<{ groupCode: string; groupLabel: string; items: BidItemRow[] }> {
  const map = new Map<string, { groupCode: string; groupLabel: string; items: BidItemRow[] }>();
  for (const it of items) {
    const code = it.groupCode || 'KHAC';
    if (!map.has(code)) {
      map.set(code, { groupCode: code, groupLabel: it.groupLabel || code, items: [] });
    }
    map.get(code)!.items.push(it);
  }
  return [...map.values()].sort((a, b) => a.groupCode.localeCompare(b.groupCode));
}

/** Tổng tiền một NCC sẽ nhận nếu duyệt theo lựa chọn hiện tại. */
export function totalForVendor(items: BidItemRow[], vendorName: string): number {
  let t = 0;
  for (const it of items) {
    if (it.selectedVendorName !== vendorName) continue;
    const offer = (it.offers || []).find((o) => o.vendor?.vendorName === vendorName);
    if (offer) t += offer.totalPrice > 0 ? offer.totalPrice : offer.unitPrice * (it.qtyToBuy || 0);
  }
  return t;
}
