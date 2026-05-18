# M1 — Native rename + parseShearwaterModel + getDeviceInfo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-19
**Status:** Ready for execution.
**Spec:** `docs/superpowers/specs/2026-05-18-phase-a-beta-ship-design.md` (Multi-device architecture section).

**Goal:** Reshape the BLE-facing surface area for multi-device readiness — rename `PeregrineBLEManager` to `ShearwaterPetrelManager`, add a shared `parseShearwaterModel` parser + verification-tier helper to `@divechef/shared`, and expose a new `getDeviceInfo()` native method that returns `{ scanName, serial, firmwareVersion }` so the upcoming registration flow can identify the connected device before `listDives()` runs.

**Architecture:** The protocol code (LRE+XOR, manifest, RDBI/WDBI, block download) is identical across the Shearwater Petrel family — the rename is honest labeling, not new logic. The shared parser lives in TypeScript so iOS, Android, and the JS bridge agree on a single prefix table. `getDeviceInfo()` performs its own RDBI handshake (serial + firmware) so the registration flow doesn't depend on `listDives()` having run.

**Tech Stack:** Swift (XCTest), Kotlin (JUnit 4), TypeScript (Vitest in `@divechef/shared`, Jest in `apps/mobile`). No new dependencies.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `packages/shared/src/shearwaterModel.ts` | **Create** | `ShearwaterModel` union, `parseShearwaterModel`, `verificationTier`. |
| `packages/shared/src/__tests__/shearwaterModel.test.ts` | **Create** | Vitest coverage for parser + tier helper. |
| `packages/shared/src/index.ts` | **Modify** | Re-export the new module. |
| `apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift` | **Rename → `ShearwaterPetrelManager.swift`** | Class rename + `getDeviceInfo()`. |
| `apps/mobile/ios/DiveComputer/DiveComputerModule.swift` | **Modify** | Use the renamed class; expose `getDeviceInfo` to the bridge. |
| `apps/mobile/ios/DiveChef.xcodeproj/project.pbxproj` | **Modify** | File reference rename (handled by `xcodeproj` Ruby gem or by hand). |
| `apps/mobile/android/app/src/main/java/com/divechef/ble/PeregrineBleManager.kt` | **Rename → `ShearwaterPetrelManager.kt`** | Class rename + `getDeviceInfo()`. |
| `apps/mobile/android/app/src/main/java/com/divechef/ble/DiveComputerModule.kt` | **Modify** | Use the renamed class; expose `getDeviceInfo` to the React bridge. |
| `apps/mobile/src/native/DiveComputer.ts` | **Modify** | Add `DeviceInfo` type and `getDeviceInfo()` to the interface. |
| `apps/mobile/src/native/DiveComputer.mock.ts` | **Modify** | Implement `getDeviceInfo` returning fixture data. |

---

## Task 1: Add `shearwaterModel.ts` to `@divechef/shared`

Pure-TS, no native, no consumers yet. Lands first because other tasks reference its types.

**Files:**

- Create: `packages/shared/src/shearwaterModel.ts`
- Create: `packages/shared/src/__tests__/shearwaterModel.test.ts`
- Modify: `packages/shared/src/index.ts`

### Step 1: Write the failing test file

