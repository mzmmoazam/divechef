package com.divechef.ble.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * BlockDownload init/block/quit tests. Same vectors as iOS BlockDownloadTests.swift.
 * shearwater_common.c:391-519. SZ_PACKET = 254 (0xFE).
 */
class BlockDownloadTest {

    // initRequest format
    @Test fun initRequest_uncompressed() {
        val req = BlockDownload.initRequest(0xE0000000L, 0x600L, false)
        assertArrayEquals(hex("35 00 34 e0 00 00 00 00 06 00"), req)
    }

    @Test fun initRequest_compressed() {
        val req = BlockDownload.initRequest(0xC0000000L, 0xFFFFFFL, true)
        assertArrayEquals(hex("35 10 34 c0 00 00 00 ff ff ff"), req)
    }

    @Test fun initRequest_addressBigEndian_distinctBytes() {
        val req = BlockDownload.initRequest(0x12345678L, 0xABCDEFL, false)
        assertArrayEquals(hex("12 34 56 78"), req.copyOfRange(3, 7))
        assertArrayEquals(hex("ab cd ef"), req.copyOfRange(7, 10))
    }

    // parseInitResponse
    @Test fun parseInitResponse_validReturnsBlockSize() {
        val blockSize = BlockDownload.parseInitResponse(hex("75 10 f8"))
        assertEquals(0xF8, blockSize)
    }

    @Test(expected = PeregrineProtocolException.UnexpectedResponse::class)
    fun parseInitResponse_throwsOnNak() {
        BlockDownload.parseInitResponse(hex("7f 35 31"))
    }

    @Test(expected = PeregrineProtocolException.UnexpectedResponse::class)
    fun parseInitResponse_throwsOnBlockSizeTooLarge() {
        BlockDownload.parseInitResponse(hex("75 10 ff"))
    }

    @Test fun parseInitResponse_acceptsMaxBlockSize() {
        // SZ_PACKET = 254 (0xFE) is the legitimate upper bound — must NOT throw.
        val blockSize = BlockDownload.parseInitResponse(hex("75 10 fe"))
        assertEquals(0xFE, blockSize)
    }

    @Test fun parseInitResponse_acceptsZeroBlockSize() {
        // Degenerate but spec-legal: device says "size 0". Currently accepted —
        // pin the behavior so a future change breaks loudly.
        val blockSize = BlockDownload.parseInitResponse(hex("75 10 00"))
        assertEquals(0x00, blockSize)
    }

    @Test(expected = PeregrineProtocolException.UnexpectedResponse::class)
    fun parseInitResponse_throwsOnWrongLength() {
        BlockDownload.parseInitResponse(hex("75 10"))
    }

    @Test(expected = PeregrineProtocolException.UnexpectedResponse::class)
    fun parseInitResponse_throwsOnWrongHeader() {
        BlockDownload.parseInitResponse(hex("76 10 f8"))
    }

    // blockRequest
    @Test fun blockRequest_buildsCorrectBytes() {
        assertArrayEquals(hex("36 42"), BlockDownload.blockRequest(0x42))
    }

    @Test fun blockRequest_acceptsZeroAndMax() {
        assertArrayEquals(hex("36 00"), BlockDownload.blockRequest(0x00))
        assertArrayEquals(hex("36 ff"), BlockDownload.blockRequest(0xFF))
    }

    // parseBlockResponse
    @Test fun parseBlockResponse_returnsPayload() {
        val payload = BlockDownload.parseBlockResponse(hex("76 05 aa bb cc"), 0x05)
        assertArrayEquals(hex("aa bb cc"), payload)
    }

    @Test fun parseBlockResponse_emptyPayload() {
        val payload = BlockDownload.parseBlockResponse(hex("76 05"), 0x05)
        assertArrayEquals(ByteArray(0), payload)
    }

    @Test(expected = PeregrineProtocolException.UnexpectedResponse::class)
    fun parseBlockResponse_throwsOnBlockMismatch() {
        BlockDownload.parseBlockResponse(hex("76 05 aa"), 0x06)
    }

    @Test(expected = PeregrineProtocolException.UnexpectedResponse::class)
    fun parseBlockResponse_throwsOnWrongSID() {
        BlockDownload.parseBlockResponse(hex("99 05 aa"), 0x05)
    }

    // quit
    @Test fun quitRequest_isCorrect() {
        assertArrayEquals(hex("37"), BlockDownload.quitRequest)
    }

    @Test fun parseQuitResponse_acceptsValid() {
        BlockDownload.parseQuitResponse(hex("77 00"))  // throws if invalid
    }

    @Test(expected = PeregrineProtocolException.UnexpectedResponse::class)
    fun parseQuitResponse_throwsOnNonZeroStatus() {
        BlockDownload.parseQuitResponse(hex("77 01"))
    }

    @Test(expected = PeregrineProtocolException.UnexpectedResponse::class)
    fun parseQuitResponse_throwsOnWrongHeader() {
        BlockDownload.parseQuitResponse(hex("76 00"))
    }

    @Test(expected = PeregrineProtocolException.UnexpectedResponse::class)
    fun parseQuitResponse_throwsOnTooShort() {
        BlockDownload.parseQuitResponse(hex("77"))
    }
}
