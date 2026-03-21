import json
import math
import sys
from typing import Any, Dict, List

try:
    from pymatgen.core import Lattice, Structure
    from pymatgen.io.vasp.inputs import Incar, Kpoints, Poscar
except Exception as exc:
    sys.stderr.write(f"CRITICAL: Failed to initialize compute pymatgen runtime: {exc}\n")
    sys.stderr.write("Please reinstall compatible numpy / pymatgen binaries on the compute host.\n")
    sys.exit(1)


def structure_from_render_data(render_data: Dict[str, Any]) -> Structure:
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


if __name__ == "__main__":
    try:
        input_data = json.loads(sys.stdin.read())
        result = compile_vasp_inputs(input_data)
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}))
        sys.exit(1)
