const { normalizePhoneNumber } = require('./phone-auth');

function getAdminPhones() {
  return new Set(
    String(process.env.ADMIN_PHONES || '')
      .split(',')
      .map(normalizePhoneNumber)
      .filter(Boolean)
  );
}

function isAdminUser(user) {
  const phone = normalizePhoneNumber(user?.phone || user?.id || '');
  return Boolean(phone && getAdminPhones().has(phone));
}

module.exports = { isAdminUser };
