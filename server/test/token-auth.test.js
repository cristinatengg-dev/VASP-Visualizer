const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TOKEN_TTL_MS,
  generateAuthToken,
  verifyAuthToken,
  readTokenIdentity,
} = require('../src/auth/token-auth');
const { requireAgentIdentity } = require('../src/auth/agent-access');

const PHONE = '+8613800012345';
const SECRET = 'test-only-token-secret';
const NOW = Date.UTC(2026, 7, 10, 8, 0, 0);

test('shared auth token round-trips through bearer identity parsing', () => {
  const token = generateAuthToken(PHONE, SECRET, NOW);
  assert.equal(verifyAuthToken(PHONE, token, SECRET, NOW + 1_000), true);
  assert.deepEqual(readTokenIdentity(`Bearer ${token}`, SECRET, NOW + 1_000), {
    present: true,
    valid: true,
    userId: PHONE,
  });
});

test('shared auth token rejects tampering, expiry, future issue time, and mismatched users', () => {
  const token = generateAuthToken(PHONE, SECRET, NOW);
  const tampered = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`;
  assert.equal(verifyAuthToken(PHONE, tampered, SECRET, NOW), false);
  assert.equal(verifyAuthToken(PHONE, token, SECRET, NOW + TOKEN_TTL_MS + 1), false);
  assert.equal(verifyAuthToken(PHONE, token, SECRET, NOW - 60_001), false);
  assert.equal(verifyAuthToken('+8613800099999', token, SECRET, NOW), false);
  assert.deepEqual(readTokenIdentity('Bearer invalid', SECRET, NOW), {
    present: true,
    valid: false,
    userId: '',
  });
});

test('runtime identity middleware allows persistence without quota checks and rejects invalid bearer tokens', async () => {
  const middleware = requireAgentIdentity();
  let nextCalled = false;
  const anonymousRequest = { headers: {} };
  await middleware(anonymousRequest, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(anonymousRequest.agentAuthenticated, false);

  let statusCode = 0;
  let responseBody = null;
  await middleware(
    { headers: { authorization: 'Bearer invalid' } },
    {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        responseBody = body;
        return body;
      },
    },
    () => assert.fail('invalid bearer token must not reach the Runtime router'),
  );
  assert.equal(statusCode, 401);
  assert.equal(responseBody.error, 'Unauthorized');
});
