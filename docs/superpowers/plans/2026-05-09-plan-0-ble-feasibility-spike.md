# Plan 0 — DiveForge BLE/libdivecomputer Feasibility Spike

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **AMENDED 2026-05-09 (mid-spike):** Phase A and B together discovered that (1) Shearwater Cloud's mobile export is SQLite, not UDDF, and (2) upstream libdivecomputer's BLE transport is BlueZ-only, so `dctool` BLE on macOS/iOS does not work. Phase B was repurposed accordingly — its detailed instructions below now reflect the actual work done, not the original plan. Phase C has been **wholly replaced** with a leaner pure-Swift CoreBluetooth spike (no React Native, no cross-compiled libdc-for-iOS, no PATH-1/PATH-2 fallback). The original Phase C (RN+TurboModule mixed with BLE protocol exploration) is preserved in git history under commits up to `f8fd235`. See "Phase C (revised)" below.

**Goal:** Prove the data path from Shearwater Peregrine → BLE → libdivecomputer parser → parsed JSON works end-to-end, and document the actual dive data schema, before committing to production schemas in Plans 1–3.

**Architecture:** Phase A inspects an existing dive export to lock the data schema cheaply. Phase B builds libdivecomputer on macOS so we have a known-good parser to point any byte stream at. Phase C (revised) implements just the Peregrine BLE wire protocol over CoreBluetooth in pure Swift on iOS, then runs the resulting bytes through the parser to confirm equivalence with Phase A's output.

**Tech Stack:** Python + SQLite + libdivecomputer (Phase A), libdivecomputer + Homebrew toolchain (Phase B), pure Swift + CoreBluetooth + Xcode (Phase C revised).

**All spike code lives under `spike/` and may be deleted after Plan 0 finishes. The real deliverable is `spike/findings.md`.**

**Non-goals:**
- Production-quality code (this is throwaway).
- Tests (this is exploration).
- Android (iOS proves the path; Android has the same libdivecomputer hooks).
- Pretty UI (the RN spike just shows raw JSON).
- Both platforms (iOS only — easier BLE, harder native build, more representative).

---

## Phase A — UDDF inspection (1 hour)

Goal: extract the actual dive-data schema from real Peregrine exports without touching BLE.

### Task A1: Set up the spike directory

**Files:**
- Create: `spike/README.md`

- [ ] **Step 1: Create the directory and a top-level README**

```bash
mkdir -p spike
```

- [ ] **Step 2: Write `spike/README.md`**

```markdown
# DiveForge spike

Throwaway exploration to de-risk BLE + libdivecomputer integration. Will be deleted (or archived) after Plan 0 finishes. See `findings.md` for outputs.
```

- [ ] **Step 3: Commit**

```bash
git add spike/README.md
git commit -m "spike: scaffold spike directory"
```

---

### Task A2: Export sample dives from Shearwater Cloud (user action)

**Files:**
- Create: `spike/0a-uddf-inspection/sample-dives/` (will hold exported files)

- [ ] **Step 1: Create the sample-dives folder with a placeholder .gitkeep**

```bash
mkdir -p spike/0a-uddf-inspection/sample-dives
touch spike/0a-uddf-inspection/sample-dives/.gitkeep
```

- [ ] **Step 2: USER ACTION — export 3–5 real dives from Shearwater Cloud**

On your phone:
1. Open Shearwater Cloud app.
2. Connect to your Peregrine via Bluetooth (this is the official app, not DiveForge).
3. Sync any new dives.
4. Use Share/Export → choose UDDF format if available; otherwise XML or DB.
5. AirDrop or transfer the exported file(s) to this Mac.
6. Drop them into `spike/0a-uddf-inspection/sample-dives/`.

If Shearwater Cloud only exports a database file, also try the desktop Shearwater Cloud app, which exports UDDF more reliably.

Confirm at least one dive file lands in `spike/0a-uddf-inspection/sample-dives/`.

- [ ] **Step 3: Verify**

```bash
ls -la spike/0a-uddf-inspection/sample-dives/
```

