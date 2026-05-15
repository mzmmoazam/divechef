package com.divechef.ble.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Logbook base/manifest address mapping. shearwater_petrel.c:215-240.
 * Same vectors as iOS LogbookFormatTests.swift.
 */
class LogbookFormatTest {

    @Test fun baseAddress_legacyPetrel_0x80() =
        assertEquals(0x80000000L, LogbookFormat.baseAddress(hex("00 80 00 00 00")))

    @Test fun baseAddress_perdixAI_0x90() =
        assertEquals(0xC0000000L, LogbookFormat.baseAddress(hex("00 90 00 00 00")))

    @Test fun baseAddress_peregrine_0xC0() =
        assertEquals(0xC0000000L, LogbookFormat.baseAddress(hex("00 c0 00 00 00")))

    @Test fun baseAddress_newer_0xDD() =
        assertEquals(0xC0000000L, LogbookFormat.baseAddress(hex("00 dd 00 00 00")))

    @Test(expected = PeregrineProtocolException.UnexpectedResponse::class)
    fun baseAddress_throwsOnTooShort() {
        LogbookFormat.baseAddress(hex("00 80"))
    }

    @Test fun baseAddress_acceptsMinimumLength() {
        // exactly 5 bytes is the minimum
        LogbookFormat.baseAddress(hex("00 80 00 00 00"))
    }

    @Test fun manifestAddress_legacyBase_returnsE0() =
        assertEquals(0xE0000000L, LogbookFormat.manifestAddress(0x80000000L))

    @Test fun manifestAddress_newBase_returnsFFFF() =
        assertEquals(0xFFFF0000L, LogbookFormat.manifestAddress(0xC0000000L))
}
