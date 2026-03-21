const { generateRenderingImages } = require('../../../rendering/generate-image');

async function runGenerateImageTask({
  runtimeCore,
  policyEngine,
  session,
  goalArtifact,
  planArtifact,
  taskRun,
  promptArtifact,
  imageOptions = {},
}) {
  if (!taskRun) {
    throw new Error('TaskRun is required');
  }
  if (!promptArtifact) {
    throw new Error('Prompt artifact is required');
  }
  if (taskRun.status === 'blocked') {
    throw new Error(`TaskRun ${taskRun._id} is blocked and cannot be executed`);
  }
  if (taskRun.status !== 'queued') {
    throw new Error(`TaskRun ${taskRun._id} must be queued before execution`);
  }

  const compiledPrompt = promptArtifact?.preview?.compiledPrompt;
  if (!compiledPrompt || String(compiledPrompt).trim().length < 10) {
    throw new Error(`Prompt artifact ${promptArtifact._id} does not contain a compiled prompt`);
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
          sourcePromptArtifactId: promptArtifact._id,
        },
      },
      tx
    );
  });

  try {
    const images = await generateRenderingImages({
      prompt: compiledPrompt,
      numberOfImages: imageOptions.numberOfImages,
      aspectRatio: imageOptions.aspectRatio,
      strictNoText: imageOptions.strictNoText,
      strictChemistry: imageOptions.strictChemistry,
      requiredSpecies: imageOptions.requiredSpecies,
      maxAttemptsPerImage: imageOptions.maxAttemptsPerImage,
    });

    const acceptance = await policyEngine.validateAcceptance({
      artifactsCreated: [],
      validatorHints: ['generated_visual_asset'],
      imageCount: images.length,
    });

    const artifactIdentity = runtimeCore.artifactService.reserveArtifactIdentity();
    const storedPayload = await runtimeCore.artifactStorage.materializeVisualAssetPayload({
      artifactId: artifactIdentity._id,
      lineageRootId: artifactIdentity.lineageRootId,
      version: artifactIdentity.version,
      images,
      metadata: {
        sourcePromptArtifactId: promptArtifact._id,
        aspectRatio: imageOptions.aspectRatio,
        strictNoText: imageOptions.strictNoText,
        strictChemistry: imageOptions.strictChemistry,
        requiredSpeciesCount: Array.isArray(imageOptions.requiredSpecies) ? imageOptions.requiredSpecies.length : 0,
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
              imageCount: images.length,
              promptLength: compiledPrompt.length,
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
          visualAssetArtifact: null,
          images,
          acceptance,
        };
      }

      const visualAssetArtifact = await runtimeCore.artifactService.createArtifact(
        {
          ...artifactIdentity,
          kind: 'visual_asset',
          sessionId: session._id,
          projectId: session.projectId,
          sourceArtifacts: [
            ...(goalArtifact ? [goalArtifact._id] : []),
            planArtifact._id,
            promptArtifact._id,
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
          summary: `Generated ${images.length} rendering image${images.length > 1 ? 's' : ''}`,
          preview: {
            artifactType: 'generated_image_batch',
            sourcePromptArtifactId: promptArtifact._id,
            imageCount: images.length,
            aspectRatio: imageOptions.aspectRatio,
            strictNoText: imageOptions.strictNoText,
            strictChemistry: imageOptions.strictChemistry,
            requiredSpeciesCount: Array.isArray(imageOptions.requiredSpecies) ? imageOptions.requiredSpecies.length : 0,
          },
        },
        tx
      );

      await runtimeCore.taskRunService.appendOutputArtifacts({
        taskRunId: taskRun._id,
        artifactIds: [visualAssetArtifact._id],
        tx,
      });

      const succeededTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
        taskRunId: taskRun._id,
        toStatus: 'succeeded',
        patch: {
          metrics: {
            imageCount: images.length,
            promptLength: compiledPrompt.length,
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
            type: 'artifact.visual_asset.created',
            producerType: 'subagent',
            correlationId: taskRun.correlationId,
            payload: {
              artifactId: visualAssetArtifact._id,
              taskRunId: taskRun._id,
              sourcePromptArtifactId: promptArtifact._id,
              imageCount: images.length,
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
              outputArtifactIds: [visualAssetArtifact._id],
            },
          },
        ],
        tx
      );

      return {
        taskRun: succeededTaskRun,
        visualAssetArtifact,
        images,
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
          terminalReason: 'generate_image_failed',
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
  runGenerateImageTask,
};
