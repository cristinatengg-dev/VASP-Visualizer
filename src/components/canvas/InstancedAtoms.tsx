import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useStore, tempAtomPositions } from '../../store/useStore'; 
import { Atom } from '../../types';
import { getAtomProperties } from '../../utils/atomData';
import { useAllMaterials } from '../../hooks/useMaterialSystem';

interface InstancedAtomsProps {
  atoms: Atom[]; 
  onAtomPointerDown?: (e: any, atom: Atom) => void;
}

const sphereHigh = new THREE.SphereGeometry(1, 32, 32);
const sphereMid = new THREE.SphereGeometry(1, 16, 16);
const sphereLow = new THREE.SphereGeometry(1, 8, 8);

const dummy = new THREE.Object3D();
const colorObj = new THREE.Color();

export const InstancedAtoms: React.FC<InstancedAtomsProps> = ({ atoms, onAtomPointerDown }) => {
  const { molecularData, toggleSelectedAtomId, setHoveredAtom, materialStyle, globalElementSettings, selectedAtomIds } = useStore();
  const meshRefs = useRef<Record<string, THREE.InstancedMesh>>({});
  const materials = useAllMaterials();

  const geometry = useMemo(() => {
      const count = atoms.length;
      if (count > 20000) return sphereLow;
      if (count > 5000) return sphereMid;
      return sphereHigh;
  }, [atoms.length]);

  const groupedAtoms = useMemo(() => {
      const groups: Record<string, Atom[]> = {};
      atoms.forEach(atom => {
          if (!atom.element) return; // Safety check
          
          // 只有局部渲染了样式或处于选中状态的原子才可能需要特殊分组
          // 但为了逻辑统一，我们按 (元素 + 局部样式) 进行分组
          const style = atom.renderStyle || 'default';
          const key = `${atom.element}::${style}`;
          
          if (!groups[key]) groups[key] = [];
          groups[key].push(atom);
      });
      return groups;
  }, [atoms]);

  // Handle Dynamic Updates
  const updateInstances = () => {
      Object.entries(groupedAtoms).forEach(([key, groupAtoms]) => {
        const mesh = meshRefs.current[key];
        if (!mesh) return;
  
        mesh.count = groupAtoms.length;

        const [element, atomStyle] = key.split('::');
        const currentEffectiveStyle = atomStyle !== 'default' ? atomStyle : materialStyle;

        let baseRadius = 1.0;
        const globalSetting = globalElementSettings[element];
        
        if (globalSetting?.radius) {
            baseRadius = globalSetting.radius;
        } else {
            const props = getAtomProperties(element);
            baseRadius = props.radius; 
        }

        groupAtoms.forEach((atom, i) => {
          let x = atom.position.x;
          let y = atom.position.y;
          let z = atom.position.z;
  
          // A. 优先读取拖拽缓存
          const tempPos = tempAtomPositions.get(atom.id);
          if (tempPos) {
              x = tempPos.x;
              y = tempPos.y;
              z = tempPos.z;
          } else if (molecularData?.trajectory?.isPlaying && molecularData.trajectory.frames) {
              // B. 动画播放时读取轨迹帧
              const frameData = molecularData.trajectory.frames[molecularData.trajectory.currentFrame];
              if (frameData) {
                  const parts = atom.id.split('-');
                  const originalIndex = parseInt(parts[1]);
                  if (!isNaN(originalIndex)) {
                      const idx3 = originalIndex * 3;
                      if (idx3 + 2 < frameData.length) {
                          x = frameData[idx3];
                          y = frameData[idx3+1];
                          z = frameData[idx3+2];
                      }
                  }
              }
          }
          
          // Safety guard against NaN updates
          if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
              dummy.position.set(x, y, z);
              
              // 半径逻辑：如果是 Stick 风格则缩小，Classic (vesta) 则适当增大以匹配图 3 比例
              let finalRadius = baseRadius;
              if (currentEffectiveStyle === 'stick') {
                  finalRadius *= 0.12;
              } else if (currentEffectiveStyle === 'vesta') {
                  finalRadius *= 0.45;
              }
              
              dummy.scale.setScalar(finalRadius);
              dummy.updateMatrix();
              mesh.setMatrixAt(i, dummy.matrix);

              // 颜色逻辑：选中状态优先显示金色 (#FFD700)
              const isSelected = selectedAtomIds.includes(atom.id);
              if (isSelected) {
                  colorObj.set('#FFD700');
              } else {
                  const color = globalElementSettings[element]?.color || atom.color || '#ffffff';
                  colorObj.set(color);
              }
              mesh.setColorAt(i, colorObj);
          }
        });
        
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      });
  };

  // Initial Render & Static Updates
  React.useLayoutEffect(() => {
      updateInstances();
  }, [groupedAtoms, materialStyle, globalElementSettings, selectedAtomIds, molecularData?.trajectory?.currentFrame]);

  useFrame(() => {
    const isDragging = tempAtomPositions.size > 0;
    const isPlaying = molecularData?.trajectory?.isPlaying;
    if (!isDragging && !isPlaying) return; 
    
    updateInstances();
  });

  const handlePointerDown = (e: any, key: string) => {
      e.stopPropagation();
      const instanceId = e.instanceId;
      const group = groupedAtoms[key];
      if (group && group[instanceId]) {
          const atom = group[instanceId];
          if (onAtomPointerDown) onAtomPointerDown(e, atom);
          else toggleSelectedAtomId(atom.id, e.shiftKey || e.ctrlKey);
      }
  };

  const handlePointerOver = (e: any, key: string) => {
      e.stopPropagation();
      const group = groupedAtoms[key];
      if (group && group[e.instanceId]) {
          const atom = group[e.instanceId];
          document.body.style.cursor = 'pointer';
          setHoveredAtom({ id: atom.id, element: atom.element, index: parseInt(atom.id.split('-')[1] || '0') });
      }
  };

  const handlePointerOut = () => {
      document.body.style.cursor = 'default';
      setHoveredAtom(null);
  };

  return (
    <group>
      {Object.entries(groupedAtoms).map(([key, groupAtoms]) => {
        const count = groupAtoms.length;
        if (count === 0) return null;
        
        const [element, atomStyle] = key.split('::');
        const effectiveStyle = atomStyle !== 'default' ? atomStyle : materialStyle;
        const targetMaterial = materials[effectiveStyle as keyof typeof materials] || materials.preview;
        
        return (
          <instancedMesh
            key={`${molecularData?.id ?? 'no-mol'}::${key}::${count}::${geometry.uuid}`}
            ref={(el) => { 
                if (el) {
                    meshRefs.current[key] = el; 
                    el.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
                }
            }}
            args={[geometry, undefined, count]}
            userData={{ isInstancedAtom: true, element }}
            onPointerDown={(e) => handlePointerDown(e, key)}
            onPointerOver={(e) => handlePointerOver(e, key)}
            onPointerOut={handlePointerOut}
            castShadow
            receiveShadow
            material={targetMaterial}
            frustumCulled={false}
          />
        );
      })}
    </group>
  );
};
