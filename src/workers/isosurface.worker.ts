import * as THREE from 'three';
import { MarchingCubes } from 'three-stdlib';

type WorkerRequest = {
  id: number;
  mode: 'low' | 'high';
  ngx: number;
  ngy: number;
  ngz: number;
  data: Float32Array;
  latticeVectors: number[][];
  normalizeByCellVolume: boolean;
  level: number;
  resolution: number;
};

type MeshData = { positions: Float32Array; normals: Float32Array; indices: Uint32Array };

type WorkerResponse = {
  id: number;
  pos?: MeshData;
  neg?: MeshData;
};

const getCellVolume = (vectors: number[][]) => {
  const v1 = new THREE.Vector3(vectors[0][0], vectors[0][1], vectors[0][2]);
  const v2 = new THREE.Vector3(vectors[1][0], vectors[1][1], vectors[1][2]);
  const v3 = new THREE.Vector3(vectors[2][0], vectors[2][1], vectors[2][2]);
  return v1.dot(v2.cross(v3));
};

const buildFinalMatrix = (vectors: number[][]) => {
  const latticeMatrix = new THREE.Matrix4();
  latticeMatrix.set(
    vectors[0][0], vectors[1][0], vectors[2][0], 0,
    vectors[0][1], vectors[1][1], vectors[2][1], 0,
    vectors[0][2], vectors[1][2], vectors[2][2], 0,
    0, 0, 0, 1
  );
  const mapToUnitMatrix = new THREE.Matrix4().makeScale(0.5, 0.5, 0.5).multiply(new THREE.Matrix4().makeTranslation(1, 1, 1));
  const finalMatrix = new THREE.Matrix4();
  finalMatrix.multiply(latticeMatrix);
  finalMatrix.multiply(mapToUnitMatrix);
  return finalMatrix;
};

const createSampler = (grid: Float32Array, ngx: number, ngy: number, ngz: number, normalizeScale: number) => {
  const plane = ngx * ngy;
  const getVal = (ix: number, iy: number, iz: number) => grid[ix + iy * ngx + iz * plane] * normalizeScale;

  return (x: number, y: number, z: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);

    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const z1 = z0 + 1;

    const ix0 = (x0 % ngx + ngx) % ngx;
    const iy0 = (y0 % ngy + ngy) % ngy;
    const iz0 = (z0 % ngz + ngz) % ngz;

    const ix1 = (x1 % ngx + ngx) % ngx;
    const iy1 = (y1 % ngy + ngy) % ngy;
    const iz1 = (z1 % ngz + ngz) % ngz;

    const xd = x - x0;
    const yd = y - y0;
    const zd = z - z0;

    const c000 = getVal(ix0, iy0, iz0);
    const c100 = getVal(ix1, iy0, iz0);
    const c010 = getVal(ix0, iy1, iz0);
    const c001 = getVal(ix0, iy0, iz1);
    const c101 = getVal(ix1, iy0, iz1);
    const c011 = getVal(ix0, iy1, iz1);
    const c110 = getVal(ix1, iy1, iz0);
    const c111 = getVal(ix1, iy1, iz1);

    const c00 = c000 * (1 - xd) + c100 * xd;
    const c01 = c001 * (1 - xd) + c101 * xd;
    const c10 = c010 * (1 - xd) + c110 * xd;
    const c11 = c011 * (1 - xd) + c111 * xd;

    const c0 = c00 * (1 - yd) + c10 * yd;
    const c1 = c01 * (1 - yd) + c11 * yd;

    return c0 * (1 - zd) + c1 * zd;
  };
};

const buildMesh = (req: WorkerRequest, sign: 1 | -1, finalMatrix: THREE.Matrix4, normalMatrix: THREE.Matrix3, sample: (x: number, y: number, z: number) => number) => {
  const material = new THREE.MeshStandardMaterial();
  const mc = new MarchingCubes(req.resolution, material, false, false, 200000);
  mc.init(req.resolution);

  const scaleX = req.ngx / req.resolution;
  const scaleY = req.ngy / req.resolution;
  const scaleZ = req.ngz / req.resolution;

  for (let k = 0; k < req.resolution; k++) {
    const z = k * scaleZ;
    for (let j = 0; j < req.resolution; j++) {
      const y = j * scaleY;
      for (let i = 0; i < req.resolution; i++) {
        const x = i * scaleX;
        const v = sample(x, y, z);
        mc.setCell(i, j, k, sign === 1 ? v : -v);
      }
    }
  }

  mc.blur(1);
  mc.isolation = req.level;
  mc.update();

  const count = mc.count || 0;
  if (count === 0) return null;

  const positions = mc.positionArray.slice(0, count * 3);
  const normals = mc.normalArray.slice(0, count * 3);
  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) indices[i] = i;

  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < positions.length; i += 3) {
    v.set(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(finalMatrix);
    positions[i] = v.x;
    positions[i + 1] = v.y;
    positions[i + 2] = v.z;
  }
  for (let i = 0; i < normals.length; i += 3) {
    n.set(normals[i], normals[i + 1], normals[i + 2]).applyMatrix3(normalMatrix).normalize();
    normals[i] = n.x;
    normals[i + 1] = n.y;
    normals[i + 2] = n.z;
  }

  return { positions, normals, indices } satisfies MeshData;
};

(self as any).onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const volume = Math.abs(getCellVolume(req.latticeVectors));
  const normalizeScale = req.normalizeByCellVolume ? (volume > 0 ? 1 / volume : 1) : 1;
  const sample = createSampler(req.data, req.ngx, req.ngy, req.ngz, normalizeScale);

  const finalMatrix = buildFinalMatrix(req.latticeVectors);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(finalMatrix);

  const pos = buildMesh(req, 1, finalMatrix, normalMatrix, sample);
  const neg = buildMesh(req, -1, finalMatrix, normalMatrix, sample);

  const resp: WorkerResponse = { id: req.id };
  if (pos) resp.pos = pos;
  if (neg) resp.neg = neg;

  const transfers: any[] = [];
  if (resp.pos) transfers.push(resp.pos.positions.buffer, resp.pos.normals.buffer, resp.pos.indices.buffer);
  if (resp.neg) transfers.push(resp.neg.positions.buffer, resp.neg.normals.buffer, resp.neg.indices.buffer);
  (self as any).postMessage(resp, transfers);
};
