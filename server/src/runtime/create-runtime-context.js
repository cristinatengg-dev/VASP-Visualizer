const { withTransaction } = require('./persistence/with-transaction');
const { createSessionService } = require('./services/session-service');
const { createEventService } = require('./services/event-service');
const { createArtifactService } = require('./services/artifact-service');
const { createTaskRunService } = require('./services/task-run-service');
const { createJobRunService } = require('./services/job-run-service');
const { createApprovalService } = require('./services/approval-service');
const { createSkillService } = require('./services/skill-service');
const { createLocalArtifactStorage } = require('./storage/local-artifact-storage');
const { createLocalJobStorage } = require('./storage/local-job-storage');

function createRuntimeContext() {
  const artifactStorage = createLocalArtifactStorage();
  const jobStorage = createLocalJobStorage();
  const sessionService = createSessionService();
  const eventService = createEventService({ sessionService });
  const artifactService = createArtifactService();
  const taskRunService = createTaskRunService();
  const jobRunService = createJobRunService();
  const approvalService = createApprovalService();
  const skillService = createSkillService();

  return {
    withTransaction,
    artifactStorage,
    jobStorage,
    sessionService,
    eventService,
    artifactService,
    taskRunService,
    jobRunService,
    approvalService,
    skillService,
  };
}

module.exports = {
  createRuntimeContext,
};
