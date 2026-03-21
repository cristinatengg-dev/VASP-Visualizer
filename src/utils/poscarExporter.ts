import type { MolecularStructure, Atom } from '../types';

const defaultLatticeVectors = (): number[][] => [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

const formatVec = (v: number[]) => {
  const x = Number.isFinite(v?.[0]) ? v[0] : 0;
  const y = Number.isFinite(v?.[1]) ? v[1] : 0;
  const z = Number.isFinite(v?.[2]) ? v[2] : 0;
  return `${x.toFixed(10)} ${y.toFixed(10)} ${z.toFixed(10)}`;
};

const groupAtomsByElement = (atoms: Atom[]) => {
  const order: string[] = [];
  const groups = new Map<string, Atom[]>();

  for (const atom of atoms) {
    const el = String(atom.element || '').trim() || 'X';
    if (!groups.has(el)) {
      groups.set(el, []);
      order.push(el);
    }
    groups.get(el)!.push(atom);
  }

  return { order, groups };
};

export const exportToPOSCAR = (data: MolecularStructure): string => {
  const atoms = Array.isArray(data?.atoms) ? data.atoms : [];
  const latticeVectors = Array.isArray(data?.latticeVectors) && data.latticeVectors.length >= 3
    ? data.latticeVectors
    : defaultLatticeVectors();

  const { order, groups } = groupAtomsByElement(atoms);
  const counts = order.map((el) => groups.get(el)!.length);

  const title = (data?.filename || 'POSCAR').replace(/\r?\n/g, ' ').slice(0, 120);
  const lines: string[] = [];

  lines.push(title);
  lines.push('1.0');
  lines.push(formatVec(latticeVectors[0]));
  lines.push(formatVec(latticeVectors[1]));
  lines.push(formatVec(latticeVectors[2]));
  lines.push(order.join(' '));
  lines.push(counts.join(' '));
  lines.push('Cartesian');

  for (const el of order) {
    for (const atom of groups.get(el)!) {
      const { x, y, z } = atom.position;
      const fx = Number.isFinite(x) ? x : 0;
      const fy = Number.isFinite(y) ? y : 0;
      const fz = Number.isFinite(z) ? z : 0;
      lines.push(`${fx.toFixed(10)} ${fy.toFixed(10)} ${fz.toFixed(10)}`);
    }
  }

  lines.push('');
  return lines.join('\n');
};
