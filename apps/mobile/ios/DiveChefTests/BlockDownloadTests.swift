import XCTest
@testable import DiveChef

/// BlockDownload init/block/quit tests. Same vectors as Android.
/// shearwater_common.c:391-519. SZ_PACKET = 254 (0xFE).
final class BlockDownloadTests: XCTestCase {

    // MARK: - initRequest format

    func testInitRequest_uncompressed() {
        let req = BlockDownload.initRequest(
            address: 0xE0000000, size: 0x600, compression: false)
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

    func testInitRequest_addressBigEndian_distinctBytes() {
        let req = BlockDownload.initRequest(
            address: 0x12345678, size: 0xABCDEF, compression: false)
        // Bytes 3..6 = address big-endian; bytes 7..9 = size big-endian (24-bit)
        XCTAssertEqual(Array(req[3...6]), [0x12, 0x34, 0x56, 0x78])
        XCTAssertEqual(Array(req[7...9]), [0xAB, 0xCD, 0xEF])
    }

    // MARK: - parseInitResponse

    func testParseInitResponse_validReturnsBlockSize() {
        let blockSize = try! BlockDownload.parseInitResponse(Data([0x75, 0x10, 0xF8]))
        XCTAssertEqual(blockSize, 0xF8)
    }

    func testParseInitResponse_throwsOnNak() {
        XCTAssertThrowsError(try BlockDownload.parseInitResponse(Data([0x7F, 0x35, 0x31])))
    }

    func testParseInitResponse_throwsOnBlockSizeTooLarge() {
        // SZ_PACKET = 254; block size 0xFF (255) must throw.
        XCTAssertThrowsError(try BlockDownload.parseInitResponse(Data([0x75, 0x10, 0xFF])))
    }

    func testParseInitResponse_throwsOnWrongLength() {
        XCTAssertThrowsError(try BlockDownload.parseInitResponse(Data([0x75, 0x10])))
    }

    func testParseInitResponse_throwsOnWrongHeader() {
        XCTAssertThrowsError(try BlockDownload.parseInitResponse(Data([0x76, 0x10, 0xF8])))
    }

    // MARK: - blockRequest

    func testBlockRequest_buildsCorrectBytes() {
        XCTAssertEqual(BlockDownload.blockRequest(blockNum: 0x42), Data([0x36, 0x42]))
    }

    func testBlockRequest_acceptsZeroAndMax() {
        XCTAssertEqual(BlockDownload.blockRequest(blockNum: 0x00), Data([0x36, 0x00]))
        XCTAssertEqual(BlockDownload.blockRequest(blockNum: 0xFF), Data([0x36, 0xFF]))
    }

    // MARK: - parseBlockResponse

    func testParseBlockResponse_returnsPayload() {
        let payload = try! BlockDownload.parseBlockResponse(
            Data([0x76, 0x05, 0xAA, 0xBB, 0xCC]), expectedBlock: 0x05)
        XCTAssertEqual(payload, Data([0xAA, 0xBB, 0xCC]))
    }

    func testParseBlockResponse_emptyPayload() {
        let payload = try! BlockDownload.parseBlockResponse(
            Data([0x76, 0x05]), expectedBlock: 0x05)
        XCTAssertEqual(payload, Data())
    }

    func testParseBlockResponse_throwsOnBlockMismatch() {
        XCTAssertThrowsError(try BlockDownload.parseBlockResponse(
            Data([0x76, 0x05, 0xAA]), expectedBlock: 0x06))
    }

    func testParseBlockResponse_throwsOnWrongSID() {
        XCTAssertThrowsError(try BlockDownload.parseBlockResponse(
            Data([0x99, 0x05, 0xAA]), expectedBlock: 0x05))
    }

    // MARK: - quit

    func testQuitRequest_isCorrect() {
        XCTAssertEqual(BlockDownload.quitRequest, Data([0x37]))
    }

    func testParseQuitResponse_acceptsValid() {
        XCTAssertNoThrow(try BlockDownload.parseQuitResponse(Data([0x77, 0x00])))
    }

    func testParseQuitResponse_throwsOnNonZeroStatus() {
        XCTAssertThrowsError(try BlockDownload.parseQuitResponse(Data([0x77, 0x01])))
    }

    func testParseQuitResponse_throwsOnWrongHeader() {
        XCTAssertThrowsError(try BlockDownload.parseQuitResponse(Data([0x76, 0x00])))
    }

    func testParseQuitResponse_throwsOnTooShort() {
        XCTAssertThrowsError(try BlockDownload.parseQuitResponse(Data([0x77])))
    }
}
