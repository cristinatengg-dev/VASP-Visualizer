const test = require('node:test');
const assert = require('node:assert/strict');

const { migrateDatabase } = require('../scripts/migrate-users-to-phone.cjs');

test('migrates a legacy email account to a phone without losing entitlements', () => {
  const source = {
    users: {
      'owner@example.com': {
        email: 'owner@example.com',
        tier: 'enterprise',
        prepaid_img: 7,
        associated_ips: ['127.0.0.1'],
      },
    },
  };

  const result = migrateDatabase(source, { 'owner@example.com': '13800000000' });
  const migrated = result.database.users['+8613800000000'];
  assert.equal(migrated.phone, '+8613800000000');
  assert.equal(migrated.id, '+8613800000000');
  assert.equal(migrated.legacy_account, 'owner@example.com');
  assert.equal(migrated.tier, 'enterprise');
  assert.equal(migrated.prepaid_img, 7);
  assert.deepEqual(migrated.associated_ips, ['127.0.0.1']);
  assert.equal(migrated.email, undefined);
  assert.deepEqual(result.unmappedAccounts, []);
});

test('rejects invalid phone mappings and duplicate phone ownership', () => {
  assert.throws(
    () => migrateDatabase({ users: { 'owner@example.com': { email: 'owner@example.com' } } }, { 'owner@example.com': '123' }),
    /Invalid phone number/
  );
  assert.throws(
    () => migrateDatabase(
      { users: { first: { phone: '+8613800000000' }, second: { email: 'owner@example.com' } } },
      { 'owner@example.com': '+8613800000000' }
    ),
    /already assigned/
  );
});
