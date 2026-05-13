package com.divechef.ble.protocol

/**
 * Wrap / unwrap (request/response transfer layer).
 * Ported from PeregrineProtocol.swift `enum Wrap`.
 *
 * Request packet: [0xFF, 0x01, isize+1, 0x00, payload...]
 * Response packet: [0x01, 0xFF, length, 0x00, inner...]
 *
 * shearwater_common.c:343-347 / :371-385.
 */
object WrapCodec {

    /**
     * Build the request packet: [0xFF, 0x01, isize+1, 0x00, payload...].
     * shearwater_common.c:343-347.
     */
    fun wrapRequest(payload: ByteArray): ByteArray {
        require(payload.size <= Peregrine.SZ_PACKET) { "payload too large for SZ_PACKET" }
        val pkt = ByteArray(payload.size + 4)
        pkt[0] = Peregrine.REQ_HDR_0
        pkt[1] = Peregrine.REQ_HDR_1
        pkt[2] = ((payload.size + 1) and 0xFF).toByte()
        pkt[3] = 0x00
        System.arraycopy(payload, 0, pkt, 4, payload.size)
        return pkt
    }

    /**
     * Validate and unwrap a response packet. Returns the inner bytes.
     * shearwater_common.c:371-385.
     */
    fun unwrapResponse(packet: ByteArray): ByteArray {
        val n = packet.size
        if (n < 4
            || packet[0] != Peregrine.RSP_HDR_0
            || packet[1] != Peregrine.RSP_HDR_1
            || packet[3] != 0x00.toByte()
        ) {
            throw PeregrineProtocolException.WrapBadHeader(packet.copyOfRange(0, minOf(4, n)))
        }
        val length = packet[2].toInt() and 0xFF
        if (length < 1 || (length - 1 + 4) != n) {
            throw PeregrineProtocolException.WrapBadLength(length, n)
        }
        return packet.copyOfRange(4, 4 + length - 1)
    }
}
