/**
 * middleware/correlationId.js — Attach correlation ID + child logger per request (S1-1)
 *
 * Sets:
 *   req.correlationId — UUID-like id from header `x-correlation-id` or auto-generated
 *   req.log           — child logger with { correlationId, method, path }
 *   res header        — `x-correlation-id` so client can include in support tickets
 *
 * Use in controllers:
 *   req.log.info({ entityId }, 'Created');
 *   req.log.error({ err }, 'Operation failed');
 */
const { nanoid } = require('nanoid');
const logger = require('../lib/logger');

function correlationId(req, res, next) {
  const id = req.headers['x-correlation-id'] || nanoid(12);
  req.correlationId = id;
  req.log = logger.child({
    correlationId: id,
    method: req.method,
    path: req.path,
  });
  res.setHeader('x-correlation-id', id);
  next();
}

module.exports = correlationId;
