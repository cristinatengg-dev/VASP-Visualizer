/// <reference lib="webworker" />

type InitRequest = {
  type: 'init';
  file: File;
  sessionId: number;
};

type FrameRequest = {
  type: 'frame';
  requestId: number;
  frameIndex: number;
  sessionId: number;
};

type TrailRequest = {
  type: 'trail';
  requestId: number;
  atomIndices: number[];
  maxSamples: number;
  unwrapPbc: boolean;
  sessionId: number;
};

type CancelTrailRequest = {
  type: 'cancel-trail';
  requestId: number;
  sessionId: number;
};

type WorkerRequest = InitRequest | FrameRequest | TrailRequest | CancelTrailRequest;

interface FrameIndexEntry {
  offset: number;
  byteLength: number;
  atomCount: number;
  time: number;
}

interface DecodedFrame {
  coordinates: Float32Array;
  box: Float32Array;
  time: number;
}

const XTC_MAGIC = 1995;
const INDEX_READ_BYTES = 92;
const READ_CHUNK_BYTES = 8 * 1024 * 1024;

const MagicInts = new Uint32Array([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 10, 12, 16, 20, 25, 32, 40, 50, 64,
  80, 101, 128, 161, 203, 256, 322, 406, 512, 645, 812, 1024, 1290,
  1625, 2048, 2580, 3250, 4096, 5060, 6501, 8192, 10321, 13003,
  16384, 20642, 26007, 32768, 41285, 52015, 65536, 82570, 104031,
  131072, 165140, 208063, 262144, 330280, 416127, 524287, 660561,
  832255, 1048576, 1321122, 1664510, 2097152, 2642245, 3329021,
  4194304, 5284491, 6656042, 8388607, 10568983, 13316085, 16777216,
]);

const FIRST_MAGIC_INDEX = 9;
const tmpBytes = new Uint8Array(32);
const tmpIntBytes = new Int32Array(32);

let activeFile: File | null = null;
let activeSessionId = 0;
let frameIndex: FrameIndexEntry[] = [];
let fileReader: ChunkedFileReader | null = null;
const cancelledTrailRequests = new Set<number>();

class ChunkedFileReader {
  private cache = new ArrayBuffer(0);
  private cacheStart = 0;
  private cacheEnd = 0;

  constructor(private readonly file: File) {}

  async view(offset: number, byteLength: number): Promise<DataView> {
    if (offset < 0 || byteLength < 0 || offset + byteLength > this.file.size) {
      throw new Error('XTC 文件在读取时提前结束，文件可能不完整。');
    }

    if (offset < this.cacheStart || offset + byteLength > this.cacheEnd) {
      const end = Math.min(this.file.size, Math.max(offset + byteLength, offset + READ_CHUNK_BYTES));
      this.cache = await this.file.slice(offset, end).arrayBuffer();
      this.cacheStart = offset;
      this.cacheEnd = end;
    }

    return new DataView(this.cache, offset - this.cacheStart, byteLength);
  }
}

function sizeOfInt(size: number) {
  let num = 1;
  let numOfBits = 0;
  while (size >= num && numOfBits < 32) {
    numOfBits += 1;
    num <<= 1;
  }
  return numOfBits;
}

function sizeOfInts(numOfInts: number, sizes: Int32Array) {
  let numOfBytes = 1;
  let numOfBits = 0;
  tmpBytes[0] = 1;

  for (let i = 0; i < numOfInts; i += 1) {
    let byteCount = 0;
    let tmp = 0;
    for (byteCount = 0; byteCount < numOfBytes; byteCount += 1) {
      tmp += tmpBytes[byteCount] * sizes[i];
      tmpBytes[byteCount] = tmp & 0xff;
      tmp >>= 8;
    }
    while (tmp !== 0) {
      tmpBytes[byteCount] = tmp & 0xff;
      byteCount += 1;
      tmp >>= 8;
    }
    numOfBytes = byteCount;
  }

  let num = 1;
  numOfBytes -= 1;
  while (tmpBytes[numOfBytes] >= num) {
    numOfBits += 1;
    num *= 2;
  }
  return numOfBits + numOfBytes * 8;
}

