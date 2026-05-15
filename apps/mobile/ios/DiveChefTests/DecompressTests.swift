import XCTest
@testable import DiveChef

/// LRE + XOR decompression tests.
///
/// LRE algorithm (from Decompress.swift:373-413, shearwater_common.c:76-132):
///   - 9-bit codes packed MSB-first across the byte stream.
///   - Total bits MUST be a multiple of 9 (so byte length must be a multiple of 9).
///   - Code with bit 8 set: lower 8 bits are a literal byte → append.
///   - Code with bit 8 clear AND value == 0: end-of-stream marker → stop.
///   - Code with bit 8 clear AND value != 0: append `value` zero bytes (run of zeros).
///
/// XOR phase (from Decompress.swift:417-424):
///   For i in 32..<size: data[i] ^= data[i-32]. Self-inverse.
///
/// Test vectors derived by hand-encoding the codes; see comments per test.
final class DecompressTests: XCTestCase {

    // MARK: - LRE: pure literals
    //
    // 8 codes = 72 bits = 9 bytes:
    //   [0x101, 0x102, 0x103, 0x104, 0x105, 0x106, 0x107, 0x000]
    //   = literals 0x01..0x07 then EOS.
    // Hand-derived encoded form:
    //   [0x80, 0xC0, 0xA0, 0x70, 0x48, 0x2C, 0x1A, 0x0E, 0x00]
    func testLRE_literalsOnly() {
        let encoded = Data([0x80, 0xC0, 0xA0, 0x70, 0x48, 0x2C, 0x1A, 0x0E, 0x00])
        let (out, isFinal) = try! Decompress.lre(encoded)
        XCTAssertEqual(out, Data([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]))
        XCTAssertTrue(isFinal)
    }

    // MARK: - LRE: pure run
    //
    // Codes: [0x005 (run of 5 zeros), 0x000 (EOS), 0x000 × 6 padding]
    // Hand-derived:
    //   [0x02, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    func testLRE_runOnly() {
        let encoded = Data([0x02, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
        let (out, isFinal) = try! Decompress.lre(encoded)
        XCTAssertEqual(out, Data([0x00, 0x00, 0x00, 0x00, 0x00]))
        XCTAssertTrue(isFinal)
    }

    // MARK: - LRE: mixed
    //
    // Codes: [0x101 (lit 0x01), 0x002 (run 2 zeros), 0x103 (lit 0x03), 0x000 (EOS), 0x000 × 4 padding]
    // Hand-derived:
    //   [0x80, 0x80, 0xA0, 0x60, 0x00, 0x00, 0x00, 0x00, 0x00]
    func testLRE_mixed() {
        let encoded = Data([0x80, 0x80, 0xA0, 0x60, 0x00, 0x00, 0x00, 0x00, 0x00])
        let (out, isFinal) = try! Decompress.lre(encoded)
        XCTAssertEqual(out, Data([0x01, 0x00, 0x00, 0x03]))
        XCTAssertTrue(isFinal)
    }

    // MARK: - LRE: alignment

    func testLRE_misalignedBits_throws() {
        // 1 byte = 8 bits, not a multiple of 9.
        XCTAssertThrowsError(try Decompress.lre(Data([0x00])))
    }

    func testLRE_misalignedBits_throws_8bytes() {
        // 8 bytes = 64 bits, not a multiple of 9.
        XCTAssertThrowsError(try Decompress.lre(Data([0,0,0,0,0,0,0,0])))
    }

    // MARK: - LRE: empty input
    //
    // 0 bytes = 0 bits, technically a multiple of 9 → returns empty output, isFinal=false.
    func testLRE_emptyInput() {
        let (out, isFinal) = try! Decompress.lre(Data())
        XCTAssertEqual(out, Data())
        XCTAssertFalse(isFinal, "empty input should NOT produce isFinal=true (no EOS seen)")
    }

    // MARK: - XOR phase

    func testXOR_invertibility_largeBuffer() {
        // Need > 32 bytes for XOR to actually do anything.
        var data = Data((0..<64).map { UInt8($0 & 0xFF) })
        let original = data
        Decompress.xorPhase(&data)
        XCTAssertNotEqual(data, original, "XOR must alter data > 32 bytes")
        Decompress.xorPhase(&data)
        XCTAssertEqual(data, original, "XOR is self-inverse")
    }

    func testXOR_smallBuffer_noOp() {
        var data = Data([0x42, 0x99, 0xFF, 0x01])
        let original = data
        Decompress.xorPhase(&data)
        XCTAssertEqual(data, original, "XOR is no-op for buffers <= 32 bytes")
    }

    func testXOR_exactlyThirtyTwoBytes_noOp() {
        var data = Data((0..<32).map { UInt8($0) })
        let original = data
        Decompress.xorPhase(&data)
        XCTAssertEqual(data, original, "XOR is no-op for buffers of exactly 32 bytes")
    }

    func testXOR_exactByte32_isXorOfByte0() {
        // Construct 33 bytes; verify byte 32 becomes original[32] ^ original[0].
        var data = Data((0..<33).map { UInt8($0) })
        let originalByte0 = data[0]
        let originalByte32 = data[32]
        Decompress.xorPhase(&data)
        XCTAssertEqual(data[32], originalByte32 ^ originalByte0)
    }

    // MARK: - Full pipeline (LRE + XOR)
    //
    // Use the literals-only vector. Decoded length is 7 bytes < 32, so XOR is no-op,
    // and full() should return the same as lre() output.
    func testFull_literalsOnly_xorIsNoOp() {
        let encoded = Data([0x80, 0xC0, 0xA0, 0x70, 0x48, 0x2C, 0x1A, 0x0E, 0x00])
        let actual = try! Decompress.full(encoded)
        XCTAssertEqual(actual, Data([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]))
    }
}

// MARK: - IncrementalLREDetector

/// EOS detector used during streaming dive downloads. Tracks bit offset across
/// `feed()` calls without re-scanning. Critical: drives the dive download loop's
/// exit condition. A bug here = downloads either truncate early or hang forever.
final class IncrementalLREDetectorTests: XCTestCase {

