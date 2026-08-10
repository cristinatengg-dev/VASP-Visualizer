const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateVerificationCode,
  hashVerificationCode,
  maskPhoneNumber,
  normalizePhoneNumber,
} = require('../src/auth/phone-auth');
const { sendLoginCode } = require('../src/auth/sms-service');

test('normalizes mainland China and E.164 phone numbers', () => {
  assert.equal(normalizePhoneNumber('138 0000 0000'), '+8613800000000');
  assert.equal(normalizePhoneNumber('8613800000000'), '+8613800000000');
  assert.equal(normalizePhoneNumber('008613800000000'), '+8613800000000');
  assert.equal(normalizePhoneNumber('+14155552671'), '+14155552671');
});

test('rejects invalid phone numbers', () => {
  assert.equal(normalizePhoneNumber('1380000000'), '');
  assert.equal(normalizePhoneNumber('+8612800000000'), '');
  assert.equal(normalizePhoneNumber('test@example.com'), '');
});

test('creates six-digit codes and phone-bound hashes', () => {
  const code = generateVerificationCode();
  assert.match(code, /^\d{6}$/);
  assert.notEqual(
    hashVerificationCode('+8613800000000', code, 'secret'),
    hashVerificationCode('+8613900000000', code, 'secret')
  );
  assert.equal(maskPhoneNumber('+8613800000000'), '+86138****0000');
});

test('sends the expected Tencent SMS template parameters', async () => {
  let request;
  const client = {
    SendSms: async (params) => {
      request = params;
      return { RequestId: 'request-1', SendStatusSet: [{ Code: 'Ok', SerialNo: 'serial-1' }] };
    },
  };
  const config = {
    sdkAppId: '1400000000',
    signName: 'SCI Visualizer',
    templateId: '123456',
  };

  await sendLoginCode('+8613800000000', '123456', { client, config });
  assert.deepEqual(request, {
    SmsSdkAppId: '1400000000',
    SignName: 'SCI Visualizer',
    TemplateId: '123456',
    TemplateParamSet: ['123456', '5'],
    PhoneNumberSet: ['+8613800000000'],
  });
});
