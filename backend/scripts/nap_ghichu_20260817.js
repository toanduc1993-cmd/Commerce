/**
 * nap_ghichu_20260817.js
 * Khôi phục cột ghi chú của "PrDetail" từ kho theo dõi Excel.
 *
 * Vì sao cần: trich_tatca.py không khai báo cột 'Remarks/ Ghi chú', nên đợt nạp
 * 17/08 bỏ qua nó lặng lẽ; riêng trình nạp MTO còn ghi đè bằng chuỗi cứng
 * 'Imported from <file>.xlsx'. Hệ quả: 4.591 dòng không có ghi chú nghiệp vụ.
 *
 * Đầu vào: scripts/trich_ghichu.json (do trich_ghichu_20260817.py sinh)
 *          scripts/plan_nap.json     (bảng ghép tên gói Excel ↔ mã dự án CSDL)
 *
 * Nguyên tắc:
 *   - CHỈ lấp ô trống. Ô đang có ghi chú THẬT thì không đụng.
 *     ('Imported from …' không tính là ghi chú thật — đó là rác của trình nạp.)
 *   - Mặc định CHẠY THỬ. Phải có --ghi mới ghi thật.
 *   - Chụp ảnh cột remarks trước khi ghi, chạy lại nhiều lần không hỏng.
 */
const prisma = require('../src/lib/prisma');
const trich = require('./trich_ghichu.json');
const plan  = require('./plan_nap.json');

const GHI = process.argv.includes('--ghi');
const RAC = /^Imported from /;

const chuan = (s) => String(s ?? '').trim().toUpperCase();

// plan_nap.json đánh dấu BỎ hai gói: 095 (đã nạp riêng bằng nap_095_… hôm 17/08)
// và 0102 (file theo dõi trùng dự án với 102). Đợt nạp ghi chú vẫn phải chạm 095 —
// trình nạp riêng của nó cũng không đọc cột ghi chú nên 095 đang thiếu y hệt.
// 0102 thì bỏ đúng, không thêm vào, tránh nạp hai lần lên cùng một dự án.
const THEM = [{ excel: '095', maCSDL: '25-VPI-I-095' }];

async function main() {
  console.log(GHI ? '⚠  GHI THẬT\n' : '○  CHẠY THỬ — không ghi gì. Thêm --ghi để ghi thật.\n');

  if (GHI) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "_backup_PrDetail_remarks_20260817"`);
    await prisma.$executeRawUnsafe(
      `CREATE TABLE "_backup_PrDetail_remarks_20260817" AS
       SELECT id, "prId", "itemCode", remarks, "updatedAt" FROM "PrDetail"`);
    const [{ count }] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS count FROM "_backup_PrDetail_remarks_20260817"`);
    console.log(`  ảnh chụp cột ghi chú: ${count} dòng\n`);
  }

  const tong = { lap: 0, deTrong: 0, khongKhop: 0, giuNguyen: 0, khongCoDuAn: 0 };
  const bang = [];

  for (const p of [...plan, ...THEM]) {
    if (p.bo) continue;
    const nguon = trich[p.excel];
    if (!nguon) continue;

    const ma = p.maCSDL || p.maMoi || p.excel;
    const duAn = await prisma.project.findFirst({ where: { code: ma }, select: { id: true, code: true } });
    if (!duAn) { tong.khongCoDuAn++; bang.push([p.excel, ma, 'KHÔNG có dự án', 0, 0, 0]); continue; }

    const rows = await prisma.prDetail.findMany({
      where: { pr: { projectId: duAn.id } },
      select: { id: true, itemCode: true, remarks: true },
    });

    let lap = 0, giu = 0, trong = 0, khongKhop = 0;
    const capNhat = [];
    for (const d of rows) {
      const gc = nguon.ghiChu[chuan(d.itemCode)];
      const dangCo = String(d.remarks ?? '').trim();
      const oTrong = dangCo === '' || RAC.test(dangCo);
      if (!oTrong) { giu++; continue; }          // đã có ghi chú thật → không đụng
      if (!gc) { if (dangCo === '') trong++; else khongKhop++; continue; }
      capNhat.push({ id: d.id, gc });
      lap++;
    }

    if (GHI && capNhat.length) {
      for (const c of capNhat) {
        await prisma.prDetail.update({ where: { id: c.id }, data: { remarks: c.gc } });
      }
    }

    tong.lap += lap; tong.giuNguyen += giu; tong.deTrong += trong; tong.khongKhop += khongKhop;
    if (lap || khongKhop) bang.push([p.excel, duAn.code, rows.length, lap, giu, trong + khongKhop]);
  }

  console.log('  gói Excel      mã CSDL        dòng   lấp   giữ  vẫn trống');
  console.log('  ' + '─'.repeat(62));
  for (const [e, m, n, l, g, t] of bang) {
    console.log(`  ${String(e).padEnd(14)} ${String(m).padEnd(14)} ${String(n).padStart(4)} ${String(l).padStart(5)} ${String(g).padStart(5)} ${String(t).padStart(9)}`);
  }
  console.log('  ' + '─'.repeat(62));
  console.log(`\n  LẤP: ${tong.lap}   ·   giữ nguyên ghi chú thật: ${tong.giuNguyen}   ·   nguồn không có chữ: ${tong.deTrong + tong.khongKhop}`);
  if (tong.khongCoDuAn) console.log(`  ${tong.khongCoDuAn} gói Excel không tìm thấy dự án trong CSDL`);

  const sau = await prisma.$queryRawUnsafe(
    `SELECT count(*) FILTER (WHERE remarks IS NULL)::int AS trong,
            count(*) FILTER (WHERE remarks LIKE 'Imported from %')::int AS rac,
            count(*) FILTER (WHERE remarks IS NOT NULL AND remarks NOT LIKE 'Imported from %')::int AS co
     FROM "PrDetail"`);
  console.log(`\n  Sau đợt này: trống=${sau[0].trong} · rác 'Imported from'=${sau[0].rac} · có ghi chú=${sau[0].co}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
