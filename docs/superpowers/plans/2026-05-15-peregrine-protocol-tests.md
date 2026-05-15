# Peregrine Protocol Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-15
**Status:** Ready for execution.
**Depends on:** Plan 3 BLE TurboModule (the protocol code being tested).

**Goal:** Verify the Swift and Kotlin Peregrine protocol code matches libdivecomputer (`shearwater_common.c`, `shearwater_petrel.c`) exactly, by adding pure-function unit tests on both platforms with shared test vectors.

**Architecture:** The protocol layer is split into ten pure-function units (SLIP codec, BLE framer, Wrap codec, RDBI, WDBI, BlockDownload, Decompress, IncrementalLREDetector, Manifest, LogbookFormat). Each unit has well-defined inputs and outputs, so we test them as pure functions with hex byte vectors derived from libdc behavior — no BLE, no device, no async. Identical vectors run on iOS (XCTest) and Android (JUnit) so we catch any port divergence. After Phase 1 wires up the test targets, Phase 2's eight unit-test tasks are independent and can be executed in parallel by separate subagents.

**Tech Stack:**
- iOS: XCTest target added to `apps/mobile/ios/DiveChef.xcodeproj`, Swift test files
- Android: JUnit 4 in `apps/mobile/android/app/src/test/java/`, Kotlin test files
- Shared: hex-byte test vectors documented inline in each task; same vectors used on both platforms

**Non-goals:**
- BLE transport tests (would require GATT mocking — out of scope; covered by real-device validation gate).
- React Native bridge tests (the bridge is a thin pass-through; real-device validation covers it).
- Forking or vendoring libdc (we transcribe the byte-level behavior into vectors instead).
- Performance benchmarks.

---

## Phase 1 — Test Infrastructure (Sequential)

Phase 1 must complete before Phase 2 because every Phase 2 task depends on a working test target.

### Task 1.1: Add iOS XCTest target

**Files:**
- Modify: `apps/mobile/ios/DiveChef.xcodeproj/project.pbxproj`
- Create: `apps/mobile/ios/DiveChefTests/Info.plist`
- Create: `apps/mobile/ios/DiveChefTests/DiveChefTests.swift` (smoke test)

**Why this approach:** Expo bare workflow regenerates parts of the iOS project on `expo prebuild`, but the `xcodeproj` itself is committed and stable as long as we don't run `expo prebuild --clean`. Adding a test target via direct pbxproj edit is the standard approach. We will use `xcodeproj` Ruby gem (already a CocoaPods dependency) via a one-shot Ruby script, which is more reliable than editing pbxproj by hand.

- [ ] **Step 1: Write the smoke test that will run after target setup**

Create `apps/mobile/ios/DiveChefTests/DiveChefTests.swift`:

```swift
import XCTest
@testable import DiveChef

final class DiveChefTests: XCTestCase {
    func testSmoke() {
        // If this compiles and runs, the test target + @testable import work.
        XCTAssertEqual(1 + 1, 2)
    }
}
```

Create `apps/mobile/ios/DiveChefTests/Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key><string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
</dict>
</plist>
```

- [ ] **Step 2: Add the test target via Ruby script**

Create `apps/mobile/ios/scripts/add-test-target.rb` (one-shot, will be deleted after running):

```ruby
require 'xcodeproj'

project_path = File.expand_path('../DiveChef.xcodeproj', __dir__)
project = Xcodeproj::Project.open(project_path)

# Bail out if the target already exists (idempotent).
existing = project.targets.find { |t| t.name == 'DiveChefTests' }
if existing
  puts 'DiveChefTests target already exists — nothing to do.'
  exit 0
end

app_target = project.targets.find { |t| t.name == 'DiveChef' } or abort 'DiveChef target not found'
test_target = project.new_target(
  :unit_test_bundle, 'DiveChefTests', :ios, '15.1', project.products_group, :swift
)

# Add the test source file group + file refs
group = project.main_group.find_subpath('DiveChefTests', true)
group.set_source_tree('SOURCE_ROOT')
group.set_path('DiveChefTests')

test_file = group.new_reference('DiveChefTests.swift')
test_target.source_build_phase.add_file_reference(test_file)

info_plist = group.new_reference('Info.plist')

# Wire build settings
test_target.build_configurations.each do |config|
  config.build_settings['INFOPLIST_FILE'] = 'DiveChefTests/Info.plist'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.divechef.DiveChefTests'
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
  config.build_settings['TEST_HOST'] = "$(BUILT_PRODUCTS_DIR)/DiveChef.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/DiveChef"
  config.build_settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
end

test_target.add_dependency(app_target)

# Add a Test scheme so `xcodebuild test` can find it
scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(app_target, test_target)
scheme.add_test_target(test_target)
scheme.save_as(project_path, 'DiveChef')

project.save
puts 'DiveChefTests target added.'
```

Run: `cd apps/mobile/ios && ruby scripts/add-test-target.rb`
Expected: `DiveChefTests target added.`

- [ ] **Step 3: Run the smoke test**

Run:
```bash
cd apps/mobile/ios && \
xcodebuild test \
  -workspace DiveChef.xcworkspace \
  -scheme DiveChef \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -only-testing:DiveChefTests/DiveChefTests/testSmoke 2>&1 | tail -20
```
Expected: `Test Suite 'DiveChefTests.xctest' passed` and `** TEST SUCCEEDED **`.

If it fails with "scheme not found", run `pod install` first (`cd apps/mobile/ios && pod install`).

- [ ] **Step 4: Delete the one-shot script**

```bash
rm apps/mobile/ios/scripts/add-test-target.rb
rmdir apps/mobile/ios/scripts 2>/dev/null || true
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/ios/DiveChef.xcodeproj/project.pbxproj \
        apps/mobile/ios/DiveChefTests/
git commit -m "test(ios): add XCTest target for protocol unit tests

Adds a DiveChefTests bundle that links against the DiveChef app target
with @testable import access. Smoke test verifies the target builds
and runs."
```

---

### Task 1.2: Add Android JUnit test source set

**Files:**
- Modify: `apps/mobile/android/app/build.gradle` (add test deps)
- Create: `apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/SmokeTest.kt`

- [ ] **Step 1: Add JUnit dependencies**

Edit `apps/mobile/android/app/build.gradle` — find the `dependencies {` block (it already exists for `implementation` deps) and append:

```groovy
    // Unit test dependencies for protocol-layer tests.
    testImplementation 'junit:junit:4.13.2'
    testImplementation 'org.jetbrains.kotlin:kotlin-test:1.9.25'
    testImplementation 'org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3'
```

- [ ] **Step 2: Write the smoke test**

Create `apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/SmokeTest.kt`:

```kotlin
package com.divechef.ble.protocol

import org.junit.Test
import kotlin.test.assertEquals

class SmokeTest {
    @Test fun smoke() {
        assertEquals(2, 1 + 1)
    }
}
```

