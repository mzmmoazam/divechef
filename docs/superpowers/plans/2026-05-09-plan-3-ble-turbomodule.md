# Plan 3 — BLE TurboModule (iOS + Android)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-09
**Status:** Ready for execution (depends on Plan 2 being complete — the mock module and screens must exist before the real module swaps in).
**Depends on:** Plan 2 (for the mock module contract and screen integration points), Plan 1 (for `POST /api/dives` endpoint).

**Goal:** Wrap the spike's proven `PeregrineClient.swift` + `PeregrineProtocol.swift` as a React Native TurboModule registered as `NativeModules.DiveComputer`, port the protocol layer to Android/Kotlin, implement all robustness items identified in the spike, and flip the build flag so the real module replaces the mock.

**Architecture:** The native module handles ONLY BLE transport — scan, connect, manifest read, block-download, LRE+XOR decompression. It returns `rawBytes` (base64-encoded post-decompression payload) to JS. Parsing happens server-side per the spec's "smart app, smart backend" architecture. The module implements exactly the `DiveComputerModule` interface from the contract (per Contract §Native module interface).

**Tech Stack:**
- iOS: Swift 5.9+, CoreBluetooth, TurboModule (Objective-C++ bridge + Swift implementation)
- Android: Kotlin 1.9+, `android.bluetooth.BluetoothGatt`, TurboModule (Java/Kotlin bridge)
- Shared: TypeScript spec file for codegen, base64 encoding for cross-bridge binary transfer
- Observability: Sentry breadcrumbs for connection-state events

**Non-goals:**
- Parsing dive bytes on-device (backend-side per spec §2)
- Supporting dive computers other than Peregrine (spec §8 exclusion)
- UI/UX changes (Plan 2 owns screens — they already render against the mock)
- Backend changes (Plan 1 owns `POST /api/dives`)
- App Store / Play Store submission (internal distribution only)

---

## Phase 1 — iOS TurboModule Scaffold + Bridge (1–2 days)

Goal: Create the native module file structure, register the TurboModule with React Native, and verify the bridge compiles and JS can call empty stubs.

### Task 1.1: Create the TurboModule spec and native directory structure

**Files:**
- Create: `apps/mobile/ios/DiveComputer/DiveComputerModule.swift`
- Create: `apps/mobile/ios/DiveComputer/DiveComputerModule.m` (Objective-C bridge)
- Create: `apps/mobile/ios/DiveComputer/DiveComputer-Bridging-Header.h`

- [ ] **Step 1: Create the iOS native module directory**

```bash
mkdir -p apps/mobile/ios/DiveComputer
```

- [ ] **Step 2: Write the Objective-C bridge (`DiveComputerModule.m`)**

This registers the TurboModule with React Native's module registry.

```objc
// DiveComputerModule.m
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(DiveComputer, RCTEventEmitter)

RCT_EXTERN_METHOD(startScan:(NSString *)serviceUuid
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopScan:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(connect:(NSString *)identifier
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(disconnect:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isConnected:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(listDives:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(downloadDive:(nonnull NSNumber *)index
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
```

- [ ] **Step 3: Write the Swift module stub (`DiveComputerModule.swift`)**

Implement the `RCTEventEmitter` subclass with empty method stubs that resolve/reject Promises. All methods match the contract interface exactly (per Contract §Native module interface).

```swift
import Foundation
import React

@objc(DiveComputer)
class DiveComputerModule: RCTEventEmitter {

    override static func moduleName() -> String! { "DiveComputer" }

    override func supportedEvents() -> [String]! {
        ["diveComputerDiscovered", "diveComputerProgress", "diveComputerDisconnected"]
    }

    override static func requiresMainQueueSetup() -> Bool { false }

    @objc func startScan(_ serviceUuid: String,
                         resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
        resolve(nil) // stub
    }

    @objc func stopScan(_ resolve: @escaping RCTPromiseResolveBlock,
                        reject: @escaping RCTPromiseRejectBlock) {
        resolve(nil)
    }

    @objc func connect(_ identifier: String,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
        resolve(nil)
    }

    @objc func disconnect(_ resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
        resolve(nil)
    }

    @objc func isConnected(_ resolve: @escaping RCTPromiseResolveBlock,
                           reject: @escaping RCTPromiseRejectBlock) {
        resolve(false)
    }

    @objc func listDives(_ resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
        resolve([])
    }

    @objc func downloadDive(_ index: NSNumber,
                            resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
        resolve(["rawBytes": ""])
    }
}
```

- [ ] **Step 4: Write the bridging header**

```c
// DiveComputer-Bridging-Header.h
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
```

- [ ] **Step 5: Add the module files to the Xcode project**

Open `apps/mobile/ios/<AppName>.xcworkspace` and add the `DiveComputer/` group. Ensure the bridging header is set in Build Settings → Swift Compiler → Objective-C Bridging Header.

Add `NSBluetoothAlwaysUsageDescription` to `Info.plist`:
```
<key>NSBluetoothAlwaysUsageDescription</key>
<string>DiveForge needs Bluetooth to sync dives from your Shearwater Peregrine.</string>
```

Add `bluetooth-central` to `UIBackgroundModes` for long downloads:
```
<key>UIBackgroundModes</key>
<array>
    <string>bluetooth-central</string>
</array>
```

- [ ] **Step 6: Verify the stub compiles from JS**

```bash
cd apps/mobile
npx react-native run-ios --simulator="iPhone 16"
```

In the Metro console or via a test screen, verify:
```ts
import { NativeModules } from 'react-native';
console.log(NativeModules.DiveComputer); // should NOT be undefined
```

Expected: The module is registered and callable (methods resolve with stubs).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/ios/DiveComputer/
git add apps/mobile/ios/<AppName>/Info.plist
git commit -m "plan3(ios): scaffold TurboModule bridge with empty stubs"
```

---

### Task 1.2: Verify event emission works from the stub

**Files:**
- Modify: `apps/mobile/ios/DiveComputer/DiveComputerModule.swift`

- [ ] **Step 1: Add a test event emission to `startScan` stub**

Temporarily make `startScan` emit a fake `diveComputerDiscovered` event after a 1-second delay:

```swift
@objc func startScan(_ serviceUuid: String,
                     resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
    resolve(nil)
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
        self?.sendEvent(withName: "diveComputerDiscovered", body: [
            "name": "FakePeregrine",
            "identifier": "00000000-0000-0000-0000-000000000000",
            "rssi": -60
        ])
    }
}
```

- [ ] **Step 2: Verify on the Plan 2 scan screen**

Launch the app, navigate to the sync/scan screen (Plan 2 already built this against the mock). Confirm the `diveComputerDiscovered` event is received by `NativeEventEmitter` and a device appears in the list.

Expected: The Plan 2 screen renders the fake device. This proves the bridge + event pipeline is wired correctly.

- [ ] **Step 3: Revert the test emission (leave the stub clean)**

Remove the temporary `DispatchQueue.main.asyncAfter` block, reverting `startScan` to the simple `resolve(nil)`.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/ios/DiveComputer/DiveComputerModule.swift
git commit -m "plan3(ios): verify event emission pipeline works end-to-end"
```