Expected: at least one `.uddf`, `.xml`, or `.zip` file (besides `.gitkeep`).

- [ ] **Step 4: Commit ONLY anonymized sample(s)**

If your dives contain identifying info (your name, GPS location, club name), strip it manually with a text editor or skip committing the file and just keep it locally.

```bash
git add spike/0a-uddf-inspection/sample-dives/
git commit -m "spike(A): add anonymized Peregrine UDDF sample dives"
```

---

### Task A3: Set up Node TS project for UDDF parsing

**Files:**
- Create: `spike/0a-uddf-inspection/package.json`
- Create: `spike/0a-uddf-inspection/tsconfig.json`
- Create: `spike/0a-uddf-inspection/.gitignore`

- [ ] **Step 1: Initialize a minimal TS Node project**

```bash
cd spike/0a-uddf-inspection
npm init -y
npm install --save-dev typescript @types/node tsx
npm install fast-xml-parser
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["*.ts"]
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
dist/
*.log
```

- [ ] **Step 4: Verify**

```bash
ls package.json tsconfig.json node_modules/.package-lock.json
```

Expected: all three exist.

- [ ] **Step 5: Commit**

```bash
cd ../..   # back to repo root
git add spike/0a-uddf-inspection/package.json spike/0a-uddf-inspection/package-lock.json spike/0a-uddf-inspection/tsconfig.json spike/0a-uddf-inspection/.gitignore
git commit -m "spike(A): scaffold UDDF parser project"
```

---

### Task A4: Write the UDDF parser

**Files:**
- Create: `spike/0a-uddf-inspection/parse-uddf.ts`

- [ ] **Step 1: Write `parse-uddf.ts`**

```typescript
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";

const SAMPLES_DIR = join(import.meta.dirname, "sample-dives");

function inspect(file: string) {
  const xml = readFileSync(join(SAMPLES_DIR, file), "utf8");
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);

  console.log(`\n=== ${file} ===`);
  // UDDF root path varies. Walk a few likely places.
  const dives =
    doc?.uddf?.profiledata?.repetitiongroup?.dive ??
    doc?.uddf?.profiledata?.dive ??
    null;

  if (!dives) {
    console.log("No dives at the expected paths. Top-level keys:");
    console.log(Object.keys(doc));
    console.log("If you see something other than 'uddf', this isn't UDDF — adapt accordingly.");
    return;
  }

  const arr = Array.isArray(dives) ? dives : [dives];
  console.log(`Found ${arr.length} dive(s).`);

  for (const d of arr.slice(0, 1)) {
    // Print top-level dive keys + first sample point keys
    console.log("Dive keys:", Object.keys(d));
    const samples =
      d?.samples?.waypoint ??
      d?.profiledata?.waypoint ??
      [];
    const sArr = Array.isArray(samples) ? samples : [samples];
    console.log(`Samples: ${sArr.length}`);
    if (sArr.length > 0) {
      console.log("First waypoint keys:", Object.keys(sArr[0]));
      console.log("First waypoint:", JSON.stringify(sArr[0], null, 2));
      console.log("Last waypoint:", JSON.stringify(sArr[sArr.length - 1], null, 2));
    }
  }
}

const files = readdirSync(SAMPLES_DIR).filter(
  (f) => f.endsWith(".uddf") || f.endsWith(".xml")
);
if (files.length === 0) {
  console.error("No .uddf or .xml files found in sample-dives/.");
  process.exit(1);
}
files.forEach(inspect);
```

- [ ] **Step 2: Run the parser**

```bash
cd spike/0a-uddf-inspection
npx tsx parse-uddf.ts
```

Expected: prints dive keys, sample count, first and last waypoint contents for each file.

