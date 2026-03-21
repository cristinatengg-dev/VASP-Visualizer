const { createRuntimeContext } = require('../create-runtime-context');
const { createDefaultPolicyHooks } = require('./default-policy-hooks');

function buildArtifactInput(kind, input) {
  return {
    ...input,
    kind,
    preview: (input && input.preview) || {},
    summary: (input && input.summary) || `Draft ${kind} artifact`,
  };
}

function makeCorrelationId({ sessionId, planId, stepId }) {
  return `${sessionId}:${planId}:${stepId}`;
}

function createRuntimeCore(options = {}) {
  const runtime = options.runtimeContext || createRuntimeContext();
  const policyHooks = {
    ...createDefaultPolicyHooks(),
    ...(options.policyHooks || {}),
  };

  async function createAndStageTaskRun({ session, goalArtifact, planArtifact, taskSpec, tx }) {
    const stagedTaskRun = await runtime.taskRunService.createTaskRun(
      {
        sessionId: session._id,
        planId: planArtifact._id,
        stepId: taskSpec.stepId,
        agentId: taskSpec.agentId,
        skillId: taskSpec.skillId,
        spawnReason: taskSpec.spawnReason || 'plan_step',
        correlationId: taskSpec.correlationId || makeCorrelationId({
          sessionId: session._id,
          planId: planArtifact._id,
          stepId: taskSpec.stepId,
        }),
        inputArtifacts: taskSpec.inputArtifacts || (goalArtifact ? [goalArtifact._id] : []),
        outputArtifacts: [],
        status: 'draft',
        attempt: taskSpec.attempt || 1,
        retryable: Boolean(taskSpec.retryable),
        approvalRequired: Boolean(taskSpec.approvalRequired),
      },
      tx
    );

    await runtime.eventService.emitEvent(
      {
        sessionId: session._id,
        taskRunId: stagedTaskRun._id,
        category: 'system',
        type: 'task_run.created',
        producerType: 'execution',
        correlationId: stagedTaskRun.correlationId,
        payload: {
          planId: planArtifact._id,
          stepId: stagedTaskRun.stepId,
          taskRunId: stagedTaskRun._id,
        },
      },
      tx
    );

    const preflight = await policyHooks.runInitialPreflight({
      session,
      goalArtifact,
      planArtifact,
      taskRun: stagedTaskRun,
      tx,
    });

    const nextStatus = preflight && preflight.ok === false
      ? 'blocked'
      : (preflight && preflight.nextStatus) || 'queued';

    const transitionedTaskRun = await runtime.taskRunService.transitionTaskRun(
      {
        taskRunId: stagedTaskRun._id,
        toStatus: nextStatus,
        patch: nextStatus === 'blocked'
          ? { terminalReason: (preflight && preflight.reason) || 'preflight_blocked' }
          : {},
        tx,
      }
    );

    await runtime.eventService.emitEvent(
      {
        sessionId: session._id,
        taskRunId: stagedTaskRun._id,
        category: 'system',
        type: nextStatus === 'blocked' ? 'task_run.blocked' : 'task_run.queued',
        producerType: 'policy',
        correlationId: stagedTaskRun.correlationId,
        payload: {
          taskRunId: stagedTaskRun._id,
          status: nextStatus,
          reason: preflight && preflight.reason ? preflight.reason : null,
        },
      },
      tx
    );

    return transitionedTaskRun;
  }

  async function submitGoalAndCreatePlan(input) {
    return runtime.withTransaction(async (tx) => {
      let session = input.sessionId
        ? await runtime.sessionService.getSessionById(input.sessionId, tx)
        : null;

      if (!session) {
        session = await runtime.sessionService.createSession(
          {
            _id: input.sessionId,
            ownerId: input.ownerId,
            projectId: input.projectId,
            status: 'active',
          },
          tx
        );

        await runtime.eventService.emitEvent(
          {
            sessionId: session._id,
            category: 'system',
            type: 'session.created',
            producerType: 'execution',
            payload: { sessionId: session._id, ownerId: session.ownerId },
          },
          tx
        );
      }

      if (session.status === 'closed') {
        throw new Error(`Cannot submit goal into closed session ${session._id}`);
      }

      const goalArtifact = await runtime.artifactService.createArtifact(
        buildArtifactInput('goal', {
          ...input.goalArtifact,
          sessionId: session._id,
          projectId: session.projectId || input.projectId,
          status: (input.goalArtifact && input.goalArtifact.status) || 'ready',
        }),
        tx
      );

      const planArtifact = await runtime.artifactService.createArtifact(
        buildArtifactInput('plan', {
          ...input.planArtifact,
          sessionId: session._id,
          projectId: session.projectId || input.projectId,
          status: (input.planArtifact && input.planArtifact.status) || 'ready',
          sourceArtifacts: Array.from(new Set([goalArtifact._id, ...((input.planArtifact && input.planArtifact.sourceArtifacts) || [])])),
        }),
        tx
      );

      session = await runtime.sessionService.bindGoalAndPlan(
        {
          sessionId: session._id,
          primaryGoalArtifactId: session.primaryGoalArtifactId || goalArtifact._id,
          activePlanArtifactId: planArtifact._id,
          tx,
        }
      );

      await runtime.eventService.emitEvents(
        [
          {
            sessionId: session._id,
            category: 'domain',
            type: 'artifact.goal.created',
            producerType: 'orchestrator',
            payload: { artifactId: goalArtifact._id },
          },
          {
            sessionId: session._id,
            category: 'domain',
            type: 'artifact.plan.created',
            producerType: 'orchestrator',
            payload: { artifactId: planArtifact._id, goalArtifactId: goalArtifact._id },
          },
        ],
        tx
      );

      const transitionedTaskRun = await createAndStageTaskRun({
        session,
        goalArtifact,
        planArtifact,
        taskSpec: input.firstStep,
        tx,
      });

      return {
        session,
        goalArtifact,
        planArtifact,
        firstTaskRun: transitionedTaskRun,
      };
    });
  }

  async function replanSession(input) {
    return runtime.withTransaction(async (tx) => {
      const session = await runtime.sessionService.getSessionById(input.sessionId, tx);
      if (!session) {
        throw new Error(`Session not found: ${input.sessionId}`);
      }
      if (session.status === 'closed') {
        throw new Error(`Cannot replan closed session ${session._id}`);
      }
      if (!session.activePlanArtifactId) {
        throw new Error(`Session ${session._id} has no active plan to supersede`);
      }
      if (!session.primaryGoalArtifactId) {
        throw new Error(`Session ${session._id} has no primary goal to supersede`);
      }

      const previousGoalArtifact = await runtime.artifactService.getArtifactById(session.primaryGoalArtifactId, tx);
      const previousPlanArtifact = await runtime.artifactService.getArtifactById(session.activePlanArtifactId, tx);

      if (!previousGoalArtifact || !previousPlanArtifact) {
        throw new Error(`Active goal/plan artifacts are missing for session ${session._id}`);
      }

      const nextGoalArtifact = await runtime.artifactService.supersedeArtifact(
        {
          artifactId: previousGoalArtifact._id,
          nextArtifact: buildArtifactInput('goal', {
            ...input.goalArtifact,
            sessionId: session._id,
            projectId: session.projectId,
            status: (input.goalArtifact && input.goalArtifact.status) || 'ready',
          }),
          tx,
        }
      );

      const nextPlanArtifact = await runtime.artifactService.supersedeArtifact(
        {
          artifactId: previousPlanArtifact._id,
          nextArtifact: buildArtifactInput('plan', {
            ...input.planArtifact,
            sessionId: session._id,
            projectId: session.projectId,
            status: (input.planArtifact && input.planArtifact.status) || 'ready',
            sourceArtifacts: Array.from(
              new Set([
                nextGoalArtifact._id,
                previousPlanArtifact._id,
                ...((input.planArtifact && input.planArtifact.sourceArtifacts) || []),
              ])
            ),
          }),
          tx,
        }
      );

      const updatedSession = await runtime.sessionService.bindGoalAndPlan(
        {
          sessionId: session._id,
          primaryGoalArtifactId: nextGoalArtifact._id,
          activePlanArtifactId: nextPlanArtifact._id,
          tx,
        }
      );

      await runtime.eventService.emitEvents(
        [
          {
            sessionId: session._id,
            category: 'domain',
            type: 'artifact.goal.superseded',
            producerType: 'orchestrator',
            payload: {
              previousArtifactId: previousGoalArtifact._id,
              artifactId: nextGoalArtifact._id,
              replanReason: input.replanReason || null,
            },
          },
          {
            sessionId: session._id,
            category: 'domain',
            type: 'artifact.plan.superseded',
            producerType: 'orchestrator',
            payload: {
              previousArtifactId: previousPlanArtifact._id,
              artifactId: nextPlanArtifact._id,
              replanReason: input.replanReason || null,
            },
          },
        ],
        tx
      );

      const obsoleteTaskRuns = await runtime.taskRunService.findTaskRunsByPlan(
        {
          planId: previousPlanArtifact._id,
          statuses: ['draft', 'queued', 'waiting_approval', 'blocked'],
          tx,
        }
      );

      const obsoleteTaskRunIds = obsoleteTaskRuns.map((run) => run._id);
      if (obsoleteTaskRunIds.length > 0) {
        await runtime.taskRunService.cancelTaskRuns(
          {
            taskRunIds: obsoleteTaskRunIds,
            terminalReason: 'obsolete_by_replan',
            tx,
          }
        );

        await runtime.eventService.emitEvents(
          obsoleteTaskRuns.map((run) => ({
            sessionId: session._id,
            taskRunId: run._id,
            category: 'system',
            type: 'task_run.cancelled',
            producerType: 'execution',
            correlationId: run.correlationId,
            payload: {
              taskRunId: run._id,
              terminalReason: 'obsolete_by_replan',
              previousPlanId: previousPlanArtifact._id,
              nextPlanId: nextPlanArtifact._id,
            },
          })),
          tx
        );
      }

      const nextTaskRun = await createAndStageTaskRun({
        session: updatedSession,
        goalArtifact: nextGoalArtifact,
        planArtifact: nextPlanArtifact,
        taskSpec: input.firstStep,
        tx,
      });

      return {
        session: updatedSession,
        previousGoalArtifact,
        previousPlanArtifact,
        goalArtifact: nextGoalArtifact,
        planArtifact: nextPlanArtifact,
        obsoleteTaskRunIds,
        firstTaskRun: nextTaskRun,
      };
    });
  }

  return {
    ...runtime,
    createAndStageTaskRun,
    submitGoalAndCreatePlan,
    replanSession,
  };
}

module.exports = {
  createRuntimeCore,
};
