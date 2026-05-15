package com.divechef.ble.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * RDBI / WDBI request build + response parse + NAK handling.
 * Same vectors as iOS RdbiWdbiTests.swift. shearwater_common.c:530-593.
 */
class RdbiWdbiTest {

    // RDBI request format
    @Test fun rdbi_request_buildsCorrectBytes() {
        assertArrayEquals(hex("22 80 10"), RDBI.request(0x8010))
    }

    @Test fun rdbi_request_handlesMaxID() {
        assertArrayEquals(hex("22 ff ff"), RDBI.request(0xFFFF))
    }

    // RDBI parse: positive
    @Test fun rdbi_parse_returnsDataPayload() {
        val response = hex("62 80 10 53 4e 31 32 33")
        val payload = RDBI.parse(response, 0x8010)
        assertArrayEquals(hex("53 4e 31 32 33"), payload)
    }

    @Test fun rdbi_parse_returnsEmptyPayload() {
        val response = hex("62 80 10")
        assertArrayEquals(ByteArray(0), RDBI.parse(response, 0x8010))
    }

    // RDBI parse: NAK
    @Test fun rdbi_parse_throwsNak() {
        val nak = hex("7f 22 31")
        val ex = assertThrows(PeregrineProtocolException.Nak::class.java) {
            RDBI.parse(nak, 0x8010)
        }
        assertEquals(0x22.toByte(), ex.request)
        assertEquals(0x31.toByte(), ex.code)
    }

    // RDBI parse: malformed
    @Test(expected = PeregrineProtocolException.UnexpectedResponse::class)
    fun rdbi_parse_throwsOnWrongSID() {
        RDBI.parse(hex("99 80 10"), 0x8010)
    }

    @Test(expected = PeregrineProtocolException.UnexpectedResponse::class)
    fun rdbi_parse_throwsOnWrongID() {
        RDBI.parse(hex("62 80 11"), 0x8010)
    }

    // WDBI request format
    @Test fun wdbi_request_noData() {
        assertArrayEquals(hex("2e 80 21"), WDBI.request(0x8021))
    }

    @Test fun wdbi_request_withData() {
        assertArrayEquals(
            hex("2e 80 21 00 00 00 00"),
            WDBI.request(0x8021, hex("00 00 00 00"))
        )
    }

    // WDBI validate: positive
    @Test fun wdbi_validate_acceptsValidResponse() {
        WDBI.validate(hex("6e 80 21"), 0x8021)  // throws if invalid
    }

    // WDBI validate: NAK
    @Test fun wdbi_validate_throwsNak() {
        val nak = hex("7f 2e 33")
        val ex = assertThrows(PeregrineProtocolException.Nak::class.java) {
            WDBI.validate(nak, 0x8021)
        }
        assertEquals(0x2e.toByte(), ex.request)
        assertEquals(0x33.toByte(), ex.code)
    }

    @Test(expected = PeregrineProtocolException.UnexpectedResponse::class)
    fun wdbi_validate_throwsOnWrongSID() {
        WDBI.validate(hex("99 80 21"), 0x8021)
    }
}
