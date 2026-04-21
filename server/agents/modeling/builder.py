import sys
import json
import warnings
import os
import re
import tempfile
import urllib.request
import urllib.parse
import urllib.error
from typing import Dict, Any, List, Tuple, Optional

# Suppress warnings
warnings.filterwarnings('ignore')

# -----------------------------------------------------------------------------
# 1. Environment & Setup
# -----------------------------------------------------------------------------

def load_env_file(path: str) -> None:
    if not path or not os.path.exists(path):
        return
    try:
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                raw = line.strip()
                if not raw or raw.startswith('#'): continue
                if '=' not in raw: continue
                key, val = raw.split('=', 1)
                os.environ[key.strip()] = val.strip().strip('"').strip("'")
    except Exception:
        pass

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env')
load_env_file(env_path)

# Pymatgen & ASE imports
try:
    from pymatgen.core import Structure, Molecule, Lattice, Composition
    from pymatgen.core.surface import SlabGenerator
    from pymatgen.io.vasp import Poscar
    from pymatgen.io.cif import CifWriter
    from pymatgen.symmetry.analyzer import SpacegroupAnalyzer
    import numpy as np
except Exception as e:
    sys.stderr.write(f"CRITICAL: Failed to initialize pymatgen runtime: {e}\n")
    sys.stderr.write("Please reinstall compatible numpy / pymatgen binaries on the modeling host.\n")
    sys.exit(1)

# -----------------------------------------------------------------------------
# 2. Structure Providers
# -----------------------------------------------------------------------------

MP_BASE_URL = os.environ.get('MP_BASE_URL', 'https://api.materialsproject.org')
MP_PROXY_URL = os.environ.get('MP_PROXY_URL', '')  # Cloudflare Worker proxy URL as fallback

DEFAULT_PROVIDER_ORDER = [
    'materials_project',
    'atomly',
    'csd',
    'icsd',
    'optimade',
    'fallback',
]

PROVIDER_LABELS = {
    'materials_project': 'Materials Project',
    'atomly': 'Atomly',
    'csd': 'CSD',
    'icsd': 'ICSD',
    'optimade': 'OPTIMADE',
    'fallback': 'Fallback',
}

PROVIDER_ALIASES = {
    'mp': 'materials_project',
    'materialsproject': 'materials_project',
    'materials_project': 'materials_project',
    'materials-project': 'materials_project',
    'materials project': 'materials_project',
    'atomly': 'atomly',
    'csd': 'csd',
    'cambridge structural database': 'csd',
    'icsd': 'icsd',
    'inorganic crystal structure database': 'icsd',
    'optimade': 'optimade',
    'fallback': 'fallback',
    'local_fallback': 'fallback',
}

def first_env(*keys: str) -> Optional[str]:
    for key in keys:
        val = os.environ.get(key)
        if val:
            return val
    return None

def _mp_fetch(base_url: str, path: str, params: dict) -> dict:
    api_key = os.environ.get('MP_API_KEY')
    if not api_key:
        raise RuntimeError('MP_API_KEY not found in environment')

    url = base_url.rstrip('/') + path
    if params:
        url = url + '?' + urllib.parse.urlencode(params, doseq=True)

    req = urllib.request.Request(
        url,
        headers={
            'X-API-KEY': api_key,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        method='GET',
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))

def mp_get_json(path: str, params: dict) -> dict:
    try:
        return _mp_fetch(MP_BASE_URL, path, params)
    except urllib.error.HTTPError as e:
        if e.code == 403 and MP_PROXY_URL:
            sys.stderr.write(f"MP: Direct API returned 403, retrying via proxy...\\n")
            return _mp_fetch(MP_PROXY_URL, path, params)
        raise

def normalize_formula(formula: str) -> str:
    """Normalize formula for MP API, e.g., TiO2 -> Ti1O2"""
    parts = re.findall(r'([A-Z][a-z]*)(\d*)', formula)
    normalized = ""
    for el, count in parts:
        normalized += f"{el}{count if count else '1'}"
    return normalized

def normalize_provider_name(value: Any) -> Optional[str]:
    raw = str(value or '').strip().lower()
    if not raw:
        return None
    return PROVIDER_ALIASES.get(raw)

def resolve_provider_preferences(intent: Dict[str, Any]) -> List[str]:
    raw_values: Any = (
        intent.get('provider_preferences')
        or intent.get('database_preferences')
        or intent.get('database_sources')
        or intent.get('provider_order')
        or []
    )

    if isinstance(raw_values, str):
        candidates = [part.strip() for part in raw_values.split(',') if part.strip()]
    elif isinstance(raw_values, list):
        candidates = raw_values
    else:
        candidates = []

    normalized: List[str] = []
    for candidate in candidates:
        provider = normalize_provider_name(candidate)
        if provider and provider not in normalized:
            normalized.append(provider)

    if not normalized:
        return list(DEFAULT_PROVIDER_ORDER)

    for provider in DEFAULT_PROVIDER_ORDER:
        if provider not in normalized:
            normalized.append(provider)

    return normalized

def create_rocksalt_structure(a: float, species_a: str, species_b: str) -> Structure:
    """Create a rocksalt (Fm-3m) structure."""
    latt = Lattice.cubic(a)
    return Structure(
        latt,
        [species_a, species_b],
        [[0, 0, 0], [0.5, 0.5, 0.5]]
    )

