package com.diveforge.ble.protocol

/**
 * LRE + XOR decompression (compressed dive bodies).
 * Ported from PeregrineProtocol.swift `enum Decompress`.
 *
 * Algorithm: shearwater_common.c:76-132.
 *
 * LRE phase: stream is interpreted as 9-bit values, MSB-first.
 *   - bit 9 set: lower 8 bits are a literal byte -> append as-is
 *   - bit 9 clear, value == 0: end-of-stream marker -> stop
 *   - bit 9 clear, value != 0: append `value` zero bytes
 *
 * XOR phase (post-LRE): for i in 32..<size: data[i] ^= data[i-32].
 *
 * CRITICAL: All byte operations use `toInt() and 0xFF` to avoid sign extension
 * issues with Kotlin's signed bytes.
 */
object Decompress {

    /**
     * Result of LRE decompression.
     * @param out The decompressed bytes.
     * @param isFinal true if the end-of-stream marker (0x000) was seen.
     */
    data class LreResult(val out: ByteArray, val isFinal: Boolean)

    /**
     * Decompress one complete compressed buffer using LRE (9-bit encoding).
     * Returns (decompressed, isFinal). isFinal = true if end-of-stream marker was seen.
     *
     * shearwater_common.c:91-92 for 9-bit extraction.
     */
    fun lre(data: ByteArray): LreResult {
        val nbits = data.size * 8
        if (nbits % 9 != 0) {
            throw PeregrineProtocolException.DecompressionAlignment(nbits)
        }

        val out = ArrayList<Byte>(data.size * 2)
        var offset = 0
        var done = false

        while (offset + 9 <= nbits) {
            val byteIdx = offset / 8
            val bit = offset % 8

            // Read 16 bits big-endian starting at byteIdx, then shift-extract 9 bits.
            // Use toInt() and 0xFF to prevent sign extension.
            val hi = (data[byteIdx].toInt() and 0xFF) shl 8
            val lo = data[byteIdx + 1].toInt() and 0xFF
            val word = hi or lo
            val shift = 16 - (bit + 9)
            val value = (word shr shift) and 0x1FF

            if ((value and 0x100) != 0) {
                // Bit 9 set: literal byte
                out.add((value and 0xFF).toByte())
            } else if (value == 0) {
                // End-of-stream marker
                done = true
                break
            } else {
                // Run of `value` zero bytes
                repeat(value) { out.add(0) }
            }
            offset += 9
        }

        return LreResult(out.toByteArray(), done)
    }

    /**
     * In-place XOR de-interleave. shearwater_common.c:122-132.
     */
    fun xorPhase(data: ByteArray): ByteArray {
        if (data.size <= 32) return data
        val result = data.copyOf()
        for (i in 32 until result.size) {
            result[i] = (result[i].toInt() xor result[i - 32].toInt()).toByte()
        }
        return result
    }

    /**
     * Convenience: full LRE+XOR pipeline as used by shearwater_common_download for dives.
     */
    fun full(compressed: ByteArray): ByteArray {
        val (lreOut, _) = lre(compressed)
        return xorPhase(lreOut)
    }
}