function decodeBits(
  state: Int32Array,
  compressed: Uint8Array,
  requestedBits: number,
  unsignedState: Uint32Array,
) {
  const mask = (1 << requestedBits) - 1;
  let lastBitCount = unsignedState[1];
  let lastBits = unsignedState[2];
  let cursor = state[0];
  let value = 0;
  let numOfBits = requestedBits;

  while (numOfBits >= 8) {
    lastBits = (lastBits << 8) | compressed[cursor];
    cursor += 1;
    value |= (lastBits >> lastBitCount) << (numOfBits - 8);
    numOfBits -= 8;
  }

  if (numOfBits > 0) {
    if (lastBitCount < numOfBits) {
      lastBitCount += 8;
      lastBits = (lastBits << 8) | compressed[cursor];
      cursor += 1;
    }
    lastBitCount -= numOfBits;
    value |= (lastBits >> lastBitCount) & ((1 << numOfBits) - 1);
  }

  value &= mask;
  state[0] = cursor;
  state[1] = lastBitCount;
  state[2] = lastBits;
  return value;
}

function decodeInts(
  state: Int32Array,
  compressed: Uint8Array,
  numOfInts: number,
  requestedBits: number,
  sizes: ArrayLike<number>,
  values: Float32Array,
  unsignedState: Uint32Array,
) {
  let numOfBytes = 0;
  let numOfBits = requestedBits;
  tmpIntBytes[1] = 0;
  tmpIntBytes[2] = 0;
  tmpIntBytes[3] = 0;

  while (numOfBits > 8) {
    tmpIntBytes[numOfBytes] = decodeBits(state, compressed, 8, unsignedState);
    numOfBytes += 1;
    numOfBits -= 8;
  }
  if (numOfBits > 0) {
    tmpIntBytes[numOfBytes] = decodeBits(state, compressed, numOfBits, unsignedState);
    numOfBytes += 1;
  }

  for (let i = numOfInts - 1; i > 0; i -= 1) {
    let value = 0;
    for (let j = numOfBytes - 1; j >= 0; j -= 1) {
      value = (value << 8) | tmpIntBytes[j];
      const quotient = (value / sizes[i]) | 0;
      tmpIntBytes[j] = quotient;
      value -= quotient * sizes[i];
    }
    values[i] = value;
  }

  values[0] = (
    tmpIntBytes[0]
    | (tmpIntBytes[1] << 8)
    | (tmpIntBytes[2] << 16)
    | (tmpIntBytes[3] << 24)
  );
}

async function buildFrameIndex(file: File, sessionId: number) {
  const reader = new ChunkedFileReader(file);
  const entries: FrameIndexEntry[] = [];
  let expectedAtomCount = -1;
  let offset = 0;
  let lastProgressAt = 0;

  while (offset + 52 <= file.size) {
    if (sessionId !== activeSessionId) return null;

    const headerLength = Math.min(INDEX_READ_BYTES, file.size - offset);
    const header = await reader.view(offset, headerLength);
    const magic = header.getInt32(0);
    if (magic !== XTC_MAGIC) {
      throw new Error(`第 ${entries.length + 1} 帧的 XTC 标识无效（偏移 ${offset}）。`);
    }

    const atomCount = header.getInt32(4);
    if (atomCount <= 0) throw new Error('XTC 中的原子数无效。');
    if (expectedAtomCount < 0) expectedAtomCount = atomCount;
    if (atomCount !== expectedAtomCount) {
      throw new Error(`XTC 各帧原子数不一致：期望 ${expectedAtomCount}，检测到 ${atomCount}。`);
    }

    const time = header.getFloat32(12);
    let byteLength: number;
    if (atomCount <= 9) {
      byteLength = 56 + atomCount * 3 * 4;
    } else {
      if (headerLength < INDEX_READ_BYTES) throw new Error('XTC 最后一帧不完整。');
      const storedAtomCount = header.getInt32(52);
      const compressedBytes = header.getInt32(88);
      if (storedAtomCount !== atomCount || compressedBytes < 0) {
        throw new Error(`第 ${entries.length + 1} 帧的压缩坐标块无效。`);
      }
      byteLength = INDEX_READ_BYTES + Math.ceil(compressedBytes / 4) * 4;
    }

    if (offset + byteLength > file.size) throw new Error('XTC 最后一帧坐标数据不完整。');
    entries.push({ offset, byteLength, atomCount, time });
    offset += byteLength;

    const progress = Math.min(1, offset / Math.max(1, file.size));
    if (progress - lastProgressAt >= 0.02 || offset === file.size) {
      lastProgressAt = progress;
      self.postMessage({ type: 'index-progress', sessionId, progress, frameCount: entries.length });
    }
  }

  if (entries.length === 0) throw new Error('XTC 中没有找到可读取的轨迹帧。');
  if (offset !== file.size) {
    const trailingBytes = file.size - offset;
    if (trailingBytes > 3) throw new Error(`XTC 末尾存在 ${trailingBytes} 字节无法识别的数据。`);
  }

  return { entries, reader, atomCount: expectedAtomCount };
}

