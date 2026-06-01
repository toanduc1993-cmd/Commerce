// MUST be first line — load env vars before anything else
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const logger = require('./lib/logger');
const correlationId = require('./middleware/correlationId');
const { csrfProtection } = require('./middleware/csrfProtection');

// ─── Startup security check ───────────────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  logger.fatal({ missing }, 'Thiếu biến môi trường bắt buộc');
  process.exit(1);
}

if (process.env.JWT_SECRET === 'SIEU_GAP_SECRET_KEY') {
  logger.warn('Đang dùng JWT_SECRET mặc định không an toàn!');
}

// S4-1 (2026-05-28): Bỏ ensurePostgres() auto-start qua embedded-postgres BETA.
// Lý do: dependency BETA (18.3.0-beta.16) không đủ stable cho production. Thay bằng:
//   - Dev: Homebrew postgres@18 (Rule #4 — user start manual trong terminal)
//   - Dev khác: docker-compose -f docker-compose.dev.yml up postgres
//   - Prod: docker-compose.yml (postgres:17-alpine)
// Backend KHÔNG còn tự start DB — nếu Pool kết nối fail thì trả 503 + log instruction.

// ─── Singleton DB pool for /health (S2-3 fix H8 — KHÔNG tạo Pool mỗi request) ─
const { Pool } = require('pg');
const healthPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 2000,
  max: 5,
  idleTimeoutMillis: 30000,
});
healthPool.on('error', (err) => logger.error({ err }, 'healthPool background error'));

const importRoutes = require('./routes/importRoutes');
const authRoutes = require('./routes/authRoute');
const { apiLimiter, uploadLimiter } = require('./middleware/rateLimiter');

const app = express();

// ─── Trust proxy (cho Nginx reverse proxy) ───────────────────────────────────
// Cần thiết để express-rate-limit đọc đúng X-Forwarded-For IP
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

// ─── Security headers (Helmet với CSP strict) ────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind cần inline
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false, // tránh block upload file
    referrerPolicy: { policy: 'same-origin' },
    hsts:
      process.env.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: Origin ${origin} không được phép.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(process.env.JWT_SECRET));

// Correlation ID middleware — must be BEFORE morgan/routes (S1-1)
app.use(correlationId);

