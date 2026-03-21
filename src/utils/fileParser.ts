import { MolecularStructure, Atom } from '../types';
import { getAtomProperties } from './atomData';
import { getModifications, DELETE_MARKER } from './storage';
import { API_BASE_URL } from '../config';
import { getStableFileId } from './fileId';

// --- 🛠️ 核心工具：鲁棒的行解析器 ---
// 1. 处理 Fortran 粘连数字 (如 "0.123-0.456" -> "0.123 -0.456")
// 2. 过滤掉非数字内容 (如 "T T T", "Direct", 注释)
const parseLineToNumbers = (line: string): number[] => {
    if (!line || !line.trim()) return [];
    
    // [关键步骤] 在数字和负号之间强行插入空格
    // 防止 VASP 紧凑格式导致的解析错误
    const safeLine = line.replace(/(\d)-/g, '$1 -');
    
    return safeLine.trim().split(/\s+/)
        .map(s => parseFloat(s))
        .filter(n => !isNaN(n) && isFinite(n)); // 过滤 NaN, Infinity, T, F 等
};

const normalizeElementSymbol = (raw: string): string => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return '';
    const cleaned = trimmed.replace(/^[^A-Za-z]+/, '');
    const match = cleaned.match(/^[A-Za-z]{1,2}/);
    if (!match) return trimmed;
    const sym = match[0];
    return sym[0].toUpperCase() + sym.slice(1).toLowerCase();
};

export const parseCONTCAR = (text: string): { atoms: { element: string, position: [number, number, number] }[], latticeVectors: number[][] } => {
    const lines = text.trim().split(/\r?\n/);
    let currentLine = 0;
    
    // Helper to get next non-empty line
    const nextLine = (): string | null => {
        while (currentLine < lines.length) {
            const line = lines[currentLine++].trim();
            if (line) return line;
        }
        return null;
    };

    // 1. Title
    nextLine(); 
    
    // 2. Scaling factor
    const scaleLine = nextLine();
    if (!scaleLine) throw new Error("Invalid file: Missing scale factor");
    let scale = parseFloat(scaleLine);
    if (isNaN(scale)) scale = 1.0;
    
    // VASP Volume Scaling (Negative scale)
    const isVolumeScale = scale < 0;
    if (isVolumeScale) scale = Math.abs(scale); 
    
    // 3. Lattice vectors
    const latticeVectors: number[][] = [];
    for(let i=0; i<3; i++) {
        const line = nextLine();
        if (!line) break;
        const raw = parseLineToNumbers(line);
        const v = [
            (raw[0] || 0) * (isVolumeScale ? 1 : scale),
            (raw[1] || 0) * (isVolumeScale ? 1 : scale),
            (raw[2] || 0) * (isVolumeScale ? 1 : scale)
        ];
        latticeVectors.push(v);
    }
    
    // 4. Elements and Counts
    let elements: string[] = [];
    let counts: number[] = [];
    
    const lineA = nextLine();
    if (!lineA) throw new Error("Invalid file: Missing elements/counts");
    
    const tokensA = lineA.split(/\s+/).filter(s => s !== '');
    
    // Check if lineA is numbers (VASP 4) or elements (VASP 5)
    if (isNaN(Number(tokensA[0]))) {
        // VASP 5: Elements line exists
        elements = tokensA.map(normalizeElementSymbol);
        const lineB = nextLine();
        if (lineB) counts = parseLineToNumbers(lineB);
    } else {
        // VASP 4: No elements line, only counts
        counts = parseLineToNumbers(lineA);
        // Generate dummy elements
        elements = counts.map((_, i) => `El${i+1}`);
    }
    
    // 5. Coordinate Mode (Direct / Cartesian)
    let modeLine = nextLine();
    if (!modeLine) return { atoms: [], latticeVectors };

    if (modeLine.toLowerCase().startsWith('s')) { 
        // Skip Selective Dynamics line
        modeLine = nextLine(); 
    }
    
    const isDirect = modeLine?.toLowerCase().startsWith('d'); 
    
    // 6. Parse Atoms
    const atomsData: { element: string, position: [number, number, number] }[] = [];
    const expectedTotalAtoms = counts.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
    
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const count = counts[i];
        
        for (let j = 0; j < count; j++) {
            const lineContent = nextLine();
            if (!lineContent) break;

            const coords = parseLineToNumbers(lineContent);
            
            if (coords.length < 3) {
                while(coords.length < 3) coords.push(0);
            }

            const u = coords[0];
            const v = coords[1];
            const w = coords[2];
            
            let pos: [number, number, number];
            
            if (isDirect) {
                const x = u * latticeVectors[0][0] + v * latticeVectors[1][0] + w * latticeVectors[2][0];
                const y = u * latticeVectors[0][1] + v * latticeVectors[1][1] + w * latticeVectors[2][1];
                const z = u * latticeVectors[0][2] + v * latticeVectors[1][2] + w * latticeVectors[2][2];
                pos = [x, y, z];
            } else {
                const s = isVolumeScale ? 1.0 : scale;
                pos = [u * s, v * s, w * s];
            }
            
            atomsData.push({ element: el, position: pos });
        }
    }
    
    if (expectedTotalAtoms > 0 && atomsData.length !== expectedTotalAtoms) {
        throw new Error(`Invalid file: Atom count mismatch (expected ${expectedTotalAtoms}, got ${atomsData.length})`);
    }
    return { atoms: atomsData, latticeVectors };
};

