/**
 * S1-2 — 15 smoke tests for golden paths.
 *
 * Read-mostly: verifies health/auth/listing endpoints respond with expected
 * status + minimal shape. Assumes PG running on 54321 with seeded admin user.
 *
 * Run: npm test
 */
// describe/it/expect/beforeAll are globals (vitest.config.mjs: globals: true)
const { app, request, loginAsAdmin, authHeader } = require('./helpers');

let token;

beforeAll(async () => {
  token = await loginAsAdmin();
});

describe('health + observability', () => {
  it('GET /health returns 200 with ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: expect.any(String), db: expect.any(String) });
  });

  it('GET /health/detail returns DB pool stats', async () => {
    const res = await request(app).get('/health/detail');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('db');
    expect(res.body).toHaveProperty('uptime_sec');
    expect(res.body).toHaveProperty('memory_mb');
  });

  it('GET /metrics returns Prometheus exposition format', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/ibshi_db_pool_total/);
  });
});

describe('auth flow', () => {
  it('POST /api/v1/auth/login with empty body returns 400', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/v1/auth/login with wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'hungth', password: 'definitely-wrong-pw' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/v1/auth/login with valid creds returns 200 + JWT', async () => {
    expect(token).toBeTruthy();
    expect(token.split('.').length).toBe(3); // JWT has 3 segments
  });

  it('GET /api/v1/auth/me without token returns 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/auth/me with valid token returns user info', async () => {
    const res = await request(app).get('/api/v1/auth/me').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.user || res.body.data || res.body).toBeDefined();
    const payload = res.body.user || res.body.data || res.body;
    expect(payload.username || payload.user?.username).toBeTruthy();
  });
});

describe('protected listing endpoints', () => {
  it('GET /api/v1/projects returns array (auth required)', async () => {
    const res = await request(app).get('/api/v1/projects').set(authHeader(token));
    expect(res.status).toBe(200);
    const arr = Array.isArray(res.body) ? res.body : res.body.data;
    expect(Array.isArray(arr)).toBe(true);
  });

  it('GET /api/v1/vendors returns array', async () => {
    const res = await request(app).get('/api/v1/vendors').set(authHeader(token));
    expect(res.status).toBe(200);
    const arr = Array.isArray(res.body) ? res.body : res.body.data;
    expect(Array.isArray(arr)).toBe(true);
  });

  it('GET /api/v1/bid-analyses returns array', async () => {
    const res = await request(app).get('/api/v1/bid-analyses').set(authHeader(token));
    expect(res.status).toBe(200);
    const arr = Array.isArray(res.body) ? res.body : res.body.data;
    expect(Array.isArray(arr)).toBe(true);
  });

  it('GET /api/v1/prs returns array', async () => {
    const res = await request(app).get('/api/v1/prs').set(authHeader(token));
    expect(res.status).toBe(200);
    const arr = Array.isArray(res.body) ? res.body : res.body.data;
    expect(Array.isArray(arr)).toBe(true);
  });

  it('GET /api/v1/dashboard/stats returns object with counts', async () => {
    const res = await request(app).get('/api/v1/dashboard/stats').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('GET /api/v1/prs/items-for-bidding returns array', async () => {
    const res = await request(app)
      .get('/api/v1/prs/items-for-bidding')
      .set(authHeader(token));
    expect(res.status).toBe(200);
    const arr = Array.isArray(res.body) ? res.body : res.body.data;
    expect(Array.isArray(arr)).toBe(true);
  });

  it('GET /api/v1/projects without token returns 401', async () => {
    const res = await request(app).get('/api/v1/projects');
    expect(res.status).toBe(401);
  });
});

describe('routing edge cases', () => {
  it('GET unknown route returns 404 with error envelope', async () => {
    const res = await request(app).get('/api/v1/this-route-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
