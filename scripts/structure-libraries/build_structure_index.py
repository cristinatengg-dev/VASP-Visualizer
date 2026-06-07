#!/usr/bin/env python3
"""
Build a local SQLite index for VASP Visualizer structure data packs.

The index intentionally stores paths and lightweight metadata only. Structure
coordinates stay in SDF/CIF/JSON files under server/data/structure-libraries.
"""

import argparse
import gzip
import json
import os
import re
import sqlite3
from pathlib import Path
from typing import Dict, Iterable, Iterator, Optional, Tuple


def default_root() -> Path:
    return Path(__file__).resolve().parents[2] / "server" / "data" / "structure-libraries"


def compact_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def normalize_formula_key(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        from pymatgen.core import Composition

        return Composition(raw).reduced_formula.lower()
    except Exception:
        return compact_key(raw)


def open_text(path: Path) -> str:
    if path.suffix.lower() == ".gz":
        with gzip.open(path, "rt", encoding="utf-8", errors="replace") as handle:
            return handle.read()
    return path.read_text(encoding="utf-8", errors="replace")


def iter_sdf_records(text: str) -> Iterator[str]:
    for record in text.split("$$$$"):
        record = record.strip("\n\r ")
        if record:
            yield record + "\n"


def parse_sdf_props(record: str) -> Dict[str, str]:
    lines = record.splitlines()
    props: Dict[str, str] = {}
    i = 0
    while i < len(lines):
        match = re.match(r"^>\s*<([^>]+)>", lines[i].strip())
        if not match:
            i += 1
            continue
        key = match.group(1).strip()
        i += 1
        values = []
        while i < len(lines) and lines[i].strip():
            values.append(lines[i].strip())
            i += 1
        props[key] = "\n".join(values).strip()
        i += 1
    return props


def parse_sdf_atom_formula(record: str) -> str:
    lines = record.splitlines()
    if len(lines) < 4:
        return ""
    try:
        atom_count = int(lines[3][0:3])
    except Exception:
        parts = lines[3].split()
        atom_count = int(parts[0]) if parts else 0
    counts: Dict[str, int] = {}
    for line in lines[4 : 4 + atom_count]:
        parts = line.split()
        if len(parts) >= 4:
            element = parts[3]
            counts[element] = counts.get(element, 0) + 1
    return "".join(f"{element}{count if count > 1 else ''}" for element, count in sorted(counts.items()))


def sdf_metadata(path: Path) -> Tuple[str, str, str]:
    record = next(iter_sdf_records(open_text(path)), "")
    props = parse_sdf_props(record)
    formula = (
        props.get("PUBCHEM_MOLECULAR_FORMULA")
        or props.get("MOLECULAR_FORMULA")
        or props.get("Formula")
        or parse_sdf_atom_formula(record)
    )
    identifier = props.get("PUBCHEM_COMPOUND_CID") or props.get("CID") or path.stem.replace(".sdf", "")
    name = (
        props.get("PUBCHEM_IUPAC_NAME")
        or props.get("PUBCHEM_IUPAC_OPENEYE_NAME")
        or props.get("PUBCHEM_OPENEYE_CAN_SMILES")
        or path.stem
    )
    return str(identifier), str(formula), str(name)


def cif_formula(path: Path) -> str:
    try:
        from pymatgen.core import Structure

        return Structure.from_file(str(path)).composition.reduced_formula
    except Exception:
        pass

    text = path.read_text(encoding="utf-8", errors="replace")
    for key in ("_chemical_formula_sum", "_chemical_formula_structural"):
        match = re.search(rf"^{key}\s+(.+)$", text, re.I | re.M)
        if match:
            return match.group(1).strip().strip("'\"").replace(" ", "")
    return ""


def jarvis_metadata(path: Path) -> Tuple[str, str, str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    identifier = str(data.get("jid") or data.get("id") or path.stem)
    formula = str(data.get("formula") or data.get("formula_pretty") or "")
    if not formula:
        atoms = data.get("atoms") if isinstance(data.get("atoms"), dict) else data
        elements = atoms.get("elements") or atoms.get("species") or []
        counts: Dict[str, int] = {}
        for element in elements:
            counts[str(element)] = counts.get(str(element), 0) + 1
        formula = "".join(f"{element}{count if count > 1 else ''}" for element, count in sorted(counts.items()))
    return identifier, formula, str(data.get("name") or identifier)


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS structures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source TEXT NOT NULL,
          source_label TEXT,
          kind TEXT NOT NULL,
          identifier TEXT,
          formula TEXT,
          normalized_formula TEXT,
          name TEXT,
          compact_name TEXT,
          path TEXT NOT NULL,
          format TEXT,
          priority INTEGER DEFAULT 100,
          metadata_json TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_structures_kind_identifier ON structures(kind, identifier);
        CREATE INDEX IF NOT EXISTS idx_structures_kind_formula ON structures(kind, normalized_formula);
        CREATE INDEX IF NOT EXISTS idx_structures_kind_name ON structures(kind, compact_name);
        """
    )


def insert_row(
    conn: sqlite3.Connection,
    root: Path,
    *,
    source: str,
    source_label: str,
    kind: str,
    identifier: str,
    formula: str,
    name: str,
    path: Path,
    fmt: str,
    priority: int,
    metadata: Optional[Dict[str, object]] = None,
) -> None:
    conn.execute(
        """
        INSERT INTO structures (
          source, source_label, kind, identifier, formula, normalized_formula,
          name, compact_name, path, format, priority, metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            source,
            source_label,
            kind,
            identifier,
            formula,
            normalize_formula_key(formula),
            name,
            compact_key(name),
            str(path.relative_to(root)),
            fmt,
            priority,
            json.dumps(metadata or {}, sort_keys=True),
        ),
    )


def split_pubchem_chunk(root: Path, path: Path, max_records: Optional[int]) -> int:
    records_dir = root / "pubchem3d" / "records"
    records_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for record in iter_sdf_records(open_text(path)):
        props = parse_sdf_props(record)
        cid = props.get("PUBCHEM_COMPOUND_CID") or props.get("CID")
        if not cid:
            continue
        out_path = records_dir / f"{cid}.sdf"
        if not out_path.exists():
            out_path.write_text(record + "$$$$\n", encoding="utf-8")
        count += 1
        if max_records and count >= max_records:
            break
    return count


def iter_files(root: Path, relative_dirs: Iterable[str], suffixes: Tuple[str, ...]) -> Iterator[Path]:
    for rel in relative_dirs:
        directory = root / rel
        if not directory.exists():
            continue
        for path in directory.rglob("*"):
            if path.is_file() and path.name.lower().endswith(suffixes):
                yield path


def main() -> int:
    parser = argparse.ArgumentParser(description="Build local structure-library index")
    parser.add_argument("--root", type=Path, default=default_root())
    parser.add_argument("--reset", action="store_true", help="Drop existing index rows before indexing")
    parser.add_argument("--split-pubchem-gz", action="store_true", help="Split PubChem bulk .sdf.gz chunks into per-CID SDF records before indexing")
    parser.add_argument("--max-records", type=int, default=None, help="Optional cap when splitting PubChem chunks")
    args = parser.parse_args()

    root = args.root.resolve()
    root.mkdir(parents=True, exist_ok=True)

    if args.split_pubchem_gz:
        for chunk in iter_files(root, ["pubchem3d/sdf"], (".sdf.gz",)):
            split_count = split_pubchem_chunk(root, chunk, args.max_records)
            print(f"split {split_count} PubChem records from {chunk}")

    db_path = root / "index.sqlite"
    conn = sqlite3.connect(db_path)
    try:
        create_schema(conn)
        if args.reset:
            conn.execute("DELETE FROM structures")

        inserted = 0
        for path in iter_files(root, ["pubchem3d/records", "molecules", "samples/molecules"], (".sdf", ".sdf.gz", ".mol", ".json")):
            try:
                identifier, formula, name = sdf_metadata(path) if path.suffix.lower() != ".json" else (path.stem, "", path.stem)
                insert_row(
                    conn,
                    root,
                    source="local_structure",
                    source_label="PubChem3D/local molecule SDF",
                    kind="molecule",
                    identifier=identifier,
                    formula=formula,
                    name=name,
                    path=path,
                    fmt=path.suffix.lstrip("."),
                    priority=20 if "pubchem3d" in path.parts else 10,
                )
                inserted += 1
            except Exception as exc:
                print(f"skip molecule {path}: {exc}")

        for path in iter_files(root, ["cod/cif", "crystals/cif", "samples/crystals"], (".cif", ".mcif")):
            try:
                formula = cif_formula(path)
                identifier = path.stem
                insert_row(
                    conn,
                    root,
                    source="local_structure",
                    source_label="COD/local crystal CIF",
                    kind="crystal",
                    identifier=identifier,
                    formula=formula,
                    name=identifier,
                    path=path,
                    fmt=path.suffix.lstrip("."),
                    priority=20,
                )
                inserted += 1
            except Exception as exc:
                print(f"skip crystal {path}: {exc}")

        for path in iter_files(root, ["jarvis/json"], (".json",)):
            try:
                identifier, formula, name = jarvis_metadata(path)
                insert_row(
                    conn,
                    root,
                    source="local_structure",
                    source_label="JARVIS local JSON",
                    kind="crystal",
                    identifier=identifier,
                    formula=formula,
                    name=name,
                    path=path,
                    fmt="json",
                    priority=30,
                )
                inserted += 1
            except Exception as exc:
                print(f"skip JARVIS {path}: {exc}")

        conn.commit()
        print(f"indexed {inserted} structures into {db_path}")
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
