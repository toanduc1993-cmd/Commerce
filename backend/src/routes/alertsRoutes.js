/**
 * routes/alertsRoutes.js — F04 Alert Center
 * 3 endpoints, all behind verifyToken.
 */
const express = require('express');
const { verifyToken } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const {
  alertFilterSchema,
  resolveBodySchema,
  canonicalKeyParam,
} = require('../lib/schemas/alerts');
const {
  listAlerts,
  resolveAlert,
  unresolveAlert,
} = require('../controllers/alertsController');

const router = express.Router();

router.get('/', verifyToken, validate({ query: alertFilterSchema }), listAlerts);

router.post(
  '/:canonicalKey/resolve',
  verifyToken,
  validate({ params: canonicalKeyParam, body: resolveBodySchema }),
  resolveAlert
);

router.post(
  '/:canonicalKey/unresolve',
  verifyToken,
  validate({ params: canonicalKeyParam }),
  unresolveAlert
);

module.exports = router;
