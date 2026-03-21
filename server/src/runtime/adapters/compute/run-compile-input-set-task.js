const { compileComputeInputSet } = require('../../../compute/compile-input-set');

function buildComputeInputSetSummary(result) {
  const workflow = result?.meta?.workflow || result?.normalizedIntent?.workflow || 'relax';
  const formula = result?.meta?.formula || 'Unknown structure';
  const quality = result?.meta?.quality || result?.normalizedIntent?.quality || 'standard';
  return `VASP ${workflow} input set for ${formula} (${quality})`;
}

async function runCompileInputSetTask({
  runtimeCore,
  policyEngine,
  session,
  goalArtifact,
  planArtifact,
  taskRun,
  structureArtifact,
  intent,
}) {
  if (!taskRun) {
    throw new Error('TaskRun is required');
  }
  if (!structureArtifact) {
    throw new Error('A structure artifact is required to compile a compute input set');
  }
  if (taskRun.status === 'blocked') {
    throw new Error(`TaskRun ${taskRun._id} is blocked and cannot be executed`);
  }
  if (taskRun.status !== 'queued') {
    throw new Error(`TaskRun ${taskRun._id} must be queued before execution`);
  }

  const structurePayloadDocument = await runtimeCore.artifactStorage.readJsonPayload(structureArtifact.payloadRef);
  const structurePayload = structurePayloadDocument?.payload || {};
  if (!structurePayload?.structure) {
    throw new Error(`Structure artifact ${structureArtifact._id} does not contain a usable structure payload`);
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
          structureArtifactId: structureArtifact._id,
          computeWorkflow: intent?.workflow || 'relax',
        },
      },
      tx
    );
  });

  try {
    const compileResult = await compileComputeInputSet({
      structure: {
        artifactId: structureArtifact._id,
        data: structurePayload.structure,
        meta: structurePayload.meta || structureArtifact.preview || {},
      },
      intent,
    });

    const acceptance = await policyEngine.validateAcceptance({
      artifactsCreated: [],
      validatorHints: ['compute_input_set'],
      compileResult,
    });

    const artifactIdentity = runtimeCore.artifactService.reserveArtifactIdentity();
    const storedPayload = await runtimeCore.artifactStorage.materializeJsonPayload({
      artifactId: artifactIdentity._id,
      lineageRootId: artifactIdentity.lineageRootId,
      version: artifactIdentity.version,
      payload: {
        intent: compileResult.normalizedIntent,
        sourceStructureArtifactId: structureArtifact._id,
        sourceStructureSummary: {
          formula: structurePayload?.meta?.formula || structureArtifact.preview?.formula || null,
          totalAtoms: structurePayload?.structure?.totalAtoms || structureArtifact.preview?.totalAtoms || null,
          system: structurePayload?.meta?.system || structureArtifact.preview?.system || null,
        },
        files: compileResult.files,
        preview: compileResult.preview || {},
        meta: compileResult.meta || {},
      },
    });

    const finalized = await runtimeCore.withTransaction(async (tx) => {
      const metrics = {
        generatedFileCount: Object.keys(compileResult?.files || {}).length,
        potcarSymbolCount: Array.isArray(compileResult?.meta?.potcarSymbols)
          ? compileResult.meta.potcarSymbols.length
          : 0,
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
          computeInputArtifact: null,
          compileResult,
        };
      }

      const computeInputArtifact = await runtimeCore.artifactService.createArtifact(
        {
          ...artifactIdentity,
          kind: 'compute_input_set',
          sessionId: session._id,
          projectId: session.projectId,
          sourceArtifacts: Array.from(
            new Set([
              ...(goalArtifact ? [goalArtifact._id] : []),
              planArtifact._id,
              structureArtifact._id,
              ...(Array.isArray(taskRun.inputArtifacts) ? taskRun.inputArtifacts : []),
            ])
          ),
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
          summary: buildComputeInputSetSummary(compileResult),
          preview: {
            artifactType: 'compute_input_set',
            sourceStructureArtifactId: structureArtifact._id,
            formula: compileResult?.meta?.formula || null,
            workflow: compileResult?.meta?.workflow || null,
            quality: compileResult?.meta?.quality || null,
            isSlab: Boolean(compileResult?.meta?.isSlab),
            kpointGrid: compileResult?.meta?.kpointGrid || null,
            potcarSymbols: compileResult?.meta?.potcarSymbols || [],
            generatedFiles: compileResult?.meta?.generatedFiles || [],
            databaseSource: compileResult?.meta?.databaseSource || null,
            databaseSourceLabel: compileResult?.meta?.databaseSourceLabel || null,
            providersTried: compileResult?.meta?.providersTried || [],
          },
        },
        tx
      );

      await runtimeCore.taskRunService.appendOutputArtifacts({
        taskRunId: taskRun._id,
        artifactIds: [computeInputArtifact._id],
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
            type: 'artifact.compute_input_set.compiled',
            producerType: 'subagent',
            correlationId: taskRun.correlationId,
            payload: {
              artifactId: computeInputArtifact._id,
              taskRunId: taskRun._id,
              sourceStructureArtifactId: structureArtifact._id,
              workflow: compileResult?.meta?.workflow || null,
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
              outputArtifactIds: [computeInputArtifact._id],
            },
          },
        ],
        tx
      );

      return {
        taskRun: succeededTaskRun,
        computeInputArtifact,
        compileResult,
      };
    });

    return finalized;
  } catch (error) {
    const failedTaskRun = await runtimeCore.withTransaction(async (tx) => {
      const transitioned = await runtimeCore.taskRunService.transitionTaskRun({
        taskRunId: taskRun._id,
        toStatus: 'failed',
        patch: {
          terminalReason: 'compute_compile_failed',
          metrics: {
            sourceStructureAtoms: Number(structureArtifact?.preview?.totalAtoms || 0),
          },
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

      return transitioned;
    });

    return {
      taskRun: failedTaskRun,
      computeInputArtifact: null,
      compileResult: null,
      error,
    };
  }
}

module.exports = {
  runCompileInputSetTask,
};
