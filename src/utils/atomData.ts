// Basic CPK color and radius data for common elements
export const getAtomProperties = (element: string): { color: string; radius: number } => {
  const symbol = element.trim();
  // Default fallback
  const defaultProps = { color: '#ff1493', radius: 0.5 }; // Deep pink for unknown

  const data: Record<string, { color: string; radius: number }> = {
    H: { color: '#FFFFFF', radius: 0.37 },
    He: { color: '#D9FFFF', radius: 0.32 },
    Li: { color: '#CC80FF', radius: 1.34 },
    Be: { color: '#C2FF00', radius: 0.90 },
    B: { color: '#FFB5B5', radius: 0.82 },
    C: { color: '#909090', radius: 0.77 },
    N: { color: '#3050F8', radius: 0.75 },
    O: { color: '#FF0D0D', radius: 0.73 },
    F: { color: '#90E050', radius: 0.71 },
    Ne: { color: '#B3E3F5', radius: 0.69 },
    Na: { color: '#AB5CF2', radius: 1.54 },
    Mg: { color: '#7B68EE', radius: 1.30 }, // MediumSlateBlue
    Al: { color: '#9370DB', radius: 1.18 }, // MediumPurple (Metal)
    Si: { color: '#F5F5DC', radius: 1.11 }, // Beige
    P: { color: '#FF8000', radius: 1.06 },
    S: { color: '#FFFF30', radius: 1.02 },
    Cl: { color: '#1FF01F', radius: 0.99 },
    Ar: { color: '#80D1E3', radius: 0.97 },
    K: { color: '#8F40D4', radius: 1.96 }, // Purple
    Ca: { color: '#3DFF00', radius: 1.74 },
    Sc: { color: '#E6E6E6', radius: 1.44 },
    Ti: { color: '#6A5ACD', radius: 1.36 }, // SlateBlue (Metal)
    V: { color: '#A6A6AB', radius: 1.25 },
    Cr: { color: '#8A99C7', radius: 1.27 },
    Mn: { color: '#9C7AC7', radius: 1.39 },
    Fe: { color: '#483D8B', radius: 1.25 }, // DarkSlateBlue (Metal)
    Co: { color: '#F090A0', radius: 1.26 },
    Ni: { color: '#50D050', radius: 1.21 },
    Cu: { color: '#C88033', radius: 1.38 },
    Zn: { color: '#7D80B0', radius: 1.31 },
    Ga: { color: '#C28F8F', radius: 1.26 },
    Ge: { color: '#668F8F', radius: 1.22 },
    As: { color: '#BD80E3', radius: 1.19 },
    Se: { color: '#FFA100', radius: 1.16 },
    Br: { color: '#A62929', radius: 1.14 },
    Kr: { color: '#5CB8D1', radius: 1.10 },
    Rb: { color: '#702EB0', radius: 2.11 },
    Sr: { color: '#00FF00', radius: 1.92 },
    Y: { color: '#94FFFF', radius: 1.62 },
    Zr: { color: '#94E0E0', radius: 1.48 },
    Nb: { color: '#73C2C9', radius: 1.37 },
    Mo: { color: '#54B5B5', radius: 1.45 },
    Tc: { color: '#3B9E9E', radius: 1.56 },
    Ru: { color: '#248F8F', radius: 1.26 },
    Rh: { color: '#0A7D8C', radius: 1.35 },
    Pd: { color: '#006985', radius: 1.31 },
    Ag: { color: '#C0C0C0', radius: 1.53 },
    Cd: { color: '#FFD98F', radius: 1.48 },
    In: { color: '#A67573', radius: 1.44 },
    Sn: { color: '#668080', radius: 1.41 },
    Sb: { color: '#9E63B5', radius: 1.38 },
    Te: { color: '#D47A00', radius: 1.35 },
    I: { color: '#940094', radius: 1.33 },
    Xe: { color: '#429EB0', radius: 1.30 },
    Cs: { color: '#57178F', radius: 2.25 },
    Ba: { color: '#00C900', radius: 1.98 },
    La: { color: '#70D4FF', radius: 1.95 },
    Ce: { color: '#FFFFC7', radius: 1.85 },
    Pr: { color: '#D9FFC7', radius: 2.47 },
    Nd: { color: '#C7FFC7', radius: 2.06 },
    Pm: { color: '#A3FFC7', radius: 2.05 },
    Sm: { color: '#8FFFC7', radius: 2.38 },
    Eu: { color: '#61FFC7', radius: 2.31 },
    Gd: { color: '#45FFC7', radius: 2.33 },
    Tb: { color: '#30FFC7', radius: 2.25 },
    Dy: { color: '#1FFFC7', radius: 2.28 },
    Ho: { color: '#00FF9C', radius: 2.26 },
    Er: { color: '#00E675', radius: 2.26 },
    Tm: { color: '#00D452', radius: 2.22 },
    Yb: { color: '#00BF38', radius: 2.22 },
    Lu: { color: '#00AB24', radius: 2.17 },
    Hf: { color: '#4DC2FF', radius: 2.08 },
    Ta: { color: '#4DA6FF', radius: 2.00 },
    W:  { color: '#2194D6', radius: 1.93 },
    Re: { color: '#267DAB', radius: 1.88 },
    Os: { color: '#266696', radius: 1.85 },
    Ir: { color: '#175487', radius: 1.80 },
    Pt: { color: '#D0D0E0', radius: 1.77 },
    Au: { color: '#FFD123', radius: 1.74 },
    Hg: { color: '#B8B8D0', radius: 1.71 },
    Tl: { color: '#A6544D', radius: 1.56 },
    Pb: { color: '#575961', radius: 1.54 },
    Bi: { color: '#9E4FB5', radius: 1.43 },
    Po: { color: '#AB5C00', radius: 1.35 },
    At: { color: '#754F45', radius: 1.27 },
    // Add more as needed
  };

  return data[symbol] || defaultProps;
};

