const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vasp-redemption-test-'));
process.env.USER_DB_PATH = path.join(testDirectory, 'db.json');

const {
  InvitationCode,
  User,
  createVerificationCode,
  redeemCode,
  verifyCode,
} = require('../utils/db');

test.after(() => {
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

test('an invitation code can be claimed only once under concurrent redemption', async () => {
  const firstPhone = '+8613800010001';
  const secondPhone = '+8613800010002';
  await User.create({ id: firstPhone, phone: firstPhone, tier: 'personal' });
  await User.create({ id: secondPhone, phone: secondPhone, tier: 'personal' });
  await InvitationCode.create({ code: 'ONE-TIME-CODE', planType: 'academic', isUsed: false });

  const results = await Promise.allSettled([
    redeemCode('ONE-TIME-CODE', firstPhone),
    redeemCode('ONE-TIME-CODE', secondPhone),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);

  const users = await User.find({});
  assert.equal(users.filter((user) => user.tier === 'academic').length, 1);
});

test('a verification code hash can be consumed only once', async () => {
  const phone = '+8613800010003';
  await createVerificationCode(phone, 'hashed-code');
  const results = await Promise.all([
    verifyCode(phone, 'hashed-code'),
    verifyCode(phone, 'hashed-code'),
  ]);
  assert.deepEqual(results.sort(), [false, true]);
});
