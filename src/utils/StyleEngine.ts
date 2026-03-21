import { StyleConfig } from '../types';
import { getAtomProperties } from './atomData';

export type StyleMode = 'Spacefill' | 'BallStick' | 'Stick' | 'Polyhedral' | 'Vesta' | 'Preview';

export const getStyleForElement = (
  element: string, 
  styleMode: string, // maps to materialStyle in store
  styleConfig: StyleConfig,
  stickRadius: number = 0.3
) => {
  const { customColors, customRadii } = styleConfig;
  const defaultProps = getAtomProperties(element);
  
  // Base properties
  const baseColor = customColors[element] || defaultProps.color;
  const baseRadius = customRadii[element] || defaultProps.radius;
  // Default vdwRadius to 1.5x standard radius if not defined in data source
  // @ts-ignore
  const vdwRadius = defaultProps.vdwRadius || baseRadius * 1.5;
  
  let finalRadius = baseRadius;
  
  // Logic matching user request
  switch (styleMode) {
    case 'spacefill': 
    case 'matte': 
    case 'metallic':
    case 'glass':
    case 'toon':
    case 'preview':
      // User requirement: Matte/Metallic/Glass should NOT scale up to Spacefill size by default.
      // They should behave like standard Ball & Stick size unless explicit Spacefill mode is chosen.
      finalRadius = baseRadius; 
      break;
    case 'vesta':
      // VESTA standard: 40% of ionic/covalent radius for Ball-and-Stick
      finalRadius = baseRadius * 0.4;
      break;
    case 'stick':
      // Stick mode: Atoms match the bond radius (stickRadius)
      // This creates the "Liquorice" look where atoms and bonds are uniform
      finalRadius = stickRadius;
      break;
    default:
      finalRadius = baseRadius; 
      break;
  }

  // Allow custom override to always win if explicitly set? 
  // User said "Spacefill: use vdwRadius * globalScale".
  // So we return the "Standard" radius for this mode, and let the renderer apply global scale.
  
  // Refined Logic based on "StyleMode"
  // We map store 'materialStyle' to these logic
  
  return {
    color: baseColor,
    radius: finalRadius,
    vdwRadius,
    covalentRadius: baseRadius
  };
};
