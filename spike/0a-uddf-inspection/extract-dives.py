#!/usr/bin/env python3
"""
Spike helper: extract dives from a Shearwater Cloud mobile SQLite export,
decompress the proprietary blobs, and run libdivecomputer's `dctool parse`
to produce structured XML per dive.

The mobile Shearwater Cloud app exports a SQLite DB whose `log_data` table
holds raw device bytes (not parsed structured data). Each row's
`data_bytes_1` is a 4-byte little-endian length prefix followed by a
gzip stream containing the Shearwater proprietary binary log.

Usage:
    ./extract-dives.py path/to/shearwater.db output-dir
"""
import argparse
import gzip
import json
import sqlite3
import struct
import subprocess
import sys
from pathlib import Path

DCTOOL = Path(__file__).resolve().parent.parent / "0b-desktop-harness" / "build" / "install" / "bin" / "dctool"


def extract_one(blob1: bytes) -> bytes:
    """Strip 4-byte LE length prefix, gunzip the rest, return decompressed bytes."""
    if len(blob1) < 4:
        raise ValueError("blob too short for length prefix")
    declared_len, = struct.unpack("<I", blob1[:4])
    payload = gzip.decompress(blob1[4:])
    if declared_len and abs(declared_len - len(payload)) > 1024:
        # not fatal — informational; declared_len may not be the decompressed size
        print(f"  note: declared length {declared_len} vs decompressed {len(payload)}")
    return payload


def parse_with_dctool(binary_path: Path, xml_out: Path) -> None:
    cmd = [
        str(DCTOOL),
        "-d", "Shearwater Peregrine",
        "parse",
        "-u", "metric",
        "-o", str(xml_out),
        str(binary_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not xml_out.exists():
        print(f"  dctool failed: rc={result.returncode}")
        print(f"  stdout: {result.stdout}")
        print(f"  stderr: {result.stderr}")
        raise RuntimeError("dctool parse failed")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("db", type=Path, help="Shearwater Cloud SQLite export")
    ap.add_argument("out_dir", type=Path, help="Output directory for parsed XMLs")
    args = ap.parse_args()

    if not DCTOOL.exists():
        print(f"dctool not found at {DCTOOL} — run spike/0b-desktop-harness/build-libdivecomputer.sh first")
        return 1

    args.out_dir.mkdir(parents=True, exist_ok=True)
    bin_dir = args.out_dir / "raw"
    bin_dir.mkdir(exist_ok=True)

    conn = sqlite3.connect(args.db)
    rows = conn.execute(
        "SELECT log_id, file_name, format, data_bytes_1, data_bytes_2, data_bytes_3 "
        "FROM log_data ORDER BY created_unixtime"
    ).fetchall()
    print(f"Found {len(rows)} dive(s) in {args.db.name}")

    summaries = []
    for log_id, file_name, fmt, b1, b2, b3 in rows:
        # Use file_name's dive number (e.g., "...#5...") as a friendly id
        try:
            dive_no = file_name.split("#", 1)[1].split(" ", 1)[0]
        except (AttributeError, IndexError):
            dive_no = log_id

        print(f"\nDive #{dive_no} (log_id={log_id}, format={fmt}, payload bytes={len(b1)})")
        try:
            payload = extract_one(b1)
        except Exception as e:
            print(f"  extract failed: {e}")
            continue

        bin_path = bin_dir / f"dive-{dive_no}.bin"
        bin_path.write_bytes(payload)
        xml_path = args.out_dir / f"dive-{dive_no}.xml"
        try:
            parse_with_dctool(bin_path, xml_path)
        except Exception as e:
            print(f"  parse failed: {e}")
            continue

        # Read header / footer JSON metadata
        header = json.loads(b2) if b2 else {}
        footer = json.loads(b3) if b3 else {}

        summaries.append({
            "dive_no": dive_no,
            "log_id": log_id,
            "file_name": file_name,
            "decompressed_bytes": len(payload),
            "xml_bytes": xml_path.stat().st_size,
            "header_keys": list(header.keys()),
            "footer_summary": {
                "DiveTimeInSeconds": footer.get("DiveTimeInSeconds"),
                "MaxDepth": footer.get("MaxDepth"),
                "StartTime": footer.get("StartTime"),
                "EndTime": footer.get("EndTime"),
            },
        })
        print(f"  wrote {xml_path.name} ({xml_path.stat().st_size} bytes)")

    print("\n=== SUMMARY ===")
    print(json.dumps(summaries, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
