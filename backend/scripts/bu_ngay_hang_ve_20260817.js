/**
 * bu_ngay_hang_ve_20260817.js
 * Bù NGÀY HÀNG VỀ cho các dòng hợp đồng đang trống, lấy từ SỔ NHẬP KHO của kế toán.
 *
 * Nguồn : IBSHI/mua-hang/00.DATA/KE-TOAN/CT NK theo NCCCT VT.xlsx
 *         (Bảng kê phiếu nhập kho, 17.244 dòng, 01/2022 → 12/2025)
 * Trích  : scripts/ketoan_nk.json
 * Khoá   : SỐ HỢP ĐỒNG (chuẩn hoá bỏ ký tự không phải chữ-số)
 *
 * ⚠️ ĐÂY LÀ SUY LUẬN Ở MỨC HỢP ĐỒNG, KHÔNG PHẢI NGÀY CỦA TỪNG DÒNG VẬT TƯ.
 *    Mã vật tư của kế toán (VTS.BTLL.01) và của mua sắm (I95-VTC01-001) là hai hệ
 *    khác nhau, khớp 5/8.702 — không nối được ở mức dòng. Nên với mỗi hợp đồng,
 *    lấy ngày nhập kho MUỘN NHẤT làm mốc "hàng về đủ", gán cho mọi dòng của hợp
 *    đồng đó. Mọi dòng được bù đều ghi dấu vết vào `notes`.
 *
 * CHỈ lấp ô trống. Mặc định chạy thử; thêm --ghi để ghi thật.
 */
const prisma = require('../src/lib/prisma');
const nk = require('./ketoan_nk.json');

const GHI = process.argv.includes('--ghi');
const DAU_VET = '[ngày hàng về suy từ sổ nhập kho kế toán — mức hợp đồng, 17/08/2026]';
const chu = (v) => { if (v == null) return null; const s = String(v).trim(); return s === '' || s === 'None' ? null : s; };
const gon = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function main() {
  console.log(GHI ? '⚠  GHI THẬT\n' : '○  CHẠY THỬ — không ghi gì.\n');

  // ── gom ngày nhập kho theo số hợp đồng ──
  const theoHD = new Map();
  for (const r of nk) {
    const hd = gon(r['Hợp đồng']);
    const ng = chu(r['Ngày ct']);
    if (!hd || !ng) continue;
    const d = new Date(ng.slice(0, 10) + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) continue;
    const cu = theoHD.get(hd);
    if (!cu) theoHD.set(hd, { som: d, muon: d, lan: 1 });
    else { if (d < cu.som) cu.som = d; if (d > cu.muon) cu.muon = d; cu.lan++; }
  }
  console.log(`  Sổ nhập kho: ${nk.length} dòng · ${theoHD.size} số hợp đồng có ngày nhập`);

  const db = await prisma.contractDetail.findMany({
    where: { contractNo: { not: null }, arrivedDate: null },
    select: { id: true, contractNo: true, vendorName: true, projectCode: true, notes: true },
  });
  console.log(`  Dòng hợp đồng đang TRỐNG ngày hàng về: ${db.length}`);

  const sua = [];
  for (const c of db) {
    const k = theoHD.get(gon(c.contractNo));
    if (k) sua.push({ id: c.id, ngay: k.muon, lan: k.lan, notes: c.notes, hd: c.contractNo, ncc: c.vendorName });
  }
  console.log(`  → bù được: ${sua.length} dòng`);
  const theoDA = new Map();
  for (const s of sua) { const c = db.find((x) => x.id === s.id); theoDA.set(c.projectCode ?? '(không rõ)', (theoDA.get(c.projectCode ?? '(không rõ)') ?? 0) + 1); }
  console.log(`  theo dự án: ${[...theoDA.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>`${k}:${v}`).join(' · ')}`);
  console.log('\n  5 ví dụ:');
  for (const s of sua.slice(0, 5))
    console.log(`    ${String(s.hd).slice(0,26).padEnd(26)} ${String(s.ncc).slice(0,18).padEnd(18)} → ${s.ngay.toISOString().slice(0,10)}  (${s.lan} lần nhập)`);

  if (!GHI) { console.log('\n○ Chạy thử xong. Thêm --ghi để ghi thật.'); return prisma.$disconnect(); }

  let n = 0;
  for (const s of sua) {
    await prisma.contractDetail.update({
      where: { id: s.id },
      data: { arrivedDate: s.ngay, notes: s.notes ? `${s.notes} ${DAU_VET}` : DAU_VET },
    });
    n++;
  }
  const sau = await prisma.contractDetail.count({ where: { arrivedDate: { not: null } } });
  console.log(`\n  đã bù ${n} dòng`);
  console.log(`  Toàn hệ thống có ngày hàng về: ${sau}`);
  console.log(`\n  Gỡ lại:`);
  console.log(`    UPDATE "ContractDetail" SET "arrivedDate"=NULL,`);
  console.log(`           notes = nullif(btrim(replace(notes, '${DAU_VET}', '')), '')`);
  console.log(`     WHERE notes LIKE '%suy từ sổ nhập kho kế toán%';`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('LỖI:', e.message); await prisma.$disconnect(); process.exit(1); });
