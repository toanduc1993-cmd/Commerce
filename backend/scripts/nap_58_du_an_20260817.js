/**
 * nap_58_du_an_20260817.js
 * Nạp 57 dự án còn lại từ kho theo dõi Excel của anh Đức.
 * (59 dự án trong kho − 095 đã nạp − 0102 trùng dự án với 102)
 *
 * Đầu vào: scripts/trich_tatca.json (do trich_tatca.py sinh, dò cột theo TÊN tiêu đề)
 *          scripts/plan_nap.json    (bảng ghép mã dự án Excel ↔ mã trong CSDL)
 *
 * Cùng nguyên tắc đã dùng cho 095:
 *   - CHỈ lấp ô trống, không đè giá trị đang có
 *   - Mặc định CHẠY THỬ; phải có --ghi mới ghi thật
 *   - Mọi dòng hợp đồng mang dataSource='EXCEL_TRACKING' để gỡ lại được sạch
 *   - Ngày đọc theo UTC (gắn 'Z'), nếu không sẽ lệch sớm 1 ngày
 */
const prisma = require('../src/lib/prisma');
const trich = require('./trich_tatca.json');
const plan  = require('./plan_nap.json');

const GHI = process.argv.includes('--ghi');
const NGUON = 'EXCEL_TRACKING';

const chu = (v) => { if (v == null) return null; const s = String(v).trim(); return s === '' || s === 'None' ? null : s; };
const so  = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const ngay = (v) => { const s = chu(v); if (!s || /^\d+(\.\d+)?$/.test(s)) return null;
  const d = new Date(s.replace(' ', 'T') + 'Z'); return Number.isNaN(d.getTime()) ? null : d; };
const soHD = (v) => { const s = chu(v); return s && !/^\d+(\.\d+)?$/.test(s) ? s : null; };

