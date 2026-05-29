const express = require('express');
const upload = require('../middleware/uploadMiddleware');
const { importPR, getListPRs } = require('../controllers/prImportController');
const {
  updateProcurementStatus,
} = require('../controllers/procurementUpdateController');
const { verifyToken } = require('../middleware/authMiddleware');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Import file PR (xlsx/csv) — tạo PrDetail mới
router.post('/prs/import', uploadLimiter, verifyToken, upload.single('file'), importPR);

// Cập nhật tình trạng mua sắm từ file Excel "Theo dõi dự án"
router.post(
  '/prs/update-procurement',
  uploadLimiter,
  verifyToken,
  upload.single('file'),
  updateProcurementStatus
);

// Lấy danh sách PR (GET)
router.get('/prs', verifyToken, getListPRs);

module.exports = router;