def get_fallback_structure(formula: str) -> Tuple[Optional[Structure], Optional[str]]:
    """Provide common structures when external APIs are unreachable."""
    sys.stderr.write(f"Fallback: Searching for '{formula}' locally...\n")

    f = formula.strip()
    f_lower = f.lower().replace(' ', '').replace('-', '')

    # Descriptive name aliases → canonical formula
    DESCRIPTIVE_ALIASES = {
        'p2layeredoxide': 'NaCoO2',
        'p2type': 'NaCoO2',
        'p2typelayeredoxide': 'NaCoO2',
        'o3layeredoxide': 'LiCoO2',
        'o3type': 'LiCoO2',
        'layeredoxide': 'LiCoO2',
        'lfp': 'LiFePO4',
        'lco': 'LiCoO2',
        'lmo': 'LiMn2O4',
        'nmc': 'LiNiO2',
        'nca': 'LiNiO2',
        'nasicon': 'Na3V2P3O12',
        'spinel': 'LiMn2O4',
        'olivine': 'LiFePO4',
        'garnet': 'Li7La3Zr2O12',
        'perovskite': 'SrTiO3',
        'rutile': 'TiO2',
        'wurtzite': 'ZnO',
        'rocksalt': 'NaCl',
        'fluorite': 'CeO2',
    }

    resolved = DESCRIPTIVE_ALIASES.get(f_lower, f)

    try:
        # ── FCC Metals ──
        fcc_lc = {"Cu": 3.61, "Ag": 4.09, "Au": 4.08, "Al": 4.05, "Ni": 3.52, "Pt": 3.92, "Pd": 3.89}
        if resolved in fcc_lc:
            a = fcc_lc[resolved]
            s = Structure.from_spacegroup("Fm-3m", Lattice.cubic(a), [resolved], [[0, 0, 0]])
            return s, f"{resolved} (Fallback FCC)"

        # ── BCC Metals ──
        bcc_lc = {"Fe": 2.87, "W": 3.16, "Mo": 3.15, "Ta": 3.30, "Cr": 2.88, "V": 3.03, "Nb": 3.30}
        if resolved in bcc_lc:
            a = bcc_lc[resolved]
            s = Structure.from_spacegroup("Im-3m", Lattice.cubic(a), [resolved], [[0, 0, 0]])
            return s, f"{resolved} (Fallback BCC)"

        # ── Diamond/Zincblende ──
        diamond_lc = {"Si": 5.43, "Ge": 5.66, "C": 3.57}
        if resolved in diamond_lc:
            a = diamond_lc[resolved]
            s = Structure.from_spacegroup("Fd-3m", Lattice.cubic(a), [resolved], [[0, 0, 0]])
            return s, f"{resolved} (Fallback Diamond)"

        # ── Simple Oxides ──
        if resolved == "TiO2":
            latt = Lattice.tetragonal(4.594, 2.959)
            s = Structure.from_spacegroup("P42/mnm", latt, ["Ti", "O"], [[0,0,0], [0.305, 0.305, 0]])
            return s, "TiO2 (Fallback Rutile)"

        if resolved == "ZnO":
            latt = Lattice.hexagonal(3.25, 5.20)
            s = Structure.from_spacegroup("P63mc", latt, ["Zn", "O"], [[1/3, 2/3, 0], [1/3, 2/3, 0.375]])
            return s, "ZnO (Fallback Wurtzite)"

        if resolved == "NaCl":
            s = create_rocksalt_structure(5.64, "Na", "Cl")
            return s, "NaCl (Fallback Rocksalt)"

        if resolved == "MgO":
            s = create_rocksalt_structure(4.212, "Mg", "O")
            return s, "MgO (Fallback Rocksalt)"

        if resolved == "CeO2":
            s = Structure.from_spacegroup("Fm-3m", Lattice.cubic(5.411), ["Ce", "O"], [[0,0,0], [0.25, 0.25, 0.25]])
            return s, "CeO2 (Fallback Fluorite)"

        if resolved == "SrTiO3":
            s = Structure.from_spacegroup("Pm-3m", Lattice.cubic(3.905), ["Sr", "Ti", "O"], [[0,0,0], [0.5,0.5,0.5], [0.5,0.5,0]])
            return s, "SrTiO3 (Fallback Perovskite)"

        if resolved in ("Graphite", "Graphene"):
            latt = Lattice.hexagonal(2.46, 6.71)
            s = Structure.from_spacegroup("P63/mmc", latt, ["C", "C"], [[0, 0, 0], [1/3, 2/3, 0]])
            return s, "Graphite (Fallback)"

        # ══════════════════════════════════════════════════════════════════
        # Battery Cathode Materials
        # ══════════════════════════════════════════════════════════════════

        # LiCoO2 — O3 layered (R-3m), the canonical LCO cathode
        if resolved == "LiCoO2":
            latt = Lattice.hexagonal(2.816, 14.08)
            s = Structure.from_spacegroup("R-3m", latt, ["Li", "Co", "O"],
                                          [[0, 0, 0.5], [0, 0, 0], [0, 0, 0.2603]])
            return s, "LiCoO2 (Fallback O3 R-3m)"

        # NaCoO2 — P2 layered (P63/mmc), sodium-ion cathode
        if resolved == "NaCoO2":
            latt = Lattice.hexagonal(2.83, 10.81)
            s = Structure.from_spacegroup("P63/mmc", latt, ["Na", "Co", "O"],
                                          [[1/3, 2/3, 0.75], [0, 0, 0], [1/3, 2/3, 0.085]])
            return s, "NaCoO2 (Fallback P2 P63/mmc)"

        # LiFePO4 — olivine (Pnma), LFP cathode
        if resolved == "LiFePO4":
            latt = Lattice.orthorhombic(10.332, 6.010, 4.692)
            s = Structure.from_spacegroup("Pnma", latt,
                                          ["Li", "Fe", "P", "O", "O", "O"],
                                          [[0, 0, 0], [0.2822, 0.25, 0.9735],
                                           [0.0949, 0.25, 0.4181],
                                           [0.0966, 0.25, 0.7427],
                                           [0.4573, 0.25, 0.2067],
                                           [0.1657, 0.0464, 0.2852]])
            return s, "LiFePO4 (Fallback Olivine Pnma)"

        # LiMn2O4 — spinel (Fd-3m), spinel cathode
        if resolved == "LiMn2O4":
            s = Structure.from_spacegroup("Fd-3m", Lattice.cubic(8.245),
                                          ["Li", "Mn", "O"],
                                          [[0.125, 0.125, 0.125], [0.5, 0.5, 0.5], [0.2625, 0.2625, 0.2625]])
            return s, "LiMn2O4 (Fallback Spinel Fd-3m)"

        # LiNiO2 — layered (R-3m), NCA/NMC base
        if resolved == "LiNiO2":
            latt = Lattice.hexagonal(2.878, 14.19)
            s = Structure.from_spacegroup("R-3m", latt, ["Li", "Ni", "O"],
                                          [[0, 0, 0.5], [0, 0, 0], [0, 0, 0.259]])
            return s, "LiNiO2 (Fallback Layered R-3m)"

        # NaMnO2 — O3 layered (C2/m), sodium cathode
        if resolved == "NaMnO2":
            latt = Lattice.monoclinic(5.672, 2.856, 5.807, 113.2)
            s = Structure.from_spacegroup("C2/m", latt, ["Na", "Mn", "O", "O"],
                                          [[0, 0.5, 0.5], [0, 0, 0], [0.227, 0, 0.222], [0.274, 0.5, 0.776]])
            return s, "NaMnO2 (Fallback O3 C2/m)"

        # LiTiO2 — ramsdellite / anatase-related, anode
        if resolved == "LiTiO2":
            latt = Lattice.tetragonal(4.13, 8.52)
            s = Structure.from_spacegroup("I41/amd", latt, ["Li", "Ti", "O"],
                                          [[0, 0.75, 0.125], [0, 0.25, 0.375], [0, 0.25, 0.1665]])
            return s, "LiTiO2 (Fallback I41/amd)"

        # Na3V2P3O12 — NASICON Na3V2(PO4)3 (R-3c)
        if resolved in ("Na3V2P3O12", "Na3V2(PO4)3"):
            latt = Lattice.hexagonal(8.729, 21.805)
            s = Structure.from_spacegroup("R-3c", latt,
                                          ["Na", "Na", "V", "P", "O", "O", "O", "O"],
                                          [[0.6435, 0, 0.25],
                                           [0, 0, 0],
                                           [0, 0, 0.1479],
                                           [0.2892, 0, 0.25],
                                           [0.1816, 0.1691, 0.1915],
                                           [0.1923, 0.9836, 0.0834],
                                           [0.1635, 0.0178, 0.1957],
                                           [0.0245, 0.2064, 0.1946]])
            return s, "Na3V2(PO4)3 (Fallback NASICON R-3c)"

        # ══════════════════════════════════════════════════════════════════
        # Solid Electrolytes
        # ══════════════════════════════════════════════════════════════════

        # Li3PS4 — beta phase (Pnma), sulfide solid electrolyte
        if resolved == "Li3PS4":
            latt = Lattice.orthorhombic(12.819, 8.219, 6.124)
            s = Structure.from_spacegroup("Pnma", latt, ["Li", "Li", "P", "S", "S", "S"],
                                          [[0.342, 0.25, 0.482],
                                           [0.413, 0.015, 0.893],
                                           [0.0867, 0.25, 0.4134],
                                           [0.154, 0.25, 0.732],
                                           [0.024, 0.25, 0.208],
                                           [0.103, 0.036, 0.422]])
            return s, "Li3PS4 (Fallback beta Pnma)"

        # Li7La3Zr2O12 — garnet (Ia-3d), LLZO solid electrolyte
        if resolved == "Li7La3Zr2O12":
            s = Structure.from_spacegroup("Ia-3d", Lattice.cubic(12.968),
                                          ["Li", "Li", "La", "Zr", "O"],
                                          [[0.375, 0, 0.25],
                                           [0.0944, 0.6856, 0.5722],
                                           [0.125, 0, 0.25],
                                           [0, 0, 0],
                                           [0.2812, 0.1016, 0.1984]])
            return s, "Li7La3Zr2O12 (Fallback Garnet Ia-3d)"

        # ══════════════════════════════════════════════════════════════════
        # Last resort: try pymatgen Composition → simple cubic placeholder
        # ══════════════════════════════════════════════════════════════════
        try:
            comp = Composition(resolved)
            elements = [str(el) for el in comp.elements]
            fracs = [comp.get_atomic_fraction(el) for el in comp.elements]
            n_el = len(elements)
            a_guess = 3.0 + 0.5 * n_el
            coords = [[i / n_el, i / n_el, i / n_el] for i in range(n_el)]
            latt = Lattice.cubic(a_guess)
            s = Structure(latt, elements, coords)
            sys.stderr.write(f"Fallback: Built placeholder cubic cell for {comp.reduced_formula}\n")
            return s, f"{comp.reduced_formula} (Fallback placeholder)"
        except Exception as e2:
            sys.stderr.write(f"Fallback composition parse failed: {e2}\n")

    except Exception as e:
        sys.stderr.write(f"Fallback Error: {e}\n")

    return None, None