export const parseCIF = (text: string): { atoms: { element: string, position: [number, number, number] }[], latticeVectors: number[][] } => {
    const lines = text.split('\n');
    let a = 0, b = 0, c = 0;
    let alpha = 90, beta = 90, gamma = 90;
    const cleanVal = (val: string) => parseFloat(val.replace(/\(\d+\)/, ''));

    for (const rawLine of lines) {
        const parts = rawLine.trim().split(/\s+/);
        if (parts.length < 2) continue;
        const key = parts[0].toLowerCase();
        const val = parts[1];
        if (key === '_cell_length_a') a = cleanVal(val);
        if (key === '_cell_length_b') b = cleanVal(val);
        if (key === '_cell_length_c') c = cleanVal(val);
        if (key === '_cell_angle_alpha') alpha = cleanVal(val);
        if (key === '_cell_angle_beta') beta = cleanVal(val);
        if (key === '_cell_angle_gamma') gamma = cleanVal(val);
    }

    const toRad = (deg: number) => deg * Math.PI / 180;
    const radAlpha = toRad(alpha);
    const radBeta = toRad(beta);
    const radGamma = toRad(gamma);

    const v1 = [a, 0, 0];
    const v2 = [b * Math.cos(radGamma), b * Math.sin(radGamma), 0];
    const cx = c * Math.cos(radBeta);
    const cy = c * (Math.cos(radAlpha) - Math.cos(radBeta) * Math.cos(radGamma)) / Math.sin(radGamma);
    const cz = Math.sqrt(Math.max(0, c * c - cx * cx - cy * cy));
    const v3 = [cx, cy, cz];
    const latticeVectors = [v1, v2, v3];

    const atoms: { element: string, position: [number, number, number] }[] = [];

    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) {
            i++;
            continue;
        }

        if (!line.startsWith('loop_')) {
            i++;
            continue;
        }

        i++;
        const headers: string[] = [];
        while (i < lines.length) {
            const h = lines[i].trim();
            if (!h) { i++; continue; }
            if (!h.startsWith('_')) break;
            headers.push(h);
            i++;
        }

        if (headers.length === 0) continue;

        const loopIndices: Record<string, number> = {};
        headers.forEach((h, idx) => loopIndices[h.toLowerCase()] = idx);

        const labelIdx = loopIndices['_atom_site_type_symbol'] ?? loopIndices['_atom_site_label'];
        const xIdx = loopIndices['_atom_site_fract_x'];
        const yIdx = loopIndices['_atom_site_fract_y'];
        const zIdx = loopIndices['_atom_site_fract_z'];

        const isAtomLoop = labelIdx !== undefined && xIdx !== undefined && yIdx !== undefined && zIdx !== undefined;

        while (i < lines.length) {
            const dataLineRaw = lines[i];
            const dataLine = dataLineRaw.trim();
            if (!dataLine || dataLine.startsWith('#')) { i++; continue; }
            if (dataLine.startsWith('loop_') || dataLine.startsWith('_')) break;

            if (isAtomLoop) {
                const parts = dataLine.split(/\s+/);
                if (parts.length >= headers.length) {
                    const elementRaw = parts[labelIdx];
                    const element = normalizeElementSymbol(elementRaw);
                    const fx = cleanVal(parts[xIdx]);
                    const fy = cleanVal(parts[yIdx]);
                    const fz = cleanVal(parts[zIdx]);

                    const x = fx * v1[0] + fy * v2[0] + fz * v3[0];
                    const y = fx * v1[1] + fy * v2[1] + fz * v3[1];
                    const z = fx * v1[2] + fy * v2[2] + fz * v3[2];
                    atoms.push({ element, position: [x, y, z] });
                }
            }

            i++;
        }

        continue;
    }

    return { atoms, latticeVectors };
};