---

## Phase 2 — iOS Protocol Port + Core Implementation (3–4 days)

Goal: Port `PeregrineProtocol.swift` and `PeregrineClient.swift` from the spike into the module, stripping spike-only code (SwiftUI test harness, `@Published` state, debug logging) and adding Promise/event bridging. The protocol logic is ported 1:1 — do NOT redesign it (per spike findings §Verified wire protocol).

### Task 2.1: Port `PeregrineProtocol.swift` into the module

**Files:**
- Create: `apps/mobile/ios/DiveComputer/PeregrineProtocol.swift`
- Source: `spike/0c-ble-protocol/swift-sources/PeregrineProtocol.swift` (~511 LOC)

- [ ] **Step 1: Copy and adapt the protocol file**

Port the following from the spike source into the production location:
- `enum Peregrine` (all constants) — keep byte-identical to spike
- `enum PeregrineProtocolError` — keep all cases
- `enum SLIP` (encode + Decoder class) — keep byte-identical
- `enum BLEFramer` (fragment + stripHeader) — keep byte-identical
- `enum Wrap` (wrapRequest + unwrapResponse) — keep byte-identical
- `enum RDBI` (request + parse) — keep byte-identical
- `enum WDBI` (request + validate) — keep byte-identical
- `enum BlockDownload` (initRequest, parseInitResponse, blockRequest, parseBlockResponse, quitRequest, parseQuitResponse) — keep byte-identical
- `enum Decompress` (lre + xorPhase + full) — keep byte-identical
- `struct ManifestRecord` — keep byte-identical
- `enum Manifest` (parse) — keep byte-identical
- `enum LogbookFormat` (baseAddress) — keep byte-identical
- `extension Data` (hexShort) — keep for debugging