def get_structure_from_optimade_endpoint(
    formula_query: str,
    base_url: str,
    label: str = "OPTIMADE"
) -> Tuple[Optional[Structure], Optional[str]]:
    """Query an OPTIMADE endpoint for structure."""
    try:
        sys.stderr.write(f"{label}: Querying '{formula_query}' via OPTIMADE...\n")
        
        if formula_query.startswith("mp-") or formula_query.startswith("mvc-"):
            filter_str = f'id="{formula_query}"'
            reduced = formula_query
        else:
            try:
                comp = Composition(formula_query)
                reduced = comp.reduced_formula
            except:
                reduced = formula_query
            filter_str = f'chemical_formula_reduced="{reduced}"'
            
        params = {
            'filter': filter_str,
            'page_limit': 1,
            'response_format': 'jsonapi'
        }
        
        url = base_url.rstrip('/') + '?' + urllib.parse.urlencode(params)
        
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
            },
            method='GET'
        )
        
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            
        entries = data.get('data', [])
        if not entries:
            return None, None
            
        entry = entries[0]
        attrs = entry.get('attributes', {})
        
        lattice = attrs.get('lattice_vectors')
        sites = attrs.get('cartesian_site_positions')
        species = attrs.get('species_at_sites') # List of element symbols
        
        if lattice and sites and species:
            s = Structure(lattice, species, sites, coords_are_cartesian=True)
            sys.stderr.write(f"{label}: Found {reduced} (ID: {entry.get('id')})\n")
            return s, reduced
            
    except Exception as e:
        sys.stderr.write(f"{label} Error: {e}\n")
        
    return None, None

def get_structure_from_optimade(formula_query: str) -> Tuple[Optional[Structure], Optional[str]]:
    return get_structure_from_optimade_endpoint(
        formula_query,
        'https://optimade.materialsproject.org/v1/structures',
        'OPTIMADE'
    )

