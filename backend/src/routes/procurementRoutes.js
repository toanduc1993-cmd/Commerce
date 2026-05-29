const express = require('express');
const multer = require('multer');
const {
  generateRFQ,
  compareBids,
  submitQuotation,
  selectWinner,
} = require('../controllers/biddingController');
const {
  generatePO,
  receiveMaterial,
  allocateStock,
  confirmQC,
  updateClarificationFlag,
} = require('../controllers/poController');
const {
  getFabAllocations,
  getFabAllocationsForDetail,
  saveFabAllocations,
  clearFabAllocations,
  getProjectFabCategories,
} = require('../controllers/fabAllocationController');
const {
  listProjects,
  listVendors,
  listPOs,
  listGRNs,
  listInventory,
  listMaterialCatalog,
  dashboardStats,
} = require('../controllers/listController');
const {
  uploadBidAnalyses,
  listBidAnalyses,
  getBidAnalysisDetail,
  selectVendor,
  selectItemVendor,
  getApprovalSummary,
  downloadSourceFile,
  listItemsForBidding,
  previewBidCode,
  createBidFromPR,
  createBidFromPRBulkByGroup,
  exportRfqImportTemplate,
  importRfqBatch,
  enterVendorQuote,
  cancelBidAnalysis,
  exportRfqExcel,
  createPoFromBid,
} = require('../controllers/bidAnalysisController');
const {
  uploadPaymentSchedules,
  listPaymentSchedules,
  updatePaymentStatus,
} = require('../controllers/paymentScheduleController');
const { listContracts, getContractDetail } = require('../controllers/contractController');
const {
  listArrivals,
  getArrivalStats,
  updateArrival,
  addInspection,
  updateInspection,
  deleteInspection,
} = require('../controllers/arrivalsController');
const {
  setSelectionMode,
  upsertGroupSelection,
  listGroupSelections,
  autoSelectMinPrice,
  scoreVendor,
  listVendorScores,
} = require('../controllers/bidSelectionModeController');
const {
  uploadQuote,
  confirmQuoteUpload,
  listQuoteFiles,
} = require('../controllers/bidQuoteUploadController');
const uploadQuoteMiddleware = require('../middleware/uploadQuoteMiddleware');
const {
  listVendorsMaster,
  getVendorMaster,
  createVendor,
  updateVendor,
  deleteVendor,
  seedVendorsFromHistory,
} = require('../controllers/vendorController');
const { verifyToken, restrictTo } = require('../middleware/authMiddleware');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

// ─── Module 2: Đấu thầu / Bidding ─────────────────────────────────────────────
router.post('/rfq/generate', verifyToken, generateRFQ);
router.get('/bids/:prId/analysis-matrix', verifyToken, compareBids);
router.post('/bids/vendor-portal', verifyToken, submitQuotation);
router.post('/bids/:bidId/select-winner', verifyToken, restrictTo('BOD', 'ADMIN'), selectWinner);

// ─── Module 3: Mua sắm / PO & Receipt ─────────────────────────────────────────
router.post('/pos/generate', verifyToken, generatePO);
router.post('/receipts/receive', verifyToken, receiveMaterial);
router.post('/receipts/qc-confirm', verifyToken, restrictTo('QC', 'WAREHOUSE', 'ADMIN'), confirmQC);
router.post(
  '/inventory/peg',
  verifyToken,
  restrictTo('WAREHOUSE', 'MUA_HANG', 'ADMIN'),
  allocateStock
);
router.put('/clarification/flag', verifyToken, updateClarificationFlag);

// ─── Module 5: Fab Allocations (Phân bổ hạng mục gia công) ───────────────────
// Hạng mục gia công của project
router.get('/projects/:projectId/fab-categories', verifyToken, getProjectFabCategories);

// Phân bổ cho toàn bộ PR
router.get('/prs/:prId/fab-allocations', verifyToken, getFabAllocations);

// Phân bổ cho từng PrDetail
router.get('/prs/details/:prDetailId/fab-allocations', verifyToken, getFabAllocationsForDetail);
router.post('/prs/details/:prDetailId/fab-allocations', verifyToken, saveFabAllocations);
router.delete(
  '/prs/details/:prDetailId/fab-allocations',
  verifyToken,
  restrictTo('KY_THUAT', 'MUA_HANG', 'ADMIN'),
  clearFabAllocations
);

// ─── Module 6: List endpoints (read-only) cho dashboard, projects, vendors, ... ──
router.get('/projects', verifyToken, listProjects);
router.get('/vendors', verifyToken, listVendors);
router.get('/pos', verifyToken, listPOs);
router.get('/grns', verifyToken, listGRNs);
router.get('/inventory', verifyToken, listInventory);
router.get('/material-catalog', verifyToken, listMaterialCatalog);
router.get('/dashboard/stats', verifyToken, dashboardStats);