- [ ] **Step 3: Run the smoke test**

Run:
```bash
cd apps/mobile/android && ./gradlew :app:testDebugUnitTest --tests "com.divechef.ble.protocol.SmokeTest"
```
Expected: `BUILD SUCCESSFUL` and `1 tests completed, 0 failed`.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/android/app/build.gradle \
        apps/mobile/android/app/src/test/
git commit -m "test(android): add JUnit test source set for protocol tests

Adds testImplementation deps (junit, kotlin-test, coroutines-test) and
a smoke test in src/test/java to verify the Gradle test task works."
```

---

## Phase 2 — Protocol Unit Tests (Parallel)

The eight tasks below test independent units of the protocol layer. Each task adds matching tests on iOS (XCTest) and Android (JUnit) using the SAME hex byte vectors. Because the units are independent, a controller can dispatch all eight tasks to parallel subagents after Phase 1 lands.

**Vector convention used in every task:** Hex strings written as `"c0 db dc"` are space-separated bytes; helper extension `Data(hex:)` (Swift) and `ByteArray.fromHex(s)` (Kotlin) parse them. Define these helpers once in the first task that needs them (Task 2.1) and reuse.

---

### Task 2.1: SLIP codec round-trip and edge-case tests

**Reference behavior (libdc):** `shearwater_common.c:34-37` defines `SLIP_END=0xC0`, `SLIP_ESC=0xDB`, `ESC_END=0xDC`, `ESC_ESC=0xDD`, per RFC 1055.

**Files:**
- Create: `apps/mobile/ios/DiveChefTests/SlipCodecTests.swift`
- Create: `apps/mobile/ios/DiveChefTests/HexHelper.swift` (shared helper)
- Create: `apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/SlipCodecTest.kt`
- Create: `apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/HexHelper.kt`

- [ ] **Step 1: Write the iOS hex helper**

Create `apps/mobile/ios/DiveChefTests/HexHelper.swift`:

```swift
import Foundation

extension Data {
    /// Parse "c0 db 42" or "c0db42" into Data. Whitespace ignored.
    init(hex: String) {
        let cleaned = hex.replacingOccurrences(of: " ", with: "")
        var bytes = [UInt8]()
        var idx = cleaned.startIndex
        while idx < cleaned.endIndex {
            let next = cleaned.index(idx, offsetBy: 2)
            bytes.append(UInt8(cleaned[idx..<next], radix: 16)!)
            idx = next
        }
        self.init(bytes)
    }
    var hexString: String { map { String(format: "%02x", $0) }.joined(separator: " ") }
}
```

- [ ] **Step 2: Write the Android hex helper**

Create `apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/HexHelper.kt`:

```kotlin
package com.divechef.ble.protocol

fun hex(s: String): ByteArray {
    val cleaned = s.replace(" ", "")
    return ByteArray(cleaned.length / 2) { i ->
        cleaned.substring(i * 2, i * 2 + 2).toInt(16).toByte()
    }
}

fun ByteArray.hexString(): String =
    joinToString(" ") { "%02x".format(it.toInt() and 0xFF) }
```

- [ ] **Step 3: Write the failing iOS SLIP tests**

Create `apps/mobile/ios/DiveChefTests/SlipCodecTests.swift`:

```swift
import XCTest
@testable import DiveChef

final class SlipCodecTests: XCTestCase {
    // Per RFC 1055: encoded frame is END + escaped(payload) + END.
    func testEncode_simplePayload() {
        let payload = Data([0x01, 0x02, 0x03])
        let encoded = SlipCodec.encode(payload)
        XCTAssertEqual(encoded.hexString, "c0 01 02 03 c0")
    }

    func testEncode_escapesEND() {
        let payload = Data([0xC0])
        let encoded = SlipCodec.encode(payload)
        XCTAssertEqual(encoded.hexString, "c0 db dc c0")
    }

    func testEncode_escapesESC() {
        let payload = Data([0xDB])
        let encoded = SlipCodec.encode(payload)
        XCTAssertEqual(encoded.hexString, "c0 db dd c0")
    }

    func testEncode_mixedEscapes() {
        let payload = Data([0xC0, 0xDB, 0x42])
        let encoded = SlipCodec.encode(payload)
        XCTAssertEqual(encoded.hexString, "c0 db dc db dd 42 c0")
    }

    // Round-trip: encode then decode (incrementally) returns the original payload.
    func testRoundTrip_acrossManyByteValues() {
        let payload = Data((0...255).map { UInt8($0) })
        let encoded = SlipCodec.encode(payload)

        let decoder = SlipCodec.Decoder()
        let frames = decoder.feed(encoded)
        XCTAssertEqual(frames.count, 1)
        XCTAssertEqual(frames[0], payload)
    }

    // Decoder must handle the encoded stream split across multiple feeds (BLE chunks).
    func testDecoder_handlesSplitFeeds() {
        let payload = Data([0xC0, 0x01, 0xDB, 0x02])
        let encoded = SlipCodec.encode(payload)

        let decoder = SlipCodec.Decoder()
        var frames: [Data] = []
        for byte in encoded {
            frames += decoder.feed(Data([byte]))
        }
        XCTAssertEqual(frames.count, 1)
        XCTAssertEqual(frames[0], payload)
    }

    // Two back-to-back frames in one feed should yield two decoded frames.
    func testDecoder_handlesMultipleFrames() {
        let p1 = Data([0x01, 0x02])
        let p2 = Data([0x03, 0x04])
        let stream = SlipCodec.encode(p1) + SlipCodec.encode(p2)

        let decoder = SlipCodec.Decoder()
        let frames = decoder.feed(stream)
        XCTAssertEqual(frames, [p1, p2])
    }

    // Bad escape (END after ESC) should throw.
    func testDecoder_throwsOnBadEscape() {
        let bad = Data([0xC0, 0xDB, 0xC0, 0xC0])
        let decoder = SlipCodec.Decoder()
        XCTAssertThrowsError(try {
            // The decoder API uses Result-style; if it returns instead of throwing,
            // the test should be adapted to assert no frames were emitted and the
            // internal state was reset. Implementer: match the actual API.
            _ = decoder.feed(bad)
        }())
    }
}
```

If `SlipCodec.Decoder.feed` returns `[Data]` (no throw), replace the last test with:

```swift
func testDecoder_dropsBadEscape() {
    let bad = Data([0xC0, 0xDB, 0xC0, 0xC0])
    let decoder = SlipCodec.Decoder()
    let frames = decoder.feed(bad)
    XCTAssertEqual(frames.count, 0, "bad escape should produce no completed frame")
}
```

Use whichever variant matches `SlipCodec.Decoder.feed`'s actual signature (read `apps/mobile/ios/DiveComputer/PeregrineProtocol.swift:107-180` to confirm).

- [ ] **Step 4: Run iOS tests, verify they pass**

```bash
cd apps/mobile/ios && \
xcodebuild test \
  -workspace DiveChef.xcworkspace -scheme DiveChef \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -only-testing:DiveChefTests/SlipCodecTests 2>&1 | tail -30
