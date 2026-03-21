import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useStore } from '../store/useStore';

export const useAllMaterials = () => {
  const { materialParams } = useStore();

  return useMemo(() => {
    const { metalness, roughness, transmission, thickness, ior, toonSteps } = materialParams;

    const createMaterial = (style: string) => {
        switch (style) {
            case 'preview':
                return new THREE.MeshStandardMaterial({ 
                    roughness: 0.15, 
                    metalness: 0.0, 
                    envMapIntensity: 0.4 
                });
            case 'matte':
                return new THREE.MeshStandardMaterial({ 
                    roughness: 0.8, 
                    metalness: 0.0 
                });
            case 'metallic':
                return new THREE.MeshStandardMaterial({ 
                    roughness: roughness ?? 0.45, 
                    metalness: metalness ?? 0.45 
                });
            case 'glass':
                return new THREE.MeshPhysicalMaterial({ 
                    roughness: roughness ?? 0.1, 
                    transmission: transmission ?? 0.9, 
                    thickness: thickness ?? 0.5, 
                    transparent: true,
                    ior: ior ?? 1.5
                });
            case 'vesta':
                return new THREE.MeshStandardMaterial({ 
                    roughness: 0.2, 
                    metalness: 0.1 
                });
            case 'stick':
                return new THREE.MeshStandardMaterial({ 
                    roughness: 0.5, 
                    metalness: 0.1 
                });
            case 'toon':
                const colors = new Uint8Array(toonSteps || 3);
                for(let i=0; i<colors.length; i++) {
                const val = Math.floor((i / (colors.length - 1)) * 255);
                colors[i] = val;
                }
                const gradientMap = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
                gradientMap.minFilter = THREE.NearestFilter;
                gradientMap.magFilter = THREE.NearestFilter;
                gradientMap.needsUpdate = true;
                return new THREE.MeshToonMaterial({ gradientMap });
            case 'publication':
                return new THREE.MeshStandardMaterial({ 
                    roughness: 0.1, 
                    metalness: 0.1, 
                    envMapIntensity: 1.0 
                });
            default:
                return new THREE.MeshStandardMaterial({ roughness: 0.15 });
        }
    };

    return {
        preview: createMaterial('preview'),
        matte: createMaterial('matte'),
        metallic: createMaterial('metallic'),
        glass: createMaterial('glass'),
        vesta: createMaterial('vesta'),
        stick: createMaterial('stick'),
        toon: createMaterial('toon'),
        publication: createMaterial('publication'),
        default: createMaterial('preview')
    };
  }, [materialParams]); // Listen to param changes for real-time updates
};

// Hook to generate/update materials based on global config
export const useAtomMaterial = () => {
  const { materialStyle } = useStore();
  
  return useMemo(() => {
    // Presets Logic (copied from Scene3D/MaterialSelector)
    // We create a new material instance when style changes
    
    // Default params for customization
    // We don't read params here anymore to avoid recreation loop
    
    switch (materialStyle) {
      case 'preview':
        return new THREE.MeshStandardMaterial({ 
            roughness: 0.15, 
            metalness: 0.0, 
            envMapIntensity: 0.4 
        });
      case 'matte':
        return new THREE.MeshStandardMaterial({ 
            roughness: 0.8, 
            metalness: 0.0 
        });
      case 'metallic':
        return new THREE.MeshStandardMaterial({ 
            roughness: 0.45, 
            metalness: 0.45 
        });
      case 'glass':
        return new THREE.MeshPhysicalMaterial({ 
            roughness: 0.1, 
            transmission: 0.9, 
            thickness: 0.5, 
            transparent: true,
            ior: 1.5
        });
      case 'vesta':
        return new THREE.MeshStandardMaterial({ 
            roughness: 0.2, 
            metalness: 0.1 
        });
      case 'stick':
        return new THREE.MeshStandardMaterial({ 
            roughness: 0.5, 
            metalness: 0.1 
        });
      case 'toon':
         // Generate Gradient Texture for Toon effect
         const colors = new Uint8Array(3);
         for(let i=0; i<colors.length; i++) {
            const val = Math.floor((i / (colors.length - 1)) * 255);
            colors[i] = val;
         }
         const gradientMap = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
         gradientMap.minFilter = THREE.NearestFilter;
         gradientMap.magFilter = THREE.NearestFilter;
         gradientMap.needsUpdate = true;

         return new THREE.MeshToonMaterial({
             gradientMap: gradientMap
         });
      case 'publication':
        return new THREE.MeshStandardMaterial({ 
            roughness: 0.1, 
            metalness: 0.1, 
            envMapIntensity: 1.0 
        });
      
      default:
        // Use custom params if no preset or 'custom' mode
        // For now, return standard
        return new THREE.MeshStandardMaterial({ roughness: 0.15 });
    }
  }, [materialStyle]); // Re-create when style changes
};

