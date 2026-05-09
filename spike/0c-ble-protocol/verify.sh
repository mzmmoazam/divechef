#!/usr/bin/env bash
# Verify BLE-downloaded Peregrine bytes parse identically to the SQLite-extracted reference.
# Usage:
#   ./verify.sh <ble-bin-from-iphone> [<reference-xml-from-Phase-A>]
#
# Defaults to /tmp/dive-blobs/c2-downloaded.bin and the dive-3 reference (which
# matched our BLE picker's "Dive 4" — the Peregrine manifest order != Shearwater
# Cloud's exported dive numbers).

set -euo pipefail

INPUT="${1:-/tmp/dive-blobs/c2-downloaded.bin}"
REFERENCE="${2:-/Users/mzmmoazam/Documents/Projects/diveForge/spike/0a-uddf-inspection/parsed/dive-3.xml}"
DCTOOL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/0b-desktop-harness/build/install/bin/dctool"
OUT="$(dirname "$INPUT")/c2-parsed.xml"

if [[ ! -x "$DCTOOL" ]]; then
  echo "dctool not found at $DCTOOL — run spike/0b-desktop-harness/build-libdivecomputer.sh first"
  exit 1
fi
if [[ ! -f "$INPUT" ]]; then
  echo "BLE blob not found at $INPUT"
  exit 1
fi

echo "Parsing $INPUT..."
"$DCTOOL" -d "Shearwater Peregrine" parse -u metric -o "$OUT" "$INPUT"
echo "Parsed: $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"

if [[ ! -f "$REFERENCE" ]]; then
  echo "Reference XML not found at $REFERENCE — skipping diff."
  exit 0
fi

echo
echo "Diffing against $REFERENCE..."
if diff -q "$OUT" "$REFERENCE" >/dev/null; then
  echo "✅ Byte-identical to reference. Spike validated."
  exit 0
fi

echo "❌ Differences found. First 40 lines:"
diff "$OUT" "$REFERENCE" | head -40
exit 1
