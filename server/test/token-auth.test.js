const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TOKEN_TTL_MS,
  generateAuthToken,
  verifyAuthToken,
  readTokenIdentity,
} = require('../src/auth/token-auth');
const {
  checkAgentAccess,
  handleAgentAccessCheck,
  recordAgentUsage,
  requireAgentAccess,
  requireAgentIdentity,
  resolveAgentOwnerId,
} = require('../src/auth/agent-access');

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

test('all agent capabilities are public without subscriptions or usage quotas', async () => {
  for (const agent of ['modeling', 'compute', 'rendering', 'cover', 'retrieval']) {
    const anonymous = await checkAgentAccess(null, agent);
    const personal = await checkAgentAccess({
      phone: PHONE,
      tier: 'personal',
      subscribed_agents: [],
      subscription_expires_at: new Date(0),
      agent_daily_usage: { [`${agent}:2026-08-11`]: 999 },
    }, agent);
    assert.equal(anonymous.allowed, true);
    assert.equal(personal.allowed, true);
    assert.equal(personal.public_access, true);
  }

  assert.deepEqual(await recordAgentUsage(PHONE, 'compute'), {
    recorded: false,
    public_access: true,
  });
});

test('public agent middleware allows anonymous requests but still rejects invalid bearer tokens', async () => {
  const middleware = requireAgentAccess('compute');
  let anonymousNextCalled = false;
  const anonymousRequest = { headers: {}, body: {} };
  await middleware(anonymousRequest, {}, () => { anonymousNextCalled = true; });
  assert.equal(anonymousNextCalled, true);
  assert.deepEqual(anonymousRequest.agentAccess, {
    allowed: true,
    public_access: true,
    agent: 'compute',
  });

  let statusCode = 0;
  await middleware(
    { headers: { authorization: 'Bearer invalid' }, body: {} },
    {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        return body;
      },
    },
    () => assert.fail('invalid bearer token must not reach a public agent route'),
  );
  assert.equal(statusCode, 401);
});

test('agent access status reports public access for anonymous users', async () => {
  let payload = null;
  await handleAgentAccessCheck(
    { headers: {}, query: { agent: 'compute' }, body: {} },
    { json(body) { payload = body; return body; } },
  );
  assert.equal(payload.success, true);
  assert.equal(payload.allowed, true);
  assert.equal(payload.public_access, true);
});

test('storage owners cannot impersonate a phone without a verified token', () => {
  assert.equal(resolveAgentOwnerId({
    agentAuthenticated: true,
    agentUser: { phone: PHONE },
    body: { ownerId: '+8613900099999' },
  }), PHONE);

  assert.equal(resolveAgentOwnerId({
    agentAuthenticated: false,
    body: { ownerId: 'local-9fe51c63-bf25-4c3a-a6f8-c21bededbd45' },
  }), 'local-9fe51c63-bf25-4c3a-a6f8-c21bededbd45');

  assert.throws(
    () => resolveAgentOwnerId({
      agentAuthenticated: false,
      body: { ownerId: PHONE },
    }),
    /valid login token or local owner id/,
  );
});
