#!/usr/bin/env python3
"""
Download JARVIS datasets into the local structure library.

Requires jarvis-tools:
  pip install jarvis-tools

Example:
  python scripts/structure-libraries/download_jarvis.py --dataset dft_3d --limit 1000 --index
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path


def default_root() -> Path:
    return Path(__file__).resolve().parents[2] / "server" / "data" / "structure-libraries"


def run_index(root: Path) -> None:
    script = Path(__file__).with_name("build_structure_index.py")
    subprocess.check_call([sys.executable, str(script), "--root", str(root), "--reset"])


def main() -> int:
    parser = argparse.ArgumentParser(description="Download JARVIS local JSON data")
    parser.add_argument("--root", type=Path, default=default_root())
    parser.add_argument("--dataset", default="dft_3d", help="Dataset name accepted by jarvis.db.figshare.data")
    parser.add_argument("--limit", type=int, default=0, help="Optional max records to save")
    parser.add_argument("--index", action="store_true", help="Rebuild local structure index after download")
    args = parser.parse_args()

    try:
        from jarvis.db.figshare import data as jarvis_data
    except Exception as exc:
        raise SystemExit(
            "jarvis-tools is not installed in this Python environment. "
            "Install it with `pip install jarvis-tools` inside the modeling runtime. "
            f"Original error: {exc}"
        )

    root = args.root.resolve()
    out_dir = root / "jarvis" / "json"
    out_dir.mkdir(parents=True, exist_ok=True)

    records = jarvis_data(args.dataset)
    if args.limit and args.limit > 0:
        records = records[: args.limit]

    count = 0
    for idx, record in enumerate(records):
        identifier = str(record.get("jid") or record.get("id") or f"{args.dataset}-{idx}")
        out_path = out_dir / f"{identifier}.json"
        out_path.write_text(json.dumps(record, indent=2, sort_keys=True), encoding="utf-8")
        count += 1

    print(f"wrote {count} JARVIS records to {out_dir}")

    if args.index:
        run_index(root)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
