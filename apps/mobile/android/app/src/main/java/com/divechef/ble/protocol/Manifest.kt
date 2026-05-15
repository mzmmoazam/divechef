package com.divechef.ble.protocol

/**
 * Manifest record parsing.
 * Ported from PeregrineProtocol.swift `struct ManifestRecord` + `enum Manifest`.
 *
 * A 32-byte manifest record. shearwater_petrel.c:272-293.
 */
data class ManifestRecord(
    /** Position in the manifest list, 1-based, as exposed in the UI. */
    val index: Int,
    /** Dive's storage offset relative to base_addr. shearwater_petrel.c:329. */
    val address: Long,
    /** 4-byte fingerprint (libdc uses this for "already seen" detection). offset +4. */
    val fingerprint: ByteArray,
    /** The raw 32-byte record (handy for debugging/logging). */
    val raw: ByteArray
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is ManifestRecord) return false
        return index == other.index &&
            address == other.address &&
            fingerprint.contentEquals(other.fingerprint)
    }

    override fun hashCode(): Int {
        var result = index
        result = 31 * result + address.hashCode()
        result = 31 * result + fingerprint.contentHashCode()
        return result
    }
}

/**
 * Manifest parsing and logbook format utilities.
 * Ported from PeregrineProtocol.swift `enum Manifest` + `enum LogbookFormat`.
 */
object Manifest {

    /**
     * Walk a manifest blob and return non-deleted dive records, terminating
     * at the first non-A5C4/5A23 header. Mirrors shearwater_petrel.c:275-293.
     */
    fun parse(data: ByteArray): List<ManifestRecord> {
        val out = mutableListOf<ManifestRecord>()
        var offset = 0
        var displayIndex = 1

        while (offset + Peregrine.RECORD_SIZE <= data.size) {
            // Read 2-byte header as unsigned 16-bit value
            val hi = (data[offset].toInt() and 0xFF) shl 8
            val lo = data[offset + 1].toInt() and 0xFF
            val header = hi or lo

            if (header == Peregrine.MARK_DELETED) {
                offset += Peregrine.RECORD_SIZE
                continue
            }
            if (header != Peregrine.MARK_VALID) {
                break
            }

            val raw = data.copyOfRange(offset, offset + Peregrine.RECORD_SIZE)
            val fingerprint = raw.copyOfRange(4, 8)

            // Address at offset +20 in the record (4 bytes big-endian)
            val addr =
                ((raw[20].toInt() and 0xFF).toLong() shl 24) or
                ((raw[21].toInt() and 0xFF).toLong() shl 16) or
                ((raw[22].toInt() and 0xFF).toLong() shl 8) or
                (raw[23].toInt() and 0xFF).toLong()

            out.add(ManifestRecord(
                index = displayIndex,
                address = addr,
                fingerprint = fingerprint,
                raw = raw
            ))
            displayIndex++
            offset += Peregrine.RECORD_SIZE
        }
        return out
    }
}

/**
 * Logbook base address mapping. shearwater_petrel.c:215-235.
 */
object LogbookFormat {

    /**
     * Read the logupload response (ID_LOGUPLOAD = 0x8021) and return the
     * effective base address. shearwater_petrel.c:221-240.
     * Logic: if high byte >= 0xC0, base is 0xC0000000; else 0x80000000.
     */
    fun baseAddress(fromLogUploadResponse: ByteArray): Long {
        if (fromLogUploadResponse.size < 5) {
            throw PeregrineProtocolException.UnexpectedResponse(
                "logupload too short ${fromLogUploadResponse.size}"
            )
        }
        val highByte = fromLogUploadResponse[1].toInt() and 0xFF
        // Only 0x80 uses legacy base; all others (0x90, 0xC0, 0xDD) use 0xC0000000.
        return if (highByte == 0x80) 0x80000000L else 0xC0000000L
    }

    fun manifestAddress(forBase: Long): Long {
        return if (forBase == 0xC0000000L) 0xFFFF0000L else 0xE0000000L
    }
}
