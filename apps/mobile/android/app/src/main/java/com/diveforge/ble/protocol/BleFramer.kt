package com.diveforge.ble.protocol

/**
 * BLE 2-byte mini-header framing.
 * Fragments and reassembles SLIP-encoded payloads into BLE link-layer chunks.
 * Each chunk is [nframes, frame_idx, ...up to (chunkSize-2) payload bytes...].
 *
 * Ported from PeregrineProtocol.swift `enum BLEFramer`.
 * shearwater_common.c:139.
 */
object BleFramer {

    /**
     * Split a SLIP-encoded payload into BLE chunks with the 2-byte mini-header.
     * [chunkSize] must be >= 3 (header + at least 1 payload byte).
     * libdc uses 32; shearwater_common.c:139.
     */
    fun fragment(slipEncoded: ByteArray, chunkSize: Int = Peregrine.BLE_CHUNK_SIZE): List<ByteArray> {
        require(chunkSize >= 3) { "BLE chunk size must allow at least 1 payload byte" }
        val payloadPerChunk = chunkSize - 2
        val total = slipEncoded.size
        val nframes = (total + payloadPerChunk - 1) / payloadPerChunk
        if (nframes == 0) return emptyList()

        val chunks = ArrayList<ByteArray>(nframes)
        var offset = 0
        var idx = 0
        while (offset < total) {
            val end = minOf(offset + payloadPerChunk, total)
            val chunk = ByteArray(end - offset + 2)
            chunk[0] = (nframes and 0xFF).toByte()
            chunk[1] = (idx and 0xFF).toByte()
            System.arraycopy(slipEncoded, offset, chunk, 2, end - offset)
            chunks.add(chunk)
            offset = end
            idx = (idx + 1) and 0xFF
        }
        return chunks
    }

    /**
     * Strip the 2-byte mini-header from one inbound BLE chunk.
     * shearwater_common.c:252-259.
     */
    fun stripHeader(chunk: ByteArray): ByteArray {
        if (chunk.size < 2) {
            throw PeregrineProtocolException.BleFrameTooShort(chunk.size)
        }
        return chunk.copyOfRange(2, chunk.size)
    }
}