async function decodeFrame(frameNumber: number): Promise<DecodedFrame> {
  if (!fileReader || !activeFile) throw new Error('请先载入 XTC 文件。');
  const entry = frameIndex[frameNumber];
  if (!entry) throw new Error(`轨迹帧 ${frameNumber + 1} 超出范围。`);

  const view = await fileReader.view(entry.offset, entry.byteLength);
  const atomCount = view.getInt32(4);
  const atomCount3 = atomCount * 3;
  const time = view.getFloat32(12);
  let offset = 16;
  const box = new Float32Array(9);
  for (let i = 0; i < 9; i += 1) {
    box[i] = view.getFloat32(offset) * 10;
    offset += 4;
  }

  const coordinates = new Float32Array(atomCount3);
  if (atomCount <= 9) {
    const storedAtomCount = view.getInt32(offset);
    offset += 4;
    if (storedAtomCount !== atomCount) throw new Error('XTC 未压缩坐标块的原子数不匹配。');
    for (let i = 0; i < atomCount3; i += 1) {
      coordinates[i] = view.getFloat32(offset) * 10;
      offset += 4;
    }
    return { coordinates, box, time };
  }

  const storedAtomCount = view.getInt32(offset);
  offset += 4;
  if (storedAtomCount !== atomCount) throw new Error('XTC 压缩坐标块的原子数不匹配。');

  const precision = view.getFloat32(offset);
  offset += 4;
  if (!Number.isFinite(precision) || precision === 0) throw new Error('XTC 坐标精度无效。');

  const minMaxInt = new Int32Array(6);
  const sizeInt = new Int32Array(3);
  const bitSizeInt = new Int32Array(3);
  const sizeSmall = new Uint32Array(3);
  const thisCoord = new Float32Array(3);
  const prevCoord = new Float32Array(3);
  for (let i = 0; i < 6; i += 1) {
    minMaxInt[i] = view.getInt32(offset);
    offset += 4;
  }
  sizeInt[0] = minMaxInt[3] - minMaxInt[0] + 1;
  sizeInt[1] = minMaxInt[4] - minMaxInt[1] + 1;
  sizeInt[2] = minMaxInt[5] - minMaxInt[2] + 1;

  let bitSize: number;
  if ((sizeInt[0] | sizeInt[1] | sizeInt[2]) > 0xffffff) {
    bitSizeInt[0] = sizeOfInt(sizeInt[0]);
    bitSizeInt[1] = sizeOfInt(sizeInt[1]);
    bitSizeInt[2] = sizeOfInt(sizeInt[2]);
    bitSize = 0;
  } else {
    bitSize = sizeOfInts(3, sizeInt);
  }

  let smallIndex = view.getInt32(offset);
  offset += 4;
  const compressedByteLength = view.getInt32(offset);
  offset += 4;
  if (smallIndex < FIRST_MAGIC_INDEX || smallIndex >= MagicInts.length) {
    throw new Error('XTC 小整数压缩索引无效。');
  }

  const smallerIndex = Math.max(FIRST_MAGIC_INDEX, smallIndex - 1);
  let smaller = (MagicInts[smallerIndex] / 2) | 0;
  let smallNumber = (MagicInts[smallIndex] / 2) | 0;
  sizeSmall[0] = sizeSmall[1] = sizeSmall[2] = MagicInts[smallIndex];

  const compressed = new Uint8Array(
    view.buffer,
    view.byteOffset + offset,
    compressedByteLength,
  );
  const state = new Int32Array(3);
  const unsignedState = new Uint32Array(state.buffer);
  const inversePrecision = 1 / precision;
  let outputOffset = 0;
  let run = 0;
  let atomIndex = 0;

  while (atomIndex < storedAtomCount) {
    if (bitSize === 0) {
      thisCoord[0] = decodeBits(state, compressed, bitSizeInt[0], unsignedState);
      thisCoord[1] = decodeBits(state, compressed, bitSizeInt[1], unsignedState);
      thisCoord[2] = decodeBits(state, compressed, bitSizeInt[2], unsignedState);
    } else {
      decodeInts(state, compressed, 3, bitSize, sizeInt, thisCoord, unsignedState);
    }
    atomIndex += 1;

    thisCoord[0] += minMaxInt[0];
    thisCoord[1] += minMaxInt[1];
    thisCoord[2] += minMaxInt[2];
    prevCoord[0] = thisCoord[0];
    prevCoord[1] = thisCoord[1];
    prevCoord[2] = thisCoord[2];

    const flag = decodeBits(state, compressed, 1, unsignedState);
    let isSmaller = 0;
    if (flag === 1) {
      run = decodeBits(state, compressed, 5, unsignedState);
      isSmaller = run % 3;
      run -= isSmaller;
      isSmaller -= 1;
    }

    if (run > 0) {
      thisCoord[0] = thisCoord[1] = thisCoord[2] = 0;
      for (let k = 0; k < run; k += 3) {
        decodeInts(state, compressed, 3, smallIndex, sizeSmall, thisCoord, unsignedState);
        atomIndex += 1;
        thisCoord[0] += prevCoord[0] - smallNumber;
        thisCoord[1] += prevCoord[1] - smallNumber;
        thisCoord[2] += prevCoord[2] - smallNumber;

        if (k === 0) {
          let swap = thisCoord[0];
          thisCoord[0] = prevCoord[0];
          prevCoord[0] = swap;
          swap = thisCoord[1];
          thisCoord[1] = prevCoord[1];
          prevCoord[1] = swap;
          swap = thisCoord[2];
          thisCoord[2] = prevCoord[2];
          prevCoord[2] = swap;
          coordinates[outputOffset] = prevCoord[0] * inversePrecision * 10;
          coordinates[outputOffset + 1] = prevCoord[1] * inversePrecision * 10;
          coordinates[outputOffset + 2] = prevCoord[2] * inversePrecision * 10;
          outputOffset += 3;
        } else {
          prevCoord[0] = thisCoord[0];
          prevCoord[1] = thisCoord[1];
          prevCoord[2] = thisCoord[2];
        }

        coordinates[outputOffset] = thisCoord[0] * inversePrecision * 10;
        coordinates[outputOffset + 1] = thisCoord[1] * inversePrecision * 10;
        coordinates[outputOffset + 2] = thisCoord[2] * inversePrecision * 10;
        outputOffset += 3;
      }
    } else {
      coordinates[outputOffset] = thisCoord[0] * inversePrecision * 10;
      coordinates[outputOffset + 1] = thisCoord[1] * inversePrecision * 10;
      coordinates[outputOffset + 2] = thisCoord[2] * inversePrecision * 10;
      outputOffset += 3;
    }

    smallIndex += isSmaller;
    if (smallIndex < FIRST_MAGIC_INDEX || smallIndex >= MagicInts.length) {
      throw new Error('XTC 解压过程中遇到无效的小整数索引。');
    }
    if (isSmaller < 0) {
      smallNumber = smaller;
      smaller = smallIndex > FIRST_MAGIC_INDEX ? (MagicInts[smallIndex - 1] / 2) | 0 : 0;
    } else if (isSmaller > 0) {
      smaller = smallNumber;
      smallNumber = (MagicInts[smallIndex] / 2) | 0;
    }
    sizeSmall[0] = sizeSmall[1] = sizeSmall[2] = MagicInts[smallIndex];
  }

  if (outputOffset !== atomCount3) {
    throw new Error(`XTC 帧解压不完整：期望 ${atomCount3} 个坐标值，得到 ${outputOffset}。`);
  }
  return { coordinates, box, time };
}

