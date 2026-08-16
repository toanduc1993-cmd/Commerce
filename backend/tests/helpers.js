const request = require('supertest');
const app = require('../src/app');

const ADMIN_USER = process.env.TEST_ADMIN_USER || 'hungth';
const ADMIN_PASS = process.env.TEST_ADMIN_PASS || '123456';

let cachedToken = null;

async function loginAsAdmin() {
  if (cachedToken) return cachedToken;
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: ADMIN_USER, password: ADMIN_PASS });
  if (res.status !== 200 || !res.body.token) {
    throw new Error(
      `loginAsAdmin failed: status=${res.status} body=${JSON.stringify(res.body)}`
    );
  }
  cachedToken = res.body.token;
  return cachedToken;
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

// S2-1: request mutating (POST/PUT/PATCH/DELETE) đi qua csrfProtection nên phải
// giữ cookie ibshi_session + ibshi_csrf và gửi kèm header X-CSRF-Token.
// Token bám theo session identifier = cookie ibshi_session → phải login TRƯỚC rồi mới xin token.
async function adminAgent() {
  const agent = request.agent(app);
  const login = await agent
    .post('/api/v1/auth/login')
    .send({ username: ADMIN_USER, password: ADMIN_PASS });
  if (login.status !== 200 || !login.body.token) {
    throw new Error(
      `adminAgent login failed: status=${login.status} body=${JSON.stringify(login.body)}`
    );
  }
  const csrf = await agent.get('/api/v1/auth/csrf-token');
  if (csrf.status !== 200 || !csrf.body.csrfToken) {
    throw new Error(
      `adminAgent csrf-token failed: status=${csrf.status} body=${JSON.stringify(csrf.body)}`
    );
  }
  agent.jwt = login.body.token;
  agent.csrfToken = csrf.body.csrfToken;
  return agent;
}

// Header đầy đủ cho request mutating: JWT + CSRF token.
function mutateHeader(agent) {
  return { Authorization: `Bearer ${agent.jwt}`, 'X-CSRF-Token': agent.csrfToken };
}

module.exports = {
  app,
  request,
  loginAsAdmin,
  authHeader,
  adminAgent,
  mutateHeader,
  ADMIN_USER,
  ADMIN_PASS,
};
