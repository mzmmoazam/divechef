package com.diveforge.ble.protocol

/**
 * RDBI / WDBI request builders + response parsers.
 * Ported from PeregrineProtocol.swift `enum RDBI` / `enum WDBI`.
 *
 * shearwater_common.c:522-611.
 */
object RDBI {

    /**
     * Build a Read-By-Identifier request payload: [0x22, hi, lo].
     * shearwater_common.c:530-533.
     */
    fun request(id: Int): ByteArray {
        return byteArrayOf(
            0x22,
            ((id shr 8) and 0xFF).toByte(),
            (id and 0xFF).toByte()
        )
    }

    /**
     * Validate the response and return the data bytes. Throws on NAK or malformed.
     * shearwater_common.c:540-570.
     */
    fun parse(response: ByteArray, id: Int): ByteArray {
        val hi = ((id shr 8) and 0xFF).toByte()
        val lo = (id and 0xFF).toByte()
        val n = response.size

        // NAK check: [0x7F, 0x22, error_code]
        if (n == 3 && response[0] == 0x7F.toByte() && response[1] == 0x22.toByte()) {
            throw PeregrineProtocolException.Nak(0x22.toByte(), response[2])
        }

        // Validate positive response: [0x62, hi, lo, ...data]
        if (n < 3 || response[0] != 0x62.toByte() || response[1] != hi || response[2] != lo) {
            throw PeregrineProtocolException.UnexpectedResponse(
                "RDBI id=${String.format("%04x", id)} got ${response.take(8).joinToString(" ") { String.format("%02x", it) }}"
            )
        }
        return response.copyOfRange(3, response.size)
    }
}

object WDBI {

    /**
     * Build a Write-By-Identifier request: [0x2E, hi, lo, ...data].
     * shearwater_common.c:587-593.
     */
    fun request(id: Int, data: ByteArray = ByteArray(0)): ByteArray {
        val p = ByteArray(data.size + 3)
        p[0] = 0x2E
        p[1] = ((id shr 8) and 0xFF).toByte()
        p[2] = (id and 0xFF).toByte()
        System.arraycopy(data, 0, p, 3, data.size)
        return p
    }

    /**
     * Validate a WDBI response. Throws on NAK or malformed.
     */
    fun validate(response: ByteArray, id: Int) {
        val hi = ((id shr 8) and 0xFF).toByte()
        val lo = (id and 0xFF).toByte()
        val n = response.size

        // NAK check: [0x7F, 0x2E, error_code]
        if (n == 3 && response[0] == 0x7F.toByte() && response[1] == 0x2E.toByte()) {
            throw PeregrineProtocolException.Nak(0x2E.toByte(), response[2])
        }

        // Validate positive response: [0x6E, hi, lo]
        if (n < 3 || response[0] != 0x6E.toByte() || response[1] != hi || response[2] != lo) {
            throw PeregrineProtocolException.UnexpectedResponse(
                "WDBI id=${String.format("%04x", id)} got ${response.take(8).joinToString(" ") { String.format("%02x", it) }}"
            )
        }
    }
}