def get_structure_from_mp_api(material_query: str) -> Tuple[Optional[Structure], Optional[str]]:
    try:
        sys.stderr.write(f"MP: Searching for '{material_query}'...\n")
        
        fields = ["structure", "energy_above_hull", "formula_pretty", "material_id", "symmetry"]
        params = {"_fields": ",".join(fields)}
        
        if material_query.startswith("mp-") or material_query.startswith("mvc-"):
            params["material_ids"] = material_query
        else:
            params["formula"] = material_query

        payload = mp_get_json('/materials/summary/', params)
        docs = payload.get('data') if isinstance(payload, dict) else None

        # Retry with normalized formula if failed
        if not docs:
            norm = normalize_formula(material_query)
            if norm != material_query:
                sys.stderr.write(f"MP: Retrying with normalized formula '{norm}'...\n")
                params["formula"] = norm
                if "material_ids" in params: del params["material_ids"]
                payload = mp_get_json('/materials/summary/', params)
                docs = payload.get('data') if isinstance(payload, dict) else None

        if docs:
            # Sort by stability (energy_above_hull)
            docs.sort(key=lambda x: x.get('energy_above_hull', 1e9))
            best_doc = docs[0]
            
            struct_dict = best_doc.get('structure')
            if struct_dict:
                struct = Structure.from_dict(struct_dict)
                formula = best_doc.get('formula_pretty') or struct.composition.reduced_formula
                sys.stderr.write(f"MP: Found {formula} (ID: {best_doc.get('material_id')})\n")
                return struct, formula

    except urllib.error.HTTPError as e:
        sys.stderr.write(f"MP Error: {e.code} {e.reason}\n")
    except Exception as e:
        sys.stderr.write(f"MP Error: {str(e)}\n")

    return None, None

def structure_from_local_cif_repository(
    material_query: str,
    repository_dir: str,
    label: str
) -> Tuple[Optional[Structure], Optional[str]]:
    if not repository_dir or not os.path.isdir(repository_dir):
        sys.stderr.write(f"{label}: Local CIF repository not configured.\n")
        return None, None

    query = str(material_query or '').strip()
    tokens = [
        query,
        normalize_formula(query),
        query.lower(),
        normalize_formula(query).lower(),
    ]
    seen_paths = set()

    try:
        for root, _, files in os.walk(repository_dir):
            for name in files:
                lower = name.lower()
                if not lower.endswith('.cif') and not lower.endswith('.mcif'):
                    continue
                candidate_path = os.path.join(root, name)
                if candidate_path in seen_paths:
                    continue
                stem = os.path.splitext(name)[0].lower()
                if not any(token and (stem == token.lower() or token.lower() in stem) for token in tokens):
                    continue
                seen_paths.add(candidate_path)
                try:
                    struct = Structure.from_file(candidate_path)
                    formula = struct.composition.reduced_formula
                    sys.stderr.write(f"{label}: Found {formula} in local CIF repository ({candidate_path})\n")
                    return struct, formula
                except Exception as err:
                    sys.stderr.write(f"{label}: Failed to parse {candidate_path}: {err}\n")
    except Exception as err:
        sys.stderr.write(f"{label}: Local CIF repository error: {err}\n")

    return None, None

def get_structure_from_atomly(material_query: str) -> Tuple[Optional[Structure], Optional[str]]:
    optimade_base = first_env('ATOMLY_OPTIMADE_BASE_URL', 'ATOMLY_OPTIMADE_URL')
    if optimade_base:
        struct, formula = get_structure_from_optimade_endpoint(material_query, optimade_base, 'Atomly')
        if struct:
            return struct, formula

    cif_dir = first_env('ATOMLY_CIF_DIR')
    if cif_dir:
        return structure_from_local_cif_repository(material_query, cif_dir, 'Atomly')

    sys.stderr.write("Atomly: Provider not configured. Set ATOMLY_OPTIMADE_BASE_URL or ATOMLY_CIF_DIR.\n")
    return None, None

def crystal_to_structure_from_csd(crystal: Any) -> Tuple[Optional[Structure], Optional[str]]:
    try:
        from ccdc import io as ccdc_io
    except Exception:
        return None, None

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.cif', delete=False) as tmp:
            tmp_path = tmp.name

        writer = ccdc_io.CrystalWriter(tmp_path)
        try:
            writer.write(crystal)
        finally:
            writer.close()

        struct = Structure.from_file(tmp_path)
        return struct, struct.composition.reduced_formula
    except Exception as err:
        sys.stderr.write(f"CSD: Failed to convert crystal to pymatgen Structure: {err}\n")
        return None, None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

def get_structure_from_csd(material_query: str) -> Tuple[Optional[Structure], Optional[str]]:
    if first_env('CSD_CIF_DIR'):
        struct, formula = structure_from_local_cif_repository(material_query, first_env('CSD_CIF_DIR'), 'CSD')
        if struct:
            return struct, formula

    try:
        from ccdc import io as ccdc_io
    except Exception:
        sys.stderr.write("CSD: ccdc Python package is not available. Set CSD_CIF_DIR or install the licensed CSD API.\n")
        return None, None

    query = str(material_query or '').strip()

    try:
        reader = ccdc_io.EntryReader('CSD')
        entry = None
        try:
            entry = reader.entry(query)
        except Exception:
            entry = None

        if entry and getattr(entry, 'crystal', None):
            struct, formula = crystal_to_structure_from_csd(entry.crystal)
            if struct:
                sys.stderr.write(f"CSD: Found {formula} using exact entry lookup '{query}'.\n")
                return struct, formula
    except Exception as err:
        sys.stderr.write(f"CSD: Exact lookup failed: {err}\n")

    try:
        from ccdc import search as ccdc_search
        searcher = ccdc_search.TextNumericSearch()
        searcher.add_compound_name(query)
        hits = searcher.search()
        if hits:
            hit = hits[0]
            crystal = getattr(hit, 'crystal', None)
            if crystal is None and getattr(hit, 'entry', None) is not None:
                crystal = getattr(hit.entry, 'crystal', None)
            if crystal is not None:
                struct, formula = crystal_to_structure_from_csd(crystal)
                if struct:
                    sys.stderr.write(f"CSD: Found {formula} using compound-name search '{query}'.\n")
                    return struct, formula
    except Exception as err:
        sys.stderr.write(f"CSD: Text search failed: {err}\n")

    return None, None

def get_structure_from_icsd(material_query: str) -> Tuple[Optional[Structure], Optional[str]]:
    optimade_base = first_env('ICSD_OPTIMADE_BASE_URL', 'ICSD_OPTIMADE_URL')
    if optimade_base:
        struct, formula = get_structure_from_optimade_endpoint(material_query, optimade_base, 'ICSD')
        if struct:
            return struct, formula

    cif_dir = first_env('ICSD_CIF_DIR')
    if cif_dir:
        return structure_from_local_cif_repository(material_query, cif_dir, 'ICSD')

    sys.stderr.write("ICSD: Provider not configured. Set ICSD_OPTIMADE_BASE_URL or ICSD_CIF_DIR.\n")
    return None, None

