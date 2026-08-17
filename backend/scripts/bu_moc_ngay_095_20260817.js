/**
 * bu_moc_ngay_095_20260817.js
 * Bù các mốc ngày mà Excel của anh Đức CÓ nhưng dòng hợp đồng sẵn có trong
 * cơ sở dữ liệu đang để trống. Chạy sau nap_095_tu_excel_duc_20260817.js.
 *
 * CHỈ lấp ô trống — không đè. Mặc định chạy thử; thêm --ghi để ghi thật.
 */
const prisma = require('../src/lib/prisma');
const raw = require('./095_trich.json');

const GHI = process.argv.includes('--ghi');
const NHOM = new Set(['VTC01','VTC02','VTC03','VTC04','VPK','VDK']);
const chu = (v) => { if (v == null) return null; const s = String(v).trim(); return s === '' || s === 'None' ? null : s; };
const so  = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const ngay = (v) => { const s = chu(v); if (!s || /^\d+(\.\d+)?$/.test(s)) return null;
  const d = new Date(s.replace(' ', 'T') + 'Z'); return Number.isNaN(d.getTime()) ? null : d; };

const MOC_NK = [['arrivedDate','nkHangVe'],['importLCDate','nkLC'],['cifDate','nkCIF'],
  ['customsDate','nkHaiQuan'],['paymentDate','nkThanhToan'],['qcInvitationDate','nkMoiNT'],
  ['handoverToProductDate','nkBanGiaoSX'],['exportPort','nkCangXuat']];

async function main() {
  console.log(GHI ? '⚠  GHI THẬT\n' : '○  CHẠY THỬ — không ghi gì.\n');
  const p = await prisma.project.findFirst({ where: { code: '25-VPI-I-095' }, select: { id: true } });
  const d = raw.filter((r) => !NHOM.has(String(r.itemCode ?? '').trim()));

  const db = await prisma.contractDetail.findMany({
    where: { prDetail: { pr: { projectId: p.id } } },
    select: { id: true, contractNo: true, vendorName: true, contractWeight: true, arrivedDate: true,
      importLCDate: true, cifDate: true, customsDate: true, paymentDate: true,
      qcInvitationDate: true, handoverToProductDate: true, exportPort: true },
  });
  const idx = new Map();
  for (const c of db) idx.set([c.contractNo, c.vendorName, c.contractWeight].join('|'), c);

  const sua = new Map(); // id -> {truong: giá trị}
  const gom = (c, truong, gt) => {
    if (!c || !gt || c[truong]) return;
    if (!sua.has(c.id)) sua.set(c.id, {});
    sua.get(c.id)[truong] = gt;
  };
  for (const r of d) {
    const nk = idx.get([chu(r.nkSoHD), chu(r.nkNCC), so(r.nkWeight)].join('|'));
    for (const [f, k] of MOC_NK) gom(nk, f, f === 'exportPort' ? chu(r[k]) : ngay(r[k]));
    const dn = idx.get([chu(r.dnSoHD), chu(r.dnNCC), so(r.dnWeight)].join('|'));
    gom(dn, 'handoverToProductDate', ngay(r.dnBanGiaoSX));
  }

  const dem = {};
  for (const v of sua.values()) for (const k of Object.keys(v)) dem[k] = (dem[k] ?? 0) + 1;
  console.log(`── Sẽ bù ${sua.size} dòng hợp đồng ──`);
  for (const [k, v] of Object.entries(dem)) console.log(`  ${k.padEnd(24)} ${v}`);

  if (!GHI) { console.log('\n○ Chạy thử xong. Thêm --ghi để ghi thật.'); return prisma.$disconnect(); }

  let n = 0;
  for (const [id, data] of sua) { await prisma.contractDetail.update({ where: { id }, data }); n++; }
  console.log(`\n  đã cập nhật ${n} dòng`);
  console.log(`\n  Không có câu gỡ tự động — đây là cập nhật ô TRỐNG trên dòng có sẵn.`);
  console.log(`  Muốn lùi thì khôi phục từ bản sao lưu backups/*.sql.gz cùng ngày.`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('LỖI:', e.message); await prisma.$disconnect(); process.exit(1); });