```
Expected: all SLIP tests pass.

- [ ] **Step 5: Write equivalent Android tests with the SAME vectors**

Create `apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/SlipCodecTest.kt`:

```kotlin
package com.divechef.ble.protocol

import org.junit.Assert.*
import org.junit.Test

class SlipCodecTest {
    @Test fun encode_simplePayload() {
        val encoded = SlipCodec.encode(hex("01 02 03"))
        assertEquals("c0 01 02 03 c0", encoded.hexString())
    }

    @Test fun encode_escapesEND() {
        val encoded = SlipCodec.encode(hex("c0"))
        assertEquals("c0 db dc c0", encoded.hexString())
    }

    @Test fun encode_escapesESC() {
        val encoded = SlipCodec.encode(hex("db"))
        assertEquals("c0 db dd c0", encoded.hexString())
    }

    @Test fun encode_mixedEscapes() {
        val encoded = SlipCodec.encode(hex("c0 db 42"))
        assertEquals("c0 db dc db dd 42 c0", encoded.hexString())
    }

    @Test fun roundTrip_acrossManyByteValues() {
        val payload = ByteArray(256) { it.toByte() }
        val encoded = SlipCodec.encode(payload)

        val decoder = SlipCodec.Decoder()
        val frames = decoder.feed(encoded)
        assertEquals(1, frames.size)
        assertArrayEquals(payload, frames[0])
    }

    @Test fun decoder_handlesSplitFeeds() {
        val payload = hex("c0 01 db 02")
        val encoded = SlipCodec.encode(payload)

        val decoder = SlipCodec.Decoder()
        val frames = mutableListOf<ByteArray>()
        for (b in encoded) {
            frames += decoder.feed(byteArrayOf(b))
        }
        assertEquals(1, frames.size)
        assertArrayEquals(payload, frames[0])
    }

    @Test fun decoder_handlesMultipleFrames() {
        val p1 = hex("01 02"); val p2 = hex("03 04")
        val stream = SlipCodec.encode(p1) + SlipCodec.encode(p2)

        val decoder = SlipCodec.Decoder()
        val frames = decoder.feed(stream)
        assertEquals(2, frames.size)
        assertArrayEquals(p1, frames[0])
        assertArrayEquals(p2, frames[1])
    }

    @Test fun decoder_dropsBadEscape() {
        val bad = hex("c0 db c0 c0")
        val decoder = SlipCodec.Decoder()
        val frames = decoder.feed(bad)
        // Adapt to actual API: if it throws, wrap in assertThrows.
        assertEquals(0, frames.size)
    }
}
```

Adapt `decoder_dropsBadEscape` to match the actual `Decoder.feed` signature in
`apps/mobile/android/app/src/main/java/com/divechef/ble/protocol/SlipCodec.kt`.

- [ ] **Step 6: Run Android tests**

```bash
cd apps/mobile/android && \
./gradlew :app:testDebugUnitTest --tests "com.divechef.ble.protocol.SlipCodecTest"
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/ios/DiveChefTests/SlipCodecTests.swift \
        apps/mobile/ios/DiveChefTests/HexHelper.swift \
        apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/SlipCodecTest.kt \
        apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/HexHelper.kt
git commit -m "test(protocol): SLIP codec round-trip + edge cases (iOS+Android)

Vectors derived from RFC 1055 / shearwater_common.c:34-37. Same vectors
on both platforms to catch port divergence."
```

---

### Task 2.2: BLE Framer (header strip + fragmentation) tests

**Reference behavior (libdc):** `shearwater_common.c:139` — BLE chunks have a 2-byte mini-header; the SLIP-encoded payload is fragmented into 32-byte chunks.

**Files:**
- Create: `apps/mobile/ios/DiveChefTests/BleFramerTests.swift`
- Create: `apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/BleFramerTest.kt`

- [ ] **Step 1: Write iOS tests**

```swift
import XCTest
@testable import DiveChef

final class BleFramerTests: XCTestCase {
    func testFragment_singleChunk_fitsUnderLimit() {
        let payload = Data((0..<10).map { UInt8($0) })
        let chunks = BleFramer.fragment(payload, chunkSize: 32)
        XCTAssertEqual(chunks.count, 1)
        XCTAssertGreaterThan(chunks[0].count, payload.count, "chunk must include 2-byte header")
    }

    func testFragment_splitsExactlyAtBoundary() {
        // 32 chunkSize, 2-byte header => 30 payload bytes per chunk
        let payload = Data((0..<60).map { UInt8($0 & 0xFF) })
        let chunks = BleFramer.fragment(payload, chunkSize: 32)
        XCTAssertEqual(chunks.count, 2)
    }

    func testStripHeader_returnsPayloadOnly() {
        // A real chunk: [hdr0, hdr1, p0, p1, p2]
        let chunk = Data([0x00, 0x05, 0xAA, 0xBB, 0xCC])
        let stripped = try! BleFramer.stripHeader(chunk)
        XCTAssertEqual(stripped, Data([0xAA, 0xBB, 0xCC]))
    }

    func testStripHeader_throwsOnTooShort() {
        XCTAssertThrowsError(try BleFramer.stripHeader(Data([0x00])))
    }

    func testRoundTrip_fragmentThenStripThenConcat() {
        let payload = Data((0..<200).map { UInt8($0 & 0xFF) })
        let chunks = BleFramer.fragment(payload, chunkSize: 32)
        let reassembled = chunks.map { try! BleFramer.stripHeader($0) }
            .reduce(Data()) { $0 + $1 }
        XCTAssertEqual(reassembled, payload)
    }
}
```

- [ ] **Step 2: Run iOS tests**

```bash
cd apps/mobile/ios && xcodebuild test -workspace DiveChef.xcworkspace -scheme DiveChef \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -only-testing:DiveChefTests/BleFramerTests 2>&1 | tail -20
```
Expected: 5 passed.

- [ ] **Step 3: Write equivalent Android tests**

```kotlin
package com.divechef.ble.protocol

import org.junit.Assert.*
import org.junit.Test

class BleFramerTest {
    @Test fun fragment_singleChunk_fitsUnderLimit() {
        val payload = ByteArray(10) { it.toByte() }
        val chunks = BleFramer.fragment(payload, 32)
        assertEquals(1, chunks.size)
        assertTrue("chunk must include 2-byte header", chunks[0].size > payload.size)
    }

    @Test fun fragment_splitsAtBoundary() {
        val payload = ByteArray(60) { (it and 0xFF).toByte() }
        val chunks = BleFramer.fragment(payload, 32)
        assertEquals(2, chunks.size)
    }

