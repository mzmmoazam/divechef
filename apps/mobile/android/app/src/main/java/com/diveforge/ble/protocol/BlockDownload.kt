package com.diveforge.ble.protocol

/**
 * Block download primitives (0x35 / 0x36 / 0x37).
 * Ported from PeregrineProtocol.swift `enum BlockDownload`.
 *
 * shearwater_common.c:391-519.
 */
object BlockDownload {

    /**
     * Build req_init. shearwater_common.c:398-408.
     *
     * @param address 32-bit memory address to read from.
     * @param size 24-bit read size (upper byte is ignored per libdc).
     * @param compression true to enable on-device LRE compression.
     */
    fun initRequest(address: Long, size: Long, compression: Boolean): ByteArray {
        return byteArrayOf(
            0x35,
            if (compression) 0x10 else 0x00,
            0x34,
            ((address shr 24) and 0xFF).toByte(),
            ((address shr 16) and 0xFF).toByte(),
            ((address shr 8) and 0xFF).toByte(),
            (address and 0xFF).toByte(),
            ((size shr 16) and 0xFF).toByte(),
            ((size shr 8) and 0xFF).toByte(),
            (size and 0xFF).toByte()
        )
    }

    /**
     * Validate [0x75, 0x10, blockSize]. shearwater_common.c:433.
     * Returns the negotiated block size.
     */
    fun parseInitResponse(response: ByteArray): Int {
        if (response.size != 3
            || response[0] != 0x75.toByte()
            || response[1] != 0x10.toByte()
            || (response[2].toInt() and 0xFF) > Peregrine.SZ_PACKET
        ) {
            throw PeregrineProtocolException.UnexpectedResponse(
                "block init got ${response.joinToString(" ") { String.format("%02x", it) }}"
            )
        }
        return response[2].toInt() and 0xFF
    }

    /**
     * Build req_block. block_num is 8-bit and wraps. shearwater_common.c:409, :450.
     */
    fun blockRequest(blockNum: Int): ByteArray {
        return byteArrayOf(0x36, (blockNum and 0xFF).toByte())
    }

    /**
     * Validate [0x76, blockNum, ...payload...]. Returns payload.
     * shearwater_common.c:457-460.
     */
    fun parseBlockResponse(response: ByteArray, expectedBlock: Int): ByteArray {
        val expected = (expectedBlock and 0xFF).toByte()
        if (response.size < 2
            || response[0] != 0x76.toByte()
            || response[1] != expected
        ) {
            throw PeregrineProtocolException.UnexpectedResponse(
                "block hdr got ${response.take(4).joinToString(" ") { String.format("%02x", it) }} expected 76 ${String.format("%02x", expectedBlock and 0xFF)}"
            )
        }
        return response.copyOfRange(2, response.size)
    }

    /**
     * Quit request: [0x37].
     */
    val quitRequest: ByteArray = byteArrayOf(0x37)

    /**
     * Validate [0x77, 0x00]. shearwater_common.c:506.
     */
    fun parseQuitResponse(response: ByteArray) {
        if (response.size != 2 || response[0] != 0x77.toByte() || response[1] != 0x00.toByte()) {
            throw PeregrineProtocolException.UnexpectedResponse(
                "quit got ${response.joinToString(" ") { String.format("%02x", it) }}"
            )
        }
    }
}
