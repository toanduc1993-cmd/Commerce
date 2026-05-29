/**
 * controllers/clientErrorsController.js — S1-4: Receive frontend ErrorBoundary reports
 *
 * POST /api/v1/client-errors  (no auth — errors may happen before login)
 * Body: { scope, message, stack, componentStack, url, userAgent, timestamp }
 *
 * Storage: append-only NDJSON file at backend/errors/client_YYYYMMDD.jsonl
 * Rate limited via apiLimiter at app level (200/min/IP).
 */
const path = require('path');
const fs = require('fs');
const logger = require('../lib/logger');

const ERRORS_DIR = path.join(__dirname, '../../errors');

function ensureDir() {
  try {
    fs.mkdirSync(ERRORS_DIR, { recursive: true });
  } catch (e) {
    logger.error({ err: e }, 'Cannot create errors directory');
  }
}
ensureDir();

exports.report = (req, res) => {
  try {
    const body = req.body || {};
    const safe = {
      receivedAt: new Date().toISOString(),
      correlationId: req.correlationId,
      ip: req.ip,
      scope: String(body.scope || 'unknown').slice(0, 100),
      message: String(body.message || '').slice(0, 500),
      stack: String(body.stack || '').slice(0, 2000),
      componentStack: String(body.componentStack || '').slice(0, 2000),
      url: String(body.url || '').slice(0, 500),
      userAgent: String(body.userAgent || '').slice(0, 300),
      clientTimestamp: String(body.timestamp || '').slice(0, 30),
    };

    // Log to pino for tail-able visibility
    (req.log || logger).warn({ clientError: safe }, 'Frontend error reported');

    // Append to daily file
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const file = path.join(ERRORS_DIR, `client_${day}.jsonl`);
    fs.appendFile(file, JSON.stringify(safe) + '\n', (err) => {
      if (err) (req.log || logger).error({ err }, 'Cannot append client error');
    });

    res.status(204).end();
  } catch (e) {
    (req.log || logger).error({ err: e, op: 'reportClientError' }, 'Crashed receiving error');
    res.status(204).end(); // never throw back to client
  }
};