function makeSampledFrameList(frameCount: number, maxSamples: number) {
  if (maxSamples <= 0 || frameCount <= maxSamples) {
    return Array.from({ length: frameCount }, (_, index) => index);
  }

  const step = Math.max(1, Math.ceil((frameCount - 1) / Math.max(1, maxSamples - 1)));
  const samples: number[] = [];
  for (let i = 0; i < frameCount; i += step) samples.push(i);
  if (samples[samples.length - 1] !== frameCount - 1) samples.push(frameCount - 1);
  return samples;
}

async function buildTrail(request: TrailRequest) {
  const atomIndices = request.atomIndices;
  if (atomIndices.length === 0) throw new Error('轨迹选择中没有原子。');
  const frames = makeSampledFrameList(frameIndex.length, request.maxSamples);
  const segmentCount = Math.max(0, frames.length - 1) * atomIndices.length;
  const position1 = new Float32Array(segmentCount * 3);
  const position2 = new Float32Array(segmentCount * 3);
  let writeOffset = 0;

  const first = await decodeFrame(frames[0]);
  const previousRaw = new Float32Array(atomIndices.length * 3);
  const previousUnwrapped = new Float32Array(atomIndices.length * 3);
  for (let atom = 0; atom < atomIndices.length; atom += 1) {
    const source = atomIndices[atom] * 3;
    const target = atom * 3;
    previousRaw[target] = previousUnwrapped[target] = first.coordinates[source];
    previousRaw[target + 1] = previousUnwrapped[target + 1] = first.coordinates[source + 1];
    previousRaw[target + 2] = previousUnwrapped[target + 2] = first.coordinates[source + 2];
  }

  for (let sampleIndex = 1; sampleIndex < frames.length; sampleIndex += 1) {
    if (
      request.sessionId !== activeSessionId
      || cancelledTrailRequests.has(request.requestId)
    ) {
      cancelledTrailRequests.delete(request.requestId);
      return null;
    }

    const decoded = await decodeFrame(frames[sampleIndex]);
    const boxLengths = [decoded.box[0], decoded.box[4], decoded.box[8]];
    for (let atom = 0; atom < atomIndices.length; atom += 1) {
      const source = atomIndices[atom] * 3;
      const tracked = atom * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        const raw = decoded.coordinates[source + axis];
        let delta = raw - previousRaw[tracked + axis];
        const boxLength = boxLengths[axis];
        if (request.unwrapPbc && Number.isFinite(boxLength) && boxLength > 0) {
          delta -= Math.round(delta / boxLength) * boxLength;
        }
        const unwrapped = previousUnwrapped[tracked + axis] + delta;
        position1[writeOffset + axis] = previousUnwrapped[tracked + axis];
        position2[writeOffset + axis] = unwrapped;
        previousRaw[tracked + axis] = raw;
        previousUnwrapped[tracked + axis] = unwrapped;
      }
      writeOffset += 3;
    }

    if (sampleIndex % 10 === 0 || sampleIndex === frames.length - 1) {
      self.postMessage({
        type: 'trail-progress',
        sessionId: request.sessionId,
        requestId: request.requestId,
        progress: sampleIndex / Math.max(1, frames.length - 1),
      });
    }
  }

  return { position1, position2, sampleCount: frames.length, trackCount: atomIndices.length };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'init') {
      activeSessionId = request.sessionId;
      activeFile = request.file;
      frameIndex = [];
      fileReader = null;
      cancelledTrailRequests.clear();

      const result = await buildFrameIndex(request.file, request.sessionId);
      if (!result || request.sessionId !== activeSessionId) return;
      frameIndex = result.entries;
      fileReader = result.reader;
      const times = new Float64Array(frameIndex.map((entry) => entry.time));
      const timeOffset = times[0] || 0;
      const deltaTime = times.length > 1
        ? (times[times.length - 1] - times[0]) / (times.length - 1)
        : 0;

      self.postMessage({
        type: 'indexed',
        sessionId: request.sessionId,
        atomCount: result.atomCount,
        frameCount: frameIndex.length,
        timeOffset,
        deltaTime,
        duration: Math.max(0, (times[times.length - 1] || timeOffset) - timeOffset),
        times,
      });
      return;
    }

    if (request.sessionId !== activeSessionId) return;

    if (request.type === 'cancel-trail') {
      cancelledTrailRequests.add(request.requestId);
      return;
    }

    if (request.type === 'frame') {
      const decoded = await decodeFrame(request.frameIndex);
      self.postMessage({
        type: 'frame',
        sessionId: request.sessionId,
        requestId: request.requestId,
        frameIndex: request.frameIndex,
        coordinates: decoded.coordinates,
        box: decoded.box,
        time: decoded.time,
      }, [decoded.coordinates.buffer, decoded.box.buffer]);
      return;
    }

    const trail = await buildTrail(request);
    if (!trail) return;
    self.postMessage({
      type: 'trail',
      sessionId: request.sessionId,
      requestId: request.requestId,
      ...trail,
    }, [trail.position1.buffer, trail.position2.buffer]);
  } catch (error) {
    self.postMessage({
      type: 'error',
      sessionId: request.sessionId,
      requestId: 'requestId' in request ? request.requestId : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
