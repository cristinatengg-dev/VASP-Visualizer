const fileIdCache = new WeakMap<File, Promise<string>>();

const toHex = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

export const getStableFileId = (file: File): Promise<string> => {
  const cached = fileIdCache.get(file);
  if (cached) return cached;

  const promise = (async () => {
    const sliceSize = Math.min(file.size, 1024 * 1024);
    const buf = await file.slice(0, sliceSize).arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const shortHash = toHex(hash).slice(0, 16);
    return `${file.name}-${file.size}-${file.lastModified}-${shortHash}`;
  })();

  fileIdCache.set(file, promise);
  return promise;
};

