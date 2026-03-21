const { buildModelingStructure } = require('../../../modeling/build-structure');

function buildStructureSummary(result) {
  const formula = result?.meta?.formula || result?.data?.formula || 'Unknown structure';
  const system = result?.meta?.system || result?.normalizedIntent?.task_type || 'structure';
  const source = result?.meta?.databaseSourceLabel || result?.meta?.databaseSource || 'database';
  const adsorbates = Array.isArray(result?.meta?.adsorbates) ? result.meta.adsorbates : [];
  const adsorbateSummary = adsorbates.length
    ? ` with ${adsorbates.map((item) => item.formula).join(', ')}`
    : '';
  const doping = result?.meta?.doping;
  const dopingSummary = doping?.dopantElement && doping?.hostElement
    ? ` doped ${doping.hostElement}->${doping.dopantElement}`
    : '';
  const defect = result?.meta?.defect;
  const defectSummary = defect?.type === 'vacancy' && defect?.element
    ? ` with ${defect.element} vacancy`
    : '';
  return `${formula} ${system}${dopingSummary}${defectSummary}${adsorbateSummary} from ${source}`.trim();
}

async function runBuildModelingTask({
  runtimeCore,
  policyEngine,
  session,
  goalArtifact,
  planArtifact,
  taskRun,
  intent,
}) {
  if (!taskRun) {
    throw new Error('TaskRun is required');
  }
  if (!intent || typeof intent !== 'object') {
    throw new Error('Modeling intent is required');
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
          modelingTaskType: intent.task_type || null,
        },
      },
      tx
    );
  });

  try {
    const buildResult = await buildModelingStructure({ intent });
    const acceptance = await policyEngine.validateAcceptance({
      artifactsCreated: [],
      validatorHints: ['modeling_structure'],
      buildResult,
    });

    const artifactIdentity = runtimeCore.artifactService.reserveArtifactIdentity();
    const storedPayload = await runtimeCore.artifactStorage.materializeJsonPayload({
      artifactId: artifactIdentity._id,
      lineageRootId: artifactIdentity.lineageRootId,
      version: artifactIdentity.version,
      payload: {
        intent: buildResult.normalizedIntent,
        structure: buildResult.data,
        exports: buildResult.exports || {},
        meta: buildResult.meta || {},
      },
    });

    const finalized = await runtimeCore.withTransaction(async (tx) => {
      const metrics = {
        totalAtoms: Number(buildResult?.data?.totalAtoms || 0),
        providerCount: Array.isArray(buildResult?.meta?.providersTried)
          ? buildResult.meta.providersTried.length
          : 0,
        adsorbateCount: Array.isArray(buildResult?.meta?.adsorbates)
          ? buildResult.meta.adsorbates.reduce((sum, item) => sum + Number(item?.placedCount || item?.count || 0), 0)
          : 0,
        replacedDopantCount: Number(buildResult?.meta?.doping?.replacedCount || 0),
        removedDefectCount: Number(buildResult?.meta?.defect?.removedCount || 0),
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
          structureArtifact: null,
          buildResult,
        };
      }

      const structureArtifact = await runtimeCore.artifactService.createArtifact(
        {
          ...artifactIdentity,
          kind: 'structure',
          sessionId: session._id,
          projectId: session.projectId,
          sourceArtifacts: Array.from(
            new Set([
              ...(goalArtifact ? [goalArtifact._id] : []),
              planArtifact._id,
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
          summary: buildStructureSummary(buildResult),
          preview: {
            artifactType: 'modeling_structure',
            formula: buildResult?.meta?.formula || buildResult?.data?.formula || null,
            totalAtoms: buildResult?.data?.totalAtoms || 0,
            system: buildResult?.meta?.system || buildResult?.normalizedIntent?.task_type || null,
            hkl: buildResult?.meta?.hkl || null,
            databaseSource: buildResult?.meta?.databaseSource || null,
            databaseSourceLabel: buildResult?.meta?.databaseSourceLabel || null,
            providersTried: buildResult?.meta?.providersTried || [],
            providerPreferences: buildResult?.meta?.providerPreferences || buildResult?.normalizedIntent?.provider_preferences || [],
            taskType: buildResult?.normalizedIntent?.task_type || null,
            latticeVectors: buildResult?.data?.latticeVectors || null,
            adsorbates: buildResult?.meta?.adsorbates || [],
            adsorbateCount: Array.isArray(buildResult?.meta?.adsorbates)
              ? buildResult.meta.adsorbates.reduce((sum, item) => sum + Number(item?.placedCount || item?.count || 0), 0)
              : 0,
            doping: buildResult?.meta?.doping || null,
            defect: buildResult?.meta?.defect || null,
          },
        },
        tx
      );

      await runtimeCore.taskRunService.appendOutputArtifacts({
        taskRunId: taskRun._id,
        artifactIds: [structureArtifact._id],
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
            type: 'artifact.structure.created',
            producerType: 'subagent',
            correlationId: taskRun.correlationId,
            payload: {
              artifactId: structureArtifact._id,
              taskRunId: taskRun._id,
              databaseSource: buildResult?.meta?.databaseSource || null,
              adsorbateCount: Array.isArray(buildResult?.meta?.adsorbates)
                ? buildResult.meta.adsorbates.reduce((sum, item) => sum + Number(item?.placedCount || item?.count || 0), 0)
                : 0,
              replacedDopantCount: Number(buildResult?.meta?.doping?.replacedCount || 0),
              removedDefectCount: Number(buildResult?.meta?.defect?.removedCount || 0),
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
              outputArtifactIds: [structureArtifact._id],
            },
          },
        ],
        tx
      );

      return {
        taskRun: succeededTaskRun,
        structureArtifact,
        buildResult,
      };
    });

    return finalized;
  } catch (error) {
    await runtimeCore.withTransaction(async (tx) => {
      await runtimeCore.taskRunService.transitionTaskRun({
        taskRunId: taskRun._id,
        toStatus: 'failed',
        patch: {
          terminalReason: 'modeling_build_failed',
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
  runBuildModelingTask,
};
