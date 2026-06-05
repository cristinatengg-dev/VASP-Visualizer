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

    if workflow == "relax":
        incar.update({
            "IBRION": 2,
            "ISIF": 2 if is_slab else 3,
            "NSW": 200,
            "EDIFFG": -0.03,
        })
    elif workflow == "static":
        incar.update({
            "IBRION": -1,
            "ISIF": 2,
            "NSW": 0,
            "LCHARG": True,
            "LWAVE": False,
        })
    else:
        raise ValueError(f"Unsupported workflow '{workflow}'. Supported workflows: relax, static")

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

    if workflow in {"relax", "static"}:
        workflow = "irradiation_creep"
    if workflow != "irradiation_creep":
        raise ValueError("LAMMPS compiler currently supports the graphite irradiation_creep workflow")

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


def process_request(request_data: Dict[str, Any]) -> Dict[str, Any]:
    intent = request_data.get("intent") or {}
    engine = str(intent.get("engine") or "vasp").strip().lower() or "vasp"
    if engine == "lammps":
        return compile_lammps_inputs(request_data)
    if engine == "vasp":
        return compile_vasp_inputs(request_data)
    raise ValueError(f"Unsupported compile engine '{engine}'")


if __name__ == "__main__":
    try:
        input_data = json.loads(sys.stdin.read())
        result = process_request(input_data)
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}))
        sys.exit(1)
