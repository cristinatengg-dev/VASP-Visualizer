
export interface VolumetricData {
  ngx: number;
  ngy: number;
  ngz: number;
  data: Float32Array;
  min: number;
  max: number;
  maxAbs?: number;
  normalizeByCellVolume?: boolean;
}

const locateVaspVolumetricSection = (lines: string[]) => {
  let currentLine = 0;

  currentLine++;
  currentLine++;
  currentLine += 3;

  if (currentLine >= lines.length) return null;

  let line = lines[currentLine].trim();
  let parts = line.split(/\s+/);

  if (isNaN(Number(parts[0]))) {
    currentLine++;
    if (currentLine >= lines.length) return null;
    line = lines[currentLine].trim();
    parts = line.split(/\s+/);
  }

  const counts = parts.map(Number);
  if (counts.some(isNaN)) return null;
  const totalAtoms = counts.reduce((a, b) => a + b, 0);
  currentLine++;

  if (currentLine < lines.length && lines[currentLine].trim().toLowerCase().startsWith('s')) currentLine++;
  currentLine++;
  currentLine += totalAtoms;
  while (currentLine < lines.length && lines[currentLine].trim() === '') currentLine++;
  if (currentLine >= lines.length) return null;

  const gridLine = lines[currentLine].trim();
  const gridDims = gridLine.split(/\s+/).map(Number);
  if (gridDims.length < 3) return null;

  const ngx = gridDims[0];
  const ngy = gridDims[1];
  const ngz = gridDims[2];
  if (!Number.isFinite(ngx) || !Number.isFinite(ngy) || !Number.isFinite(ngz) || ngx <= 0 || ngy <= 0 || ngz <= 0) return null;

  currentLine++;
  return { ngx, ngy, ngz, dataStartLine: currentLine };
};

export const parseVolumetricData = (text: string): VolumetricData | null => {
  const lines = text.trim().split('\n');
  const located = locateVaspVolumetricSection(lines);
  if (!located) return null;
  const { ngx, ngy, ngz, dataStartLine } = located;

  // --- 🛡️ Safety Check: Prevent OOM Crashes ---
  const MAX_GRID_SIDE = 512;
  const MAX_TOTAL_POINTS = 20_000_000; // ~80MB for Float32Array
  
  if (ngx <= 0 || ngy <= 0 || ngz <= 0 || 
      ngx > MAX_GRID_SIDE || ngy > MAX_GRID_SIDE || ngz > MAX_GRID_SIDE ||
      (ngx * ngy * ngz) > MAX_TOTAL_POINTS) {
      console.warn(`[Volumetric] Invalid or too large grid dimensions: ${ngx}x${ngy}x${ngz}. Skipping volumetric data.`);
      return null;
  }
  
  const totalGridPoints = ngx * ngy * ngz;
  let currentLine = dataStartLine;
  
  // Read Data
  // VASP writes data in scientific notation, multiple values per line (usually 5 or 10)
  const data = new Float32Array(totalGridPoints);
  let dataIndex = 0;
  
  let min = Infinity;
  let max = -Infinity;
  
  // Use a regex or simple split. Split by whitespace is safest.
  // We iterate lines until we fill the data array.
  
  while (currentLine < lines.length && dataIndex < totalGridPoints) {
      const l = lines[currentLine].trim();
      if (l !== '') {
          const values = l.split(/\s+/);
          for (let i = 0; i < values.length; i++) {
              if (dataIndex >= totalGridPoints) break;
              
              const val = parseFloat(values[i]);
              // VASP CHGCAR data is usually charge * Volume? Or just density?
              // Standard VASP CHGCAR is rho(r) * V_cell. 
              // We divide by V_cell later if needed, or just visualize as is.
              // Usually we visualize as is.
              
              if (!isNaN(val)) {
                  data[dataIndex] = val;
                  if (val < min) min = val;
                  if (val > max) max = val;
                  dataIndex++;
              }
          }
      }
      currentLine++;
  }
  
  if (dataIndex < totalGridPoints) {
      console.warn(`Volumetric data incomplete. Expected ${totalGridPoints}, got ${dataIndex}`);
      // Return partial? Or null? Let's return what we have if it's mostly there, but safer to return null if significantly truncated.
      // But CHGCARs often have augmentation occupancies after. We stop when full.
  }
  
  const maxAbs = Math.max(Math.abs(min), Math.abs(max));
  return { ngx, ngy, ngz, data, min, max, maxAbs };
};

export const parseVolumetricDataDownsample = (text: string, maxTotalPoints = 2_000_000): VolumetricData | null => {
  const lines = text.trim().split('\n');
  const located = locateVaspVolumetricSection(lines);
  if (!located) return null;
  const { ngx, ngy, ngz, dataStartLine } = located;

  const totalGridPoints = ngx * ngy * ngz;
  if (!Number.isFinite(totalGridPoints) || totalGridPoints <= 0) return null;

  const ratio = Math.cbrt(totalGridPoints / maxTotalPoints);
  const stride = Math.max(1, Math.ceil(ratio));

  const dNgx = Math.floor((ngx - 1) / stride) + 1;
  const dNgy = Math.floor((ngy - 1) / stride) + 1;
  const dNgz = Math.floor((ngz - 1) / stride) + 1;
  const dTotal = dNgx * dNgy * dNgz;
  if (!Number.isFinite(dTotal) || dTotal <= 0) return null;

  const data = new Float32Array(dTotal);
  let min = Infinity;
  let max = -Infinity;

  let currentLine = dataStartLine;
  let dataIndex = 0;
  const plane = ngx * ngy;

  while (currentLine < lines.length && dataIndex < totalGridPoints) {
    const l = lines[currentLine].trim();
    if (l !== '') {
      const values = l.split(/\s+/);
      for (let i = 0; i < values.length; i++) {
        if (dataIndex >= totalGridPoints) break;
        const val = parseFloat(values[i]);
        if (!isNaN(val)) {
          const ix = dataIndex % ngx;
          const iy = Math.floor(dataIndex / ngx) % ngy;
          const iz = Math.floor(dataIndex / plane);
          if (ix % stride === 0 && iy % stride === 0 && iz % stride === 0) {
            const dx = Math.floor(ix / stride);
            const dy = Math.floor(iy / stride);
            const dz = Math.floor(iz / stride);
            const di = dx + dy * dNgx + dz * dNgx * dNgy;
            data[di] = val;
            if (val < min) min = val;
            if (val > max) max = val;
          }
          dataIndex++;
        }
      }
    }
    currentLine++;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 0;
  }
  const maxAbs = Math.max(Math.abs(min), Math.abs(max));
  return { ngx: dNgx, ngy: dNgy, ngz: dNgz, data, min, max, maxAbs };
};
