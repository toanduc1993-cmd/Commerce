// ============================================================
// TYPES: procurement.ts v3
// IBS Heavy Industry — ETO Shipbuilding E-Procurement
// Phan anh dung cau truc mau Excel thuc te:
//   - Mau Du Toan.csv: nhom VTC/VPK/VDK/VBP/VTH/VTS/VTP
//   - Mau PR.csv: hang muc gia cong INLET/SCR/BURNER/BOX1-N/STACK
//   - Mau theo doi mua sam: vong doi day du DOM + IMP + QC
// ============================================================

// ─── STATUS & ENUMS ──────────────────────────────────────────

export type PRStatus =
  | 'Chờ báo giá'
  | 'Đang đàm phán'
  | 'Đã ký HĐ'
  | 'Hàng đang về'
  | 'Đã nghiệm thu'
  | 'Đã nhập kho';

export type MaterialStatus = 'Đủ' | 'Thiếu' | 'Thừa';

export type PurchaseSource = 'DOMESTIC' | 'IMPORT';

export type ContractStatus = 'ACTIVE' | 'CANCELLED' | 'COMPLETED';

export type UoM = 'm' | 'm2' | 'kg' | 'pcs' | 'sets' | 'Tam' | 'Cay' | string;

export type Urgency = 'Normal' | 'Urgent' | 'Critical';

export type UserRole = 'MUA_HANG' | 'KY_THUAT' | 'QC' | 'WAREHOUSE' | 'BOD' | 'ADMIN';

export type QCResult = 'PASS' | 'FAIL' | 'CONDITIONAL';

// ─── NHOM VAT TU ─────────────────────────────────────────────
// Mapping voi Mau Du Toan.csv
// A=VTC: Vat tu chinh (thep den, thep hop kim, tam san, bao on)
// B=VPK: Vat tu phu kien, bu long
// C=VDK: Vat tu dong kien (thep, phu kien, khac)
// D=VBP: Vat tu lam bien phap (san xuat)
// E=VTH: Vat tu tieu hao (han, khi cong nghiep)
// F=VTS: Vat tu lam sach va son
// G=VTP: Vat tu du phong

export type MaterialGroupCode = 'VTC' | 'VPK' | 'VDK' | 'VBP' | 'VTH' | 'VTS' | 'VTP';

export interface MaterialGroup {
  id: string;
  code: MaterialGroupCode;
  name: string; // Vat tu chinh | Vat tu phu kien...
  nameEn: string; // Main Material | Accessory | Packing Material
  letter: string; // A | B | C | D | E | F | G
  sortOrder: number;
  subGroups?: MaterialSubGroup[];
}

export interface MaterialSubGroup {
  id: string;
  groupId: string;
  code: string; // VTC01 | VTC02 | VTC03 | VPK01 | VDK01 | VTH01...
  name: string; // Thep carbon cac loai | Thep hinh | Thep ong | Phu kien...
  sortOrder: number;
}

// ─── HANG MUC GIA CONG ───────────────────────────────────────
// Phan bo vat tu theo tung module/assembly
// Du an I-095 (BISON/VOGT): INLET-U1 | SCR-U1 | BURNER-U1 |
//   BASE PLATE+STACK TEMPLATE | OUTLET DUCT | TOP BEAM |
//   BOX1..6 | STACK | STAIR TOWER
// Du an I-090 (BRADEN): KCTC | KCDK | ...

export interface FabricationCategory {
  id: string;
  projectId: string;
  code: string; // INLET-U1 | SCR-U1 | KCTC | KCDK
  name: string; // Vat tu Inlet U1 | Ket cau thep chinh
  sortOrder: number;
}

// Phan bo so luong tung vat tu cho tung hang muc gia cong
export interface FabAllocation {
  categoryId: string;
  categoryCode: string; // INLET-U1
  categoryName: string;
  qty: number;
  weight: number;
}

// ─── PROJECT ─────────────────────────────────────────────────

export interface Project {
  id: string;
  code: string; // 25-VPI-I-095 | 25-BRA-I-090
  name: string; // BISON (VOGT POWER PROJECT) | BRADEN AIR COOLER
  client: string; // VOGT POWER INTERNATIONAL | BRADEN GROUP
  refNo: string; // I-095-ENG-001-REV 08
  status: 'active' | 'completed' | 'on-hold';
  updatedAt: string;
}