// ─── Module 2/3: Bid Analyses (Báo giá + So sánh) ────────────────────────────
router.post(
  '/bid-analyses/upload',
  uploadLimiter,
  verifyToken,
  upload.single('file'),
  uploadBidAnalyses
);
router.get('/bid-analyses', verifyToken, listBidAnalyses);
// ─── B-CPVT-018: Smart Bidcode v2 — create from PR items ─────
router.get('/prs/items-for-bidding', verifyToken, listItemsForBidding);
router.get('/bid-analyses/preview-bidcode', verifyToken, previewBidCode);
router.post('/bid-analyses/from-pr', verifyToken, createBidFromPR);
// ─── Sprint M4 Task A — Tạo N BID gom theo Nhóm VT ────────────
router.post('/bid-analyses/from-pr-bulk-by-group', verifyToken, createBidFromPRBulkByGroup);
// ─── Sprint M4 Task E — Import Excel batch ─────────────────────
router.get('/prs/items-for-bidding/export-template', verifyToken, exportRfqImportTemplate);
router.post(
  '/bid-analyses/import-rfq-batch',
  uploadLimiter,
  verifyToken,
  upload.single('file'),
  importRfqBatch
);
// ─── End B-CPVT-018 ──────────────────────────────────────────
router.get('/bid-analyses/:id', verifyToken, getBidAnalysisDetail);
router.get('/bid-analyses/:id/download', verifyToken, downloadSourceFile);
router.get('/bid-analyses/:id/approval-summary', verifyToken, getApprovalSummary);
router.post('/bid-analyses/:id/select-vendor', verifyToken, selectVendor);
router.patch(
  '/bid-analyses/:bidId/items/:itemId/select-vendor',
  verifyToken,
  selectItemVendor
);
// Workflow Bước 3 — nhập báo giá NCC thủ công (qualitySource=MANUAL)
router.post('/bid-analyses/:bidId/quotes', verifyToken, enterVendorQuote);
// Workflow Bước 3 — upload file báo giá NCC (Excel/PDF), parse giá + lưu file
router.post(
  '/bid-analyses/:bidId/upload-quote',
  uploadLimiter,
  verifyToken,
  uploadQuoteMiddleware.single('file'),
  uploadQuote
);
router.post('/bid-analyses/:bidId/confirm-quote-upload', verifyToken, confirmQuoteUpload);
router.get('/bid-analyses/:bidId/quote-files', verifyToken, listQuoteFiles);
// Workflow Bước 2 — huỷ RFQ (revert PrDetail.statusFlag về 'Chờ báo giá')
router.delete('/bid-analyses/:id', verifyToken, cancelBidAnalysis);
// Workflow Bước 2 — export RFQ Excel theo template (sheet BID ANALYSIS + RFQ Log)
router.get('/bid-analyses/:id/export-rfq', verifyToken, exportRfqExcel);
// Workflow Bước 5 → Bước 6 — tạo PO từ BID đã duyệt NCC (group items theo vendor)
router.post('/bid-analyses/:id/create-po', verifyToken, createPoFromBid);

// ─── F-BID-A Phase A v3: 5 selection modes ───────────────────────────────────
router.patch('/bid-analyses/:id/selection-mode', verifyToken, setSelectionMode);
router.post('/bid-analyses/:id/group-selection', verifyToken, upsertGroupSelection);
router.get('/bid-analyses/:id/group-selections', verifyToken, listGroupSelections);
router.post('/bid-analyses/:id/auto-select-min-price', verifyToken, autoSelectMinPrice);
router.post('/bid-analyses/:id/vendor-scores', verifyToken, scoreVendor);
router.get('/bid-analyses/:id/vendor-scores', verifyToken, listVendorScores);

// ─── Module 4: Contracts ─────────────────────────────────────────────────────
router.get('/contracts', verifyToken, listContracts);
router.get('/contracts/:contractNo', verifyToken, getContractDetail);

// ─── Module 5: Payment Schedules ─────────────────────────────────────────────
router.post(
  '/payment-schedules/upload',
  uploadLimiter,
  verifyToken,
  upload.single('file'),
  uploadPaymentSchedules
);
router.get('/payment-schedules', verifyToken, listPaymentSchedules);
router.patch('/payment-schedules/:id', verifyToken, updatePaymentStatus);

// ─── Module 7: Arrivals (Hàng về kho + QC) ───────────────────────────────────
router.get('/arrivals', verifyToken, listArrivals);
router.get('/arrivals/stats', verifyToken, getArrivalStats);
router.patch('/arrivals/:id', verifyToken, updateArrival);
router.post('/arrivals/:id/inspections', verifyToken, addInspection);
router.patch('/arrivals/inspections/:id', verifyToken, updateInspection);
router.delete('/arrivals/inspections/:id', verifyToken, deleteInspection);

// ─── Module 6: Vendor Master (full CRUD) ─────────────────────────────────────
router.get('/vendor-master', verifyToken, listVendorsMaster);
router.post('/vendor-master/seed', verifyToken, restrictTo('ADMIN'), seedVendorsFromHistory);
router.get('/vendor-master/:id', verifyToken, getVendorMaster);
router.post('/vendor-master', verifyToken, createVendor);
router.patch('/vendor-master/:id', verifyToken, updateVendor);
router.delete('/vendor-master/:id', verifyToken, deleteVendor);

// ─── Admin ────────────────────────────────────────────────────────────────────
const authCtrl = require('../controllers/authController');
router.post('/admin/users', verifyToken, restrictTo('ADMIN'), authCtrl.createUser);

module.exports = router;