const isValidLatticeVectors = (vectors: any): vectors is number[][] =>
    Array.isArray(vectors) &&
    vectors.length === 3 &&
    vectors.every((v: any) => Array.isArray(v) && v.length === 3 && v.every((n: any) => typeof n === 'number' && Number.isFinite(n)));

const getAtomStats = (atoms: Atom[]) => {
    let invalid = 0;
    let originLike = 0;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const a of atoms) {
        const x = a.position?.x;
        const y = a.position?.y;
        const z = a.position?.z;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            invalid++;
            continue;
        }
        if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9 && Math.abs(z) < 1e-9) originLike++;
        minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
    }

    const finiteCount = atoms.length - invalid;
    const spanX = Number.isFinite(minX) ? (maxX - minX) : 0;
    const spanY = Number.isFinite(minY) ? (maxY - minY) : 0;
    const spanZ = Number.isFinite(minZ) ? (maxZ - minZ) : 0;

    return { total: atoms.length, finiteCount, invalid, originLike, spanX, spanY, spanZ };
};

const shouldRejectParsedAtoms = (atoms: Atom[]) => {
    if (atoms.length === 0) return { reject: true, reason: 'empty' };
    const s = getAtomStats(atoms);
    if (s.finiteCount === 0) return { reject: true, reason: 'no-finite-positions' };
    if (s.total >= 50 && s.originLike / s.total > 0.8) return { reject: true, reason: 'mostly-at-origin' };
    if (s.total >= 50 && s.spanX < 1e-6 && s.spanY < 1e-6 && s.spanZ < 1e-6) return { reject: true, reason: 'collapsed-bbox' };
    return { reject: false as const, reason: '' };
};

