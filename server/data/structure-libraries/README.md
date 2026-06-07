# Local Structure Libraries

This directory is the default local data-pack root for deterministic molecule
and crystal rendering.

Git tracks only this README. Downloaded SDF, CIF, JSON, and SQLite index files
are ignored because complete PubChem3D/COD/JARVIS mirrors can be very large.

Recommended layout:

```text
server/data/structure-libraries/
  index.sqlite
  pubchem3d/
    records/        # per-CID SDF files, e.g. 962.sdf
    sdf/            # optional PubChem3D bulk .sdf.gz chunks
  cod/
    cif/            # COD CIF files, flat or mirrored tree
  jarvis/
    json/           # one JARVIS entry per JSON file
  molecules/        # project-specific molecule SDF/JSON records
  crystals/
    cif/            # project-specific CIF records
```

Build or refresh the index after adding files:

```bash
python scripts/structure-libraries/build_structure_index.py --reset
```
