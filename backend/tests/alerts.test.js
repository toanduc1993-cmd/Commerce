/**
 * F04 Alert Center — 4 backend tests per spec section "Test cases".
 *
 * Pre-req: PG running on 54321 + admin user 'hungth/123456'.
 * Tests run sequentially (singleFork) — describe block uses a known canonical_key
 * "002" from the JSON snapshot and cleans up after.
 */
const { app, request, loginAsAdmin, authHeader } = require('./helpers');

const TEST_KEY = '002'; // exists in reconciliation snapshot with flag CHƯA_XUẤT_HĐ

let token;

beforeAll(async () => {
  token = await loginAsAdmin();
  // Ensure clean slate for TEST_KEY
  await request(app)
    .post(`/api/v1/alerts/${TEST_KEY}/unresolve`)
    .set(authHeader(token));
});

afterAll(async () => {
  // Cleanup
  await request(app)
    .post(`/api/v1/alerts/${TEST_KEY}/unresolve`)
    .set(authHeader(token));
});

describe('F04 alertsController', () => {
  it('GET /alerts returns 79 flagged records with 3-bucket summary', async () => {
    const res = await request(app)
      .get('/api/v1/alerts?resolved=false')
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.summary).toMatchObject({
      high: 28,
      medium: 44,
      low: 7,
      totalFlagged: 79,
    });
    // Records returned (with resolved=false filter) should equal totalFlagged - totalResolved
    expect(res.body.data.length).toBe(
      res.body.summary.totalFlagged - res.body.summary.totalResolved
    );
  });

  it('GET /alerts?severity=HIGH returns only ORPHAN_INVOICE alerts (28)', async () => {
    const res = await request(app)
      .get('/api/v1/alerts?severity=HIGH&resolved=false')
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(28);
    for (const r of res.body.data) {
      expect(r.severity).toBe('HIGH');
      expect(r.flags).toContain('ORPHAN_INVOICE');
    }
  });

  it('POST /alerts/:key/resolve creates AlertResolution row', async () => {
    const res = await request(app)
      .post(`/api/v1/alerts/${TEST_KEY}/resolve`)
      .set(authHeader(token))
      .send({ note: 'F04 test resolve' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.canonical_key).toBe(TEST_KEY);
    expect(res.body.data.resolved_at).toBeTruthy();
    expect(res.body.data.resolved_by).toBeTruthy();

    // Verify it shows up as resolved on subsequent GET
    const check = await request(app)
      .get('/api/v1/alerts?resolved=true')
      .set(authHeader(token));
    const row = check.body.data.find((r) => r.canonical_key === TEST_KEY);
    expect(row).toBeTruthy();
    expect(row.resolved).toBe(true);
    expect(row.resolved_note).toBe('F04 test resolve');
  });

  it('POST /alerts/:key/resolve twice is idempotent (updates note)', async () => {
    const r1 = await request(app)
      .post(`/api/v1/alerts/${TEST_KEY}/resolve`)
      .set(authHeader(token))
      .send({ note: 'first' });
    expect(r1.status).toBe(200);
    const r2 = await request(app)
      .post(`/api/v1/alerts/${TEST_KEY}/resolve`)
      .set(authHeader(token))
      .send({ note: 'second' });
    expect(r2.status).toBe(200);
    expect(r2.body.data.note).toBe('second');

    // GET back: still 1 row, with note='second'
    const check = await request(app)
      .get('/api/v1/alerts?resolved=true')
      .set(authHeader(token));
    const matches = check.body.data.filter((r) => r.canonical_key === TEST_KEY);
    expect(matches.length).toBe(1);
    expect(matches[0].resolved_note).toBe('second');
  });
});
