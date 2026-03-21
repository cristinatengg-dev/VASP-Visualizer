#!/usr/bin/env node

/**
 * Draft bootstrap script for agent runtime Mongo collections.
 *
 * Usage:
 *   MONGODB_URI='mongodb://127.0.0.1:27017/vasp_visualizer' node server/drafts/agent-runtime/bootstrap-indexes.js
 *
 * Notes:
 * - This script is intentionally not wired into the current app startup.
 * - It creates collections on demand and syncs schema-defined indexes.
 * - It does not migrate legacy collections.
 */

const mongoose = require('mongoose');
const {
  SessionModel,
  ArtifactModel,
  TaskRunModel,
  JobRunModel,
  ApprovalRequestModel,
  EventModel,
  SkillDefinitionModel,
} = require('./mongoose-schemas');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI (or MONGO_URI) environment variable.');
  process.exit(1);
}

async function ensureCollection(model) {
  try {
    await model.createCollection();
  } catch (err) {
    // NamespaceExists is fine; anything else should still bubble.
    const codeName = String(err && err.codeName ? err.codeName : '');
    const message = String(err && err.message ? err.message : '');
    if (codeName !== 'NamespaceExists' && !/already exists/i.test(message)) {
      throw err;
    }
  }
}

async function syncModel(model) {
  await ensureCollection(model);
  const result = await model.syncIndexes();
  return {
    collection: model.collection.collectionName,
    droppedIndexes: result,
  };
}

async function main() {
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  const models = [
    SessionModel,
    ArtifactModel,
    TaskRunModel,
    ApprovalRequestModel,
    JobRunModel,
    EventModel,
    SkillDefinitionModel,
  ];

  const reports = [];
  for (const model of models) {
    const report = await syncModel(model);
    const indexes = await model.collection.indexes();
    reports.push({
      ...report,
      indexes,
    });
  }

  console.log(JSON.stringify({ ok: true, reports }, null, 2));
}

main()
  .catch((err) => {
    console.error(JSON.stringify({
      ok: false,
      error: {
        message: err.message,
        stack: err.stack,
      },
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // noop
    }
  });