If output shows top-level isn't `uddf` (e.g., it's a Shearwater proprietary XML), inspect the raw file with `head -50 sample-dives/<file>` and adapt the path-walking in the script. Real-world UDDF varies wildly between vendors; the goal here is **discovering** the actual structure, not pre-coding a perfect parser.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add spike/0a-uddf-inspection/parse-uddf.ts
git commit -m "spike(A): UDDF parser to inspect Peregrine export schema"
```

---

### Task A5: Document Phase A findings

**Files:**
- Create: `spike/0a-uddf-inspection/findings.md`

- [ ] **Step 1: Write `findings.md` with the actual fields you saw**

Run the parser, capture its output, then write a findings doc with this exact structure (fill in REAL values from your output — do NOT leave placeholders):

```markdown
# Phase A findings — UDDF schema from Peregrine

## Dive-level fields observed
- `<dive>` attributes: [list them, e.g., id, number]
- Children: [list them, e.g., date, time, surfaceintervalbeforedive, samples, ...]

## Sample (waypoint) fields observed
For each `<waypoint>` we got:
- depth (units?): [yes/no, format]
- divetime / time (units?): [yes/no, format]
- temperature: [yes/no]
- decostop / required-stop: [yes/no — THIS IS CRITICAL for palier_deco_manque rule]
- ndl: [yes/no]
- cns: [yes/no]
- ascent rate hint: [yes/no]
- tank pressure: [expected NO — Peregrine has no AI]

## Sample frequency
[e.g., one waypoint every 10s, or 5s, or variable]

## Spec implications
- `DiveSample.ndlMin`: [keep / drop / rename]
- `DiveSample.cnsPct`: [keep / drop / rename]
- `palier_deco_manque` rule: [feasible / drop / partial — explain why]
- Any new fields we should add: [list]
- Any fields in the spec we don't have data for: [list]

## Next-action checklist for Plan 1
- [ ] Update `Dive` / `DiveSample` schema in spec to match
- [ ] Decide fate of `palier_deco_manque`
```

- [ ] **Step 2: Commit**

```bash
git add spike/0a-uddf-inspection/findings.md
git commit -m "spike(A): document Peregrine UDDF schema findings"
```

---

## Phase B — Desktop libdivecomputer + BLE harness (2–3 days)

Goal: prove libdivecomputer can talk to your Peregrine via BLE on a Mac, and capture the parsed output.

### Task B1: Install libdivecomputer build dependencies

**Files:** none (system tools only)

- [ ] **Step 1: Install Homebrew prereqs**

```bash
brew install autoconf automake libtool pkg-config
```

- [ ] **Step 2: Verify**

```bash
which autoreconf && which automake && which libtool && which pkg-config
```

Expected: all four print paths (no error). If any are missing, fix Homebrew before continuing.

---

### Task B2: Clone and build libdivecomputer

**Files:**
- Create: `spike/0b-desktop-harness/build-libdivecomputer.sh`

- [ ] **Step 1: Create the build script**

Write `spike/0b-desktop-harness/build-libdivecomputer.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$HARNESS_DIR/build"
SRC_DIR="$BUILD_DIR/libdivecomputer"
INSTALL_DIR="$BUILD_DIR/install"

mkdir -p "$BUILD_DIR"

if [[ ! -d "$SRC_DIR" ]]; then
  git clone https://github.com/libdivecomputer/libdivecomputer.git "$SRC_DIR"
fi

cd "$SRC_DIR"
git pull --ff-only || true

autoreconf --install
./configure --prefix="$INSTALL_DIR"
make -j"$(sysctl -n hw.ncpu)"
make install

