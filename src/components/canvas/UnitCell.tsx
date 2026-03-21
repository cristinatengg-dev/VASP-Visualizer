import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

interface UnitCellProps {
  vectors?: number[][];
}

export const UnitCell: React.FC<UnitCellProps> = ({ vectors }) => {
  const points = useMemo(() => {
    if (!vectors || vectors.length !== 3) return null;

    const v1 = new THREE.Vector3(...vectors[0]);
    const v2 = new THREE.Vector3(...vectors[1]);
    const v3 = new THREE.Vector3(...vectors[2]);

    const o = new THREE.Vector3(0, 0, 0);
    
    // Calculate vertices
    const p1 = v1.clone();
    const p2 = v2.clone();
    const p3 = v3.clone();
    
    const p12 = v1.clone().add(v2);
    const p13 = v1.clone().add(v3);
    const p23 = v2.clone().add(v3);
    
    const p123 = v1.clone().add(v2).add(v3);

    // Create line segments (12 edges)
    // We can use a single continuous line if we trace it carefully, or segments.
    // Segments are easier to reason about.
    // Format for Drei Line points: Array of Vector3 or [x,y,z]
    
    const segments = [
      [o, p1], [o, p2], [o, p3], // From origin
      [p1, p12], [p1, p13],      // From p1
      [p2, p12], [p2, p23],      // From p2
      [p3, p13], [p3, p23],      // From p3
      [p12, p123], [p13, p123], [p23, p123] // To far corner
    ];
    
    return segments;
  }, [vectors]);

  if (!points) return null;

  return (
    <group>
      {points.map((segment, index) => (
        <Line 
          key={index} 
          points={segment} 
          color="#666666" 
          lineWidth={1} 
          dashed={true}
          dashScale={2}
          dashSize={0.5}
          gapSize={0.3}
        />
      ))}
    </group>
  );
};