def resolve_structure_from_providers(
    material_query: str,
    provider_preferences: List[str]
) -> Tuple[Optional[Structure], Optional[str], Dict[str, Any]]:
    tried: List[str] = []

    if material_query in ["Graphite", "Graphene"] and 'fallback' not in provider_preferences:
        provider_preferences = list(provider_preferences) + ['fallback']

    for provider in provider_preferences:
        tried.append(provider)
        struct: Optional[Structure] = None
        formula: Optional[str] = None

        if provider == 'materials_project':
            struct, formula = get_structure_from_mp_api(material_query)
        elif provider == 'atomly':
            struct, formula = get_structure_from_atomly(material_query)
        elif provider == 'csd':
            struct, formula = get_structure_from_csd(material_query)
        elif provider == 'icsd':
            struct, formula = get_structure_from_icsd(material_query)
        elif provider == 'optimade':
            struct, formula = get_structure_from_optimade(material_query)
        elif provider == 'fallback':
            struct, formula = get_fallback_structure(material_query)

        if struct is not None:
            return struct, formula, {
                'database_source': provider,
                'database_source_label': PROVIDER_LABELS.get(provider, provider),
                'providers_tried': tried,
            }

    return None, None, {
        'database_source': None,
        'database_source_label': None,
        'providers_tried': tried,
    }

# -----------------------------------------------------------------------------
# 3. Modeling Logic (Layer 3 & 4)
# -----------------------------------------------------------------------------

def parse_miller_index(hkl_raw: Any) -> Tuple[int, int, int]:
    """Parse miller index from string (e.g., '(1,1,1)') or list."""
    if isinstance(hkl_raw, list) and len(hkl_raw) >= 3:
        return (int(hkl_raw[0]), int(hkl_raw[1]), int(hkl_raw[2]))
    
    s = str(hkl_raw).strip("()[]{} ")
    parts = re.split(r'[,\s]+', s)
    try:
        # Handle 4-index notation (hkil) -> (hkl) conversion crudely if needed, 
        # but usually 3 is expected. If 4 provided, take h,k,l (skip i)
        ints = [int(x) for x in parts if x]
        if len(ints) == 4:
            return (ints[0], ints[1], ints[3])
        if len(ints) >= 3:
            return (ints[0], ints[1], ints[2])
    except:
        pass
    return (1, 1, 1) # Default

def build_slab(
    bulk: Structure, 
    miller_index: Tuple[int, int, int], 
    min_slab_size: float, 
    min_vacuum_size: float,
    supercell: List[int]
) -> Structure:
    """
    Build a slab using Pymatgen SlabGenerator.
    """
    # 1. Standardize bulk
    sga = SpacegroupAnalyzer(bulk)
    std_struct = sga.get_conventional_standard_structure()
    
    # 2. Setup SlabGenerator
    # min_slab_size is in Angstroms usually
    # min_vacuum_size is in Angstroms
    gen = SlabGenerator(
        std_struct, 
        miller_index, 
        min_slab_size, 
        min_vacuum_size, 
        center_slab=True,
        reorient_lattice=True # Make slab c-axis normal to surface
    )
    
    # 3. Get all terminations and pick the most stable (heuristic: max density or just first)
    slabs = gen.get_slabs()
    if not slabs:
        raise ValueError(f"Could not generate slab for {miller_index}")
    
    # Heuristic for polar surfaces (like NaCl 111):
    # If the slab has a net dipole, we might want to center it differently or reconstruction.
    # Pymatgen's is_polar() checks this.
    
    selected_slab = slabs[0]
    
    # Try to find a non-polar slab if possible
    for s in slabs:
        if not s.is_polar():
            selected_slab = s
            break
            
    # 4. Make supercell
    if supercell and len(supercell) >= 2:
        # Pymatgen supercell scaling
        # Slab is reoriented, so a/b are surface vectors.
        matrix = [[supercell[0], 0, 0], [0, supercell[1], 0], [0, 0, 1]]
        selected_slab.make_supercell(matrix)
        
    return selected_slab

def build_molecule(formula: str) -> Molecule:
    raw_formula = str(formula or '').strip()
    alias = raw_formula.replace(' ', '').lower()
    alias_map = {
        'co2': 'CO2',
        'carbon dioxide': 'CO2',
        'co': 'CO',
        'carbon monoxide': 'CO',
        'h2o': 'H2O',
        'water': 'H2O',
        'o2': 'O2',
        'oxygen': 'O2',
        'n2': 'N2',
        'nitrogen': 'N2',
        'h2': 'H2',
        'hydrogen': 'H2',
        'nh3': 'NH3',
        'ammonia': 'NH3',
        'ch4': 'CH4',
        'methane': 'CH4',
    }
    canonical = alias_map.get(alias, raw_formula.replace(' ', ''))

    common_mols = {
        "H2O": {
            "species": ["O", "H", "H"],
            "coords": [[0.0, 0.0, 0.0], [0.96, 0.0, 0.0], [-0.24, 0.93, 0.0]],
            "anchor_index": 0,
            "default_height": 1.8,
        },
        "CO": {
            "species": ["C", "O"],
            "coords": [[0.0, 0.0, 0.0], [1.13, 0.0, 0.0]],
            "anchor_index": 0,
            "default_height": 1.9,
        },
        "CO2": {
            "species": ["C", "O", "O"],
            "coords": [[0.0, 0.0, 0.0], [1.16, 0.0, 0.0], [-1.16, 0.0, 0.0]],
            "anchor_index": 0,
            "default_height": 2.1,
        },
        "O2": {
            "species": ["O", "O"],
            "coords": [[0.0, 0.0, 0.0], [1.21, 0.0, 0.0]],
            "anchor_index": 0,
            "default_height": 1.8,
        },
        "N2": {
            "species": ["N", "N"],
            "coords": [[0.0, 0.0, 0.0], [1.10, 0.0, 0.0]],
            "anchor_index": 0,
            "default_height": 1.8,
        },
        "H2": {
            "species": ["H", "H"],
            "coords": [[0.0, 0.0, 0.0], [0.74, 0.0, 0.0]],
            "anchor_index": 0,
            "default_height": 1.5,
        },
        "NH3": {
            "species": ["N", "H", "H", "H"],
            "coords": [[0.0, 0.0, 0.0], [0.94, 0.0, 0.38], [-0.47, 0.81, 0.38], [-0.47, -0.81, 0.38]],
            "anchor_index": 0,
            "default_height": 1.9,
        },
        "CH4": {
            "species": ["C", "H", "H", "H", "H"],
            "coords": [[0.0, 0.0, 0.0], [0.63, 0.63, 0.63], [-0.63, -0.63, 0.63], [-0.63, 0.63, -0.63], [0.63, -0.63, -0.63]],
            "anchor_index": 0,
            "default_height": 2.0,
        },
    }

    spec = common_mols.get(canonical)
    if not spec:
        raise ValueError(
            "Unsupported adsorbate formula. Supported molecules: "
            + ", ".join(sorted(common_mols.keys()))
        )

    return Molecule(spec["species"], spec["coords"])

