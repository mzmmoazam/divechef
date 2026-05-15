package com.divechef.ble.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * SLIP codec tests — same vectors as the iOS suite (DiveChefTests/SlipCodecTests.swift)
 * to catch port divergence. Vectors derived from RFC 1055 / shearwater_common.c:34-37.
 *
 * Note: encoded frames have a single TRAILING END only (no leading END),
 * per SlipCodec.kt:12-14.
 */
class SlipCodecTest {
    @Test fun encode_simplePayload() {
        val encoded = SlipCodec.encode(hex("01 02 03"))
        assertEquals("01 02 03 c0", encoded.hexString())
    }

    @Test fun encode_escapesEND() {
        val encoded = SlipCodec.encode(hex("c0"))
        assertEquals("db dc c0", encoded.hexString())
    }

    @Test fun encode_escapesESC() {
        val encoded = SlipCodec.encode(hex("db"))
        assertEquals("db dd c0", encoded.hexString())
    }

    @Test fun encode_mixedEscapes() {
        val encoded = SlipCodec.encode(hex("c0 db 42"))
        assertEquals("db dc db dd 42 c0", encoded.hexString())
    }

    @Test fun roundTrip_acrossManyByteValues() {
        val payload = ByteArray(256) { it.toByte() }
        val encoded = SlipCodec.encode(payload)

        val decoder = SlipCodec.Decoder()
        val frames = decoder.feed(encoded)
        assertEquals(1, frames.size)
        assertArrayEquals(payload, frames[0])
    }

    @Test fun decoder_handlesSplitFeeds() {
        val payload = hex("c0 01 db 02")
        val encoded = SlipCodec.encode(payload)

        val decoder = SlipCodec.Decoder()
        val frames = mutableListOf<ByteArray>()
        for (b in encoded) {
            frames += decoder.feed(byteArrayOf(b))
        }
        assertEquals(1, frames.size)
        assertArrayEquals(payload, frames[0])
    }

    @Test fun decoder_handlesMultipleFrames() {
        val p1 = hex("01 02"); val p2 = hex("03 04")
        val stream = SlipCodec.encode(p1) + SlipCodec.encode(p2)

        val decoder = SlipCodec.Decoder()
        val frames = decoder.feed(stream)
        assertEquals(2, frames.size)
        assertArrayEquals(p1, frames[0])
        assertArrayEquals(p2, frames[1])
    }

    /**
     * Bad escape (END after ESC) — implementation is tolerant per
     * shearwater_common.c:264-271 and SlipCodec.kt:46-50: resets escape
     * state, treats the END as a frame boundary on an empty buffer, and
     * emits no frame. Decoder MUST NOT throw.
     */
    @Test fun decoder_dropsBadEscape() {
        val bad = hex("c0 db c0 c0")
        val decoder = SlipCodec.Decoder()
        val frames = decoder.feed(bad)
        assertEquals(0, frames.size)
    }
}
