import XCTest
@testable import DiveChef

/// Wrap codec tests — same vectors as Android WrapCodecTest.kt.
///
/// Format (from PeregrineProtocol.swift:215-246, shearwater_common.c:343-385):
///   Request:  [0xFF, 0x01, len, 0x00, ...payload]   where len = payload.count + 1
///   Response: [0x01, 0xFF, len, 0x00, ...payload]   same length encoding
final class WrapCodecTests: XCTestCase {

    func testWrapRequest_addsHeaderAndLength() {
        let payload = Data([0x22, 0x80, 0x10])  // RDBI(ID_SERIAL)
        let wrapped = Wrap.wrapRequest(payload)
        // [0xFF, 0x01, 0x04 (payload.count+1), 0x00, 0x22, 0x80, 0x10]
        XCTAssertEqual(wrapped, Data([0xFF, 0x01, 0x04, 0x00, 0x22, 0x80, 0x10]))
    }

    func testWrapRequest_emptyPayload() {
        let wrapped = Wrap.wrapRequest(Data())
        XCTAssertEqual(wrapped, Data([0xFF, 0x01, 0x01, 0x00]))
    }

    func testUnwrapResponse_stripsValidHeader() {
        let payload = Data([0x62, 0x80, 0x10, 0x12, 0x34])
        // [0x01, 0xFF, len=6, 0x00, ...payload]
        let wrapped = Data([0x01, 0xFF, UInt8(payload.count + 1), 0x00]) + payload
        let unwrapped = try! Wrap.unwrapResponse(wrapped)
        XCTAssertEqual(unwrapped, payload)
    }

    func testUnwrapResponse_throwsOnBadMagic() {
        let bad = Data([0xAA, 0xBB, 0x02, 0x00, 0x01])
        XCTAssertThrowsError(try Wrap.unwrapResponse(bad))
    }

    func testUnwrapResponse_throwsOnNonZeroSeparator() {
        // byte at offset 3 must be 0x00
        let bad = Data([0x01, 0xFF, 0x02, 0xFF, 0x01])
        XCTAssertThrowsError(try Wrap.unwrapResponse(bad))
    }

    func testUnwrapResponse_throwsOnLengthMismatch() {
        // length byte says 5 (=> payload of 4) but only 1 payload byte follows
        let bad = Data([0x01, 0xFF, 0x05, 0x00, 0x01])
        XCTAssertThrowsError(try Wrap.unwrapResponse(bad))
    }

    func testUnwrapResponse_throwsOnTooShort() {
        XCTAssertThrowsError(try Wrap.unwrapResponse(Data([0x01, 0xFF, 0x01])))
    }

    /// Round-trip: wrapRequest then manually flip the magic to response form;
    /// unwrapResponse should recover the payload. This catches length-encoding bugs.
    func testRoundTrip_wrapThenFlipMagicThenUnwrap() {
        let payload = Data([0x22, 0x80, 0x21])
        var wrapped = Wrap.wrapRequest(payload)
        wrapped[0] = Peregrine.RSP_HDR_0
        wrapped[1] = Peregrine.RSP_HDR_1
        let unwrapped = try! Wrap.unwrapResponse(wrapped)
        XCTAssertEqual(unwrapped, payload)
    }
}
