/**
 * nap_so_ma_ncc_20260818.js — nạp SO-MA-NCC.tsv (310) vào "Vendor" (189).
 *
 * Nguồn: IBSHI/mua-hang/04.DATA-CHUAN-SCMS/SO-MA-NCC.tsv
 *        (đã xác minh SHA-256 + kích thước byte với tracklog phòng TM)
 *
 * LOẠI RA khỏi đợt nạp (lệnh anh Hưng 18/08: "phần nào thiếu thông tin em loại ra"):
 *   - dòng không có tên (VTH.XXX.023 — cả ten_goi lẫn ten_phap_ly_chuan đều rỗng)
 *   - dòng có ten_phap_ly_chuan TRÙNG dòng trước trong chính sổ (Vendor.name là UNIQUE)
 *
 * KHÔNG ĐÈ dữ liệu thật đang có. Cụ thể KHÔNG đụng taxCode/address/name của dòng đã tồn tại:
 *   - taxCode: sổ ghi Hùng Nguyên 0200731945, CSDL đang 0200731944 — lệch ĐÚNG 1 chữ số cuối,
 *     chưa biết bên nào đúng, mà đây là NCC lớn nhất (1.477 dòng hợp đồng).
 *   - address: 38 ca sổ ghi đè bằng bản sai chính tả hoặc địa chỉ nơi khác hẳn.
 * Chỉ LẤP Ô TRỐNG và ghi 3 trường sổ là nguồn chuẩn: code · accountingCode · groupCode.
 *
 * Mặc định CHẠY THỬ. Phải có --ghi mới ghi thật.
 */
const fs = require('fs');
const prisma = require('../src/lib/prisma');

const GHI = process.argv.includes('--ghi');
const NGUON = '/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/IBSHI/mua-hang/04.DATA-CHUAN-SCMS/SO-MA-NCC.tsv';

const chu = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };
// Chuẩn hoá tên để so khớp: bỏ dấu, bỏ loại hình doanh nghiệp, gom khoảng trắng.
const chuan = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
  .toUpperCase()
  .replace(/C[ÔO]NG TY|CTY|TNHH|CO\.?,? ?LTD|LIMITED|JSC|MTV|MOT THANH VIEN|CO PHAN|CP\b|THUONG MAI|DAU TU|SAN XUAT|VA\b|&/g, ' ')
  .replace(/[^A-Z0-9]/g, '');
