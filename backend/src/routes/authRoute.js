const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken, restrictTo } = require('../middleware/authMiddleware');
const { loginLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { loginSchema, changePasswordSchema, createUserSchema } = require('../lib/schemas/auth');
const { issueCsrfToken } = require('../middleware/csrfProtection');

// S2-1: CSRF token issuance — GET, no auth needed (FE gọi trước khi POST đầu tiên)
router.get('/csrf-token', issueCsrfToken);

// S2-2: Zod validate body on auth endpoints
router.post('/login', loginLimiter, validate({ body: loginSchema }), authController.login);
router.post('/logout', verifyToken, authController.logout);
router.get('/me', verifyToken, authController.me);
router.post(
  '/change-password',
  verifyToken,
  validate({ body: changePasswordSchema }),
  authController.changePassword
);
router.post(
  '/users',
  verifyToken,
  restrictTo('ADMIN'),
  validate({ body: createUserSchema }),
  authController.createUser
);

module.exports = router;