    @Test fun stripHeader_returnsPayloadOnly() {
        val chunk = hex("00 05 aa bb cc")
        val stripped = BleFramer.stripHeader(chunk)
        assertArrayEquals(hex("aa bb cc"), stripped)
    }

    @Test(expected = PeregrineProtocolException.BleFrameTooShort::class)
    fun stripHeader_throwsOnTooShort() {
        BleFramer.stripHeader(hex("00"))
    }

    @Test fun roundTrip_fragmentThenStripThenConcat() {
        val payload = ByteArray(200) { (it and 0xFF).toByte() }
        val chunks = BleFramer.fragment(payload, 32)
        val reassembled = chunks
            .map { BleFramer.stripHeader(it) }
            .reduce { acc, b -> acc + b }
        assertArrayEquals(payload, reassembled)
    }
}
```

If the Android exception name differs (look at `apps/mobile/android/app/src/main/java/com/divechef/ble/protocol/Exceptions.kt`), match it exactly.

- [ ] **Step 4: Run Android tests**

```bash
cd apps/mobile/android && ./gradlew :app:testDebugUnitTest --tests "com.divechef.ble.protocol.BleFramerTest"
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/ios/DiveChefTests/BleFramerTests.swift \
        apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/BleFramerTest.kt
git commit -m "test(protocol): BLE framer fragmentation + header strip tests

Vectors verify the 2-byte mini-header is added/stripped and the 32-byte
chunk boundary matches shearwater_common.c:139."
```

---

### Task 2.3: Wrap codec (request/response framing) tests

**Reference behavior (libdc):** `shearwater_common.c:343-371` — request wrap header `[0xFF, 0x01, len, ...]`, response wrap header `[0x01, 0xFF, len, ...]`. Length byte covers the inner payload size; length checks are validated on parse.

**Files:**
- Create: `apps/mobile/ios/DiveChefTests/WrapCodecTests.swift`
- Create: `apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/WrapCodecTest.kt`

- [ ] **Step 1: Inspect the actual wrap format**

Read `apps/mobile/ios/DiveComputer/PeregrineProtocol.swift:218-248` (function `wrapRequest` and `unwrapResponse`) to confirm the exact byte layout — especially whether there's a checksum byte after the payload, and how length is encoded.

Document the format you observe at the top of the test file as a comment (so the next reader doesn't have to re-derive it).

- [ ] **Step 2: Write iOS tests**

```swift
import XCTest
@testable import DiveChef

final class WrapCodecTests: XCTestCase {
    // Document the format here based on Step 1 inspection, e.g.:
    // Request:  [0xFF, 0x01, len, ...payload..., (optional checksum)]
    // Response: [0x01, 0xFF, len, ...payload..., (optional checksum)]

    func testWrapRequest_addsHeader() {
        let payload = Data([0x22, 0x80, 0x10])  // RDBI(ID_SERIAL)
        let wrapped = WrapCodec.wrapRequest(payload)
        XCTAssertEqual(wrapped[0], Peregrine.REQ_HDR_0)
        XCTAssertEqual(wrapped[1], Peregrine.REQ_HDR_1)
        XCTAssertEqual(Int(wrapped[2]), payload.count, "length byte should equal payload size")
        let recoveredPayload = wrapped.subdata(in: 3..<(3 + payload.count))
        XCTAssertEqual(recoveredPayload, payload)
    }

    func testUnwrapResponse_stripsValidResponseHeader() {
        let payload = Data([0x62, 0x80, 0x10, 0x12, 0x34])
        // Construct a valid response: [RSP_HDR_0, RSP_HDR_1, len, ...payload]
        var wrapped = Data([Peregrine.RSP_HDR_0, Peregrine.RSP_HDR_1, UInt8(payload.count)])
        wrapped.append(payload)
        // If wrapRequest appends a checksum, mirror that here.
        let unwrapped = try! WrapCodec.unwrapResponse(wrapped)
        XCTAssertEqual(unwrapped, payload)
    }

    func testUnwrapResponse_throwsOnBadHeader() {
        let bad = Data([0xAA, 0xBB, 0x02, 0x01, 0x02])
        XCTAssertThrowsError(try WrapCodec.unwrapResponse(bad))
    }

    func testUnwrapResponse_throwsOnLengthMismatch() {
        // length byte says 5 but only 2 payload bytes follow
        let bad = Data([Peregrine.RSP_HDR_0, Peregrine.RSP_HDR_1, 0x05, 0x01, 0x02])
        XCTAssertThrowsError(try WrapCodec.unwrapResponse(bad))
    }

    func testRoundTrip_wrapThenUnwrap_simulatedLoopback() {
        // Note: wrap is request-direction only; for loopback we manually flip
        // the header bytes to the response direction.
        let payload = Data([0x22, 0x80, 0x21])
        let wrappedReq = WrapCodec.wrapRequest(payload)
        var wrappedRsp = wrappedReq
        wrappedRsp[0] = Peregrine.RSP_HDR_0
        wrappedRsp[1] = Peregrine.RSP_HDR_1
        let unwrapped = try! WrapCodec.unwrapResponse(wrappedRsp)
        XCTAssertEqual(unwrapped, payload)
    }
}
```

If the actual format has a trailing checksum, add a `testWrapRequest_appendsChecksum` and a checksum-mismatch test.

- [ ] **Step 3: Run iOS tests**

Same xcodebuild command as previous tasks, scoped to `WrapCodecTests`.

- [ ] **Step 4: Mirror to Android**

Translate the same five tests into Kotlin/JUnit using `WrapCodec.wrapRequest()` / `WrapCodec.unwrapResponse()` and `Peregrine.REQ_HDR_0`, etc. Same vectors.

- [ ] **Step 5: Run Android tests**

```bash
cd apps/mobile/android && ./gradlew :app:testDebugUnitTest --tests "com.divechef.ble.protocol.WrapCodecTest"
```
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/ios/DiveChefTests/WrapCodecTests.swift \
        apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/WrapCodecTest.kt
git commit -m "test(protocol): wrap codec header + length validation tests

Verifies the request/response wrap header bytes (0xFF 0x01 / 0x01 0xFF)
and the length-byte semantics from shearwater_common.c:343-371."
```

---

### Task 2.4: RDBI / WDBI (Read/Write Data By Identifier) tests

**Reference behavior (libdc):** `shearwater_common.c:530-570` for RDBI, `:587-593` for WDBI. NAK sentinel is `[0x7F, sid, code]`. Positive RDBI response is `[0x62, hi, lo, ...data]`. Positive WDBI response is `[0x6E, hi, lo]`.

**Files:**
- Create: `apps/mobile/ios/DiveChefTests/RdbiWdbiTests.swift`
- Create: `apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/RdbiWdbiTest.kt`

- [ ] **Step 1: Write iOS tests**

