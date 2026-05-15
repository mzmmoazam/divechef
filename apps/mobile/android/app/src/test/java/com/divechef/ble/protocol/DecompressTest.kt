package com.divechef.ble.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * LRE + XOR decompression tests. Same hand-derived vectors as iOS DecompressTests.swift.
 * Algorithm: 9-bit codes packed MSB-first; bit 8 set = literal, bit 8 clear + value 0 = EOS,
 * bit 8 clear + value != 0 = run of zeros. shearwater_common.c:76-132.
 */
class DecompressTest {

    /** 7 literals 0x01..0x07 + EOS — 8 codes = 9 bytes. */
    @Test fun lre_literalsOnly() {
        val encoded = hex("80 c0 a0 70 48 2c 1a 0e 00")
        val (out, isFinal) = Decompress.lre(encoded)
        assertArrayEquals(hex("01 02 03 04 05 06 07"), out)
        assertTrue(isFinal)
    }

    /** Run of 5 zeros + EOS + 6 padding EOS — 8 codes = 9 bytes. */
    @Test fun lre_runOnly() {
        val encoded = hex("02 80 00 00 00 00 00 00 00")
        val (out, isFinal) = Decompress.lre(encoded)
        assertArrayEquals(hex("00 00 00 00 00"), out)
        assertTrue(isFinal)
    }

    /** Mixed: lit 0x01, run 2 zeros, lit 0x03, EOS, 4 padding EOS — 8 codes = 9 bytes. */
    @Test fun lre_mixed() {
        val encoded = hex("80 80 a0 60 00 00 00 00 00")
        val (out, isFinal) = Decompress.lre(encoded)
        assertArrayEquals(hex("01 00 00 03"), out)
        assertTrue(isFinal)
    }

    @Test(expected = PeregrineProtocolException.DecompressionAlignment::class)
    fun lre_misalignedBits_singleByte_throws() {
        Decompress.lre(hex("00"))
    }

    @Test(expected = PeregrineProtocolException.DecompressionAlignment::class)
    fun lre_misalignedBits_eightBytes_throws() {
        Decompress.lre(ByteArray(8))
    }

    @Test fun lre_emptyInput() {
        val (out, isFinal) = Decompress.lre(ByteArray(0))
        assertEquals(0, out.size)
        assertFalse("empty input must NOT signal isFinal (no EOS seen)", isFinal)
    }

    // XOR phase
    @Test fun xor_invertibility_largeBuffer() {
        val original = ByteArray(64) { (it and 0xFF).toByte() }
        val once = Decompress.xorPhase(original)
        assertNotEquals("XOR must alter data > 32 bytes", original.toList(), once.toList())
        val twice = Decompress.xorPhase(once)
        assertArrayEquals("XOR is self-inverse", original, twice)
    }

    @Test fun xor_smallBuffer_noOp() {
        val original = hex("42 99 ff 01")
        val result = Decompress.xorPhase(original)
        assertArrayEquals("XOR is no-op for buffers <= 32 bytes", original, result)
    }

    @Test fun xor_exactlyThirtyTwoBytes_noOp() {
        val original = ByteArray(32) { it.toByte() }
        val result = Decompress.xorPhase(original)
        assertArrayEquals(original, result)
    }

    @Test fun xor_exactByte32_isXorOfByte0() {
        val original = ByteArray(33) { it.toByte() }
        val result = Decompress.xorPhase(original)
        val expected = (original[32].toInt() xor original[0].toInt()).toByte()
        assertEquals(expected, result[32])
    }

    // Full pipeline
    @Test fun full_literalsOnly_xorIsNoOp() {
        val encoded = hex("80 c0 a0 70 48 2c 1a 0e 00")
        val actual = Decompress.full(encoded)
        assertArrayEquals(hex("01 02 03 04 05 06 07"), actual)
    }
}

/**
 * EOS detector for streaming dive downloads. Bug here = downloads truncate or hang.
 */
class IncrementalLREDetectorTest {

    /** 7 literals + EOS, same as DecompressTest.lre_literalsOnly. */
    private val encodedWithEOS = hex("80 c0 a0 70 48 2c 1a 0e 00")

    /** 8 literals 0x01..0x08, NO EOS. Hand-derived. */
    private val encodedNoEOS = hex("80 c0 a0 70 48 2c 1a 0f 08")

    @Test fun detector_signalsEndOfStream_singleFeed() {
        val detector = IncrementalLREDetector()
        val done = detector.feed(encodedWithEOS)
        assertTrue(done)
        assertTrue(detector.isDone)
    }

    @Test fun detector_signalsEndOfStream_byteByByteFeed() {
        val detector = IncrementalLREDetector()
        var doneAtAnyPoint = false
        for (b in encodedWithEOS) {
            if (detector.feed(byteArrayOf(b))) doneAtAnyPoint = true
        }
        assertTrue(doneAtAnyPoint)
        assertTrue(detector.isDone)
    }

    @Test fun detector_doesNotSignalForLiteralOnlyStream() {
        val detector = IncrementalLREDetector()
        val done = detector.feed(encodedNoEOS)
        assertFalse("8 literals (no EOS) must NOT signal done", done)
        assertFalse(detector.isDone)
    }

    @Test fun detector_doesNotSignalForEmpty() {
        val detector = IncrementalLREDetector()
        assertFalse(detector.feed(ByteArray(0)))
        assertFalse(detector.isDone)
    }

    @Test fun detector_remainsLatchedAfterEOS() {
        val detector = IncrementalLREDetector()
        assertTrue(detector.feed(encodedWithEOS))
        assertTrue(detector.feed(hex("ff ff ff")))
        assertTrue(detector.isDone)
    }
}