Create `packages/shared/src/__tests__/shearwaterModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  parseShearwaterModel,
  verificationTier,
  type ShearwaterModel,
} from '../shearwaterModel.js';

describe('parseShearwaterModel', () => {
  it.each([
    ['Peregrine', 'peregrine'],
    ['Peregrine TX', 'peregrine'],
    ['Perdix 2', 'perdix-2'],
    ['Perdix AI', 'perdix-ai'],
    ['Perdix', 'perdix'],
    ['Petrel 3', 'petrel-3'],
    ['Petrel 2', 'petrel-2'],
    ['Teric', 'teric'],
    ['NERD 2', 'nerd-2'],
    ['Nerd 2', 'nerd-2'],
    ['Tern', 'tern'],
    ['Tern TX', 'tern'],
  ])('parses %s → %s', (input, expected) => {
    expect(parseShearwaterModel(input)).toBe(expected);
  });

  it('matches longer prefixes before shorter (Perdix 2 not Perdix)', () => {
    expect(parseShearwaterModel('Perdix 2')).toBe('perdix-2');
    expect(parseShearwaterModel('Perdix AI')).toBe('perdix-ai');
    expect(parseShearwaterModel('Petrel 3')).toBe('petrel-3');
  });

  it('returns null for unparseable names', () => {
    expect(parseShearwaterModel('')).toBeNull();
    expect(parseShearwaterModel(null)).toBeNull();
    expect(parseShearwaterModel('Garmin Descent')).toBeNull();
    expect(parseShearwaterModel('Pe regrine')).toBeNull();
    expect(parseShearwaterModel('PEREGRINE-1234')).toBeNull();
    expect(parseShearwaterModel('Some random Bluetooth speaker')).toBeNull();
  });

  it('never returns unknown-shearwater (parser-only models)', () => {
    // unknown-shearwater is a user-driven label, not a parser output.
    const samples = ['', 'unknown', 'Unknown Shearwater', 'foobar'];
    for (const s of samples) {
      const result = parseShearwaterModel(s);
      expect(result).not.toBe('unknown-shearwater');
    }
  });
});

describe('verificationTier', () => {
  it('puts peregrine in verified', () => {
    expect(verificationTier('peregrine')).toBe('verified');
  });

  it.each<ShearwaterModel>(['perdix', 'perdix-ai', 'perdix-2', 'petrel-2', 'petrel-3', 'teric', 'nerd-2', 'tern'])(
    'puts %s in compatible',
    (model) => {
      expect(verificationTier(model)).toBe('compatible');
    }
  );

  it('puts unknown-shearwater in experimental', () => {
    expect(verificationTier('unknown-shearwater')).toBe('experimental');
  });

  it('is total — every model maps to a tier', () => {
    const all: ShearwaterModel[] = [
      'peregrine', 'perdix', 'perdix-ai', 'perdix-2',
      'petrel-2', 'petrel-3', 'teric', 'nerd-2', 'tern',
      'unknown-shearwater',
    ];
    for (const m of all) {
      const tier = verificationTier(m);
      expect(['verified', 'compatible', 'experimental']).toContain(tier);
    }
  });
});
```

### Step 2: Run the test, confirm it fails

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/packages/shared && pnpm test 2>&1 | tail -10
```

Expected: failure — module `../shearwaterModel.js` does not exist.

### Step 3: Implement the module

Create `packages/shared/src/shearwaterModel.ts`:

```ts
/**
 * Shearwater Petrel-family model identification.
 *
 * Source of truth for what counts as a "known model name" across the iOS,
 * Android, and JS layers. Used during the add-a-device flow to cross-check
 * the user's picked model against the BLE-advertised GAP name.
 *
 * Authoritative references:
 *  - libdivecomputer src/descriptor.c (transport flags per model)
 *  - Subsurface core/qt-ble.cpp:177 (single shared service UUID for the family)
 */

export type ShearwaterModel =
  | 'peregrine'
  | 'perdix'
  | 'perdix-ai'
  | 'perdix-2'
  | 'petrel-2'
  | 'petrel-3'
  | 'teric'
  | 'nerd-2'
  | 'tern'
  | 'unknown-shearwater';

export type ShearwaterVerificationTier = 'verified' | 'compatible' | 'experimental';

/** Parser-eligible models (everything except the user-driven `unknown-shearwater`). */
type ParseableModel = Exclude<ShearwaterModel, 'unknown-shearwater'>;

/**
 * Prefix table — longest match first. The parser walks this in order so
 * "Perdix 2" matches before "Perdix" and "Petrel 3" before "Petrel".
 *
 * Each entry: [advertised-name prefix, model id]. Comparison is
 * case-insensitive and trims surrounding whitespace.
 */
const PREFIX_TABLE: ReadonlyArray<readonly [string, ParseableModel]> = [
  ['Peregrine TX', 'peregrine'],
  ['Peregrine', 'peregrine'],
  ['Perdix 2', 'perdix-2'],
  ['Perdix AI', 'perdix-ai'],
  ['Perdix', 'perdix'],
  ['Petrel 3', 'petrel-3'],
  ['Petrel 2', 'petrel-2'],
  ['Teric', 'teric'],
  ['NERD 2', 'nerd-2'],
  ['Nerd 2', 'nerd-2'],
  ['Tern TX', 'tern'],
  ['Tern', 'tern'],
];

