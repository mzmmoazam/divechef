import XCTest
@testable import DiveChef

/// RDBI / WDBI request build + response parse + NAK handling.
/// Vectors derived from shearwater_common.c:530-593.
final class RdbiWdbiTests: XCTestCase {

    // MARK: - RDBI request format

    func testRDBI_request_buildsCorrectBytes() {
        XCTAssertEqual(RDBI.request(id: 0x8010), Data([0x22, 0x80, 0x10]))
    }

    func testRDBI_request_handlesMaxID() {
        XCTAssertEqual(RDBI.request(id: 0xFFFF), Data([0x22, 0xFF, 0xFF]))
    }

    // MARK: - RDBI parse: positive

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

    // MARK: - RDBI parse: NAK

    func testRDBI_parse_throwsNak() {
        let nak = Data([0x7F, 0x22, 0x31])
        XCTAssertThrowsError(try RDBI.parse(response: nak, id: 0x8010)) { error in
            guard case PeregrineProtocolError.nak(let req, let code) = error else {
                XCTFail("Expected nak, got \(error)"); return
            }
            XCTAssertEqual(req, 0x22)
            XCTAssertEqual(code, 0x31)
        }
    }

    // MARK: - RDBI parse: malformed

    func testRDBI_parse_throwsOnWrongSID() {
        XCTAssertThrowsError(try RDBI.parse(response: Data([0x99, 0x80, 0x10]), id: 0x8010))
    }

    func testRDBI_parse_throwsOnWrongID() {
        XCTAssertThrowsError(try RDBI.parse(response: Data([0x62, 0x80, 0x11]), id: 0x8010))
    }

    // MARK: - WDBI request format

    func testWDBI_request_noData() {
        XCTAssertEqual(WDBI.request(id: 0x8021), Data([0x2E, 0x80, 0x21]))
    }

    func testWDBI_request_withData() {
        XCTAssertEqual(
            WDBI.request(id: 0x8021, data: Data([0x00, 0x00, 0x00, 0x00])),
            Data([0x2E, 0x80, 0x21, 0x00, 0x00, 0x00, 0x00])
        )
    }

    // MARK: - WDBI validate: positive

    func testWDBI_validate_acceptsValidResponse() {
        XCTAssertNoThrow(try WDBI.validate(response: Data([0x6E, 0x80, 0x21]), id: 0x8021))
    }

    // MARK: - WDBI validate: NAK

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

    func testWDBI_validate_throwsOnWrongSID() {
        XCTAssertThrowsError(try WDBI.validate(response: Data([0x99, 0x80, 0x21]), id: 0x8021))
    }
}
