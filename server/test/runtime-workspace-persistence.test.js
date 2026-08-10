const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ArtifactModel,
  SessionModel,
} = require('../src/runtime/persistence/models');
const { createSessionService } = require('../src/runtime/services/session-service');
const { createLocalArtifactStorage } = require('../src/runtime/storage/local-artifact-storage');
const {
  createResearchOrchestratorHarnessRouter,
  normalizeWorkspaceSnapshot,
  resolveOwnerId,
  snapshotPreview,
} = require('../src/agent-harness/research-orchestrator-router');

test('workspace runtime schemas accept persisted sessions and snapshot artifacts', () => {
  const session = new SessionModel({
    _id: 'sess_test',
    ownerId: 'owner_test',
    projectId: 'workspace-agent',
    status: 'active',
    workspaceType: 'research-agent',
    clientTaskId: 'task_test',
    title: 'Test task',
    snapshotRevision: 1,
  });
  assert.equal(session.validateSync(), undefined);

  for (const kind of ['workspace_snapshot', 'synthesis_plan', 'feasibility_report', 'experiment_plan', 'materials_research_stack']) {
    const artifact = new ArtifactModel({
      _id: `art_${kind}`,
      kind,
      sessionId: session._id,
      version: 1,
      lineageRootId: `root_${kind}`,
      latestInLineage: true,
      status: 'ready',
      riskLevel: 'low',
      approvalStatus: 'none',
      payloadRef: `/tmp/${kind}.json`,
      payloadType: 'json',
      summary: kind,
    });
    assert.equal(artifact.validateSync(), undefined, `${kind} should be a valid artifact kind`);
  }
});

test('workspace task uniqueness index only covers active tasks', () => {
  const index = SessionModel.schema.indexes().find(([keys]) => (
    keys.ownerId === 1 && keys.clientTaskId === 1
  ));
  assert.ok(index, 'workspace task uniqueness index should exist');
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression, {
    clientTaskId: { $type: 'string' },
    deletedAt: null,
  });
});

test('workspace snapshot normalization enforces JSON objects and size limits', () => {
  const normalized = normalizeWorkspaceSnapshot({ version: 1, phase: 'idle', messages: [] });
  assert.deepEqual(normalized, { version: 1, phase: 'idle', messages: [] });
  assert.throws(() => normalizeWorkspaceSnapshot(null), /snapshot must be a JSON object/);
  assert.throws(() => normalizeWorkspaceSnapshot(['not', 'an', 'object']), /snapshot must be a JSON object/);
  assert.throws(
    () => normalizeWorkspaceSnapshot({ payload: 'x'.repeat(8 * 1024 * 1024 + 1) }),
    /exceeds the 8 MB limit/,
  );
  assert.deepEqual(snapshotPreview({ phase: 'modeling', messages: [{ id: '1' }], modelStructure: {} }, false), {
    phase: 'modeling',
    messageCount: 1,
    toolEventCount: 0,
    hasStructure: true,
    hasCompiledInputs: false,
    archived: false,
  });
});

test('workspace snapshot payloads use independent atomic files under concurrent versions', async () => {
  const baseDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'runtime-artifacts-'));
  const storage = createLocalArtifactStorage({ baseDir });
  try {
    const first = await storage.materializeJsonPayload({
      artifactId: 'art_first',
      lineageRootId: 'lineage_shared',
      version: 2,
      payload: { writer: 'first' },
      fileName: 'art_first-workspace-snapshot.json',
    });
    const second = await storage.materializeJsonPayload({
      artifactId: 'art_second',
      lineageRootId: 'lineage_shared',
      version: 2,
      payload: { writer: 'second' },
      fileName: 'art_second-workspace-snapshot.json',
    });
    assert.notEqual(first.payloadRef, second.payloadRef);
    assert.equal((await storage.readJsonPayload(first.payloadRef)).payload.writer, 'first');
    assert.equal((await storage.readJsonPayload(second.payloadRef)).payload.writer, 'second');
    const files = await fs.promises.readdir(path.dirname(first.payloadRef));
    assert.equal(files.some((file) => file.endsWith('.tmp')), false);
  } finally {
    await fs.promises.rm(baseDir, { recursive: true, force: true });
  }
});

test('workspace owner comes from verified auth and anonymous owners use unguessable local ids', () => {
  assert.equal(resolveOwnerId({
    agentAuthenticated: true,
    agentUser: { phone: '+8613800012345' },
    body: { ownerId: '+8613800099999' },
  }), '+8613800012345');
  assert.equal(resolveOwnerId({
    agentAuthenticated: false,
    body: { ownerId: 'local-019febb2-7a63-7d82-8f9e-9be1265ed9c4' },
  }), 'local-019febb2-7a63-7d82-8f9e-9be1265ed9c4');
  assert.throws(
    () => resolveOwnerId({ agentAuthenticated: false, body: { ownerId: '+8613800099999' } }),
    (error) => error.statusCode === 401,
  );
});

test('session service uses optimistic snapshot revisions and owner-scoped mutations', async () => {
  const original = SessionModel.findOneAndUpdate;
  const calls = [];
  SessionModel.findOneAndUpdate = async (...args) => {
    calls.push(args);
    return { _id: 'sess_test', ownerId: 'owner_test' };
  };

  try {
    const service = createSessionService();
    await service.updateWorkspaceSnapshot({
      sessionId: 'sess_test',
      ownerId: 'owner_test',
      title: 'Updated',
      latestSnapshotArtifactId: 'art_v2',
      expectedSnapshotRevision: 3,
    });
    assert.deepEqual(calls[0][0], {
      _id: 'sess_test',
      ownerId: 'owner_test',
      deletedAt: { $exists: false },
      snapshotRevision: 3,
    });
    assert.equal(calls[0][1].$inc.snapshotRevision, 1);
    assert.equal(calls[0][1].$set.latestSnapshotArtifactId, 'art_v2');

    await service.setWorkspaceArchived({ sessionId: 'sess_test', ownerId: 'owner_test', archived: true });
    assert.ok(calls[1][1].$set.archivedAt instanceof Date);
    await service.setWorkspaceArchived({ sessionId: 'sess_test', ownerId: 'owner_test', archived: false });
    assert.deepEqual(calls[2][1].$unset, { archivedAt: 1 });

    await service.softDeleteWorkspace({ sessionId: 'sess_test', ownerId: 'owner_test' });
    assert.equal(calls[3][1].$set.status, 'closed');
    assert.ok(calls[3][1].$set.deletedAt instanceof Date);
  } finally {
    SessionModel.findOneAndUpdate = original;
  }
});

test('research harness exposes production workspace persistence endpoints', () => {
  const router = createResearchOrchestratorHarnessRouter();
  const routes = router.stack
    .filter((layer) => layer.route)
    .map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);

  assert.ok(routes.includes('GET /workspace/health'));
  assert.ok(routes.includes('GET /workspace/tasks'));
  assert.ok(routes.includes('POST /workspace/tasks'));
  assert.ok(routes.includes('PUT /workspace/tasks/:sessionId'));
  assert.ok(routes.includes('PATCH /workspace/tasks/:sessionId/archive'));
  assert.ok(routes.includes('DELETE /workspace/tasks/:sessionId'));
});