echo
echo "Built and installed to: $INSTALL_DIR"
echo "Try: $INSTALL_DIR/bin/dctool --help"
```

```bash
chmod +x spike/0b-desktop-harness/build-libdivecomputer.sh
```

- [ ] **Step 2: Run the build**

```bash
spike/0b-desktop-harness/build-libdivecomputer.sh
```

Expected: builds without error. The final line prints the install path. `dctool` is the example CLI shipped with libdivecomputer.

If `./configure` fails on a missing dep, fix the dep and re-run. Common failures: `pkg-config not found`, `autoconf macros missing`. Re-run Task B1.

- [ ] **Step 3: Verify dctool runs**

```bash
spike/0b-desktop-harness/build/install/bin/dctool --help
```

Expected: prints usage info including subcommands like `download`, `list`, `scan`.

- [ ] **Step 4: Add `build/` to spike gitignore**

Create `spike/0b-desktop-harness/.gitignore`:

```
build/
*.log
```

- [ ] **Step 5: Commit**

```bash
git add spike/0b-desktop-harness/build-libdivecomputer.sh spike/0b-desktop-harness/.gitignore
git commit -m "spike(B): script to build libdivecomputer on macOS"
```

---

### Task B3: Scan for the Peregrine over BLE

**Files:**
- Create: `spike/0b-desktop-harness/scan.sh`

- [ ] **Step 1: USER ACTION — wake the Peregrine**

Turn on your Peregrine. Put it in dive-computer-talks-to-app mode (this depends on the device — typically the Bluetooth menu). The watch should be advertising over BLE.

- [ ] **Step 2: Write a scan helper**

`spike/0b-desktop-harness/scan.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DCTOOL="$HARNESS_DIR/build/install/bin/dctool"

# Shearwater Peregrine identifies as a "shearwater petrel"-family device in libdivecomputer.
# Scan over BLE transport.
"$DCTOOL" --transport=ble scan
```

```bash
chmod +x spike/0b-desktop-harness/scan.sh
```

- [ ] **Step 3: Run the scan**

```bash
spike/0b-desktop-harness/scan.sh
```

Expected: prints one or more BLE devices including a line that looks like the Peregrine (name will be "Peregrine" or "Shearwater"). **Capture the BLE address shown** — you'll need it next.

If the scan finds nothing:
- Confirm the Peregrine is in BLE-pairing/visible mode (button sequence varies — check the manual).
- Confirm macOS has Bluetooth enabled and your terminal has Bluetooth access (System Settings → Privacy → Bluetooth → enable for Terminal/iTerm).
- Try `system_profiler SPBluetoothDataType` to confirm the OS sees BLE devices.

- [ ] **Step 4: Commit**

```bash
git add spike/0b-desktop-harness/scan.sh
git commit -m "spike(B): BLE scan helper for Peregrine"
```

---

### Task B4: Download a dive via libdivecomputer

**Files:**
- Create: `spike/0b-desktop-harness/download.sh`
- Create: `spike/0b-desktop-harness/sample-output/.gitkeep`

- [ ] **Step 1: Write the download helper**

`spike/0b-desktop-harness/download.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <ble-address>"
  echo "Example: $0 00:11:22:33:44:55"
  exit 1
fi

BLE_ADDR="$1"
HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DCTOOL="$HARNESS_DIR/build/install/bin/dctool"
OUT_DIR="$HARNESS_DIR/sample-output"
mkdir -p "$OUT_DIR"

# Family is the libdivecomputer "device family" name. Peregrine uses Shearwater Petrel-family protocol.
FAMILY="shearwater_petrel"

# Download all dives, write to a XML/raw bundle.
"$DCTOOL" \
  --transport=ble \
  --device="$BLE_ADDR" \
  --family="$FAMILY" \
  download \
  --output="$OUT_DIR/dump.xml" \
  --format=xml

