// M4.1 & M4.2 - Module 4: Quality & Storage (Upload Hồ sơ CO/CQ)
const fs = require('fs');
const path = require('path');

const uploadCertificates = async (req, res, next) => {
  try {
    // req.file sẽ được populate bởi middleware multer
    if (!req.file) {
      return res
        .status(400)
        .json({ error: 'Vui lòng đính kèm file PDF/Ảnh chứng chỉ (CO/CQ/MTR).' });
    }

    const { poNumber = 'PO_UNKNOWN', itemCode = 'ITEM_UNKNOWN' } = req.body;

    // P3.2 Thay AWS S3 bằng FS nội bộ
    const uploadDir = path.join(__dirname, '../../uploads/certificates', poNumber);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const safeFilename = `${itemCode}_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(uploadDir, safeFilename);

    // Ghi file từ RAM buffer xuống ổ cứng vật lý
    fs.writeFileSync(filePath, req.file.buffer);

    const localUrl = `/uploads/certificates/${poNumber}/${safeFilename}`;

    res.status(200).json({
      success: true,
      message: `[Module 4] Đã upload chứng chỉ an toàn (Lưu vật lý tại Server LAN) cho mã ${itemCode}.`,
      file_name: req.file.originalname,
      cloud_url: localUrl,
      status: 'Lưu trữ dài hạn (Kiểm định CĐT)',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { uploadCertificates };
