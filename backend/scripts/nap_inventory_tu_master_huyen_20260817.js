/**
 * nap_inventory_tu_master_huyen_20260817.js
 * Nạp bảng Inventory (đang 0 dòng) từ danh mục vật tư chuẩn của anh Huyến.
 *
 * Nguồn : IBSHI/mua-hang/00.DATA/TỔNG HỢP THÔNG TIN MUA HÀNG IBSHI/
 *         mat_code_xref_FINAL.csv  (9.653 mã, đối chiếu ba chiều kho ↔ kế toán)
 *         → lọc 2.147 mã CÓ TỒN khác 0  → scripts/huyen_ton.json
 * Bổ sung: ngày nhập gần nhất lấy từ sổ nhập kho kế toán (scripts/ketoan_ngay_nhap.json),
 *          ghép theo mã vật tư — cùng hệ mã nên khớp thẳng, phủ 1.589/2.147 (74%).
 *
 * ⚠️ PHẠM VI: đây là tồn kho theo HỆ MÃ KẾ TOÁN (BAH.AOBH.001), KHÔNG phải hệ mã
 *    mua sắm (I95-VTC01-001). Hai hệ chưa có bảng bắc cầu, nên bảng Inventory này
 *    CHƯA nối được với PrDetail. Nạp để có số liệu tồn thật; việc nối là bước sau.
 *
 * Mặc định chạy thử; thêm --ghi để ghi thật.
 */
const prisma = require('../src/lib/prisma');
const ton = require('./huyen_ton.json');
const ngayNhap = require('./ketoan_ngay_nhap.json');

const GHI = process.argv.includes('--ghi');
const chu = (v) => { const s = String(v ?? '').trim(); return s === '' || s === 'None' ? null : s; };
const so = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };

async function main() {
  console.log(GHI ? '⚠  GHI THẬT\n' : '○  CHẠY THỬ — không ghi gì.\n');

  const dangCo = await prisma.inventory.count();
  console.log(`  Inventory hiện có: ${dangCo} dòng`);

  const dong = [];
  const loi = [];
  const daThay = new Set();
  ton.forEach((r, i) => {
    const ma = chu(r.mat_code);
    if (!ma) return loi.push({ i: i + 2, ly_do: 'thiếu mã vật tư' });
    if (daThay.has(ma)) return loi.push({ i: i + 2, ly_do: `mã "${ma}" lặp trong nguồn` });
    daThay.add(ma);
    const sl = so(r.sl_ton_total);
    if (sl < 0) return loi.push({ i: i + 2, ly_do: `mã "${ma}" tồn âm (${sl})` });
    const nn = ngayNhap[ma.toUpperCase()];
    dong.push({
      itemCode: ma,
      itemName: chu(r.name_kho) || chu(r.name_ketoan) || ma,
      uom: chu(r.unit) || chu(r.unit_ketoan) || 'cái',
      onHandQty: sl,
      allocatedQty: 0,          // chưa có dữ liệu cấp phát cứng
      availableQty: sl,         // = onHandQty vì allocatedQty = 0
      warehouseLocation: chu(r.kho_list),
      lastReceivedAt: nn ? new Date(`${nn}T00:00:00Z`) : null,
    });
  });

  const giaTri = ton.reduce((s, r) => s + so(r.gt_ton_vnd), 0);
  const soKho = new Set(dong.map((d) => d.warehouseLocation).filter(Boolean)).size;
  console.log(`\n── Sẽ nạp ──`);
  console.log(`  dòng tồn kho        : ${dong.length}`);
  console.log(`  có ngày nhập gần nhất: ${dong.filter((d) => d.lastReceivedAt).length}`);
  console.log(`  số ô kho khác nhau  : ${soKho}`);
  console.log(`  tổng giá trị tồn    : ${giaTri.toLocaleString('vi-VN')} đ`);
  if (loi.length) { console.log(`  BỎ QUA ${loi.length} dòng:`); loi.slice(0, 5).forEach((l) => console.log(`    dòng ${l.i}: ${l.ly_do}`)); }

  if (!GHI) { console.log('\n○ Chạy thử xong. Thêm --ghi để ghi thật.'); return prisma.$disconnect(); }

  if (dangCo > 0) {
    console.log(`\n  ⛔ Inventory đã có ${dangCo} dòng — DỪNG. Script này chỉ dành cho bảng rỗng;`);
    console.log('     nạp đè sẽ ghi lên số liệu người khác vừa tạo. Kiểm rồi chạy lại.');
    return prisma.$disconnect();
  }

  let n = 0;
  for (let i = 0; i < dong.length; i += 200) {
    const r = await prisma.inventory.createMany({ data: dong.slice(i, i + 200) });
    n += r.count;
  }
  const sau = await prisma.inventory.count();
  const tongSL = await prisma.inventory.aggregate({ _sum: { onHandQty: true } });
  console.log(`\n  đã nạp ${n} dòng · Inventory nay có ${sau} dòng`);
  console.log(`  tổng số lượng tồn: ${(tongSL._sum.onHandQty ?? 0).toLocaleString('vi-VN')}`);
  console.log(`\n  Gỡ lại: DELETE FROM "Inventory";   (bảng này trước đợt nạp là RỖNG)`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('LỖI:', e.message); await prisma.$disconnect(); process.exit(1); });
