// ============================================================
// LIB: api.ts
// Tập trung toàn bộ HTTP calls — không còn fetch() rải rác
// BASE_URL đọc từ env: NEXT_PUBLIC_API_URL
// S2-1: Auth qua HttpOnly cookie + CSRF double-submit (X-CSRF-Token header).
// ============================================================

import type { ImportResult, POResult, PRDetail } from '@/types/procurement';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5005';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let csrfTokenCache: string | null = null;
let csrfFetchPromise: Promise<string | null> | null = null;

export async function ensureCsrfToken(forceRefresh = false): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (!forceRefresh && csrfTokenCache) return csrfTokenCache;
  if (csrfFetchPromise) return csrfFetchPromise;

  csrfFetchPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/api/v1/auth/csrf-token`, { credentials: 'include' });
      if (!res.ok) return null;
      const data = (await res.json()) as { csrfToken?: string };
      csrfTokenCache = data.csrfToken ?? null;
      return csrfTokenCache;
    } catch {
      return null;
    } finally {
      csrfFetchPromise = null;
    }
  })();

  return csrfFetchPromise;
}

export function resetCsrfToken() {
  csrfTokenCache = null;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  // Ưu tiên ibshi_token (JWT body), fallback ibshi_authed legacy
  try {
    const raw = localStorage.getItem('ibshi_token');
    if (raw) return raw;
  } catch { /* ignore */ }
  return null;
}

function getHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...customHeaders };
  // Gửi JWT qua Authorization header (cookie không hoạt động cross-port trên HTTP local)
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function doFetch(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${BASE}${url}`, {
      ...options,
      credentials: 'include',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function apiRequest<T>(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const needsCsrf = MUTATING_METHODS.has(method);

  // Build headers (clone vì RequestInit.headers có thể là HeadersInit complex)
  const baseHeaders: Record<string, string> = {};
  if (options.headers) {
    const h = new Headers(options.headers as HeadersInit);
    h.forEach((v, k) => {
      baseHeaders[k] = v;
    });
  }

  if (needsCsrf) {
    const csrfToken = await ensureCsrfToken();
    if (csrfToken) baseHeaders['X-CSRF-Token'] = csrfToken;
  }

  let res = await doFetch(url, { ...options, headers: baseHeaders }, timeoutMs);

  // Retry once on CSRF failure (token có thể stale sau login/restart)
  if (res.status === 403 && needsCsrf) {
    const errBody = await res.clone().json().catch(() => ({}));
    const msg = String((errBody as { error?: string }).error || '');
    if (msg.includes('CSRF')) {
      const fresh = await ensureCsrfToken(true);
      if (fresh) {
        baseHeaders['X-CSRF-Token'] = fresh;
        res = await doFetch(url, { ...options, headers: baseHeaders }, timeoutMs);
      }
    }
  }

  // Auto-handle expired/invalid session
  if (res.status === 401 || res.status === 403) {
    const err = await res.json().catch(() => ({}));
    const msg = String(err.error || err.message || '');
    if (
      typeof window !== 'undefined' &&
      (res.status === 401 || msg.includes('Token') || msg.includes('hết hạn') || msg.includes('Chưa đăng nhập'))
    ) {
      localStorage.removeItem('ibshi_authed');
      localStorage.removeItem('ibshi_user');
      resetCsrfToken();
      // Redirect về login, tránh loop nếu đã ở /login
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      }
      throw new Error('Phiên đã hết hạn — đang chuyển về trang đăng nhập');
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── PR ──────────────────────────────────────────────────────────────────────

export async function fetchPRList(projectId?: string): Promise<PRDetail[]> {
  const query = projectId ? `?projectId=${projectId}` : '';
  const data = await apiRequest<{ success: boolean; data?: PRDetail[] }>(`/api/v1/prs${query}`, {
    headers: getHeaders(),
  });
  return data.success && data.data ? data.data : [];
}

export async function importPRFile(file: File, projectCode?: string): Promise<ImportResult> {
  const formData = new FormData();

  // Đảm bảo MIME type đúng cho XLSX — multer filter kiểm tra mimetype
  // Browser đôi khi gán sai type cho .xlsx → force đúng type
  let uploadFile = file;
  if (file.name.match(/\.xlsx?$/i)) {
    const correctMime = file.name.toLowerCase().endsWith('.xlsx')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/vnd.ms-excel';
    if (file.type !== correctMime) {
      uploadFile = new File([file], file.name, { type: correctMime });
    }
  }

  formData.append('file', uploadFile);
  if (projectCode) formData.append('projectCode', projectCode);

  // Tăng timeout lên 30s cho file lớn (563KB, 243 items)
  return apiRequest<ImportResult>(
    '/api/v1/prs/import',
    {
      method: 'POST',
      headers: getHeaders(),
      body: formData,
    },
    30000
  );
}

// ─── Status & Clarification ───────────────────────────────────────────────────

export async function updateStatusFlag(
  prDetailId: string,
  flagStatus: string,
  comment = ''
): Promise<{ success: boolean }> {
  return apiRequest('/api/v1/clarification/flag', {
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prDetailId, flagStatus, comment }),
  });
}

// ─── GRN — Nhận hàng ─────────────────────────────────────────────────────────

export interface GRNLineItem {
  itemCode: string;
  itemName: string;
  uom: string;
  orderedQty: number;
  receivedQty: number;
  rejectedQty?: number;
  weight?: number;
  notes?: string;
}

export interface GRNRequest {
  poNumber: string;
  warehouseLocation?: string;
  lineItems: GRNLineItem[];
}

export interface GRNResult {
  success: boolean;
  grn_code?: string;
  grn_id?: string;
  inventory_updated?: Array<{ itemCode: string; added: number; newTotal: number }>;
  error?: string;
}

export async function receiveGoods(grnRequest: GRNRequest): Promise<GRNResult> {
  return apiRequest<GRNResult>('/api/v1/receipts/receive', {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(grnRequest),
  });
}

// ─── QC Confirm GRN ──────────────────────────────────────────────────────────

export async function confirmQC(
  grnId: string,
  qcStatus: 'PASSED' | 'FAILED' | 'PARTIAL',
  notes?: string
): Promise<{ success: boolean; message?: string }> {
  return apiRequest('/api/v1/receipts/qc-confirm', {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ grnId, qcStatus, notes }),
  });
}

