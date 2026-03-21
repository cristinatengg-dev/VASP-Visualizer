const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { buildResultMetrics, collectWarnings } = require('../../../compute/parse-results');
const { getHpcSshConfigFromEnv } = require('../../../compute/ssh-config');
const { copyRemoteDirectoryToLocal } = require('../../../compute/ssh-remote');

function deterministicNumber(seed, min, max, digits = 5) {
  const digest = createHash('sha256').update(String(seed)).digest('hex').slice(0, 8);
  const ratio = parseInt(digest, 16) / 0xffffffff;
  const value = min + (max - min) * ratio;
  return Number(value.toFixed(digits));
}

function buildLocalResultPayload({
  jobRun,
  taskRun,
  planArtifact,
  goalArtifact,
  jobSpec,
}) {
  const seed = `${jobRun._id}:${jobRun.externalJobId || ''}:${taskRun._id}`;
  const formula = jobSpec?.preview?.formula || null;
  const workflow = jobSpec?.preview?.workflow || null;

  return {
    resultType: 'local_demo_result_bundle',
    jobRunId: jobRun._id,
    externalJobId: jobRun.externalJobId || null,
    schedulerRef: jobRun.schedulerRef || null,
    system: jobRun.system,
    profileId: jobSpec?.profile?.id || null,
    workDir: jobSpec?.workDir || null,
    sourcePlanArtifactId: planArtifact?._id || null,
    sourceGoalArtifactId: goalArtifact?._id || null,
    sourceTaskRunId: taskRun._id,
    sourceComputeInputSetArtifactId: jobSpec?.computeInputSetArtifactId || null,
    completedAt: jobRun.endedAt ? jobRun.endedAt.toISOString() : null,
    summary: `Local demo compute result for ${formula || 'unknown structure'} (${workflow || 'relax'})`,
    metrics: {
      totalEnergyEv: deterministicNumber(`${seed}:energy`, -14.0, -3.0),
      bandGapEv: deterministicNumber(`${seed}:bandgap`, 0.0, 2.8),
      forceMaxEvPerA: deterministicNumber(`${seed}:force`, 0.001, 0.04),
      elapsedSeconds: Math.max(
        1,
        Math.round(((jobRun.endedAt || new Date()).getTime() - (jobRun.submittedAt || jobRun.createdAt).getTime()) / 1000)
      ),
      converged: true,
    },
    files: {
      workDir: jobSpec?.workDir || null,
      inputFiles: Array.isArray(jobSpec?.inputFiles) ? jobSpec.inputFiles.map((item) => item.fileName) : [],
    },
    notes: [
      'This result bundle comes from the local_demo compute profile.',
      'Replace local_demo submission with real Slurm/PBS execution when cluster configuration is available.',
    ],
  };
}

async function listFilesRecursive(dirPath, rootDir, acc = []) {
  let entries = [];
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (_error) {
    return acc;
  }

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await listFilesRecursive(absolutePath, rootDir, acc);
      continue;
    }
    try {
      const stats = await fs.promises.stat(absolutePath);
      acc.push({
        name: path.relative(rootDir, absolutePath),
        path: absolutePath,
        sizeBytes: stats.size,
      });
    } catch (_error) {
      // Ignore transient file stat errors.
    }
  }

  return acc;
}

async function readTail(filePath, maxChars = 2000) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return raw.length <= maxChars ? raw : raw.slice(-maxChars);
  } catch (_error) {
    return null;
  }
}