export const parseVASPFile = async (file: File): Promise<MolecularStructure> => {
  const fileId = await getStableFileId(file);

  const upperName = String(file.name || '').toUpperCase();
  const isCif = upperName.endsWith('.CIF');
  const isVolumetric = ['CHGCAR', 'LOCPOT', 'PARCHG', 'ELFCAR', 'CHGDIFF'].some(k => upperName === k || upperName.endsWith(k) || upperName.includes(k));
  const preferLocal = !isVolumetric && (isCif || file.size <= 5 * 1024 * 1024);

  if (preferLocal) {
    try {
      const text = await file.text();
      const parsed = isCif ? parseCIF(text) : parseCONTCAR(text);

      const processedAtoms: Atom[] = parsed.atoms.map((a, idx) => {
        const element = normalizeElementSymbol(a.element);
        const props = getAtomProperties(element);
        const x = a.position[0];
        const y = a.position[1];
        const z = a.position[2];
        return {
          id: `atom-${idx}`,
          element,
          position: {
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
            z: Number.isFinite(z) ? z : 0
          },
          radius: props.radius,
          color: props.color
        };
      });

      const reject = shouldRejectParsedAtoms(processedAtoms);
      if (reject.reject) throw new Error(`Local parsed atoms rejected: ${reject.reason}`);
      if (!isValidLatticeVectors(parsed.latticeVectors)) throw new Error('Local latticeVectors invalid');

      return processFinalAtoms(processedAtoms, file, parsed.latticeVectors, fileId);
    } catch {
      // Fall back to server-side parsing
    }
  }

  // --- 🚀 新逻辑：优先尝试服务器解析 ---
  try {
      const formData = new FormData();
      formData.append('file', file);

      console.log(`[Parser] Sending ${file.name} to server for parsing...`);
      const controller = new AbortController();
      const baseMs = 60_000;
      const perMbMs = 2_000;
      const sizeMb = Math.max(1, Math.ceil(file.size / (1024 * 1024)));
      const timeoutMs = Math.min(10 * 60_000, baseMs + sizeMb * perMbMs);
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(`${API_BASE_URL}/parse-structure`, {
          method: 'POST',
          body: formData,
          signal: controller.signal
      }).finally(() => window.clearTimeout(timeoutId));

      if (!response.ok) {
          let msg = '服务器端结构解析失败';
          try {
              const errJson = await response.json();
              if (typeof errJson?.error === 'string' && errJson.error) msg = errJson.error;
          } catch { }
          throw new Error(msg);
      }

      const result = await response.json();
      if (!(result?.success && result?.data)) {
          throw new Error('服务器端结构解析失败');
      }

      console.log(`[Parser] Server parsing successful for ${file.name}`);
      
      const rawAtoms = result.data.atoms;
      const CHUNK_SIZE = 2000;
      const processedAtoms: Atom[] = [];

      for (let i = 0; i < rawAtoms.length; i += CHUNK_SIZE) {
          const chunk = rawAtoms.slice(i, i + CHUNK_SIZE);
          const chunkResult = chunk.map((a: any, chunkIndex: number) => {
              const index = i + chunkIndex;
              const element = normalizeElementSymbol(a.element);
              const props = getAtomProperties(element);
              
              const x = parseFloat(a.position.x);
              const y = parseFloat(a.position.y);
              const z = parseFloat(a.position.z);
              const safePos = {
                  x: isNaN(x) ? 0 : x,
                  y: isNaN(y) ? 0 : y,
                  z: isNaN(z) ? 0 : z
              };

              return {
                  ...a,
                  element,
                  id: `atom-${index}`,
                  position: safePos,
                  radius: props.radius,
                  color: props.color
              };
          });
          processedAtoms.push(...chunkResult);
          
          if (rawAtoms.length > CHUNK_SIZE) {
              await new Promise(resolve => setTimeout(resolve, 0));
          }
      }

      const expectedTotalAtoms = Number(result.data?.meta?.totalAtomsCount);
      if (Number.isFinite(expectedTotalAtoms) && expectedTotalAtoms > 0 && processedAtoms.length !== expectedTotalAtoms) {
          throw new Error('Server atom count mismatch');
      }

      const reject = shouldRejectParsedAtoms(processedAtoms);
      if (reject.reject) {
          throw new Error(`Server parsed atoms rejected: ${reject.reason}`);
      }

      const vectors = result.data.latticeVectors;
      if (!isValidLatticeVectors(vectors)) {
          throw new Error('Server latticeVectors invalid');
      }

      return processFinalAtoms(processedAtoms, file, vectors, fileId);
  } catch (err) {
      console.warn("[Parser] Server parsing failed.", err);
      if (err instanceof Error) throw err;
      throw new Error('服务器端结构解析失败');
  }
};

// 提取共用的后期处理逻辑
const processFinalAtoms = (atoms: Atom[], file: File, latticeVectors: number[][], fileId: string): MolecularStructure => {
    const mods = getModifications(fileId);
    const finalAtoms = atoms.filter((atom, idx) => {
        if (mods[idx] === DELETE_MARKER) return false;
        if (mods[idx]) {
            atom.element = mods[idx];
            const props = getAtomProperties(atom.element);
            atom.color = props.color;
            atom.radius = props.radius;
        }
        return true;
    });

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    if (finalAtoms.length > 0) {
        finalAtoms.forEach(atom => {
            if (!isNaN(atom.position.x)) {
                minX = Math.min(minX, atom.position.x);
                minY = Math.min(minY, atom.position.y);
                minZ = Math.min(minZ, atom.position.z);
                maxX = Math.max(maxX, atom.position.x);
                maxY = Math.max(maxY, atom.position.y);
                maxZ = Math.max(maxZ, atom.position.z);
            }
        });
    } else {
        minX = -10; minY = -10; minZ = -10;
        maxX = 10; maxY = 10; maxZ = 10;
    }

    if (!isFinite(minX)) { minX = -10; maxX = 10; }
    if (!isFinite(minY)) { minY = -10; maxY = 10; }
    if (!isFinite(minZ)) { minZ = -10; maxZ = 10; }

    return {
      id: `mol-${Date.now()}`,
      filename: file.name,
      atoms: finalAtoms,
      bonds: [],
      boundingBox: {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
      },
      latticeVectors,
    };
};