// ─── Gate 3: Hard Pegging ─────────────────────────────────────────────────────

export async function pegStock(
  prDetailId: string,
  allocateQty: number
): Promise<{ success: boolean; error?: string }> {
  return apiRequest('/api/v1/inventory/peg', {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prDetailId, allocateQty }),
  });
}

// ─── PO ──────────────────────────────────────────────────────────────────────

export async function generatePO(
  prId: string,
  selectedItems: string[],
  bidId?: string
): Promise<POResult> {
  return apiRequest<POResult>('/api/v1/pos/generate', {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prId, selectedItems, bidId }),
  });
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export async function fetchInventory(itemCode: string): Promise<{
  onHandQty: number;
  allocatedQty: number;
  availableQty: number;
  uom: string;
} | null> {
  try {
    const data = await apiRequest<{ success: boolean; data?: unknown }>(
      `/api/v1/inventory/${encodeURIComponent(itemCode)}`,
      { headers: getHeaders() }
    );
    return data.success ? (data.data as never) : null;
  } catch {
    return null;
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

// ─── Update Procurement Status ────────────────────────────────────────────────

export interface ProcurementUpdateResult {
  success: boolean;
  message?: string;
  sheetName?: string;
  format?: 'master-tracking' | 'pr-with-revs' | string;
  notice?: string | null;
  projectCode?: string;
  stats?: {
    totalParsed: number;
    matched: number;
    created: number;
    notFound: number;
    updated: number;
    contractsCreated: number;
    contractsUpdated: number;
    errors: Array<{ itemCode: string; error: string }>;
  };
  notFoundSample?: string[];
  error?: string;
}

export async function updateProcurementFromFile(
  file: File,
  projectCode: string,
  createMissing: boolean = true
): Promise<ProcurementUpdateResult> {
  const formData = new FormData();

  // Fix MIME cho .xlsx
  let uploadFile = file;
  if (file.name.match(/\.xlsx?$/i)) {
    const correctMime = file.name.toLowerCase().endsWith('.xlsx')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/vnd.ms-excel';
    if (file.type !== correctMime) {
      uploadFile = new File([file], file.name, { type: correctMime });
    }
  }

  formData.append('file', uploadFile);
  formData.append('projectCode', projectCode);
  formData.append('createMissing', createMissing ? 'true' : 'false');

  return apiRequest<ProcurementUpdateResult>(
    '/api/v1/prs/update-procurement',
    {
      method: 'POST',
      headers: getHeaders(),
      body: formData,
    },
    180_000 // 3 phút timeout cho file lớn
  );
}

export async function changePasswordAPI(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message?: string }> {
  return apiRequest('/api/v1/auth/change-password', {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function loginAPI(
  username: string,
  password: string
): Promise<{
  success: boolean;
  token?: string;
  user?: { name: string; role: string };
  message?: string;
}> {
  const result = await apiRequest<{
    success: boolean;
    token?: string;
    user?: { name: string; role: string };
    message?: string;
  }>('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  // Lưu JWT vào localStorage để gửi qua Authorization header (cross-port dev)
  if (result.success && result.token) {
    try { localStorage.setItem('ibshi_token', result.token); } catch { /* ignore */ }
  }
  return result;
}

export async function logoutAPI(): Promise<{ success: boolean; message?: string }> {
  try {
    const r = await apiRequest<{ success: boolean; message?: string }>('/api/v1/auth/logout', {
      method: 'POST',
    });
    resetCsrfToken();
    try { localStorage.removeItem('ibshi_token'); } catch { /* ignore */ }
    return r;
  } catch {
    resetCsrfToken();
    try { localStorage.removeItem('ibshi_token'); } catch { /* ignore */ }
    return { success: true };
  }
}

// ─── List endpoints (read-only) ──────────────────────────────────────────────

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  client?: string | null;
  refNo?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  stats: {
    prCount: number;
    fabCategoryCount: number;
    budgetCount: number;
    itemCount: number;
    totalWeight: number;
  };
}

export interface VendorRow {
  name: string;
  country: string;
  type: string;
  contractCount: number;
  poCount: number;
  totalValue: number;
  lastTxDate: string | null;
  activeContracts: number;
}

export interface POContractDetail {
  id: string;
  contractNo?: string | null;
  contractType: string;
  contractDate?: string | null;
  contractQty: number;
  contractWeight: number;
  unitPriceNoVAT: number;
  totalNoVAT: number;
  totalWithVAT: number;
  vendorName?: string | null;
  vendorCountry?: string | null;
  deliveredQty: number;
  deliveredWeight: number;
  status: string;
}

export interface PORow {
  id: string;
  poCode: string;
  vendorName?: string | null;
  totalValue: number;
  currency: string;
  status: string;
  issuedAt: string;
  bid?: {
    id: string;
    prId?: string | null;
    pr?: {
      id: string;
      prRef: string;
      project?: { id: string; code: string; name: string } | null;
    } | null;
  } | null;
  contractDetails: POContractDetail[];
  grns: Array<{
    id: string;
    grnCode: string;
    qcStatus: string;
    receivedAt: string;
  }>;
}

export interface GRNRow {
  id: string;
  grnCode: string;
  warehouseLocation?: string | null;
  qcStatus: string;
  receivedAt: string;
  notes?: string | null;
  purchaseOrder: { poCode: string; vendorName?: string | null };
  lineItems: Array<{
    id: string;
    itemCode: string;
    itemName: string;
    uom: string;
    orderedQty: number;
    receivedQty: number;
    rejectedQty: number;
    acceptedQty: number;
    receivedWeight: number;
  }>;
}

export interface InventoryRow {
  id: string;
  itemCode: string;
  itemName?: string | null;
  uom: string;
  onHandQty: number;
  allocatedQty: number;
  availableQty: number;
  warehouseLocation?: string | null;
  lastReceivedAt?: string | null;
  updatedAt: string;
  peggings: Array<{ id: string; peggedQty: number; prDetailId: string; peggedAt: string }>;
}

export interface MaterialCatalogRow {
  itemCode: string;
  itemName: string;
  profile?: string | null;
  grade?: string | null;
  uom: string;
  unitWeight: number;
  materialGroupCode?: string | null;
  materialSubGroupCode?: string | null;
}

export interface DashboardStats {
  projects: { total: number; active: number };
  prs: { total: number; items: number };
  weights: { requested: number; net: number; toBuy: number };
  pos: {
    total: number;
    breakdown: Array<{ status: string; count: number; totalValue: number }>;
  };
  grns: { total: number };
  inventory: { items: number };
  contracts: { count: number; totalNoVAT: number; totalWithVAT: number };
  topVendors: Array<{ name: string; value: number }>;
  groupBreakdown: Array<{
    groupCode: string;
    itemCount: number;
    requestedWeight: number;
    purchasedWeight: number;
  }>;
}

async function fetchList<T>(path: string): Promise<T[]> {
  const data = await apiRequest<{ success: boolean; data?: T[] }>(path, { headers: getHeaders() });
  return data.success && data.data ? data.data : [];
}

export const fetchProjects = () => fetchList<ProjectRow>('/api/v1/projects');
export const fetchVendors = () => fetchList<VendorRow>('/api/v1/vendors');
export const fetchPOs = (projectCode?: string) =>
  fetchList<PORow>('/api/v1/pos' + (projectCode ? `?projectCode=${projectCode}` : ''));
export const fetchGRNs = () => fetchList<GRNRow>('/api/v1/grns');
export const fetchInventoryList = () => fetchList<InventoryRow>('/api/v1/inventory');
export const fetchMaterialCatalog = (groupCode?: string, search?: string) => {
  const params = new URLSearchParams();
  if (groupCode) params.set('groupCode', groupCode);
  if (search) params.set('search', search);
  const qs = params.toString();
  return fetchList<MaterialCatalogRow>('/api/v1/material-catalog' + (qs ? `?${qs}` : ''));
};
export async function fetchDashboardStats(): Promise<DashboardStats | null> {
  try {
    const r = await apiRequest<{ success: boolean; data: DashboardStats }>(
      '/api/v1/dashboard/stats',
      { headers: getHeaders() }
    );
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

// ─── Module 2/3: Bid Analyses ────────────────────────────────────────────────

export interface BidVendorRow {
  id: string;
  vendorName: string;
  vendorOrder: number;
  vendorType: string;
  currency: string;
  totalQuote: number;
  isWinner: boolean;
}

export interface BidOfferRow {
  id: string;
  itemId: string;
  vendorId: string;
  scope?: string | null;
  unitPrice: number;
  totalPrice: number;
  vendor?: { vendorName: string; vendorOrder: number };
}

export interface BidItemRow {
  id: string;
  bidId: string;
  itemOrder: number;
  itemCode?: string | null;
  itemName?: string | null;
  profile?: string | null;
  grade?: string | null;
  gradeBuy?: string | null;
  uom?: string | null;
  qtyPR: number;
  qtyToBuy: number;
  estimateUnitPrice: number;
  estimateTotal: number;
  alreadyBoughtAmount: number;
  selectedVendorName?: string | null;
  notes?: string | null;
  offers: BidOfferRow[];
}

export interface BidAnalysisRow {
  id: string;
  projectId?: string | null;
  bidCode?: string | null;
  subject?: string | null;
  bidDate?: string | null;
  status: string;
  selectedVendorId?: string | null;
  createdAt: string;
  project?: { code: string; name: string } | null;
  vendors: BidVendorRow[];
  items?: BidItemRow[];
  _count?: { items: number };
  sourceFileName?: string | null;
  sourceFilePath?: string | null;
  sourceSheetName?: string | null;
  // F-BID-A Phase A v3
  selectionMode?: 'PER_BID' | 'PER_ITEM' | 'PER_GROUP' | 'AUTO_MIN_PRICE' | 'MANUAL_WEIGHTED';
  weightingCriteria?: { price?: number; quality?: number; paymentTerms?: number } | null;
}

export const fetchBidAnalyses = (projectCode?: string, status?: string) => {
  const params = new URLSearchParams();
  if (projectCode) params.set('projectCode', projectCode);
  if (status) params.set('status', status);
  const qs = params.toString();
  return fetchList<BidAnalysisRow>('/api/v1/bid-analyses' + (qs ? `?${qs}` : ''));
};

export async function fetchBidAnalysisDetail(id: string): Promise<BidAnalysisRow | null> {
  try {
    const r = await apiRequest<{ success: boolean; data: BidAnalysisRow }>(
      `/api/v1/bid-analyses/${id}`,
      { headers: getHeaders() }
    );
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export async function uploadBidAnalysesFile(
  file: File,
  projectCode?: string
): Promise<{
  success: boolean;
  message?: string;
  stats?: Record<string, unknown>;
  error?: string;
}> {
  const formData = new FormData();
  let uploadFile = file;
  if (file.name.match(/\.xlsx?$/i) && !file.type) {
    uploadFile = new File([file], file.name, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }
  formData.append('file', uploadFile);
  if (projectCode) formData.append('projectCode', projectCode);

  return apiRequest(
    '/api/v1/bid-analyses/upload',
    { method: 'POST', headers: getHeaders(), body: formData },
    180_000
  );
}

export async function selectBidVendor(
  bidId: string,
  vendorId: string
): Promise<{ success: boolean; message?: string }> {
  return apiRequest(`/api/v1/bid-analyses/${bidId}/select-vendor`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ vendorId }),
  });
}

// Phê duyệt báo giá theo từng item (per-item vendor selection)
export async function selectItemVendor(
  bidId: string,
  itemId: string,
  vendorName: string | null
): Promise<{ success: boolean; selectedVendorName?: string | null; error?: string }> {
  return apiRequest(`/api/v1/bid-analyses/${bidId}/items/${itemId}/select-vendor`, {
    method: 'PATCH',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ vendorName }),
  });
}

export interface ApprovalSummary {
  bid: {
    id: string;
    bidCode?: string | null;
    subject?: string | null;
    project?: { code: string; name: string } | null;
  };
  summary: {
    totalItems: number;
    assignedItems: number;
    pendingItems: number;
    totalApprovedValue: number;
    vendorCount: number;
  };
  byVendor: Array<{
    vendorName: string;
    itemCount: number;
    totalValue: number;
    items: Array<{
      itemCode?: string | null;
      itemName?: string | null;
      profile?: string | null;
      grade?: string | null;
      uom?: string | null;
      qtyToBuy: number;
      unitPrice: number;
      totalPrice: number;
    }>;
  }>;
}

export async function fetchApprovalSummary(bidId: string): Promise<ApprovalSummary | null> {
  try {
    const r = await apiRequest<{ success: boolean; data: ApprovalSummary }>(
      `/api/v1/bid-analyses/${bidId}/approval-summary`,
      { headers: getHeaders() }
    );
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

// ─── Module 4: Contracts ─────────────────────────────────────────────────────

export interface ContractRow {
  contractNo: string;
  vendorName?: string | null;
  vendorCountry?: string | null;
  contractType: string;
  contractDate?: string | null;
  currency?: string | null;
  status: string;
  importLCDate?: string | null;
  exportPort?: string | null;
  cifDate?: string | null;
  paymentDate?: string | null;
  customsDate?: string | null;
  arrivedDate?: string | null;
  qcInvitationDate?: string | null;
  handoverToProductDate?: string | null;
  totalQty: number;
  totalWeight: number;
  totalNoVAT: number;
  totalWithVAT: number;
  itemCount: number;
  inspectionCount: number;
  projectCodes: string[];
  lineItems: Array<{
    id: string;
    itemCode?: string;
    itemName?: string;
    uom?: string;
    actualProfile?: string | null;
    actualGrade?: string | null;
    contractQty: number;
    contractWeight: number;
    unitPriceNoVAT: number;
    totalNoVAT: number;
    deliveredQty: number;
    deliveredWeight: number;
    inspectionCount: number;
  }>;
}

export const fetchContracts = (filters?: {
  projectCode?: string;
  vendor?: string;
  type?: string;
}) => {
  const params = new URLSearchParams();
  if (filters?.projectCode) params.set('projectCode', filters.projectCode);
  if (filters?.vendor) params.set('vendor', filters.vendor);
  if (filters?.type) params.set('type', filters.type);
  const qs = params.toString();
  return fetchList<ContractRow>('/api/v1/contracts' + (qs ? `?${qs}` : ''));
};

// ─── Module 5: Payment Schedules ─────────────────────────────────────────────

export interface PaymentScheduleRow {
  id: string;
  rowOrder: number;
  supplier?: string | null;
  saleContract?: string | null;
  projectCode?: string | null;
  value: number;
  currency: string;
  paymentMethod?: string | null;
  signDate?: string | null;
  lcDate?: string | null;
  etd?: string | null;
  eta?: string | null;
  documentDate?: string | null;
  paymentMonth?: string | null;
  lcDeadline?: string | null;
  notes?: string | null;
  status: string;
  paidDate?: string | null;
  paidAmount: number;
  project?: { code: string; name: string } | null;
  contractDetail?: {
    id: string;
    contractNo: string;
    vendorName?: string | null;
    contractType: string;
    totalNoVAT: number;
    totalWithVAT: number;
  } | null;
}

export interface PaymentScheduleListResponse {
  success: boolean;
  data: PaymentScheduleRow[];
  total: number;
  summary: Array<{ month: string; count: number; totalValue: number }>;
}

export async function fetchPaymentSchedules(filters?: {
  projectCode?: string;
  month?: string;
  status?: string;
  supplier?: string;
}): Promise<PaymentScheduleListResponse> {
  const params = new URLSearchParams();
  if (filters?.projectCode) params.set('projectCode', filters.projectCode);
  if (filters?.month) params.set('month', filters.month);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.supplier) params.set('supplier', filters.supplier);
  const qs = params.toString();
  return apiRequest<PaymentScheduleListResponse>(
    '/api/v1/payment-schedules' + (qs ? `?${qs}` : ''),
    { headers: getHeaders() }
  );
}

export async function uploadPaymentSchedulesFile(
  file: File,
  projectCode?: string
): Promise<{
  success: boolean;
  message?: string;
  stats?: Record<string, unknown>;
  error?: string;
}> {
  const formData = new FormData();
  let uploadFile = file;
  if (file.name.match(/\.xlsx?$/i) && !file.type) {
    uploadFile = new File([file], file.name, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }
  formData.append('file', uploadFile);
  if (projectCode) formData.append('projectCode', projectCode);

  return apiRequest(
    '/api/v1/payment-schedules/upload',
    { method: 'POST', headers: getHeaders(), body: formData },
    120_000
  );
}

// ─── Module 7: Arrivals (Hàng về kho + QC) ───────────────────────────────────

export interface ArrivalInspection {
  id: string;
  reportNo?: string | null;
  inspectionDate?: string | null;
  inspectedQty: number;
  inspectedWeight: number;
  acceptedQty: number;
  acceptedWeight: number;
  result?: string | null;
  remarks?: string | null;
}

export interface ArrivalRow {
  id: string;
  contractNo?: string | null;
  contractType: string;
  vendorName?: string | null;
  vendorCountry?: string | null;
  contractDate?: string | null;
  arrivedDate?: string | null;
  qcInvitationDate?: string | null;
  handoverDate?: string | null;
  handoverToProductDate?: string | null;
  contractQty: number;
  contractWeight: number;
  deliveredQty: number;
  deliveredWeight: number;
  actualProfile?: string | null;
  actualGrade?: string | null;
  status: string;
  qcStatus: 'PENDING' | 'PASSED' | 'FAILED' | 'PARTIAL';
  isHandedOver: boolean;
  item: {
    itemCode?: string | null;
    itemName?: string | null;
    uom?: string | null;
    profile?: string | null;
    grade?: string | null;
  };
  project?: { code: string; name: string } | null;
  prRef?: string | null;
  inspections: ArrivalInspection[];
}

export interface ArrivalStats {
  totalArrivals: number;
  passed: number;
  failed: number;
  pending: number;
  handedOver: number;
  totalWeight: number;
}

export async function fetchArrivals(filters?: {
  search?: string;
  qc?: string;
  type?: string;
  projectCode?: string;
}): Promise<ArrivalRow[]> {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.qc) params.set('qc', filters.qc);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.projectCode) params.set('projectCode', filters.projectCode);
  const qs = params.toString();
  const r = await apiRequest<{ success: boolean; data: ArrivalRow[] }>(
    '/api/v1/arrivals' + (qs ? `?${qs}` : ''),
    { headers: getHeaders() },
    30000
  );
  return r.success ? r.data : [];
}

export async function fetchArrivalStats(): Promise<ArrivalStats | null> {
  try {
    const r = await apiRequest<{ success: boolean; data: ArrivalStats }>(
      '/api/v1/arrivals/stats',
      { headers: getHeaders() }
    );
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export async function updateArrival(
  id: string,
  data: Partial<{
    arrivedDate: string | null;
    qcInvitationDate: string | null;
    handoverDate: string | null;
    handoverToProductDate: string | null;
    deliveredQty: number;
    deliveredWeight: number;
    notes: string;
  }>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  return apiRequest(`/api/v1/arrivals/${id}`, {
    method: 'PATCH',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
}

export async function addInspection(
  contractDetailId: string,
  data: Partial<ArrivalInspection>
): Promise<{ success: boolean; data?: ArrivalInspection; error?: string }> {
  return apiRequest(`/api/v1/arrivals/${contractDetailId}/inspections`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
}

export async function updateInspectionRecord(
  id: string,
  data: Partial<ArrivalInspection>
): Promise<{ success: boolean; data?: ArrivalInspection; error?: string }> {
  return apiRequest(`/api/v1/arrivals/inspections/${id}`, {
    method: 'PATCH',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
}

export async function deleteInspectionRecord(
  id: string
): Promise<{ success: boolean; error?: string }> {
  return apiRequest(`/api/v1/arrivals/inspections/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
}

// ─── Module 6: Vendor Master (full CRUD) ─────────────────────────────────────

export interface VendorMaster {
  id: string;
  code?: string | null;
  name: string;
  shortName?: string | null;
  taxCode?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  contactName?: string | null;
  contactTitle?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  categories?: string | null;
  vendorType: string;
  rating?: number | null;
  status: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  stats: { contractCount: number; totalValue: number };
}

export interface VendorMasterDetail extends VendorMaster {
  contracts: Array<{
    id: string;
    contractNo?: string | null;
    contractType: string;
    contractDate?: string | null;
    contractQty: number;
    contractWeight: number;
    totalNoVAT: number;
    totalWithVAT: number;
    status: string;
    prDetail?: {
      itemCode?: string | null;
      itemName?: string | null;
      pr?: { project?: { code: string } | null } | null;
    } | null;
  }>;
}

export async function fetchVendorsMaster(filters?: {
  search?: string;
  type?: string;
  status?: string;
}): Promise<VendorMaster[]> {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const r = await apiRequest<{ success: boolean; data: VendorMaster[] }>(
    '/api/v1/vendor-master' + (qs ? `?${qs}` : ''),
    { headers: getHeaders() }
  );
  return r.success ? r.data : [];
}

export async function fetchVendorMasterDetail(id: string): Promise<VendorMasterDetail | null> {
  try {
    const r = await apiRequest<{ success: boolean; data: VendorMasterDetail }>(
      `/api/v1/vendor-master/${id}`,
      { headers: getHeaders() }
    );
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export async function createVendorMaster(
  data: Partial<VendorMaster>
): Promise<{ success: boolean; data?: VendorMaster; error?: string }> {
  return apiRequest('/api/v1/vendor-master', {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
}

export async function updateVendorMaster(
  id: string,
  data: Partial<VendorMaster>
): Promise<{ success: boolean; data?: VendorMaster; error?: string }> {
  return apiRequest(`/api/v1/vendor-master/${id}`, {
    method: 'PATCH',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
}

export async function deleteVendorMaster(
  id: string,
  hard = false
): Promise<{ success: boolean; error?: string }> {
  return apiRequest(`/api/v1/vendor-master/${id}${hard ? '?hard=true' : ''}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
}

export async function seedVendorsFromHistory(): Promise<{
  success: boolean;
  message?: string;
  stats?: { created: number; skipped: number; total: number };
}> {
  return apiRequest(
    '/api/v1/vendor-master/seed',
    { method: 'POST', headers: getHeaders() },
    60_000
  );
}

export async function updatePaymentScheduleStatus(
  id: string,
  data: { status?: string; paidDate?: string; paidAmount?: number; notes?: string }
): Promise<{ success: boolean; data?: PaymentScheduleRow }> {
  return apiRequest(`/api/v1/payment-schedules/${id}`, {
    method: 'PATCH',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
}

// ─── F3: Purchase History ─────────────────────────────────────────────────────

export interface PurchaseHistoryTransaction {
  id: string;
  contractNo: string | null;
  vendorName: string | null;
  vendorCountry: string | null;
  contractDate: string | null;
  contractQty: number;
  contractWeight: number;
  unitPriceNoVAT: number;
  currency: string;
  vatRate: number;
  totalNoVAT: number;
  totalWithVAT: number;
  actualProfile: string | null;
  actualGrade: string | null;
  status: string;
  dataSource: string;
  projectCode: string | null;
  projectName: string;
  prRef: string;
  deliveredQty: number;
  contractType: string;
}

export interface PurchaseHistoryVendorSummary {
  vendorName: string;
  txCount: number;
  totalQty: number;
  totalValue: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
}

export interface PurchaseHistoryItem {
  itemCode: string;
  itemName: string;
  profile: string;
  grade: string;
  uom: string;
  summary: {
    totalTransactions: number;
    totalVendors: number;
    totalQtyBought: number;
    totalValueNoVAT: number;
    avgUnitPrice: number;
    minUnitPrice: number;
    maxUnitPrice: number;
    latestVendor: string | null;
    latestPrice: number | null;
    latestDate: string | null;
  };
  vendorSummary: PurchaseHistoryVendorSummary[];
  transactions: PurchaseHistoryTransaction[];
}

export async function fetchPurchaseHistory(
  itemCodes: string[]
): Promise<{ data: PurchaseHistoryItem[]; notFound: string[]; total: number }> {
  const q = itemCodes.join(',');
  return apiRequest(`/api/v1/purchase-history?itemCodes=${encodeURIComponent(q)}`, {
    headers: getHeaders(),
  });
}

export interface PurchaseHistorySummary {
  itemCode: string;
  found: boolean;
  itemName: string;
  uom: string;
  summary: {
    totalTransactions: number;
    totalVendors: number;
    avgUnitPrice: number;
    minUnitPrice: number;
    maxUnitPrice: number;
    latestVendor: string | null;
    latestPrice: number | null;
    latestDate: string | null;
  } | null;
  recentTransactions: PurchaseHistoryTransaction[];
  vendorSummary: Array<{ vendorName: string; txCount: number; totalQty: number; latestPrice: number; latestDate: string | null }>;
}

export async function fetchPurchaseHistorySummary(itemCode: string): Promise<PurchaseHistorySummary> {
  return apiRequest(`/api/v1/purchase-history/summary?itemCode=${encodeURIComponent(itemCode)}`, {
    headers: getHeaders(),
  });
}

// ─── F1: Inventory Check ──────────────────────────────────────────────────────

export interface InventoryCheckRow {
  prDetailId: string;
  itemCode: string;
  itemName: string;
  profile: string | null;
  grade: string | null;
  uom: string;
  reqQty: number;
  remainQty: number;
  toBuyQty: number;
  urgency: string;
  materialGroupCode: string | null;
  inventory: { onHandQty: number; allocatedQty: number; availableQty: number; warehouseLocation: string | null } | null;
  stockStatus: 'HAS_STOCK' | 'PARTIAL' | 'NO_STOCK';
  suggestedUseFromStock: number;
}

export interface InventoryCheckResult {
  prId: string;
  summary: { total: number; hasStock: number; partial: number; noStock: number };
  rows: InventoryCheckRow[];
}

export async function checkInventoryForPR(prId: string): Promise<InventoryCheckResult> {
  return apiRequest(`/api/v1/inventory/check?prId=${encodeURIComponent(prId)}`, {
    headers: getHeaders(),
  });
}

export interface StockImportRow {
  itemCode: string;
  itemName?: string;
  availableQty?: number;
  onHandQty?: number;
  uom?: string;
  warehouseLocation?: string;
}

export async function importStockData(
  rows: StockImportRow[],
  prId?: string
): Promise<{ upserted: number; errors: number; errorDetails: unknown[]; matchSummary: { total: number; exact: number; partial: number; none: number } | null }> {
  return apiRequest('/api/v1/inventory/import-stock', {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ rows, prId }),
  });
}

export async function bulkUpdateRemainQty(
  updates: Array<{ prDetailId: string; remainQty: number }>
): Promise<{ updated: number; results: Array<{ prDetailId: string; remainQty: number; toBuyQty: number }> }> {
  return apiRequest('/api/v1/inventory/pr-details/remain', {
    method: 'PATCH',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ updates }),
  });
}

// ─── F2: Tech Comments ────────────────────────────────────────────────────────

export interface TechCommentItem {
  id: string;
  content: string;
  commentType: string;
  threadStatus: string | null;
  tags: string | null;
  authorId: string | null;
  authorName: string;
  authorRole: string;
  createdAt: string;
  updatedAt: string;
}

export interface TechThreadRow {
  prDetailId: string;
  itemCode: string;
  itemName: string;
  profile: string | null;
  grade: string | null;
  uom: string;
  reqQty: number;
  toBuyQty: number;
  urgency: string;
  commentCount: number;
  threadStatus: string;
  latestComment: Pick<TechCommentItem, 'id' | 'content' | 'commentType' | 'authorName' | 'authorRole' | 'createdAt'> | null;
  comments: TechCommentItem[];
}

export interface TechThreadsResult {
  prId: string;
  summary: {
    total: number;
    pending: number;
    inDiscussion: number;
    clarified: number;
    substitutionRequested: number;
    approved: number;
    rejected: number;
    readyForRFQ: number;
  };
  rows: TechThreadRow[];
}

export async function fetchTechThreadsByPR(prId: string): Promise<TechThreadsResult> {
  return apiRequest(`/api/v1/tech-comments?prId=${encodeURIComponent(prId)}`, {
    headers: getHeaders(),
  });
}

export async function fetchTechThread(prDetailId: string): Promise<{ prDetailId: string; itemCode: string; itemName: string; comments: TechCommentItem[] }> {
  return apiRequest(`/api/v1/tech-comments/${prDetailId}`, {
    headers: getHeaders(),
  });
}

export async function addTechComment(
  prDetailId: string,
  data: { content: string; commentType?: string; threadStatus?: string; tags?: string }
): Promise<TechCommentItem> {
  return apiRequest(`/api/v1/tech-comments/${prDetailId}`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
}

export async function updateTechThreadStatus(
  prDetailId: string,
  data: { threadStatus: string; note?: string }
): Promise<{ success: boolean; newStatus: string; commentId: string }> {
  return apiRequest(`/api/v1/tech-comments/${prDetailId}/status`, {
    method: 'PATCH',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
}