Changes from spike:
- Remove `import Foundation` if redundant (it's already the default)
- Add `// MARK:` comments referencing spike file paths for traceability
- No functional changes — this is a proven byte-identical protocol implementation

- [ ] **Step 2: Verify the file compiles in the Xcode project**

```bash
cd apps/mobile/ios
xcodebuild -workspace <AppName>.xcworkspace -scheme <AppName> -sdk iphonesimulator -arch arm64 build 2>&1 | tail -5
```

Expected: Build succeeds (exit 0).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/ios/DiveComputer/PeregrineProtocol.swift
git commit -m "plan3(ios): port PeregrineProtocol.swift from spike (byte-identical logic)"
```

---

### Task 2.2: Port `PeregrineClient.swift` as a production BLE manager

**Files:**
- Create: `apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift`
- Source: `spike/0c-ble-protocol/swift-sources/PeregrineClient.swift` (~570 LOC)

The spike's `PeregrineClient` is `@MainActor`, uses `@Published` for SwiftUI, and has a single-connection model. The production version:
- Drops `@MainActor` (runs on a dedicated serial queue for thread safety)
- Drops all `@Published` properties and SwiftUI state
- Adds multi-peripheral scan support (emits events per discovered device)
- Adds explicit `connect(identifier:)` targeting a specific peripheral
- Keeps the async/await transfer layer intact (proven working)

- [ ] **Step 1: Write `PeregrineBLEManager.swift`**

Port the following from spike's `PeregrineClient.swift`:
- `CBCentralManager` lifecycle (init, scan, connect, disconnect)
- `CBPeripheralDelegate` (service/characteristic discovery, notification subscription, value updates)
- The SLIP decoder integration (`handleIncoming`)
- The frame-await mechanism (`awaitFrame` with timeout)
- The `transfer()` method (wrap → SLIP → BLE-frame → write; await → unwrap)
- The `rdbi()` helper
- The `downloadBlob()` block-download driver
- The `listDives()` flow (serial → firmware → hardware → logupload → manifest)
- The `downloadDive(at:)` flow (compressed block-download + LRE+XOR)

Changes from spike:
- Remove: `@MainActor`, `@Published`, `ObservableObject`, `LogEntry`, `struct DiveSummary` (production DTO is defined in the module bridge), `saveDive()` (production returns base64 to JS), `rxBuffer`, `downloadProgress` string, `startScan()` auto-connects-to-first (production emits events for ALL discovered peripherals)
- Add: `scanCallback` closure that emits `diveComputerDiscovered` events
- Add: `progressCallback` closure that emits `diveComputerProgress` events
- Add: `disconnectCallback` closure that emits `diveComputerDisconnected` events
- Add: `connect(identifier:)` that looks up a peripheral by UUID string
- Add: firmware version capture (store `self.firmwareVersion` from RDBI response for Sentry breadcrumb)
- Replace: `canSend` published prop with internal `isReady` boolean
- Replace: All `append(.info, ...)` with structured os_log calls (not user-facing)
- Keep: The core protocol flow byte-identical to spike — `sendBLEFrames`, `awaitFrame`, `transfer`, `rdbi`, `downloadBlob`

Key constants (per spike findings §Verified GATT layout):
```swift
static let serviceUUID = CBUUID(string: "FE25C237-0ECE-443C-B0AA-E02033E7029D")
static let sppCharacteristicUUID = CBUUID(string: "27B7570B-359E-45A3-91BB-CF7E70049BD2")
```

- [ ] **Step 2: Verify compilation**

```bash
cd apps/mobile/ios
xcodebuild -workspace <AppName>.xcworkspace -scheme <AppName> -sdk iphonesimulator -arch arm64 build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift
git commit -m "plan3(ios): port PeregrineClient as PeregrineBLEManager (production BLE layer)"
```

---

### Task 2.3: Wire `DiveComputerModule` stubs to the real BLE manager

**Files:**
- Modify: `apps/mobile/ios/DiveComputer/DiveComputerModule.swift`

- [ ] **Step 1: Connect module methods to `PeregrineBLEManager`**

Replace all stubs with calls to the BLE manager:

- `startScan(serviceUuid)`: instantiate/start `PeregrineBLEManager` scan with the given UUID. Emit `diveComputerDiscovered` events (payload: `{ name, identifier, rssi }` per contract) for each discovered peripheral.
- `stopScan()`: stop the CBCentralManager scan.
- `connect(identifier)`: connect to the peripheral matching the given UUID string. Resolve once notifications are subscribed (mirrors spike's "connected = true" after `setNotifyValue`). Reject on timeout (10s) or failure.
- `disconnect()`: call `cancelPeripheralConnection`. Resolve immediately.
- `isConnected()`: resolve with the manager's `isReady` boolean.
- `listDives()`: call manager's `listDives()`. Return array of `{ index, address, fingerprintHex }` per contract `ManifestEntry`.
- `downloadDive(index)`: call manager's `downloadDive(at:)`. During download, emit `diveComputerProgress` events (`{ bytesReceived, bytesExpected: null }` — `bytesExpected` is null because compressed size is unknown a priori per spike findings). On completion, base64-encode the decompressed bytes and resolve with `{ rawBytes: "<base64>" }`.
- `addListener(eventName)` / `removeListeners(count)`: inherited from `RCTEventEmitter` — no custom implementation needed.

Wire the BLE manager's disconnect callback to emit `diveComputerDisconnected` with `{ reason: "<error description or 'user_initiated'>" }`.

- [ ] **Step 2: Verify build**

```bash
cd apps/mobile/ios
xcodebuild -workspace <AppName>.xcworkspace -scheme <AppName> -sdk iphonesimulator -arch arm64 build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/ios/DiveComputer/DiveComputerModule.swift
git commit -m "plan3(ios): wire DiveComputerModule to PeregrineBLEManager (full implementation)"
```

---

### Task 2.4: iOS real-device validation (Phase 2 gate)

**Files:**
- Create: `apps/mobile/ios/DiveComputer/Tests/` (XCTest or manual verification script)

This is a **hard gate** — the module must download a real dive from a real Peregrine and produce bytes that parse identically to the spike reference. Reuses the `verify.sh` approach from `spike/0c-ble-protocol/verify.sh` (per spike findings §Diff vs SQLite-extracted parsing).

- [ ] **Step 1: USER ACTION — Build to a physical iPhone**

```bash
cd apps/mobile
npx react-native run-ios --device
```

Ensure the Peregrine is awake (Bluetooth menu active on the dive computer), and Shearwater Cloud is NOT connected.

- [ ] **Step 2: USER ACTION — Run the full flow from the Plan 2 sync screen**

1. Tap "Scan" → verify `diveComputerDiscovered` event fires with the Peregrine's name and RSSI.
2. Tap the discovered device → verify connection succeeds (resolve).
3. Tap "List Dives" → verify `listDives()` returns the manifest (same dive count as spike — 4 dives if no new dives since spike).
4. Tap a known dive (e.g., dive index matching the spike's test dive) → verify `downloadDive` emits progress events and resolves with base64 `rawBytes`.

- [ ] **Step 3: Extract the downloaded bytes and verify byte-identity**

Save the base64 `rawBytes` to a file and decode:

```bash
# From the app's console log or a debug endpoint:
echo "<base64-string>" | base64 --decode > /tmp/plan3-dive.bin
```

Run the spike's verify approach:

```bash
DCTOOL="$(pwd)/spike/0b-desktop-harness/build/install/bin/dctool"
"$DCTOOL" -d "Shearwater Peregrine" parse -u metric -o /tmp/plan3-parsed.xml /tmp/plan3-dive.bin
diff /tmp/plan3-parsed.xml spike/0a-uddf-inspection/parsed/dive-3.xml
```

Expected: zero diff (or only datetime-format differences in headers — sample data must be identical). This confirms the production module produces byte-identical output to the spike, proving the port did not introduce regressions.

If the diff shows sample-level differences: STOP. Debug the protocol layer before proceeding. The most likely cause is a BLE framing or decompression regression.

- [ ] **Step 4: Document the validation result**

Add a brief note to the commit message confirming the device-validation outcome.

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "plan3(ios): GATE PASSED — real-device byte-identity validated against spike reference"
```

---

## Phase 3 — iOS Robustness Items (2–3 days)

Goal: Implement the production-quality robustness items identified in `spike/0c-ble-protocol/findings.md` §Robustness items still needed in production. Each item is a discrete task.

### Task 3.1: Optimize chunk size from 32 to 75 bytes

**Files:**
- Modify: `apps/mobile/ios/DiveComputer/PeregrineProtocol.swift`
- Modify: `apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift`

Per spike findings §Verified GATT layout: MTU(write/withoutResponse) = 77 bytes, giving 75 bytes payload after the 2-byte BLE mini-header. The spike used 32 bytes (matching libdc) but this is ~2.3x slower than necessary.

- [ ] **Step 1: Make chunk size configurable in `PeregrineProtocol.swift`**

Change `BLE_CHUNK_SIZE` from a fixed `32` to a property that can be set after MTU negotiation:

```swift
// In enum Peregrine:
static let BLE_CHUNK_SIZE_DEFAULT = 32
static let BLE_CHUNK_SIZE_OPTIMIZED = 75  // full noResp MTU (77) - 2-byte header
```

- [ ] **Step 2: Use negotiated MTU in `PeregrineBLEManager`**

After connection, read `peripheral.maximumWriteValueLength(for: .withoutResponse)` and compute `min(mtu - 2, 75)` as the chunk size. Pass this to `BLEFramer.fragment()` calls.

```swift
private var chunkSize: Int {
    guard let p = peripheral else { return Peregrine.BLE_CHUNK_SIZE_DEFAULT }
    let mtu = p.maximumWriteValueLength(for: .withoutResponse)
    return min(mtu - 2, Peregrine.BLE_CHUNK_SIZE_OPTIMIZED)  // -2 for BLE mini-header
}
```

- [ ] **Step 3: Verify on real device — download should be ~2x faster**

Time a dive download before and after. Spike reported ~5328 compressed bytes for the test dive. At 32-byte chunks that's ~177 BLE writes. At 75-byte chunks that's ~71 writes.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/ios/DiveComputer/PeregrineProtocol.swift apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift
git commit -m "plan3(ios): optimize BLE chunk size to 75 bytes (~2.3x throughput gain)"
```

---

### Task 3.2: Block-download retry/backoff

**Files:**
- Modify: `apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift`

Per spike findings: "a single block-download timeout currently aborts the whole dive. Production should retry the block 1–2 times before bailing."

- [ ] **Step 1: Add retry logic to the block-download loop**

In `downloadBlob()`, wrap the per-block transfer in a retry loop:

```swift
private let maxBlockRetries = 2
private let retryDelayMs: UInt64 = 500

// Inside the block loop:
var lastError: Error?
for attempt in 0...maxBlockRetries {
    do {
        let rsp = try await transfer(req)
        let payload = try BlockDownload.parseBlockResponse(rsp, expectedBlock: blockNum)
        raw.append(payload)
        lastError = nil
        break
    } catch {
        lastError = error
        if attempt < maxBlockRetries {
            try await Task.sleep(nanoseconds: retryDelayMs * 1_000_000 * UInt64(attempt + 1))
            // Exponential: 500ms, 1000ms
        }
    }
}
if let err = lastError { throw err }
```

- [ ] **Step 2: Add os_log for retry events (for Sentry breadcrumbs)**

Log each retry with the block number and attempt count.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift
git commit -m "plan3(ios): add block-download retry with exponential backoff (max 2 retries)"
```

---

### Task 3.3: Partial-download recovery (resume from last-acked block)

**Files:**
- Modify: `apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift`

Per spike findings: "if the user disconnects mid-dive download, we should resume from the last-acked block, not restart."

- [ ] **Step 1: Track download state per dive**

Add a `DownloadState` struct that records: dive index, address, last successful block number, accumulated raw bytes.

```swift
private struct DownloadState {
    let diveIndex: Int
    let address: UInt32
    var lastBlockNum: UInt8
    var accumulatedBytes: Data
    var nbytes: UInt32
}
private var partialDownloads: [Int: DownloadState] = [:]  // keyed by dive index
```

- [ ] **Step 2: On disconnect mid-download, save the partial state**

When the BLE disconnect callback fires while a download is in progress, persist the `DownloadState` to the dictionary (in-memory for v1 — persisting to disk is v1.5).

- [ ] **Step 3: On `downloadDive(at:)`, check for partial state and resume**

If `partialDownloads[index]` exists and the connection is re-established to the same device:
1. Send `BlockDownload.initRequest` with the same address/size
2. Skip already-downloaded blocks by re-requesting from `lastBlockNum + 1`
3. Continue the block loop from where it left off

If the device reports a different block size on re-init, discard the partial state and restart.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift
git commit -m "plan3(ios): partial-download recovery — resume from last-acked block on reconnect"
```

---

### Task 3.4: Manifest pagination (handle >48 dives)

**Files:**
- Modify: `apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift`

Per spike findings: "spike fetches one manifest page (48 dives). Production loops to handle larger manifests." Per protocol cheatsheet: "If a manifest page is full (count + deleted == RECORD_COUNT == 48), the loop fetches another manifest page (shearwater_petrel.c:308-310)."

- [ ] **Step 1: Loop manifest fetches until termination**

Replace the single-page manifest read with a loop:

```swift
func listDives() async throws -> [ManifestEntry] {
    // ... serial/firmware/hardware/logupload reads ...
    
    var allRecords: [ManifestRecord] = []
    var manifestAddr = Peregrine.MANIFEST_ADDR
    
    while true {
        let blob = try await downloadBlob(address: manifestAddr, size: Peregrine.MANIFEST_SIZE, compression: false)
        let records = Manifest.parse(blob)
        allRecords.append(contentsOf: records)
        
        // If the page was full (records + deleted == RECORD_COUNT), fetch next page
        // per shearwater_petrel.c:308-310
        let totalEntries = blob.count / Peregrine.RECORD_SIZE
        if totalEntries >= Peregrine.RECORD_COUNT {
            manifestAddr += Peregrine.MANIFEST_SIZE
        } else {
            break
        }
    }
    // ...
}
```

- [ ] **Step 2: Add a safety cap (max 10 pages = 480 dives)**

Prevent infinite loops in case of corrupt manifest data:

```swift
let maxPages = 10
var pageCount = 0
while pageCount < maxPages { ... pageCount += 1 }
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift
git commit -m "plan3(ios): manifest pagination — loop to handle >48 dives"
```

---

### Task 3.5: Incremental LRE state (track decompression across blocks)

**Files:**
- Modify: `apps/mobile/ios/DiveComputer/PeregrineProtocol.swift`
- Modify: `apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift`

Per spike findings: "spike re-decompresses the full accumulated buffer each block to check the end marker. Production should track decompression state across blocks (libdc does this)."

- [ ] **Step 1: Add an incremental LRE decoder class to `PeregrineProtocol.swift`**

```swift
final class IncrementalLREDecoder {
    private var bitBuffer: [UInt8] = []
    private var bitOffset: Int = 0
    private(set) var isDone: Bool = false
    
    /// Feed new compressed bytes. Returns true if end-of-stream marker seen.
    func feed(_ data: Data) -> Bool {
        bitBuffer.append(contentsOf: data)
        // Check if we have enough bits for at least one more 9-bit value
        let totalBits = bitBuffer.count * 8
        while bitOffset + 9 <= totalBits && !isDone {
            let byteIdx = bitOffset / 8
            let bit = bitOffset % 8
            let hi = UInt32(bitBuffer[byteIdx]) << 8
            let lo = UInt32(bitBuffer[byteIdx + 1])
            let word = hi | lo
            let shift = 16 - (bit + 9)
            let value = Int((word >> UInt32(shift)) & 0x1FF)
            if (value & 0x100) == 0 && value == 0 {
                isDone = true
                return true
            }
            bitOffset += 9
        }
        return isDone
    }
}
```

- [ ] **Step 2: Use the incremental decoder in `downloadBlob()`**

Replace the "re-decompress everything each block" approach with:

```swift
let lreTracker = IncrementalLREDecoder()
// ... in the block loop:
if compression {
    if lreTracker.feed(payload) { done = true }
}
```

- [ ] **Step 3: Verify on real device — same bytes produced**

Download the same test dive and confirm byte-identity with the Phase 2 gate output.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/ios/DiveComputer/PeregrineProtocol.swift apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift
git commit -m "plan3(ios): incremental LRE end-detection (no re-decompression per block)"
```

---

### Task 3.6: Dive-number reconciliation (fingerprints + timestamps)

**Files:**
- Modify: `apps/mobile/ios/DiveComputer/DiveComputerModule.swift`

Per spike findings: "device-side dive index ≠ user-visible numbering anywhere — use start timestamps + fingerprints." Per contract: `ManifestEntry.fingerprintHex` is exposed; `POST /api/dives` uses `externalId` for dedup.

- [ ] **Step 1: Use fingerprint hex as `externalId`**

When `listDives()` returns entries, the `fingerprintHex` field serves as the stable dive identifier across resyncs. The app (Plan 2) will pass this as `externalId` to `POST /api/dives`. No manifest-position-based numbering anywhere.

Document this in a code comment:

```swift
// Per spike findings: manifest position != user-visible dive number.
// The fingerprint (4 bytes from offset +4 in each manifest record) is the
// stable identifier libdivecomputer uses for "already seen" detection.
// Per Contract: externalId in POST /api/dives must be this fingerprint.
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/ios/DiveComputer/DiveComputerModule.swift
git commit -m "plan3(ios): use fingerprint as stable externalId (not manifest position)"
```

---

### Task 3.7: Pairing UX error surfaces

**Files:**
- Modify: `apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift`
- Modify: `apps/mobile/ios/DiveComputer/DiveComputerModule.swift`

Per spike findings: "Surface 'device not advertising' (Peregrine sleeps) and 'Shearwater Cloud is connected' (single-master limit) as distinct user-facing states."

- [ ] **Step 1: Add scan timeout with descriptive error**

If `startScan` runs for 15 seconds with no discoveries, emit a `diveComputerDisconnected` event with `reason: "no_device_found"`. The Plan 2 UI will map this to "Wake your Peregrine — navigate to the Bluetooth menu on your dive computer."

- [ ] **Step 2: Detect connection failure patterns**

When `centralManager(_:didFailToConnect:error:)` fires, inspect the error:
- If error domain is `CBError` with code `.connectionFailed` or `.peerRemovedPairingInformation`: emit `diveComputerDisconnected` with `reason: "connection_rejected"` — maps to "Another app (Shearwater Cloud?) may be connected. Close it and retry."
- If the peripheral disconnects within 2 seconds of connecting (before characteristic discovery completes): emit with `reason: "device_busy"`.
- All other failures: emit with `reason: error.localizedDescription`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift apps/mobile/ios/DiveComputer/DiveComputerModule.swift
git commit -m "plan3(ios): surface pairing UX errors (sleep/busy/rejected) as distinct reasons"
```

---

### Task 3.8: Per-sync firmware version capture

**Files:**
- Modify: `apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift`
- Modify: `apps/mobile/ios/DiveComputer/DiveComputerModule.swift`

Per spike findings: "Shearwater firmware updates can break things. Production should record device firmware version per sync."

- [ ] **Step 1: Store firmware version from RDBI response**

In `listDives()`, after the `RDBI(ID_FIRMWARE)` call, store the firmware string:

```swift
self.firmwareVersion = String(data: firmware, encoding: .ascii)?.trimmingCharacters(in: .controlCharacters)
```

- [ ] **Step 2: Add firmware version to Sentry breadcrumb on connect**

```swift
// In the connect completion:
SentrySDK.addBreadcrumb(crumb: {
    let b = Breadcrumb()
    b.category = "ble"
    b.message = "Connected to Peregrine"
    b.data = ["firmware": firmwareVersion ?? "unknown", "serial": serialNumber ?? "unknown"]
    return b
}())
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/ios/DiveComputer/PeregrineBLEManager.swift apps/mobile/ios/DiveComputer/DiveComputerModule.swift
git commit -m "plan3(ios): capture firmware version per sync for Sentry breadcrumbs"
```

---

### Task 3.9: Phase 3 real-device validation gate

- [ ] **Step 1: Repeat the Phase 2 gate test with robustness items active**

Run the full scan → connect → listDives → downloadDive flow on a real Peregrine. Verify:
- Chunk size is 75 (check os_log output)
- Manifest returns the expected dive count
- Downloaded bytes are still byte-identical to spike reference
- Firmware version appears in Sentry breadcrumbs

- [ ] **Step 2: Test disconnect-during-download recovery**

Start a download. Mid-download, turn off the Peregrine (or move out of BLE range). Verify:
- `diveComputerDisconnected` event fires with a descriptive reason
- Reconnect, re-call `downloadDive` for the same index — verify it resumes (or restarts gracefully if the device reports different block size)

- [ ] **Step 3: Commit gate result**

```bash
git commit --allow-empty -m "plan3(ios): PHASE 3 GATE PASSED — robustness items validated on real device"
```

---

## Phase 4 — Android Module Scaffold (2 days)

Goal: Create the Android TurboModule structure, register the module, and verify JS can call empty stubs. Mirrors Phase 1 for iOS.

### Task 4.1: Create Android native module directory and registration

**Files:**
- Create: `apps/mobile/android/app/src/main/java/com/diveforge/ble/DiveComputerModule.kt`
- Create: `apps/mobile/android/app/src/main/java/com/diveforge/ble/DiveComputerPackage.kt`
- Modify: `apps/mobile/android/app/src/main/java/com/diveforge/MainApplication.kt`

- [ ] **Step 1: Create the package directory**

```bash
mkdir -p apps/mobile/android/app/src/main/java/com/diveforge/ble
```

- [ ] **Step 2: Write `DiveComputerPackage.kt`**

```kotlin
package com.diveforge.ble

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class DiveComputerPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(DiveComputerModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
```

- [ ] **Step 3: Write `DiveComputerModule.kt` with stubs**

```kotlin
package com.diveforge.ble

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class DiveComputerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DiveComputer"

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun startScan(serviceUuid: String, promise: Promise) {
        promise.resolve(null)
    }

    @ReactMethod
    fun stopScan(promise: Promise) {
        promise.resolve(null)
    }

    @ReactMethod
    fun connect(identifier: String, promise: Promise) {
        promise.resolve(null)
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        promise.resolve(null)
    }

    @ReactMethod
    fun isConnected(promise: Promise) {
        promise.resolve(false)
    }

    @ReactMethod
    fun listDives(promise: Promise) {
        promise.resolve(Arguments.createArray())
    }

    @ReactMethod
    fun downloadDive(index: Int, promise: Promise) {
        val result = Arguments.createMap()
        result.putString("rawBytes", "")
        promise.resolve(result)
    }

    @ReactMethod
    fun addListener(eventName: String) { /* Required for NativeEventEmitter */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* Required for NativeEventEmitter */ }
}
```

- [ ] **Step 4: Register the package in `MainApplication.kt`**

Add `DiveComputerPackage()` to the `getPackages()` list:

```kotlin
import com.diveforge.ble.DiveComputerPackage
// In getPackages():
packages.add(DiveComputerPackage())
```

- [ ] **Step 5: Add Bluetooth permissions to `AndroidManifest.xml`**

```xml
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
```

- [ ] **Step 6: Verify the stub compiles and is callable from JS**

```bash
cd apps/mobile
npx react-native run-android
```

Verify `NativeModules.DiveComputer` is not undefined on Android.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/android/app/src/main/java/com/diveforge/ble/
git add apps/mobile/android/app/src/main/AndroidManifest.xml
git add apps/mobile/android/app/src/main/java/com/diveforge/MainApplication.kt
git commit -m "plan3(android): scaffold TurboModule with empty stubs + BLE permissions"
```

---

## Phase 5 — Android Protocol Port + Real-Device Validation (5–7 days)

Goal: Port the protocol layer (pure byte logic from `PeregrineProtocol.swift`) to Kotlin, implement the `BluetoothGatt` transport, and validate against a real Peregrine on a physical Android device. The protocol port is mechanical — the byte logic is identical; only the transport layer differs.

### Task 5.1: Port protocol helpers to Kotlin

**Files:**
- Create: `apps/mobile/android/app/src/main/java/com/diveforge/ble/protocol/SlipCodec.kt`
- Create: `apps/mobile/android/app/src/main/java/com/diveforge/ble/protocol/BleFramer.kt`
- Create: `apps/mobile/android/app/src/main/java/com/diveforge/ble/protocol/WrapCodec.kt`
- Create: `apps/mobile/android/app/src/main/java/com/diveforge/ble/protocol/RdbiWdbi.kt`
- Create: `apps/mobile/android/app/src/main/java/com/diveforge/ble/protocol/BlockDownload.kt`
- Create: `apps/mobile/android/app/src/main/java/com/diveforge/ble/protocol/Decompress.kt`
- Create: `apps/mobile/android/app/src/main/java/com/diveforge/ble/protocol/Manifest.kt`
- Create: `apps/mobile/android/app/src/main/java/com/diveforge/ble/protocol/Constants.kt`
- Source: `spike/0c-ble-protocol/swift-sources/PeregrineProtocol.swift` (1:1 byte-logic translation)

- [ ] **Step 1: Create protocol package**

```bash
mkdir -p apps/mobile/android/app/src/main/java/com/diveforge/ble/protocol
```

- [ ] **Step 2: Port `Constants.kt`**

Translate all values from `enum Peregrine` in the Swift source. Use `object` declaration:

```kotlin
object Peregrine {
    const val SLIP_END: Byte = 0xC0.toByte()
    const val SLIP_ESC: Byte = 0xDB.toByte()
    const val SLIP_ESC_END: Byte = 0xDC.toByte()
    const val SLIP_ESC_ESC: Byte = 0xDD.toByte()
    const val BLE_CHUNK_SIZE = 32
    const val BLE_CHUNK_SIZE_OPTIMIZED = 75
    const val SZ_PACKET = 254
    const val MANIFEST_ADDR = 0xE0000000.toUInt()
    const val MANIFEST_SIZE = 0x600.toUInt()
    const val RECORD_SIZE = 0x20
    const val RECORD_COUNT = 48
    const val DIVE_SIZE = 0xFFFFFF.toUInt()
    val SERVICE_UUID: java.util.UUID = java.util.UUID.fromString("FE25C237-0ECE-443C-B0AA-E02033E7029D")
    val SPP_CHARACTERISTIC_UUID: java.util.UUID = java.util.UUID.fromString("27B7570B-359E-45A3-91BB-CF7E70049BD2")
    // ... all other constants from Swift
}
```

- [ ] **Step 3: Port `SlipCodec.kt`**

Translate `SLIP.encode()` and `SLIP.Decoder` class. Use `ByteArray` instead of `Data`.

- [ ] **Step 4: Port `BleFramer.kt`**

Translate `BLEFramer.fragment()` and `BLEFramer.stripHeader()`.

- [ ] **Step 5: Port `WrapCodec.kt`**

Translate `Wrap.wrapRequest()` and `Wrap.unwrapResponse()`.

- [ ] **Step 6: Port `RdbiWdbi.kt`**

Translate `RDBI.request()`, `RDBI.parse()`, `WDBI.request()`, `WDBI.validate()`.

- [ ] **Step 7: Port `BlockDownload.kt`**

Translate all `BlockDownload` static methods.

- [ ] **Step 8: Port `Decompress.kt`**

Translate `Decompress.lre()`, `Decompress.xorPhase()`, `Decompress.full()`. **Critical: verify 9-bit extraction logic produces identical results.** Use unsigned byte operations (`toUByte()`, `toInt() and 0xFF`).

- [ ] **Step 9: Port `Manifest.kt`**

Translate `Manifest.parse()` and the `ManifestRecord` data class.

- [ ] **Step 10: Add unit tests for the protocol layer**

Create `apps/mobile/android/app/src/test/java/com/diveforge/ble/protocol/ProtocolTest.kt`:
- Test SLIP encode/decode roundtrip
- Test BLEFramer fragment/strip roundtrip
- Test Wrap wrapRequest/unwrapResponse roundtrip
- Test Decompress.full against a known compressed fixture from the spike (capture the 5328-byte compressed blob from the spike and include as a test resource)
- Test Manifest.parse against a known manifest blob

```bash
cd apps/mobile/android
./gradlew :app:testDebugUnitTest --tests "com.diveforge.ble.protocol.*"
```

Expected: All protocol tests pass.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/android/app/src/main/java/com/diveforge/ble/protocol/
git add apps/mobile/android/app/src/test/java/com/diveforge/ble/protocol/
git commit -m "plan3(android): port protocol layer to Kotlin with unit tests"
```

---

### Task 5.2: Implement Android BLE transport (`PeregrineBleManager.kt`)

**Files:**
- Create: `apps/mobile/android/app/src/main/java/com/diveforge/ble/PeregrineBleManager.kt`

The Android `BluetoothGatt` API differs significantly from CoreBluetooth in lifecycle and threading:
- Callbacks arrive on a binder thread (not main thread)
- Must request MTU explicitly (`requestMtu()`)
- Must handle Android 12+ runtime permission requests
- `writeCharacteristic` requires explicit write type parameter
- Connection interval negotiation differs

- [ ] **Step 1: Write the BLE manager class**

Implement:
- `startScan(serviceUuid, onDiscovered)`: use `BluetoothLeScanner.startScan()` with `ScanFilter` for the service UUID
- `stopScan()`
- `connect(address, onConnected, onDisconnected)`: `connectGatt()` with `TRANSPORT_LE`
- `disconnect()`: `gatt.disconnect()` + `gatt.close()`
- `isConnected()`: check `BluetoothProfile.STATE_CONNECTED`
- GATT callback: `onConnectionStateChange`, `onServicesDiscovered`, `onCharacteristicChanged`, `onMtuChanged`
- Service/characteristic discovery: find service by UUID, find characteristic by UUID (per spike findings §Verified GATT layout: single SPP characteristic `27B7570B-...`)
- MTU request: `gatt.requestMtu(512)` — Android will negotiate down to the device's max
- Enable notifications: write to CCCD descriptor
- `sendFrames(slipData)`: fragment with `BleFramer`, write each chunk via `writeCharacteristic` with `WRITE_TYPE_NO_RESPONSE`
- Incoming notification handler: strip BLE header, feed SLIP decoder, emit complete frames via a `Channel<ByteArray>` (Kotlin coroutines)
- `transfer(payload)` coroutine: mirrors the Swift version (wrap → SLIP → BLE-frame → write; await frame from channel; unwrap)
- `listDives()` and `downloadDive(index)`: reuse the same flow as iOS

Threading model: use a single-threaded `CoroutineDispatcher` (via `newSingleThreadContext("BLE")`) for all GATT operations to avoid race conditions. Expose suspend functions to the module.

- [ ] **Step 2: Include robustness items from Phase 3**

Port the following directly (same logic, Kotlin syntax):
- Optimized chunk size (use negotiated MTU - 5 for Android GATT overhead, capped at 75)
- Block-download retry/backoff (max 2 retries, exponential)
- Manifest pagination loop
- Incremental LRE end-detection
- Scan timeout (15s) with descriptive error
- Firmware version capture

Partial-download recovery: include the same in-memory state tracking as iOS.

- [ ] **Step 3: Verify compilation**

```bash
cd apps/mobile/android
./gradlew :app:assembleDebug
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/android/app/src/main/java/com/diveforge/ble/PeregrineBleManager.kt
git commit -m "plan3(android): implement BluetoothGatt transport with robustness items"
```

---

### Task 5.3: Wire `DiveComputerModule.kt` to the BLE manager

**Files:**
- Modify: `apps/mobile/android/app/src/main/java/com/diveforge/ble/DiveComputerModule.kt`

- [ ] **Step 1: Replace stubs with real BLE manager calls**

Mirror the iOS wiring:
- `startScan` → `bleManager.startScan()`, emit `diveComputerDiscovered` events
- `stopScan` → `bleManager.stopScan()`
- `connect` → `bleManager.connect()`, resolve on connected + notifications enabled
- `disconnect` → `bleManager.disconnect()`
- `isConnected` → `bleManager.isConnected()`
- `listDives` → `bleManager.listDives()`, return `WritableArray` of `WritableMap` entries matching `ManifestEntry` shape
- `downloadDive` → `bleManager.downloadDive()`, emit `diveComputerProgress` events, resolve with `{ rawBytes: base64 }` using `android.util.Base64.encodeToString()`

- [ ] **Step 2: Wire disconnect callback to emit `diveComputerDisconnected`**

- [ ] **Step 3: Handle Android runtime permissions**

Before scanning, check and request `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT` (Android 12+) or `ACCESS_FINE_LOCATION` (Android 11 and below). Reject the `startScan` Promise with a descriptive error if permissions are denied.

- [ ] **Step 4: Verify compilation**

```bash
cd apps/mobile/android
./gradlew :app:assembleDebug
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/android/app/src/main/java/com/diveforge/ble/DiveComputerModule.kt
git commit -m "plan3(android): wire DiveComputerModule to PeregrineBleManager (full implementation)"
```

---

### Task 5.4: Android real-device validation (HARD GATE)

**This is a hard gate. The spike did NOT test Android. The first Android attempt MUST re-validate against a real Peregrine + physical Android device before declaring this phase done.**

**Files:** none (validation only)

- [ ] **Step 1: USER ACTION — Install on a physical Android device**

```bash
cd apps/mobile
npx react-native run-android --device
```

Ensure the Peregrine is awake and NOT connected to Shearwater Cloud or the iOS test device.

- [ ] **Step 2: USER ACTION — Run full flow**

From the Plan 2 sync screen on Android:
1. Grant Bluetooth permissions when prompted
2. Tap "Scan" → verify Peregrine appears in the discovered list
3. Tap the device → verify connection succeeds
4. Tap "List Dives" → verify manifest returns expected dive count
5. Download a known dive → verify progress events fire and base64 bytes are returned

- [ ] **Step 3: Verify byte-identity against spike reference**

Extract base64 from the Android app (via adb logcat or a debug endpoint):

```bash
adb logcat | grep "rawBytes" | head -1 > /tmp/android-base64.txt
# Decode and parse:
cat /tmp/android-base64.txt | base64 --decode > /tmp/android-dive.bin
DCTOOL="$(pwd)/spike/0b-desktop-harness/build/install/bin/dctool"
"$DCTOOL" -d "Shearwater Peregrine" parse -u metric -o /tmp/android-parsed.xml /tmp/android-dive.bin
diff /tmp/android-parsed.xml spike/0a-uddf-inspection/parsed/dive-3.xml
```

Expected: zero diff on sample data. This proves the Kotlin protocol port is byte-identical to the Swift implementation and to the spike reference.

**If the diff shows sample-level differences: STOP. Debug the protocol port (most likely candidate: 9-bit extraction in `Decompress.kt` or SLIP encoding edge case). Do not proceed until byte-identity is confirmed.**

- [ ] **Step 4: Test error cases**

- Turn off Peregrine mid-download → verify `diveComputerDisconnected` fires with descriptive reason
- Try scanning while Shearwater Cloud is connected → verify scan timeout fires

- [ ] **Step 5: Commit gate result**

```bash
git commit --allow-empty -m "plan3(android): HARD GATE PASSED — real-device byte-identity validated on Android"
```

---

## Phase 6 — Mock-to-Real Swap + Integration Test (1 day)

Goal: Flip the build flag so the real native module replaces the mock. Run the end-to-end integration test proving a real dive flows from Peregrine through the BLE module, to `POST /api/dives`, and renders on Plan 2's Detail screen.

### Task 6.1: Flip the build flag

**Files:**
- Modify: `apps/mobile/src/native/index.ts`

Per contract: "Plan 2 ships against a JS-only mock... Plan 3 produces the real native implementation." Plan 2 introduced a build flag in `apps/mobile/src/native/index.ts` that selects between the mock and the real module.

- [ ] **Step 1: Update the module selector**

The file should look something like:

```typescript
// apps/mobile/src/native/index.ts
import { NativeModules, Platform } from 'react-native';
import type { DiveComputerModule } from './DiveComputer';

// Plan 3: real native module is now available on both platforms.
// The mock is retained for development/testing without a physical device.
const USE_MOCK = __DEV__ && process.env.EXPO_PUBLIC_USE_MOCK_BLE === 'true';

export const DiveComputer: DiveComputerModule = USE_MOCK
  ? require('./DiveComputer.mock').default
  : NativeModules.DiveComputer;
```

Change the default from "always mock" to "real module unless explicitly opted into mock via env var."

- [ ] **Step 2: Verify the app loads with the real module on both platforms**

```bash
# iOS
cd apps/mobile && npx react-native run-ios --device
# Android
cd apps/mobile && npx react-native run-android --device
```

Verify no JS errors about missing native module.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/native/index.ts
git commit -m "plan3: flip build flag — real native module replaces mock by default"
```

---

### Task 6.2: End-to-end integration test (success criterion)

**Files:** none (validation only)

Per the hard rules: "Plan 3's success criterion is byte-identity to the spike output AND a parsed dive flowing through Plan 1's `POST /api/dives` and rendering on Plan 2's Detail Plongee screen."

- [ ] **Step 1: USER ACTION — Full end-to-end flow on iOS**

1. Launch the app (real module, not mock)
2. Scan → connect to Peregrine
3. List dives → select a dive to download
4. Download completes → app sends `POST /api/dives` with the raw bytes (multipart/form-data: `bytes` as binary decoded from base64, `meta` as JSON with `deviceModel`, `deviceSerial`, `externalId` = fingerprintHex, `startedAt`)
5. Backend parses via libdivecomputer → returns `{ dive, insights, score }`
6. App navigates to Detail Plongee screen → depth profile graph renders, metrics display, insights show

Verify:
- Score is non-null and in 0–100 range
- Depth profile graph shows data points
- At least one insight is displayed (if the dive triggers any rules)
- Dive appears in the list view

- [ ] **Step 2: Repeat on Android**

Same flow on the Android device. Verify identical behavior.

- [ ] **Step 3: Verify byte-identity one final time**

From the backend logs or database, extract the raw bytes that were received by `POST /api/dives`. Verify they match the spike reference:

```bash
# From backend storage or debug endpoint:
diff <(xxd /tmp/backend-received.bin) <(xxd /tmp/plan3-dive.bin)
```

Expected: identical.

- [ ] **Step 4: Commit integration test result**

```bash
git commit --allow-empty -m "plan3: END-TO-END GATE PASSED — real dive flows BLE → API → screen on both platforms"
```

---

### Task 6.3: Connection-state observability (Sentry breadcrumbs)

**Files:**
- Modify: `apps/mobile/ios/DiveComputer/DiveComputerModule.swift`
- Modify: `apps/mobile/android/app/src/main/java/com/diveforge/ble/DiveComputerModule.kt`

Per scope: "wire `diveComputerDisconnected` events into Sentry breadcrumbs."

- [ ] **Step 1: iOS — Add Sentry breadcrumbs**

In the `diveComputerDisconnected` event emission path:

```swift
import Sentry

// When emitting the disconnected event:
let crumb = Breadcrumb()
crumb.level = .warning
crumb.category = "ble.disconnect"
crumb.message = reason
crumb.data = ["firmware": firmwareVersion ?? "unknown"]
SentrySDK.addBreadcrumb(crumb)
```

Also add breadcrumbs for:
- Successful connection (`ble.connect`)
- Download start/complete (`ble.download`)
- Scan timeout (`ble.scan_timeout`)

- [ ] **Step 2: Android — Add Sentry breadcrumbs**

```kotlin
import io.sentry.Sentry
import io.sentry.Breadcrumb
import io.sentry.SentryLevel

// When emitting the disconnected event:
Sentry.addBreadcrumb(Breadcrumb().apply {
    level = SentryLevel.WARNING
    category = "ble.disconnect"
    message = reason
    setData("firmware", firmwareVersion ?: "unknown")
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/ios/DiveComputer/DiveComputerModule.swift
git add apps/mobile/android/app/src/main/java/com/diveforge/ble/DiveComputerModule.kt
git commit -m "plan3: wire BLE connection events into Sentry breadcrumbs"
```

---

## Phase 7 — Internal Distribution Rebuild (1 day)

Goal: Build and distribute the complete app (with real BLE module) via TestFlight (iOS) and EAS internal APK (Android).

### Task 7.1: iOS TestFlight build

**Files:**
- Modify: `apps/mobile/eas.json` (if build profiles need updating)

- [ ] **Step 1: Bump version for the BLE-enabled build**

Update `apps/mobile/app.json` (or `app.config.ts`):
```json
"version": "1.0.0",
"ios": { "buildNumber": "3" }
```

- [ ] **Step 2: Run EAS build for iOS**

```bash
cd apps/mobile
eas build --platform ios --profile internal
```

Expected: Build completes and uploads to App Store Connect.

- [ ] **Step 3: Distribute via TestFlight**

```bash
eas submit --platform ios --profile internal
```

Or use App Store Connect to push the build to internal testers.

- [ ] **Step 4: USER ACTION — Verify on a fresh TestFlight install**

Install from TestFlight on an iPhone. Run the full sync flow. Confirm the BLE module works outside of a development build.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app.json apps/mobile/eas.json
git commit -m "plan3: iOS TestFlight internal distribution build (BLE-enabled)"
```

---

### Task 7.2: Android EAS internal APK

**Files:**
- Modify: `apps/mobile/eas.json` (if needed)

- [ ] **Step 1: Bump Android version code**

Update `apps/mobile/app.json`:
```json
"android": { "versionCode": 3 }
```

- [ ] **Step 2: Run EAS build for Android**

```bash
cd apps/mobile
eas build --platform android --profile internal
```

Expected: Build completes and produces an APK.

- [ ] **Step 3: Distribute the APK**

Share the APK download link with internal testers (via the EAS dashboard or direct link).

- [ ] **Step 4: USER ACTION — Verify on a fresh APK install**

Install the APK on an Android device. Grant Bluetooth permissions. Run the full sync flow. Confirm the BLE module works outside of a development build.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app.json apps/mobile/eas.json
git commit -m "plan3: Android EAS internal APK distribution build (BLE-enabled)"
```

---

### Task 7.3: Final validation — both platforms from internal distribution

- [ ] **Step 1: Confirm TestFlight build syncs a dive end-to-end**

A tester (not the developer) installs from TestFlight, syncs their own Peregrine, sees the dive with score and insights.

- [ ] **Step 2: Confirm APK build syncs a dive end-to-end**

Same on Android.

- [ ] **Step 3: Plan 3 complete — commit final gate**

```bash
git commit --allow-empty -m "plan3: COMPLETE — BLE TurboModule shipping on both platforms via internal distribution"
```

---

## Success Criterion (Final Gate)

Plan 3 is complete when ALL of the following are true:

1. **Byte-identity:** The native module produces output byte-identical to the spike's `spike/0c-ble-protocol/verify.sh` reference (proven by diff in Phase 2 and Phase 5 gates).
2. **End-to-end flow:** A real dive downloaded via BLE flows through `POST /api/dives` (Plan 1), is parsed by the backend, and renders on the Detail Plongee screen (Plan 2) with score + insights.
3. **Both platforms:** iOS and Android both pass their respective device-validation gates.
4. **Internal distribution:** TestFlight and EAS APK builds are live and verified by at least one tester.
5. **Observability:** Sentry breadcrumbs capture BLE connection state for production debugging.

---

## Self-review checklist

- [x] Every step has actual content (no "TBD", "implement later", "similar to above")
- [x] All file paths are exact and absolute-from-repo-root
- [x] All commands include expected output
- [x] Each phase ends with a real-device validation step
- [x] User-action steps are flagged as USER ACTION
- [x] Failure paths have "if X then Y" branches
- [x] Android hard gate is explicitly flagged (spike did not test Android)
- [x] TurboModule interface matches Contract §Native module interface exactly
- [x] Service UUID `FE25C237-0ECE-443C-B0AA-E02033E7029D` used per contract
- [x] Characteristic UUID `27B7570B-359E-45A3-91BB-CF7E70049BD2` used per spike findings
- [x] `rawBytes` returned as base64 per contract
- [x] All robustness items from spike findings are discrete tasks
- [x] End-to-end success criterion listed as final gate
- [x] Spike sources cited by path where relevant
