const fs = require('fs');
const path = require('path');
const { materializePotcar } = require('../../compute/potcar');

function ensureDirectory(dirPath) {
  return fs.promises.mkdir(dirPath, { recursive: true });
}

function createLocalJobStorage() {
  const baseDir = path.resolve(
    process.env.RUNTIME_JOB_STORAGE_DIR
      || path.join(__dirname, '../../../runtime-storage/jobs')
  );

  function getJobDir(jobRunId) {
    return path.join(baseDir, String(jobRunId));
  }

  async function materializeComputeWorkdir({
    jobRunId,
    computeInputSetArtifact,
    computeInputPayload,
    profile,
  }) {
    const jobDir = getJobDir(jobRunId);
    const inputDir = path.join(jobDir, 'input');
    await ensureDirectory(inputDir);

    const files = computeInputPayload?.files && typeof computeInputPayload.files === 'object'
      ? computeInputPayload.files
      : {};

    const writtenFiles = [];
    for (const [fileName, content] of Object.entries(files)) {
      const absolutePath = path.join(inputDir, fileName);
      await fs.promises.writeFile(absolutePath, String(content), 'utf8');
      writtenFiles.push({
        fileName,
        path: absolutePath,
      });
    }

    let potcar = {
      configured: false,
      materialized: false,
      reason: 'potcar_spec_missing',
      symbols: [],
    };

    const potcarSpecRaw = files['POTCAR.spec.json'];
    if (potcarSpecRaw) {
      try {
        const parsedSpec = JSON.parse(String(potcarSpecRaw));
        potcar = await materializePotcar({
          inputDir,
          potcarSpec: parsedSpec,
        });

        if (potcar.materialized) {
          writtenFiles.push({
            fileName: potcar.fileName,
            path: potcar.path,
          });
        }
      } catch (error) {
        potcar = {
          configured: false,
          materialized: false,
          reason: `potcar_spec_parse_failed:${error.message}`,
          symbols: [],
        };
      }
    }

    const spec = {
      jobRunId,
      computeInputSetArtifactId: computeInputSetArtifact._id,
      profile: {
        id: profile.id,
        label: profile.label,
        system: profile.system,
        mode: profile.mode,
        schedulerRef: profile.schedulerRef || null,
        local: profile.local || null,
        hpc: profile.hpc || null,
      },
      createdAt: new Date().toISOString(),
      workDir: jobDir,
      inputDir,
      inputFiles: writtenFiles,
      potcar,
      preview: computeInputSetArtifact.preview || {},
    };

    const specPath = path.join(jobDir, 'job-spec.json');
    await fs.promises.writeFile(specPath, JSON.stringify(spec, null, 2), 'utf8');

    return {
      workDir: jobDir,
      inputDir,
      snapshotRef: specPath,
      inputFiles: writtenFiles,
      potcar,
    };
  }

  async function writeJsonSnapshot(filePath, payload) {
    const dirPath = path.dirname(filePath);
    await ensureDirectory(dirPath);
    await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return filePath;
  }

  async function readJsonSnapshot(filePath) {
    const raw = await fs.promises.readFile(String(filePath), 'utf8');
    return JSON.parse(raw);
  }

  return {
    baseDir,
    getJobDir,
    materializeComputeWorkdir,
    writeJsonSnapshot,
    readJsonSnapshot,
  };
}

module.exports = {
  createLocalJobStorage,
};