export const useBondMaterial = () => {
    // Bond material usually follows atom material but might have specific tweaks
    // For now, we reuse the same logic or return a standard one
    // Dual-color bonds need vertex colors!
    
    const { materialStyle } = useStore();
    
    return useMemo(() => {
        // VESTA/Stick style bonds are usually simple matte
        if (materialStyle === 'vesta' || materialStyle === 'stick') {
             return new THREE.MeshStandardMaterial({
                roughness: 0.5,
                metalness: 0.1,
                vertexColors: false, // DISABLE vertexColors (we use instanceColor, not geometry vertex colors)
                color: 0xffffff,
                emissive: 0x000000,
                side: THREE.DoubleSide
            });
        }

        const mat = new THREE.MeshStandardMaterial({
            roughness: 0.3,
            metalness: 0.1,
            vertexColors: false, // DISABLE vertexColors
            color: 0xffffff,
            side: THREE.DoubleSide
        });
        
        if (materialStyle === 'glass') {
            return new THREE.MeshPhysicalMaterial({
                roughness: 0.1,
                transmission: 0.6,
                thickness: 0.5,
                transparent: true,
                vertexColors: false, // DISABLE vertexColors
                color: 0xffffff,
                side: THREE.DoubleSide
            });
        }
        
        if (materialStyle === 'metallic') {
            mat.metalness = 0.8;
            mat.roughness = 0.2;
        }
        
        return mat;
    }, [materialStyle]);
};

export const useAllBondMaterials = () => {
    return useMemo(() => {
        const createBondMat = (style: string) => {
            if (style === 'vesta' || style === 'stick') {
                return new THREE.MeshStandardMaterial({
                    roughness: 0.5,
                    metalness: 0.1,
                    color: 0xffffff,
                    side: THREE.DoubleSide
                });
            }
            if (style === 'glass') {
                return new THREE.MeshPhysicalMaterial({
                    roughness: 0.1,
                    transmission: 0.6,
                    thickness: 0.5,
                    transparent: true,
                    color: 0xffffff,
                    side: THREE.DoubleSide
                });
            }
            if (style === 'metallic') {
                return new THREE.MeshStandardMaterial({
                    roughness: 0.2,
                    metalness: 0.8,
                    color: 0xffffff,
                    side: THREE.DoubleSide
                });
            }
            // Default/Matte/Preview
            return new THREE.MeshStandardMaterial({
                roughness: 0.3,
                metalness: 0.1,
                color: 0xffffff,
                side: THREE.DoubleSide
            });
        };

        return {
            preview: createBondMat('preview'),
            matte: createBondMat('matte'),
            metallic: createBondMat('metallic'),
            glass: createBondMat('glass'),
            vesta: createBondMat('vesta'),
            stick: createBondMat('stick'),
            toon: createBondMat('toon'), // Toon bond?
            default: createBondMat('preview')
        };
    }, []);
};
