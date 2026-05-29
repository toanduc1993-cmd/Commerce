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

module.exports = { app, request, loginAsAdmin, authHeader, ADMIN_USER, ADMIN_PASS };
