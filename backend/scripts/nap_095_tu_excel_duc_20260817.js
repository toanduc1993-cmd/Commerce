/**
 * nap_095_tu_excel_duc_20260817.js
 * Nạp dự án 25-VPI-I-095 từ file theo dõi Excel của anh Đức.
 *
 * Nguồn : IBSHI/mua-hang/00.DATA/10 TH-MUA SẮM CÁC GÓI/Cập nhật 07-08-2026/
 *         2026 08 07 Theo dõi dự án 095_Rev D1.xlsx — sheet 25-VPI-I-095
 * Trích  : scratchpad/trich_095.py → 095_trich.json (dò cột theo TÊN tiêu đề)
 *
 * MÔ HÌNH (đã kiểm trên dữ liệu thật):
 *   1.015 dòng sheet = 6 dòng tiêu đề nhóm + 1.009 dòng dữ liệu
 *   1.009 dòng dữ liệu = 556 mã vật tư; mỗi mã có 1 dòng "gốc" mang số lượng,
 *   các dòng sau là những lần ký hợp đồng khác nhau cho cùng mã đó.
 *   → 556 PrDetail + 945 ContractDetail
 *
 * NGUYÊN TẮC:
 *   - CHỈ lấp ô trống. Không đè giá trị đang có. 10 chỗ hai bên lệch nhau
 *     (4 quy cách, 6 mác) để nguyên, chờ anh Hưng và anh Đức quyết.
 *   - Mặc định CHẠY THỬ, không ghi. Muốn ghi thật phải thêm cờ --ghi
 *   - Mọi dòng ghi vào ContractDetail đều mang dataSource='EXCEL_TRACKING'
 *     nên gỡ lại được sạch bằng đúng một câu lệnh.
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../src/lib/prisma');

const GHI = process.argv.includes('--ghi');
const MA_DA = '25-VPI-I-095';
const NHOM = new Set(['VTC01', 'VTC02', 'VTC03', 'VTC04', 'VPK', 'VDK']); // dòng tiêu đề nhóm
const NGUON = 'EXCEL_TRACKING';
const FILE_TRICH = process.env.FILE_TRICH || path.join(__dirname, '095_trich.json');

const chu = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === 'None' ? null : s;
};
const so = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
/**
 * Ô ngày trong file là chuỗi 'YYYY-MM-DD HH:MM:SS'. Số nguyên = ô tổng cộng, bỏ.
 * PHẢI gắn 'Z' để đọc theo giờ UTC. Không gắn thì Node hiểu là giờ địa phương
 * (UTC+7), lưu xuống thành 17:00 hôm trước — MỌI mốc ngày lệch sớm 1 ngày.
 */
const ngay = (v) => {
  const s = chu(v);
  if (!s || /^\d+(\.\d+)?$/.test(s)) return null;
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
};

