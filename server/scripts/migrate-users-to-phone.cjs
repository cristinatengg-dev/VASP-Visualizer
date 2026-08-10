const fs = require('fs');
const path = require('path');
const { normalizePhoneNumber } = require('../src/auth/phone-auth');

function getEntries(users) {
  return Array.isArray(users)
    ? users.map((user, index) => [String(index), user])
    : Object.entries(users || {});
}

function resolveMapping(mapping, key, user) {
  const aliases = [key, user?.email, user?.id, user?.phone].filter(Boolean);
  for (const alias of aliases) {
    if (mapping[alias]) return { source: alias, phone: normalizePhoneNumber(mapping[alias]) };
  }
  return null;
}

function migrateDatabase(database, mapping) {
  const entries = getEntries(database.users);
  const migratedSources = [];
  const phoneOwners = new Map();

  for (const [key, user] of entries) {
    const existingPhone = normalizePhoneNumber(user?.phone || '');
    if (existingPhone) phoneOwners.set(existingPhone, key);
  }

  const migratedEntries = entries.map(([key, rawUser]) => {
    const user = { ...rawUser };
    const match = resolveMapping(mapping, key, user);
    if (!match) return [key, user];
    if (!match.phone) throw new Error(`Invalid phone number mapped from ${match.source}`);

    const currentOwner = phoneOwners.get(match.phone);
    if (currentOwner && currentOwner !== key) {
      throw new Error(`Phone ${match.phone} is already assigned to ${currentOwner}`);
    }

    const legacyAccount = user.email || user.id || key;
    delete user.email;
    user.id = match.phone;
    user.phone = match.phone;
    user.legacy_account = legacyAccount;
    user.updatedAt = new Date().toISOString();
    phoneOwners.set(match.phone, key);
    migratedSources.push({ from: legacyAccount, to: match.phone, tier: user.tier || null });
    return [match.phone, user];
  });

  const users = Object.fromEntries(migratedEntries);
  return {
    database: { ...database, users },
    migratedSources,
    unmappedAccounts: migratedEntries
      .filter(([, user]) => !normalizePhoneNumber(user?.phone || ''))
      .map(([key, user]) => user?.email || user?.id || key),
  };
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runCli(argv = process.argv.slice(2)) {
  const apply = argv.includes('--apply');
  const positional = argv.filter(arg => arg !== '--apply');
  const dbPath = path.resolve(positional[0] || process.env.USER_DB_PATH || path.join(__dirname, '../db.json'));
  const mappingPath = positional[1] ? path.resolve(positional[1]) : '';
  if (!mappingPath) {
    throw new Error('Usage: npm run migrate-users-to-phone -- <db.json> <mapping.json> [--apply]');
  }

  const database = loadJson(dbPath);
  const mapping = loadJson(mappingPath);
  const result = migrateDatabase(database, mapping);
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    dbPath,
    migrated: result.migratedSources,
    unmappedAccounts: result.unmappedAccounts,
  };

  if (apply) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${dbPath}.backup-${timestamp}`;
    const tempPath = `${dbPath}.tmp-${process.pid}`;
    fs.copyFileSync(dbPath, backupPath, fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(tempPath, `${JSON.stringify(result.database, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tempPath, dbPath);
    summary.backupPath = backupPath;
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { migrateDatabase, runCli };
