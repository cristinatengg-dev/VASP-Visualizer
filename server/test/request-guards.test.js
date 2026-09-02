const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  createConcurrencyLimit,
  createWindowRateLimit,
} = require('../src/http/request-guards');

function mockResponse() {
  const response = new EventEmitter();
  response.statusCode = 200;
  response.headers = {};
  response.body = null;
  response.set = (name, value) => {
    response.headers[name] = value;
    return response;
  };
  response.status = (code) => {
    response.statusCode = code;
    return response;
  };
  response.json = (body) => {
    response.body = body;
    return response;
  };
  return response;
}

test('window limiter rejects requests after the configured allowance', () => {
  const limiter = createWindowRateLimit({ windowMs: 60_000, max: 2 });
  const request = { ip: '203.0.113.8' };
  let accepted = 0;

  limiter(request, mockResponse(), () => { accepted += 1; });
  limiter(request, mockResponse(), () => { accepted += 1; });
  const rejected = mockResponse();
  limiter(request, rejected, () => { accepted += 1; });

  assert.equal(accepted, 2);
  assert.equal(rejected.statusCode, 429);
  assert.match(rejected.body.error, /频繁/);
  assert.ok(Number(rejected.headers['Retry-After']) > 0);
});

test('concurrency limiter releases capacity when a response finishes', () => {
  const limiter = createConcurrencyLimit({ max: 2 });
  const first = mockResponse();
  const second = mockResponse();
  let accepted = 0;

  limiter({}, first, () => { accepted += 1; });
  limiter({}, second, () => { accepted += 1; });
  const rejected = mockResponse();
  limiter({}, rejected, () => { accepted += 1; });
  assert.equal(rejected.statusCode, 503);

  first.emit('finish');
  limiter({}, mockResponse(), () => { accepted += 1; });
  assert.equal(accepted, 3);
});
