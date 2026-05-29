// S2-1: CSRF Double-Submit Cookie pattern via csrf-csrf
// - CSRF secret cookie httpOnly + sameSite=strict (signed)
// - Client mirrors token in X-CSRF-Token header on mutating requests
// - GET/HEAD/OPTIONS are exempt by default
const { doubleCsrf } = require('csrf-csrf');
const logger = require('../lib/logger');

const isProd = process.env.NODE_ENV === 'production';
const csrfSecret =
  process.env.CSRF_SECRET || process.env.JWT_SECRET || 'CHANGE_ME_LOCAL_DEV_ONLY';

if (csrfSecret === 'CHANGE_ME_LOCAL_DEV_ONLY') {
  logger.warn('CSRF_SECRET chưa được cấu hình — đang dùng giá trị dev mặc định.');
}

// Session identifier: bám theo phiên đăng nhập (cookie ibshi_session) nếu có,
// fallback dùng IP để vẫn hoạt động cho khách chưa login (login form cần token).
function getSessionIdentifier(req) {
  return req.cookies?.ibshi_session || req.ip || 'anon';
}

const csrf = doubleCsrf({
  getSecret: () => csrfSecret,
  getSessionIdentifier,
  cookieName: isProd ? '__Host-ibshi_csrf' : 'ibshi_csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: isProd ? 'strict' : 'lax',
    secure: isProd,
    path: '/',
  },
  size: 64,
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

// Endpoint handler: cấp token cho FE đọc + lưu vào ibshi_csrf cookie (httpOnly secret).
function issueCsrfToken(req, res) {
  const token = csrf.generateCsrfToken(req, res);
  res.status(200).json({ success: true, csrfToken: token });
}

// Wrap middleware để trả 403 JSON thay vì throw
function csrfProtection(req, res, next) {
  csrf.doubleCsrfProtection(req, res, (err) => {
    if (err) {
      const isCsrfErr = err.code === 'EBADCSRFTOKEN' || err === csrf.invalidCsrfTokenError;
      if (isCsrfErr) {
        return res.status(403).json({
          success: false,
          error: 'CSRF token không hợp lệ hoặc thiếu. Gọi /api/v1/auth/csrf-token để lấy token mới.',
        });
      }
      return next(err);
    }
    next();
  });
}

module.exports = { csrfProtection, issueCsrfToken, generateCsrfToken: csrf.generateCsrfToken };
