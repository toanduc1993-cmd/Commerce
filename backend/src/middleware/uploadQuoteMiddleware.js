const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Lưu file thật xuống disk (không dùng memoryStorage vì PDF có thể lớn)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const bidId = req.params.bidId || 'unknown';
    const dir = path.join(__dirname, '../../uploads/bid-quotes', bidId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // <timestamp>_<originalname> để không conflict
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safe = file.originalname.replace(/[^a-zA-Z0-9._\-À-ɏḀ-ỿ ]/g, '_');
    cb(null, `${ts}_${safe}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'application/vnd.ms-excel', // xls
    'application/pdf',
    'text/csv',
  ];
  if (allowed.includes(file.mimetype) || file.mimetype.includes('spreadsheetml') || file.mimetype.includes('excel')) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file Excel (.xlsx/.xls), PDF, hoặc CSV'));
  }
};

const uploadQuote = multer({
  storage,
  fileFilter,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
});

module.exports = uploadQuote;
