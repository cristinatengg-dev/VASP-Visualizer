import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useStore } from '../../store/useStore';
import { VolumetricData } from '../../utils/volumetricParser';

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

type WorkerResponse = {
  id: number;
  pos?: { positions: Float32Array; normals: Float32Array; indices: Uint32Array };
  neg?: { positions: Float32Array; normals: Float32Array; indices: Uint32Array };
};

export const IsosurfaceRenderer: React.FC<{ data: VolumetricData, level: number }> = ({ data, level }) => {
  const {
    molecularData,
    isosurfaceMeshPos,
    isosurfaceMeshNeg,
    setIsosurfaceMeshes,
    setIsosurfaceMeshReady,
    isosurfaceColorPos,
    isosurfaceColorNeg,
    isosurfaceOpacity
  } = useStore();

  const isolevel = level || 0.002;
  const workerRef = useRef<Worker | null>(null);
  const jobIdRef = useRef(0);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../../workers/isosurface.worker.ts', import.meta.url), { type: 'module' });
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!data || !molecularData?.latticeVectors || !workerRef.current) return;

    const worker = workerRef.current;
    const latticeVectors = molecularData.latticeVectors;
    const normalizeByCellVolume = (data as any).normalizeByCellVolume !== false;
    const dataIsolevel = isolevel;

    const estimatedGridSide = Math.cbrt(data.data.length);
    const highResolution = Math.max(40, Math.min(100, Math.round(estimatedGridSide / 1.5)));
    const lowResolution = 40;

    const s = useStore.getState();
    const hasExistingMesh = Boolean(s.isosurfaceMeshPos || s.isosurfaceMeshNeg);
    if (!hasExistingMesh) setIsosurfaceMeshReady(false);

    const lowJobId = (jobIdRef.current += 1);
    const highJobId = highResolution > lowResolution ? (jobIdRef.current += 1) : -1;

    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id !== lowJobId && e.data.id !== highJobId) return;
      setIsosurfaceMeshes({ pos: e.data.pos ?? null, neg: e.data.neg ?? null });
      if (e.data.id === lowJobId && highJobId !== -1) {
        const highData = data.data.slice();
        const reqHigh: WorkerRequest = {
          id: highJobId,
          mode: 'high',
          ngx: data.ngx,
          ngy: data.ngy,
          ngz: data.ngz,
          data: highData,
          latticeVectors,
          normalizeByCellVolume,
          level: dataIsolevel,
          resolution: highResolution
        };
        worker.postMessage(reqHigh, [highData.buffer]);
      }
    };

    worker.addEventListener('message', onMessage as any);

    const lowData = data.data.slice();
    const reqLow: WorkerRequest = {
      id: lowJobId,
      mode: 'low',
      ngx: data.ngx,
      ngy: data.ngy,
      ngz: data.ngz,
      data: lowData,
      latticeVectors,
      normalizeByCellVolume,
      level: dataIsolevel,
      resolution: lowResolution
    };
    worker.postMessage(reqLow, [lowData.buffer]);

    return () => {
      worker.removeEventListener('message', onMessage as any);
    };
  }, [data, isolevel, molecularData, setIsosurfaceMeshes, setIsosurfaceMeshReady]);

  const posGeom = useMemo(() => {
    if (!isosurfaceMeshPos) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(isosurfaceMeshPos.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(isosurfaceMeshPos.normals, 3));
    g.setIndex(new THREE.BufferAttribute(isosurfaceMeshPos.indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [isosurfaceMeshPos]);

  const negGeom = useMemo(() => {
    if (!isosurfaceMeshNeg) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(isosurfaceMeshNeg.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(isosurfaceMeshNeg.normals, 3));
    g.setIndex(new THREE.BufferAttribute(isosurfaceMeshNeg.indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [isosurfaceMeshNeg]);

  useEffect(() => () => { posGeom?.dispose(); }, [posGeom]);
  useEffect(() => () => { negGeom?.dispose(); }, [negGeom]);

  return (
    <>
      {posGeom && (
        <mesh geometry={posGeom}>
          <meshStandardMaterial color={isosurfaceColorPos} roughness={0.2} metalness={0.1} side={THREE.DoubleSide} transparent opacity={isosurfaceOpacity} depthWrite={false} />
        </mesh>
      )}
      {negGeom && (
        <mesh geometry={negGeom}>
          <meshStandardMaterial color={isosurfaceColorNeg} roughness={0.2} metalness={0.1} side={THREE.DoubleSide} transparent opacity={isosurfaceOpacity} depthWrite={false} />
        </mesh>
      )}
    </>
  );
};