function uniqPaths(filePaths) {
  return Array.from(
    new Set(
      (Array.isArray(filePaths) ? filePaths : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
}

async function readTailFromCandidates(filePaths, maxChars = 2000) {
  for (const filePath of uniqPaths(filePaths)) {
    const tail = await readTail(filePath, maxChars);
    if (tail) {
      return tail;
    }
  }
  return null;
}

function findFirstMatchingFile(files, matcher) {
  if (!Array.isArray(files)) {
    return null;
  }
  return files.find((item) => {
    try {
      return Boolean(matcher(item));
    } catch (_error) {
      return false;
    }
  }) || null;
}

async function buildServerFilesystemResultPayload({
  jobRun,
  taskRun,
  planArtifact,
  goalArtifact,
  jobSpec,
}) {
  const workDir = String(jobSpec?.workDir || '');
  const inputDir = String(jobSpec?.inputDir || workDir);
  const profileMode = String(jobSpec?.profile?.mode || (jobRun.system === 'slurm' ? 'slurm' : 'server_local'));
  const runtimeStatusPath = path.join(workDir, 'runtime-status.json');
  const runtimeStatus = await runtimeCoreSafeReadJson(runtimeStatusPath);
  let analysisRootDir = workDir;

  if (profileMode === 'slurm' && runtimeStatus?.remoteWorkDir) {
    const sshConfig = getHpcSshConfigFromEnv();
    if (sshConfig.configured) {
      const remoteSyncDir = path.join(workDir, 'remote-sync');
      try {
        await copyRemoteDirectoryToLocal(sshConfig, runtimeStatus.remoteWorkDir, remoteSyncDir);
        analysisRootDir = remoteSyncDir;
      } catch (error) {
        runtimeStatus.remoteSyncError = error.message;
      }
    }
  }

  const analysisInputDir = profileMode === 'slurm' ? analysisRootDir : inputDir;
  const files = await listFilesRecursive(analysisRootDir, analysisRootDir, []);
  const slurmStdoutFile = findFirstMatchingFile(files, (item) => /^slurm-\d+\.out$/i.test(item.name));
  const slurmStderrFile = findFirstMatchingFile(files, (item) => /^slurm-\d+\.err$/i.test(item.name));

  const oszicarTail = await readTailFromCandidates([
    path.join(analysisInputDir, 'OSZICAR'),
    path.join(analysisRootDir, 'OSZICAR'),
    path.join(inputDir, 'OSZICAR'),
    path.join(workDir, 'OSZICAR'),
  ]);
  const outcarTail = await readTailFromCandidates([
    path.join(analysisInputDir, 'OUTCAR'),
    path.join(analysisRootDir, 'OUTCAR'),
    path.join(inputDir, 'OUTCAR'),
    path.join(workDir, 'OUTCAR'),
  ]);
  const vaspOutTail = await readTailFromCandidates([
    path.join(analysisInputDir, 'vasp.out'),
    path.join(analysisRootDir, 'vasp.out'),
    path.join(inputDir, 'vasp.out'),
    path.join(workDir, 'vasp.out'),
  ]);
  const jobStdoutTail = await readTailFromCandidates([
    runtimeStatus?.stdoutPath,
    path.join(analysisInputDir, 'job.stdout.log'),
    path.join(analysisRootDir, 'job.stdout.log'),
    path.join(inputDir, 'job.stdout.log'),
    path.join(workDir, 'job.stdout.log'),
    slurmStdoutFile?.path,
  ]);
  const jobStderrTail = await readTailFromCandidates([
    runtimeStatus?.stderrPath,
    path.join(analysisInputDir, 'job.stderr.log'),
    path.join(analysisRootDir, 'job.stderr.log'),
    path.join(inputDir, 'job.stderr.log'),
    path.join(workDir, 'job.stderr.log'),
    slurmStderrFile?.path,
  ]);
  const metrics = buildResultMetrics({
    oszicarTail,
    outcarTail,
    vaspOutTail,
    runtimeStatus,
    jobRun,
  });
  const warnings = collectWarnings({
    jobStdoutTail,
    jobStderrTail,
    outcarTail,
    vaspOutTail,
    runtimeStatus,
  });
  const formula = jobSpec?.preview?.formula || null;
  const workflow = jobSpec?.preview?.workflow || null;
  const isSlurm = profileMode === 'slurm';
  const artifactType = isSlurm ? 'slurm_server_result_bundle' : 'local_server_result_bundle';
  const summaryPrefix = isSlurm ? 'Slurm server' : 'Local server';

  return {
    resultType: artifactType,
    jobRunId: jobRun._id,
    externalJobId: jobRun.externalJobId || null,
    schedulerRef: jobRun.schedulerRef || null,
    system: jobRun.system,
    profileId: jobSpec?.profile?.id || null,
    workDir,
    inputDir,
    sourcePlanArtifactId: planArtifact?._id || null,
    sourceGoalArtifactId: goalArtifact?._id || null,
    sourceTaskRunId: taskRun._id,
    sourceComputeInputSetArtifactId: jobSpec?.computeInputSetArtifactId || null,
    completedAt: jobRun.endedAt ? jobRun.endedAt.toISOString() : null,
    summary: `${summaryPrefix} compute result for ${formula || 'unknown structure'} (${workflow || 'relax'})`,
    execution: {
      mode: profileMode,
      command: jobSpec?.profile?.local?.command || jobSpec?.profile?.hpc?.executable || null,
      schedulerRef: jobSpec?.profile?.schedulerRef || jobRun.schedulerRef || null,
      runtimeStatus,
      analysisRootDir,
    },
    metrics,
    files: {
      workDir,
      inputFiles: Array.isArray(jobSpec?.inputFiles) ? jobSpec.inputFiles.map((item) => item.fileName) : [],
      harvestedFiles: files.slice(0, 200),
      detectedOutputs: {
        oszicar: Boolean(oszicarTail),
        outcar: Boolean(outcarTail),
        vaspOut: Boolean(vaspOutTail),
        stdout: Boolean(jobStdoutTail),
        stderr: Boolean(jobStderrTail),
      },
    },
    excerpts: {
      oszicarTail,
      outcarTail,
      vaspOutTail,
      jobStdoutTail,
      jobStderrTail,
    },
    warnings,
    notes: [
      isSlurm
        ? 'This result bundle was harvested from a Slurm workdir on the same server filesystem as the runtime.'
        : 'This result bundle was harvested from a real local process execution on the server.',
      'If VASP output files are present, energy and convergence are parsed opportunistically from OSZICAR/OUTCAR/vasp.out.',
    ],
  };
}

async function runtimeCoreSafeReadJson(filePath) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

async function runHarvestLocalJobTask({
  runtimeCore,
  policyEngine,
  session,
  goalArtifact,
  planArtifact,
  taskRun,
  jobRun,
}) {
  if (!taskRun) {
    throw new Error('TaskRun is required');
  }
  if (!jobRun) {
    throw new Error('JobRun is required');
  }
  if (jobRun.status !== 'completed') {
    throw new Error(`JobRun ${jobRun._id} must be completed before harvesting`);
  }
  if (jobRun.materializationStatus && jobRun.materializationStatus !== 'pending') {
    throw new Error(`JobRun ${jobRun._id} is not pending materialization`);
  }

  const jobSpec = jobRun.snapshotRef
    ? await runtimeCore.jobStorage.readJsonSnapshot(jobRun.snapshotRef)
    : null;

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
        jobRunId: jobRun._id,
        category: 'system',
        type: 'task_run.started',
        producerType: 'execution',
        correlationId: taskRun.correlationId,
        payload: {
          taskRunId: taskRun._id,
          jobRunId: jobRun._id,
          stepId: taskRun.stepId,
        },
      },
      tx
    );
  });

  try {
    const profileMode = String(jobSpec?.profile?.mode || (jobRun.system === 'slurm' ? 'slurm' : ''));
    const isFilesystemHarvest = ['server_local', 'slurm'].includes(profileMode);
    const payload = isFilesystemHarvest
      ? await buildServerFilesystemResultPayload({
        jobRun,
        taskRun,
        planArtifact,
        goalArtifact,
        jobSpec,
      })
      : buildLocalResultPayload({
        jobRun,
        taskRun,
        planArtifact,
        goalArtifact,
        jobSpec,
      });

    const acceptance = await policyEngine.validateAcceptance({
      artifactsCreated: [],
      validatorHints: [
        isFilesystemHarvest
          ? (profileMode === 'slurm' ? 'slurm_server_result_bundle' : 'local_server_result_bundle')
          : 'local_demo_result_bundle',
      ],
      payload,
    });

    const artifactIdentity = runtimeCore.artifactService.reserveArtifactIdentity();
    const storedPayload = await runtimeCore.artifactStorage.materializeJsonPayload({
      artifactId: artifactIdentity._id,
      lineageRootId: artifactIdentity.lineageRootId,
      version: artifactIdentity.version,
      payload,
    });

    const finalized = await runtimeCore.withTransaction(async (tx) => {
      if (acceptance && acceptance.ok === false) {
        await runtimeCore.jobRunService.setMaterializationStatus({
          jobRunId: jobRun._id,
          status: 'failed',
          tx,
        });

        const partialTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
          taskRunId: taskRun._id,
          toStatus: 'partial',
          patch: {
            terminalReason: acceptance.reason || 'acceptance_validation_failed',
          },
          tx,
        });

        await runtimeCore.eventService.emitEvents(
          [
            {
              sessionId: session._id,
              taskRunId: taskRun._id,
              jobRunId: jobRun._id,
              category: 'system',
              type: 'job_run.materialization_failed',
              producerType: 'policy',
              correlationId: taskRun.correlationId,
              payload: {
                jobRunId: jobRun._id,
                reason: acceptance.reason || 'acceptance_validation_failed',
              },
            },
            {
              sessionId: session._id,
              taskRunId: taskRun._id,
              jobRunId: jobRun._id,
              category: 'system',
              type: 'task_run.partial',
              producerType: 'policy',
              correlationId: taskRun.correlationId,
              payload: {
                taskRunId: taskRun._id,
                reason: acceptance.reason || 'acceptance_validation_failed',
              },
            },
          ],
          tx
        );

        return {
          taskRun: partialTaskRun,
          resultArtifact: null,
          payload,
        };
      }

      const resultArtifact = await runtimeCore.artifactService.createArtifact(
        {
          ...artifactIdentity,
          kind: 'result_bundle',
          sessionId: session._id,
          projectId: session.projectId,
          sourceArtifacts: [
            ...(goalArtifact ? [goalArtifact._id] : []),
            ...(planArtifact ? [planArtifact._id] : []),
            ...(jobSpec?.computeInputSetArtifactId ? [jobSpec.computeInputSetArtifactId] : []),
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
          summary: payload.summary,
          preview: {
            artifactType: isFilesystemHarvest
              ? (profileMode === 'slurm' ? 'slurm_server_result_bundle' : 'local_server_result_bundle')
              : 'local_demo_result_bundle',
            jobRunId: jobRun._id,
            externalJobId: jobRun.externalJobId || null,
            system: jobRun.system,
            profileId: jobSpec?.profile?.id || null,
            formula: jobSpec?.preview?.formula || null,
            converged: payload.metrics?.converged ?? null,
            totalEnergyEv: payload.metrics?.totalEnergyEv ?? null,
            bandGapEv: payload.metrics?.bandGapEv ?? null,
            forceMaxEvPerA: payload.metrics?.forceMaxEvPerA ?? payload.metrics?.maxForceEvPerA ?? null,
            rmsForceEvPerA: payload.metrics?.rmsForceEvPerA ?? null,
            ionicStepCount: payload.metrics?.ionicStepCount ?? null,
            warningCount: Array.isArray(payload.warnings) ? payload.warnings.length : 0,
            exitCode: payload.metrics?.exitCode ?? null,
          },
        },
        tx
      );

      await runtimeCore.taskRunService.appendOutputArtifacts({
        taskRunId: taskRun._id,
        artifactIds: [resultArtifact._id],
        tx,
      });

      await runtimeCore.jobRunService.setMaterializationStatus({
        jobRunId: jobRun._id,
        status: 'materialized',
        resultArtifactId: resultArtifact._id,
        tx,
      });

      const succeededTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
        taskRunId: taskRun._id,
        toStatus: 'succeeded',
        patch: {
          metrics: {
            metricCount: Object.keys(payload.metrics || {}).length,
          },
        },
        tx,
      });

      await runtimeCore.eventService.emitEvents(
        [
          {
            sessionId: session._id,
            taskRunId: taskRun._id,
            jobRunId: jobRun._id,
            category: 'domain',
            type: 'artifact.result_bundle.harvested',
            producerType: 'subagent',
            correlationId: taskRun.correlationId,
            payload: {
              artifactId: resultArtifact._id,
              jobRunId: jobRun._id,
              taskRunId: taskRun._id,
              profileId: jobSpec?.profile?.id || null,
            },
          },
          {
            sessionId: session._id,
            taskRunId: taskRun._id,
            jobRunId: jobRun._id,
            category: 'system',
            type: 'task_run.succeeded',
            producerType: 'execution',
            correlationId: taskRun.correlationId,
            payload: {
              taskRunId: taskRun._id,
              outputArtifactIds: [resultArtifact._id],
            },
          },
        ],
        tx
      );

      return {
        taskRun: succeededTaskRun,
        resultArtifact,
        payload,
      };
    });

    return finalized;
  } catch (error) {
    const failedTaskRun = await runtimeCore.withTransaction(async (tx) => {
      await runtimeCore.jobRunService.setMaterializationStatus({
        jobRunId: jobRun._id,
        status: 'failed',
        tx,
      });

      const transitioned = await runtimeCore.taskRunService.transitionTaskRun({
        taskRunId: taskRun._id,
        toStatus: 'failed',
        patch: {
          terminalReason: 'harvest_local_job_failed',
        },
        tx,
      });

      await runtimeCore.eventService.emitEvent(
        {
          sessionId: session._id,
          taskRunId: taskRun._id,
          jobRunId: jobRun._id,
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
      resultArtifact: null,
      payload: null,
      error,
    };
  }
}

module.exports = {
  runHarvestLocalJobTask,
};
