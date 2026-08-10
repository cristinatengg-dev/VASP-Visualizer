#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.local'), override: true });
const mongoose = require('mongoose');
const { connectRuntimeDb } = require('../src/runtime/persistence/connect-runtime-db');
const {
  SessionModel,
  ArtifactModel,
  TaskRunModel,
  JobRunModel,
  ApprovalRequestModel,
  EventModel,
  SkillDefinitionModel,
} = require('../src/runtime/persistence/models');

const models = [
  SessionModel,
  ArtifactModel,
  TaskRunModel,
  JobRunModel,
  ApprovalRequestModel,
  EventModel,
  SkillDefinitionModel,
];

async function ensureCollection(model) {
  try {
    await model.createCollection();
  } catch (error) {
    const codeName = String(error?.codeName || '');
    const message = String(error?.message || '');
    if (codeName !== 'NamespaceExists' && !/already exists/i.test(message)) throw error;
  }
}

async function main() {
  await connectRuntimeDb();
  const reports = [];
  for (const model of models) {
    await ensureCollection(model);
    await model.createIndexes();
    const indexes = await model.collection.indexes();
    reports.push({
      collection: model.collection.collectionName,
      indexes: indexes.map((index) => index.name),
    });
  }
  process.stdout.write(`${JSON.stringify({ ok: true, reports }, null, 2)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
  });
