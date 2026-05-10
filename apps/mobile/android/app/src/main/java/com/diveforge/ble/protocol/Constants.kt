package com.diveforge.ble.protocol

/**
 * Protocol constants ported from shearwater_common.c / shearwater_petrel.c.
 * Mirrors the Swift `enum Peregrine` exactly.
 */
object Peregrine {
    // SLIP special bytes (shearwater_common.c:34-37)
    const val SLIP_END: Byte = 0xC0.toByte()
    const val SLIP_ESC: Byte = 0xDB.toByte()
    const val SLIP_ESC_END: Byte = 0xDC.toByte()
    const val SLIP_ESC_ESC: Byte = 0xDD.toByte()

    // libdc fixes the SLIP-write chunk size at 32 bytes (incl. the 2-byte BLE mini-header
    // when transport == BLE). shearwater_common.c:139.
    const val BLE_CHUNK_SIZE: Int = 32

    // Maximum payload size at the libdc transfer layer. shearwater_common.c:31.
    const val SZ_PACKET: Int = 254

    // Manifest layout. shearwater_petrel.c:34-40.
    const val MANIFEST_ADDR: Long = 0xE0000000L
    const val MANIFEST_SIZE: Long = 0x600L
    const val RECORD_SIZE: Int = 0x20
    val RECORD_COUNT: Int = (MANIFEST_SIZE / RECORD_SIZE).toInt()

    // Per-dive read ceiling. shearwater_petrel.c:37.
    const val DIVE_SIZE: Long = 0xFFFFFFL

    // Wrap header bytes. shearwater_common.c:343-346 / :371.
    const val REQ_HDR_0: Byte = 0xFF.toByte()
    const val REQ_HDR_1: Byte = 0x01
    const val RSP_HDR_0: Byte = 0x01
    const val RSP_HDR_1: Byte = 0xFF.toByte()

    // Identifier IDs. shearwater_common.h:33-41.
    const val ID_SERIAL: Int = 0x8010
    const val ID_FIRMWARE: Int = 0x8011
    const val ID_LOGUPLOAD: Int = 0x8021
    const val ID_HARDWARE: Int = 0x8050

    // Manifest record markers. shearwater_petrel.c:278-289.
    const val MARK_VALID: Int = 0xA5C4
    const val MARK_DELETED: Int = 0x5A23
}
