import XCTest
@testable import DiveChef

final class SlipCodecTests: XCTestCase {
    // Per RFC 1055 / shearwater_common.c: encoded frame is escaped(payload) + END
    // (no leading END — see PeregrineProtocol.swift:104-106).

    func testEncode_simplePayload() {
        let payload = Data([0x01, 0x02, 0x03])
        let encoded = SLIP.encode(payload)
        XCTAssertEqual(encoded.hexString, "01 02 03 c0")
    }

    func testEncode_escapesEND() {
        let payload = Data([0xC0])
        let encoded = SLIP.encode(payload)
        XCTAssertEqual(encoded.hexString, "db dc c0")
    }

    func testEncode_escapesESC() {
        let payload = Data([0xDB])
        let encoded = SLIP.encode(payload)
        XCTAssertEqual(encoded.hexString, "db dd c0")
    }

    func testEncode_mixedEscapes() {
        let payload = Data([0xC0, 0xDB, 0x42])
        let encoded = SLIP.encode(payload)
        XCTAssertEqual(encoded.hexString, "db dc db dd 42 c0")
    }

    // Round-trip: encode then decode (incrementally) returns the original payload.
    func testRoundTrip_acrossManyByteValues() {
        let payload = Data((0...255).map { UInt8($0) })
        let encoded = SLIP.encode(payload)

        let decoder = SLIP.Decoder()
        let frames = decoder.feed(encoded)
        XCTAssertEqual(frames.count, 1)
        XCTAssertEqual(frames[0], payload)
    }

    // Decoder must handle the encoded stream split across multiple feeds (BLE chunks).
    func testDecoder_handlesSplitFeeds() {
        let payload = Data([0xC0, 0x01, 0xDB, 0x02])
        let encoded = SLIP.encode(payload)

        let decoder = SLIP.Decoder()
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
        let stream = SLIP.encode(p1) + SLIP.encode(p2)

        let decoder = SLIP.Decoder()
        let frames = decoder.feed(stream)
        XCTAssertEqual(frames, [p1, p2])
    }

    // Bad escape (END after ESC) — implementation is tolerant per
    // shearwater_common.c:264-271 and PeregrineProtocol.swift:137-140:
    // resets escape state, treats the END as a frame boundary on an empty
    // buffer, and emits no frame. Decoder MUST NOT throw.
    func testDecoder_dropsBadEscape() {
        let bad = Data([0xC0, 0xDB, 0xC0, 0xC0])
        let decoder = SLIP.Decoder()
        let frames = decoder.feed(bad)
        XCTAssertEqual(frames.count, 0, "bad escape should produce no completed frame")
    }
}
