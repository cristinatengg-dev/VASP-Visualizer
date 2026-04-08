#!/usr/bin/env python3
"""
Batch-download common materials from Materials Project API as CIF files.

Run on your local Mac (where MP API works), then commit + push the CIF
directory to the server.

Usage:
    python3 scripts/download-mp-cifs.py

Requires: pymatgen, mp-api  (pip install pymatgen mp-api)
Or uses raw HTTP if mp-api is not installed.

Output: server/data/mp-cifs/<formula>__<mp-id>.cif
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse
import urllib.error

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
OUTPUT_DIR = os.path.join(PROJECT_ROOT, 'server', 'data', 'mp-cifs')

# Load API key from server/.env
def load_api_key():
    env_path = os.path.join(PROJECT_ROOT, 'server', '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith('MP_API_KEY='):
                    return line.split('=', 1)[1].strip().strip('"').strip("'")
    return os.environ.get('MP_API_KEY')

API_KEY = load_api_key()
if not API_KEY:
    print("ERROR: MP_API_KEY not found in server/.env or environment")
    sys.exit(1)

MP_BASE = 'https://api.materialsproject.org'

# Common materials to download - covers most typical modeling requests
# Each entry: formula (MP will return the most stable polymorph)
FORMULAS = [
    # --- Elemental metals ---
    "Cu", "Ag", "Au", "Al", "Ni", "Pt", "Pd", "Fe", "W", "Mo",
    "Ta", "Ti", "Co", "Cr", "Mn", "Zn", "V", "Nb", "Zr", "Hf",
    "Ru", "Rh", "Ir", "Os", "Re", "Mg", "Ca", "Sr", "Ba", "Li",
    "Na", "K", "Rb", "Cs", "Be", "Sc", "Y", "La", "Ce", "Nd",
    "Sn", "Pb", "Bi", "Sb", "In", "Ga", "Tl",

    # --- Semiconductors ---
    "Si", "Ge", "C",  # diamond
    "GaAs", "GaN", "GaP", "GaSb",
    "InAs", "InP", "InSb", "InN",
    "AlAs", "AlN", "AlP",
    "SiC", "BN", "BP",
    "CdTe", "CdSe", "CdS",
    "ZnSe", "ZnTe", "ZnS",
    "PbS", "PbSe", "PbTe",

    # --- Binary oxides ---
    "TiO2", "ZnO", "MgO", "Al2O3", "SiO2", "Fe2O3", "Fe3O4",
    "CuO", "Cu2O", "NiO", "CoO", "Co3O4", "MnO", "MnO2",
    "Cr2O3", "V2O5", "VO2", "WO3", "MoO3", "SnO2", "In2O3",
    "CeO2", "ZrO2", "HfO2", "Ga2O3", "GeO2", "Nb2O5", "Ta2O5",
    "BaO", "CaO", "SrO", "La2O3", "Y2O3", "Sc2O3",
    "RuO2", "IrO2", "PtO2",

    # --- Ternary oxides / perovskites ---
    "SrTiO3", "BaTiO3", "PbTiO3", "BiFeO3", "LaAlO3", "LaMnO3",
    "KNbO3", "NaNbO3", "CaTiO3", "LiNbO3", "SrVO3", "LaCoO3",
    "SrRuO3", "BaZrO3", "BaSnO3",

    # --- Spinels / layered ---
    "MgAl2O4", "FeCr2O4", "LiCoO2", "LiMn2O4", "LiFePO4",
    "NaCoO2", "LiNiO2",

    # --- Sulfides ---
    "MoS2", "WS2", "ZnS", "CuS", "FeS2", "NiS", "CoS2",
    "Bi2S3", "Sb2S3", "In2S3", "SnS", "SnS2",

    # --- Nitrides ---
    "TiN", "ZrN", "HfN", "CrN", "VN", "NbN", "TaN",
    "Si3N4", "Li3N", "Ca3N2",

    # --- Carbides ---
    "TiC", "ZrC", "HfC", "WC", "Mo2C", "SiC", "NbC", "TaC",

    # --- Halides ---
    "NaCl", "KCl", "LiF", "CaF2", "BaF2", "MgF2",
    "CsPbBr3", "CsPbI3", "CsPbCl3",  # halide perovskites

    # --- 2D materials ---
    "MoSe2", "WSe2", "MoTe2", "WTe2",
    "NbSe2", "TaS2", "TaSe2", "NbS2",
    "HfS2", "HfSe2", "ZrS2", "ZrSe2",
    "Bi2Te3", "Bi2Se3", "Sb2Te3",

    # --- Intermetallics / alloys ---
    "NiAl", "TiAl", "FeAl", "CoAl",
    "Ni3Al", "Ti3Al", "Fe3Al",
    "NiTi",  # shape memory

    # --- Others ---
    "CaCO3", "BaCO3", "SrCO3",
    "BaSO4", "CaSO4",
]

# Remove duplicates while preserving order
seen = set()
UNIQUE_FORMULAS = []
for f in FORMULAS:
    if f not in seen:
        seen.add(f)
        UNIQUE_FORMULAS.append(f)

# ---------------------------------------------------------------------------
# Download logic
# ---------------------------------------------------------------------------

def mp_get(path, params):
    url = MP_BASE.rstrip('/') + path
    if params:
        url += '?' + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={
        'X-API-KEY': API_KEY,
        'Accept': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def download_cif_for_formula(formula):
    """Download the most stable structure for a formula from MP."""
    params = {
        'formula': formula,
        '_fields': 'structure,energy_above_hull,formula_pretty,material_id,symmetry',
    }
    try:
        data = mp_get('/materials/summary/', params)
    except urllib.error.HTTPError as e:
        print(f"  ERROR: HTTP {e.code} for {formula}")
        return False
    except Exception as e:
        print(f"  ERROR: {e} for {formula}")
        return False

    docs = data.get('data', [])
    if not docs:
        print(f"  NOT FOUND: {formula}")
        return False

    # Pick most stable (lowest energy_above_hull)
    docs.sort(key=lambda x: x.get('energy_above_hull', 1e9))
    best = docs[0]

    mp_id = best.get('material_id', 'unknown')
    formula_pretty = best.get('formula_pretty', formula)
    struct_dict = best.get('structure')

    if not struct_dict:
        print(f"  NO STRUCTURE: {formula} ({mp_id})")
        return False

    try:
        from pymatgen.core import Structure
        from pymatgen.io.cif import CifWriter
        struct = Structure.from_dict(struct_dict)
        cif_content = str(CifWriter(struct, symprec=0.1))
    except ImportError:
        # Fallback: save raw JSON structure dict
        cif_content = None
    except Exception as e:
        print(f"  CIF WRITE ERROR: {e} for {formula}")
        cif_content = None

    # Save file
    safe_formula = formula_pretty.replace('/', '_')
    filename = f"{safe_formula}__{mp_id}.cif"
    filepath = os.path.join(OUTPUT_DIR, filename)

    if cif_content:
        with open(filepath, 'w') as f:
            f.write(cif_content)
    else:
        # Save as JSON if pymatgen not available
        filename = f"{safe_formula}__{mp_id}.json"
        filepath = os.path.join(OUTPUT_DIR, filename)
        with open(filepath, 'w') as f:
            json.dump(struct_dict, f)

    e_hull = best.get('energy_above_hull', '?')
    sym = best.get('symmetry', {}).get('symbol', '?')
    print(f"  OK: {formula_pretty} ({mp_id}) E_hull={e_hull} {sym} -> {filename}")
    return True


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Downloading {len(UNIQUE_FORMULAS)} materials to {OUTPUT_DIR}")
    print(f"API key: {API_KEY[:8]}...{API_KEY[-4:]}")
    print()

    success = 0
    failed = 0

    for i, formula in enumerate(UNIQUE_FORMULAS):
        print(f"[{i+1}/{len(UNIQUE_FORMULAS)}] {formula}")
        if download_cif_for_formula(formula):
            success += 1
        else:
            failed += 1

        # Rate limiting: ~2 requests/sec to be polite
        time.sleep(0.5)

    print()
    print(f"Done. {success} downloaded, {failed} failed/missing.")
    print(f"Files in: {OUTPUT_DIR}")
    print()
    print("Next steps:")
    print("  1. git add server/data/mp-cifs/")
    print("  2. git commit -m 'Add MP CIF cache for offline structure lookup'")
    print("  3. git push && deploy to server")
    print("  4. Set in server .env: MP_CIF_CACHE_DIR=/home/deploy/VASP-Visualizer/server/data/mp-cifs")


if __name__ == '__main__':
    main()
