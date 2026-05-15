package com.divechef.ble.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Test

/**
 * Wrap codec tests — same vectors as iOS WrapCodecTests.swift.
 *
 * Format (from WrapCodec.kt, shearwater_common.c:343-385):
 *   Request:  [0xFF, 0x01, len, 0x00, ...payload]   where len = payload.size + 1
 *   Response: [0x01, 0xFF, len, 0x00, ...payload]   same length encoding
 */
class WrapCodecTest {

    @Test fun wrapRequest_addsHeaderAndLength() {
        val payload = hex("22 80 10")
        val wrapped = WrapCodec.wrapRequest(payload)
        assertArrayEquals(hex("ff 01 04 00 22 80 10"), wrapped)
    }

    @Test fun wrapRequest_emptyPayload() {
        val wrapped = WrapCodec.wrapRequest(ByteArray(0))
        assertArrayEquals(hex("ff 01 01 00"), wrapped)
    }

    @Test fun unwrapResponse_stripsValidHeader() {
        val payload = hex("62 80 10 12 34")
        val wrapped = hex("01 ff 06 00") + payload
        val unwrapped = WrapCodec.unwrapResponse(wrapped)
        assertArrayEquals(payload, unwrapped)
    }

    @Test(expected = PeregrineProtocolException.WrapBadHeader::class)
    fun unwrapResponse_throwsOnBadMagic() {
        WrapCodec.unwrapResponse(hex("aa bb 02 00 01"))
    }

    @Test(expected = PeregrineProtocolException.WrapBadHeader::class)
    fun unwrapResponse_throwsOnNonZeroSeparator() {
        WrapCodec.unwrapResponse(hex("01 ff 02 ff 01"))
    }

    @Test(expected = PeregrineProtocolException.WrapBadLength::class)
    fun unwrapResponse_throwsOnLengthMismatch() {
        WrapCodec.unwrapResponse(hex("01 ff 05 00 01"))
    }

    @Test(expected = PeregrineProtocolException.WrapBadHeader::class)
    fun unwrapResponse_throwsOnTooShort() {
        WrapCodec.unwrapResponse(hex("01 ff 01"))
    }

    /** Round-trip: wrap then flip magic to response form; unwrap recovers payload. */
    @Test fun roundTrip_wrapThenFlipMagicThenUnwrap() {
        val payload = hex("22 80 21")
        val wrapped = WrapCodec.wrapRequest(payload).copyOf()
        wrapped[0] = Peregrine.RSP_HDR_0
        wrapped[1] = Peregrine.RSP_HDR_1
        val unwrapped = WrapCodec.unwrapResponse(wrapped)
        assertArrayEquals(payload, unwrapped)
    }
}