```swift
import XCTest
@testable import DiveChef

final class RdbiWdbiTests: XCTestCase {

    // ---- RDBI request format ----
    func testRDBI_request_buildsCorrectBytes() {
        let req = RDBI.request(id: 0x8010)  // ID_SERIAL
        XCTAssertEqual(req, Data([0x22, 0x80, 0x10]))
    }

    func testRDBI_request_handlesMaxID() {
        let req = RDBI.request(id: 0xFFFF)
        XCTAssertEqual(req, Data([0x22, 0xFF, 0xFF]))
    }

    // ---- RDBI parse: positive ----
    func testRDBI_parse_returnsDataPayload() {
        let response = Data([0x62, 0x80, 0x10, 0x53, 0x4E, 0x31, 0x32, 0x33])
        let payload = try! RDBI.parse(response: response, id: 0x8010)
        XCTAssertEqual(payload, Data([0x53, 0x4E, 0x31, 0x32, 0x33]))
    }

    func testRDBI_parse_returnsEmptyPayload() {
        let response = Data([0x62, 0x80, 0x10])
        let payload = try! RDBI.parse(response: response, id: 0x8010)
        XCTAssertEqual(payload, Data())
    }

    // ---- RDBI parse: NAK ----
    func testRDBI_parse_throwsNak() {
        let nak = Data([0x7F, 0x22, 0x31])  // 0x31 = requestOutOfRange
        XCTAssertThrowsError(try RDBI.parse(response: nak, id: 0x8010)) { error in
            guard case PeregrineProtocolError.nak(let req, let code) = error else {
                XCTFail("Expected nak error, got \(error)"); return
            }
            XCTAssertEqual(req, 0x22)
            XCTAssertEqual(code, 0x31)
        }
    }

    // ---- RDBI parse: malformed ----
    func testRDBI_parse_throwsOnWrongSID() {
        let bad = Data([0x99, 0x80, 0x10])  // not 0x62
        XCTAssertThrowsError(try RDBI.parse(response: bad, id: 0x8010))
    }

    func testRDBI_parse_throwsOnWrongID() {
        let bad = Data([0x62, 0x80, 0x11])  // requested 0x8010 but got 0x8011
        XCTAssertThrowsError(try RDBI.parse(response: bad, id: 0x8010))
    }

    // ---- WDBI request format ----
    func testWDBI_request_noData() {
        let req = WDBI.request(id: 0x8021)
        XCTAssertEqual(req, Data([0x2E, 0x80, 0x21]))
    }

    func testWDBI_request_withData() {
        let req = WDBI.request(id: 0x8021, data: Data([0x00, 0x00, 0x00, 0x00]))
        XCTAssertEqual(req, Data([0x2E, 0x80, 0x21, 0x00, 0x00, 0x00, 0x00]))
    }

    // ---- WDBI validate: positive ----
    func testWDBI_validate_acceptsValidResponse() {
        let response = Data([0x6E, 0x80, 0x21])
        XCTAssertNoThrow(try WDBI.validate(response: response, id: 0x8021))
    }

    // ---- WDBI validate: NAK ----
    func testWDBI_validate_throwsNak() {
        let nak = Data([0x7F, 0x2E, 0x33])
        XCTAssertThrowsError(try WDBI.validate(response: nak, id: 0x8021)) { error in
            guard case PeregrineProtocolError.nak(let req, let code) = error else {
                XCTFail("Expected nak"); return
            }
            XCTAssertEqual(req, 0x2E)
            XCTAssertEqual(code, 0x33)
        }
    }

    // ---- WDBI validate: malformed ----
    func testWDBI_validate_throwsOnWrongSID() {
        let bad = Data([0x99, 0x80, 0x21])
        XCTAssertThrowsError(try WDBI.validate(response: bad, id: 0x8021))
    }
}
```

- [ ] **Step 2: Run iOS tests, all pass**

- [ ] **Step 3: Mirror tests to Android**

Translate the 11 tests into Kotlin/JUnit using `RDBI.request`, `RDBI.parse`, `WDBI.request`, `WDBI.validate` from `apps/mobile/android/app/src/main/java/com/divechef/ble/protocol/RdbiWdbi.kt`. Use `assertThrows<PeregrineProtocolException.Nak> { ... }` for NAK cases and verify `e.requestSid` / `e.code` match.

- [ ] **Step 4: Run Android tests**

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/ios/DiveChefTests/RdbiWdbiTests.swift \
        apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/RdbiWdbiTest.kt
git commit -m "test(protocol): RDBI/WDBI request build + response parse + NAK tests

Covers the full happy/sad path matrix from shearwater_common.c:530-593
including 0x22/0x62 RDBI, 0x2E/0x6E WDBI, and 0x7F NAK with code byte."
```

---

### Task 2.5: BlockDownload (init/block/quit) tests

**Reference behavior (libdc):** `shearwater_common.c:391-519`. Init request `[0x35, compFlag, 0x34, addrBE32, sizeBE24]`; init response `[0x75, 0x10, blockSize]`. Block request `[0x36, blockNum]`; block response `[0x76, blockNum, ...payload]`. Quit request `[0x37]`; quit response `[0x77, 0x00]`. Block numbers start at 1 and wrap on 8 bits.

**Files:**
- Create: `apps/mobile/ios/DiveChefTests/BlockDownloadTests.swift`
- Create: `apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/BlockDownloadTest.kt`

- [ ] **Step 1: Write iOS tests**

```swift
import XCTest
@testable import DiveChef

final class BlockDownloadTests: XCTestCase {

    // ---- initRequest ----
    func testInitRequest_uncompressed() {
        let req = BlockDownload.initRequest(
            address: 0xE0000000, size: 0x600, compression: false)
        // [0x35, 0x00 (uncompressed), 0x34, addrBE32(4 bytes), sizeBE24(3 bytes)]
        XCTAssertEqual(req, Data([
            0x35, 0x00, 0x34,
            0xE0, 0x00, 0x00, 0x00,
            0x00, 0x06, 0x00,
        ]))
    }

    func testInitRequest_compressed() {
        let req = BlockDownload.initRequest(
            address: 0xC0000000, size: 0xFFFFFF, compression: true)
        XCTAssertEqual(req, Data([
            0x35, 0x10, 0x34,
            0xC0, 0x00, 0x00, 0x00,
            0xFF, 0xFF, 0xFF,
        ]))
    }

    // ---- parseInitResponse ----
    func testParseInitResponse_validReturnsBlockSize() {
        let resp = Data([0x75, 0x10, 0xF8])
        let blockSize = try! BlockDownload.parseInitResponse(resp)
        XCTAssertEqual(blockSize, 0xF8)
    }

    func testParseInitResponse_throwsOnNak() {
        let nak = Data([0x7F, 0x35, 0x31])
        XCTAssertThrowsError(try BlockDownload.parseInitResponse(nak))
    }

