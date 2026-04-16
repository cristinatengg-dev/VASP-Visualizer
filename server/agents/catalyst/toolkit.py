"""
Computational Catalysis Toolkit
================================
Standalone geometry-preparation and analysis utilities for catalysis workflows.
Reads JSON from stdin, writes JSON to stdout.

Capabilities:
  - Slab construction from bulk structures
  - Molecule generation from SMILES
  - Adsorption-site enumeration and adsorbate placement
  - Supercell generation
  - Selective-dynamics helpers (fix by layers / height / indices)
  - Vacancy and substitution defect generation
  - Symmetry-unique site enumeration
  - NEB image interpolation and image-count estimation
  - VASP input-set preparation (relax / static / freq / dos / neb / dimer)
  - K-path generation for band-structure calculations

All functions accept a flat dict and return {"success": true, "data": {...}}.
"""

import json
import math
import sys
import os
import warnings
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Core imports
# ---------------------------------------------------------------------------
try:
    import numpy as np
    from pymatgen.core import Structure, Molecule, Lattice, Composition
    from pymatgen.core.surface import SlabGenerator
    from pymatgen.io.vasp import Poscar
    from pymatgen.io.vasp.inputs import Incar, Kpoints
    from pymatgen.symmetry.analyzer import SpacegroupAnalyzer
except Exception as exc:
    sys.stderr.write(f"CRITICAL: pymatgen/numpy initialisation failed: {exc}\n")
    sys.exit(1)

try:
    from ase import Atoms as AseAtoms
    from ase.io import read as ase_read, write as ase_write
except ImportError:
    AseAtoms = None

# Optional: RDKit for SMILES → 3-D molecule
try:
    from rdkit import Chem
    from rdkit.Chem import AllChem, Descriptors
    HAS_RDKIT = True
except ImportError:
    HAS_RDKIT = False

# Optional: pymatgen adsorption analysis
try:
    from pymatgen.analysis.adsorption import AdsorbateSiteFinder
    HAS_ADSORPTION = True
except ImportError:
    HAS_ADSORPTION = False

# Optional: pymatgen band-structure k-path
try:
    from pymatgen.symmetry.bandstructure import HighSymmKpath
    HAS_KPATH = True
except ImportError:
    HAS_KPATH = False


# ============================================================================
# Helpers
# ============================================================================

def _structure_from_render_data(data: Dict[str, Any]) -> Structure:
    """Convert frontend render data {atoms, latticeVectors} to pymatgen Structure."""
    lattice_vectors = data.get("latticeVectors")
    atoms = data.get("atoms")
    if not isinstance(lattice_vectors, list) or len(lattice_vectors) != 3:
        raise ValueError("latticeVectors must contain exactly 3 vectors")
    if not isinstance(atoms, list) or not atoms:
        raise ValueError("atoms must be a non-empty list")

    species, coords = [], []
    selective_dynamics = []
    has_sd = False
    for atom in atoms:
        element = str(atom.get("element") or atom.get("symbol") or "").strip()
        pos = atom.get("position") or {}
        x, y, z = pos.get("x"), pos.get("y"), pos.get("z")
        if not element or x is None or y is None or z is None:
            continue
        species.append(element)
        coords.append([float(x), float(y), float(z)])
        sd = atom.get("selectiveDynamics")
        if sd:
            has_sd = True
            selective_dynamics.append([bool(sd.get("x", True)), bool(sd.get("y", True)), bool(sd.get("z", True))])
        else:
            selective_dynamics.append([True, True, True])

    lattice = Lattice(lattice_vectors)
    struct = Structure(lattice, species, coords, coords_are_cartesian=True)
    if has_sd:
        struct.add_site_property("selective_dynamics", selective_dynamics)
    return struct


def _structure_to_render_data(struct: Structure) -> Dict[str, Any]:
    """Convert pymatgen Structure to frontend-consumable render data."""
    lattice_vectors = struct.lattice.matrix.tolist()
    sd = struct.site_properties.get("selective_dynamics")
    atoms = []
    for i, site in enumerate(struct):
        atom: Dict[str, Any] = {
            "element": str(site.specie),
            "position": {"x": site.coords[0], "y": site.coords[1], "z": site.coords[2]},
        }
        if sd and i < len(sd):
            atom["selectiveDynamics"] = {"x": sd[i][0], "y": sd[i][1], "z": sd[i][2]}
        atoms.append(atom)
    return {"atoms": atoms, "latticeVectors": lattice_vectors}