echo
echo "Done. Output: $OUT_DIR/dump.xml"
```

```bash
chmod +x spike/0b-desktop-harness/download.sh
mkdir -p spike/0b-desktop-harness/sample-output
touch spike/0b-desktop-harness/sample-output/.gitkeep
```

- [ ] **Step 2: Run the download against your Peregrine**

```bash
# Replace <addr> with the BLE address from Task B3.
spike/0b-desktop-harness/download.sh <addr>
```

Expected: dctool connects, prints progress per dive, writes `dump.xml` to `sample-output/`. Time depends on dive count — small batches finish in seconds.

If `--family=shearwater_petrel` is wrong, dctool's error will list valid families. Use `dctool --help-family` (or check libdivecomputer docs) and rerun. The Peregrine's family in libdivecomputer's source has historically been part of the Petrel/Predator/Perdix grouping; verify against current source if needed.

If BLE pairing fails, try unpairing the device from Shearwater Cloud first — only one app can hold an active BLE connection at a time.

- [ ] **Step 3: Inspect the output**

```bash
head -40 spike/0b-desktop-harness/sample-output/dump.xml
wc -l spike/0b-desktop-harness/sample-output/dump.xml
```

Expected: XML containing one or more `<dive>` blocks with `<sample>` waypoints. This is libdivecomputer's normalized output — DIFFERENT from UDDF.

- [ ] **Step 4: Add to gitignore (likely contains personal data)**

Add `sample-output/` to `spike/0b-desktop-harness/.gitignore`:

```
build/
sample-output/
*.log
```

- [ ] **Step 5: Commit**

```bash
git add spike/0b-desktop-harness/download.sh spike/0b-desktop-harness/.gitignore
git commit -m "spike(B): dctool BLE download helper"
```

---

### Task B5: Document Phase B findings

**Files:**
- Create: `spike/0b-desktop-harness/findings.md`

- [ ] **Step 1: Write `findings.md` with what you actually saw**

Use this template, fill in real observations:

```markdown
# Phase B findings — libdivecomputer + BLE on macOS

## Build
- libdivecomputer commit/version built: [git rev]
- Build issues hit: [none / list]
- Time to first build: [hh:mm]

## BLE scan
- Peregrine found: [yes/no]
- Advertised name: [e.g., "Peregrine-A8F2"]
- Stable BLE address across power cycles: [yes/no]

## Download
- Family used: [shearwater_petrel / other]
- Time to download N dives: [N=X, T=Y seconds]
- Reliability: [first-try success / required retries]
- Errors hit and resolution: [list]

## libdivecomputer output (XML) sample fields
For each `<sample>`:
- time: [yes/no, units]
- depth: [yes/no, units]
- temperature: [yes/no]
- ndl: [yes/no]
- tts (time-to-surface): [yes/no]
- gradient_factor: [yes/no]
- ceiling: [yes/no — needed for palier_deco_manque]
- deco event / required-stop event: [yes/no — CRITICAL]
- ascent_rate event: [yes/no]
- gas / tank: [yes/no, expected no for Peregrine without AI]

## Spec impact (compared to Phase A findings)
- libdivecomputer XML provides MORE/LESS than UDDF: [explain]
- Recommended source-of-truth for Plan 1 schema: [UDDF / libdivecomputer XML / hybrid]
- `palier_deco_manque` rule feasibility: [confirmed / blocked / partial]

## Risks for Phase C / Plan 3
- [list any concerns about porting this to iOS native module]
```

- [ ] **Step 2: Commit**

```bash
git add spike/0b-desktop-harness/findings.md
git commit -m "spike(B): document libdivecomputer + BLE findings"
```

---

## Phase C (revised) — Pure Swift CoreBluetooth BLE spike (5–7 days, C2 time-boxed at 4 days)

> **Why revised:** Phase B confirmed libdivecomputer's BLE transport is BlueZ-only. The original Phase C mixed three concerns — RN scaffolding, libdc-iOS cross-compile, and BLE — and would have spent most of its time on the engineering pieces (already-known costs) instead of the actual unknown (the Peregrine wire protocol over CoreBluetooth). Revised Phase C focuses laser-narrow on the BLE protocol question. RN bridging and Android port are deferred to production Plan 3 as known-cost engineering.

Goal: produce a pure Swift CLI tool or single-screen iOS app that connects to a Shearwater Peregrine over CoreBluetooth, runs the Shearwater BLE wire protocol, downloads one dive's raw bytes, and saves them to a file. We then verify those bytes parse identically to the bytes extracted from the SQLite export in Phase A.

### Task C1: Research Peregrine BLE wire protocol from libdc source

**Files:**
- Create: `spike/0c-ble-protocol/protocol-cheatsheet.md`

This task is a literature review — read libdivecomputer's Shearwater driver source and Subsurface's CoreBluetooth wrapper (license: GPL — read-only for understanding, do not copy verbatim) and produce a cheatsheet a Swift implementer can follow.

- [ ] **Step 1: Read the Shearwater driver in libdc source**

```bash
ls /Users/mzmmoazam/Documents/Projects/diveForge/spike/0b-desktop-harness/build/libdivecomputer/src/shearwater_*
```

Read every `shearwater_*.c` and `shearwater_*.h` file. Note especially:
- The wire protocol byte sequences (request/response framing)
- The dive-list and dive-download command bytes
- How the driver reads/writes a generic byte stream (this is what we'll reproduce on top of CoreBluetooth)

- [ ] **Step 2: Cross-reference Subsurface's CoreBluetooth code (read-only)**

Look at Subsurface's `core/qt-ble.cpp` (and adjacent files) on github.com/subsurface/subsurface for:
- The GATT service UUID and characteristic UUIDs Shearwater devices advertise
- MTU / packet-fragmentation patterns
- Connection lifecycle (notifications, write-without-response vs write-with-response)

**Do NOT copy code — Subsurface is GPL.** Paraphrase patterns into the cheatsheet and cite the file:line as a reference for someone with rights to look up the original.

- [ ] **Step 3: Produce the cheatsheet**

Write `spike/0c-ble-protocol/protocol-cheatsheet.md` covering:
- GATT layer (service UUID, characteristic UUIDs, MTU, properties)
- Wire protocol over the BLE byte stream (handshake, dive-list, dive-download, end-of-transmission)
- File:line citations into libdc source for each operation
- A list of open questions / risks
- A 3–7-step ordered next-actions list for the C2 Swift implementer

- [ ] **Step 4: Commit**

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge
git add spike/0c-ble-protocol/protocol-cheatsheet.md
git commit -m "spike(C1): Peregrine BLE protocol research cheatsheet"
```

