# Deterministic Structure Libraries

The modeling pipeline now supports a local-first structure library for
deterministic molecule, crystal, slab, and adsorbate rendering.

The goal is not to commit every molecule and crystal into Git. The repository
contains the resolver, downloaders, indexer, and small metadata conventions.
Large data packs live under `server/data/structure-libraries/` and are ignored
by Git.

## Runtime Lookup Order

`local_structure` is the first modeling provider by default. When a local match
is unavailable, the existing provider chain continues:

```text
local_structure -> materials_project -> atomly -> csd -> icsd -> optimade -> fallback
```

Small molecules use this order:

```text
local SDF/JSON index -> local PubChem3D record path -> RDKit SMILES 3D generation -> builtin template fallback
```

Crystals use this order:

```text
local CIF/JARVIS index -> direct COD/JARVIS/project file path -> existing external providers -> builtin crystal fallback
```

## Data-Pack Layout

```text
server/data/structure-libraries/
  index.sqlite
  pubchem3d/
    records/
    sdf/
  cod/
    cif/
  jarvis/
    json/
  molecules/
  crystals/
    cif/
```

Override the root with:

```bash
STRUCTURE_LIBRARY_DIR=/data/vasp-visualizer/structure-libraries
```

Override only the index with:

```bash
STRUCTURE_LIBRARY_INDEX=/data/vasp-visualizer/structure-libraries/index.sqlite
```

## PubChem3D

Use PubChem3D for local small-molecule 3D conformers and bond topology.

Download selected PubChem CIDs:

```bash
python scripts/structure-libraries/download_pubchem3d.py --cids 962 280 702 --index
```

Download the first N PubChem3D bulk chunks:

```bash
python scripts/structure-libraries/download_pubchem3d.py --chunks 2
python scripts/structure-libraries/build_structure_index.py --split-pubchem-gz --reset
```

Notes:

- `962` is water, `280` is carbon dioxide, `702` is ethanol.
- Full PubChem3D bulk data is large. Keep it on the server data volume, not in Git.
- Bulk chunks are stored in `pubchem3d/sdf/`; per-CID SDF records are stored in `pubchem3d/records/`.

## COD

Use the Crystallography Open Database for local CIF crystal structures.

Download specific COD entries:

```bash
python scripts/structure-libraries/download_cod.py --ids 1000000 --index
```

Mirror the COD CIF tree:

```bash
python scripts/structure-libraries/download_cod.py --rsync --index
```

Use `--delete` only for a managed mirror directory.

## JARVIS

Use JARVIS for computed materials datasets that can be downloaded through
`jarvis-tools`.

Install the optional downloader dependency inside the modeling Python runtime:

```bash
pip install jarvis-tools
```

Download a capped subset:

```bash
python scripts/structure-libraries/download_jarvis.py --dataset dft_3d --limit 1000 --index
```

## Indexing

Rebuild the local index after manually adding SDF, CIF, or JSON files:

```bash
python scripts/structure-libraries/build_structure_index.py --reset
```

For PubChem3D bulk `.sdf.gz` chunks, split into per-CID SDF records before
indexing:

```bash
python scripts/structure-libraries/build_structure_index.py --split-pubchem-gz --reset
```

Use `--max-records` for a smoke-test split:

```bash
python scripts/structure-libraries/build_structure_index.py --split-pubchem-gz --max-records 1000 --reset
```

## Render Precision

When a molecule comes from SDF/RDKit/template data, the backend exports explicit
bond records:

```json
{
  "atom1Id": "atom-0",
  "atom2Id": "atom-1",
  "order": 2,
  "type": "double"
}
```

The frontend prioritizes these explicit bonds over distance-based guessing and
renders double/triple bonds as parallel cylinders. This is the deterministic
piece that prevents CO and CO2 from being visually swapped before the image
beautification stage.