async function main() {
  console.log(GHI ? '⚠  CHẾ ĐỘ GHI THẬT\n' : '○  CHẠY THỬ — không ghi gì. Thêm --ghi để ghi thật.\n');

  const duAn = await prisma.project.findFirst({ where: { code: MA_DA }, select: { id: true, code: true } });
  if (!duAn) throw new Error(`Không tìm thấy dự án ${MA_DA}`);

  const raw = JSON.parse(fs.readFileSync(FILE_TRICH, 'utf8'));
  const dong = raw.filter((r) => !NHOM.has(String(r.itemCode ?? '').trim()));
  if (dong.length !== 1009) throw new Error(`Mong đợi 1.009 dòng dữ liệu, đọc được ${dong.length}`);

  // ── gom theo mã vật tư; dòng "gốc" là dòng có số lượng ──────────────────
  const theoMa = new Map();
  for (const r of dong) {
    const ma = String(r.itemCode).trim().toUpperCase();
    if (!theoMa.has(ma)) theoMa.set(ma, []);
    theoMa.get(ma).push(r);
  }
  const coSL = (r) => so(r.netQty) || so(r.ordQty) || so(r.toBuyQty);
  const nhieuGoc = [...theoMa].filter(([, rs]) => rs.filter(coSL).length > 1).map(([m]) => m);

  // ── hiện trạng cơ sở dữ liệu ─────────────────────────────────────────────
  const dbCT = await prisma.prDetail.findMany({
    where: { pr: { projectId: duAn.id } },
    select: { id: true, itemCode: true, requiredDate: true, unitWeight: true, netQty: true },
  });
  const dbTheoMa = new Map();
  for (const d of dbCT) {
    const k = d.itemCode.trim().toUpperCase();
    if (!dbTheoMa.has(k)) dbTheoMa.set(k, d);
  }
  const soHDTruoc = await prisma.contractDetail.count({
    where: { prDetail: { pr: { projectId: duAn.id } } },
  });

  const maMoi = [...theoMa.keys()].filter((m) => !dbTheoMa.has(m));
  const maTrung = [...theoMa.keys()].filter((m) => dbTheoMa.has(m));

  console.log('── Hiện trạng ──');
  console.log(`  Excel : ${dong.length} dòng · ${theoMa.size} mã`);
  console.log(`  CSDL  : ${dbCT.length} dòng · ${dbTheoMa.size} mã · ${soHDTruoc} dòng hợp đồng`);
  console.log(`  mã trùng ${maTrung.length} · mã mới ${maMoi.length}`);
  if (nhieuGoc.length) console.log(`  ⚠ ${nhieuGoc.length} mã có nhiều dòng gốc, lấy dòng đầu: ${nhieuGoc.join(', ')}`);

  // ── việc sẽ làm ──────────────────────────────────────────────────────────
  const themCT = [];
  for (const ma of maMoi) {
    const rs = theoMa.get(ma);
    const g = rs.find(coSL) || rs[0];
    themCT.push({
      ma,
      itemCode: chu(g.itemCode),
      itemName: chu(g.itemName) || chu(g.itemCode),
      profile: chu(g.profile),
      grade: chu(g.grade),
      uom: chu(g.uom) || 'kg',
      unitWeight: so(g.unitWeight),
      netQty: so(g.netQty),
      netWeight: so(g.netWeight),
      reqQty: so(g.ordQty) || so(g.netQty),
      reqWeight: so(g.ordWeight) || so(g.netWeight),
      remainQty: so(g.remainQty),
      remainWeight: so(g.remainWeight),
      toBuyQty: so(g.toBuyQty),
      toBuyWeight: so(g.toBuyWeight),
      requiredDate: ngay(g.ngayBanGiao),
    });
  }

  // lấp ngày cần vật tư cho mã đã có mà CSDL đang trống
  const lapNgay = [];
  for (const ma of maTrung) {
    const d = dbTheoMa.get(ma);
    if (d.requiredDate) continue;
    const g = theoMa.get(ma).find((r) => ngay(r.ngayBanGiao));
    if (g) lapNgay.push({ id: d.id, ma, ngay: ngay(g.ngayBanGiao) });
  }

  // dòng hợp đồng
  const hd = [];
  for (const [ma, rs] of theoMa) {
    for (const r of rs) {
      const trong = chu(r.dnSoHD);
      const ngoai = chu(r.nkSoHD);
      if (trong && !/^\d+(\.\d+)?$/.test(trong)) {
        hd.push({ ma, contractType: 'DOMESTIC', contractNo: trong, vendorName: chu(r.dnNCC),
          actualProfile: chu(r.dnProfile), actualGrade: chu(r.dnGrade),
          contractWeight: so(r.dnWeight), contractDate: ngay(r.dnNgayKy),
          deliveredQty: so(r.dnGiaoQty), deliveredWeight: so(r.dnGiaoWeight),
          unitPriceNoVAT: so(r.dnDonGia), totalNoVAT: so(r.dnTongChuaVAT), totalWithVAT: so(r.dnTongVAT),
          currency: 'VND', handoverToProductDate: ngay(r.dnBanGiaoSX), arrivedDate: null });
      }
      if (ngoai && !/^\d+(\.\d+)?$/.test(ngoai)) {
        hd.push({ ma, contractType: 'IMPORT', contractNo: ngoai, vendorName: chu(r.nkNCC),
          actualProfile: chu(r.nkProfile), actualGrade: chu(r.nkGrade),
          contractWeight: so(r.nkWeight), contractDate: ngay(r.nkNgayKy),
          deliveredQty: so(r.nkGiaoQty), deliveredWeight: so(r.nkGiaoWeight),
          unitPriceNoVAT: so(r.nkDonGia), totalNoVAT: so(r.nkThanhTien), totalWithVAT: 0,
          currency: 'USD', importLCDate: ngay(r.nkLC), exportPort: chu(r.nkCangXuat),
          cifDate: ngay(r.nkCIF), paymentDate: ngay(r.nkThanhToan), customsDate: ngay(r.nkHaiQuan),
          arrivedDate: ngay(r.nkHangVe), qcInvitationDate: ngay(r.nkMoiNT),
          handoverToProductDate: ngay(r.nkBanGiaoSX) });
      }
    }
  }

  console.log('\n── Sẽ làm ──');
  console.log(`  thêm PrDetail            : ${themCT.length}`);
  console.log(`  lấp ngày cần vật tư      : ${lapNgay.length}`);
  console.log(`  thêm ContractDetail      : ${hd.length}  (trong nước ${hd.filter(h=>h.contractType==='DOMESTIC').length} · nhập khẩu ${hd.filter(h=>h.contractType==='IMPORT').length})`);
  console.log(`  trong đó có ngày hàng về : ${hd.filter(h=>h.arrivedDate).length}`);
  console.log('  KHÔNG đè: quy cách, mác, đơn trọng, số lượng của mã đã có');

  if (!GHI) {
    console.log('\n○ Chạy thử xong — chưa ghi gì. Chạy lại với --ghi để ghi thật.');
    return prisma.$disconnect();
  }

  // ── GHI ──────────────────────────────────────────────────────────────────
  const pr = await prisma.purchaseRequisition.create({
    data: {
      projectId: duAn.id,
      prRef: `I95-TD-20260807`,
      docNo: 'I95-TD',
      revNo: null,
      department: 'THƯƠNG MẠI',
      status: 'SOURCING',
    },
  });
  console.log(`\n  đã tạo phiếu ${pr.prRef}`);

  let nCT = 0;
  for (let i = 0; i < themCT.length; i += 50) {
    const lo = themCT.slice(i, i + 50).map(({ ma, ...d }) => ({ ...d, prId: pr.id, statusFlag: 'Chờ báo giá' }));
    const r = await prisma.prDetail.createMany({ data: lo });
    nCT += r.count;
  }
  console.log(`  đã thêm ${nCT} dòng PrDetail`);

  let nNgay = 0;
  for (const x of lapNgay) {
    await prisma.prDetail.update({ where: { id: x.id }, data: { requiredDate: x.ngay } });
    nNgay++;
  }
  console.log(`  đã lấp ${nNgay} ngày cần vật tư`);

  // ánh xạ mã → prDetailId (gồm cả dòng vừa thêm)
  const sau = await prisma.prDetail.findMany({
    where: { pr: { projectId: duAn.id } }, select: { id: true, itemCode: true },
  });
  const idTheoMa = new Map();
  for (const d of sau) {
    const k = d.itemCode.trim().toUpperCase();
    if (!idTheoMa.has(k)) idTheoMa.set(k, d.id);
  }

  let nHD = 0, boQua = 0;
  for (const h of hd) {
    const { ma, ...du } = h;
    const prDetailId = idTheoMa.get(ma) ?? null;
    const trung = await prisma.contractDetail.findFirst({
      where: { prDetailId, contractNo: du.contractNo, vendorName: du.vendorName, contractWeight: du.contractWeight },
      select: { id: true },
    });
    if (trung) { boQua++; continue; }
    await prisma.contractDetail.create({
      data: { ...du, prDetailId, dataSource: NGUON, projectCode: MA_DA, status: 'PENDING' },
    });
    nHD++;
  }
  console.log(`  đã thêm ${nHD} dòng hợp đồng · bỏ qua ${boQua} dòng trùng`);

  const soHDSau = await prisma.contractDetail.count({ where: { prDetail: { pr: { projectId: duAn.id } } } });
  console.log(`\n── Sau khi nạp ──`);
  console.log(`  PrDetail  : ${dbCT.length} → ${dbCT.length + nCT}`);
  console.log(`  Hợp đồng  : ${soHDTruoc} → ${soHDSau}`);
  console.log(`\n  Gỡ lại toàn bộ đợt nạp này:`);
  console.log(`    DELETE FROM "ContractDetail" WHERE "dataSource"='${NGUON}' AND "projectCode"='${MA_DA}';`);
  console.log(`    DELETE FROM "PrDetail" WHERE "prId"='${pr.id}';`);
  console.log(`    DELETE FROM "PurchaseRequisition" WHERE id='${pr.id}';`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('LỖI:', e.message); await prisma.$disconnect(); process.exit(1); });
