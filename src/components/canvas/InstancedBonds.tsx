import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useStore, tempAtomPositions } from '../../store/useStore';
import { Atom } from '../../types';
import { useAllBondMaterials } from '../../hooks/useMaterialSystem';

interface InstancedBondsProps {
  atoms: Atom[];
  onBondClick?: (bondInfo: { elementA: string; elementB: string; distance: number }) => void;
}

const MAX_BONDS = 1000000;

const start = new THREE.Vector3();
const end = new THREE.Vector3();
const mid = new THREE.Vector3();
const diff = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const dummy = new THREE.Object3D();
const colorObj = new THREE.Color();
const rotation = new THREE.Quaternion();

const highResGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1); 
highResGeo.translate(0, 0.5, 0);

const lowResGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
lowResGeo.translate(0, 0.5, 0);

export const InstancedBonds: React.FC<InstancedBondsProps> = ({ atoms, onBondClick }) => {
  const { molecularData, styleConfig, materialStyle, showBonds, stickRadius } = useStore();
  const bondMaterials = useAllBondMaterials();
  const meshRef = useRef<THREE.InstancedMesh | null>(null);

  const geometry = useMemo(() => atoms.length > 5000 ? lowResGeo : highResGeo, [atoms.length]);

  const bondsData = useMemo(() => {
    if (!showBonds) return [];
    if (!molecularData || styleConfig.bondRules.length === 0 || atoms.length === 0) return [];
    if (atoms.length > 50000) {
        console.warn("Too many atoms, auto-disabling bond calculation to prevent crash.");
        return [];
    }
    
    const usePBC = styleConfig.usePBC && molecularData.latticeVectors && molecularData.latticeVectors.length === 3;
    
    // Precompute lattice matrix and its inverse (used for both PBC and non-PBC cross-boundary checks)
    let lattMat: number[][] | null = null;
    let invLatt: number[][] | null = null;
    if (molecularData.latticeVectors && molecularData.latticeVectors.length === 3) {
        lattMat = molecularData.latticeVectors; // [a, b, c] each is [x, y, z]
        const [a, b, c] = lattMat;
        const det = a[0]*(b[1]*c[2]-b[2]*c[1]) - a[1]*(b[0]*c[2]-b[2]*c[0]) + a[2]*(b[0]*c[1]-b[1]*c[0]);
        if (Math.abs(det) > 1e-10) {
            invLatt = [
                [(b[1]*c[2]-b[2]*c[1])/det, (a[2]*c[1]-a[1]*c[2])/det, (a[1]*b[2]-a[2]*b[1])/det],
                [(b[2]*c[0]-b[0]*c[2])/det, (a[0]*c[2]-a[2]*c[0])/det, (a[2]*b[0]-a[0]*b[2])/det],
                [(b[0]*c[1]-b[1]*c[0])/det, (a[1]*c[0]-a[0]*c[1])/det, (a[0]*b[1]-a[1]*b[0])/det],
            ];
        }
        // Only use lattMat for PBC minimum-image logic
        if (!usePBC) lattMat = null;
    }

    // Minimum image displacement with PBC
    // Returns [dx, dy, dz, isPBC] where isPBC=true means the bond crosses a boundary
    const getMinImageDelta = (dx: number, dy: number, dz: number): [number, number, number, boolean] => {
        if (!invLatt || !lattMat) return [dx, dy, dz, false];
        // Convert to fractional coordinates
        // Fix: Use column-vectors of Inverse Matrix (Transpose of Row-major Inverse) for correct coordinate transform
        // u = x*Inv[0][0] + y*Inv[1][0] + z*Inv[2][0]
        const fx = invLatt[0][0]*dx + invLatt[1][0]*dy + invLatt[2][0]*dz;
        const fy = invLatt[0][1]*dx + invLatt[1][1]*dy + invLatt[2][1]*dz;
        const fz = invLatt[0][2]*dx + invLatt[1][2]*dy + invLatt[2][2]*dz;

        // Apply minimum image (wrap to [-0.5, 0.5])
        const fxw = fx - Math.round(fx);
        const fyw = fy - Math.round(fy);
        const fzw = fz - Math.round(fz);
        // Check if wrapping occurred (i.e., bond crosses boundary)
        const isPBC = Math.abs(fxw - fx) > 0.01 || Math.abs(fyw - fy) > 0.01 || Math.abs(fzw - fz) > 0.01;
        // Convert back to Cartesian
        const [a, b, c] = lattMat;
        return [
            fxw*a[0] + fyw*b[0] + fzw*c[0],
            fxw*a[1] + fyw*b[1] + fzw*c[1],
            fxw*a[2] + fyw*b[2] + fzw*c[2],
            isPBC
        ];
    };

    const computedBonds: Array<{
      idxA: number; idxB: number;
      colorA: string; colorB: string;
      // For PBC cross-boundary bonds: store the actual end positions (in Cartesian)
      // endAx/y/z = position of atom A (unchanged)
      // endBx/y/z = position of atom B corrected by minimum image (may differ from atom B's actual position)
      isPBCBond: boolean;
      pbcEndBx: number; pbcEndBy: number; pbcEndBz: number;
    }> = [];

    const count = atoms.length;
    let maxThreshold = 0;
    styleConfig.bondRules.forEach(r => maxThreshold = Math.max(maxThreshold, r.threshold));
    
    if (maxThreshold === 0 || maxThreshold > 5.0) return [];

    const cellSize = Math.max(0.5, maxThreshold);
    const grid: Record<string, number[]> = {};
    const ruleMap = new Map<string, number>();
    const normEl = (v: unknown) => String(v ?? '').trim();
    for (const r of styleConfig.bondRules) {
        const a = normEl(r.atomA);
        const b = normEl(r.atomB);
        if (!a || !b) continue;
        const t = Number(r.threshold);
        if (!Number.isFinite(t) || t <= 0) continue;
        const k = a <= b ? `${a}|${b}` : `${b}|${a}`;
        ruleMap.set(k, t);
    }
    
    for(let i=0; i<count; i++) {
        const p = atoms[i].position;
        if (isNaN(p.x) || isNaN(p.y) || isNaN(p.z)) continue;

        const key = `${Math.floor(p.x/cellSize)},${Math.floor(p.y/cellSize)},${Math.floor(p.z/cellSize)}`;
        if (!grid[key]) grid[key] = [];
        grid[key].push(i);
    }

    // For PBC: compute the grid bounds so we know which grid cells are at the boundary
    let minGX = Infinity, minGY = Infinity, minGZ = Infinity;
    let maxGX = -Infinity, maxGY = -Infinity, maxGZ = -Infinity;
    if (usePBC) {
        for (let i = 0; i < count; i++) {
            const p = atoms[i].position;
            if (isNaN(p.x)) continue;
            const gx = Math.floor(p.x/cellSize);
            const gy = Math.floor(p.y/cellSize);
            const gz = Math.floor(p.z/cellSize);
            if (gx < minGX) minGX = gx;
            if (gy < minGY) minGY = gy;
            if (gz < minGZ) minGZ = gz;
            if (gx > maxGX) maxGX = gx;
            if (gy > maxGY) maxGY = gy;
            if (gz > maxGZ) maxGZ = gz;
        }
    }

    const neighborOffsets = [];
    for(let x=-1; x<=1; x++) for(let y=-1; y<=1; y++) for(let z=-1; z<=1; z++) neighborOffsets.push([x,y,z]);

    // Precompute fractional coordinates for cross-boundary check (non-PBC mode)
    // When usePBC=false, we follow OVITO/VESTA logic: only bond atoms within the cell,
    // no cross-boundary bonds. We detect cross-boundary by checking if the bond vector
    // in fractional space has any component > 0.5 (meaning it would cross a periodic boundary).
    const fracCoords: Array<[number, number, number]> | null = (!usePBC && invLatt) ? 
        atoms.map(atom => {
            const p = atom.position;
            // Fix: Use column-vectors for transformation P * M^-1
            const fx = invLatt![0][0]*p.x + invLatt![1][0]*p.y + invLatt![2][0]*p.z;
            const fy = invLatt![0][1]*p.x + invLatt![1][1]*p.y + invLatt![2][1]*p.z;
            const fz = invLatt![0][2]*p.x + invLatt![1][2]*p.y + invLatt![2][2]*p.z;
            return [fx, fy, fz];
        }) : null;

    // When usePBC=false, check if two atoms would require crossing a periodic boundary
    // to connect (i.e., the shorter path goes through the boundary).
    // Returns true if the bond should be SKIPPED (cross-boundary).
    const isCrossBoundaryBond = (i: number, j: number): boolean => {
        if (!fracCoords) return false; // No lattice info or PBC mode, skip check
        const [fxA, fyA, fzA] = fracCoords[i];
        const [fxB, fyB, fzB] = fracCoords[j];
        const dfx = Math.abs(fxA - fxB);
        const dfy = Math.abs(fyA - fyB);
        const dfz = Math.abs(fzA - fzB);
        // If fractional distance in any dimension >= 0.45, the shorter path is through the boundary.
        // Threshold 0.45 (tighter than 0.5) prevents edge-case leakage in non-orthogonal cells.
        // This replicates OVITO/VESTA behavior: no cross-cell bonds without explicit PBC.
        if (dfx > 0.45 || dfy > 0.45 || dfz > 0.45) return true;
        return false;
    };

    if (count <= 4000) {
        for (let i = 0; i < count; i++) {
            const atomA = atoms[i];
            const pA = atomA.position;
            if (isNaN(pA.x) || isNaN(pA.y) || isNaN(pA.z)) continue;

            for (let j = i + 1; j < count; j++) {
                const atomB = atoms[j];
                const e1 = normEl(atomA.element);
                const e2 = normEl(atomB.element);
                const rk = e1 <= e2 ? `${e1}|${e2}` : `${e2}|${e1}`;
                const threshold = ruleMap.get(rk);
                if (!threshold) continue;

                let dx = pA.x - atomB.position.x;
                let dy = pA.y - atomB.position.y;
                let dz = pA.z - atomB.position.z;
                let isPBCBond = false;

                if (usePBC) {
                    const [mdx, mdy, mdz, isCross] = getMinImageDelta(dx, dy, dz);
                    dx = mdx;
                    dy = mdy;
                    dz = mdz;
                    isPBCBond = isCross;
                } else {
                    // if (isCrossBoundaryBond(i, j)) continue;
                }

                const distSq = dx * dx + dy * dy + dz * dz;
                if (distSq <= threshold * threshold && distSq > 0.01) {
                    const pbcEndBx = pA.x - dx;
                    const pbcEndBy = pA.y - dy;
                    const pbcEndBz = pA.z - dz;

                    computedBonds.push({
                        idxA: i,
                        idxB: j,
                        colorA: styleConfig.customColors[atomA.element] || atomA.color,
                        colorB: styleConfig.customColors[atomB.element] || atomB.color,
                        isPBCBond,
                        pbcEndBx,
                        pbcEndBy,
                        pbcEndBz,
                    });
                    if (computedBonds.length >= MAX_BONDS) return computedBonds;
                }
            }
        }
    } else {
        for (let i = 0; i < count; i++) {
            const atomA = atoms[i];
            const pA = atomA.position;
            if (isNaN(pA.x) || isNaN(pA.y) || isNaN(pA.z)) continue;
            
            const cx = Math.floor(pA.x/cellSize);
            const cy = Math.floor(pA.y/cellSize);
            const cz = Math.floor(pA.z/cellSize);

            for (const offset of neighborOffsets) {
                const nx = cx + offset[0];
                const ny = cy + offset[1];
                const nz = cz + offset[2];
                
                const key = `${nx},${ny},${nz}`;
                const neighbors = grid[key];
                if (neighbors) {
                    for (const j of neighbors) {
                        if (j <= i) continue; 
                        const atomB = atoms[j];
                        const e1 = normEl(atomA.element);
                        const e2 = normEl(atomB.element);
                        const rk = e1 <= e2 ? `${e1}|${e2}` : `${e2}|${e1}`;
                        const threshold = ruleMap.get(rk);
                        
                        if (threshold) {
                            // if (!usePBC && isCrossBoundaryBond(i, j)) continue;

                            let dx = pA.x - atomB.position.x;
                            let dy = pA.y - atomB.position.y;
                            let dz = pA.z - atomB.position.z;
                            let isPBCBond = false;
                            
                            if (usePBC) {
                                const [mdx, mdy, mdz, isCross] = getMinImageDelta(dx, dy, dz);
                                dx = mdx; dy = mdy; dz = mdz;
                                isPBCBond = isCross;
                            }
                            
                            const distSq = dx*dx + dy*dy + dz*dz;
                            if (distSq <= threshold * threshold && distSq > 0.01) {
                                const pbcEndBx = pA.x - dx;
                                const pbcEndBy = pA.y - dy;
                                const pbcEndBz = pA.z - dz;
                                
                                computedBonds.push({ 
                                    idxA: i, idxB: j, 
                                    colorA: styleConfig.customColors[atomA.element] || atomA.color,
                                    colorB: styleConfig.customColors[atomB.element] || atomB.color,
                                    isPBCBond,
                                    pbcEndBx, pbcEndBy, pbcEndBz,
                                });
                                if (computedBonds.length >= MAX_BONDS) return computedBonds;
                            }
                        }
                    }
                }
                
                if (usePBC && lattMat && (
                    nx < minGX || nx > maxGX ||
                    ny < minGY || ny > maxGY ||
                    nz < minGZ || nz > maxGZ
                )) {
                    const spanX = maxGX - minGX + 1;
                    const spanY = maxGY - minGY + 1;
                    const spanZ = maxGZ - minGZ + 1;
                    
                    if (spanX <= 0 || spanY <= 0 || spanZ <= 0) continue;
                    
                    const wnx = ((nx - minGX) % spanX + spanX) % spanX + minGX;
                    const wny = ((ny - minGY) % spanY + spanY) % spanY + minGY;
                    const wnz = ((nz - minGZ) % spanZ + spanZ) % spanZ + minGZ;
                    
                    if (wnx === nx && wny === ny && wnz === nz) continue;
                    
                    const wkey = `${wnx},${wny},${wnz}`;
                    const wneighbors = grid[wkey];
                    if (!wneighbors) continue;
                    
                    for (const j of wneighbors) {
                        if (j <= i) continue;
                        const atomB = atoms[j];
                        const e1 = normEl(atomA.element);
                        const e2 = normEl(atomB.element);
                        const rk = e1 <= e2 ? `${e1}|${e2}` : `${e2}|${e1}`;
                        const threshold = ruleMap.get(rk);
                        
                        if (threshold) {
                            let dx = pA.x - atomB.position.x;
                            let dy = pA.y - atomB.position.y;
                            let dz = pA.z - atomB.position.z;
                            
                            const [mdx, mdy, mdz, isCross] = getMinImageDelta(dx, dy, dz);
                            if (!isCross) continue;
                            
                            dx = mdx; dy = mdy; dz = mdz;
                            
                            const distSq = dx*dx + dy*dy + dz*dz;
                            if (distSq <= threshold * threshold && distSq > 0.01) {
                                const pbcEndBx = pA.x - dx;
                                const pbcEndBy = pA.y - dy;
                                const pbcEndBz = pA.z - dz;
                                
                                computedBonds.push({ 
                                    idxA: i, idxB: j, 
                                    colorA: styleConfig.customColors[atomA.element] || atomA.color,
                                    colorB: styleConfig.customColors[atomB.element] || atomB.color,
                                    isPBCBond: true,
                                    pbcEndBx, pbcEndBy, pbcEndBz,
                                });
                                if (computedBonds.length >= MAX_BONDS) return computedBonds;
                            }
                        }
                    }
                }
            }
        }
    }
    return computedBonds;
  }, [showBonds, molecularData, atoms, styleConfig.bondRules, styleConfig.customColors, styleConfig.usePBC]); 

  const instanceCapacity = useMemo(() => {
    if (!showBonds) return 1;
    const desired = Math.max(1, Math.min(MAX_BONDS, bondsData.length * 2));
    return Math.max(1, desired);
  }, [showBonds, bondsData.length]);

  const activeStyle = (materialStyle === 'vesta' || materialStyle === 'stick') ? materialStyle : 'preview';

  const writeInstances = (useTempPositions: boolean) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    let instanceCount = 0;
    const bondRadius = (materialStyle === 'stick') ? stickRadius : (materialStyle === 'vesta' ? 0.12 : 0.15);

    const getPos = (idx: number, vec: THREE.Vector3) => {
      const atom = atoms[idx];
      if (useTempPositions) {
        const temp = tempAtomPositions.get(atom.id);
        if (temp) {
          vec.set(temp.x, temp.y, temp.z);
          return;
        }
      }
      vec.copy(atom.position as any);
    };

    for (let i = 0; i < bondsData.length; i++) {
      if (instanceCount + 2 >= instanceCapacity) break;
      const bond = bondsData[i];
      const { idxA, idxB, colorA, colorB, isPBCBond, pbcEndBx, pbcEndBy, pbcEndBz } = bond;
      
      getPos(idxA, start);
      
      if (isPBCBond) {
        // For PBC bonds, use the minimum-image corrected position for atom B
        end.set(pbcEndBx, pbcEndBy, pbcEndBz);
      } else {
        getPos(idxB, end);
      }
      
      if (isNaN(start.x) || isNaN(end.x)) continue;
      const fullLen = start.distanceTo(end);
      if (!Number.isFinite(fullLen) || fullLen <= 0.01) continue;
      const halfLen = fullLen / 2;

      // Half bond from A toward B (color A)
      diff.subVectors(end, start).normalize();
      rotation.setFromUnitVectors(up, diff);
      dummy.position.copy(start);
      dummy.quaternion.copy(rotation);
      dummy.scale.set(bondRadius, halfLen, bondRadius);
      dummy.updateMatrix();
      mesh.setMatrixAt(instanceCount, dummy.matrix);
      colorObj.set(colorA);
      mesh.setColorAt(instanceCount, colorObj);
      instanceCount++;

      // Half bond from B toward A (color B)
      diff.subVectors(start, end).normalize();
      rotation.setFromUnitVectors(up, diff);
      dummy.position.copy(end);
      dummy.quaternion.copy(rotation);
      dummy.scale.set(bondRadius, halfLen, bondRadius);
      dummy.updateMatrix();
      mesh.setMatrixAt(instanceCount, dummy.matrix);
      colorObj.set(colorB);
      mesh.setColorAt(instanceCount, colorObj);
      instanceCount++;
    }

    mesh.count = instanceCount;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.visible = instanceCount > 0;
  };

  React.useLayoutEffect(() => {
    if (!showBonds) return;
    writeInstances(false);
  }, [showBonds, activeStyle, stickRadius, instanceCapacity, bondsData, atoms]);

  useFrame(() => {
    const isDragging = tempAtomPositions.size > 0;
    const isPlaying = molecularData?.trajectory?.isPlaying;
    if (!isDragging && !isPlaying) return;

    if (atoms.length > 5000 && isPlaying) return;
    writeInstances(true);
  });

  const handlePointerDown = (e: any) => {
    if (!onBondClick) return;
    const instanceId = e.instanceId;
    if (instanceId === undefined || instanceId === null) return;
    // Each bond uses 2 instances (half A and half B), so bond index = floor(instanceId / 2)
    const bondIdx = Math.floor(instanceId / 2);
    const bond = bondsData[bondIdx];
    if (!bond) return;
    e.stopPropagation();
    const atomA = atoms[bond.idxA];
    const atomB = atoms[bond.idxB];
    const posA = new THREE.Vector3(atomA.position.x, atomA.position.y, atomA.position.z);
    let posB: THREE.Vector3;
    if (bond.isPBCBond) {
      posB = new THREE.Vector3(bond.pbcEndBx, bond.pbcEndBy, bond.pbcEndBz);
    } else {
      posB = new THREE.Vector3(atomB.position.x, atomB.position.y, atomB.position.z);
    }
    const distance = posA.distanceTo(posB);
    onBondClick({ elementA: atomA.element, elementB: atomB.element, distance });
  };

  return (
    <instancedMesh
      ref={(el) => { meshRef.current = el; }}
      args={[geometry, undefined, instanceCapacity]}
      userData={{ isBond: true }}
      castShadow
      receiveShadow
      frustumCulled={false}
      material={bondMaterials[activeStyle as keyof typeof bondMaterials] || bondMaterials.preview}
      onPointerDown={onBondClick ? handlePointerDown : undefined}
    />
  );
};