    func testParseInitResponse_throwsOnBlockSizeTooLarge() {
        let bad = Data([0x75, 0x10, 0xFF])  // > SZ_PACKET 0xFE
        // Adapt assertion to match parseInitResponse's actual threshold check.
        XCTAssertThrowsError(try BlockDownload.parseInitResponse(bad))
    }

    // ---- blockRequest ----
    func testBlockRequest_buildsCorrectBytes() {
        let req = BlockDownload.blockRequest(blockNum: 0x42)
        XCTAssertEqual(req, Data([0x36, 0x42]))
    }

    func testBlockRequest_acceptsZeroAndMax() {
        XCTAssertEqual(BlockDownload.blockRequest(blockNum: 0x00), Data([0x36, 0x00]))
        XCTAssertEqual(BlockDownload.blockRequest(blockNum: 0xFF), Data([0x36, 0xFF]))
    }

    // ---- parseBlockResponse ----
    func testParseBlockResponse_returnsPayload() {
        let resp = Data([0x76, 0x05, 0xAA, 0xBB, 0xCC])
        let payload = try! BlockDownload.parseBlockResponse(resp, expectedBlock: 0x05)
        XCTAssertEqual(payload, Data([0xAA, 0xBB, 0xCC]))
    }

    func testParseBlockResponse_throwsOnBlockMismatch() {
        let resp = Data([0x76, 0x05, 0xAA])
        XCTAssertThrowsError(try BlockDownload.parseBlockResponse(resp, expectedBlock: 0x06))
    }

    func testParseBlockResponse_throwsOnWrongSID() {
        let resp = Data([0x99, 0x05, 0xAA])
        XCTAssertThrowsError(try BlockDownload.parseBlockResponse(resp, expectedBlock: 0x05))
    }

    // ---- quit ----
    func testQuitRequest_isCorrect() {
        XCTAssertEqual(BlockDownload.quitRequest, Data([0x37]))
    }

    func testParseQuitResponse_acceptsValid() {
        XCTAssertNoThrow(try BlockDownload.parseQuitResponse(Data([0x77, 0x00])))
    }

    func testParseQuitResponse_throwsOnInvalid() {
        XCTAssertThrowsError(try BlockDownload.parseQuitResponse(Data([0x77, 0x01])))
    }
}
```

- [ ] **Step 2: Run iOS tests**

- [ ] **Step 3: Mirror to Android**

Translate the 12 tests. The big-endian address encoding and the 24-bit size encoding are the most likely places for off-by-one or endianness bugs — preserve the exact byte arrays.

- [ ] **Step 4: Run Android tests**

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/ios/DiveChefTests/BlockDownloadTests.swift \
        apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/BlockDownloadTest.kt
git commit -m "test(protocol): block download init/block/quit request+response tests

Vectors exercise both compressed (0x10) and uncompressed (0x00) init
payloads, address big-endian encoding, block-number echo, and the 0x77
0x00 quit handshake — shearwater_common.c:391-519."
```

---

### Task 2.6: LRE + XOR Decompression tests

**Reference behavior (libdc):** `shearwater_petrel.c:76-132`. LRE is 9-bit run-length encoding: bit 0 = literal-or-run flag, bits 1-8 = byte/run-length. End-of-stream is signalled by a specific marker. After LRE-decompress, an XOR phase rotates each byte against a key derived from offset.

**Files:**
- Create: `apps/mobile/ios/DiveChefTests/DecompressTests.swift`
- Create: `apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/DecompressTest.kt`

- [ ] **Step 1: Inspect the LRE/XOR implementation**

Read `apps/mobile/ios/DiveComputer/PeregrineProtocol.swift:382-435` and the matching Android `Decompress.kt`. Confirm:
- Exact bit layout of the 9-bit code (which bit is the flag).
- End-of-stream sentinel value.
- XOR key formula (offset-based?).

- [ ] **Step 2: Build a known good test vector**

Pick a small synthetic dive payload (16-32 bytes) that exercises:
- Pure literal sequence
- Pure run sequence (one byte repeated)
- Mixed literals and runs
- The end-of-stream marker

Compute the LRE-encoded form by hand or from a small Python helper — paste both forms (encoded hex, decoded hex) into the test.

- [ ] **Step 3: Write iOS tests**

```swift
import XCTest
@testable import DiveChef

final class DecompressTests: XCTestCase {

    // Pure-literal case: each input byte encoded as a literal.
    // Encoded:  <derived from Step 2>
    // Decoded:  [0x01, 0x02, 0x03, 0x04]
    func testLRE_literalsOnly() {
        let encoded = Data(hex: "<from Step 2>")
        let decoded = Data([0x01, 0x02, 0x03, 0x04])
        let (out, isFinal) = try! Decompress.lre(encoded)
        XCTAssertEqual(out, decoded)
        XCTAssertTrue(isFinal)
    }

    // Run case: one byte repeated N times.
    func testLRE_runOnly() {
        let encoded = Data(hex: "<run-of-five-0xAA>")
        let decoded = Data([0xAA, 0xAA, 0xAA, 0xAA, 0xAA])
        let (out, isFinal) = try! Decompress.lre(encoded)
        XCTAssertEqual(out, decoded)
        XCTAssertTrue(isFinal)
    }

    // Mixed: some literals followed by a run followed by literals.
    func testLRE_mixed() {
        let encoded = Data(hex: "<mixed-from-Step-2>")
        let decoded = Data(hex: "<expected-from-Step-2>")
        let (out, _) = try! Decompress.lre(encoded)
        XCTAssertEqual(out, decoded)
    }

    // Misaligned bit count → throws decompressionAlignment.
    func testLRE_misalignedBits() {
        let bad = Data([0x00])  // 8 bits, not multiple of 9
        XCTAssertThrowsError(try Decompress.lre(bad))
    }

    // XOR phase is its own pure function.
    func testXOR_invertibility() {
        var data = Data([0x42, 0x99, 0xFF, 0x01])
        let original = data
        Decompress.xorPhase(&data)
        Decompress.xorPhase(&data)  // applying twice should recover the input
        XCTAssertEqual(data, original)
    }

    // Full pipeline (LRE + XOR) on a small vector.
    func testFull_decompressesSyntheticVector() {
        let compressed = Data(hex: "<full-vector-from-Step-2>")
        let expected = Data(hex: "<expected-decoded>")
        let actual = try! Decompress.full(compressed)
        XCTAssertEqual(actual, expected)
    }
}
```

- [ ] **Step 4: Run iOS tests**

- [ ] **Step 5: Test the IncrementalLREDetector separately**

Add to the same file:

```swift
final class IncrementalLREDetectorTests: XCTestCase {
    func testDetector_signalsEndOfStream() {
        let detector = IncrementalLREDetector()
        // Feed all bytes except the final EOS marker.
        let _ = detector.feed(Data(hex: "<prefix>"))
        XCTAssertFalse(detector.isDone)
        let done = detector.feed(Data(hex: "<eos-marker>"))
        XCTAssertTrue(done || detector.isDone)
    }

    func testDetector_doesNotSignalForIncomplete() {
        let detector = IncrementalLREDetector()
        let done = detector.feed(Data([0x01, 0x02, 0x03]))
        XCTAssertFalse(done)
        XCTAssertFalse(detector.isDone)
    }
}
```