### Task C2: USER ACTION — Pure Swift CoreBluetooth iOS app (time-boxed 4 days)

**Files:**
- Create: `spike/0c-ble-protocol/PeregrineBLE/` (new Xcode iOS project)

This is intentionally NOT React Native. RN bridging is deferred to production Plan 3. The spike is about proving the BLE protocol works over CoreBluetooth on iOS. Once that's proven, wrapping a working Swift implementation in a TurboModule is mechanical.

- [ ] **Step 1: USER ACTION — Create a new Xcode project**

In Xcode: File → New → Project → iOS → App → name `PeregrineBLE`, language Swift, interface SwiftUI. Save it under `spike/0c-ble-protocol/PeregrineBLE/`.

Configure target:
- Capabilities → Bluetooth — enable.
- Info.plist → add `NSBluetoothAlwaysUsageDescription` = "DiveForge spike: read your dive computer over Bluetooth".
- Deployment target: iOS 14.0 (matches what we'll use in production).
- Signing: your personal Apple ID team for development signing.

- [ ] **Step 2: USER ACTION — Implement scan + connect**

Following the cheatsheet from C1, implement a `PeregrineClient` Swift class that:
1. Owns a `CBCentralManager` and conforms to `CBCentralManagerDelegate`.
2. Scans for peripherals advertising the Shearwater service UUID.
3. On discovery, connects to the first matching peripheral.
4. Discovers the Shearwater service and characteristics.
5. Subscribes to notifications on the read characteristic.
6. Exposes `func sendBytes(_ data: Data)` that writes to the write characteristic, and a delegate / closure / async stream that surfaces incoming notification bytes.

Single-screen SwiftUI test harness:
- "Scan" button → starts scanning
- Status label: scanning / connected to <name>
- Log view: incoming bytes hex-dumped

USER ACTION: turn on Peregrine, ensure NOT connected to Shearwater Cloud (only one BLE master at a time), tap Scan, verify connection.

- [ ] **Step 3: USER ACTION — Implement the wire protocol**

Add a method `func downloadOneDive(diveNumber: Int) async throws -> Data` that, on top of the byte-level transport from Step 2, executes the Shearwater wire protocol from C1's cheatsheet:
1. Send connection-handshake bytes per cheatsheet
2. Send dive-list query, receive list
3. Send dive-download request for the selected dive number
4. Accumulate response bytes until end-of-transmission marker
5. Return the assembled `Data` blob

Add a "Download dive #5" button to the test harness. Save the result to the iOS Documents directory and surface its size on screen.

USER ACTION: tap Scan → connect → tap Download → confirm a multi-KB blob appears.

- [ ] **Step 4: USER ACTION — Export the blob to your Mac**

Use Files app (or the Xcode device window) to copy the saved blob from the iPhone to your Mac. Place it at `/tmp/dive-blobs/c2-downloaded.bin`.

- [ ] **Step 5: Time-box / fallback decision**

If by end of day 4 you do not have a non-empty blob saved out of the test harness, **stop coding** and document what blocks you in `spike/0c-ble-protocol/findings.md` (Task C4). At that point we fall back to **DB-import as v1 ingestion** and revisit BLE for v1.5. **The spike has done its job either way** — we either know BLE works, or know exactly what blocks it.

### Task C3: Verify downloaded bytes parse identically to DB-extracted bytes

**Files:**
- Create: `spike/0c-ble-protocol/verify.sh`

- [ ] **Step 1: Write the verifier**

`spike/0c-ble-protocol/verify.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
DCTOOL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/0b-desktop-harness/build/install/bin/dctool"
INPUT="${1:-/tmp/dive-blobs/c2-downloaded.bin}"
OUT="$(dirname "$INPUT")/c2-parsed.xml"
"$DCTOOL" -d "Shearwater Peregrine" parse -u metric -o "$OUT" "$INPUT"
echo "Parsed: $OUT ($(wc -c < "$OUT") bytes)"
echo "Compare against the corresponding DB-extracted dive at:"
echo "  /Users/mzmmoazam/Documents/Projects/diveForge/spike/0a-uddf-inspection/parsed/dive-<N>.xml"
```

```bash
chmod +x spike/0c-ble-protocol/verify.sh
```

- [ ] **Step 2: Run the verifier on the C2 output**

```bash
spike/0c-ble-protocol/verify.sh /tmp/dive-blobs/c2-downloaded.bin
```

Expected: `dctool` parses successfully (exit 0, non-empty XML).

- [ ] **Step 3: Diff against DB-extracted equivalent**

Find the same dive number in `spike/0a-uddf-inspection/parsed/dive-<N>.xml` (whichever dive you picked in C2) and diff:

```bash
diff /tmp/dive-blobs/c2-parsed.xml spike/0a-uddf-inspection/parsed/dive-<N>.xml | head -40
```

Expected: zero diff, or only differences in fields we know vary between transports (datetime parsing differences, header bookkeeping). Sample data should match exactly.

If the diff shows real differences in samples (different depth values, different sample count), that is a finding — capture it in C4. The most likely cause is incorrect framing in C2.

- [ ] **Step 4: Commit**

```bash
git add spike/0c-ble-protocol/verify.sh
git commit -m "spike(C3): byte-level verifier comparing BLE-downloaded vs DB-extracted"
```

### Task C4: Document Phase C findings

**Files:**
- Create: `spike/0c-ble-protocol/findings.md`

- [ ] **Step 1: Write `findings.md`**

Use this template, fill in real observations:

```markdown
# Phase C findings — Peregrine BLE on CoreBluetooth (pure Swift)

## Outcome
[ONE of: "Working — BLE→bytes→libdc-parse→XML proven on iPhone with real Peregrine" / "Partial — connection works but X" / "Blocked — specific reason"]

## Time spent
- C1 (research): [hours]
- C2 (Swift implementation): [days]
- C3 (verify): [hours]

## What works
- [list what's confirmed working]

## What didn't work / surprises
- [list]

## GATT layer (confirmed values from C2)
- Service UUID:
- Characteristic UUIDs (write/read/notify):
- MTU:
- Notes on framing / packet sizes:

## Wire protocol (confirmed sequences)
- Connection handshake: [bytes / status]
- Dive-list: [bytes / status]
- Dive-download for one dive: [bytes / status]
- End-of-transmission detection: [how]

## Diff vs DB-extracted parsing
- Identical samples: [yes/no]
- Field differences: [list any]
- Conclusion: BLE-downloaded bytes are parser-equivalent to DB-extracted bytes: [yes/no/partial]

## Recommendation for Plan 3 (BLE in production RN app)
- Wrap C2's Swift class as a TurboModule: [estimated effort]
- Android port: [estimated effort, key risks]
- Robustness items still needed in production: [pairing UX, retry/backoff, partial-download recovery, …]

## If outcome is Blocked
- Specific blocker(s): [list]
- What was tried: [list]
- Recommended fallback: [DB-import in v1, defer BLE — or specific path forward]
```

- [ ] **Step 2: Commit**

```bash
git add spike/0c-ble-protocol/findings.md
git commit -m "spike(C): document pure-Swift CoreBluetooth findings"
```

---
## Phase D — Final findings + spec amendments (1 hour)

### Task D1: Write the consolidated findings report

**Files:**
- Create: `spike/findings.md`

- [ ] **Step 1: Write the master findings doc**

`spike/findings.md`:

```markdown
# DiveForge spike — final findings

Spike duration: [start date] → [end date]
Total time spent: [days]

## TL;DR
[3 bullets: was it feasible? biggest surprise? recommendation for Plans 1–3?]

## Phase A summary
[1-paragraph distillation, link to spike/0a-uddf-inspection/findings.md]

## Phase B summary
[1-paragraph distillation, link to spike/0b-desktop-harness/findings.md]

## Phase C summary
[1-paragraph distillation, link to spike/0c-rn-spike/findings.md]

## Recommended changes to spec (docs/superpowers/specs/2026-05-09-diveforge-v1-design.md)

### Schema changes
- [list each Dive/DiveSample field to add/remove/rename, with reason]

### Rule changes
- `palier_deco_manque`: [keep / drop / modify — with evidence]
- Other rules: [any threshold tweaks based on real sample data]

### Architecture changes
- Native module path: [PATH 1 / PATH 2 / hybrid]
- Any changes to data flow diagram: [yes/no]

## Recommended changes to plan structure
- Plan 1 ready to write: [yes / blocked on X]
- Plan 2 ready to write: [yes / blocked on X]
- Plan 3 estimated effort: [days, given what we now know]

## Open questions remaining
- [things we still don't know after spike, and how to resolve them in plans]
```

- [ ] **Step 2: Commit**

```bash
git add spike/findings.md
git commit -m "spike: consolidated findings + spec amendment recommendations"
```

---

### Task D2: Apply spec amendments

**Files:**
- Modify: `docs/superpowers/specs/2026-05-09-diveforge-v1-design.md`

- [ ] **Step 1: Update the spec based on `spike/findings.md`**

Open the spec. For each "recommended change" in the findings doc:
- Edit the relevant section.
- Add a brief footnote or commit-message reference: "Updated based on spike findings (commit X)."

If a rule is dropped, also remove it from the rule table and from the "Out of scope" if applicable, and update any text that referenced it.

If the data model changes, update both the Prisma block in section 3 AND any references elsewhere in the spec.

- [ ] **Step 2: Commit the spec update separately so the change is auditable**

```bash
git add docs/superpowers/specs/2026-05-09-diveforge-v1-design.md
git commit -m "spec: amend v1 design based on spike findings"
```

- [ ] **Step 3: Spike complete — handoff**

At this point, you (or whoever) write Plan 1 (Foundation + Scoring) against the AMENDED spec, then Plan 2, then Plan 3. The spike code in `spike/` can be archived (move to `archive/spike/`), kept for reference, or deleted — your call.

---

## Self-review checklist (run when plan is done)

- [ ] Every step has actual content (no "TBD", "implement later", "similar to above")
- [ ] All file paths are exact and absolute-from-repo-root
- [ ] All commands include expected output
- [ ] Each phase ends with a findings doc + commit
- [ ] User-action steps (export from Shearwater Cloud, Xcode UI manipulations) are flagged as USER ACTION
- [ ] Failure paths have a "if X then Y" branch in the step text
- [ ] Phase C5 has a 2-day time-box and an explicit "stop and document" exit clause
