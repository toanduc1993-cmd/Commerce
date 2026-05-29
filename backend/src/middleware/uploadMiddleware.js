const multer = require('multer');

// Chúng ta dùng mêmoryStorage để không lưu file rác xuống ổ cứng tạm mà Parse trực tiếp File Buffer trên RAM
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Chấp nhận CSV và Excel (Mimetype cơ bản)
  if (
    file.mimetype.includes('csv') ||
    file.mimetype.includes('excel') ||
    file.mimetype.includes('spreadsheetml')
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        'Sai định dạng! Hệ thống chỉ hỗ trợ upload tệp CSV hoặc Excel. Dữ liệu từ phòng ban khác đang gửi sai.'
      )
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // Capped at 15MB cho file PR lớn nhất
});

module.exports = upload;
