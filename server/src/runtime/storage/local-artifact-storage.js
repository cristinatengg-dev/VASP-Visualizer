const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

function ensureDirectory(dirPath) {
  return fs.promises.mkdir(dirPath, { recursive: true });
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function guessExtensionFromMime(mimeType) {
  switch (String(mimeType || '').toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'bin';
  }
}

function decodeDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim();
  const match = raw.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
  if (!match) {
    throw new Error('Invalid image data URL');
  }
  const mimeType = match[1];
  const base64 = match[2].replace(/\s+/g, '');
  return {
    mimeType,
    buffer: Buffer.from(base64, 'base64'),
    extension: guessExtensionFromMime(mimeType),
  };
}

function createLocalArtifactStorage() {
  const baseDir = path.resolve(
    process.env.RUNTIME_ARTIFACT_STORAGE_DIR
      || path.join(__dirname, '../../../runtime-storage/artifacts')
  );

  function getArtifactVersionDir({ lineageRootId, version }) {
    return path.join(baseDir, lineageRootId, `v${version}`);
  }

  async function materializeJsonPayload({ artifactId, lineageRootId, version, payload, fileName = 'payload.json' }) {
    const versionDir = getArtifactVersionDir({ lineageRootId, version });
    await ensureDirectory(versionDir);

    const json = JSON.stringify(
      {
        artifactId,
        lineageRootId,
        version,
        payload,
      },
      null,
      2
    );

    const targetPath = path.join(versionDir, fileName);
    await fs.promises.writeFile(targetPath, json, 'utf8');

    return {
      payloadRef: targetPath,
      payloadType: 'json',
      mimeType: 'application/json',
      blobSizeBytes: Buffer.byteLength(json),
      contentHash: sha256(json),
    };
  }

  async function readJsonPayload(payloadRef) {
    const raw = await fs.promises.readFile(String(payloadRef), 'utf8');
    return JSON.parse(raw);
  }

  async function materializeVisualAssetPayload({
    artifactId,
    lineageRootId,
    version,
    images,
    metadata = {},
  }) {
    const versionDir = getArtifactVersionDir({ lineageRootId, version });
    const imagesDir = path.join(versionDir, 'images');
    await ensureDirectory(imagesDir);

    const files = [];
    let totalBytes = 0;

    for (let index = 0; index < images.length; index += 1) {
      const decoded = decodeDataUrl(images[index]);
      const fileName = `image-${String(index + 1).padStart(2, '0')}.${decoded.extension}`;
      const absolutePath = path.join(imagesDir, fileName);
      await fs.promises.writeFile(absolutePath, decoded.buffer);
      totalBytes += decoded.buffer.byteLength;
      files.push({
        name: fileName,
        path: absolutePath,
        mimeType: decoded.mimeType,
        sizeBytes: decoded.buffer.byteLength,
        contentHash: sha256(decoded.buffer),
      });
    }

    const manifest = {
      artifactId,
      lineageRootId,
      version,
      imageCount: files.length,
      files,
      metadata,
    };

    const manifestJson = JSON.stringify(manifest, null, 2);
    const manifestPath = path.join(versionDir, 'manifest.json');
    await fs.promises.writeFile(manifestPath, manifestJson, 'utf8');
    totalBytes += Buffer.byteLength(manifestJson);

    return {
      payloadRef: manifestPath,
      payloadType: 'json',
      mimeType: 'application/json',
      blobSizeBytes: totalBytes,
      contentHash: sha256(manifestJson),
    };
  }

  return {
    baseDir,
    getArtifactVersionDir,
    materializeJsonPayload,
    readJsonPayload,
    materializeVisualAssetPayload,
  };
}

module.exports = {
  createLocalArtifactStorage,
};
