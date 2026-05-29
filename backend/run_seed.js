// Chạy từ thư mục backend bất kể CWD hiện tại
const path = require('path');
process.chdir(__dirname);
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting seed...');

  // 1. Admin user — username: hungth (Trịnh Hữu Hùng)
  const adminExists = await prisma.user.findUnique({ where: { username: 'hungth' } });
  if (!adminExists) {
    const adminPw = process.env.ADMIN_INIT_PASSWORD || '123456';
    const hashed = await bcrypt.hash(adminPw, 12);
    await prisma.user.create({
      data: {
        username: 'hungth',
        password: hashed,
        name: 'Trịnh Hữu Hùng',
        role: 'ADMIN',
        isActive: true,
      },
    });
    console.log('  ✅ Admin user created (username: hungth)');
  } else {
    console.log('  ⏭️  Admin user already exists (hungth), skipped');
  }

  // 2. Material Groups
  const materialGroups = [
    { code: 'VTC', name: 'Vật tư chính', nameEn: 'Main Material', letter: 'A', sortOrder: 1 },
    { code: 'VPK', name: 'Vật tư phụ kiện, bu lông', nameEn: 'Accessory Material', letter: 'B', sortOrder: 2 },
    { code: 'VDK', name: 'Vật tư đóng kiện', nameEn: 'Packing Material', letter: 'C', sortOrder: 3 },
    { code: 'VBP', name: 'Vật tư làm biện pháp', nameEn: 'Temporary Works Material', letter: 'D', sortOrder: 4 },
    { code: 'VTH', name: 'Vật tư tiêu hao (hàn, khí)', nameEn: 'Consumables & Welding', letter: 'E', sortOrder: 5 },
    { code: 'VTS', name: 'Vật tư làm sạch và sơn', nameEn: 'Surface Treatment', letter: 'F', sortOrder: 6 },
    { code: 'VTP', name: 'Vật tư dự phòng', nameEn: 'Contingency Material', letter: 'G', sortOrder: 7 },
  ];
  for (const mg of materialGroups) {
    await prisma.materialGroup.upsert({ where: { code: mg.code }, update: {}, create: mg });
  }
  console.log('  ✅ 7 MaterialGroups seeded');

  // 3. Sub-groups
  const vtcGroup = await prisma.materialGroup.findUnique({ where: { code: 'VTC' } });
  const vpkGroup = await prisma.materialGroup.findUnique({ where: { code: 'VPK' } });
  const vdkGroup = await prisma.materialGroup.findUnique({ where: { code: 'VDK' } });
  const vthGroup = await prisma.materialGroup.findUnique({ where: { code: 'VTH' } });
  const vtsGroup = await prisma.materialGroup.findUnique({ where: { code: 'VTS' } });

  const subGroups = [
    { groupId: vtcGroup.id, code: 'VTC01', name: 'Thép carbon (CT3, SS400, A36)', sortOrder: 1 },
    { groupId: vtcGroup.id, code: 'VTC02', name: 'Thép hợp kim (A387, SA516, P355)', sortOrder: 2 },
    { groupId: vtcGroup.id, code: 'VTC03', name: 'Tấm sàn (Checker plate)', sortOrder: 3 },
    { groupId: vtcGroup.id, code: 'VTC04', name: 'Vật tư bảo ôn (Insulation)', sortOrder: 4 },
    { groupId: vpkGroup.id, code: 'VPK01', name: 'Bu lông, đai ốc, vòng đệm', sortOrder: 1 },
    { groupId: vpkGroup.id, code: 'VPK02', name: 'Phụ kiện kết nối khác', sortOrder: 2 },
    { groupId: vdkGroup.id, code: 'VDK01', name: 'Thùng gỗ (Wooden crate)', sortOrder: 1 },
    { groupId: vdkGroup.id, code: 'VDK02', name: 'Vật tư đóng kiện phụ', sortOrder: 2 },
    { groupId: vdkGroup.id, code: 'VDK03', name: 'Nilon, băng keo, đai thép', sortOrder: 3 },
    { groupId: vthGroup.id, code: 'VTH01', name: 'Que hàn, dây hàn, flux', sortOrder: 1 },
    { groupId: vthGroup.id, code: 'VTH02', name: 'Khí công nghiệp (O₂, Ar, CO₂)', sortOrder: 2 },
    { groupId: vthGroup.id, code: 'VTH03', name: 'Đá mài, lưỡi cắt, đầu khoan', sortOrder: 3 },
    { groupId: vtsGroup.id, code: 'VTS01', name: 'Sơn lót, sơn phủ', sortOrder: 1 },
    { groupId: vtsGroup.id, code: 'VTS02', name: 'Bi thổi, vật liệu làm sạch bề mặt', sortOrder: 2 },
  ];
  for (const sg of subGroups) {
    await prisma.materialSubGroup.upsert({ where: { code: sg.code }, update: {}, create: sg });
  }
  console.log('  ✅ 14 MaterialSubGroups seeded');

  // 4. Projects
  const proj095 = await prisma.project.upsert({
    where: { code: '25-VPI-I-095' }, update: {},
    create: { code: '25-VPI-I-095', name: 'BISON (VOGT POWER PROJECT) — SCR System', client: 'VOGT POWER INTERNATIONAL', refNo: 'I-095-ENG-001-REV 08', status: 'active' }
  });

  const fabCats095 = [
    { code: 'INLET-U1', name: 'Vật tư Inlet U1 (Ống góp đầu vào)', sortOrder: 1 },
    { code: 'SCR-U1', name: 'Vật tư SCR Reactor U1', sortOrder: 2 },
    { code: 'BURNER-U1', name: 'Vật tư Burner U1 (Buồng đốt)', sortOrder: 3 },
    { code: 'BASE-PLATE', name: 'Base Plate + Stack Template', sortOrder: 4 },
    { code: 'OUTLET-DUCT', name: 'Outlet Duct (Ống xả)', sortOrder: 5 },
    { code: 'TOP-BEAM', name: 'Top Beam (Dầm ngang đỉnh)', sortOrder: 6 },
    { code: 'BOX-1', name: 'Module Box 1', sortOrder: 7 },
    { code: 'BOX-2', name: 'Module Box 2', sortOrder: 8 },
    { code: 'BOX-3', name: 'Module Box 3', sortOrder: 9 },
    { code: 'BOX-4', name: 'Module Box 4', sortOrder: 10 },
    { code: 'BOX-5', name: 'Module Box 5', sortOrder: 11 },
    { code: 'BOX-6', name: 'Module Box 6', sortOrder: 12 },
    { code: 'STACK', name: 'Stack (Ống khói)', sortOrder: 13 },
    { code: 'STAIR-TOWER', name: 'Stair Tower (Tháp cầu thang)', sortOrder: 14 },
  ];
  for (const fc of fabCats095) {
    await prisma.fabricationCategory.upsert({ where: { projectId_code: { projectId: proj095.id, code: fc.code } }, update: {}, create: { projectId: proj095.id, ...fc } });
  }
  console.log('  ✅ Project I-095 + 14 FabCategories seeded');

  const proj090 = await prisma.project.upsert({
    where: { code: '25-BRA-I-090' }, update: {},
    create: { code: '25-BRA-I-090', name: 'BRADEN — Air Duct & Filtration System', client: 'BRADEN MANUFACTURING LLC', status: 'active' }
  });
  const fabCats090 = [
    { code: 'KCTC', name: 'Kết cấu thép chính (Main Steel Structure)', sortOrder: 1 },
    { code: 'KCDK', name: 'Kết cấu đóng kiện (Packaging Structure)', sortOrder: 2 },
    { code: 'PK', name: 'Phụ kiện liên kết (Connection Accessories)', sortOrder: 3 },
  ];
  for (const fc of fabCats090) {
    await prisma.fabricationCategory.upsert({ where: { projectId_code: { projectId: proj090.id, code: fc.code } }, update: {}, create: { projectId: proj090.id, ...fc } });
  }
  console.log('  ✅ Project I-090 + 3 FabCategories seeded');

  console.log('\n✨ Seed hoàn thành!');
}

main()
  .then(() => { pool.end(); console.log('   DB connection closed.'); })
  .catch(e => { console.error('❌ Seed thất bại:', e.message); pool.end(); process.exit(1); });