def get_adsorbate_spec(formula: str) -> Dict[str, Any]:
    raw_formula = str(formula or '').strip()
    alias = raw_formula.replace(' ', '').lower()
    alias_map = {
        'co2': 'CO2',
        'carbon dioxide': 'CO2',
        'co': 'CO',
        'carbon monoxide': 'CO',
        'h2o': 'H2O',
        'water': 'H2O',
        'o2': 'O2',
        'oxygen': 'O2',
        'n2': 'N2',
        'nitrogen': 'N2',
        'h2': 'H2',
        'hydrogen': 'H2',
        'nh3': 'NH3',
        'ammonia': 'NH3',
        'ch4': 'CH4',
        'methane': 'CH4',
    }
    canonical = alias_map.get(alias, raw_formula.replace(' ', ''))
    defaults = {
        "CO2": {"anchor_index": 0, "default_height": 2.1},
        "CO": {"anchor_index": 0, "default_height": 1.9},
        "H2O": {"anchor_index": 0, "default_height": 1.8},
        "O2": {"anchor_index": 0, "default_height": 1.8},
        "N2": {"anchor_index": 0, "default_height": 1.8},
        "H2": {"anchor_index": 0, "default_height": 1.5},
        "NH3": {"anchor_index": 0, "default_height": 1.9},
        "CH4": {"anchor_index": 0, "default_height": 2.0},
    }
    if canonical not in defaults:
        raise ValueError(
            "Unsupported adsorbate formula. Supported molecules: "
            + ", ".join(sorted(defaults.keys()))
        )
    return {"formula": canonical, **defaults[canonical]}

def _surface_plane_vectors(slab: Structure) -> Tuple[np.ndarray, np.ndarray]:
    a_vec = np.array(slab.lattice.matrix[0], dtype=float)
    b_vec = np.array(slab.lattice.matrix[1], dtype=float)
    a_vec[2] = 0.0
    b_vec[2] = 0.0

    if np.linalg.norm(a_vec) < 1e-8:
        a_vec = np.array([1.0, 0.0, 0.0], dtype=float)
    if np.linalg.norm(b_vec) < 1e-8:
        b_vec = np.array([0.0, 1.0, 0.0], dtype=float)

    a_vec = a_vec / np.linalg.norm(a_vec)
    b_vec = b_vec / np.linalg.norm(b_vec)
    return a_vec, b_vec

def _top_surface_sites(slab: Structure) -> List[Any]:
    if len(slab) == 0:
        return []
    max_z = max(site.z for site in slab.sites)
    threshold = 1.5
    top_sites = [site for site in slab.sites if site.z >= max_z - threshold]
    return top_sites or list(slab.sites)

def choose_adsorption_anchor_points(
    slab: Structure,
    site_kind: str,
    count: int
) -> List[np.ndarray]:
    top_sites = _top_surface_sites(slab)
    top_coords = np.array([site.coords for site in top_sites], dtype=float)
    max_z = float(np.max(top_coords[:, 2])) if len(top_coords) else 0.0
    a_hat, b_hat = _surface_plane_vectors(slab)

    center_xy = np.mean(top_coords[:, :2], axis=0) if len(top_coords) else np.array([0.0, 0.0])
    base_point = np.array([center_xy[0], center_xy[1], max_z], dtype=float)
    site_key = str(site_kind or 'top').strip().lower()

    if site_key in ('top', 'atop'):
        if len(top_coords):
            highest = top_coords[np.argmax(top_coords[:, 2])]
            base_point = np.array([highest[0], highest[1], max_z], dtype=float)
    elif site_key == 'bridge':
        if len(top_coords) >= 2:
            midpoint = (top_coords[0] + top_coords[1]) / 2.0
            base_point = np.array([midpoint[0], midpoint[1], max_z], dtype=float)
    elif site_key in ('hollow', 'fcc', 'hcp', 'center', 'centroid'):
        if len(top_coords) >= 3:
            centroid = np.mean(top_coords[:3], axis=0)
            base_point = np.array([centroid[0], centroid[1], max_z], dtype=float)

    offsets = [
        (0.0, 0.0),
        (1.0, 0.0),
        (-1.0, 0.0),
        (0.0, 1.0),
        (0.0, -1.0),
        (1.0, 1.0),
        (-1.0, 1.0),
        (1.0, -1.0),
        (-1.0, -1.0),
    ]
    spacing = 2.4

    points: List[np.ndarray] = []
    for index in range(max(1, count)):
        dx, dy = offsets[index % len(offsets)]
        point = base_point + spacing * dx * a_hat + spacing * dy * b_hat
        point[2] = max_z
        points.append(point.copy())

    return points

def apply_substitutional_doping(
    structure: Structure,
    doping: Dict[str, Any],
    prefer_surface: bool = False
) -> Tuple[Structure, Optional[Dict[str, Any]]]:
    if not doping:
        return structure, None

    host_element = str(doping.get('host_element') or '').strip()
    dopant_element = str(doping.get('dopant_element') or '').strip()
    if not host_element or not dopant_element:
        return structure, None

    host_indices = [
        index for index, site in enumerate(structure.sites)
        if site.specie.symbol == host_element
    ]
    if not host_indices:
        raise ValueError(f"Could not find host element '{host_element}' in the current structure.")

    requested_count = doping.get('count')
    try:
        requested_count = int(requested_count)
    except Exception:
        requested_count = None

    if requested_count is None or requested_count <= 0:
        concentration = doping.get('concentration')
        try:
            concentration = float(concentration)
        except Exception:
            concentration = None

        if concentration is not None and concentration > 0:
            fraction = concentration / 100.0 if concentration > 1.0 else concentration
            requested_count = max(1, int(round(len(host_indices) * fraction)))
        else:
            requested_count = 1

    requested_count = max(1, requested_count)

    candidate_indices = host_indices
    if prefer_surface:
        top_sites = _top_surface_sites(structure)
        top_coords = {tuple(np.round(site.coords, 6)) for site in top_sites}
        top_host_indices = [
            index for index, site in enumerate(structure.sites)
            if site.specie.symbol == host_element and tuple(np.round(site.coords, 6)) in top_coords
        ]
        if top_host_indices:
            candidate_indices = top_host_indices

        candidate_indices = sorted(
            candidate_indices,
            key=lambda index: structure[index].z,
            reverse=True
        )

    replace_indices = candidate_indices[:min(len(candidate_indices), requested_count)]
    if not replace_indices:
        raise ValueError(
            f"Could not choose any substitution sites for host element '{host_element}'."
        )

    working = structure.copy()
    for index in replace_indices:
        working.replace(index, dopant_element)

    return working, {
        'hostElement': host_element,
        'dopantElement': dopant_element,
        'requestedCount': requested_count,
        'replacedCount': len(replace_indices),
        'availableHostCount': len(host_indices),
        'surfacePreferred': bool(prefer_surface),
    }

