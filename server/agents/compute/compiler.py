from __future__ import annotations

import json
import math
import random
import sys
from collections import Counter
from typing import Any, Dict, Iterable, List, Tuple

try:
    from pymatgen.core import Lattice, Structure
    from pymatgen.io.vasp.inputs import Incar, Kpoints, Poscar
except Exception as exc:
    PYMATGEN_IMPORT_ERROR = exc
    Lattice = Structure = Incar = Kpoints = Poscar = None
else:
    PYMATGEN_IMPORT_ERROR = None


def require_pymatgen() -> None:
    if PYMATGEN_IMPORT_ERROR is not None:
        raise RuntimeError(
            f"Compute engine environment is broken: pymatgen could not initialize ({PYMATGEN_IMPORT_ERROR}). "
            "Reinstall compatible numpy / pymatgen binaries before compiling VASP inputs."
        )


def structure_from_render_data(render_data: Dict[str, Any]) -> Structure:
    require_pymatgen()
    lattice_vectors = render_data.get("latticeVectors")
    atoms = render_data.get("atoms")

    if not isinstance(lattice_vectors, list) or len(lattice_vectors) != 3:
        raise ValueError("structure.data.latticeVectors must contain three vectors")
    if not isinstance(atoms, list) or not atoms:
        raise ValueError("structure.data.atoms must be a non-empty list")

    species: List[str] = []
    coords: List[List[float]] = []

    for atom in atoms:
        if not isinstance(atom, dict):
            continue
        element = str(atom.get("element") or atom.get("symbol") or "").strip()
        position = atom.get("position") or {}
        x = position.get("x")
        y = position.get("y")
        z = position.get("z")
        if not element:
            continue
        if x is None or y is None or z is None:
            continue
        species.append(element)
        coords.append([float(x), float(y), float(z)])

    if not species:
        raise ValueError("structure.data does not contain any valid atoms")

    lattice = Lattice(lattice_vectors)
    return Structure(lattice, species, coords, coords_are_cartesian=True)


def build_incar_settings(intent: Dict[str, Any], is_slab: bool) -> Dict[str, Any]:
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"
    spin_mode = str(intent.get("spin_mode") or "auto").strip().lower() or "auto"
    custom_params = intent.get("custom_params") or {}

    incar = {
        "PREC": "Accurate",
        "ENCUT": 520,
        "EDIFF": 1e-5,
        "ISMEAR": 0,
        "SIGMA": 0.05,
        "LASPH": True,
        "LREAL": "Auto",
    }

    if workflow in {"relax", "adsorption"}:
        incar.update({
            "IBRION": 2,
            "ISIF": 2 if is_slab else 3,
            "NSW": 200,
            "EDIFFG": -0.03,
        })
    elif workflow in {"static", "dos", "band"}:
        incar.update({
            "IBRION": -1,
            "ISIF": 2,
            "NSW": 0,
            "LCHARG": True,
            "LWAVE": False,
        })
        if workflow == "dos":
            incar.update({
                "LORBIT": 11,
                "NEDOS": 2000,
            })
        elif workflow == "band":
            incar.update({
                "LCHARG": False,
                "LWAVE": True,
            })
    elif workflow == "neb":
        incar.update({
            "IBRION": 3,
            "POTIM": 0,
            "NSW": 100,
            "SPRING": -5,
            "LCLIMB": True,
            "IMAGES": safe_int(custom_params.get("IMAGES"), 3, minimum=1),
        })
    else:
        raise ValueError(f"Unsupported workflow '{workflow}'. Supported workflows: relax, static, dos, band, adsorption, neb")

    if quality == "fast":
        incar.update({
            "PREC": "Normal",
            "ENCUT": 420,
            "EDIFF": 1e-4,
        })
    elif quality == "high":
        incar.update({
            "PREC": "Accurate",
            "ENCUT": 600,
            "EDIFF": 1e-6,
        })

    if bool(intent.get("vdw")):
        incar["IVDW"] = 11

    incar["ISPIN"] = 1 if spin_mode == "none" else 2
    incar.update(custom_params)
    return incar


def choose_kpoint_grid(structure: Structure, intent: Dict[str, Any], is_slab: bool) -> List[int]:
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"
    density = {
        "fast": 18.0,
        "standard": 28.0,
        "high": 40.0,
    }.get(quality, 28.0)

    lengths = structure.lattice.abc

    def axis_points(length: float, minimum: int = 1) -> int:
        safe_length = max(float(length), 1e-6)
        return max(minimum, min(15, int(math.ceil(density / safe_length))))

    grid = [
        axis_points(lengths[0]),
        axis_points(lengths[1]),
        1 if is_slab else axis_points(lengths[2]),
    ]
    return grid


def infer_is_slab(structure_meta: Dict[str, Any], structure: Structure, intent: Dict[str, Any]) -> bool:
    system_hint = str(
        intent.get("system_hint")
        or structure_meta.get("system")
        or structure_meta.get("taskType")
        or ""
    ).strip().lower()

    if system_hint in {"slab", "surface", "surface_adsorption"}:
        return True
    if system_hint in {"bulk", "crystal"}:
        return False

    a, b, c = structure.lattice.abc
    max_in_plane = max(a, b)
    return c > max_in_plane * 1.6 and c > 12.0


def compile_vasp_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure_payload = request_data.get("structure") or {}
    structure_data = structure_payload.get("data") or {}
    structure_meta = structure_payload.get("meta") or {}
    intent = request_data.get("intent") or {}

    structure = structure_from_render_data(structure_data)
    is_slab = infer_is_slab(structure_meta, structure, intent)
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"

    incar_settings = build_incar_settings(intent, is_slab)
    kpoint_grid = choose_kpoint_grid(structure, intent, is_slab)
    poscar = Poscar(structure)
    incar = Incar(incar_settings)
    kpoints = Kpoints.gamma_automatic(kpoint_grid)
    potcar_symbols = list(poscar.site_symbols)

    potcar_spec = {
        "symbols": potcar_symbols,
        "note": "POTCAR content is not materialized in Phase 1. Resolve POTCAR from local pseudopotential library before submission.",
    }

    summary_formula = structure.composition.reduced_formula
    generated_files = ["INCAR", "KPOINTS", "POSCAR", "POTCAR.spec.json"]

    return {
        "success": True,
        "summary": f"Compiled VASP {workflow} input set for {summary_formula}",
        "files": {
            "INCAR": str(incar),
            "KPOINTS": str(kpoints),
            "POSCAR": poscar.get_str(),
            "POTCAR.spec.json": json.dumps(potcar_spec, indent=2),
        },
        "preview": {
            "artifactType": "compute_input_set",
            "formula": summary_formula,
            "workflow": workflow,
            "quality": quality,
            "isSlab": is_slab,
            "kpointGrid": kpoint_grid,
            "potcarSymbols": potcar_symbols,
            "generatedFiles": generated_files,
        },
        "meta": {
            "formula": summary_formula,
            "workflow": workflow,
            "quality": quality,
            "isSlab": is_slab,
            "system": structure_meta.get("system") or structure_meta.get("taskType") or None,
            "databaseSource": structure_meta.get("databaseSource"),
            "databaseSourceLabel": structure_meta.get("databaseSourceLabel"),
            "providerPreferences": structure_meta.get("providerPreferences") or [],
            "providersTried": structure_meta.get("providersTried") or [],
            "potcarSymbols": potcar_symbols,
            "kpointGrid": kpoint_grid,
            "generatedFiles": generated_files,
            "incarSummary": {
                "ENCUT": incar_settings.get("ENCUT"),
                "PREC": incar_settings.get("PREC"),
                "EDIFF": incar_settings.get("EDIFF"),
                "ISPIN": incar_settings.get("ISPIN"),
                "IVDW": incar_settings.get("IVDW"),
            },
        },
    }


def safe_int(value: Any, default: int, minimum: int | None = None, maximum: int | None = None) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    if minimum is not None:
        parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def safe_float(value: Any, default: float, minimum: float | None = None, maximum: float | None = None) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    if minimum is not None:
        parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def normalize_float_list(value: Any, default: Iterable[float]) -> List[float]:
    raw_items = value if isinstance(value, list) else default
    items: List[float] = []
    for item in raw_items:
        parsed = safe_float(item, math.nan)
        if math.isfinite(parsed):
            items.append(parsed)
    return items or list(default)