// MST 13 số là mã chi nhánh — so khớp bằng 10 số đầu.
const mst10 = (s) => { const d = String(s ?? '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(0, 10) : null; };

async function main() {
  console.log(GHI ? '⚠  GHI THẬT\n' : '○  CHẠY THỬ — không ghi gì. Thêm --ghi để ghi thật.\n');

  const dong = fs.readFileSync(NGUON, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const cot = dong[0].split('\t');
  const so = dong.slice(1).map((l) => { const p = l.split('\t'); return Object.fromEntries(cot.map((c, i) => [c, p[i]])); });

  // ── loại dòng thiếu thông tin ──
  const loai = [];
  const daThayTen = new Set();
  const sach = [];
  for (const r of so) {
    const ten = chu(r.ten_phap_ly_chuan) || chu(r.ten_goi);
    if (!ten) { loai.push([r.ma, 'không có tên']); continue; }
    const k = chuan(ten);
    if (daThayTen.has(k)) { loai.push([r.ma, `tên trùng trong sổ: ${ten}`]); continue; }
    daThayTen.add(k);
    sach.push({ ...r, _ten: ten });
  }

  // ── hiện trạng CSDL ──
  const db = await prisma.vendor.findMany({
    select: { id: true, code: true, name: true, shortName: true, taxCode: true, address: true,
              accountingCode: true, groupCode: true, categories: true },
  });
  const theoMst = new Map(), theoTen = new Map();
  for (const v of db) {
    const m = mst10(v.taxCode); if (m && !theoMst.has(m)) theoMst.set(m, v);
    const t = chuan(v.name);   if (t && !theoTen.has(t)) theoTen.set(t, v);
  }

  const daDung = new Set();          // 1 dòng CSDL chỉ được nhận 1 mã sổ
  const capNhat = [], themMoi = [], vaCham = [];
  for (const r of sach) {
    const m = mst10(r.mst);
    let v = (m && theoMst.get(m)) || theoTen.get(chuan(r._ten)) || null;
    // Va chạm = một dòng CSDL bị nhiều mã sổ cùng nhận. LOẠI dòng sau, KHÔNG đẩy sang thêm mới:
    // thêm mới sẽ đẻ ra bản gần trùng (vd sổ "THỊNH PHÁT" bên cạnh CSDL "Thịnh Phát") — Postgres
    // phân biệt hoa thường nên unique index không chặn, và người dùng sẽ thấy hai NCC y hệt nhau.
    if (v && daDung.has(v.id)) { vaCham.push([r.ma, r._ten, v.name]); continue; }
    if (v) { daDung.add(v.id); capNhat.push([r, v]); } else { themMoi.push(r); }
  }

  console.log(`  sổ ${so.length} dòng → dùng được ${sach.length} · loại ${loai.length}`);
  for (const [ma, ly] of loai) console.log(`     ✗ ${ma}  —  ${ly}`);
  if (vaCham.length) {
    console.log(`\n  ${vaCham.length} va chạm (một dòng CSDL bị nhiều mã sổ cùng nhận → LOẠI dòng sau, chờ phòng TM tách):`);
    for (const [ma, ten, dbTen] of vaCham) console.log(`     ! ${ma}  ${ten}  ↔  CSDL "${dbTen}"`);
  }
  console.log(`\n  cập nhật ${capNhat.length} dòng CSDL đã có · thêm mới ${themMoi.length} dòng`);

  if (!GHI) {
    const vd = capNhat.slice(0, 3).map(([r, v]) => `${r.ma} → "${v.name}"`).join('  ·  ');
    console.log(`  ví dụ cập nhật: ${vd}`);
    console.log(`  ví dụ thêm mới: ${themMoi.slice(0, 3).map((r) => `${r.ma} ${r._ten}`).join('  ·  ')}`);
  } else {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "_backup_Vendor_soma_20260818"`);
    await prisma.$executeRawUnsafe(`CREATE TABLE "_backup_Vendor_soma_20260818" AS SELECT * FROM "Vendor"`);

    for (const [r, v] of capNhat) {
      await prisma.vendor.update({
        where: { id: v.id },
        data: {
          code: r.ma,                                   // sổ là nguồn chuẩn
          accountingCode: chu(r.ma_ke_toan),            // sổ là nguồn chuẩn
          groupCode: chu(r.nhom),                       // sổ là nguồn chuẩn
          shortName: v.shortName ?? chu(r.ten_goi),     // chỉ lấp ô trống
          taxCode:   v.taxCode   ?? chu(r.mst),         // KHÔNG đè MST thật
          address:   v.address   ?? chu(r.dia_chi),     // KHÔNG đè địa chỉ thật
        },
      });
    }
    for (let i = 0; i < themMoi.length; i += 50) {
      await prisma.vendor.createMany({
        data: themMoi.slice(i, i + 50).map((r) => ({
          code: r.ma, name: r._ten, shortName: chu(r.ten_goi), taxCode: chu(r.mst),
          address: chu(r.dia_chi), accountingCode: chu(r.ma_ke_toan), groupCode: chu(r.nhom),
          vendorType: chu(r.mst) ? 'DOMESTIC' : 'IMPORT',
          status: 'ACTIVE', updatedAt: new Date(),   // updatedAt NOT NULL, không có default
        })),
        skipDuplicates: true,
      });
    }
  }

  const sau = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int t, count(code)::int c, count("accountingCode")::int a,
            count("groupCode")::int g, count("taxCode")::int m FROM "Vendor"`);
  const s = sau[0];
  console.log(`\n  Vendor: ${s.t} dòng · có code ${s.c} · mã kế toán ${s.a} · nhóm ${s.g} · MST ${s.m}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
