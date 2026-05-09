# Plan 0 — DiveForge BLE/libdivecomputer Feasibility Spike

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the data path from Shearwater Peregrine → BLE → libdivecomputer → parsed JSON works end-to-end on at least one mobile platform, and document the actual dive data schema, before committing to production schemas in Plans 1–3.

**Architecture:** Three independent phases run in sequence. Phase A inspects existing UDDF exports to lock the data schema cheaply. Phase B builds libdivecomputer on macOS and confirms BLE talks to the Peregrine via the reference C tool. Phase C wraps that pipeline as a minimal React Native TurboModule on iOS to prove the production path is viable.

**Tech Stack:** Node 20 + TypeScript (Phase A), libdivecomputer + Homebrew toolchain (Phase B), React Native bare workflow + Swift + iOS toolchain (Phase C).

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

## Phase C — RN TurboModule spike on iOS (3–4 days)

Goal: prove that the same pipeline works inside a React Native bare app on a real iPhone.

### Task C1: Create the bare RN sandbox app

**Files:**
- Create: `spike/0c-rn-spike/` (new RN project)

- [ ] **Step 1: Generate a bare RN project**

```bash
cd spike
npx @react-native-community/cli init RNSpike --skip-install
```

(If the CLI complains about being deprecated, follow the prompt to use the current init command. The exact CLI evolves; goal is a bare RN project, NOT Expo managed.)

- [ ] **Step 2: Rename to lowercase folder for consistency**

```bash
mv RNSpike 0c-rn-spike
cd 0c-rn-spike
npm install
cd ios && pod install && cd ..
cd ../..   # back to repo root
```

- [ ] **Step 3: Verify it runs**

```bash
cd spike/0c-rn-spike
npx react-native run-ios
```

Expected: simulator launches and shows the default RN welcome screen.

If pod install fails on a fresh Mac, install Xcode + CommandLineTools and retry.

- [ ] **Step 4: Add a sane gitignore (the RN init usually generates one — verify)**

```bash
cat spike/0c-rn-spike/.gitignore | head -20
```

Confirm `node_modules/`, `ios/Pods/`, `ios/build/`, `android/build/` are listed.

- [ ] **Step 5: Commit the scaffold**

```bash
cd ../..
git add spike/0c-rn-spike/
git commit -m "spike(C): scaffold bare RN sandbox app"
```

---

### Task C2: Cross-compile libdivecomputer for iOS

**Files:**
- Create: `spike/0c-rn-spike/scripts/build-libdc-ios.sh`

This is the trickiest task. libdivecomputer is C with autoconf — we need to build it for iOS arm64 (device) and produce a static library.

- [ ] **Step 1: Write the iOS build script**

`spike/0c-rn-spike/scripts/build-libdc-ios.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Build libdivecomputer as a static library for iOS arm64 (physical device).
# Simulator support comes later if needed — physical-device-only is enough for spike.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$RN_DIR/native/libdc-build"
SRC_DIR="$BUILD_DIR/src"
INSTALL_DIR="$BUILD_DIR/ios-arm64"

mkdir -p "$BUILD_DIR"

if [[ ! -d "$SRC_DIR" ]]; then
  git clone https://github.com/libdivecomputer/libdivecomputer.git "$SRC_DIR"
fi
cd "$SRC_DIR"
autoreconf --install

SDK_PATH="$(xcrun --sdk iphoneos --show-sdk-path)"
HOST="aarch64-apple-darwin"
ARCH="arm64"
MIN_IOS="14.0"

export CC="$(xcrun --sdk iphoneos -f clang)"
export CFLAGS="-arch $ARCH -isysroot $SDK_PATH -miphoneos-version-min=$MIN_IOS -fembed-bitcode"
export LDFLAGS="-arch $ARCH -isysroot $SDK_PATH -miphoneos-version-min=$MIN_IOS"

./configure \
  --host=$HOST \
  --prefix="$INSTALL_DIR" \
  --disable-shared \
  --enable-static \
  --disable-examples

make clean || true
make -j"$(sysctl -n hw.ncpu)"
make install

echo
echo "Static lib at: $INSTALL_DIR/lib/libdivecomputer.a"
echo "Headers at:    $INSTALL_DIR/include/"
```

