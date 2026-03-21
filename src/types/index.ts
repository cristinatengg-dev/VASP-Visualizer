export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Atom {
  id: string;
  element: string;
  position: Vector3D;
  radius: number;
  color: string;
  renderStyle?: string; // e.g. 'default', 'stick', 'vesta', 'ball-stick'
}

export interface Bond {
  id: string;
  atom1Id: string;
  atom2Id: string;
  length: number;
  type: 'single' | 'double' | 'triple';
}

export interface MolecularStructure {
  id: string;
  filename: string;
  atoms: Atom[];
  bonds: Bond[];
  boundingBox: {
    min: Vector3D;
    max: Vector3D;
  };
  latticeVectors?: number[][];
  trajectory?: {
    frames: Float32Array[]; // Using Float32Array for performance
    currentFrame: number;
    totalFrames: number;
    isPlaying: boolean;
  };
}

export interface StyleConfig {
  atomColorsRaw: string;
  atomRadiiRaw: string;
  bondDistancesRaw: string;
  customColors: Record<string, string>;
  customRadii: Record<string, number>;
  bondRules: BondRule[];
}

export interface BondRule {
  atomA: string;
  atomB: string;
  threshold: number;
}