- [ ] **Step 6: Mirror everything to Android**

Use the same hex vectors. The IncrementalLREDetector test is critical because end-of-stream detection drives the dive download loop's exit condition.

- [ ] **Step 7: Run Android tests**

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/ios/DiveChefTests/DecompressTests.swift \
        apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/DecompressTest.kt
git commit -m "test(protocol): LRE+XOR decompression and EOS detector tests

Synthetic vectors cover pure literals, pure runs, mixed sequences, and
the end-of-stream sentinel. XOR phase verified by double-application
invertibility. Mirrors shearwater_petrel.c:76-132."
```

---

### Task 2.7: Manifest parsing tests

**Reference behavior (libdc):** `shearwater_petrel.c:272-293`. A 32-byte record starts with a 16-bit big-endian header: `0xA5C4` = valid, `0x5A23` = deleted (skip), anything else = end of manifest. Bytes 4-7 are the fingerprint; bytes 20-23 are the dive's storage offset (big-endian 32-bit).

**Files:**
- Create: `apps/mobile/ios/DiveChefTests/ManifestTests.swift`
- Create: `apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/ManifestTest.kt`

- [ ] **Step 1: Helper to build synthetic 32-byte records**

Add to the iOS test file:

```swift
private func makeRecord(header: UInt16, fingerprint: [UInt8], address: UInt32) -> Data {
    var rec = Data(count: 32)
    rec[0] = UInt8(header >> 8)
    rec[1] = UInt8(header & 0xFF)
    rec.replaceSubrange(4..<8, with: fingerprint)
    rec[20] = UInt8((address >> 24) & 0xFF)
    rec[21] = UInt8((address >> 16) & 0xFF)
    rec[22] = UInt8((address >> 8) & 0xFF)
    rec[23] = UInt8(address & 0xFF)
    return rec
}
```

- [ ] **Step 2: Write iOS tests**

```swift
final class ManifestTests: XCTestCase {

    func testParse_emptyData_returnsNoRecords() {
        XCTAssertEqual(Manifest.parse(Data()), [])
    }

    func testParse_singleValidRecord() {
        let rec = makeRecord(header: Peregrine.MARK_VALID,
                             fingerprint: [0x11, 0x22, 0x33, 0x44],
                             address: 0x1000)
        let parsed = Manifest.parse(rec)
        XCTAssertEqual(parsed.count, 1)
        XCTAssertEqual(parsed[0].index, 1)
        XCTAssertEqual(parsed[0].address, 0x1000)
        XCTAssertEqual(parsed[0].fingerprint, Data([0x11, 0x22, 0x33, 0x44]))
    }

    func testParse_skipsDeletedRecords() {
        var blob = Data()
        blob.append(makeRecord(header: Peregrine.MARK_VALID,
                               fingerprint: [0x01, 0x01, 0x01, 0x01], address: 0x100))
        blob.append(makeRecord(header: Peregrine.MARK_DELETED,
                               fingerprint: [0xFF, 0xFF, 0xFF, 0xFF], address: 0x200))
        blob.append(makeRecord(header: Peregrine.MARK_VALID,
                               fingerprint: [0x02, 0x02, 0x02, 0x02], address: 0x300))
        let parsed = Manifest.parse(blob)
        XCTAssertEqual(parsed.count, 2, "deleted record should be skipped")
        XCTAssertEqual(parsed[0].index, 1)
        XCTAssertEqual(parsed[1].index, 2, "indices renumber sequentially over kept records")
        XCTAssertEqual(parsed[0].address, 0x100)
        XCTAssertEqual(parsed[1].address, 0x300)
    }

    func testParse_terminatesAtUnknownHeader() {
        var blob = Data()
        blob.append(makeRecord(header: Peregrine.MARK_VALID,
                               fingerprint: [0xAA, 0xBB, 0xCC, 0xDD], address: 0x1000))
        // Anything other than VALID/DELETED ends parsing.
        blob.append(makeRecord(header: 0xFFFF,
                               fingerprint: [0x00, 0x00, 0x00, 0x00], address: 0x2000))
        blob.append(makeRecord(header: Peregrine.MARK_VALID,
                               fingerprint: [0x99, 0x99, 0x99, 0x99], address: 0x3000))
        let parsed = Manifest.parse(blob)
        XCTAssertEqual(parsed.count, 1, "parser should stop at first unknown header")
    }

    func testParse_truncatedTrailingRecord_isIgnored() {
        let valid = makeRecord(header: Peregrine.MARK_VALID,
                               fingerprint: [0x01, 0x01, 0x01, 0x01], address: 0x100)
        let truncated = valid + Data([0xA5, 0xC4, 0x00])  // < 32 bytes after the valid one
        let parsed = Manifest.parse(truncated)
        XCTAssertEqual(parsed.count, 1)
    }

    func testParse_addressBigEndian() {
        let rec = makeRecord(header: Peregrine.MARK_VALID,
                             fingerprint: [0,0,0,0],
                             address: 0xDEADBEEF)
        let parsed = Manifest.parse(rec)
        XCTAssertEqual(parsed[0].address, 0xDEADBEEF)
    }
}
```

- [ ] **Step 3: Run iOS tests**

- [ ] **Step 4: Mirror to Android with the same helper + vectors**

```kotlin
package com.divechef.ble.protocol

import org.junit.Assert.*
import org.junit.Test

private fun makeRecord(header: Int, fingerprint: ByteArray, address: Long): ByteArray {
    val rec = ByteArray(32)
    rec[0] = ((header shr 8) and 0xFF).toByte()
    rec[1] = (header and 0xFF).toByte()
    System.arraycopy(fingerprint, 0, rec, 4, 4)
    rec[20] = ((address shr 24) and 0xFF).toByte()
    rec[21] = ((address shr 16) and 0xFF).toByte()
    rec[22] = ((address shr 8) and 0xFF).toByte()
    rec[23] = (address and 0xFF).toByte()
    return rec
}

class ManifestTest {
    // Translate the 6 iOS tests verbatim, using makeRecord above.
}
```

- [ ] **Step 5: Run Android tests**

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/ios/DiveChefTests/ManifestTests.swift \
        apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/ManifestTest.kt
git commit -m "test(protocol): manifest record parsing tests

Verifies VALID/DELETED/unknown header handling, big-endian address
field, fingerprint extraction, and index renumbering across the
deleted-skip and end-of-manifest cases — shearwater_petrel.c:272-293."
```

---

### Task 2.8: LogbookFormat (base address + manifest address) tests

