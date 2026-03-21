import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Vector3D } from '../../types';
import { useStore } from '../../store/useStore';

interface BondProps {
  start: Vector3D;
  end: Vector3D;
  radius?: number;
  color?: string;
  colorA?: string;
  colorB?: string;
  styleA?: string;
  styleB?: string;
}

export const Bond: React.FC<BondProps> = ({ start, end, radius = 0.2, color = '#d1d5db', colorA, colorB, styleA, styleB }) => {
  const { materialStyle: globalStyle, stickRadius } = useStore();
  
  const effectiveStyleA = styleA || globalStyle;
  const effectiveStyleB = styleB || globalStyle;
  
  const { position, quaternion, length } = useMemo(() => {
    const vStart = new THREE.Vector3(start.x, start.y, start.z);
    const vEnd = new THREE.Vector3(end.x, end.y, end.z);
    
    const length = vStart.distanceTo(vEnd);
    const position = vStart.clone().add(vEnd).multiplyScalar(0.5);
    
    // Default Cylinder is Y-aligned. We need to align it to the vector (end - start).
    const direction = vEnd.clone().sub(vStart).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
    
    return { position, quaternion, length };
  }, [start, end]);

  const getRadius = (style: string) => {
      if (style === 'stick') return stickRadius;
      if (style === 'vesta') return 0.15;
      return radius;
  };

  const rA = getRadius(effectiveStyleA);
  const rB = getRadius(effectiveStyleB);

  const cA = colorA || color;
  const cB = colorB || color;
  
  const renderMaterial = (style: string, color: string) => {
      switch (style) {
          case 'preview':
              return <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />;
          case 'matte':
              return <meshStandardMaterial color={color} roughness={0.8} metalness={0.0} />;
          case 'vesta':
              return <meshStandardMaterial color={color} roughness={0.2} metalness={0.1} />;
          case 'metallic':
              return <meshStandardMaterial color={color} roughness={0.2} metalness={0.8} />;
          case 'glass':
              return <meshPhysicalMaterial color={color} transmission={0.6} roughness={0.1} />;
          case 'toon':
              return <meshToonMaterial color={color} />;
          case 'stick':
              return <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />;
          default:
              return <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />;
      }
  };

  return (
    <group position={position} quaternion={quaternion} castShadow receiveShadow>
       {/* Half 1 (Start side) - centered at -length/4 */}
       <mesh position={[0, -length/4, 0]} castShadow receiveShadow>
         <cylinderGeometry args={[rA, rA, length/2, 16, 1]} />
         {renderMaterial(effectiveStyleA, cA)}
       </mesh>
       
       {/* Half 2 (End side) - centered at +length/4 */}
       <mesh position={[0, length/4, 0]} castShadow receiveShadow>
         <cylinderGeometry args={[rB, rB, length/2, 16, 1]} />
         {renderMaterial(effectiveStyleB, cB)}
       </mesh>
    </group>
  );
};