def apply_vacancy_defect(
    structure: Structure,
    defect: Dict[str, Any],
    prefer_surface: bool = False
) -> Tuple[Structure, Optional[Dict[str, Any]]]:
    if not defect:
        return structure, None

    defect_type = str(defect.get('type') or 'vacancy').strip().lower() or 'vacancy'
    if defect_type != 'vacancy':
        raise ValueError(f"Unsupported defect type '{defect_type}'. Only vacancy is supported in Phase 1.")

    element = str(defect.get('element') or '').strip()
    if not element:
        return structure, None

    all_element_indices = [
        index for index, site in enumerate(structure.sites)
        if site.specie.symbol == element
    ]
    if not all_element_indices:
        raise ValueError(f"Could not find element '{element}' in the current structure for vacancy creation.")

    candidate_indices = list(all_element_indices)

    requested_count = defect.get('count')
    try:
        requested_count = int(requested_count)
    except Exception:
        requested_count = 1
    requested_count = max(1, requested_count)

    if prefer_surface:
        top_sites = _top_surface_sites(structure)
        top_coords = {tuple(np.round(site.coords, 6)) for site in top_sites}
        top_candidate_indices = [
            index for index, site in enumerate(structure.sites)
            if site.specie.symbol == element and tuple(np.round(site.coords, 6)) in top_coords
        ]
        if top_candidate_indices:
            candidate_indices = top_candidate_indices

        candidate_indices = sorted(
            candidate_indices,
            key=lambda index: structure[index].z,
            reverse=True
        )

    remove_indices = candidate_indices[:min(len(candidate_indices), requested_count)]
    if not remove_indices:
        raise ValueError(
            f"Could not choose any vacancy sites for element '{element}'."
        )

    working = structure.copy()
    working.remove_sites(sorted(remove_indices, reverse=True))

    return working, {
        'type': 'vacancy',
        'element': element,
        'requestedCount': requested_count,
        'removedCount': len(remove_indices),
        'availableElementCount': len(all_element_indices),
        'surfacePreferred': bool(prefer_surface),
    }

def place_adsorbates_on_slab(
    slab: Structure,
    adsorbates: List[Dict[str, Any]]
) -> Tuple[Structure, List[Dict[str, Any]]]:
    if not adsorbates:
        return slab, []

    working = slab.copy()
    placements: List[Dict[str, Any]] = []

    for adsorbate in adsorbates:
        formula_raw = str(adsorbate.get('formula') or '').strip()
        if not formula_raw:
            continue

        spec = get_adsorbate_spec(formula_raw)
        molecule = build_molecule(spec['formula'])
        count = adsorbate.get('count', 1)
        try:
            count = int(count)
        except Exception:
            count = 1
        count = max(1, count)
        site_kind = str(adsorbate.get('initial_site') or 'top').strip().lower() or 'top'
        anchor_points = choose_adsorption_anchor_points(slab, site_kind, count)

        molecule_coords = np.array([site.coords for site in molecule.sites], dtype=float)
        anchor_index = int(spec.get('anchor_index', 0))
        local_anchor = molecule_coords[anchor_index]

        for point in anchor_points:
            shifted_coords = molecule_coords - local_anchor
            shifted_coords[:, 2] += float(spec.get('default_height', 2.0))
            shifted_coords += point

            for idx, site in enumerate(molecule.sites):
                working.append(
                    site.specie.symbol,
                    shifted_coords[idx].tolist(),
                    coords_are_cartesian=True,
                    validate_proximity=False
                )

        placements.append({
            'formula': spec['formula'],
            'initialSite': site_kind,
            'count': count,
            'placedCount': len(anchor_points),
        })

    return working, placements

# -----------------------------------------------------------------------------
# 4. Export & Formatting (Layer 5)
# -----------------------------------------------------------------------------

def structure_to_render_data(struct: Structure) -> dict:
    """Convert Pymatgen Structure to frontend JSON format."""
    # Lattice vectors
    matrix = struct.lattice.matrix.tolist()
    
    atoms_data = []
    for i, site in enumerate(struct):
        atoms_data.append({
            "id": f"atom-{i}",
            "element": site.specie.symbol,
            "position": {
                "x": site.x,
                "y": site.y,
                "z": site.z
            },
            "index": i
        })
        
    return {
        "atoms": atoms_data,
        "latticeVectors": matrix,
        "totalAtoms": len(atoms_data),
        "formula": struct.composition.reduced_formula
    }

def generate_exports(struct: Structure) -> dict:
    """Generate POSCAR and CIF strings."""
    # POSCAR
    try:
        p = Poscar(struct)
        poscar_str = str(p)
    except:
        poscar_str = ""
        
    # CIF
    try:
        w = CifWriter(struct)
        cif_str = str(w)
    except:
        cif_str = ""
        
    return {
        "poscar": poscar_str,
        "cif": cif_str
    }

def structure_from_render_data(render_data: Dict[str, Any]) -> Structure:
    if not isinstance(render_data, dict):
        raise ValueError("initial_structure must be an object")

    lattice_vectors = render_data.get("latticeVectors")
    atoms = render_data.get("atoms")

    if not isinstance(lattice_vectors, list) or len(lattice_vectors) != 3:
        raise ValueError("initial_structure.latticeVectors must contain three vectors")
    if not isinstance(atoms, list) or not atoms:
        raise ValueError("initial_structure.atoms must be a non-empty list")

    species: List[str] = []
    coords: List[List[float]] = []

    for atom in atoms:
        if not isinstance(atom, dict):
            continue
        element = str(atom.get("element") or atom.get("symbol") or "").strip()
        position = atom.get("position") or {}
        if not element:
            continue
        x = float(position.get("x", atom.get("x", 0.0)))
        y = float(position.get("y", atom.get("y", 0.0)))
        z = float(position.get("z", atom.get("z", 0.0)))
        species.append(element)
        coords.append([x, y, z])

    if not species:
        raise ValueError("initial_structure does not contain any valid atoms")

    return Structure(lattice_vectors, species, coords, coords_are_cartesian=True)

