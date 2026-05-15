import XCTest
@testable import DiveChef

final class BleFramerTests: XCTestCase {
    func testFragment_singleChunk_fitsUnderLimit() {
        let payload = Data((0..<10).map { UInt8($0) })
        let chunks = BLEFramer.fragment(payload, chunkSize: 32)
        XCTAssertEqual(chunks.count, 1)
        XCTAssertGreaterThan(chunks[0].count, payload.count, "chunk must include 2-byte header")
    }

    func testFragment_splitsExactlyAtBoundary() {
        // 32 chunkSize, 2-byte header => 30 payload bytes per chunk
        let payload = Data((0..<60).map { UInt8($0 & 0xFF) })
        let chunks = BLEFramer.fragment(payload, chunkSize: 32)
        XCTAssertEqual(chunks.count, 2)
    }

    func testStripHeader_returnsPayloadOnly() {
        // A real chunk: [hdr0, hdr1, p0, p1, p2]
        let chunk = Data([0x00, 0x05, 0xAA, 0xBB, 0xCC])
        let stripped = try! BLEFramer.stripHeader(chunk)
        XCTAssertEqual(stripped, Data([0xAA, 0xBB, 0xCC]))
    }

    func testStripHeader_throwsOnTooShort() {
        XCTAssertThrowsError(try BLEFramer.stripHeader(Data([0x00])))
    }

    func testRoundTrip_fragmentThenStripThenConcat() {
        let payload = Data((0..<200).map { UInt8($0 & 0xFF) })
        let chunks = BLEFramer.fragment(payload, chunkSize: 32)
        let reassembled = chunks.map { try! BLEFramer.stripHeader($0) }
            .reduce(Data()) { $0 + $1 }
        XCTAssertEqual(reassembled, payload)
    }
}
