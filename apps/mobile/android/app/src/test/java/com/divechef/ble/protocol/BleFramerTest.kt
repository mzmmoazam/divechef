package com.divechef.ble.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * BLE framer tests — same vectors as iOS BleFramerTests.swift to catch port
 * divergence. Verifies the 2-byte mini-header is added/stripped and the chunk
 * boundary matches shearwater_common.c:139.
 */
class BleFramerTest {
    @Test fun fragment_singleChunk_fitsUnderLimit() {
        val payload = ByteArray(10) { it.toByte() }
        val chunks = BleFramer.fragment(payload, 32)
        assertEquals(1, chunks.size)
        assertTrue("chunk must include 2-byte header", chunks[0].size > payload.size)
    }

    @Test fun fragment_splitsAtBoundary() {
        val payload = ByteArray(60) { (it and 0xFF).toByte() }
        val chunks = BleFramer.fragment(payload, 32)
        assertEquals(2, chunks.size)
    }

    @Test fun stripHeader_returnsPayloadOnly() {
        val chunk = hex("00 05 aa bb cc")
        val stripped = BleFramer.stripHeader(chunk)
        assertArrayEquals(hex("aa bb cc"), stripped)
    }

    @Test(expected = PeregrineProtocolException.BleFrameTooShort::class)
    fun stripHeader_throwsOnTooShort() {
        BleFramer.stripHeader(hex("00"))
    }

    @Test fun roundTrip_fragmentThenStripThenConcat() {
        val payload = ByteArray(200) { (it and 0xFF).toByte() }
        val chunks = BleFramer.fragment(payload, 32)
        val reassembled = chunks
            .map { BleFramer.stripHeader(it) }
            .reduce { acc, b -> acc + b }
        assertArrayEquals(payload, reassembled)
    }
}