# -----------------------------------------------------------------------------
# Main Handler
# -----------------------------------------------------------------------------

def process_request(intent: dict) -> dict:
    task_type = intent.get('task_type', 'slab')
    provider_preferences = resolve_provider_preferences(intent)
    upstream_meta = intent.get('upstream_meta') if isinstance(intent.get('upstream_meta'), dict) else {}
    initial_structure_data = intent.get('initial_structure')
    initial_structure = None
    if initial_structure_data is not None:
        initial_structure = structure_from_render_data(initial_structure_data)
    
    if task_type == 'slab':
        sub = intent.get('substrate', {})
        material = sub.get('material', 'Cu')
        hkl_raw = sub.get('surface', '(111)')
        
        # New parameters with defaults
        min_slab_size = float(sub.get('min_slab_size', 8.0)) # Angstroms
        min_vacuum_size = float(sub.get('vacuum', 15.0)) # Angstroms
        supercell = sub.get('supercell', [1, 1, 1])
        
        # Special handling for Graphene
        is_graphene = False
        if material.lower() == 'graphene':
            is_graphene = True
            material = "Graphite" # Map to bulk
            if sub.get('min_slab_size') is None:
                min_slab_size = 2.0 # Force thin slab for single layer
            if sub.get('surface') is None or sub.get('surface') == '{0001}':
                hkl_raw = '(001)' # Default to basal plane
        
        miller_index = parse_miller_index(hkl_raw)

        if initial_structure is not None:
            slab = initial_structure.copy()
            source_meta = {
                'database_source': upstream_meta.get('databaseSource'),
                'database_source_label': upstream_meta.get('databaseSourceLabel'),
                'providers_tried': upstream_meta.get('providersTried', []),
            }
            formula_pretty = upstream_meta.get('formula') or slab.composition.reduced_formula
        else:
            # 1. Retrieve Bulk
            bulk, formula_pretty, source_meta = resolve_structure_from_providers(material, provider_preferences)
            if not bulk:
                raise ValueError(
                    f"Could not find bulk structure for '{material}' using providers: {', '.join(source_meta.get('providers_tried', [])) or 'none'}."
                )
                
            # 2. Build Slab
            slab = build_slab(bulk, miller_index, min_slab_size, min_vacuum_size, supercell)

        doping_meta = None
        if intent.get('doping'):
            slab, doping_meta = apply_substitutional_doping(
                slab,
                intent.get('doping', {}),
                prefer_surface=True,
            )

        defect_meta = None
        if intent.get('defect'):
            slab, defect_meta = apply_vacancy_defect(
                slab,
                intent.get('defect', {}),
                prefer_surface=True,
            )

        placement_meta = []
        if intent.get('adsorbates'):
            slab, placement_meta = place_adsorbates_on_slab(
                slab,
                intent.get('adsorbates', [])
            )
        
        # 3. Validation (Simple checks)
        if len(slab) > 5000:
            raise ValueError(f"Generated system is too large ({len(slab)} atoms). Please reduce supercell size.")
            
        # 4. Prepare Output
        render_data = structure_to_render_data(slab)
        exports = generate_exports(slab)
        
        return {
            "success": True,
            "data": render_data,
            "exports": exports,
            "meta": {
                "formula": render_data.get("formula") or formula_pretty,
                "system": "slab",
                "hkl": miller_index,
                "databaseSource": source_meta.get('database_source'),
                "databaseSourceLabel": source_meta.get('database_source_label'),
                "providersTried": source_meta.get('providers_tried', []),
                "providerPreferences": provider_preferences,
                "doping": doping_meta,
                "defect": defect_meta,
                "adsorbates": placement_meta,
            }
        }
        
    elif task_type == 'bulk':
        material = intent.get('material') or intent.get('substrate', {}).get('material', 'Si')
        if initial_structure is not None:
            bulk = initial_structure.copy()
            formula = upstream_meta.get('formula') or bulk.composition.reduced_formula
            source_meta = {
                'database_source': upstream_meta.get('databaseSource'),
                'database_source_label': upstream_meta.get('databaseSourceLabel'),
                'providers_tried': upstream_meta.get('providersTried', []),
            }
        else:
            # Simple bulk retrieval
            bulk, formula, source_meta = resolve_structure_from_providers(material, provider_preferences)
            if not bulk:
                 raise ValueError(
                     f"Could not find bulk structure for '{material}' using providers: {', '.join(source_meta.get('providers_tried', [])) or 'none'}."
                 )
                 
            sc = intent.get('supercell') or intent.get('substrate', {}).get('supercell', [1,1,1])
            if sc and len(sc) == 3:
                bulk.make_supercell(sc)

        doping_meta = None
        if intent.get('doping'):
            bulk, doping_meta = apply_substitutional_doping(
                bulk,
                intent.get('doping', {}),
                prefer_surface=False,
            )

        defect_meta = None
        if intent.get('defect'):
            bulk, defect_meta = apply_vacancy_defect(
                bulk,
                intent.get('defect', {}),
                prefer_surface=False,
            )
            
        render_data = structure_to_render_data(bulk)
        exports = generate_exports(bulk)
        return {
            "success": True, 
            "data": render_data,
            "exports": exports,
            "meta": {
                "formula": render_data.get("formula") or formula,
                "system": "bulk",
                "databaseSource": source_meta.get('database_source'),
                "databaseSourceLabel": source_meta.get('database_source_label'),
                "providersTried": source_meta.get('providers_tried', []),
                "providerPreferences": provider_preferences,
                "doping": doping_meta,
                "defect": defect_meta,
            }
        }

    else:
        raise ValueError(f"Unsupported task_type: {task_type}")

if __name__ == "__main__":
    try:
        # Read from stdin
        raw_input = sys.stdin.read()
        if not raw_input:
            raise ValueError("No input data received")
            
        intent = json.loads(raw_input)
        result = process_request(intent)
        print(json.dumps(result))
    except Exception as e:
        sys.stderr.write(f"Error: {str(e)}\n")
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