// Covalent radii (Å) from Cordero et al. (2008) / Alvarez et al. (2008)
// Used for automatic bond detection (VESTA/OVITO style)
export const getCovalentRadius = (element: string): number => {
  const covalentRadii: Record<string, number> = {
    H:  0.31, He: 0.28,
    Li: 1.28, Be: 0.96, B:  0.84, C:  0.76, N:  0.71, O:  0.66, F:  0.57, Ne: 0.58,
    Na: 1.66, Mg: 1.41, Al: 1.21, Si: 1.11, P:  1.07, S:  1.05, Cl: 1.02, Ar: 1.06,
    K:  2.03, Ca: 1.76, Sc: 1.70, Ti: 1.60, V:  1.53, Cr: 1.39, Mn: 1.61, Fe: 1.32,
    Co: 1.26, Ni: 1.24, Cu: 1.32, Zn: 1.22, Ga: 1.22, Ge: 1.20, As: 1.19, Se: 1.20,
    Br: 1.20, Kr: 1.16,
    Rb: 2.20, Sr: 1.95, Y:  1.90, Zr: 1.75, Nb: 1.64, Mo: 1.54, Tc: 1.47, Ru: 1.46,
    Rh: 1.42, Pd: 1.39, Ag: 1.45, Cd: 1.44, In: 1.42, Sn: 1.39, Sb: 1.39, Te: 1.38,
    I:  1.39, Xe: 1.40,
    Cs: 2.44, Ba: 2.15, La: 2.07, Ce: 2.04, Pr: 2.03, Nd: 2.01, Pm: 1.99, Sm: 1.98,
    Eu: 1.98, Gd: 1.96, Tb: 1.94, Dy: 1.92, Ho: 1.92, Er: 1.89, Tm: 1.90, Yb: 1.87,
    Lu: 1.87, Hf: 1.75, Ta: 1.70, W:  1.62, Re: 1.51, Os: 1.44, Ir: 1.41, Pt: 1.36,
    Au: 1.36, Hg: 1.32, Tl: 1.45, Pb: 1.46, Bi: 1.48, Po: 1.40, At: 1.50,
  };
  return covalentRadii[element.trim()] ?? 1.0; // Default 1.0 Å for unknown elements
};

// Ionic radii (Å) - Shannon (1976), most common oxidation state, 6-coordination
// Used for VESTA-style ionic bond detection: d(A-B) <= r_ion(A) + r_ion(B) + tolerance
export const getIonicRadius = (element: string): number => {
  const ionicRadii: Record<string, number> = {
    H:  0.00, He: 0.00,
    Li: 0.76, Be: 0.45, B:  0.11, C:  0.16, N:  0.13, O:  1.40, F:  1.33, Ne: 0.00,
    Na: 1.02, Mg: 0.72, Al: 0.535, Si: 0.40, P:  0.38, S:  1.84, Cl: 1.81, Ar: 0.00,
    K:  1.38, Ca: 1.00, Sc: 0.745, Ti: 0.605, V:  0.54, Cr: 0.615, Mn: 0.83, Fe: 0.645,
    Co: 0.61, Ni: 0.69, Cu: 0.73, Zn: 0.74, Ga: 0.62, Ge: 0.53, As: 0.46, Se: 1.98,
    Br: 1.96, Kr: 0.00,
    Rb: 1.52, Sr: 1.18, Y:  0.90, Zr: 0.72, Nb: 0.64, Mo: 0.59, Tc: 0.645, Ru: 0.68,
    Rh: 0.665, Pd: 0.615, Ag: 1.15, Cd: 0.95, In: 0.80, Sn: 0.69, Sb: 0.76, Te: 2.21,
    I:  2.20, Xe: 0.00,
    Cs: 1.67, Ba: 1.35, La: 1.032, Ce: 1.01, Pr: 0.99, Nd: 0.983, Pm: 0.97, Sm: 0.958,
    Eu: 0.947, Gd: 0.938, Tb: 0.923, Dy: 0.912, Ho: 0.901, Er: 0.89, Tm: 0.880, Yb: 0.868,
    Lu: 0.861, Hf: 0.71, Ta: 0.64, W:  0.60, Re: 0.63, Os: 0.685, Ir: 0.625, Pt: 0.625,
    Au: 1.37, Hg: 1.02, Tl: 1.50, Pb: 1.19, Bi: 1.03, Po: 0.94, At: 0.62,
  };
  return ionicRadii[element.trim()] ?? 0.0;
};

// VESTA-style bond threshold: max(covalent_sum, ionic_sum) + tolerance
// This replicates VESTA's dual covalent+ionic bond detection logic
export const getVESTABondThreshold = (el1: string, el2: string, tolerance: number = 0.4): number => {
  const e1 = el1.trim();
  const e2 = el2.trim();

  const cov = getCovalentRadius(e1) + getCovalentRadius(e2) + tolerance;
  const ion1 = getIonicRadius(e1);
  const ion2 = getIonicRadius(e2);

  const likelyIonic = isMetal(e1) !== isMetal(e2);
  const useIonic = likelyIonic && ion1 > 0.1 && ion2 > 0.1;
  if (!useIonic) return cov;

  const ionic = ion1 + ion2 + tolerance;
  return Math.min(cov, ionic);
};

export const isMetal = (element: string): boolean => {
    const metals = new Set([
        'Li', 'Be', 'Na', 'Mg', 'Al', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga',
        'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Cs', 'Ba', 'La', 'Ce',
        'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os',
        'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po'
    ]);
    return metals.has(element.trim());
};
