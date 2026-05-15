package com.divechef.ble.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Manifest record parsing tests. shearwater_petrel.c:272-293.
 * Same vectors as iOS ManifestTests.swift.
 */
class ManifestTest {

    /** Build a synthetic 32-byte record. */
    private fun makeRecord(header: Int, fingerprint: ByteArray, address: Long): ByteArray {
        val rec = ByteArray(32)
        rec[0] = ((header shr 8) and 0xFF).toByte()
        rec[1] = (header and 0xFF).toByte()
        System.arraycopy(fingerprint, 0, rec, 4, 4)
        rec[20] = ((address shr 24) and 0xFF).toByte()
        rec[21] = ((address shr 16) and 0xFF).toByte()
        rec[22] = ((address shr 8) and 0xFF).toByte()
        rec[23] = (address and 0xFF).toByte()
        return rec
    }

    @Test fun parse_emptyData_returnsNoRecords() {
        assertEquals(0, Manifest.parse(ByteArray(0)).size)
    }

    @Test fun parse_singleValidRecord() {
        val rec = makeRecord(Peregrine.MARK_VALID, hex("11 22 33 44"), 0x1000L)
        val parsed = Manifest.parse(rec)
        assertEquals(1, parsed.size)
        assertEquals(1, parsed[0].index)
        assertEquals(0x1000L, parsed[0].address)
        assertArrayEquals(hex("11 22 33 44"), parsed[0].fingerprint)
    }

    @Test fun parse_skipsDeletedRecords() {
        val blob = makeRecord(Peregrine.MARK_VALID, hex("01 01 01 01"), 0x100L) +
            makeRecord(Peregrine.MARK_DELETED, hex("ff ff ff ff"), 0x200L) +
            makeRecord(Peregrine.MARK_VALID, hex("02 02 02 02"), 0x300L)
        val parsed = Manifest.parse(blob)
        assertEquals("deleted record should be skipped", 2, parsed.size)
        assertEquals(1, parsed[0].index)
        assertEquals(2, parsed[1].index)
        assertEquals(0x100L, parsed[0].address)
        assertEquals(0x300L, parsed[1].address)
    }

    @Test fun parse_terminatesAtUnknownHeader() {
        val blob = makeRecord(Peregrine.MARK_VALID, hex("aa bb cc dd"), 0x1000L) +
            makeRecord(0xFFFF, hex("00 00 00 00"), 0x2000L) +
            makeRecord(Peregrine.MARK_VALID, hex("99 99 99 99"), 0x3000L)
        val parsed = Manifest.parse(blob)
        assertEquals("parser stops at first unknown header", 1, parsed.size)
    }

    @Test fun parse_truncatedTrailingRecord_isIgnored() {
        val valid = makeRecord(Peregrine.MARK_VALID, hex("01 01 01 01"), 0x100L)
        val truncated = valid + hex("a5 c4 00")
        assertEquals(1, Manifest.parse(truncated).size)
    }

    @Test fun parse_addressBigEndian() {
        val rec = makeRecord(Peregrine.MARK_VALID, hex("00 00 00 00"), 0xDEADBEEFL)
        val parsed = Manifest.parse(rec)
        assertEquals(0xDEADBEEFL, parsed[0].address)
    }

    @Test fun parse_allDeletedRecords_returnsEmpty() {
        val blob = (0 until 3).fold(ByteArray(0)) { acc, _ ->
            acc + makeRecord(Peregrine.MARK_DELETED, hex("ff ff ff ff"), 0L)
        }
        assertEquals(0, Manifest.parse(blob).size)
    }
}