// ─── PR HEADER ───────────────────────────────────────────────

export interface PRHeader {
  id: string;
  projectCode: string;
  projectName: string;
  refDocNo: string; // I-095-ENG-001-REV 08 (PR)
  department: string; // ENGINEERING / Thiet ke
  client: string;
  revisionNo?: string; // REV 08
  status: 'DRAFT' | 'SOURCING' | 'APPROVED' | 'PO_ISSUED' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
}

// ─── HOP DONG (ContractDetail) ───────────────────────────────
// Moi vat tu co the co nhieu hop dong (nhieu lan mua, DOM va IMP)

export interface InspectionRecord {
  id: string;
  contractDetailId: string;
  inspectionType: PurchaseSource; // DOMESTIC | IMPORT
  reportNo?: string;
  inspectionDate?: string;
  inspectedQty: number;
  inspectedWeight: number;
  acceptedQty: number;
  acceptedWeight: number;
  result?: string; // Pass | Fail | Đạt | ...
  remarks?: string;
}

export interface ContractDetail {
  id: string;
  prDetailId: string;
  purchaseOrderId?: string | null;
  contractType: PurchaseSource; // DOMESTIC | IMPORT

  // Thong tin hop dong
  contractNo?: string; // 90.1/HDKT-2025/IBS-VSAN | 150725/HN-IBS
  vendorName?: string;
  vendorCountry?: string;

  // Spec thực tế (chuyển đổi vật tư)
  actualProfile?: string;
  actualGrade?: string;

  // So luong
  contractQty: number;
  contractWeight: number;
  contractDate?: string;

  // Pricing
  unitPriceNoVAT: number;
  currency?: string;
  vatRate: number;
  totalNoVAT: number;
  totalWithVAT: number;

  // Delivery
  deliveredQty?: number;
  deliveredWeight?: number;

  // Import-specific milestones
  importLCDate?: string;
  exportPort?: string;
  cifDate?: string;
  paymentDate?: string;
  customsDate?: string;
  arrivedDate?: string;
  qcInvitationDate?: string;

  // Production handover
  handoverDate?: string;
  handoverToProductDate?: string;

  status: string; // PENDING | ORDERED | PARTIAL_DELIVERY | COMPLETED | CANCELLED
  notes?: string;
  createdAt?: string;
  updatedAt?: string;

  // Nested inspections
  inspections?: InspectionRecord[];
}

// ─── QC & GRN ────────────────────────────────────────────────

export interface GRNItem {
  id: string;
  grnId: string;
  prDetailId: string;
  receivedQty: number;
  receivedWeight: number;
  qcReportNo?: string;
  qcDate?: string;
  qcWeightAccepted: number;
  qcResult?: QCResult;
  qcNotes?: string;
}

// ─── PR DETAIL (CHINH) ───────────────────────────────────────
// Day la record trung tam — ket noi tat ca

export interface PRDetail {
  id: string;
  prId: string;

  // Nested PR header với project info (từ backend `include: { pr: { project } }`)
  pr?: {
    id: string;
    prRef: string;
    projectId: string;
    department?: string;
    status?: string;
    createdAt?: string;
    project?: {
      id: string;
      code: string; // 25-VPI-I-095
      name: string;
    };
  };

  // Nhom vat tu
  materialGroupCode?: MaterialGroupCode; // VTC | VPK | VDK
  materialGroupName?: string; // Vat tu chinh | Vat tu phu kien
  materialSubGroupCode?: string; // VTC01 | VTC02
  materialSubGroupName?: string; // Thep carbon cac loai

  // Dinh danh
  itemCode: string; // I90-A1 | I95-VTC01-001 | I90-C100
  itemName: string; // Ton tam | Thep hinh-H | Bulong mong

  // Thong so ky thuat
  profile: string; // PL10x2000x6000 | HEA200(H190x200x6.5x10)-L12000
  grade: string; // SS400 | ASTM A36 | A572-GR50 | 1.0038/A36
  uom: UoM; // m | m2 | kg | pcs | sets
  unitWeight: number; // Kg/m2 hoac Kg/pcs

