package com.diveforge.ble.protocol

/**
 * Protocol error types.
 * Ported from PeregrineProtocol.swift `enum PeregrineProtocolError`.
 */
sealed class PeregrineProtocolException(message: String) : Exception(message) {

    class SlipShortFrame(size: Int) :
        PeregrineProtocolException("SLIP: short BLE frame ($size bytes)")

    class SlipBadEscape(byte: Byte) :
        PeregrineProtocolException(String.format("SLIP: bad escape byte 0x%02x", byte))

    class BleFrameTooShort(size: Int) :
        PeregrineProtocolException("BLE frame too short ($size bytes, need >=2)")

    class WrapBadHeader(header: ByteArray) :
        PeregrineProtocolException(
            "Wrap: bad response header ${header.joinToString(" ") { String.format("%02x", it) }}"
        )

    class WrapBadLength(length: Int, packetSize: Int) :
        PeregrineProtocolException("Wrap: bad length field=$length, packet n=$packetSize")

    class UnexpectedResponse(detail: String) :
        PeregrineProtocolException("Unexpected response: $detail")

    class Nak(request: Byte, code: Byte) :
        PeregrineProtocolException(
            String.format("NAK on request 0x%02x error 0x%02x", request, code)
        )

    class DecompressionAlignment(nbits: Int) :
        PeregrineProtocolException("LRE: $nbits bits not multiple of 9")

    class UnknownLogbookFormat(address: Long) :
        PeregrineProtocolException(String.format("Unknown logbook format 0x%08x", address))

    class Timeout :
        PeregrineProtocolException("Protocol timeout")

    class NotConnected :
        PeregrineProtocolException("Not connected")
}
