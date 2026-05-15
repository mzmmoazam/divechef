import XCTest
@testable import DiveChef

/// Logbook base/manifest address mapping. shearwater_petrel.c:215-240.
/// Logic: 0x80 high byte → 0x80000000 base + 0xE0000000 manifest;
///        anything else  → 0xC0000000 base + 0xFFFF0000 manifest.
final class LogbookFormatTests: XCTestCase {

    // MARK: - baseAddress: high-byte threshold

    func testBaseAddress_legacyPetrel_0x80() {
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
        XCTAssertThrowsError(
            try LogbookFormat.baseAddress(fromLogUploadResponse: Data([0x00, 0x80])))
    }

    func testBaseAddress_acceptsMinimumLength() {
        // exactly 5 bytes is the minimum
        XCTAssertNoThrow(
            try LogbookFormat.baseAddress(fromLogUploadResponse: Data([0x00, 0x80, 0x00, 0x00, 0x00])))
    }

    // MARK: - manifestAddress: derived from base

    func testManifestAddress_legacyBase_returnsE0() {
        XCTAssertEqual(LogbookFormat.manifestAddress(forBase: 0x80000000), 0xE0000000)
    }

    func testManifestAddress_newBase_returnsFFFF() {
        XCTAssertEqual(LogbookFormat.manifestAddress(forBase: 0xC0000000), 0xFFFF0000)
    }
}