def summarize_render_formula(render_data: Dict[str, Any]) -> str | None:
    atoms = render_data.get("atoms")
    if not isinstance(atoms, list) or not atoms:
        return None

    counts = Counter()
    for atom in atoms:
        if not isinstance(atom, dict):
            continue
        element = str(atom.get("element") or atom.get("symbol") or "").strip()
        if element:
            counts[element] += 1
    if not counts:
        return None

    def element_sort_key(symbol: str) -> Tuple[int, str]:
        if symbol == "C":
            return (0, symbol)
        if symbol == "H":
            return (1, symbol)
        return (2, symbol)

    formula = ""
    for element in sorted(counts, key=element_sort_key):
        count = counts[element]
        formula += element if count == 1 else f"{element}{count}"
    return formula


PERIODIC_SYMBOLS = """
H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn
Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La
Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi
Po At Rn Fr Ra Ac Th Pa U Np Pu
""".split()

ATOMIC_NUMBERS = {symbol: index + 1 for index, symbol in enumerate(PERIODIC_SYMBOLS)}

ATOMIC_MASSES = {
    "H": 1.008,
    "He": 4.0026,
    "Li": 6.94,
    "Be": 9.0122,
    "B": 10.81,
    "C": 12.011,
    "N": 14.007,
    "O": 15.999,
    "F": 18.998,
    "Ne": 20.180,
    "Na": 22.990,
    "Mg": 24.305,
    "Al": 26.982,
    "Si": 28.085,
    "P": 30.974,
    "S": 32.06,
    "Cl": 35.45,
    "K": 39.098,
    "Ca": 40.078,
    "Ti": 47.867,
    "V": 50.942,
    "Cr": 51.996,
    "Mn": 54.938,
    "Fe": 55.845,
    "Co": 58.933,
    "Ni": 58.693,
    "Cu": 63.546,
    "Zn": 65.38,
    "Ga": 69.723,
    "Ge": 72.630,
    "As": 74.922,
    "Se": 78.971,
    "Br": 79.904,
    "Ag": 107.868,
    "Cd": 112.414,
    "Sn": 118.710,
    "I": 126.904,
    "Ba": 137.327,
    "Pt": 195.084,
    "Au": 196.967,
    "Hg": 200.592,
    "Pb": 207.2,
    "U": 238.029,
}

ENGINE_LABELS = {
    "abinit": "ABINIT",
    "amber": "AMBER",
    "castep": "CASTEP",
    "cp2k": "CP2K",
    "dftbplus": "DFTB+",
    "gaussian": "Gaussian",
    "gromacs": "GROMACS",
    "lammps": "LAMMPS",
    "namd": "NAMD",
    "nwchem": "NWChem",
    "openmm": "OpenMM",
    "orca": "ORCA",
    "qchem": "Q-Chem",
    "quantum_espresso": "Quantum ESPRESSO",
    "siesta": "SIESTA",
    "xtb": "xtb",
}


def atomic_number(symbol: str) -> int:
    return ATOMIC_NUMBERS.get(str(symbol).strip(), 0)


def atomic_mass(symbol: str) -> float:
    symbol = str(symbol).strip()
    return ATOMIC_MASSES.get(symbol, max(1.0, float(atomic_number(symbol) or 6) * 2.0))


