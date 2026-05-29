/**
 * middleware/validate.js — S2-2: Zod validation middleware (risk H9 fix)
 *
 * Usage:
 *   const { validate } = require('../middleware/validate');
 *   const { loginSchema } = require('../lib/schemas/auth');
 *   router.post('/login', validate({ body: loginSchema }), authController.login);
 *
 * Validates req.body / req.query / req.params against Zod schemas.
 * On failure → 400 with field-level errors (no more 500).
 *
 * Skips bodies with multipart/form-data (multer handles those separately).
 */
const logger = require('../lib/logger');

function validate(schemas) {
  return (req, res, next) => {
    try {
      // Skip multipart — multer pre-processes
      const ct = req.headers['content-type'] || '';
      const skipBody = ct.startsWith('multipart/form-data');

      if (schemas.body && !skipBody) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: 'Dữ liệu gửi lên không hợp lệ',
            fields: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
              code: i.code,
            })),
            correlationId: req.correlationId,
          });
        }
        req.body = result.data;
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: 'Query string không hợp lệ',
            fields: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
            correlationId: req.correlationId,
          });
        }
        req.query = result.data;
      }

      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: 'Tham số URL không hợp lệ',
            fields: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
            correlationId: req.correlationId,
          });
        }
        req.params = result.data;
      }

      next();
    } catch (err) {
      (req.log || logger).error({ err, op: 'validate' }, 'Validation middleware crashed');
      next(err);
    }
  };
}

module.exports = { validate };
