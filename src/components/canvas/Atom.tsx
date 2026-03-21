import React from 'react';
import { Vector3D } from '../../types';
import { useStore } from '../../store/useStore';
import { Outlines } from '@react-three/drei';

interface AtomProps {
  id: string;
  position: Vector3D;
  radius: number;
  color: string;
  onPointerDown?: (e: any) => void;
  renderStyle?: string;
}

export const Atom: React.FC<AtomProps> = ({ id, position, radius, color, onPointerDown, renderStyle }) => {
  const { materialStyle: globalStyle, materialParams, selectedAtomIds, toggleSelectedAtomId, setHoveredAtom, setIsDraggingAtom } = useStore();

  const realId = id.split('-ghost-')[0];
  const isSelected = selectedAtomIds.includes(realId);
  // Treat 'default' as undefined/null to fallback to globalStyle
  const materialStyle = (renderStyle && renderStyle !== 'default') ? renderStyle : globalStyle;

  // Extract original index for hover
  const parts = realId.split('-');
  const element = parts[0];
  const indexStr = parts[1];
  const atomIndex = parseInt(indexStr);

  const handlePointerOver = (e: any) => {
    e.stopPropagation();
    setHoveredAtom({ id, element, index: atomIndex });
  };

  const handlePointerOut = (e: any) => {
    e.stopPropagation();
    setHoveredAtom(null);
  };
  
  const handleClick = (e: any) => {
    e.stopPropagation();
    // Selection Logic on Click (MouseUp)
    const isMultiSelect = e.shiftKey || e.ctrlKey || e.metaKey;

    // If we dragged, this click might not fire depending on R3F/Browser behavior.
    // Assuming this fires only on clean click.
    
    // If selected and Multi-select (Shift), toggle OFF.
    // (If it was unselected, we selected it on Down, so it is selected now. 
    // If we toggle here, we deselect it immediately? No.
    // We need to know if it was ALREADY selected before Down.
    // But we don't have that state here easily.
    
    // Alternative: Move ALL selection logic to Click?
    // But we want to drag newly selected atoms.
    
    // Let's rely on PointerDown for adding/selecting.
    // And use Click for DESELECTING or Single Select refinement?
    
    if (isSelected && !isMultiSelect) {
        // Clicked on a selected atom without shift -> Make it the ONLY selection
        // (Unless we just selected it on down, in which case this is fine)
        toggleSelectedAtomId(realId, false);
    }
  };

  const isVesta = materialStyle === 'vesta';
  const radiusScale = isVesta ? 0.4 : 1.0;

  return (
    <mesh 
      name="atom-mesh"
      userData={{ isAtom: true, atomId: realId }}
      position={[position.x, position.y, position.z]}
      castShadow
      receiveShadow
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onContextMenu={(e) => {
          e.stopPropagation();
          // Right Click Logic handled by Scene3D global listener or here?
          // User said: Right click -> Pop up style menu.
          // We can set global context menu state here.
          useStore.getState().setContextMenu({
              visible: true,
              x: e.clientX,
              y: e.clientY,
              atomId: realId
          });
      }}
    >
      <sphereGeometry args={[radius * radiusScale, 32, 32]} />
      
      {materialStyle === 'preview' && (
        <meshStandardMaterial 
          color={color} 
          roughness={0.15}
          metalness={0.0}
          envMapIntensity={0.4}
          emissive={isSelected ? '#444444' : '#000000'}
        />
      )}

      {materialStyle === 'matte' && (
        <meshStandardMaterial 
          color={color} 
          roughness={0.8}
          metalness={0.0}
          envMapIntensity={0.1}
          emissive={isSelected ? '#444444' : '#000000'}
        />
      )}
      
      {materialStyle === 'vesta' && (
        <meshStandardMaterial 
          color={color} 
          roughness={0.2}
          metalness={0.1}
          envMapIntensity={0.8}
          emissive={isSelected ? '#444444' : '#000000'}
        />
      )}

      {materialStyle === 'metallic' && (
        <meshStandardMaterial 
          color={color} 
          roughness={materialParams.roughness}
          metalness={materialParams.metalness}
          envMapIntensity={1.0}
          emissive={isSelected ? '#444444' : '#000000'}
        />
      )}

      {materialStyle === 'glass' && (
        <meshPhysicalMaterial 
          color={color} 
          roughness={0.1}
          metalness={0.0}
          transmission={materialParams.transmission}
          thickness={materialParams.thickness}
          ior={materialParams.ior}
          envMapIntensity={1.0}
          transparent
          emissive={isSelected ? '#444444' : '#000000'}
        />
      )}

      {materialStyle === 'toon' && (
        <>
          <meshToonMaterial 
            color={color}
            gradientMap={null} // Default gradient
            emissive={isSelected ? '#444444' : '#000000'}
          />
          <Outlines thickness={0.05} color={isSelected ? "black" : "black"} screenspace={false} />
        </>
      )}
      
      {isSelected && materialStyle !== 'toon' && (
         <Outlines thickness={0.05} color="black" screenspace={false} />
      )}
    </mesh>
  );
};
