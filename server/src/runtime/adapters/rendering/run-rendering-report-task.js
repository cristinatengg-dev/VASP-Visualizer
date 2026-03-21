function countItems(items) {
  return Array.isArray(items) ? items.length : 0;
}

function buildReportSummary(parsed, fallback) {
  if (parsed.core_theme) {
    return parsed.core_theme;
  }
  if (parsed.central_object && parsed.key_mechanism) {
    return `${parsed.central_object}: ${parsed.key_mechanism}`;
  }
  if (parsed.subdomain) {
    return `Scientific parsing result for ${parsed.subdomain}`;
  }
  return fallback || 'Scientific parsing result';
}

function buildBasePreview(parsed) {
  return {
    domain: parsed.domain || null,
    subdomain: parsed.subdomain || null,
    coreTheme: parsed.core_theme || null,
    centralObject: parsed.central_object || null,
    keyMechanism: parsed.key_mechanism || null,
    visualKeywords: Array.isArray(parsed.visual_keywords) ? parsed.visual_keywords.slice(0, 12) : [],
    mustShowElements: Array.isArray(parsed.must_show_elements) ? parsed.must_show_elements.slice(0, 12) : [],
    structured: parsed,
  };
}

function buildBaseMetrics(parsed) {
  return {
    reactantCount: countItems(parsed.reactants),
    intermediateCount: countItems(parsed.intermediates),
    productCount: countItems(parsed.products),
    scientificEntityCount: countItems(parsed.scientific_entities),
  };
}

async function runRenderingReportTask({
  runtimeCore,
  policyEngine,
  session,
  goalArtifact,
  planArtifact,
  taskRun,
  execute,
  validatorHints = [],
  failureReason = 'rendering_report_task_failed',
  artifactSummaryFallback,
}) {
  if (!taskRun) {
    throw new Error('TaskRun is required');
  }
  if (taskRun.status === 'blocked') {
    throw new Error(`TaskRun ${taskRun._id} is blocked and cannot be executed`);
  }
  if (taskRun.status !== 'queued') {
    throw new Error(`TaskRun ${taskRun._id} must be queued before execution`);
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
        },
      },
      tx
    );
  });

  try {
    const executionResult = await execute();
    const parsed = executionResult.parsed;
    const acceptance = await policyEngine.validateAcceptance({
      artifactsCreated: [],
      validatorHints,
      parsed,
      executionResult,
    });

    const artifactIdentity = runtimeCore.artifactService.reserveArtifactIdentity();
    const storedPayload = await runtimeCore.artifactStorage.materializeJsonPayload({
      artifactId: artifactIdentity._id,
      lineageRootId: artifactIdentity.lineageRootId,
      version: artifactIdentity.version,
      payload: {
        structured: parsed,
        preview: executionResult.preview || {},
        metrics: executionResult.metrics || {},
      },
    });

    const finalized = await runtimeCore.withTransaction(async (tx) => {
      const metrics = {
        ...buildBaseMetrics(parsed),
        ...(executionResult.metrics || {}),
      };

      if (acceptance && acceptance.ok === false) {
        const partialTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
          taskRunId: taskRun._id,
          toStatus: 'partial',
          patch: {
            terminalReason: acceptance.reason || 'acceptance_validation_failed',
            metrics,
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
          reportArtifact: null,
          parsed,
          acceptance,
          executionResult,
        };
      }

      const reportArtifact = await runtimeCore.artifactService.createArtifact(
        {
          ...artifactIdentity,
          kind: 'report',
          sessionId: session._id,
          projectId: session.projectId,
          sourceArtifacts: goalArtifact ? [goalArtifact._id, planArtifact._id] : [planArtifact._id],
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
          summary: buildReportSummary(parsed, artifactSummaryFallback),
          preview: {
            ...buildBasePreview(parsed),
            ...(executionResult.preview || {}),
          },
        },
        tx
      );

      await runtimeCore.taskRunService.appendOutputArtifacts({
        taskRunId: taskRun._id,
        artifactIds: [reportArtifact._id],
        tx,
      });

      const succeededTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
        taskRunId: taskRun._id,
        toStatus: 'succeeded',
        patch: { metrics },
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
              artifactId: reportArtifact._id,
              taskRunId: taskRun._id,
              planId: planArtifact._id,
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
              outputArtifactIds: [reportArtifact._id],
            },
          },
        ],
        tx
      );

      return {
        taskRun: succeededTaskRun,
        reportArtifact,
        parsed,
        acceptance,
        executionResult,
      };
    });

    return finalized;
  } catch (error) {
    await runtimeCore.withTransaction(async (tx) => {
      await runtimeCore.taskRunService.transitionTaskRun({
        taskRunId: taskRun._id,
        toStatus: 'failed',
        patch: {
          terminalReason: failureReason,
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
  runRenderingReportTask,
};