/**
 * Returns the parsed model for an advertised BLE GAP name, or null if the
 * name doesn't match any known prefix. Never returns 'unknown-shearwater' —
 * that's a user-driven label, not a parser output.
 */
export function parseShearwaterModel(advertisedName: string | null | undefined): ParseableModel | null {
  if (!advertisedName) return null;
  const trimmed = advertisedName.trim();
  if (!trimmed) return null;

  // Case-insensitive prefix match. We require the prefix to be the start of
  // the name; tolerate trailing chars (firmware appends serial: "Peregrine 1234").
  const upper = trimmed.toUpperCase();
  for (const [prefix, model] of PREFIX_TABLE) {
    if (upper.startsWith(prefix.toUpperCase())) {
      return model;
    }
  }
  return null;
}

/**
 * Returns the verification tier for a model. Total — every ShearwaterModel
 * maps to exactly one tier.
 */
export function verificationTier(model: ShearwaterModel): ShearwaterVerificationTier {
  if (model === 'peregrine') return 'verified';
  if (model === 'unknown-shearwater') return 'experimental';
  return 'compatible';
}
```

### Step 4: Run the test, confirm it passes

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/packages/shared && pnpm test 2>&1 | tail -10
```

Expected: all tests pass.

### Step 5: Re-export from `packages/shared/src/index.ts`

Open `packages/shared/src/index.ts` and append a new export line. Current content:

```ts
export * from "./types.js";
export { scoreDive, SCORING_VERSION } from "./scoring/index.js";
export type { DiveInput, DiveSampleInput, ScoreResult, RuleResult, Rule } from "./scoring/index.js";
```

Append:

```ts
export {
  parseShearwaterModel,
  verificationTier,
} from "./shearwaterModel.js";
export type {
  ShearwaterModel,
  ShearwaterVerificationTier,
} from "./shearwaterModel.js";
```

### Step 6: Build the package so consumers can import

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/packages/shared && pnpm build 2>&1 | tail -5
```

Expected: clean tsc output (no errors).

### Step 7: Commit

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge
git add packages/shared/src/shearwaterModel.ts \
        packages/shared/src/__tests__/shearwaterModel.test.ts \
        packages/shared/src/index.ts \
        packages/shared/dist/
git commit -m "feat(shared): add parseShearwaterModel + verificationTier

Phase A multi-device foundation. Single source of truth for what
counts as a 'known model name' across iOS, Android, and JS layers.
Used by the add-a-device flow to cross-check user-picked model
against BLE-advertised GAP name.

Prefix table covers the documented Petrel-family per libdc/Subsurface
research: Peregrine, Perdix (AI/2), Petrel 2/3, Teric, Nerd 2, Tern.
Returns null for unparseable names — never 'unknown-shearwater'
(that's a user-driven label, not parser output).

verificationTier maps every ShearwaterModel to one of:
  - verified (peregrine)
  - compatible (perdix family, petrel 2/3, teric, nerd 2, tern)
  - experimental (unknown-shearwater)

Total: ~25 unit tests covering parse table, longest-match-first
ordering, garbled inputs, and tier exhaustiveness."
```

---

## Task 2: Rename iOS `PeregrineBLEManager` → `ShearwaterPetrelManager`

Mechanical class rename. The protocol code in `PeregrineProtocol.swift` (the `Peregrine` enum, all the protocol primitives) stays as-is — only the BLE manager class is renamed. 86 protocol unit tests must remain green.

**Files:**

- Rename: `apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift` → `apps/mobile/ios/DiveComputer/ShearwaterPetrelManager.swift`
- Modify: `apps/mobile/ios/DiveComputer/DiveComputerModule.swift` (one identifier reference)
- Modify: `apps/mobile/ios/DiveChef.xcodeproj/project.pbxproj` (file reference path)

### Step 1: Rename the file (preserves git history)

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge
git mv apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift \
       apps/mobile/ios/DiveComputer/ShearwaterPetrelManager.swift
