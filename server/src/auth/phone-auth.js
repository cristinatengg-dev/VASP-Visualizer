const { createHmac, randomInt } = require('crypto');

const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const CHINA_MOBILE_PATTERN = /^\+861[3-9]\d{9}$/;

function normalizePhoneNumber(value) {
  let phone = String(value || '').trim().replace(/[\s()-]/g, '');
  if (!phone) return '';

  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  if (/^1[3-9]\d{9}$/.test(phone)) phone = `+86${phone}`;
  if (/^861[3-9]\d{9}$/.test(phone)) phone = `+${phone}`;

  if (!E164_PHONE_PATTERN.test(phone)) return '';
  if (phone.startsWith('+86') && !CHINA_MOBILE_PATTERN.test(phone)) return '';
  return phone;
}

function generateVerificationCode() {
  return String(randomInt(100000, 1000000));
}

function hashVerificationCode(phone, code, secret) {
  if (!phone || !code || !secret) throw new Error('Missing verification code hashing input');
  return createHmac('sha256', secret)
    .update(`${phone}:${code}`)
    .digest('hex');
}

function maskPhoneNumber(value) {
  const phone = normalizePhoneNumber(value);
  if (!phone) return '';
  if (phone.startsWith('+86')) return `${phone.slice(0, 6)}****${phone.slice(-4)}`;
  return `${phone.slice(0, Math.max(2, phone.length - 8))}****${phone.slice(-4)}`;
}

module.exports = {
  generateVerificationCode,
  hashVerificationCode,
  maskPhoneNumber,
  normalizePhoneNumber,
};
