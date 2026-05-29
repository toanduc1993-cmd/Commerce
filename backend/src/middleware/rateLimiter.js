/**
 * rateLimiter.js — Rate limiting middleware cho các endpoint nhạy cảm
 *
 * - loginLimiter: 5 lần / 15 phút / IP (chống brute-force login)
 * - apiLimiter:   200 req / phút / IP (chống abuse API)
 * - uploadLimiter: 20 upload / 10 phút / IP (chống spam upload file lớn)
 */

const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau 15 phút.',
  },
  // skipSuccessfulRequests: true — chỉ đếm lần sai
  skipSuccessfulRequests: true,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Vượt quá giới hạn request. Vui lòng thử lại sau 1 phút.',
  },
});

const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Vượt quá giới hạn upload file. Vui lòng thử lại sau 10 phút.',
  },
});

module.exports = { loginLimiter, apiLimiter, uploadLimiter };
