const { compileRenderingPrompt } = require('../../../rendering/compile-prompt');

async function runCompilePromptTask({
  runtimeCore,
  policyEngine,
  session,
  goalArtifact,
  planArtifact,
  taskRun,
  sourceReportArtifact,
  compileOptions = {},
}) {
  if (!taskRun) {
    throw new Error('TaskRun is required');
  }
  if (!sourceReportArtifact) {
    throw new Error('Source report artifact is required');
  }
  if (taskRun.status === 'blocked') {
    throw new Error(`TaskRun ${taskRun._id} is blocked and cannot be executed`);
  }
  if (taskRun.status !== 'queued') {
    throw new Error(`TaskRun ${taskRun._id} must be queued before execution`);
  }

  const structured = sourceReportArtifact?.preview?.structured;
  if (!structured || typeof structured !== 'object') {
    throw new Error(`Report artifact ${sourceReportArtifact._id} does not contain structured science data`);
  }

  await runtimeCore.withTransaction(async (tx) => {
    await runtimeCore.taskRunService.transitionTaskRun({
      taskRunId: taskRun._id,
      toStatus: 'running',
      tx,
    });

    await runtimeCore.eventService.emitEvent(
      {
        sessionId: session._id,
        taskRunId: taskRun._id,
        category: 'system',
        type: 'task_run.started',
        producerType: 'execution',
        correlationId: taskRun.correlationId,
        payload: {
          taskRunId: taskRun._id,
          planId: planArtifact._id,
          stepId: taskRun.stepId,
          sourceReportArtifactId: sourceReportArtifact._id,
        },
      },
      tx
    );
  });

  try {
    const compiled = compileRenderingPrompt({
      science: structured,
      options: compileOptions,
    });

    const acceptance = await policyEngine.validateAcceptance({
      artifactsCreated: [],
      validatorHints: ['compiled_prompt_report'],
      compiledPrompt: compiled,
    });

    const artifactIdentity = runtimeCore.artifactService.reserveArtifactIdentity();
    const storedPayload = await runtimeCore.artifactStorage.materializeJsonPayload({
      artifactId: artifactIdentity._id,
      lineageRootId: artifactIdentity.lineageRootId,
      version: artifactIdentity.version,
      payload: {
        compiled,
        sourceReportArtifactId: sourceReportArtifact._id,
      },
    });

    const finalized = await runtimeCore.withTransaction(async (tx) => {
      if (acceptance && acceptance.ok === false) {
        const partialTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
          taskRunId: taskRun._id,
          toStatus: 'partial',
          patch: {
            terminalReason: acceptance.reason || 'acceptance_validation_failed',
            metrics: {
              promptLength: compiled.fullPrompt.length,
              requiredSpeciesCount: compiled.requiredSpecies.length,
            },
          },
          tx,
        });

        await runtimeCore.eventService.emitEvent(
          {
            sessionId: session._id,
            taskRunId: taskRun._id,
            category: 'system',
            type: 'task_run.partial',
            producerType: 'policy',
            correlationId: taskRun.correlationId,
            payload: {
              taskRunId: taskRun._id,
              reason: acceptance.reason || 'acceptance_validation_failed',
            },
          },
          tx
        );

        return {
          taskRun: partialTaskRun,
          promptArtifact: null,
          compiled,
          acceptance,
        };
      }

      const promptArtifact = await runtimeCore.artifactService.createArtifact(
        {
          ...artifactIdentity,
          kind: 'report',
          sessionId: session._id,
          projectId: session.projectId,
          sourceArtifacts: [
            ...(goalArtifact ? [goalArtifact._id] : []),
            planArtifact._id,
            sourceReportArtifact._id,
          ],
          producedByTaskRun: taskRun._id,
          producedBySkill: taskRun.skillId,
          status: 'ready',
          lifecycleStage: 'validated',
          riskLevel: 'low',
          approvalStatus: 'none',
          isConsumable: true,
          payloadRef: storedPayload.payloadRef,
          payloadType: storedPayload.payloadType,
          mimeType: storedPayload.mimeType,
          blobSizeBytes: storedPayload.blobSizeBytes,
          contentHash: storedPayload.contentHash,
          summary: `Compiled rendering prompt for ${structured.subdomain || structured.domain || 'scientific cover'}`,
          preview: {
            artifactType: 'compiled_prompt',
            sourceReportArtifactId: sourceReportArtifact._id,
            journal: compiled.journal,
            aspectRatio: compiled.aspectRatio,
            strictNoText: compiled.strictNoText,
            strictChemistry: compiled.strictChemistry,
            requiredSpecies: compiled.requiredSpecies,
            requiredSpeciesCount: compiled.requiredSpecies.length,
            compiledPrompt: compiled.fullPrompt,
            compiledPromptExcerpt: compiled.fullPrompt.slice(0, 500),
            outputConstraints: compiled.outputConstraints,
            metadata: compiled.metadata,
          },
        },
        tx
      );

      await runtimeCore.taskRunService.appendOutputArtifacts({
        taskRunId: taskRun._id,
        artifactIds: [promptArtifact._id],
        tx,
      });

      const succeededTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
        taskRunId: taskRun._id,
        toStatus: 'succeeded',
        patch: {
          metrics: {
            promptLength: compiled.fullPrompt.length,
            requiredSpeciesCount: compiled.requiredSpecies.length,
          },
        },
        tx,
      });

      await runtimeCore.eventService.emitEvents(
        [
          {
            sessionId: session._id,
            taskRunId: taskRun._id,
            category: 'domain',
            type: 'artifact.report.created',
            producerType: 'subagent',
            correlationId: taskRun.correlationId,
            payload: {
              artifactId: promptArtifact._id,
              artifactType: 'compiled_prompt',
              taskRunId: taskRun._id,
              sourceReportArtifactId: sourceReportArtifact._id,
            },
          },
          {
            sessionId: session._id,
            taskRunId: taskRun._id,
            category: 'system',
            type: 'task_run.succeeded',
            producerType: 'execution',
            correlationId: taskRun.correlationId,
            payload: {
              taskRunId: taskRun._id,
              outputArtifactIds: [promptArtifact._id],
            },
          },
        ],
        tx
      );

      return {
        taskRun: succeededTaskRun,
        promptArtifact,
        compiled,
        acceptance,
      };
    });

    return finalized;
  } catch (error) {
    await runtimeCore.withTransaction(async (tx) => {
      await runtimeCore.taskRunService.transitionTaskRun({
        taskRunId: taskRun._id,
        toStatus: 'failed',
        patch: {
          terminalReason: 'compile_prompt_failed',
        },
        tx,
      });

      await runtimeCore.eventService.emitEvent(
        {
          sessionId: session._id,
          taskRunId: taskRun._id,
          category: 'system',
          type: 'task_run.failed',
          producerType: 'execution',
          correlationId: taskRun.correlationId,
          payload: {
            taskRunId: taskRun._id,
            error: error.message,
          },
        },
        tx
      );
    });

    throw error;
  }
}

module.exports = {
  runCompilePromptTask,
};
