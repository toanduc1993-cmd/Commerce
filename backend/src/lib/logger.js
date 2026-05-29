/**
 * src/lib/logger.js — Pino structured logger (S1-1)
 *
 * Replaces console.log/error scatter across 19 places.
 * Levels: trace / debug / info / warn / error / fatal
 *
 * Usage:
 *   const logger = require('../lib/logger');
 *   logger.info({ userId, action: 'LOGIN' }, 'User logged in');
 *   logger.error({ err, correlationId }, 'DB query failed');
 *
 * Child logger per-request (with correlationId) attached via middleware/correlationId.js → req.log
 *
 * Env vars:
 *   LOG_LEVEL    = trace | debug | info | warn | error (default: info)
 *   LOG_PRETTY   = 1 to use pino-pretty (dev only); production = ndjson to stdout
 *   LOG_FILE     = optional path to also write file (e.g. /var/log/ibshi/backend.log)
 */
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const PRETTY = process.env.LOG_PRETTY === '1' || (process.env.NODE_ENV !== 'production' && !process.env.LOG_FILE);
const LOG_FILE = process.env.LOG_FILE;

const targets = [];

if (PRETTY) {
  targets.push({
    target: 'pino-pretty',
    level: LEVEL,
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: false,
    },
  });
} else {
  targets.push({ target: 'pino/file', level: LEVEL, options: { destination: 1 } });
}

if (LOG_FILE) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    targets.push({
      target: 'pino/file',
      level: LEVEL,
      options: { destination: LOG_FILE, mkdir: true, sync: false },
    });
  } catch (e) {
    process.stderr.write(`[logger] Cannot init LOG_FILE=${LOG_FILE}: ${e.message}\n`);
  }
}

const transport = pino.transport({ targets });

const logger = pino(
  {
    level: LEVEL,
    base: {
      service: 'ibshi-backend',
      env: process.env.NODE_ENV || 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['password', '*.password', 'token', '*.token', 'authorization', '*.authorization', 'req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: (req) => ({
        method: req.method,
        url: req.url,
        ip: req.ip,
        userId: req.user?.id,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  },
  transport
);

module.exports = logger;
