package com.divechef.ble.protocol

fun hex(s: String): ByteArray {
    val cleaned = s.replace(" ", "")
    return ByteArray(cleaned.length / 2) { i ->
        cleaned.substring(i * 2, i * 2 + 2).toInt(16).toByte()
    }
}

fun ByteArray.hexString(): String =
    joinToString(" ") { "%02x".format(it.toInt() and 0xFF) }