async function main() {
  console.log(GHI ? '⚠  GHI THẬT\n' : '○  CHẠY THỬ — không ghi gì. Thêm --ghi để ghi thật.\n');
  const tong = { duAnMoi: 0, prDetail: 0, hopDong: 0, boQuaTrung: 0, ngayVe: 0, loi: [] };
  const bang = [];

  for (const p of plan) {
    if (p.bo) { bang.push([p.excel, '—', 'BỎ: ' + p.bo, 0, 0]); continue; }
    const nguon = trich[p.excel];
    if (!nguon) { tong.loi.push(`${p.excel}: không có dữ liệu trích`); continue; }
    const rows = nguon.rows;

    // ── dự án ──
    let duAn = p.maCSDL ? await prisma.project.findFirst({ where: { code: p.maCSDL }, select: { id: true, code: true } }) : null;
    let taoMoi = false;
    if (!duAn) {
      const ma = (p.maMoi || p.excel).trim();
      duAn = await prisma.project.findFirst({ where: { code: ma }, select: { id: true, code: true } });
      if (!duAn) {
        taoMoi = true;
        if (GHI) duAn = await prisma.project.create({ data: { code: ma, name: `${ma} (nhập từ file theo dõi ${p.ngay})` }, select: { id: true, code: true } });
        else duAn = { id: null, code: ma };
      }
    }

    // ── hiện trạng ──
    const dbCT = duAn.id ? await prisma.prDetail.findMany({
      where: { pr: { projectId: duAn.id } }, select: { id: true, itemCode: true },
    }) : [];
    const idTheoMa = new Map();
    for (const d of dbCT) { const k = d.itemCode.trim().toUpperCase(); if (!idTheoMa.has(k)) idTheoMa.set(k, d.id); }

    const dbHD = duAn.id ? await prisma.contractDetail.findMany({
      where: { prDetail: { pr: { projectId: duAn.id } } },
      select: { prDetailId: true, contractNo: true, vendorName: true, contractWeight: true },
    }) : [];
    const daCo = new Set(dbHD.map((c) => [c.prDetailId, c.contractNo, c.vendorName, c.contractWeight].join('|')));

    // ── gom theo mã vật tư ──
    const theoMa = new Map();
    for (const r of rows) {
      const ma = String(r.itemCode ?? '').trim().toUpperCase();
      if (!ma) continue;
      if (!theoMa.has(ma)) theoMa.set(ma, []);
      theoMa.get(ma).push(r);
    }
    const coSL = (r) => so(r.netQty) || so(r.ordQty) || so(r.toBuyQty);
    const maMoi = [...theoMa.keys()].filter((m) => !idTheoMa.has(m));

    let nCT = 0, nHD = 0, nBo = 0, nVe = 0;
    if (GHI && maMoi.length) {
      const pr = await prisma.purchaseRequisition.create({
        data: { projectId: duAn.id, prRef: `${duAn.code}-TD-${p.ngay}`, docNo: `${duAn.code}-TD`,
                revNo: null, department: 'THƯƠNG MẠI', status: 'SOURCING' },
      });
      const them = maMoi.map((ma) => {
        const rs = theoMa.get(ma); const g = rs.find(coSL) || rs[0];
        return { prId: pr.id, itemCode: chu(g.itemCode), itemName: chu(g.itemName) || chu(g.itemCode),
          profile: chu(g.profile), grade: chu(g.grade), uom: chu(g.uom) || 'kg',
          unitWeight: so(g.unitWeight), netQty: so(g.netQty), netWeight: so(g.netWeight),
          reqQty: so(g.ordQty) || so(g.netQty), reqWeight: so(g.ordWeight) || so(g.netWeight),
          remainQty: so(g.remainQty), remainWeight: so(g.remainWeight),
          toBuyQty: so(g.toBuyQty), toBuyWeight: so(g.toBuyWeight),
          requiredDate: ngay(g.ngayBanGiao), statusFlag: 'Chờ báo giá' };
      });
      for (let i = 0; i < them.length; i += 50) {
        const r = await prisma.prDetail.createMany({ data: them.slice(i, i + 50) });
        nCT += r.count;
      }
      const sau = await prisma.prDetail.findMany({ where: { prId: pr.id }, select: { id: true, itemCode: true } });
      for (const d of sau) { const k = d.itemCode.trim().toUpperCase(); if (!idTheoMa.has(k)) idTheoMa.set(k, d.id); }
    } else {
      nCT = maMoi.length;
    }

    // ── hợp đồng ──
    for (const [ma, rs] of theoMa) {
      // Ở chế độ chạy thử chưa có PrDetail thật nên chưa có id. Dùng chính mã vật tư
      // làm khoá thay thế, nếu không mọi mã mới đều mang id rỗng và đụng nhau,
      // khiến bản xem trước báo trùng nhiều hơn thực tế.
      const prDetailId = idTheoMa.get(ma) ?? (GHI ? null : `THU:${ma}`);
      for (const r of rs) {
        for (const loai of ['DOMESTIC', 'IMPORT']) {
          const tn = loai === 'DOMESTIC';
          const hd = soHD(tn ? r.dnSoHD : r.nkSoHD);
          if (!hd) continue;
          const ncc = chu(tn ? r.dnNCC : r.nkNCC);
          const kl = so(tn ? r.dnWeight : r.nkWeight);
          const khoa = [prDetailId, hd, ncc, kl].join('|');
          if (daCo.has(khoa)) { nBo++; continue; }
          daCo.add(khoa);
          const du = tn
            ? { contractType: 'DOMESTIC', contractNo: hd, vendorName: ncc, actualProfile: chu(r.dnProfile),
                actualGrade: chu(r.dnGrade), contractWeight: kl, contractDate: ngay(r.dnNgayKy),
                deliveredQty: so(r.dnGiaoQty), deliveredWeight: so(r.dnGiaoWeight),
                unitPriceNoVAT: so(r.dnDonGia), totalNoVAT: so(r.dnTongChuaVAT), totalWithVAT: so(r.dnTongVAT),
                currency: 'VND', handoverToProductDate: ngay(r.dnBanGiaoSX) }
            : { contractType: 'IMPORT', contractNo: hd, vendorName: ncc, actualProfile: chu(r.nkProfile),
                actualGrade: chu(r.nkGrade), contractWeight: kl, contractDate: ngay(r.nkNgayKy),
                deliveredQty: so(r.nkGiaoQty), deliveredWeight: so(r.nkGiaoWeight),
                unitPriceNoVAT: so(r.nkDonGia), totalNoVAT: so(r.nkThanhTien), totalWithVAT: 0,
                currency: 'USD', importLCDate: ngay(r.nkLC), exportPort: chu(r.nkCangXuat),
                cifDate: ngay(r.nkCIF), paymentDate: ngay(r.nkThanhToan), customsDate: ngay(r.nkHaiQuan),
                arrivedDate: ngay(r.nkHangVe), qcInvitationDate: ngay(r.nkMoiNT),
                handoverToProductDate: ngay(r.nkBanGiaoSX) };
          if (du.arrivedDate) nVe++;
          if (GHI) await prisma.contractDetail.create({
            data: { ...du, prDetailId: String(prDetailId).startsWith('THU:') ? null : prDetailId,
                    dataSource: NGUON, projectCode: duAn.code, status: 'PENDING' } });
          nHD++;
        }
      }
    }

    tong.duAnMoi += taoMoi ? 1 : 0; tong.prDetail += nCT; tong.hopDong += nHD;
    tong.boQuaTrung += nBo; tong.ngayVe += nVe;
    bang.push([p.excel, duAn.code + (taoMoi ? ' (mới)' : ''), `${rows.length} dòng Excel`, nCT, nHD]);
  }

  console.log(`  ${'Excel'.padEnd(11)} ${'mã CSDL'.padEnd(20)} ${'nguồn'.padEnd(16)} ${'+vật tư'.padStart(8)} ${'+hợp đồng'.padStart(10)}`);
  for (const b of bang) console.log(`  ${String(b[0]).padEnd(11)} ${String(b[1]).padEnd(20)} ${String(b[2]).padEnd(16)} ${String(b[3]).padStart(8)} ${String(b[4]).padStart(10)}`);
  console.log(`\n── TỔNG ──`);
  console.log(`  dự án tạo mới      : ${tong.duAnMoi}`);
  console.log(`  thêm PrDetail      : ${tong.prDetail}`);
  console.log(`  thêm ContractDetail: ${tong.hopDong}  (bỏ qua ${tong.boQuaTrung} dòng trùng)`);
  console.log(`  trong đó có ngày hàng về: ${tong.ngayVe}`);
  if (tong.loi.length) console.log(`  LỖI: ${tong.loi.join(' · ')}`);
  if (!GHI) console.log('\n○ Chạy thử xong — chưa ghi gì.');
  else console.log(`\n  Gỡ lại: DELETE FROM "ContractDetail" WHERE "dataSource"='${NGUON}';  rồi xoá các PurchaseRequisition có docNo kết thúc '-TD'.`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('LỖI:', e); await prisma.$disconnect(); process.exit(1); });