    // 7 literals + EOS, same encoded as DecompressTests.testLRE_literalsOnly.
    private let encodedWithEOS = Data([0x80, 0xC0, 0xA0, 0x70, 0x48, 0x2C, 0x1A, 0x0E, 0x00])

    // 8 literals, no EOS. Codes: [0x101..0x108]. Hand-derived:
    //   [0x80, 0xC0, 0xA0, 0x70, 0x48, 0x2C, 0x1A, 0x0F, 0x08]
    private let encodedNoEOS = Data([0x80, 0xC0, 0xA0, 0x70, 0x48, 0x2C, 0x1A, 0x0F, 0x08])

    func testDetector_signalsEndOfStream_singleFeed() {
        let detector = IncrementalLREDetector()
        let done = detector.feed(encodedWithEOS)
        XCTAssertTrue(done)
        XCTAssertTrue(detector.isDone)
    }

    func testDetector_signalsEndOfStream_byteByByteFeed() {
        let detector = IncrementalLREDetector()
        var doneAtAnyPoint = false
        for byte in encodedWithEOS {
            if detector.feed(Data([byte])) {
                doneAtAnyPoint = true
            }
        }
        XCTAssertTrue(doneAtAnyPoint)
        XCTAssertTrue(detector.isDone)
    }

    func testDetector_doesNotSignalForLiteralOnlyStream() {
        let detector = IncrementalLREDetector()
        let done = detector.feed(encodedNoEOS)
        XCTAssertFalse(done, "8 literals (no EOS code) must NOT signal done")
        XCTAssertFalse(detector.isDone)
    }

    func testDetector_doesNotSignalForEmpty() {
        let detector = IncrementalLREDetector()
        XCTAssertFalse(detector.feed(Data()))
        XCTAssertFalse(detector.isDone)
    }

    func testDetector_remainsLatchedAfterEOS() {
        let detector = IncrementalLREDetector()
        XCTAssertTrue(detector.feed(encodedWithEOS))
        // Subsequent feeds with non-EOS data should still report done.
        XCTAssertTrue(detector.feed(Data([0xFF, 0xFF, 0xFF])))
        XCTAssertTrue(detector.isDone)
    }
}
