/**
 * Catalyst Toolkit Helpers
 * Converts between backend render_data and frontend MolecularStructure.
 */

import { getAtomProperties } from './atomData';
import type { Atom, MolecularStructure } from '../types';

export interface RenderData {
  atoms: {
    element: string;
    position: { x: number; y: number; z: number };
    selectiveDynamics?: { x: boolean; y: boolean; z: boolean };
  }[];
  latticeVectors: number[][];
}

/**
 * Convert catalyst toolkit render_data → MolecularStructure for the 3D viewer.
 */
export function renderDataToMolecularStructure(
  renderData: RenderData,
  filename: string = 'catalyst_output.vasp',
): MolecularStructure {
  const atoms: Atom[] = renderData.atoms.map((a, idx) => {
    const defaults = getAtomProperties(a.element);
    return {
      id: `atom-${idx}`,
      element: a.element,
      position: a.position,
      radius: defaults.radius,
      color: defaults.color,
    };
  });

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const atom of atoms) {
    const { x, y, z } = atom.position;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }

  if (!Number.isFinite(minX)) {
    minX = minY = minZ = -10;
    maxX = maxY = maxZ = 10;
  }

  return {
    id: `catalyst-${Date.now()}`,
    filename,
    atoms,
    bonds: [],
    boundingBox: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    },
    latticeVectors: renderData.latticeVectors,
  };
}

/**
 * Convert current MolecularStructure → render_data for catalyst toolkit API calls.
 */
export function molecularStructureToRenderData(mol: MolecularStructure): RenderData {
  return {
    atoms: mol.atoms.map(a => ({
      element: a.element,
      position: { x: a.position.x, y: a.position.y, z: a.position.z },
    })),
    latticeVectors: mol.latticeVectors || [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
  };
}
