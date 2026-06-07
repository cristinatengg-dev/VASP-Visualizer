#!/usr/bin/env python3
"""
Download COD CIF files into the local structure library.

Examples:
  python scripts/structure-libraries/download_cod.py --ids 1000000 9008467 --index
  python scripts/structure-libraries/download_cod.py --rsync
"""

import argparse
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path


COD_CIF_URL = "https://www.crystallography.net/cod/{cod_id}.cif"
COD_RSYNC_URL = "rsync://www.crystallography.net/cif/"


def default_root() -> Path:
    return Path(__file__).resolve().parents[2] / "server" / "data" / "structure-libraries"


def download_cod_id(cod_id: str, out_dir: Path) -> None:
    clean_id = "".join(ch for ch in str(cod_id) if ch.isdigit())
    if len(clean_id) != 7:
        raise ValueError(f"COD id must be 7 digits: {cod_id}")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{clean_id}.cif"
    if out_path.exists() and out_path.stat().st_size > 0:
        print(f"exists {out_path}")
        return
    url = COD_CIF_URL.format(cod_id=clean_id)
    print(f"download {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "VASP-Visualizer-structure-library/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        out_path.write_bytes(response.read())
    print(f"wrote {out_path} ({out_path.stat().st_size} bytes)")


def run_rsync(out_dir: Path, delete: bool) -> None:
    if shutil.which("rsync") is None:
        raise RuntimeError("rsync is not installed")
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = ["rsync", "-av"]
    if delete:
        cmd.append("--delete")
    cmd.extend([COD_RSYNC_URL, str(out_dir) + "/"])
    subprocess.check_call(cmd)


def run_index(root: Path) -> None:
    script = Path(__file__).with_name("build_structure_index.py")
    subprocess.check_call([sys.executable, str(script), "--root", str(root), "--reset"])


def main() -> int:
    parser = argparse.ArgumentParser(description="Download COD local crystal CIF data")
    parser.add_argument("--root", type=Path, default=default_root())
    parser.add_argument("--ids", nargs="*", default=[], help="Specific 7-digit COD ids to download")
    parser.add_argument("--rsync", action="store_true", help="Mirror the COD CIF tree with rsync")
    parser.add_argument("--delete", action="store_true", help="Use rsync --delete when mirroring")
    parser.add_argument("--index", action="store_true", help="Rebuild local structure index after download")
    args = parser.parse_args()

    root = args.root.resolve()
    out_dir = root / "cod" / "cif"

    for cod_id in args.ids:
        download_cod_id(cod_id, out_dir)

    if args.rsync:
        run_rsync(out_dir, args.delete)

    if args.index:
        run_index(root)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
