const { createHmac, timingSafeEqual } = require('crypto');
const { normalizePhoneNumber } = require('./phone-auth');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function stripBearer(value) {
  let raw = String(value || '').trim();
  if (raw.toLowerCase().startsWith('bearer ')) raw = raw.slice(7).trim();
  return raw;
}

function generateAuthToken(phone, secret, now = Date.now()) {
  const payload = Buffer.from(`${phone}:${now}`).toString('base64');
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function verifyAuthToken(userId, token, secret, now = Date.now()) {
  if (!userId || !token || !secret) return false;
  if (normalizePhoneNumber(userId) !== userId) return false;
  const raw = stripBearer(token);
  try {
    const dotIndex = raw.lastIndexOf('.');
    if (dotIndex === -1) return false;
    const payload = raw.slice(0, dotIndex);
    const signature = raw.slice(dotIndex + 1);
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    const suppliedBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return false;
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    const separator = decoded.lastIndexOf(':');
    if (separator <= 0) return false;
    const phone = decoded.slice(0, separator);
    const issuedAt = Number(decoded.slice(separator + 1));
    if (phone !== userId || !Number.isFinite(issuedAt)) return false;
    if (issuedAt > now + 60_000 || now - issuedAt > TOKEN_TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

function readTokenIdentity(authorization, secret, now = Date.now()) {
  const raw = stripBearer(authorization);
  if (!raw) return { present: false, valid: false, userId: '' };
  try {
    const dotIndex = raw.lastIndexOf('.');
    if (dotIndex === -1) return { present: true, valid: false, userId: '' };
    const decoded = Buffer.from(raw.slice(0, dotIndex), 'base64').toString('utf8');
    const separator = decoded.lastIndexOf(':');
    const userId = separator > 0 ? decoded.slice(0, separator) : '';
    const valid = verifyAuthToken(userId, raw, secret, now);
    return { present: true, valid, userId: valid ? userId : '' };
  } catch {
    return { present: true, valid: false, userId: '' };
  }
}

module.exports = {
  TOKEN_TTL_MS,
  generateAuthToken,
  verifyAuthToken,
  readTokenIdentity,
};