```bash
mkdir -p spike/0c-rn-spike/scripts
chmod +x spike/0c-rn-spike/scripts/build-libdc-ios.sh
```

- [ ] **Step 2: Run the build**

```bash
spike/0c-rn-spike/scripts/build-libdc-ios.sh
```

Expected: produces `libdivecomputer.a` and headers under `spike/0c-rn-spike/native/libdc-build/ios-arm64/`. Time: 2–5 min.

If the build fails on a missing system dep (libxml2 isn't required, but Bluetooth integration might be — read the error), one of two things has happened:
- libdivecomputer's BLE backend has Mac/iOS-specific code that needs explicit enable flags. Check `./configure --help` for transport options. If BLE on iOS isn't supported by libdivecomputer's mainline, this is a **major spike finding** to document — it would mean we need to do the BLE transport in Swift and feed bytes into libdivecomputer's parsing layer instead of using libdivecomputer's BLE transport.
- Missing CoreBluetooth integration. Same finding.

**If the build succeeds but libdivecomputer's BLE transport doesn't actually open BLE connections on iOS, that is the single most important spike finding.** Document it loudly in `findings.md`.

- [ ] **Step 3: Add `native/libdc-build/` to gitignore**

`spike/0c-rn-spike/.gitignore` — add a line:

```
native/libdc-build/
```

- [ ] **Step 4: Commit the script**

```bash
git add spike/0c-rn-spike/scripts/build-libdc-ios.sh spike/0c-rn-spike/.gitignore
git commit -m "spike(C): build libdivecomputer static lib for iOS arm64"
```

---

### Task C3: Add a Swift native module to the RN app

**Files:**
- Create: `spike/0c-rn-spike/ios/DiveComputer.swift`
- Create: `spike/0c-rn-spike/ios/DiveComputer.m`
- Modify: `spike/0c-rn-spike/ios/RNSpike.xcodeproj` (via Xcode — manual steps)

This task adds a minimal Objective-C++/Swift bridge exposing one method: `downloadOneDive(bleAddress) → JSON string`. We lean on libdivecomputer for parsing; if BLE-transport-on-iOS is a problem (Phase C2 finding), we wire CoreBluetooth in Swift and pass raw bytes to libdivecomputer's parser.

- [ ] **Step 1: Open Xcode**

```bash
open spike/0c-rn-spike/ios/RNSpike.xcworkspace
```

- [ ] **Step 2: USER ACTION in Xcode — link the static lib**

In Xcode:
1. Select the `RNSpike` target → "Build Phases" → "Link Binary With Libraries" → `+` → "Add Other..." → "Add Files..." → navigate to `native/libdc-build/ios-arm64/lib/libdivecomputer.a` → Add.
2. "Build Settings" → "Header Search Paths" → add: `$(SRCROOT)/../native/libdc-build/ios-arm64/include` (recursive: NO).
3. "Build Settings" → search "Other Linker Flags" → add: `-lc++` (libdivecomputer C, but RN uses C++; this avoids link errors).
4. Capabilities → Bluetooth — enable it. Add `Privacy - Bluetooth Always Usage Description` to `Info.plist`: "DiveForge spike: read your dive computer over Bluetooth".

- [ ] **Step 3: Create `DiveComputer.swift`**

In Xcode, File → New → File → Swift File → name `DiveComputer.swift`. Xcode will offer to create a bridging header — accept. Then write:

```swift
import Foundation

@objc(DiveComputer)
class DiveComputer: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool { return false }

  @objc
  func downloadOneDive(_ bleAddress: NSString,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
    // Phase C scope: prove the pipeline. Two possible paths depending on Phase C2 findings:
    //
    // PATH 1: libdivecomputer's BLE transport works on iOS.
    //   Call into libdivecomputer C API: dc_context_new, dc_descriptor for shearwater_petrel,
    //   dc_iostream_open with BLE transport, dc_device_open, iterate dives, parse, return JSON.
    //
    // PATH 2: We do BLE in Swift via CoreBluetooth, feed bytes into libdivecomputer's parser only.
    //   Implement CBCentralManager, scan/connect/discover services/characteristics,
    //   accumulate raw payload, call libdivecomputer's parsing-only API to decode.
    //
    // For the spike, write whichever is unblocked by C2's findings. Stub out and return a fixed
    // JSON if neither is working yet — at minimum verify the JS bridge round-trips.

    let stub = """
    { "spike_status": "bridge_alive",
      "ble_address_received": "\(bleAddress)",
      "next_step": "wire libdivecomputer C calls or CoreBluetooth here" }
    """
    resolve(stub)
  }
}
```

- [ ] **Step 4: Create `DiveComputer.m` (Objective-C bridge for RN)**

In Xcode, File → New → File → Objective-C File → name `DiveComputer.m`. Decline header. Write:

```objc
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(DiveComputer, NSObject)

RCT_EXTERN_METHOD(downloadOneDive:(NSString *)bleAddress
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
```

- [ ] **Step 5: Build the Xcode project**

In Xcode: Product → Build. Expected: builds clean. If there are linker errors about missing symbols from libdivecomputer, double-check the static lib was added in step 2.

- [ ] **Step 6: Commit**

```bash
git add spike/0c-rn-spike/ios/DiveComputer.swift spike/0c-rn-spike/ios/DiveComputer.m spike/0c-rn-spike/ios/RNSpike.xcodeproj/project.pbxproj
git commit -m "spike(C): minimal Swift+ObjC native module skeleton"
```

---

### Task C4: Call the native module from JS and show JSON

**Files:**
- Modify: `spike/0c-rn-spike/App.tsx`

- [ ] **Step 1: Replace `App.tsx` with a minimal scan/download UI**

```tsx
import React, { useState } from "react";
import { NativeModules, SafeAreaView, ScrollView, Text, TextInput, View, Pressable, StyleSheet } from "react-native";

const { DiveComputer } = NativeModules;

export default function App() {
  const [addr, setAddr] = useState("");
  const [output, setOutput] = useState("Press download to call native module.");

  const onDownload = async () => {
    try {
      const json = await DiveComputer.downloadOneDive(addr);
      setOutput(json);
    } catch (e: any) {
      setOutput(`ERROR: ${e?.message ?? String(e)}`);
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <Text style={s.title}>DiveForge spike — RN bridge</Text>
      <TextInput
        style={s.input}
        placeholder="BLE address (paste from Phase B)"
        value={addr}
        onChangeText={setAddr}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable style={s.button} onPress={onDownload}>
        <Text style={s.buttonText}>downloadOneDive</Text>
      </Pressable>
      <ScrollView style={s.output}>
        <Text style={s.mono}>{output}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#ccc", padding: 8, borderRadius: 6 },
  button: { backgroundColor: "#2563eb", padding: 12, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "white", fontWeight: "600" },
  output: { flex: 1, borderWidth: 1, borderColor: "#eee", padding: 8, borderRadius: 6 },
  mono: { fontFamily: "Menlo", fontSize: 11 },
});
```

- [ ] **Step 2: Run on physical iPhone**

```bash
cd spike/0c-rn-spike
npx react-native run-ios --device
```

(If the CLI doesn't auto-detect your phone, follow the printed instructions to run from Xcode with your phone selected as the target.)

Expected: app launches on phone, shows the title + input + button.

- [ ] **Step 3: Tap the button and observe**

Tap "downloadOneDive". The output area should show the stub JSON from Task C3 step 3:

```json
{ "spike_status": "bridge_alive", "ble_address_received": "...", "next_step": "wire libdivecomputer C calls or CoreBluetooth here" }
```

This is the bridge-roundtrip checkpoint. **If you see this, the JS↔native plumbing works** — only the libdivecomputer C wiring remains.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add spike/0c-rn-spike/App.tsx
git commit -m "spike(C): minimal UI calls native bridge"
```

---

### Task C5: Wire libdivecomputer (or CoreBluetooth) into the native module

**Files:**
- Modify: `spike/0c-rn-spike/ios/DiveComputer.swift`
- Possibly create: `spike/0c-rn-spike/ios/LibDC.h` (umbrella header)

This is the open-ended part. Concrete instructions depend entirely on Phase B/C2 findings.

- [ ] **Step 1: Choose path based on Phase C2 finding**

Read `spike/0c-rn-spike/native/libdc-build/...` build log + your Phase B notes. Pick:
- **PATH 1 (libdivecomputer BLE on iOS works):** call libdivecomputer's `dc_context_new`, `dc_descriptor_*`, `dc_iostream_open` with BLE transport, `dc_device_open`, `dc_device_foreach`. Convert results to JSON.
- **PATH 2 (libdivecomputer BLE on iOS doesn't work, but parsing does):** implement `CBCentralManager` flow in Swift to scan, connect, discover Shearwater services, read characteristic data, accumulate the dive payload. Then call libdivecomputer's parser-only API (`dc_parser_new_from_data` or similar) to decode the bytes.

- [ ] **Step 2: Create the umbrella header for libdivecomputer**

`spike/0c-rn-spike/ios/LibDC.h`:

```c
#ifndef LibDC_h
#define LibDC_h
#include <libdivecomputer/context.h>
#include <libdivecomputer/descriptor.h>
#include <libdivecomputer/iostream.h>
#include <libdivecomputer/device.h>
#include <libdivecomputer/parser.h>
#endif
```

In Xcode: add this file to the bridging header (`RNSpike-Bridging-Header.h`):

```c
#import "LibDC.h"
```

- [ ] **Step 3: Implement the chosen path in `DiveComputer.swift`**

The minimum success criterion: **`downloadOneDive` returns a JSON string with at least one dive's depth profile from your Peregrine.**

**PATH 1 skeleton (libdivecomputer BLE on iOS).** Replace the stub body with this scaffold; fill in the iteration callback to collect samples:

```swift
import Foundation

@objc(DiveComputer)
class DiveComputer: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc
  func downloadOneDive(_ bleAddress: NSString,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
    var ctx: OpaquePointer? = nil
    var desc: OpaquePointer? = nil
    var io: OpaquePointer? = nil
    var dev: OpaquePointer? = nil
    defer {
      if dev != nil  { dc_device_close(dev) }
      if io  != nil  { dc_iostream_close(io) }
      if desc != nil { dc_descriptor_free(desc) }
      if ctx != nil  { dc_context_free(ctx) }
    }

    guard dc_context_new(&ctx) == DC_STATUS_SUCCESS else {
      reject("ctx_new", "dc_context_new failed", nil); return
    }

    // Look up the Shearwater Petrel-family descriptor (Peregrine reuses this protocol).
    var iter: OpaquePointer? = nil
    guard dc_descriptor_iterator_new(&iter, ctx) == DC_STATUS_SUCCESS else {
      reject("desc_iter", "iterator failed", nil); return
    }
    while dc_iterator_next(iter, &desc) == DC_STATUS_SUCCESS {
      let name = String(cString: dc_descriptor_get_product(desc))
      if name.lowercased().contains("peregrine") || name.lowercased().contains("petrel") { break }
      dc_descriptor_free(desc); desc = nil
    }
    dc_iterator_free(iter)
    guard desc != nil else { reject("no_desc", "no Shearwater descriptor", nil); return }

    // Open BLE iostream. If this returns DC_STATUS_UNSUPPORTED on iOS, abort to PATH 2.
    let addr = String(bleAddress)
    let openStatus = dc_iostream_open(&io, ctx, desc, addr, DC_TRANSPORT_BLE)
    guard openStatus == DC_STATUS_SUCCESS else {
      reject("ble_open", "dc_iostream_open BLE returned \(openStatus). If UNSUPPORTED, switch to PATH 2.", nil); return
    }

    guard dc_device_open(&dev, ctx, desc, io) == DC_STATUS_SUCCESS else {
      reject("dev_open", "dc_device_open failed", nil); return
    }

    // Collect dives. Use foreach with a context pointer holding a Swift array.
    final class Collector { var dives: [[String: Any]] = [] }
    let collector = Collector()
    let collectorPtr = Unmanaged.passUnretained(collector).toOpaque()

    let cb: dc_dive_callback_t = { (data, size, fingerprint, fsize, userdata) -> Int32 in
      guard let userdata = userdata else { return 0 }
      let collector = Unmanaged<Collector>.fromOpaque(userdata).takeUnretainedValue()
      // Parse the dive: dc_parser_new + dc_parser_set_data + dc_parser_get_field +
      // dc_parser_samples_foreach. Push each dive's metadata + samples to collector.dives.
      // (See dctool/output_xml.c in libdivecomputer source for a worked example.)
      collector.dives.append(["sample_bytes": Int(size)])  // placeholder until parser is wired
      return 1
    }

    let foreachStatus = dc_device_foreach(dev, cb, collectorPtr)
    guard foreachStatus == DC_STATUS_SUCCESS else {
      reject("foreach", "dc_device_foreach failed", nil); return
    }

    let jsonData = try? JSONSerialization.data(withJSONObject: ["dives": collector.dives])
    let jsonStr = jsonData.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    resolve(jsonStr)
  }
}
```

This compiles and connects. The callback body (`cb`) is where you actually parse samples — use libdivecomputer's `dc_parser_*` API. The reference is `dctool/output_xml.c` in the libdivecomputer source you cloned in Phase B; copy its sample-iteration loop and translate XML emission to dictionary append.

**PATH 2 skeleton (CoreBluetooth + libdivecomputer parser).** If `dc_iostream_open` with `DC_TRANSPORT_BLE` returns `DC_STATUS_UNSUPPORTED`, scrap the PATH 1 code and instead:
1. Implement `CBCentralManager` in Swift to scan, connect to the BLE address, discover Shearwater services and characteristics, accumulate raw bytes from the dive-data characteristic.
2. Once you have the byte buffer, call libdivecomputer's parser API: `dc_parser_new_from_data(&parser, ctx, desc, bytes, len)`, then iterate samples with `dc_parser_samples_foreach`.

**Time-box this task: 2 days max.** If you cannot get a real dive flowing through by then, document the exact blocker in findings and STOP. The spike has done its job — it has surfaced the obstacle.

- [ ] **Step 4: Run on phone with Peregrine nearby**

USER ACTION: turn on Peregrine, ensure not connected to Shearwater Cloud (only one BLE master).

```bash
cd spike/0c-rn-spike
npx react-native run-ios --device
```

In the app: paste BLE address (from Phase B), tap downloadOneDive.

Expected: JSON containing samples from a real dive in your phone screen's output box. Save the JSON to a file in `sample-output/` (gitignored).

- [ ] **Step 5: Commit**

```bash
git add spike/0c-rn-spike/ios/DiveComputer.swift spike/0c-rn-spike/ios/LibDC.h spike/0c-rn-spike/ios/RNSpike-Bridging-Header.h
git commit -m "spike(C): real libdivecomputer integration in native module"
```

---

### Task C6: Document Phase C findings

**Files:**
- Create: `spike/0c-rn-spike/findings.md`

- [ ] **Step 1: Write `findings.md` with what worked, what didn't, time spent**

```markdown
# Phase C findings — RN TurboModule + iOS

## Build chain
- iOS arm64 static libdivecomputer build: [success / failure + reason]
- Xcode integration friction: [list]
- BLE permission flow: [smooth / issues]

## Native module
- Path taken: [PATH 1 (libdc BLE on iOS) / PATH 2 (CoreBluetooth + libdc parser)]
- Reason: [why this path]
- Lines of native code written: [approx N]

## End-to-end test
- Real dive successfully downloaded to phone: [yes / no]
- JSON sample committed: [path or "not committed (PII)"]
- Time per dive download: [seconds]
- Reliability: [first-try / required X retries]

## Spec / Plan 3 implications
- Recommended approach for Plan 3: [PATH 1 / PATH 2 / unsolved]
- Estimated production effort beyond this spike: [days]
- Android risk: [low / medium / high — why]
- Any spec changes needed: [list]

## Blockers (if any)
- [list anything you couldn't resolve in the time-box]
```

- [ ] **Step 2: Commit**

```bash
cd ../..
git add spike/0c-rn-spike/findings.md
git commit -m "spike(C): document RN+iOS native module findings"
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
