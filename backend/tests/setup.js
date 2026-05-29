// Vitest global setup — set NODE_ENV before app loads (skips listen + ensurePostgres)
process.env.NODE_ENV = 'test';
process.env.ALLOWED_ORIGINS =
  process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001';

// Required by app startup check; fall back to dev .env values if not in process.env yet.
if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
}