if (process.env.NODE_ENV !== 'test') {
  // Pipe morgan into pino: morgan format → logger.info()
  app.use(
    morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
      stream: { write: (msg) => logger.info(msg.trim()) },
    })
  );
}

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ─── Health check — singleton pool, no leak (S2-3 fix H8) ────────────────────
app.get('/health', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    const client = await healthPool.connect();
    client.release();
    dbStatus = 'connected';
  } catch (_) {
    dbStatus = 'disconnected';
  }
  res.status(200).json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    db: dbStatus,
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// ─── Detailed health (S1-3) — DB pool stats, uptime, memory, disk ────────────
app.get('/health/detail', async (req, res) => {
  const fs = require('fs');
  let dbStatus = 'unknown';
  let dbPoolStats = null;
  try {
    const client = await healthPool.connect();
    client.release();
    dbStatus = 'connected';
    dbPoolStats = {
      total: healthPool.totalCount,
      idle: healthPool.idleCount,
      waiting: healthPool.waitingCount,
    };
  } catch (_) {
    dbStatus = 'disconnected';
  }

  let diskInfo = null;
  try {
    const uploadsDir = path.join(__dirname, '../uploads');
    const stats = fs.statfsSync ? fs.statfsSync(uploadsDir) : null;
    if (stats) {
      diskInfo = {
        free_mb: Math.round((stats.bavail * stats.bsize) / 1024 / 1024),
        total_mb: Math.round((stats.blocks * stats.bsize) / 1024 / 1024),
        pct_used: Math.round((1 - stats.bavail / stats.blocks) * 100),
      };
    }
  } catch (_) {
    /* statfsSync not available */
  }

  const mem = process.memoryUsage();
  res.status(200).json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    db: { status: dbStatus, pool: dbPoolStats },
    uptime_sec: Math.round(process.uptime()),
    memory_mb: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heap_used: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total: Math.round(mem.heapTotal / 1024 / 1024),
    },
    disk: diskInfo,
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// ─── /metrics — Prometheus text exposition (S1-3) ───────────────────────────
app.get('/metrics', async (req, res) => {
  const mem = process.memoryUsage();
  const lines = [
    `# HELP ibshi_db_pool_total Total connections in pool`,
    `# TYPE ibshi_db_pool_total gauge`,
    `ibshi_db_pool_total ${healthPool.totalCount}`,
    `# HELP ibshi_db_pool_idle Idle connections in pool`,
    `# TYPE ibshi_db_pool_idle gauge`,
    `ibshi_db_pool_idle ${healthPool.idleCount}`,
    `# HELP ibshi_db_pool_waiting Pending connection acquisitions`,
    `# TYPE ibshi_db_pool_waiting gauge`,
    `ibshi_db_pool_waiting ${healthPool.waitingCount}`,
    `# HELP ibshi_process_uptime_seconds Process uptime`,
    `# TYPE ibshi_process_uptime_seconds counter`,
    `ibshi_process_uptime_seconds ${Math.round(process.uptime())}`,
    `# HELP ibshi_memory_rss_bytes Resident set size`,
    `# TYPE ibshi_memory_rss_bytes gauge`,
    `ibshi_memory_rss_bytes ${mem.rss}`,
  ];
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(lines.join('\n') + '\n');
});

// ─── Global API rate limit ───────────────────────────────────────────────────
app.use('/api/', apiLimiter);

// ─── CSRF protection (S2-1) ──────────────────────────────────────────────────
// Skip cho: token-issue endpoint, login (pre-auth), client-errors reporter.
// csrf-csrf đã ignore GET/HEAD/OPTIONS mặc định, FE chỉ cần header trên mutating.
// req.path khi mount tại '/api/v1' → chỉ còn phần sau prefix, vd '/auth/login'
const CSRF_SKIP_PATHS = new Set([
  '/auth/login',
  '/auth/csrf-token',
  '/client-errors',
]);
app.use('/api/v1', (req, res, next) => {
  if (CSRF_SKIP_PATHS.has(req.path)) return next();
  return csrfProtection(req, res, next);
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', importRoutes);
app.use('/api/v1', require('./routes/procurementRoutes'));
// F04 Alert Center
app.use('/api/v1/alerts', require('./routes/alertsRoutes'));

// S1-4: Frontend ErrorBoundary reporter (no auth — errors may pre-date login)
app.post('/api/v1/client-errors', require('./controllers/clientErrorsController').report);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} không tồn tại.` });
});

// ─── Global error handler — KHÔNG lộ Prisma internals ra client ──────────────
app.use((err, req, res, next) => {
  // CORS error
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ success: false, error: err.message });
  }

  // Multer file filter error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: 'File quá lớn. Giới hạn 15MB.' });
  }
  if (err.message && err.message.includes('Sai định dạng')) {
    return res.status(400).json({ success: false, error: err.message });
  }

  // Phân loại lỗi Prisma — trả message thân thiện, KHÔNG lộ raw Prisma error
  const msg = err.message || '';
  const meta = err.meta || {};

  let userMessage = 'Lỗi hệ thống nội bộ. Vui lòng thử lại.';
  let statusCode = 500;

  if (
    msg.includes("Can't reach database") ||
    msg.includes('DatabaseNotReachable') ||
    meta?.driverAdapterError?.cause?.kind === 'DatabaseNotReachable'
  ) {
    userMessage =
      'Không kết nối được cơ sở dữ liệu. Vui lòng start PostgreSQL (xem DEVOPS_NOTES §2.5.2) rồi thử lại.';
    statusCode = 503;
  } else if (msg.includes('Invalid `prisma.') || msg.includes('invocation')) {
    (req.log || logger).error({ prismaError: msg.slice(0, 500) }, 'Prisma invocation error');
    userMessage = 'Lỗi cấu trúc dữ liệu khi lưu vào DB. Kiểm tra log server.';
    statusCode = 422;
  } else if (msg.includes('Unique constraint') || msg.includes('unique')) {
    userMessage = 'Dữ liệu bị trùng lặp. Vui lòng kiểm tra lại.';
    statusCode = 409;
  } else if (msg.includes('Foreign key constraint')) {
    userMessage =
      'Dữ liệu tham chiếu không hợp lệ (foreign key). Vui lòng kiểm tra project/PR tồn tại.';
    statusCode = 422;
  }

  (req.log || logger).error(
    { statusCode, err: msg.slice(0, 300), method: req.method, path: req.path },
    'System error'
  );

  res.status(statusCode).json({
    success: false,
    error: userMessage,
    correlationId: req.correlationId,
    ...(process.env.NODE_ENV !== 'production' && { debug: msg.slice(0, 200) }),
  });
});

// ─── Start server với auto-start PG ──────────────────────────────────────────
const PORT = process.env.PORT || 5005;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info({ port: PORT, origins: allowedOrigins }, 'IBS Procurement backend started');
    // Sanity probe DB connection without auto-start (S4-1)
    healthPool
      .connect()
      .then((client) => {
        client.release();
        logger.info('PostgreSQL connection OK');
      })
      .catch((err) => {
        logger.warn(
          {
            err: err.message?.slice(0, 200),
            hint: 'Start PG via Homebrew (Rule #4) hoặc docker-compose.dev.yml',
          },
          'PostgreSQL chưa kết nối — backend đã start nhưng request DB sẽ trả 503'
        );
      });
  });
}

module.exports = app;
