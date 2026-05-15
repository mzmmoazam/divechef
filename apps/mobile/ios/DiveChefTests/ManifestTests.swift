import XCTest
@testable import DiveChef

/// Manifest record parsing tests. shearwater_petrel.c:272-293.
///
/// Each record is 32 bytes:
///   bytes 0-1:   header (big-endian) — 0xA5C4 valid, 0x5A23 deleted, else end-of-manifest
///   bytes 4-7:   fingerprint (libdc uses for "already seen" detection)
///   bytes 20-23: dive's storage offset relative to base_addr (big-endian 32-bit)
final class ManifestTests: XCTestCase {

    /// Build a synthetic 32-byte record with the given header / fingerprint / address.
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

    func testParse_emptyData_returnsNoRecords() {
        XCTAssertEqual(Manifest.parse(Data()).count, 0)
    }

    func testParse_singleValidRecord() {
        let rec = makeRecord(
            header: Peregrine.MARK_VALID,
            fingerprint: [0x11, 0x22, 0x33, 0x44],
            address: 0x1000
        )
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
        XCTAssertEqual(parsed[1].index, 2,
                       "indices renumber sequentially across kept records")
        XCTAssertEqual(parsed[0].address, 0x100)
        XCTAssertEqual(parsed[1].address, 0x300)
    }

    func testParse_terminatesAtUnknownHeader() {
        var blob = Data()
        blob.append(makeRecord(header: Peregrine.MARK_VALID,
                               fingerprint: [0xAA, 0xBB, 0xCC, 0xDD], address: 0x1000))
        blob.append(makeRecord(header: 0xFFFF,
                               fingerprint: [0x00, 0x00, 0x00, 0x00], address: 0x2000))
        blob.append(makeRecord(header: Peregrine.MARK_VALID,
                               fingerprint: [0x99, 0x99, 0x99, 0x99], address: 0x3000))
        let parsed = Manifest.parse(blob)
        XCTAssertEqual(parsed.count, 1, "parser stops at first unknown header")
        XCTAssertEqual(parsed[0].address, 0x1000,
                       "kept record must be the first one, not a misaligned slice")
        XCTAssertEqual(parsed[0].fingerprint, Data([0xAA, 0xBB, 0xCC, 0xDD]))
    }

    func testParse_truncatedTrailingRecord_isIgnored() {
        let valid = makeRecord(header: Peregrine.MARK_VALID,
                               fingerprint: [0x01, 0x01, 0x01, 0x01], address: 0x100)
        let truncated = valid + Data([0xA5, 0xC4, 0x00])
        let parsed = Manifest.parse(truncated)
        XCTAssertEqual(parsed.count, 1)
    }

    func testParse_addressBigEndian() {
        let rec = makeRecord(header: Peregrine.MARK_VALID,
                             fingerprint: [0, 0, 0, 0], address: 0xDEADBEEF)
        let parsed = Manifest.parse(rec)
        XCTAssertEqual(parsed[0].address, 0xDEADBEEF)
    }

    func testParse_allDeletedRecords_returnsEmpty() {
        var blob = Data()
        for _ in 0..<3 {
            blob.append(makeRecord(header: Peregrine.MARK_DELETED,
                                   fingerprint: [0xFF, 0xFF, 0xFF, 0xFF], address: 0))
        }
        // After all deleted records, the next position is past the end → loop exits.
        XCTAssertEqual(Manifest.parse(blob).count, 0)
    }
}