**Reference behavior (libdc):** `shearwater_petrel.c:215-240`. The logupload response's high byte (offset +1 in the RDBI payload) determines the base address: `0x80` → `0x80000000`, anything else → `0xC0000000`. The manifest address depends on the base: `0x80000000` → `0xE0000000`, `0xC0000000` → `0xFFFF0000`.

**Files:**
- Create: `apps/mobile/ios/DiveChefTests/LogbookFormatTests.swift`
- Create: `apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/LogbookFormatTest.kt`

- [ ] **Step 1: Write iOS tests**

```swift
import XCTest
@testable import DiveChef

final class LogbookFormatTests: XCTestCase {

    // ---- baseAddress: high-byte threshold ----
    func testBaseAddress_legacyPetrel_0x80() {
        // [tag, 0x80, ...]
        let resp = Data([0x00, 0x80, 0x00, 0x00, 0x00])
        XCTAssertEqual(try! LogbookFormat.baseAddress(fromLogUploadResponse: resp), 0x80000000)
    }

    func testBaseAddress_perdixAI_0x90() {
        let resp = Data([0x00, 0x90, 0x00, 0x00, 0x00])
        XCTAssertEqual(try! LogbookFormat.baseAddress(fromLogUploadResponse: resp), 0xC0000000)
    }

    func testBaseAddress_peregrine_0xC0() {
        let resp = Data([0x00, 0xC0, 0x00, 0x00, 0x00])
        XCTAssertEqual(try! LogbookFormat.baseAddress(fromLogUploadResponse: resp), 0xC0000000)
    }

    func testBaseAddress_newer_0xDD() {
        let resp = Data([0x00, 0xDD, 0x00, 0x00, 0x00])
        XCTAssertEqual(try! LogbookFormat.baseAddress(fromLogUploadResponse: resp), 0xC0000000)
    }

    func testBaseAddress_throwsOnTooShort() {
        XCTAssertThrowsError(try LogbookFormat.baseAddress(fromLogUploadResponse: Data([0x00, 0x80])))
    }

    // ---- manifestAddress: derived from base ----
    func testManifestAddress_legacyBase_returnsE0() {
        XCTAssertEqual(LogbookFormat.manifestAddress(forBase: 0x80000000), 0xE0000000)
    }

    func testManifestAddress_newBase_returnsFFFF() {
        XCTAssertEqual(LogbookFormat.manifestAddress(forBase: 0xC0000000), 0xFFFF0000)
    }
}
```

- [ ] **Step 2: Run iOS tests**

- [ ] **Step 3: Mirror to Android**

```kotlin
class LogbookFormatTest {
    @Test fun baseAddress_legacy_0x80() =
        assertEquals(0x80000000L, LogbookFormat.baseAddress(hex("00 80 00 00 00")))
    @Test fun baseAddress_perdixAI_0x90() =
        assertEquals(0xC0000000L, LogbookFormat.baseAddress(hex("00 90 00 00 00")))
    @Test fun baseAddress_peregrine_0xC0() =
        assertEquals(0xC0000000L, LogbookFormat.baseAddress(hex("00 c0 00 00 00")))
    @Test fun baseAddress_newer_0xDD() =
        assertEquals(0xC0000000L, LogbookFormat.baseAddress(hex("00 dd 00 00 00")))

    @Test(expected = PeregrineProtocolException.UnexpectedResponse::class)
    fun baseAddress_throwsOnTooShort() {
        LogbookFormat.baseAddress(hex("00 80"))
    }

    @Test fun manifestAddress_legacyBase_returnsE0() =
        assertEquals(0xE0000000L, LogbookFormat.manifestAddress(0x80000000L))
    @Test fun manifestAddress_newBase_returnsFFFF() =
        assertEquals(0xFFFF0000L, LogbookFormat.manifestAddress(0xC0000000L))
}
```

- [ ] **Step 4: Run Android tests**

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/ios/DiveChefTests/LogbookFormatTests.swift \
        apps/mobile/android/app/src/test/java/com/divechef/ble/protocol/LogbookFormatTest.kt
git commit -m "test(protocol): logbook base/manifest address mapping tests

Verifies all four high-byte cases (0x80, 0x90, 0xC0, 0xDD) map to the
correct base address, and that manifest addresses are derived correctly
from the base — shearwater_petrel.c:215-240."
```

---

## Phase 3 — CI Integration

### Task 3.1: Wire the tests into CI

**Files:**
- Modify: `.github/workflows/ci.yml` (or whichever CI config exists; check first)

- [ ] **Step 1: Locate the existing CI config**

```bash
find .github -name "*.yml" 2>/dev/null
```
If no CI exists, skip Phase 3 entirely and document a manual run script in `apps/mobile/README.md` instead.

- [ ] **Step 2: Add an iOS test job**

Append (or modify) the existing iOS lane:

```yaml
  ios-protocol-tests:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - run: pnpm install --filter @divechef/mobile
      - run: cd apps/mobile/ios && pod install
      - run: |
          cd apps/mobile/ios
          xcodebuild test \
            -workspace DiveChef.xcworkspace -scheme DiveChef \
            -destination 'platform=iOS Simulator,name=iPhone 15' \
            -only-testing:DiveChefTests
```

- [ ] **Step 3: Add an Android test job**

```yaml
  android-protocol-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: 'temurin', java-version: '17' }
      - run: cd apps/mobile/android && ./gradlew :app:testDebugUnitTest
```

- [ ] **Step 4: Open a PR, watch CI**

Confirm both jobs run and pass on the PR branch.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/
git commit -m "ci: run Peregrine protocol unit tests on iOS and Android

Adds matrix jobs for the XCTest target and Gradle test task. These
catch protocol regressions before they reach the device-validation
stage."
```

---

## Self-Review Checklist (run before handoff)

- Every task lists exact file paths.
- Every code step shows the actual code, not a description.
- Test vectors are concrete hex strings, not "TBD".
- Same vectors appear on iOS and Android (Tasks 2.1-2.8).
- The XCTest target setup (Task 1.1) uses `@testable import DiveChef`, which requires `ENABLE_TESTABILITY=YES` on the app target's Debug config — verify this in Step 3 of Task 1.1 if the smoke test fails to import.
- LRE/XOR vectors (Task 2.6) are placeholders that depend on Step 1 inspection. The implementer must fill in real vectors after reading `Decompress.swift`. If they cannot, dispatch a follow-up to derive vectors from a tiny libdc-driver run captured to disk.

---

## Execution Notes

- Phase 1 tasks (1.1, 1.2) MUST run before any Phase 2 task.
- Phase 1 tasks themselves can run in parallel — iOS and Android setups are independent.
- Phase 2 tasks (2.1 through 2.8) are mutually independent. Dispatch them to subagents in parallel.
- Phase 3 must run last (depends on all tests existing).
- If a subagent finds the protocol code disagrees with libdc behavior, that's a bug in the implementation, not the test — it should report it back, not "fix" the test to match the bug.