```

### Step 2: Rename the class inside the file

In `apps/mobile/ios/DiveComputer/ShearwaterPetrelManager.swift`, change:

```swift
final class PeregrineBLEManager: NSObject {
```

To:

```swift
final class ShearwaterPetrelManager: NSObject {
```

Update the file's top-of-file doc comment to reflect the broader scope. Find the existing block comment (around lines 1-7):

```swift
// PeregrineBLEManager.swift
// DiveChef — Production BLE layer for Shearwater Peregrine dive computers.
//
// Adapted from spike/0c-ble-protocol/swift-sources/PeregrineClient.swift.
// Removes SwiftUI/Combine dependencies, logging, auto-connect behavior.
// Adds callback-based event delivery, thread-safety via serial DispatchQueue,
// and connect-by-identifier for React Native bridge integration.
```

Replace with:

```swift
// ShearwaterPetrelManager.swift
// DiveChef — Production BLE layer for the Shearwater Petrel-family dive computers.
//
// All BLE-capable Shearwater watches in the Petrel family (Peregrine,
// Perdix/AI/2, Petrel 2/3, Teric, Nerd 2, Tern) advertise on the same
// service UUID and speak the same protocol per libdivecomputer's
// shearwater_petrel.c. This class implements that one protocol; model
// disambiguation happens in the JS layer via parseShearwaterModel
// against the BLE-advertised GAP name.
//
// Adapted from spike/0c-ble-protocol/swift-sources/PeregrineClient.swift.
// Removes SwiftUI/Combine dependencies, logging, auto-connect behavior.
// Adds callback-based event delivery, thread-safety via serial DispatchQueue,
// and connect-by-identifier for React Native bridge integration.
```

Inside the class body there's also a string literal worth updating at the top of `startScan` (around the existing `Peregrine peripherals` doc-comment):

```swift
/// Start scanning for Peregrine peripherals. Discovered peripherals are reported via onDiscovered.
```

Change to:

```swift
/// Start scanning for Shearwater Petrel-family peripherals. Discovered peripherals are reported via onDiscovered.
```

### Step 3: Update `DiveComputerModule.swift`

Find the lazy initializer (around lines 17-18):

```swift
private lazy var manager: PeregrineBLEManager = {
    let m = PeregrineBLEManager()
```

Replace both occurrences with `ShearwaterPetrelManager`:

```swift
private lazy var manager: ShearwaterPetrelManager = {
    let m = ShearwaterPetrelManager()
```

### Step 4: Update the Xcode project file references

Run a one-shot Ruby edit to fix the file reference in `project.pbxproj` (the rename is handled by `git mv` for the working tree but Xcode's project file still lists `PeregrineBLEManager.swift`):

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile/ios
ruby -e '
require "xcodeproj"
proj = Xcodeproj::Project.open("DiveChef.xcodeproj")
proj.files.each do |f|
  if f.path && f.path.end_with?("PeregrineBLEManager.swift")
    f.path = f.path.sub("PeregrineBLEManager.swift", "ShearwaterPetrelManager.swift")
    f.name = "ShearwaterPetrelManager.swift" if f.name && f.name.end_with?("PeregrineBLEManager.swift")
  end
end
proj.save
puts "pbxproj updated"
'
```

Expected: `pbxproj updated`. If Ruby's `xcodeproj` gem is missing, install via `gem install xcodeproj`.

### Step 5: Build and run the iOS test suite

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile/ios
xcodebuild test \
  -workspace DiveChef.xcworkspace -scheme DiveChef \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:DiveChefTests 2>&1 | grep -E "Executed|TEST " | tail -3
```

Expected: `Executed 86 tests, with 0 failures` and `** TEST SUCCEEDED **`.

### Step 6: Commit

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge
git add apps/mobile/ios/DiveComputer/ShearwaterPetrelManager.swift \
        apps/mobile/ios/DiveComputer/DiveComputerModule.swift \
        apps/mobile/ios/DiveChef.xcodeproj/project.pbxproj
# Note: the rename was done with `git mv` so the source file is already staged
# under both the old (deleted) and new (added) paths.
git commit -m "refactor(ios): rename PeregrineBLEManager → ShearwaterPetrelManager

Mechanical rename for honest labeling. The protocol code in
PeregrineProtocol.swift handles the entire Shearwater Petrel family
per libdivecomputer's shearwater_petrel.c; the BLE manager class
should reflect that scope, not just the one model we happen to test
against today.

86 iOS protocol tests stay green — the rename is class-name only,
no logic changes.

Phase A M1, step 1 of getting the codebase ready for multi-device
registration."
```

---

## Task 3: Rename Android `PeregrineBleManager` → `ShearwaterPetrelManager`

Same operation, Android side. Independent of Task 2's iOS work — could run in a separate worktree in parallel.

**Files:**

- Rename: `apps/mobile/android/app/src/main/java/com/divechef/ble/PeregrineBleManager.kt` → `apps/mobile/android/app/src/main/java/com/divechef/ble/ShearwaterPetrelManager.kt`
- Modify: `apps/mobile/android/app/src/main/java/com/divechef/ble/DiveComputerModule.kt` (any references)

### Step 1: Rename the file

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge
git mv apps/mobile/android/app/src/main/java/com/divechef/ble/PeregrineBleManager.kt \
       apps/mobile/android/app/src/main/java/com/divechef/ble/ShearwaterPetrelManager.kt
```

### Step 2: Rename the class inside the file

In `apps/mobile/android/app/src/main/java/com/divechef/ble/ShearwaterPetrelManager.kt`, change:

```kotlin
class PeregrineBleManager(private val context: Context) {
```

To:

```kotlin
class ShearwaterPetrelManager(private val context: Context) {
```

Update the doc comment block at the top of the class to mirror the iOS version. Replace any `Peregrine` references in KDoc with `Shearwater Petrel-family`.

### Step 3: Update `DiveComputerModule.kt`

Find every reference to `PeregrineBleManager` and replace with `ShearwaterPetrelManager`. Verify by:

```bash
grep -n "PeregrineBleManager" apps/mobile/android/app/src/main/java/com/divechef/ble/*.kt
```

Expected after fix: no matches.

### Step 4: Build + run the Android test suite

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile/android && \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
./gradlew :app:testDebugUnitTest 2>&1 | tail -5
```

Expected: `BUILD SUCCESSFUL`, all tests passing.

### Step 5: Commit

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge
git add apps/mobile/android/app/src/main/java/com/divechef/ble/ShearwaterPetrelManager.kt \
        apps/mobile/android/app/src/main/java/com/divechef/ble/DiveComputerModule.kt
git commit -m "refactor(android): rename PeregrineBleManager → ShearwaterPetrelManager

Mirrors the iOS rename. The protocol code in protocol/ already handles
the entire Shearwater Petrel family — the BLE manager class name now
matches.

Android JUnit suite stays green."
```

---

## Task 4: Add `getDeviceInfo()` native method on iOS

Adds a method to `ShearwaterPetrelManager` that performs an RDBI handshake (serial + firmware) and returns device-identifying facts to the JS layer. Must work after `connect()` and before `listDives()` so the registration flow can identify the device for `POST /api/devices`.

**Files:**

- Modify: `apps/mobile/ios/DiveComputer/ShearwaterPetrelManager.swift`
- Modify: `apps/mobile/ios/DiveComputer/DiveComputerModule.swift`

### Step 1: Add `getDeviceInfo()` to `ShearwaterPetrelManager`

In `ShearwaterPetrelManager.swift`, find the `// MARK: - Public actions (Layer 3)` section (around line 187 — just before `listDives()`). Insert a new public method directly before `listDives()`:

```swift
/// Returns identifying facts about the connected device. Reads serial +
/// firmware via RDBI; the scan name is the BLE GAP name observed during
/// scan. Used by the add-a-device flow to cross-check the user-picked
/// model and to register the device with the backend.
///
/// Must be called after a successful `connect()` and before any other
/// Layer-3 method (the RDBI handshake doubles as a connectivity probe).
func getDeviceInfo() async throws -> (scanName: String?, serial: String, firmwareVersion: String?) {
    guard isReady else { throw PeregrineProtocolError.notConnected }

    // Scan name comes from the connected peripheral; nil if iOS doesn't
    // expose it (e.g. some restored connection paths).
    let scanName = peripheral?.name

    // Serial as hex string of the raw bytes — stable across firmware
    // formatting differences. Backend stores the hex form.
    let serialBytes = try await rdbi(id: Peregrine.ID_SERIAL)
    let serial = serialBytes.map { String(format: "%02x", $0) }.joined()

    // Firmware as ASCII; trim trailing whitespace/nulls if any.
    let firmwareBytes = try await rdbi(id: Peregrine.ID_FIRMWARE)
    let firmwareVersion = String(data: firmwareBytes, encoding: .ascii)?
        .trimmingCharacters(in: .whitespacesAndNewlines)
    self.firmwareVersion = firmwareVersion  // cache; listDives also reads but that's fine

    return (scanName: scanName, serial: serial, firmwareVersion: firmwareVersion)
}
```

### Step 2: Expose `getDeviceInfo` to the React Native bridge

In `DiveComputerModule.swift`, add a new bridge method alongside the existing `connect`/`listDives`/`downloadDive` (around line 60-90, follow the existing pattern):

```swift
@objc func getDeviceInfo(_ resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
    Task {
        do {
            let info = try await manager.getDeviceInfo()
            resolve([
                "scanName": info.scanName as Any,
                "serial": info.serial,
                "firmwareVersion": info.firmwareVersion as Any,
            ])
        } catch {
            reject("DEVICE_INFO_ERROR", error.localizedDescription, error)
        }
    }
}
```

Then expose it via the `RCT_EXTERN_METHOD` macro in `DiveComputerModule.m` (or the bridging header that registers methods — find the file that declares `connect:resolve:reject:` for the existing pattern). Add:

```objc
RCT_EXTERN_METHOD(getDeviceInfo:(RCTPromiseResolveBlock)resolve
                          reject:(RCTPromiseRejectBlock)reject)
```

### Step 3: Build and verify the bridge compiles

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile/ios
xcodebuild build \
  -workspace DiveChef.xcworkspace -scheme DiveChef \
  -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -3
```

Expected: `** BUILD SUCCEEDED **`.

### Step 4: Re-run the iOS test suite

```bash
xcodebuild test \
  -workspace /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile/ios/DiveChef.xcworkspace \
  -scheme DiveChef \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:DiveChefTests 2>&1 | grep -E "Executed|TEST " | tail -3
```

Expected: 86 tests still green. (The new `getDeviceInfo` is integration-tested on real hardware in P1, not unit-tested here.)

### Step 5: Commit

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge
git add apps/mobile/ios/DiveComputer/ShearwaterPetrelManager.swift \
        apps/mobile/ios/DiveComputer/DiveComputerModule.swift \
        apps/mobile/ios/DiveComputer/DiveComputerModule.m
git commit -m "feat(ios): add getDeviceInfo native method

Returns { scanName, serial (hex), firmwareVersion } after a successful
connect, performing an RDBI handshake on ID_SERIAL + ID_FIRMWARE. Used
by the upcoming add-a-device flow to identify the connected device
before listDives runs (registration via POST /api/devices needs the
serial).

Serial is the hex-encoded raw bytes — stable across firmware
formatting differences; backend stores the hex form. Firmware is
ASCII trimmed.

86 protocol tests still green; integration verification on real
hardware happens in P1."
```

---

## Task 5: Add `getDeviceInfo()` native method on Android

Mirrors Task 4 for Android. Independent of the iOS work in Tasks 2/4.

**Files:**

- Modify: `apps/mobile/android/app/src/main/java/com/divechef/ble/ShearwaterPetrelManager.kt`
- Modify: `apps/mobile/android/app/src/main/java/com/divechef/ble/DiveComputerModule.kt`

### Step 1: Add `getDeviceInfo()` to `ShearwaterPetrelManager`

In `ShearwaterPetrelManager.kt`, find the `listDives` function (around line 314). Insert a new public function directly before it:

```kotlin
/**
 * Returns identifying facts about the connected device. Reads serial +
 * firmware via RDBI; the scan name comes from the GATT peripheral. Used
 * by the add-a-device flow to cross-check the user-picked model and to
 * register the device with the backend.
 *
 * Must be called after a successful connect() and before any other
 * Layer-3 method.
 */
data class DeviceInfo(
    val scanName: String?,
    val serial: String,
    val firmwareVersion: String?,
)

suspend fun getDeviceInfo(): DeviceInfo {
    if (!isConnected()) throw PeregrineProtocolException.NotConnected()

    val scanName = bluetoothGatt?.device?.name

    val serialBytes = rdbi(Peregrine.ID_SERIAL)
    val serial = serialBytes.joinToString("") { "%02x".format(it.toInt() and 0xFF) }

    val firmwareBytes = rdbi(Peregrine.ID_FIRMWARE)
    val firmwareVersion = String(firmwareBytes).trim(' ', ' ', '\n', '\r')
    this.firmwareVersion = firmwareVersion

    return DeviceInfo(scanName, serial, firmwareVersion)
}
```

### Step 2: Expose `getDeviceInfo` to the React Native bridge

In `DiveComputerModule.kt`, add a new `@ReactMethod`-annotated function alongside the existing bridge methods (follow the existing `listDives`/`downloadDive` pattern):

```kotlin
@ReactMethod
fun getDeviceInfo(promise: Promise) {
    moduleScope.launch {
        try {
            val info = manager.getDeviceInfo()
            val result = Arguments.createMap().apply {
                putString("scanName", info.scanName)
                putString("serial", info.serial)
                putString("firmwareVersion", info.firmwareVersion)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DEVICE_INFO_ERROR", e.message, e)
        }
    }
}
```

### Step 3: Build + verify

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile/android && \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
./gradlew :app:compileDebugKotlin 2>&1 | tail -5
```

Expected: `BUILD SUCCESSFUL`.

### Step 4: Run the Android test suite

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile/android && \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
./gradlew :app:testDebugUnitTest 2>&1 | tail -5
```

Expected: all tests pass.

### Step 5: Commit

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge
git add apps/mobile/android/app/src/main/java/com/divechef/ble/ShearwaterPetrelManager.kt \
        apps/mobile/android/app/src/main/java/com/divechef/ble/DiveComputerModule.kt
git commit -m "feat(android): add getDeviceInfo native method

Mirrors the iOS getDeviceInfo. Returns DeviceInfo(scanName, serial,
firmwareVersion) after connect, performing the same RDBI handshake.
JS bridge exposes it via the standard @ReactMethod + Promise pattern.

Android tests remain green."
```

---

## Task 6: Update `DiveComputer.ts` interface + mock

Wire up the JS-facing TypeScript contract so `useSync` and the upcoming add-a-device flow can call `getDeviceInfo()`. The mock implements it with fixture data so non-native dev/test stays unblocked.

**Files:**

- Modify: `apps/mobile/src/native/DiveComputer.ts`
- Modify: `apps/mobile/src/native/DiveComputer.mock.ts`

### Step 1: Add the `DeviceInfo` type and method to the interface

Open `apps/mobile/src/native/DiveComputer.ts`. Replace the file with:

```ts
export type ScanResult = { name: string; identifier: string; rssi: number };
export type ManifestEntry = { index: number; address: number; fingerprintHex: string; firmwareVersion?: string };
export type DownloadProgress = { bytesReceived: number; bytesExpected: number | null };

export type DeviceInfo = {
  /** BLE-advertised GAP name from the peripheral; null if unavailable. */
  scanName: string | null;
  /** Hex-encoded serial bytes from RDBI ID_SERIAL. Stable; used as the
   *  device's primary key in user_devices on the backend. */
  serial: string;
  /** ASCII firmware version string from RDBI ID_FIRMWARE; null if not
   *  decodable. */
  firmwareVersion: string | null;
};

export interface DiveComputerModule {
  startScan(serviceUuid: string): Promise<void>;
  stopScan(): Promise<void>;
  connect(identifier: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;
  getDeviceInfo(): Promise<DeviceInfo>;
  listDives(): Promise<ManifestEntry[]>;
  downloadDive(index: number): Promise<{ rawBytes: string }>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}
```

### Step 2: Implement `getDeviceInfo` in the mock

Open `apps/mobile/src/native/DiveComputer.mock.ts`. Find the `MockDiveComputerModule` class (around line 21). Add a new method alongside the existing `listDives`/`downloadDive`:

```ts
async getDeviceInfo(): Promise<DeviceInfo> {
  if (!this.connected) throw new Error('Not connected');
  return {
    scanName: 'Peregrine-MOCK',
    serial: 'mock0001a1b2c3d4',
    firmwareVersion: 'MOCK-1.0',
  };
}
```

Also import the new `DeviceInfo` type at the top of the file. Find the existing import line (whatever imports `ManifestEntry`, `ScanResult`, etc.) and add `DeviceInfo`:

```ts
import type { DeviceInfo, ManifestEntry, ScanResult, DownloadProgress } from './DiveComputer';
```

(Use the actual existing import path — match the file's existing convention.)

### Step 3: Verify TypeScript compiles

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile && pnpm typecheck 2>&1 | tail -5
```

Expected: clean. If the mock's existing imports differ from the suggested form, adapt — the goal is just that `DeviceInfo` is in scope for the new method.

### Step 4: Run the JS test suite (regression check — useSync etc. still pass)

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge/apps/mobile && pnpm test 2>&1 | tail -10
```

Expected: all 29 tests still pass. (No new test added here — `getDeviceInfo` is exercised via the mock from `useSync` consumers added in P1.)

### Step 5: Commit

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge
git add apps/mobile/src/native/DiveComputer.ts \
        apps/mobile/src/native/DiveComputer.mock.ts
git commit -m "feat(mobile): add getDeviceInfo to DiveComputerModule contract

Adds DeviceInfo type and getDeviceInfo() method to the TS interface,
implements it in the mock with fixture data ('Peregrine-MOCK' /
'mock0001a1b2c3d4' / 'MOCK-1.0').

Wires up the surface area the add-a-device flow (P1) will call after
connect + before listDives. typecheck clean; existing 29 JS tests
remain green.

M1 complete — multi-device foundation surface ready. M2 (local DB
device_serial migration) and M3 (backend user_devices) build on
this."
```

---

## Self-Review

**1. Spec coverage:**

The spec's "Multi-device architecture" section calls for:

- ✅ Rename `PeregrineBLEManager` → `ShearwaterPetrelManager` on both platforms — Tasks 2, 3.
- ✅ Service UUID stays a single constant — no change needed (already a single constant per platform).
- ✅ `getDeviceInfo()` returns `{ scanName, serial, firmwareVersion }` — Tasks 4, 5.
- ✅ Shared `parseShearwaterModel` + `verificationTier` in `packages/shared/` — Task 1.
- ✅ `ShearwaterModel` type union including `unknown-shearwater` — Task 1.
- ✅ Test coverage for parser + tier helper — Task 1, Step 1.

What's NOT in M1 (correctly deferred):

- The cross-check dialog UI lives in P1.
- The backend `user_devices` table lives in M3.
- The local DB `device_serial` migration lives in M2.
- The Profile inventory UI lives in P1.

**2. Placeholder scan:**

No "TBD"/"implement later"/"similar to Task N". Each step shows actual code or exact commands. The pbxproj manipulation is a real Ruby snippet; the bridge method declarations show actual macros. The mock's fixture data is concrete.

**3. Type consistency:**

- `DeviceInfo` shape is identical across native (Swift / Kotlin), JS interface, and mock: `{ scanName: string | null, serial: string, firmwareVersion: string | null }`. ✓
- `ShearwaterModel` union, `ParseableModel` exclusion, and the prefix table use the same casing throughout. ✓
- The native `getDeviceInfo` signatures are async/throws on iOS and `suspend` on Android — both surface as `Promise<DeviceInfo>` to JS. ✓

---

## Execution notes

- Tasks 1–6 must run sequentially within a single worktree because Tasks 4/5 depend on Tasks 2/3 having renamed the class. Task 1 (shared parser) is technically independent and could land first in a separate worktree, but it's small enough that bundling into one M1 worktree is simpler.
- All 6 tasks together are ~1 day of work; they're a single coherent unit ("M1") and merge back to main as one branch.
- After M1 lands, M2 (local DB device_serial migration) and M3 (backend user_devices) become the next parallel pair — both consume `DeviceInfo` semantics from M1.