def normalize_element_symbol(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "X"
    letters = "".join(ch for ch in raw if ch.isalpha())
    if not letters:
        return "X"
    return letters[:1].upper() + letters[1:2].lower()


def extract_render_structure(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure_payload = request_data.get("structure") or {}
    structure_data = structure_payload.get("data") or {}
    structure_meta = structure_payload.get("meta") or {}
    atoms_raw = structure_data.get("atoms")
    lattice_raw = structure_data.get("latticeVectors")

    atoms: List[Dict[str, Any]] = []
    if isinstance(atoms_raw, list):
        for index, atom in enumerate(atoms_raw, start=1):
            if not isinstance(atom, dict):
                continue
            position = atom.get("position") or {}
            try:
                x = float(position.get("x"))
                y = float(position.get("y"))
                z = float(position.get("z"))
            except (TypeError, ValueError):
                continue
            element = normalize_element_symbol(atom.get("element") or atom.get("symbol"))
            atoms.append({
                "id": index,
                "element": element,
                "x": x,
                "y": y,
                "z": z,
            })

    if not atoms:
        raise ValueError("structure.data does not contain any valid atoms")

    if isinstance(lattice_raw, list) and len(lattice_raw) == 3:
        try:
            lattice = [[float(component) for component in vector[:3]] for vector in lattice_raw]
        except (TypeError, ValueError):
            lattice = []
    else:
        lattice = []

    if len(lattice) != 3 or any(len(vector) != 3 for vector in lattice):
        lattice = infer_lattice_from_atoms(atoms)

    formula = structure_meta.get("formula") or summarize_render_formula(structure_data) or formula_from_atoms(atoms)
    return {
        "atoms": atoms,
        "lattice": lattice,
        "formula": str(formula or "structure").strip() or "structure",
        "meta": structure_meta,
    }


def infer_lattice_from_atoms(atoms: List[Dict[str, Any]]) -> List[List[float]]:
    xs = [float(atom["x"]) for atom in atoms]
    ys = [float(atom["y"]) for atom in atoms]
    zs = [float(atom["z"]) for atom in atoms]
    lengths = [
        max(max(xs) - min(xs) + 12.0, 15.0),
        max(max(ys) - min(ys) + 12.0, 15.0),
        max(max(zs) - min(zs) + 12.0, 15.0),
    ]
    return [
        [lengths[0], 0.0, 0.0],
        [0.0, lengths[1], 0.0],
        [0.0, 0.0, lengths[2]],
    ]


def formula_from_atoms(atoms: List[Dict[str, Any]]) -> str:
    counts = Counter(atom["element"] for atom in atoms)
    parts = []
    for element in sorted(counts, key=lambda item: (item != "C", item != "H", item)):
        count = counts[element]
        parts.append(element if count == 1 else f"{element}{count}")
    return "".join(parts) or "structure"


def unique_elements(atoms: List[Dict[str, Any]]) -> List[str]:
    return sorted(set(atom["element"] for atom in atoms), key=lambda symbol: (atomic_number(symbol) or 999, symbol))


def vector_length(vector: List[float]) -> float:
    return math.sqrt(sum(float(component) ** 2 for component in vector))


def lattice_lengths(lattice: List[List[float]]) -> List[float]:
    return [vector_length(vector) for vector in lattice]


def qchem_charge_and_multiplicity(intent: Dict[str, Any]) -> Tuple[int, int]:
    custom_params = intent.get("custom_params") if isinstance(intent.get("custom_params"), dict) else {}
    charge = safe_int(custom_params.get("charge"), 0)
    multiplicity = safe_int(custom_params.get("multiplicity"), 1, minimum=1)
    return charge, multiplicity


def workflow_is_optimization(workflow: str) -> bool:
    return workflow in {"relax", "adsorption", "neb"}


def workflow_job_name(workflow: str) -> str:
    return {
        "relax": "geometry optimization",
        "static": "single point",
        "dos": "density of states",
        "band": "band structure",
        "adsorption": "adsorption relaxation",
        "neb": "NEB starter",
        "irradiation_creep": "irradiation creep",
    }.get(workflow, workflow)


def quality_settings(quality: str) -> Dict[str, Any]:
    return {
        "fast": {
            "ecut_ry": 35,
            "cp2k_cutoff": 350,
            "basis": "def2-SVP",
            "cp2k_basis": "DZVP-MOLOPT-SR-GTH",
            "steps": 2500,
        },
        "standard": {
            "ecut_ry": 50,
            "cp2k_cutoff": 500,
            "basis": "def2-SVP",
            "cp2k_basis": "DZVP-MOLOPT-SR-GTH",
            "steps": 5000,
        },
        "high": {
            "ecut_ry": 75,
            "cp2k_cutoff": 750,
            "basis": "def2-TZVP",
            "cp2k_basis": "TZVP-MOLOPT-GTH",
            "steps": 10000,
        },
    }.get(quality, {
        "ecut_ry": 50,
        "cp2k_cutoff": 500,
        "basis": "def2-SVP",
        "cp2k_basis": "DZVP-MOLOPT-SR-GTH",
        "steps": 5000,
    })


def format_xyz(atoms: List[Dict[str, Any]], title: str) -> str:
    lines = [str(len(atoms)), title]
    for atom in atoms:
        lines.append(f"{atom['element']} {atom['x']:.8f} {atom['y']:.8f} {atom['z']:.8f}")
    return "\n".join(lines) + "\n"


def format_pdb(atoms: List[Dict[str, Any]], lattice: List[List[float]], title: str = "SciVisualizer structure") -> str:
    a, b, c = lattice_lengths(lattice)
    lines = [
        f"REMARK {title}",
        f"CRYST1{a:9.3f}{b:9.3f}{c:9.3f}{90.0:7.2f}{90.0:7.2f}{90.0:7.2f} P 1           1",
    ]
    for atom in atoms:
        element = atom["element"]
        atom_name = f"{element}{atom['id'] % 1000:03d}"[:4]
        lines.append(
            f"ATOM  {atom['id']:5d} {atom_name:<4} MOL A   1    "
            f"{atom['x']:8.3f}{atom['y']:8.3f}{atom['z']:8.3f}  1.00  0.00          {element:>2}"
        )
    lines.extend(["TER", "END"])
    return "\n".join(lines) + "\n"


def engine_asset_spec(engine: str, required_files: List[Dict[str, str]] | None = None, notes: List[str] | None = None) -> str:
    payload = {
        "engine": engine,
        "requiredFiles": required_files or [],
        "notes": notes or [],
    }
    return json.dumps(payload, indent=2)


def build_readme(engine: str, formula: str, workflow: str, files: List[str], notes: List[str] | None = None) -> str:
    label = ENGINE_LABELS.get(engine, engine)
    lines = [
        f"# {label} Input Package",
        "",
        f"- Formula: {formula}",
        f"- Workflow: {workflow_job_name(workflow)}",
        f"- Engine: {label}",
        "",
        "## Files",
        "",
    ]
    for file_name in files:
        lines.append(f"- `{file_name}`")
    if notes:
        lines.extend(["", "## Notes", ""])
        lines.extend(f"- {note}" for note in notes)
    return "\n".join(lines) + "\n"


def build_generic_result(
    engine: str,
    request_data: Dict[str, Any],
    files: Dict[str, str],
    primary_file: str,
    meta_extra: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"
    generated_files = list(files.keys())
    label = ENGINE_LABELS.get(engine, engine)
    meta_extra = meta_extra or {}
    return {
        "success": True,
        "summary": f"Compiled {label} {workflow} input package for {structure['formula']}",
        "files": files,
        "preview": {
            "artifactType": "compute_input_set",
            "engine": engine,
            "formula": structure["formula"],
            "workflow": workflow,
            "quality": quality,
            "generatedFiles": generated_files,
            "primaryFile": primary_file,
            **meta_extra,
        },
        "meta": {
            "engine": engine,
            "formula": structure["formula"],
            "workflow": workflow,
            "quality": quality,
            "generatedFiles": generated_files,
            "primaryFile": primary_file,
            "atomCount": len(structure["atoms"]),
            "elements": unique_elements(structure["atoms"]),
            **meta_extra,
        },
    }


def graphite_quality_defaults(quality: str) -> Dict[str, int]:
    presets = {
        "fast": {
            "nx": 8,
            "ny": 8,
            "layers": 8,
            "pka_events": 4,
            "equilibration_steps": 20000,
            "tensile_stabilize_steps": 60000,
            "cascade_steps": 1000,
            "recovery_steps": 5000,
            "creep_steps": 20000,
        },
        "standard": {
            "nx": 16,
            "ny": 12,
            "layers": 16,
            "pka_events": 8,
            "equilibration_steps": 30000,
            "tensile_stabilize_steps": 300000,
            "cascade_steps": 2000,
            "recovery_steps": 10000,
            "creep_steps": 50000,
        },
        "high": {
            "nx": 41,
            "ny": 23,
            "layers": 28,
            "pka_events": 16,
            "equilibration_steps": 50000,
            "tensile_stabilize_steps": 300000,
            "cascade_steps": 3000,
            "recovery_steps": 15000,
            "creep_steps": 100000,
        },
    }
    return presets.get(quality, presets["standard"]).copy()


def build_graphite_parameters(intent: Dict[str, Any]) -> Dict[str, Any]:
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"
    custom_params = intent.get("custom_params") if isinstance(intent.get("custom_params"), dict) else {}
    defaults = graphite_quality_defaults(quality)

    if custom_params.get("paper_scale") is True:
        defaults.update({
            "nx": 41,
            "ny": 23,
            "layers": 28,
            "pka_events": max(defaults["pka_events"], 16),
        })

    tensile_loads = normalize_float_list(
        custom_params.get("tensile_loads_gpa"),
        [1, 5, 10, 20, 30, 40],
    )

    return {
        "quality": quality,
        "nx": safe_int(custom_params.get("graphite_nx"), defaults["nx"], minimum=1, maximum=80),
        "ny": safe_int(custom_params.get("graphite_ny"), defaults["ny"], minimum=1, maximum=80),
        "layers": safe_int(custom_params.get("graphite_layers"), defaults["layers"], minimum=2, maximum=64),
        "bond_length_a": safe_float(custom_params.get("carbon_bond_length_a"), 1.42, minimum=1.0, maximum=2.0),
        "layer_spacing_a": safe_float(custom_params.get("graphite_layer_spacing_a"), 3.355, minimum=2.5, maximum=5.0),
        "temperature_k": safe_float(custom_params.get("temperature_k"), 1073.0, minimum=50.0, maximum=5000.0),
        "timestep_ps": safe_float(custom_params.get("timestep_ps"), 0.001, minimum=0.00001, maximum=0.01),
        "pka_average_energy_ev": safe_float(custom_params.get("pka_average_energy_ev"), 8000.0, minimum=10.0, maximum=11000.0),
        "pka_events": safe_int(custom_params.get("pka_events"), defaults["pka_events"], minimum=1, maximum=128),
        "seed": safe_int(custom_params.get("seed"), 4928459, minimum=1),
        "equilibration_steps": safe_int(custom_params.get("equilibration_steps"), defaults["equilibration_steps"], minimum=0),
        "tensile_stabilize_steps": safe_int(custom_params.get("tensile_stabilize_steps"), defaults["tensile_stabilize_steps"], minimum=0),
        "cascade_steps": safe_int(custom_params.get("cascade_steps"), defaults["cascade_steps"], minimum=1),
        "recovery_steps": safe_int(custom_params.get("recovery_steps"), defaults["recovery_steps"], minimum=0),
        "creep_steps": safe_int(custom_params.get("creep_steps"), defaults["creep_steps"], minimum=0),
        "tensile_loads_gpa": tensile_loads,
    }


def generate_graphite_lammps_data(params: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    nx = int(params["nx"])
    ny = int(params["ny"])
    layers = int(params["layers"])
    bond = float(params["bond_length_a"])
    spacing = float(params["layer_spacing_a"])
    lx = math.sqrt(3.0) * bond
    ly = 3.0 * bond
    box_x = nx * lx
    box_y = ny * ly
    box_z = layers * spacing

    basis = [
        (0.0, 0.0),
        (0.5 * lx, 0.5 * bond),
        (0.5 * lx, 1.5 * bond),
        (0.0, 2.0 * bond),
    ]

    atoms: List[Tuple[int, float, float, float]] = []
    atom_id = 1
    for layer in range(layers):
        shift_x = 0.0 if layer % 2 == 0 else 0.5 * lx
        shift_y = 0.0 if layer % 2 == 0 else 0.5 * bond
        z = layer * spacing
        for ix in range(nx):
            for iy in range(ny):
                origin_x = ix * lx
                origin_y = iy * ly
                for bx, by in basis:
                    x = (origin_x + bx + shift_x) % box_x
                    y = (origin_y + by + shift_y) % box_y
                    atoms.append((atom_id, x, y, z))
                    atom_id += 1

    header = [
        "LAMMPS data file: AB-stacked graphite generated by SciVisualizer",
        "",
        f"{len(atoms)} atoms",
        "1 atom types",
        "",
        f"0.000000 {box_x:.6f} xlo xhi",
        f"0.000000 {box_y:.6f} ylo yhi",
        f"0.000000 {box_z:.6f} zlo zhi",
        "",
        "Masses",
        "",
        "1 12.0107 # C",
        "",
        "Atoms # atomic",
        "",
    ]
    atom_lines = [f"{atom_id} 1 {x:.8f} {y:.8f} {z:.8f}" for atom_id, x, y, z in atoms]
    data = "\n".join(header + atom_lines) + "\n"
    meta = {
        "atomCount": len(atoms),
        "boxA": [round(box_x, 6), round(box_y, 6), round(box_z, 6)],
        "sheetCount": layers,
        "abStacking": True,
    }
    return data, meta


def pka_velocity_components(energy_ev: float, mass_amu: float, direction: Tuple[float, float, float]) -> Tuple[float, float, float]:
    conversion = 1.0364269656262175e-4  # amu * (Angstrom / ps)^2 to eV
    magnitude = math.sqrt(max(0.0, 2.0 * energy_ev / (mass_amu * conversion)))
    norm = math.sqrt(sum(component * component for component in direction)) or 1.0
    return tuple((component / norm) * magnitude for component in direction)


def generate_pka_schedule(params: Dict[str, Any], atom_count: int) -> str:
    rng = random.Random(int(params["seed"]))
    event_count = min(int(params["pka_events"]), atom_count)
    pka_ids = rng.sample(range(1, atom_count + 1), event_count)
    energy_ev = float(params["pka_average_energy_ev"])

    lines = [
        "# Deterministic PKA cascade schedule for graphite irradiation creep.",
        "# LAMMPS metal units: velocities are Angstrom/ps and PKA energy is assigned to one carbon atom.",
    ]

    for index, atom_id in enumerate(pka_ids, start=1):
        direction = (
            rng.uniform(-1.0, 1.0),
            rng.uniform(-1.0, 1.0),
            rng.uniform(-1.0, 1.0),
        )
        vx, vy, vz = pka_velocity_components(energy_ev, 12.0107, direction)
        lines.extend([
            "",
            f"# PKA event {index}: atom {atom_id}, target energy {energy_ev:.1f} eV",
            f"group pka id {atom_id}",
            f"velocity pka set {vx:.8f} {vy:.8f} {vz:.8f} units box",
            "fix cascade all nve",
            "run ${cascade_steps}",
            "unfix cascade",
            "fix recover all nvt temp ${temperature} ${temperature} 0.1",
            "run ${recovery_steps}",
            "unfix recover",
            "group pka delete",
        ])

    return "\n".join(lines) + "\n"


def build_lammps_irradiation_input(params: Dict[str, Any]) -> str:
    loads = " ".join(f"{load:g}" for load in params["tensile_loads_gpa"])
    return f"""# SciVisualizer LAMMPS template: graphite tensile-load irradiation creep
# Method mapping:
# - Bernal AB graphite, AIREBO carbon bonding, short-range ZBL collision term.
# - 1073 K MD, PKA cascade events in NVE, post-cascade NVT recovery.
# - Tensile stresses along x(a)-axis use negative pressure targets in metal units.

units metal
dimension 3
boundary p p p
atom_style atomic
read_data data.graphite

mass 1 12.0107
neighbor 2.0 bin
neigh_modify delay 0 every 1 check yes
timestep {float(params["timestep_ps"]):.6f}

# Requires CH.airebo in the working directory and a LAMMPS build with MANYBODY support.
# The source paper used Fermi-switched AIREBO/ZBL; hybrid/overlay is a standard
# portable starting template. Replace with a cluster-local switched pair style if available.
pair_style hybrid/overlay airebo 3.0 1 1 zbl 0.1 2.0
pair_coeff * * airebo CH.airebo C
pair_coeff 1 1 zbl 6.0 6.0

variable temperature equal {float(params["temperature_k"]):.3f}
variable equilibration_steps equal {int(params["equilibration_steps"])}
variable tensile_stabilize_steps equal {int(params["tensile_stabilize_steps"])}
variable cascade_steps equal {int(params["cascade_steps"])}
variable recovery_steps equal {int(params["recovery_steps"])}
variable creep_steps equal {int(params["creep_steps"])}

thermo 1000
thermo_style custom step temp pe ke etotal press pxx pyy pzz lx ly lz
dump traj all custom 1000 dump.graphite_irradiation_creep.lammpstrj id type x y z vx vy vz

velocity all create ${{temperature}} {int(params["seed"])} mom yes rot yes dist gaussian
fix equilibrate all nvt temp ${{temperature}} ${{temperature}} 0.1
run ${{equilibration_steps}}
unfix equilibrate

reset_timestep 0
variable tensile_gpa index {loads}

label tensile_loop
variable tensile_bar equal -10000.0*v_tensile_gpa
print "Applying tensile load ${{tensile_gpa}} GPa along x(a)-axis"

fix tensile all npt temp ${{temperature}} ${{temperature}} 0.1 x ${{tensile_bar}} ${{tensile_bar}} 1.0 y 0.0 0.0 1.0 z 0.0 0.0 1.0 couple none
run ${{tensile_stabilize_steps}}
unfix tensile

include pka_schedule.inc

fix creep all npt temp ${{temperature}} ${{temperature}} 0.1 x ${{tensile_bar}} ${{tensile_bar}} 1.0 y 0.0 0.0 1.0 z 0.0 0.0 1.0 couple none
run ${{creep_steps}}
unfix creep

write_data data.after_${{tensile_gpa}}GPa

next tensile_gpa
jump SELF tensile_loop
"""


def build_lammps_analysis_script() -> str:
    return r'''#!/usr/bin/env python3
"""Lightweight post-processing for the graphite irradiation-creep LAMMPS dump.

It estimates MSD and displaced-atom counts using the paper's 1.9 A displacement
threshold. For publication-grade DPA, add the neighbor-list change test against
the pre-cascade coordinates for each PKA event.
"""

from __future__ import annotations

import csv
import math
import sys
from pathlib import Path


def iter_dump_frames(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        while True:
            line = handle.readline()
            if not line:
                return
            if not line.startswith("ITEM: TIMESTEP"):
                continue
            timestep = int(handle.readline().strip())
            handle.readline()  # ITEM: NUMBER OF ATOMS
            atom_count = int(handle.readline().strip())
            handle.readline()  # ITEM: BOX BOUNDS
            bounds = [handle.readline().strip() for _ in range(3)]
            columns = handle.readline().strip().split()[2:]
            index = {name: i for i, name in enumerate(columns)}
            atoms = []
            for _ in range(atom_count):
                parts = handle.readline().split()
                atoms.append((
                    int(parts[index["id"]]),
                    float(parts[index["x"]]),
                    float(parts[index["y"]]),
                    float(parts[index["z"]]),
                ))
            atoms.sort(key=lambda item: item[0])
            yield timestep, bounds, atoms


def squared_distance(a, b):
    return (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 + (a[3] - b[3]) ** 2


def main():
    dump_path = Path(sys.argv[1] if len(sys.argv) > 1 else "dump.graphite_irradiation_creep.lammpstrj")
    output_path = Path(sys.argv[2] if len(sys.argv) > 2 else "irradiation_creep_metrics.csv")
    frames = iter_dump_frames(dump_path)
    first = next(frames, None)
    if first is None:
        raise SystemExit(f"No frames found in {dump_path}")
    initial = first[2]
    cutoff2 = 1.9 ** 2

    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["timestep", "msd_a2", "displaced_atoms"])
        writer.writeheader()
        for timestep, _bounds, atoms in frames:
            if len(atoms) != len(initial):
                continue
            displacements = [squared_distance(a0, a1) for a0, a1 in zip(initial, atoms)]
            writer.writerow({
                "timestep": timestep,
                "msd_a2": sum(displacements) / len(displacements),
                "displaced_atoms": sum(1 for value in displacements if value > cutoff2),
            })

    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
'''


def build_lammps_readme(params: Dict[str, Any], graphite_meta: Dict[str, Any], source_formula: str | None) -> str:
    loads = ", ".join(f"{load:g}" for load in params["tensile_loads_gpa"])
    return f"""# Graphite Irradiation-Creep LAMMPS Input Set

This input set translates the paper method into a runnable LAMMPS starting point while keeping cluster-local assets external.

## Method coverage

- Graphite model: Bernal AB stacking, {graphite_meta["sheetCount"]} sheets, {graphite_meta["atomCount"]} carbon atoms.
- Cell size: {graphite_meta["boxA"][0]} x {graphite_meta["boxA"][1]} x {graphite_meta["boxA"][2]} Angstrom.
- Temperature: {float(params["temperature_k"]):g} K.
- Force field: AIREBO for C-C bonding plus ZBL for high-energy close-range collisions.
- Irradiation: deterministic PKA schedule with {int(params["pka_events"])} events at {float(params["pka_average_energy_ev"]):g} eV average energy.
- Tensile loading: x(a)-axis stresses {loads} GPa.
- Damage metric starter: MSD and 1.9 Angstrom displacement count in `analysis_irradiation_creep.py`.

## Files

- `in.graphite_irradiation_creep`: main LAMMPS input.
- `data.graphite`: generated AB graphite model.
- `pka_schedule.inc`: deterministic PKA cascade/recovery commands.
- `ENGINE_ASSETS.spec.json`: force-field and LAMMPS build requirements.
- `analysis_irradiation_creep.py`: lightweight post-processing starter.

## Notes

- Source structure artifact formula: {source_formula or "not supplied"}.
- The exact paper potential used a Fermi-type switching function between AIREBO and ZBL. The included input uses standard portable LAMMPS syntax and records this fidelity note in the asset spec.
- Use `quality: high` or `custom_params.paper_scale=true` to generate the article-scale 10 nm x 9.9 nm x 9.5 nm, 28-sheet graphite cell.
"""


def compile_lammps_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure_payload = request_data.get("structure") or {}
    structure_data = structure_payload.get("data") or {}
    structure_meta = structure_payload.get("meta") or {}
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "irradiation_creep").strip().lower() or "irradiation_creep"
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"

    if workflow != "irradiation_creep":
        workflow = "irradiation_creep"

    params = build_graphite_parameters(intent)
    graphite_data, graphite_meta = generate_graphite_lammps_data(params)
    pka_schedule = generate_pka_schedule(params, graphite_meta["atomCount"])
    main_input = build_lammps_irradiation_input(params)
    source_formula = (
        structure_meta.get("formula")
        or summarize_render_formula(structure_data)
        or "C"
    )

    asset_spec = {
        "engine": "lammps",
        "workflow": workflow,
        "requiredFiles": [
            {
                "name": "CH.airebo",
                "kind": "force_field",
                "reason": "AIREBO carbon potential used for graphite C-C bonding.",
            }
        ],
        "requiredBuildFeatures": ["MANYBODY", "ZBL pair style"],
        "methodFidelity": {
            "paper": "AIREBO plus ZBL with Fermi-type switching",
            "compiledTemplate": "LAMMPS hybrid/overlay AIREBO+ZBL portable starting point",
            "note": "For exact reproduction, replace the pair style with the cluster's Fermi-switched AIREBO/ZBL implementation if available.",
        },
    }

    generated_files = [
        "in.graphite_irradiation_creep",
        "data.graphite",
        "pka_schedule.inc",
        "ENGINE_ASSETS.spec.json",
        "analysis_irradiation_creep.py",
        "README_irradiation_creep.md",
    ]

    return {
        "success": True,
        "summary": f"Compiled LAMMPS graphite irradiation-creep input set ({quality})",
        "files": {
            "in.graphite_irradiation_creep": main_input,
            "data.graphite": graphite_data,
            "pka_schedule.inc": pka_schedule,
            "ENGINE_ASSETS.spec.json": json.dumps(asset_spec, indent=2),
            "analysis_irradiation_creep.py": build_lammps_analysis_script(),
            "README_irradiation_creep.md": build_lammps_readme(params, graphite_meta, source_formula),
        },
        "preview": {
            "artifactType": "compute_input_set",
            "engine": "lammps",
            "formula": "C",
            "workflow": workflow,
            "quality": quality,
            "system": "graphite",
            "generatedFiles": generated_files,
            "atomCount": graphite_meta["atomCount"],
            "boxA": graphite_meta["boxA"],
        },
        "meta": {
            "engine": "lammps",
            "formula": "C",
            "sourceFormula": source_formula,
            "workflow": workflow,
            "quality": quality,
            "system": "graphite",
            "generatedFiles": generated_files,
            "atomCount": graphite_meta["atomCount"],
            "boxA": graphite_meta["boxA"],
            "graphiteSheets": graphite_meta["sheetCount"],
            "temperatureK": params["temperature_k"],
            "tensileLoadsGPa": params["tensile_loads_gpa"],
            "pkaAverageEnergyEv": params["pka_average_energy_ev"],
            "pkaEvents": params["pka_events"],
        },
    }


def compile_cp2k_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"
    settings = quality_settings(quality)
    run_type = "GEO_OPT" if workflow_is_optimization(workflow) else "ENERGY"
    elements = unique_elements(structure["atoms"])

    coord_lines = [f"      {atom['element']} {atom['x']:.8f} {atom['y']:.8f} {atom['z']:.8f}" for atom in structure["atoms"]]
    kind_lines = []
    for element in elements:
        kind_lines.extend([
            f"    &KIND {element}",
            f"      BASIS_SET {settings['cp2k_basis']}",
            "      POTENTIAL GTH-PBE",
            "    &END KIND",
        ])

    a_vec, b_vec, c_vec = structure["lattice"]
    input_text = f"""&GLOBAL
  PROJECT scivis
  RUN_TYPE {run_type}
  PRINT_LEVEL MEDIUM
&END GLOBAL

&FORCE_EVAL
  METHOD Quickstep
  &DFT
    BASIS_SET_FILE_NAME BASIS_MOLOPT
    POTENTIAL_FILE_NAME POTENTIAL
    CHARGE {qchem_charge_and_multiplicity(intent)[0]}
    MULTIPLICITY {qchem_charge_and_multiplicity(intent)[1]}
    &MGRID
      CUTOFF {settings['cp2k_cutoff']}
      REL_CUTOFF 60
    &END MGRID
    &SCF
      EPS_SCF 1.0E-6
      MAX_SCF 100
      &OT
        PRECONDITIONER FULL_SINGLE_INVERSE
      &END OT
      &OUTER_SCF
        MAX_SCF 10
      &END OUTER_SCF
    &END SCF
    &XC
      &XC_FUNCTIONAL PBE
      &END XC_FUNCTIONAL
    &END XC
  &END DFT
  &SUBSYS
    &CELL
      A {a_vec[0]:.8f} {a_vec[1]:.8f} {a_vec[2]:.8f}
      B {b_vec[0]:.8f} {b_vec[1]:.8f} {b_vec[2]:.8f}
      C {c_vec[0]:.8f} {c_vec[1]:.8f} {c_vec[2]:.8f}
      PERIODIC XYZ
    &END CELL
    &COORD
{chr(10).join(coord_lines)}
    &END COORD
{chr(10).join(kind_lines)}
  &END SUBSYS
&END FORCE_EVAL
"""
    if run_type == "GEO_OPT":
        input_text += """
&MOTION
  &GEO_OPT
    MAX_ITER 200
    OPTIMIZER BFGS
  &END GEO_OPT
&END MOTION
"""

    files = {
        "input.inp": input_text,
        "structure.xyz": format_xyz(structure["atoms"], structure["formula"]),
        "ENGINE_ASSETS.spec.json": engine_asset_spec("cp2k", [
            {"name": "BASIS_MOLOPT", "kind": "basis_library"},
            {"name": "POTENTIAL", "kind": "gth_potential_library"},
        ]),
    }
    files["README_cp2k.md"] = build_readme("cp2k", structure["formula"], workflow, list(files.keys()))
    return build_generic_result("cp2k", request_data, files, "input.inp")


def compile_quantum_espresso_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"
    settings = quality_settings(quality)
    calculation = "relax" if workflow_is_optimization(workflow) else "scf"
    elements = unique_elements(structure["atoms"])
    species_lines = [f"  {element} {atomic_mass(element):.6f} {element}.upf" for element in elements]
    pos_lines = [f"  {atom['element']} {atom['x']:.8f} {atom['y']:.8f} {atom['z']:.8f}" for atom in structure["atoms"]]
    cell_lines = ["  " + " ".join(f"{component:.8f}" for component in vector) for vector in structure["lattice"]]
    input_text = f"""&CONTROL
  calculation = '{calculation}'
  prefix = 'scivis'
  pseudo_dir = './pseudo'
  outdir = './tmp'
/
&SYSTEM
  ibrav = 0
  nat = {len(structure['atoms'])}
  ntyp = {len(elements)}
  ecutwfc = {settings['ecut_ry']}
  occupations = 'smearing'
  smearing = 'mp'
  degauss = 0.01
/
&ELECTRONS
  conv_thr = 1.0d-8
  mixing_beta = 0.3
/
&IONS
  ion_dynamics = 'bfgs'
/
ATOMIC_SPECIES
{chr(10).join(species_lines)}
CELL_PARAMETERS angstrom
{chr(10).join(cell_lines)}
ATOMIC_POSITIONS angstrom
{chr(10).join(pos_lines)}
K_POINTS gamma
"""
    files = {
        "pw.in": input_text,
        "structure.xyz": format_xyz(structure["atoms"], structure["formula"]),
        "ENGINE_ASSETS.spec.json": engine_asset_spec("quantum_espresso", [
            {"name": f"pseudo/{element}.upf", "kind": "pseudopotential"} for element in elements
        ]),
    }
    files["README_quantum_espresso.md"] = build_readme("quantum_espresso", structure["formula"], workflow, list(files.keys()))
    return build_generic_result("quantum_espresso", request_data, files, "pw.in", {"pseudoSymbols": elements})


def compile_gaussian_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"
    settings = quality_settings(quality)
    charge, multiplicity = qchem_charge_and_multiplicity(intent)
    keyword = "Opt" if workflow_is_optimization(workflow) else "SP"
    if workflow == "dos":
        keyword = "SP Pop=Full"
    elif workflow == "neb":
        keyword = "Opt=(QST2,CalcFC)"
    coords = "\n".join(f"{atom['element']:<2} {atom['x']:>14.8f} {atom['y']:>14.8f} {atom['z']:>14.8f}" for atom in structure["atoms"])
    gjf = f"""%chk=scivis.chk
%mem=4GB
%nprocshared=8
#p PBE1PBE/{settings['basis']} {keyword} EmpiricalDispersion=GD3BJ

SciVisualizer {workflow_job_name(workflow)} for {structure['formula']}

{charge} {multiplicity}
{coords}

"""
    files = {
        "gaussian.gjf": gjf,
        "structure.xyz": format_xyz(structure["atoms"], structure["formula"]),
        "README_gaussian.md": build_readme("gaussian", structure["formula"], workflow, ["gaussian.gjf", "structure.xyz"]),
    }
    return build_generic_result("gaussian", request_data, files, "gaussian.gjf")


def compile_orca_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"
    settings = quality_settings(quality)
    charge, multiplicity = qchem_charge_and_multiplicity(intent)
    job = "Opt" if workflow_is_optimization(workflow) else "SP"
    coords = "\n".join(f"  {atom['element']:<2} {atom['x']:>14.8f} {atom['y']:>14.8f} {atom['z']:>14.8f}" for atom in structure["atoms"])
    inp = f"""! PBE {settings['basis']} D3BJ TightSCF {job}
%pal nprocs 8 end
%maxcore 2000

* xyz {charge} {multiplicity}
{coords}
*
"""
    files = {
        "orca.inp": inp,
        "structure.xyz": format_xyz(structure["atoms"], structure["formula"]),
        "README_orca.md": build_readme("orca", structure["formula"], workflow, ["orca.inp", "structure.xyz"]),
    }
    return build_generic_result("orca", request_data, files, "orca.inp")


def compile_nwchem_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"
    settings = quality_settings(quality)
    charge, _multiplicity = qchem_charge_and_multiplicity(intent)
    coords = "\n".join(f"  {atom['element']} {atom['x']:.8f} {atom['y']:.8f} {atom['z']:.8f}" for atom in structure["atoms"])
    task = "optimize" if workflow_is_optimization(workflow) else "energy"
    nw = f"""start scivis
charge {charge}

geometry units angstrom noautoz
{coords}
end

basis
  * library {settings['basis']}
end

dft
  xc pbe0
  iterations 100
end

task dft {task}
"""
    files = {
        "nwchem.nw": nw,
        "structure.xyz": format_xyz(structure["atoms"], structure["formula"]),
        "README_nwchem.md": build_readme("nwchem", structure["formula"], workflow, ["nwchem.nw", "structure.xyz"]),
    }
    return build_generic_result("nwchem", request_data, files, "nwchem.nw")


def compile_qchem_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"
    settings = quality_settings(quality)
    charge, multiplicity = qchem_charge_and_multiplicity(intent)
    jobtype = "opt" if workflow_is_optimization(workflow) else "sp"
    coords = "\n".join(f"{atom['element']} {atom['x']:.8f} {atom['y']:.8f} {atom['z']:.8f}" for atom in structure["atoms"])
    qcin = f"""$molecule
{charge} {multiplicity}
{coords}
$end

$rem
jobtype {jobtype}
method pbe0
basis {settings['basis']}
dft_d d3_bj
scf_algorithm diis
max_scf_cycles 100
$end
"""
    files = {
        "qchem.in": qcin,
        "structure.xyz": format_xyz(structure["atoms"], structure["formula"]),
        "README_qchem.md": build_readme("qchem", structure["formula"], workflow, ["qchem.in", "structure.xyz"]),
    }
    return build_generic_result("qchem", request_data, files, "qchem.in")


def compile_abinit_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"
    settings = quality_settings(quality)
    elements = unique_elements(structure["atoms"])
    typat_map = {element: index + 1 for index, element in enumerate(elements)}
    typat = " ".join(str(typat_map[atom["element"]]) for atom in structure["atoms"])
    znucl = " ".join(str(atomic_number(element) or 6) for element in elements)
    xcart = "\n".join(f"  {atom['x']:.8f} {atom['y']:.8f} {atom['z']:.8f}" for atom in structure["atoms"])
    rprim = "\n".join("  " + " ".join(f"{component:.8f}" for component in vector) for vector in structure["lattice"])
    ion_block = "ionmov 2\nntime 100\ntoldff 5.0d-5" if workflow_is_optimization(workflow) else "ionmov 0\nnstep 80\ntolvrs 1.0d-10"
    abi = f"""# SciVisualizer ABINIT input
ndtset 1
natom {len(structure['atoms'])}
ntypat {len(elements)}
typat {typat}
znucl {znucl}

acell 1.0 1.0 1.0 angstrom
rprim
{rprim}

xcart angstrom
{xcart}

ecut {settings['ecut_ry']} Ry
kptopt 0
nkpt 1
kpt 0.0 0.0 0.0
{ion_block}
"""
    files = {
        "scivis.abi": abi,
        "abinit.files": "scivis.abi\nscivis.abo\nscivis_i\nscivis_o\nscivis_tmp\n" + "\n".join(f"pseudo/{element}.psp8" for element in elements) + "\n",
        "structure.xyz": format_xyz(structure["atoms"], structure["formula"]),
        "ENGINE_ASSETS.spec.json": engine_asset_spec("abinit", [
            {"name": f"pseudo/{element}.psp8", "kind": "pseudopotential"} for element in elements
        ]),
    }
    files["README_abinit.md"] = build_readme("abinit", structure["formula"], workflow, list(files.keys()))
    return build_generic_result("abinit", request_data, files, "scivis.abi", {"pseudoSymbols": elements})


def compile_castep_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"
    settings = quality_settings(quality)
    lattice = "\n".join("  " + " ".join(f"{component:.8f}" for component in vector) for vector in structure["lattice"])
    positions = "\n".join(f"  {atom['element']} {atom['x']:.8f} {atom['y']:.8f} {atom['z']:.8f}" for atom in structure["atoms"])
    task = "GeometryOptimization" if workflow_is_optimization(workflow) else "SinglePoint"
    cell = f"""%BLOCK LATTICE_CART
ang
{lattice}
%ENDBLOCK LATTICE_CART

%BLOCK POSITIONS_ABS
ang
{positions}
%ENDBLOCK POSITIONS_ABS

KPOINT_MP_GRID 1 1 1
"""
    param = f"""task : {task}
xc_functional : PBE
cut_off_energy : {settings['ecut_ry'] * 13.605693:.1f} eV
spin_polarized : false
max_scf_cycles : 100
"""
    if workflow_is_optimization(workflow):
        param += "geom_max_iter : 200\n"
    files = {
        "scivis.cell": cell,
        "scivis.param": param,
        "structure.xyz": format_xyz(structure["atoms"], structure["formula"]),
        "ENGINE_ASSETS.spec.json": engine_asset_spec("castep", notes=["CASTEP resolves pseudopotentials from the cluster installation or .usp files."]),
    }
    files["README_castep.md"] = build_readme("castep", structure["formula"], workflow, list(files.keys()))
    return build_generic_result("castep", request_data, files, "scivis.cell")


def compile_siesta_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    elements = unique_elements(structure["atoms"])
    species_lines = [f"  {index + 1} {atomic_number(element) or 6} {element}" for index, element in enumerate(elements)]
    type_map = {element: index + 1 for index, element in enumerate(elements)}
    coord_lines = [
        f"  {atom['x']:.8f} {atom['y']:.8f} {atom['z']:.8f} {type_map[atom['element']]}"
        for atom in structure["atoms"]
    ]
    lattice = "\n".join("  " + " ".join(f"{component:.8f}" for component in vector) for vector in structure["lattice"])
    run_type = "CG" if workflow_is_optimization(workflow) else "FC"
    fdf = f"""SystemName scivis
SystemLabel scivis
NumberOfAtoms {len(structure['atoms'])}
NumberOfSpecies {len(elements)}

%block ChemicalSpeciesLabel
{chr(10).join(species_lines)}
%endblock ChemicalSpeciesLabel

LatticeConstant 1.0 Ang
%block LatticeVectors
{lattice}
%endblock LatticeVectors

AtomicCoordinatesFormat Ang
%block AtomicCoordinatesAndAtomicSpecies
{chr(10).join(coord_lines)}
%endblock AtomicCoordinatesAndAtomicSpecies

MeshCutoff 250 Ry
PAO.BasisSize DZP
XC.functional GGA
XC.authors PBE
MD.TypeOfRun {run_type}
MD.NumCGsteps 200
"""
    files = {
        "siesta.fdf": fdf,
        "structure.xyz": format_xyz(structure["atoms"], structure["formula"]),
        "ENGINE_ASSETS.spec.json": engine_asset_spec("siesta", [
            {"name": f"{element}.psf", "kind": "pseudopotential"} for element in elements
        ]),
    }
    files["README_siesta.md"] = build_readme("siesta", structure["formula"], workflow, list(files.keys()))
    return build_generic_result("siesta", request_data, files, "siesta.fdf", {"pseudoSymbols": elements})


def compile_dftbplus_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    elements = unique_elements(structure["atoms"])
    type_map = {element: index + 1 for index, element in enumerate(elements)}
    atom_lines = [
        f"{atom['id']} {type_map[atom['element']]} {atom['x']:.8f} {atom['y']:.8f} {atom['z']:.8f}"
        for atom in structure["atoms"]
    ]
    gen = "\n".join([
        f"{len(structure['atoms'])} S",
        " ".join(elements),
        *atom_lines,
        "0.0 0.0 0.0",
        *(" ".join(f"{component:.8f}" for component in vector) for vector in structure["lattice"]),
    ]) + "\n"
    max_angular = []
    for element in elements:
        angular = "s" if element == "H" else ("d" if atomic_number(element) > 20 else "p")
        max_angular.append(f"    {element} = \"{angular}\"")
    driver = "ConjugateGradient { MaxSteps = 200 }" if workflow_is_optimization(workflow) else "{}"
    hsd = f"""Geometry = GenFormat {{
  <<< "geo.gen"
}}

Driver = {driver}

Hamiltonian = DFTB {{
  SCC = Yes
  MaxSCCIterations = 100
  SlaterKosterFiles = Type2FileNames {{
    Prefix = "./slakos/"
    Separator = "-"
    Suffix = ".skf"
  }}
  MaxAngularMomentum = {{
{chr(10).join(max_angular)}
  }}
}}

Options {{
  WriteResultsTag = Yes
}}
"""
    files = {
        "dftb_in.hsd": hsd,
        "geo.gen": gen,
        "structure.xyz": format_xyz(structure["atoms"], structure["formula"]),
        "ENGINE_ASSETS.spec.json": engine_asset_spec("dftbplus", [
            {"name": "slakos/*.skf", "kind": "slater_koster_library"},
        ]),
    }
    files["README_dftbplus.md"] = build_readme("dftbplus", structure["formula"], workflow, list(files.keys()))
    return build_generic_result("dftbplus", request_data, files, "dftb_in.hsd")


def compile_xtb_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    charge, _multiplicity = qchem_charge_and_multiplicity(intent)
    inp = """$opt
  maxcycle=200
$end
$scc
  temp=300
$end
"""
    run_sh = "#!/bin/sh\nset -eu\n"
    if workflow_is_optimization(workflow):
        run_sh += f"xtb structure.xyz --input xtb.inp --chrg {charge} --opt > xtb.out\n"
    else:
        run_sh += f"xtb structure.xyz --input xtb.inp --chrg {charge} > xtb.out\n"
    files = {
        "structure.xyz": format_xyz(structure["atoms"], structure["formula"]),
        "xtb.inp": inp,
        "run_xtb.sh": run_sh,
        "README_xtb.md": build_readme("xtb", structure["formula"], workflow, ["structure.xyz", "xtb.inp", "run_xtb.sh"]),
    }
    return build_generic_result("xtb", request_data, files, "xtb.inp")


def lj_parameters(element: str) -> Tuple[float, float]:
    z = atomic_number(element) or 6
    sigma_nm = 0.22 + min(0.20, z * 0.0025)
    epsilon_kj = 0.10 + min(0.50, z * 0.006)
    return sigma_nm, epsilon_kj


def compile_gromacs_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    quality = str(intent.get("quality") or "standard").strip().lower() or "standard"
    settings = quality_settings(quality)
    elements = unique_elements(structure["atoms"])
    gro_lines = ["SciVisualizer generated structure", f"{len(structure['atoms']):5d}"]
    for atom in structure["atoms"]:
        gro_lines.append(
            f"{1:5d}{'MOL':<5}{atom['element'][:2]:>5}{atom['id'] % 100000:5d}"
            f"{atom['x'] / 10.0:8.3f}{atom['y'] / 10.0:8.3f}{atom['z'] / 10.0:8.3f}"
        )
    lengths_nm = [length / 10.0 for length in lattice_lengths(structure["lattice"])]
    gro_lines.append("".join(f"{length:10.5f}" for length in lengths_nm))
    atomtypes = []
    for element in elements:
        sigma, epsilon = lj_parameters(element)
        atomtypes.append(f"{element:<6} {atomic_number(element) or 0:3d} {atomic_mass(element):10.5f} 0.000 A {sigma:10.5f} {epsilon:10.5f}")
    atom_lines = [
        f"{atom['id']:5d} {atom['element']:<6} 1 MOL {atom['element']:<6} {atom['id']:5d} 0.000 {atomic_mass(atom['element']):10.5f}"
        for atom in structure["atoms"]
    ]
    top = f"""; SciVisualizer generic GROMACS topology
[ defaults ]
; nbfunc comb-rule gen-pairs fudgeLJ fudgeQQ
1 2 yes 0.5 0.8333

[ atomtypes ]
; name atomic_number mass charge ptype sigma epsilon
{chr(10).join(atomtypes)}

[ moleculetype ]
MOL 3

[ atoms ]
; nr type resnr residue atom cgnr charge mass
{chr(10).join(atom_lines)}

[ system ]
{structure['formula']}

[ molecules ]
MOL 1
"""
    integrator = "steep" if workflow_is_optimization(workflow) else "md"
    mdp = f"""integrator = {integrator}
nsteps = {settings['steps']}
dt = 0.001
emtol = 100.0
cutoff-scheme = Verlet
nstlist = 10
rvdw = 1.0
rcoulomb = 1.0
coulombtype = Cut-off
pbc = xyz
"""
    files = {
        "conf.gro": "\n".join(gro_lines) + "\n",
        "topol.top": top,
        "md.mdp": mdp,
        "run_gromacs.sh": "gmx grompp -f md.mdp -c conf.gro -p topol.top -o topol.tpr\ngmx mdrun -deffnm run\n",
        "README_gromacs.md": build_readme("gromacs", structure["formula"], workflow, ["conf.gro", "topol.top", "md.mdp", "run_gromacs.sh"], [
            "Generic nonbonded atom types are provided so grompp can build a starter TPR. Replace with validated force-field parameters before production science.",
        ]),
    }
    return build_generic_result("gromacs", request_data, files, "md.mdp")


def compile_namd_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    elements = unique_elements(structure["atoms"])
    psf_atoms = []
    for atom in structure["atoms"]:
        psf_atoms.append(
            f"{atom['id']:8d} SEG  1    MOL  {atom['element']:<4} {atom['element']:<4} "
            f"{0.0:10.6f} {atomic_mass(atom['element']):13.4f}           0"
        )
    psf = "\n".join([
        "PSF",
        "",
        "       1 !NTITLE",
        " REMARKS SciVisualizer generated PSF",
        "",
        f"{len(structure['atoms']):8d} !NATOM",
        *psf_atoms,
        "",
        "       0 !NBOND: bonds",
        "",
    ]) + "\n"
    masses = [f"MASS {index + 1:3d} {element:<4} {atomic_mass(element):10.5f} {element}" for index, element in enumerate(elements)]
    nonbonded = []
    for element in elements:
        sigma, epsilon = lj_parameters(element)
        rmin2 = sigma * 10.0 / 2.0
        nonbonded.append(f"{element:<4} 0.0000 {-epsilon / 4.184:.6f} {rmin2:.6f}")
    prm = "\n".join([
        "* SciVisualizer generic NAMD parameter starter",
        "*",
        *masses,
        "",
        "NONBONDED nbxmod 5 atom cdiel shift vatom vdistance vswitch -",
        "cutnb 14.0 ctofnb 12.0 ctonnb 10.0 eps 1.0 e14fac 1.0 wmin 1.5",
        *nonbonded,
        "",
        "END",
    ]) + "\n"
    lengths = lattice_lengths(structure["lattice"])
    minimization = "minimize 2000" if workflow_is_optimization(workflow) else "run 1000"
    conf = f"""structure structure.psf
coordinates structure.pdb
parameters parameters.prm
paraTypeCharmm on
temperature 300
exclude scaled1-4
1-4scaling 1.0
switching on
switchdist 10
cutoff 12
pairlistdist 14
cellBasisVector1 {lengths[0]:.4f} 0 0
cellBasisVector2 0 {lengths[1]:.4f} 0
cellBasisVector3 0 0 {lengths[2]:.4f}
cellOrigin 0 0 0
timestep 1.0
outputName scivis
{minimization}
"""
    files = {
        "namd.conf": conf,
        "structure.pdb": format_pdb(structure["atoms"], structure["lattice"]),
        "structure.psf": psf,
        "parameters.prm": prm,
        "README_namd.md": build_readme("namd", structure["formula"], workflow, ["namd.conf", "structure.pdb", "structure.psf", "parameters.prm"], [
            "Generic nonbonded parameters are included for input compilation. Replace with a validated force field before production MD.",
        ]),
    }
    return build_generic_result("namd", request_data, files, "namd.conf")


def compile_amber_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    elements = unique_elements(structure["atoms"])
    frcmod_lines = ["MASS"]
    frcmod_lines.extend(f"{element:<2} {atomic_mass(element):10.5f}" for element in elements)
    frcmod_lines.extend(["", "NONBON"])
    for element in elements:
        sigma, epsilon = lj_parameters(element)
        rstar = sigma * 10.0 / 2.0
        frcmod_lines.append(f"{element:<2} {rstar:10.5f} {epsilon / 4.184:10.5f}")
    tleap = """source leaprc.gaff2
loadAmberParams frcmod.generic
mol = loadpdb system.pdb
saveamberparm mol system.prmtop system.inpcrd
savepdb mol system_prepared.pdb
quit
"""
    imin = 1 if workflow_is_optimization(workflow) else 0
    mdin = f"""SciVisualizer AMBER starter
&cntrl
  imin={imin},
  maxcyc=2000,
  ncyc=1000,
  ntb=1,
  cut=10.0,
  nstlim=5000,
  dt=0.001,
/
"""
    files = {
        "system.pdb": format_pdb(structure["atoms"], structure["lattice"]),
        "tleap.in": tleap,
        "frcmod.generic": "\n".join(frcmod_lines) + "\n",
        "mdin": mdin,
        "run_amber.sh": "tleap -f tleap.in\nsander -O -i mdin -p system.prmtop -c system.inpcrd -o amber.out -r restrt\n",
        "README_amber.md": build_readme("amber", structure["formula"], workflow, ["system.pdb", "tleap.in", "frcmod.generic", "mdin", "run_amber.sh"], [
            "AmberTools/GAFF typing may need manual atom-type review for inorganic solids and unusual elements.",
        ]),
    }
    return build_generic_result("amber", request_data, files, "tleap.in")


def compile_openmm_inputs(request_data: Dict[str, Any]) -> Dict[str, Any]:
    structure = extract_render_structure(request_data)
    intent = request_data.get("intent") or {}
    workflow = str(intent.get("workflow") or "relax").strip().lower() or "relax"
    elements = unique_elements(structure["atoms"])
    params = {element: lj_parameters(element) for element in elements}
    param_json = json.dumps({
        element: {
            "mass_amu": atomic_mass(element),
            "sigma_nm": values[0],
            "epsilon_kj_mol": values[1],
        }
        for element, values in params.items()
    }, indent=2)
    steps = 0 if workflow_is_optimization(workflow) else 5000
    script = f'''#!/usr/bin/env python3
import json
from openmm import CustomNonbondedForce, LangevinMiddleIntegrator, LocalEnergyMinimizer, Platform, System, Vec3, unit
from openmm.app import PDBFile, Simulation

pdb = PDBFile("system.pdb")
params = json.load(open("openmm_params.json"))
system = System()
for atom in pdb.topology.atoms():
    system.addParticle(params[atom.element.symbol]["mass_amu"] * unit.dalton)

force = CustomNonbondedForce("4*epsilon*((sigma/r)^12-(sigma/r)^6); sigma=0.5*(sigma1+sigma2); epsilon=sqrt(epsilon1*epsilon2)")
force.addPerParticleParameter("sigma")
force.addPerParticleParameter("epsilon")
for atom in pdb.topology.atoms():
    item = params[atom.element.symbol]
    force.addParticle([item["sigma_nm"], item["epsilon_kj_mol"]])
force.setNonbondedMethod(CustomNonbondedForce.CutoffPeriodic)
force.setCutoffDistance(1.0 * unit.nanometer)
system.addForce(force)

topology = pdb.topology
integrator = LangevinMiddleIntegrator(300 * unit.kelvin, 1 / unit.picosecond, 0.001 * unit.picoseconds)
simulation = Simulation(topology, system, integrator)
simulation.context.setPositions(pdb.positions)
LocalEnergyMinimizer.minimize(simulation.context, maxIterations=500)
if {steps} > 0:
    simulation.step({steps})
state = simulation.context.getState(getPositions=True, getEnergy=True)
print("Potential energy:", state.getPotentialEnergy())
with open("final.pdb", "w") as handle:
    PDBFile.writeFile(topology, state.getPositions(), handle)
'''
    files = {
        "run_openmm.py": script,
        "system.pdb": format_pdb(structure["atoms"], structure["lattice"]),
        "openmm_params.json": param_json,
        "README_openmm.md": build_readme("openmm", structure["formula"], workflow, ["run_openmm.py", "system.pdb", "openmm_params.json"], [
            "The generated OpenMM system uses generic Lennard-Jones parameters so the package is runnable without external force-field files.",
        ]),
    }
    return build_generic_result("openmm", request_data, files, "run_openmm.py")


GENERIC_COMPILERS = {
    "abinit": compile_abinit_inputs,
    "amber": compile_amber_inputs,
    "castep": compile_castep_inputs,
    "cp2k": compile_cp2k_inputs,
    "dftbplus": compile_dftbplus_inputs,
    "gaussian": compile_gaussian_inputs,
    "gromacs": compile_gromacs_inputs,
    "namd": compile_namd_inputs,
    "nwchem": compile_nwchem_inputs,
    "openmm": compile_openmm_inputs,
    "orca": compile_orca_inputs,
    "qchem": compile_qchem_inputs,
    "quantum_espresso": compile_quantum_espresso_inputs,
    "siesta": compile_siesta_inputs,
    "xtb": compile_xtb_inputs,
}


def process_request(request_data: Dict[str, Any]) -> Dict[str, Any]:
    intent = request_data.get("intent") or {}
    engine = str(intent.get("engine") or "vasp").strip().lower() or "vasp"
    if engine == "lammps":
        return compile_lammps_inputs(request_data)
    if engine == "vasp":
        return compile_vasp_inputs(request_data)
    if engine in GENERIC_COMPILERS:
        return GENERIC_COMPILERS[engine](request_data)
    raise ValueError(f"Unsupported compile engine '{engine}'")


if __name__ == "__main__":
    try:
        input_data = json.loads(sys.stdin.read())
        result = process_request(input_data)
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}))
        sys.exit(1)