  // So luong yeu cau tu BOM
  netQty: number; // Net Quantity / So luong tinh
  netWeight: number; // = netQty x unitWeight
  reqQty: number; // Du tru mua (Current Ordered)
  reqWeight: number; // = reqQty x unitWeight

  // Ton kho tan dung
  remainQty: number; // Tan dung ton kho / Remain
  remainWeight: number;

  // Phai mua sam
  toBuyQty: number; // = reqQty - remainQty
  toBuyWeight: number;

  // Ngay yeu cau
  requiredDate?: string; // Ngay ban giao vat tu / Material available date
  urgency: Urgency;

  // === HANG MUC GIA CONG ===
  // Phan bo so luong cho tung module/assembly
  fabAllocations?: FabAllocation[];
  // Tong hop: { 'INLET-U1': {qty:38, weight:2986}, 'SCR-U1': {qty:11, weight:894}, ... }

  // === HOP DONG ===
  // Co the co nhieu hop dong cho 1 vat tu (nhieu lan mua, nhieu NCC)
  contracts?: ContractDetail[];

  // === TINH TOAN TONG HOP (computed) ===
  // Trong nuoc (DOMESTIC)
  domesticTotalQty: number; // Tong SL da mua trong nuoc
  domesticTotalWeight: number; // Tong KL da mua trong nuoc
  domesticTotalNoVAT: number; // Tong tien chua VAT
  domesticTotalWithVAT: number; // Tong tien da VAT

  // Nhap khau (IMPORT)
  importTotalQty: number;
  importTotalWeight: number;
  importTotalNoVAT: number;
  importCIFTotal: number;

  // Tong cong
  totalPurchasedQty: number; // Tong da mua (DOM + IMP)
  totalPurchasedWeight: number;

  // So sanh vs PR
  diffQty: number; // = totalPurchased - reqQty (am = Thieu, duong = Thua)
  diffWeight: number;
  materialStatus: MaterialStatus; // Du | Thieu | Thua

  // === TRANG THAI ===
  statusFlag: PRStatus;
  remarks?: string;
  revNotes?: string;
}

// ─── KPI ─────────────────────────────────────────────────────

export interface KPIData {
  totalItems: number;
  totalWeight: number; // Tong KL yeu cau (ton)
  purchasedWeight: number; // Tong da mua (ton)
  completionPct: number; // % hoan thanh
  statusBreakdown: Record<PRStatus, number>; // { 'Cho bao gia': 12, 'Dang dam phan': 5, ... }
  groupBreakdown: Record<
    MaterialGroupCode,
    {
      totalItems: number;
      totalWeight: number;
      purchasedWeight: number;
      totalValueNoVAT: number;
    }
  >;
  fabBreakdown?: Record<
    string,
    {
      // { 'INLET-U1': {...}, 'SCR-U1': {...} }
      totalWeight: number;
      purchasedWeight: number;
      completionPct: number;
    }
  >;
}

// ─── IMPORT RESULT ───────────────────────────────────────────

export interface ImportResult {
  success: boolean;
  message?: string;
  valid_items_extracted?: number;
  pr_ref?: string;
  warnings?: string;
  total_errors_detected?: number;
  dirty_details?: ErrorDetail[];
}

export interface ErrorDetail {
  row_number: number;
  status: string;
  errors: string[];
  isGate1Trash?: boolean;
}

// ─── PO RESULT ───────────────────────────────────────────────

export interface POResult {
  success: boolean;
  po_number?: string;
  gate?: string;
  error?: string;
  inflation?: string;
}

// ─── BIEN PHAP TONG HOP ──────────────────────────────────────
// Toan bo nhom vat tu trong 1 lan render
export interface PRGroupedData {
  groups: {
    group: MaterialGroup;
    items: PRDetail[];
    subtotalQty: number;
    subtotalWeight: number;
    subtotalValueNoVAT: number;
    completionPct: number;
  }[];
  project: Project;
  pr: PRHeader;
  fabricationCategories: FabricationCategory[];
}