def _poscar_string(struct: Structure) -> str:
    """Generate POSCAR string preserving selective dynamics when present."""
    p = Poscar(struct)
    # pymatgen >=2024: get_string(); older: get_str()
    return p.get_string() if hasattr(p, 'get_string') else p.get_str()


def _layers_z(struct: Structure, tol: float = 0.2) -> List[float]:
    """Identify distinct z-layers in a slab using fractional coords."""
    fracs = np.array([s.frac_coords[2] for s in struct])
    fracs_sorted = np.sort(fracs)
    layers = [fracs_sorted[0]]
    for f in fracs_sorted[1:]:
        if f - layers[-1] > tol:
            layers.append(f)
    return layers


# ============================================================================
# 1. Slab construction
# ============================================================================

def build_slab(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Build a slab from an existing bulk structure (provided as render data)."""
    structure_data = payload.get("structure")
    if not structure_data:
        raise ValueError("'structure' (render data with atoms + latticeVectors) is required")

    miller = payload.get("miller_index", [1, 1, 1])
    if not isinstance(miller, list) or len(miller) != 3:
        raise ValueError("miller_index must be a list of 3 integers")
    miller = tuple(int(m) for m in miller)

    thickness = float(payload.get("slab_thickness", 12.0))
    vacuum = float(payload.get("vacuum_thickness", 15.0))
    supercell = payload.get("supercell", [1, 1, 1])
    symmetric = payload.get("symmetric", False)
    orthogonal = payload.get("orthogonal", False)
    lll_reduce = payload.get("lll_reduce", False)

    bulk_struct = _structure_from_render_data(structure_data)

    # Conventional cell for slab generation
    sga = SpacegroupAnalyzer(bulk_struct)
    try:
        conv = sga.get_conventional_standard_structure()
    except Exception:
        conv = bulk_struct

    gen = SlabGenerator(
        conv,
        miller,
        min_slab_size=thickness,
        min_vacuum_size=vacuum,
        lll_reduce=lll_reduce,
        center_slab=True,
        in_unit_planes=False,
    )
    slabs = gen.get_slabs(symmetrize=symmetric)
    if not slabs:
        raise ValueError(f"No slabs generated for Miller index {list(miller)}")

    results = []
    for i, slab in enumerate(slabs):
        if orthogonal:
            try:
                slab = slab.get_orthogonal_c_slab()
            except Exception:
                pass

        # Apply supercell
        if supercell != [1, 1, 1]:
            slab.make_supercell(supercell)

        render_data = _structure_to_render_data(slab)
        results.append({
            "termination_index": i,
            "n_atoms": len(slab),
            "surface_area": round(slab.surface_area, 3),
            "render_data": render_data,
            "poscar": _poscar_string(slab),
        })

    return {
        "miller_index": list(miller),
        "n_terminations": len(results),
        "slabs": results,
        # Return first termination as the default preview
        "default_render_data": results[0]["render_data"] if results else None,
    }


# ============================================================================
# 2. Molecule from SMILES
# ============================================================================

def create_molecule_from_smiles(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate a 3-D molecular structure from a SMILES string."""
    if not HAS_RDKIT:
        raise RuntimeError("RDKit is not installed – cannot generate molecules from SMILES")

    smiles = payload.get("smiles")
    if not smiles:
        raise ValueError("'smiles' is required")

    box_padding = float(payload.get("box_padding", 10.0))

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES: {smiles}")

    mol = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = 42
    result = AllChem.EmbedMolecule(mol, params)
    if result != 0:
        result = AllChem.EmbedMolecule(mol, AllChem.ETKDGv2())
    if result != 0:
        raise ValueError(f"Cannot generate 3-D coordinates for SMILES: {smiles}")

    # Optimise with MMFF (fallback UFF)
    try:
        AllChem.MMFFOptimizeMolecule(mol, maxIters=500)
    except Exception:
        try:
            AllChem.UFFOptimizeMolecule(mol, maxIters=500)
        except Exception:
            pass

    formula = Chem.rdMolDescriptors.CalcMolFormula(mol)
    conf = mol.GetConformer()

    elements = []
    positions = []
    for atom in mol.GetAtoms():
        idx = atom.GetIdx()
        pos = conf.GetAtomPosition(idx)
        elements.append(atom.GetSymbol())
        positions.append([pos.x, pos.y, pos.z])

    positions = np.array(positions)
    center = positions.mean(axis=0)
    positions -= center  # centre molecule at origin

    # Build cubic box
    max_extent = np.max(np.abs(positions)) + box_padding / 2
    box_size = max(max_extent * 2, box_padding)
    positions += box_size / 2  # shift to positive coords

    lattice = Lattice.cubic(box_size)
    struct = Structure(lattice, elements, positions, coords_are_cartesian=True)

    render_data = _structure_to_render_data(struct)
    return {
        "smiles": smiles,
        "formula": formula,
        "n_atoms": len(elements),
        "box_size": round(box_size, 3),
        "render_data": render_data,
        "poscar": _poscar_string(struct),
    }


# ============================================================================
# 3. Adsorption-site enumeration
# ============================================================================

def enumerate_adsorption_sites(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Find adsorption sites on a slab surface."""
    if not HAS_ADSORPTION:
        raise RuntimeError("pymatgen.analysis.adsorption not available")

    structure_data = payload.get("structure")
    if not structure_data:
        raise ValueError("'structure' (render data) is required")

    mode = payload.get("mode", "all")  # all / ontop / bridge / hollow
    distance = float(payload.get("distance", 2.0))

    slab = _structure_from_render_data(structure_data)
    finder = AdsorbateSiteFinder(slab)

    if mode == "all":
        sites_dict = {
            "ontop": finder.find_adsorption_sites()["ontop"],
            "bridge": finder.find_adsorption_sites()["bridge"],
            "hollow": finder.find_adsorption_sites()["hollow"],
        }
    else:
        raw = finder.find_adsorption_sites()
        sites_dict = {mode: raw.get(mode, [])}

    labeled_sites = []
    for kind, coords_list in sites_dict.items():
        for j, coord in enumerate(coords_list):
            labeled_sites.append({
                "label": f"{kind}_{j}",
                "kind": kind,
                "cart_coords": [round(c, 5) for c in coord],
            })

    counts = {kind: len(coords) for kind, coords in sites_dict.items()}
    return {
        "total_sites": len(labeled_sites),
        "counts": counts,
        "sites": labeled_sites,
        "default_site": labeled_sites[0]["label"] if labeled_sites else None,
    }


# ============================================================================
# 4. Adsorbate placement
# ============================================================================

def place_adsorbate(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Place an adsorbate molecule on a slab at a specified site."""
    if not HAS_ADSORPTION:
        raise RuntimeError("pymatgen.analysis.adsorption not available")

    slab_data = payload.get("slab")
    adsorbate_data = payload.get("adsorbate")
    if not slab_data or not adsorbate_data:
        raise ValueError("Both 'slab' and 'adsorbate' (render data) are required")

    site_coords = payload.get("site_cart_coords")
    distance = float(payload.get("distance", 2.0))

    if not site_coords or len(site_coords) != 3:
        raise ValueError("'site_cart_coords' [x, y, z] is required")

    slab = _structure_from_render_data(slab_data)
    n_slab = len(slab)

    # Build adsorbate Molecule
    ads_atoms = adsorbate_data.get("atoms", [])
    ads_species = []
    ads_coords = []
    for a in ads_atoms:
        elem = str(a.get("element") or a.get("symbol") or "").strip()
        pos = a.get("position", {})
        if not elem:
            continue
        ads_species.append(elem)
        ads_coords.append([float(pos.get("x", 0)), float(pos.get("y", 0)), float(pos.get("z", 0))])

    if not ads_species:
        raise ValueError("Adsorbate has no atoms")

    ads_coords = np.array(ads_coords)
    # Centre adsorbate at origin
    ads_coords -= ads_coords.mean(axis=0)

    adsorbate_mol = Molecule(ads_species, ads_coords)
    finder = AdsorbateSiteFinder(slab)
    adsorbed = finder.add_adsorbate(adsorbate_mol, site_coords, translate=True, reorient=True)

    ads_indices = list(range(n_slab, len(adsorbed)))
    render_data = _structure_to_render_data(adsorbed)

    return {
        "n_atoms": len(adsorbed),
        "n_slab_atoms": n_slab,
        "n_adsorbate_atoms": len(ads_indices),
        "adsorbate_indices": ads_indices,
        "render_data": render_data,
        "poscar": _poscar_string(adsorbed),
    }


# ============================================================================
# 5. Supercell
# ============================================================================

def make_supercell(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a supercell from a structure."""
    structure_data = payload.get("structure")
    scaling = payload.get("supercell", [2, 2, 1])
    if not structure_data:
        raise ValueError("'structure' (render data) is required")
    if not isinstance(scaling, list) or len(scaling) != 3:
        raise ValueError("'supercell' must be a list of 3 integers")

    struct = _structure_from_render_data(structure_data)
    struct.make_supercell(scaling)

    render_data = _structure_to_render_data(struct)
    return {
        "scaling": scaling,
        "n_atoms": len(struct),
        "render_data": render_data,
        "poscar": _poscar_string(struct),
    }


# ============================================================================
# 6. Selective dynamics helpers
# ============================================================================

def fix_atoms_by_layers(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Freeze bottom N layers of a slab structure."""
    structure_data = payload.get("structure")
    freeze_layers = int(payload.get("freeze_layers", 2))
    layer_tol = float(payload.get("layer_tol", 0.2))
    if not structure_data:
        raise ValueError("'structure' (render data) is required")

    struct = _structure_from_render_data(structure_data)
    layers = _layers_z(struct, tol=layer_tol)
    if freeze_layers > len(layers):
        freeze_layers = len(layers)

    freeze_threshold = layers[freeze_layers - 1] + layer_tol / 2 if freeze_layers > 0 else -1

    sd = []
    for site in struct:
        if site.frac_coords[2] <= freeze_threshold:
            sd.append([False, False, False])
        else:
            sd.append([True, True, True])

    struct.add_site_property("selective_dynamics", sd)
    render_data = _structure_to_render_data(struct)

    frozen_count = sum(1 for s in sd if s == [False, False, False])
    return {
        "total_layers": len(layers),
        "frozen_layers": freeze_layers,
        "frozen_atoms": frozen_count,
        "free_atoms": len(struct) - frozen_count,
        "render_data": render_data,
        "poscar": _poscar_string(struct),
    }


def fix_atoms_by_height(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Freeze atoms within specified z-ranges (fractional coords)."""
    structure_data = payload.get("structure")
    z_ranges = payload.get("z_ranges", [])
    if not structure_data:
        raise ValueError("'structure' (render data) is required")
    if not z_ranges:
        raise ValueError("'z_ranges' is required (list of {z_min, z_max})")

    struct = _structure_from_render_data(structure_data)
    sd = []
    for site in struct:
        z = site.frac_coords[2]
        frozen = any(r.get("z_min", 0) <= z <= r.get("z_max", 1) for r in z_ranges)
        sd.append([not frozen, not frozen, not frozen])

    struct.add_site_property("selective_dynamics", sd)
    render_data = _structure_to_render_data(struct)
    frozen_count = sum(1 for s in sd if s == [False, False, False])

    return {
        "frozen_atoms": frozen_count,
        "free_atoms": len(struct) - frozen_count,
        "render_data": render_data,
        "poscar": _poscar_string(struct),
    }


def fix_atoms_by_indices(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Freeze specific atoms by index."""
    structure_data = payload.get("structure")
    indices = payload.get("indices", [])
    if not structure_data:
        raise ValueError("'structure' (render data) is required")

    struct = _structure_from_render_data(structure_data)
    idx_set = set(int(i) for i in indices)
    sd = []
    for i in range(len(struct)):
        if i in idx_set:
            sd.append([False, False, False])
        else:
            sd.append([True, True, True])

    struct.add_site_property("selective_dynamics", sd)
    render_data = _structure_to_render_data(struct)

    return {
        "frozen_atoms": len(idx_set),
        "free_atoms": len(struct) - len(idx_set),
        "render_data": render_data,
        "poscar": _poscar_string(struct),
    }


# ============================================================================
# 7. Crystal manipulation – vacancies & substitution
# ============================================================================

def enumerate_unique_sites(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Find symmetry-inequivalent sites in a structure."""
    structure_data = payload.get("structure")
    symprec = float(payload.get("symprec", 0.01))
    if not structure_data:
        raise ValueError("'structure' (render data) is required")

    struct = _structure_from_render_data(structure_data)
    sga = SpacegroupAnalyzer(struct, symprec=symprec)
    sym_struct = sga.get_symmetrized_structure()

    groups = []
    for i, (wyckoff, equiv_indices) in enumerate(
        zip(sym_struct.wyckoff_symbols, sym_struct.equivalent_indices)
    ):
        representative = equiv_indices[0]
        site = struct[representative]
        groups.append({
            "group_id": i,
            "wyckoff": wyckoff,
            "element": str(site.specie),
            "representative_index": representative,
            "equivalent_indices": list(equiv_indices),
            "multiplicity": len(equiv_indices),
            "frac_coords": [round(c, 5) for c in site.frac_coords.tolist()],
        })

    return {
        "spacegroup": sga.get_space_group_symbol(),
        "spacegroup_number": sga.get_space_group_number(),
        "n_groups": len(groups),
        "groups": groups,
    }


def create_vacancy(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a vacancy defect by removing a site."""
    structure_data = payload.get("structure")
    site_index = payload.get("site_index")
    if not structure_data:
        raise ValueError("'structure' (render data) is required")
    if site_index is None:
        raise ValueError("'site_index' is required")

    struct = _structure_from_render_data(structure_data)
    site_index = int(site_index)
    if site_index < 0 or site_index >= len(struct):
        raise ValueError(f"site_index {site_index} out of range (0..{len(struct) - 1})")

    removed_element = str(struct[site_index].specie)
    struct.remove_sites([site_index])
    render_data = _structure_to_render_data(struct)

    return {
        "removed_element": removed_element,
        "removed_index": site_index,
        "n_atoms": len(struct),
        "render_data": render_data,
        "poscar": _poscar_string(struct),
    }


def substitute_species(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Substitute an atom at a specific site with a new element."""
    structure_data = payload.get("structure")
    site_index = payload.get("site_index")
    new_species = payload.get("new_species")
    if not structure_data:
        raise ValueError("'structure' (render data) is required")
    if site_index is None or not new_species:
        raise ValueError("'site_index' and 'new_species' are required")

    struct = _structure_from_render_data(structure_data)
    site_index = int(site_index)
    if site_index < 0 or site_index >= len(struct):
        raise ValueError(f"site_index {site_index} out of range")

    old_species = str(struct[site_index].specie)
    struct.replace(site_index, new_species)
    render_data = _structure_to_render_data(struct)

    return {
        "old_species": old_species,
        "new_species": new_species,
        "site_index": site_index,
        "n_atoms": len(struct),
        "render_data": render_data,
        "poscar": _poscar_string(struct),
    }


# ============================================================================
# 8. NEB tools
# ============================================================================

def estimate_neb_images(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Estimate the recommended number of NEB intermediate images."""
    initial_data = payload.get("initial")
    final_data = payload.get("final")
    spacing = float(payload.get("target_spacing", 0.8))
    if not initial_data or not final_data:
        raise ValueError("Both 'initial' and 'final' (render data) are required")

    struct_i = _structure_from_render_data(initial_data)
    struct_f = _structure_from_render_data(final_data)

    if len(struct_i) != len(struct_f):
        raise ValueError("Initial and final structures must have the same number of atoms")

    displacements = []
    for si, sf in zip(struct_i, struct_f):
        d = np.linalg.norm(sf.coords - si.coords)
        displacements.append(d)

    max_disp = max(displacements)
    rss = math.sqrt(sum(d ** 2 for d in displacements))
    recommended = max(1, round(max_disp / spacing))

    return {
        "recommended_images": recommended,
        "max_atom_displacement": round(max_disp, 4),
        "rss_displacement": round(rss, 4),
        "per_atom_displacements": [round(d, 4) for d in displacements],
    }


def make_neb_images(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate interpolated NEB images between initial and final structures."""
    if AseAtoms is None:
        raise RuntimeError("ASE is not installed – cannot interpolate NEB images")

    initial_data = payload.get("initial")
    final_data = payload.get("final")
    n_images = int(payload.get("n_images", 5))
    if not initial_data or not final_data:
        raise ValueError("Both 'initial' and 'final' (render data) are required")

    struct_i = _structure_from_render_data(initial_data)
    struct_f = _structure_from_render_data(final_data)

    if len(struct_i) != len(struct_f):
        raise ValueError("Initial and final structures must have the same number of atoms")

    # Linear interpolation in fractional coords
    images = []
    for idx in range(n_images + 2):  # include endpoints
        frac = idx / (n_images + 1)
        new_frac_coords = []
        for si, sf in zip(struct_i, struct_f):
            fc = si.frac_coords * (1 - frac) + sf.frac_coords * frac
            new_frac_coords.append(fc)

        species = [str(s.specie) for s in struct_i]
        interp_struct = Structure(struct_i.lattice, species, new_frac_coords)
        images.append({
            "index": idx,
            "label": f"{idx:02d}",
            "render_data": _structure_to_render_data(interp_struct),
            "poscar": _poscar_string(interp_struct),
        })

    return {
        "n_images": n_images,
        "total_frames": len(images),
        "images": images,
    }


# ============================================================================
# 9. VASP input-set preparation
# ============================================================================

def prepare_vasp_inputs(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate VASP input files (INCAR, KPOINTS, POSCAR, POTCAR spec)."""
    structure_data = payload.get("structure")
    if not structure_data:
        raise ValueError("'structure' (render data) is required")

    preset = payload.get("preset", "relax")     # relax / static / freq / dos
    regime = payload.get("regime", "bulk")       # bulk / slab / gas
    quality = payload.get("quality", "standard") # fast / standard / high
    vdw = payload.get("vdw", False)
    u_correction = payload.get("u_correction", False)
    spin_mode = payload.get("spin_mode", "auto")
    relax_cell = payload.get("relax_cell", False)
    user_incar = payload.get("user_incar_patch", {})

    struct = _structure_from_render_data(structure_data)

    # K-product determines k-point density
    k_product_map = {"fast": 25, "standard": 35, "high": 50}
    k_product = k_product_map.get(quality, 35)

    # Calculate k-grid from k_product
    lengths = struct.lattice.abc
    k_grid = [max(1, round(k_product / l)) for l in lengths]
    if regime == "slab":
        k_grid[2] = 1
    elif regime == "gas":
        k_grid = [1, 1, 1]

    # Base INCAR settings
    incar_settings = {
        "PREC": "Accurate",
        "ENCUT": 520 if quality == "high" else 450 if quality == "standard" else 400,
        "EDIFF": 1e-6 if quality == "high" else 1e-5,
        "ISMEAR": 0 if regime == "gas" else 1,
        "SIGMA": 0.05 if regime == "gas" else 0.1,
        "LREAL": "Auto" if len(struct) > 16 else False,
        "ALGO": "Normal",
        "NELM": 200,
        "LORBIT": 11,
        "LWAVE": False,
        "LCHARG": True if preset == "static" else False,
    }

    # Preset-specific
    if preset == "relax":
        incar_settings.update({
            "IBRION": 2,
            "NSW": 300 if quality == "high" else 200,
            "EDIFFG": -0.02 if quality == "high" else -0.03,
            "ISIF": 3 if relax_cell else 2,
            "ISYM": 0 if regime == "slab" else 2,
        })
    elif preset == "static":
        incar_settings.update({
            "IBRION": -1,
            "NSW": 0,
            "ISYM": 0 if regime == "slab" else 2,
        })
    elif preset == "freq":
        incar_settings.update({
            "IBRION": 5,
            "NSW": 1,
            "NFREE": 2,
            "POTIM": 0.015,
            "EDIFFG": -0.01,
        })
    elif preset == "dos":
        incar_settings.update({
            "IBRION": -1,
            "NSW": 0,
            "ICHARG": 11,
            "NEDOS": 3001,
            "EMIN": -10,
            "EMAX": 10,
        })

    # VDW correction
    if vdw:
        incar_settings["IVDW"] = 12  # DFT-D3(BJ)

    # Dipole correction for slabs
    if regime == "slab":
        incar_settings["LDIPOL"] = True
        incar_settings["IDIPOL"] = 3

    # Spin polarisation
    if spin_mode == "auto":
        magnetic_elements = {"Fe", "Co", "Ni", "Mn", "Cr", "V", "Ti", "Cu", "Gd", "Eu"}
        has_magnetic = any(str(s.specie) in magnetic_elements for s in struct)
        if has_magnetic:
            incar_settings["ISPIN"] = 2
    elif spin_mode in ("collinear", "polarized"):
        incar_settings["ISPIN"] = 2

    # U correction
    if u_correction:
        incar_settings["LDAU"] = True
        incar_settings["LDAUTYPE"] = 2

    # Apply user patches
    for k, v in user_incar.items():
        incar_settings[k.upper()] = v

    incar_obj = Incar(incar_settings)
    kpoints_obj = Kpoints.gamma_automatic(k_grid)

    # POTCAR spec
    unique_elements = list(dict.fromkeys(str(s.specie) for s in struct))
    potcar_spec = [{"element": el, "functional": "PBE"} for el in unique_elements]

    poscar_str = _poscar_string(struct)

    return {
        "preset": preset,
        "regime": regime,
        "quality": quality,
        "k_grid": k_grid,
        "files": {
            "INCAR": str(incar_obj),
            "KPOINTS": str(kpoints_obj),
            "POSCAR": poscar_str,
        },
        "potcar_spec": potcar_spec,
        "n_atoms": len(struct),
        "formula": struct.composition.reduced_formula,
    }


# ============================================================================
# 10. K-path generation for band structures
# ============================================================================

def generate_kpath(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate a high-symmetry k-path for band-structure calculations."""
    if not HAS_KPATH:
        raise RuntimeError("pymatgen.symmetry.bandstructure not available")

    structure_data = payload.get("structure")
    line_density = int(payload.get("line_density", 20))
    if not structure_data:
        raise ValueError("'structure' (render data) is required")

    struct = _structure_from_render_data(structure_data)
    kpath = HighSymmKpath(struct)

    kpts_dict = kpath.kpath
    labels = []
    coords = []
    for path_segment in kpts_dict["path"]:
        for label in path_segment:
            frac = kpts_dict["kpoints"][label]
            labels.append(label)
            coords.append([round(c, 6) for c in frac])

    # Generate line-mode KPOINTS string
    kpoints_lines = ["K-Path Generated", str(line_density), "Line-mode", "Reciprocal"]
    path_segments = kpts_dict["path"]
    for seg in path_segments:
        for i in range(len(seg) - 1):
            start_label = seg[i]
            end_label = seg[i + 1]
            start_frac = kpts_dict["kpoints"][start_label]
            end_frac = kpts_dict["kpoints"][end_label]
            kpoints_lines.append(
                f"  {start_frac[0]:.6f}  {start_frac[1]:.6f}  {start_frac[2]:.6f}  ! {start_label}"
            )
            kpoints_lines.append(
                f"  {end_frac[0]:.6f}  {end_frac[1]:.6f}  {end_frac[2]:.6f}  ! {end_label}"
            )
            kpoints_lines.append("")

    return {
        "path": kpts_dict["path"],
        "labels": labels,
        "coords": coords,
        "line_density": line_density,
        "kpoints_file": "\n".join(kpoints_lines),
    }


# ============================================================================
# DISPATCH TABLE
# ============================================================================

TOOLS = {
    "build_slab": build_slab,
    "create_molecule_from_smiles": create_molecule_from_smiles,
    "enumerate_adsorption_sites": enumerate_adsorption_sites,
    "place_adsorbate": place_adsorbate,
    "make_supercell": make_supercell,
    "fix_atoms_by_layers": fix_atoms_by_layers,
    "fix_atoms_by_height": fix_atoms_by_height,
    "fix_atoms_by_indices": fix_atoms_by_indices,
    "enumerate_unique_sites": enumerate_unique_sites,
    "create_vacancy": create_vacancy,
    "substitute_species": substitute_species,
    "estimate_neb_images": estimate_neb_images,
    "make_neb_images": make_neb_images,
    "prepare_vasp_inputs": prepare_vasp_inputs,
    "generate_kpath": generate_kpath,
}


def main():
    raw = sys.stdin.read()
    try:
        request = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    tool = request.get("tool")
    params = request.get("params", {})

    if not tool:
        # List available tools
        print(json.dumps({
            "success": True,
            "data": {"available_tools": list(TOOLS.keys())},
        }))
        return

    if tool not in TOOLS:
        print(json.dumps({
            "success": False,
            "error": f"Unknown tool '{tool}'. Available: {list(TOOLS.keys())}",
        }))
        sys.exit(1)

    try:
        result = TOOLS[tool](params)
        print(json.dumps({"success": True, "data": result}, default=str))
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
