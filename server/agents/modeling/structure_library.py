import gzip
import json
import os
import re
import sqlite3
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

from pymatgen.core import Composition, Molecule, Structure


DEFAULT_STRUCTURE_LIBRARY_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "structure-libraries")
)


@dataclass
class MoleculeRecord:
    molecule: Molecule
    formula: str
    bonds: List[Dict[str, Any]]
    source: str
    source_label: str
    identifier: Optional[str] = None
    name: Optional[str] = None
    path: Optional[str] = None
    anchor_index: int = 0
    default_height: float = 2.0


@dataclass
class StructureRecord:
    structure: Structure
    formula: str
    source: str
    source_label: str
    identifier: Optional[str] = None
    name: Optional[str] = None
    path: Optional[str] = None


def get_structure_library_root() -> str:
    return os.path.abspath(os.environ.get("STRUCTURE_LIBRARY_DIR") or DEFAULT_STRUCTURE_LIBRARY_DIR)


def normalize_formula_key(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        return Composition(raw).reduced_formula.lower()
    except Exception:
        return re.sub(r"[^a-z0-9]+", "", raw.lower())


def compact_query_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def bond_order_to_type(order: Any) -> str:
    try:
        parsed = int(round(float(order)))
    except Exception:
        parsed = 1
    if parsed >= 3:
        return "triple"
    if parsed == 2:
        return "double"
    return "single"


def normalize_bond(atom_a: Any, atom_b: Any, order: Any = 1) -> Dict[str, Any]:
    try:
        i = int(atom_a)
        j = int(atom_b)
    except Exception:
        i = 0
        j = 0
    try:
        parsed_order = int(round(float(order)))
    except Exception:
        parsed_order = 1
    parsed_order = max(1, min(3, parsed_order))
    return {
        "from": i,
        "to": j,
        "order": parsed_order,
        "type": bond_order_to_type(parsed_order),
    }


def open_text_maybe_gzip(path: str) -> str:
    if path.lower().endswith(".gz"):
        with gzip.open(path, "rt", encoding="utf-8", errors="replace") as handle:
            return handle.read()
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        return handle.read()


def split_sdf_records(text: str) -> Iterable[str]:
    for record in text.split("$$$$"):
        record = record.strip("\n\r ")
        if record:
            yield record + "\n"


def parse_sdf_properties(lines: List[str], start_index: int) -> Dict[str, str]:
    props: Dict[str, str] = {}
    i = start_index
    while i < len(lines):
        line = lines[i].strip()
        match = re.match(r"^>\s*<([^>]+)>", line)
        if not match:
            i += 1
            continue
        key = match.group(1).strip()
        i += 1
        values: List[str] = []
        while i < len(lines) and lines[i].strip():
            values.append(lines[i].rstrip("\n\r"))
            i += 1
        props[key] = "\n".join(values).strip()
        i += 1
    return props


def parse_sdf_record(record: str, path: Optional[str] = None) -> MoleculeRecord:
    lines = record.splitlines()
    if len(lines) < 4:
        raise ValueError("SDF record is too short")

    title = lines[0].strip()
    counts_line = lines[3]
    try:
        atom_count = int(counts_line[0:3])
        bond_count = int(counts_line[3:6])
    except Exception:
        parts = counts_line.split()
        if len(parts) < 2:
            raise ValueError("SDF counts line is invalid")
        atom_count = int(parts[0])
        bond_count = int(parts[1])

    atom_start = 4
    bond_start = atom_start + atom_count
    species: List[str] = []
    coords: List[List[float]] = []

    for line in lines[atom_start:bond_start]:
        parts = line.split()
        if len(parts) < 4:
            raise ValueError("SDF atom line is invalid")
        species.append(parts[3])
        coords.append([float(parts[0]), float(parts[1]), float(parts[2])])

    bonds: List[Dict[str, Any]] = []
    for line in lines[bond_start:bond_start + bond_count]:
        parts = line.split()
        if len(parts) < 3:
            continue
        bonds.append(normalize_bond(int(parts[0]) - 1, int(parts[1]) - 1, int(parts[2])))

    props = parse_sdf_properties(lines, bond_start + bond_count)
    formula = (
        props.get("PUBCHEM_MOLECULAR_FORMULA")
        or props.get("MOLECULAR_FORMULA")
        or props.get("Formula")
        or ""
    )
    if not formula:
        formula = Molecule(species, coords).composition.alphabetical_formula.replace(" ", "")

    identifier = (
        props.get("PUBCHEM_COMPOUND_CID")
        or props.get("CID")
        or props.get("Identifier")
        or None
    )
    name = (
        props.get("PUBCHEM_IUPAC_NAME")
        or props.get("PUBCHEM_IUPAC_OPENEYE_NAME")
        or props.get("PUBCHEM_OPENEYE_CAN_SMILES")
        or title
        or None
    )

    return MoleculeRecord(
        molecule=Molecule(species, coords),
        formula=formula,
        bonds=bonds,
        source="local_structure",
        source_label="Local Structure Library",
        identifier=str(identifier) if identifier else None,
        name=name,
        path=path,
    )


def parse_molecule_file(path: str) -> MoleculeRecord:
    lower = path.lower()
    if lower.endswith(".sdf") or lower.endswith(".sdf.gz") or lower.endswith(".mol"):
        text = open_text_maybe_gzip(path)
        first_record = next(split_sdf_records(text), text)
        return parse_sdf_record(first_record, path)

    if lower.endswith(".json"):
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        atoms = data.get("atoms") or []
        species: List[str] = []
        coords: List[List[float]] = []
        for atom in atoms:
            pos = atom.get("position") or atom
            species.append(str(atom.get("element") or atom.get("symbol") or "C"))
            coords.append([float(pos.get("x", 0)), float(pos.get("y", 0)), float(pos.get("z", 0))])
        bonds = [
            normalize_bond(b.get("from", b.get("atom1", b.get("a", 0))), b.get("to", b.get("atom2", b.get("b", 0))), b.get("order", 1))
            for b in (data.get("bonds") or [])
            if isinstance(b, dict)
        ]
        molecule = Molecule(species, coords)
        return MoleculeRecord(
            molecule=molecule,
            formula=str(data.get("formula") or molecule.composition.alphabetical_formula.replace(" ", "")),
            bonds=bonds,
            source="local_structure",
            source_label="Local Structure Library",
            identifier=str(data.get("identifier") or "") or None,
            name=str(data.get("name") or "") or None,
            path=path,
        )

    raise ValueError(f"Unsupported molecule file format: {path}")


def jarvis_atoms_to_structure(data: Dict[str, Any]) -> Structure:
    atoms = data.get("atoms") if isinstance(data.get("atoms"), dict) else data
    lattice = atoms.get("lattice_mat") or atoms.get("lattice") or atoms.get("latticeVectors")
    coords = atoms.get("coords") or atoms.get("positions")
    elements = atoms.get("elements") or atoms.get("species") or atoms.get("species_at_sites")
    if not lattice or not coords or not elements:
        raise ValueError("JARVIS JSON entry does not contain lattice, coords, and elements")
    cartesian = bool(atoms.get("cartesian", False))
    return Structure(lattice, elements, coords, coords_are_cartesian=cartesian)


def parse_structure_file(path: str) -> StructureRecord:
    lower = path.lower()
    if lower.endswith(".cif") or lower.endswith(".mcif"):
        struct = Structure.from_file(path)
    elif lower.endswith(".json"):
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        struct = jarvis_atoms_to_structure(data)
    else:
        struct = Structure.from_file(path)

    return StructureRecord(
        structure=struct,
        formula=struct.composition.reduced_formula,
        source="local_structure",
        source_label="Local Structure Library",
        identifier=os.path.splitext(os.path.basename(path))[0],
        path=path,
    )


def rdkit_smiles_to_record(query: str) -> Optional[MoleculeRecord]:
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem, rdMolDescriptors
    except Exception:
        return None

    mol = Chem.MolFromSmiles(str(query or "").strip())
    if mol is None:
        return None

    mol = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = 0xC0FFEE
    if AllChem.EmbedMolecule(mol, params) != 0:
        return None
    try:
        AllChem.UFFOptimizeMolecule(mol, maxIters=400)
    except Exception:
        pass

    conf = mol.GetConformer()
    species: List[str] = []
    coords: List[List[float]] = []
    for atom in mol.GetAtoms():
        pos = conf.GetAtomPosition(atom.GetIdx())
        species.append(atom.GetSymbol())
        coords.append([float(pos.x), float(pos.y), float(pos.z)])

    bonds: List[Dict[str, Any]] = []
    for bond in mol.GetBonds():
        order = int(round(float(bond.GetBondTypeAsDouble())))
        bonds.append(normalize_bond(bond.GetBeginAtomIdx(), bond.GetEndAtomIdx(), order))

    molecule = Molecule(species, coords)
    formula = rdMolDescriptors.CalcMolFormula(mol)
    return MoleculeRecord(
        molecule=molecule,
        formula=formula,
        bonds=bonds,
        source="rdkit",
        source_label="RDKit deterministic 3D",
        identifier=query,
        name=query,
    )


class LocalStructureLibrary:
    def __init__(self, root: Optional[str] = None):
        self.root = os.path.abspath(root or get_structure_library_root())
        self.index_path = os.environ.get("STRUCTURE_LIBRARY_INDEX") or os.path.join(self.root, "index.sqlite")

    def is_available(self) -> bool:
        return os.path.exists(self.index_path) or os.path.isdir(self.root)

    def query_index(self, kind: str, query: str) -> List[Dict[str, Any]]:
        if not os.path.exists(self.index_path):
            return []
        normalized_formula = normalize_formula_key(query)
        compact = compact_query_key(query)
        rows: List[Dict[str, Any]] = []
        try:
            conn = sqlite3.connect(self.index_path)
            conn.row_factory = sqlite3.Row
            try:
                cursor = conn.execute(
                    """
                    SELECT * FROM structures
                    WHERE kind = ?
                      AND (
                        lower(identifier) = lower(?)
                        OR lower(name) = lower(?)
                        OR normalized_formula = ?
                        OR compact_name = ?
                      )
                    ORDER BY priority ASC, source ASC, identifier ASC
                    LIMIT 8
                    """,
                    (kind, query, query, normalized_formula, compact),
                )
                rows = [dict(row) for row in cursor.fetchall()]
            finally:
                conn.close()
        except Exception:
            return []
        return rows

    def candidate_molecule_paths(self, query: str) -> Iterable[str]:
        raw = str(query or "").strip()
        compact = compact_query_key(raw)
        formula_key = normalize_formula_key(raw)
        candidates = [raw, compact, formula_key]
        cid_match = re.search(r"(?:cid[:_-]?)?(\d{1,12})$", raw, re.I)
        if cid_match:
            cid = cid_match.group(1).lstrip("0") or "0"
            candidates.extend([cid, f"CID_{cid}", f"cid-{cid}", f"pubchem-{cid}"])

        dirs = [
            os.environ.get("PUBCHEM3D_RECORD_DIR"),
            os.environ.get("PUBCHEM3D_SDF_DIR"),
            os.path.join(self.root, "pubchem3d", "records"),
            os.path.join(self.root, "pubchem3d", "sdf"),
            os.path.join(self.root, "molecules"),
            os.path.join(self.root, "samples", "molecules"),
        ]
        for directory in dirs:
            if not directory:
                continue
            for candidate in candidates:
                if not candidate:
                    continue
                for ext in (".sdf", ".sdf.gz", ".mol", ".json"):
                    yield os.path.join(directory, f"{candidate}{ext}")

    def resolve_molecule(self, query: str) -> Optional[MoleculeRecord]:
        for row in self.query_index("molecule", query):
            path = row.get("path")
            if path and not os.path.isabs(path):
                path = os.path.join(self.root, path)
            if path and os.path.exists(path):
                record = parse_molecule_file(path)
                record.source = row.get("source") or "local_structure"
                record.source_label = row.get("source_label") or "Local Structure Library"
                record.identifier = row.get("identifier") or record.identifier
                record.name = row.get("name") or record.name
                return record

        seen = set()
        for path in self.candidate_molecule_paths(query):
            if path in seen:
                continue
            seen.add(path)
            if os.path.exists(path):
                return parse_molecule_file(path)

        return rdkit_smiles_to_record(query)

    def candidate_structure_paths(self, query: str) -> Iterable[str]:
        raw = str(query or "").strip()
        compact = compact_query_key(raw)
        formula_key = normalize_formula_key(raw)
        candidates = [raw, compact, formula_key]

        cod_match = re.search(r"(?:cod[:_-]?)?(\d{7})$", raw, re.I)
        if cod_match:
            cod_id = cod_match.group(1)
            candidates.extend([cod_id, f"cod-{cod_id}"])
            yield os.path.join(self.root, "cod", "cif", f"{cod_id}.cif")
            yield os.path.join(self.root, "cod", "cif", cod_id[0], cod_id[1:3], cod_id[3:5], f"{cod_id}.cif")

        dirs = [
            os.environ.get("COD_CIF_DIR"),
            os.environ.get("JARVIS_JSON_DIR"),
            os.path.join(self.root, "cod", "cif"),
            os.path.join(self.root, "jarvis", "json"),
            os.path.join(self.root, "crystals", "cif"),
            os.path.join(self.root, "samples", "crystals"),
        ]
        for directory in dirs:
            if not directory:
                continue
            for candidate in candidates:
                if not candidate:
                    continue
                for ext in (".cif", ".mcif", ".json"):
                    yield os.path.join(directory, f"{candidate}{ext}")

    def resolve_structure(self, query: str) -> Optional[StructureRecord]:
        for row in self.query_index("crystal", query):
            path = row.get("path")
            if path and not os.path.isabs(path):
                path = os.path.join(self.root, path)
            if path and os.path.exists(path):
                record = parse_structure_file(path)
                record.source = row.get("source") or "local_structure"
                record.source_label = row.get("source_label") or "Local Structure Library"
                record.identifier = row.get("identifier") or record.identifier
                record.name = row.get("name") or record.name
                return record

        seen = set()
        for path in self.candidate_structure_paths(query):
            if path in seen:
                continue
            seen.add(path)
            if os.path.exists(path):
                return parse_structure_file(path)

        return None
