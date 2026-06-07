#!/usr/bin/env python3
"""
Download PubChem3D SDF records into the local structure library.

Examples:
  python scripts/structure-libraries/download_pubchem3d.py --cids 962 280
  python scripts/structure-libraries/download_pubchem3d.py --chunks 2 --index
"""

import argparse
import re
import subprocess
import sys
import urllib.request
from pathlib import Path


PUBCHEM3D_SDF_BASE = "https://ftp.ncbi.nlm.nih.gov/pubchem/Compound_3D/01_conf_per_cmpd/SDF/"
PUBCHEM_PUG_SDF = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/record/SDF/?record_type=3d"


def default_root() -> Path:
    return Path(__file__).resolve().parents[2] / "server" / "data" / "structure-libraries"


def download(url: str, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists() and out_path.stat().st_size > 0:
        print(f"exists {out_path}")
        return
    print(f"download {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "VASP-Visualizer-structure-library/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        out_path.write_bytes(response.read())
    print(f"wrote {out_path} ({out_path.stat().st_size} bytes)")


def list_bulk_chunks() -> list[str]:
    req = urllib.request.Request(PUBCHEM3D_SDF_BASE, headers={"User-Agent": "VASP-Visualizer-structure-library/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        html = response.read().decode("utf-8", errors="replace")
    return re.findall(r'href="([^"]+\.sdf\.gz)"', html)


def run_index(root: Path) -> None:
    script = Path(__file__).with_name("build_structure_index.py")
    subprocess.check_call([sys.executable, str(script), "--root", str(root), "--reset"])


def main() -> int:
    parser = argparse.ArgumentParser(description="Download PubChem3D local molecule data")
    parser.add_argument("--root", type=Path, default=default_root())
    parser.add_argument("--cids", nargs="*", default=[], help="PubChem CID values to download as individual 3D SDF records")
    parser.add_argument("--chunks", type=int, default=0, help="Number of PubChem3D bulk SDF chunks to download")
    parser.add_argument("--index", action="store_true", help="Rebuild local structure index after download")
    args = parser.parse_args()

    root = args.root.resolve()
    records_dir = root / "pubchem3d" / "records"
    chunks_dir = root / "pubchem3d" / "sdf"

    for cid in args.cids:
        clean_cid = re.sub(r"\D+", "", str(cid))
        if not clean_cid:
            continue
        download(PUBCHEM_PUG_SDF.format(cid=clean_cid), records_dir / f"{clean_cid}.sdf")

    if args.chunks > 0:
        chunks = list_bulk_chunks()[: args.chunks]
        for name in chunks:
            download(PUBCHEM3D_SDF_BASE + name, chunks_dir / name)
        print("Bulk chunks are downloaded but not split by default.")
        print("Run build_structure_index.py --split-pubchem-gz when you want per-CID local records.")

    if args.index:
        run_index(root)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
