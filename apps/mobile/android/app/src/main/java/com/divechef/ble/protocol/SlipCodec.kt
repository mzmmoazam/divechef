package com.divechef.ble.protocol

/**
 * SLIP (RFC 1055) encoder and streaming decoder.
 * Ported from PeregrineProtocol.swift `enum SLIP`.
 *
 * shearwater_common.c:135-224 (slip_write), :227-325 (slip_read).
 */
object SlipCodec {

    /**
     * Encode a payload as a single SLIP packet (no leading END, single trailing END).
     * Matches shearwater_common.c which only emits a trailing END (no leading one).
     */
    fun encode(payload: ByteArray): ByteArray {
        val out = ArrayList<Byte>(payload.size + 2)
        for (c in payload) {
            when (c) {
                Peregrine.SLIP_END -> {
                    out.add(Peregrine.SLIP_ESC)
                    out.add(Peregrine.SLIP_ESC_END)
                }
                Peregrine.SLIP_ESC -> {
                    out.add(Peregrine.SLIP_ESC)
                    out.add(Peregrine.SLIP_ESC_ESC)
                }
                else -> out.add(c)
            }
        }
        out.add(Peregrine.SLIP_END)
        return out.toByteArray()
    }

    /**
     * Streaming SLIP decoder. Feed bytes; emits payloads (without END) when complete
     * frames have been received. Empty packets are skipped (libdc behavior).
     */
    class Decoder {
        private val buf = ArrayList<Byte>()
        private var escaped = false

        fun feed(data: ByteArray): List<ByteArray> {
            val out = mutableListOf<ByteArray>()
            for (c in data) {
                when (c) {
                    Peregrine.SLIP_END -> {
                        if (escaped) {
                            // Protocol violation, be tolerant (shearwater_common.c:264-271)
                            escaped = false
                        }
                        if (buf.isNotEmpty()) {
                            out.add(buf.toByteArray())
                            buf.clear()
                        }
                    }
                    Peregrine.SLIP_ESC -> {
                        if (escaped) {
                            // ESC inside ESC — tolerate
                            escaped = false
                        } else {
                            escaped = true
                        }
                    }
                    else -> {
                        if (escaped) {
                            when (c) {
                                Peregrine.SLIP_ESC_END -> buf.add(Peregrine.SLIP_END)
                                Peregrine.SLIP_ESC_ESC -> buf.add(Peregrine.SLIP_ESC)
                                else -> buf.add(c) // tolerate
                            }
                            escaped = false
                        } else {
                            buf.add(c)
                        }
                    }
                }
            }
            return out
        }
    }
}
