// Ported from spike/0c-ble-protocol/swift-sources/PeregrineProtocol.swift
// PeregrineProtocol.swift
// DiveChef spike — Phase C2 Layer 3 (Shearwater wire protocol).
//
// Pure byte-manipulation helpers, no CoreBluetooth dependency. Translates
// libdivecomputer's shearwater_common.c flow into Swift.
//
// Layers (outermost first, applied to outbound bytes; reversed for inbound):
//   1. Command bytes (e.g. RDBI, block download)               [protocol API]
//   2. Request/response wrap     0xFF 0x01 len 0x00 ...        [Wrap]
//   3. SLIP framing (RFC 1055)   0xC0 ... 0xC0                  [SLIP]
//   4. BLE per-write 2-byte mini-header [nframes, frame_idx]    [BLEFramer]
//   5. CoreBluetooth write/notification                         [PeregrineClient]
//
// References:
//   shearwater_common.c:135–224 (slip_write), :227–325 (slip_read),
//   :328–388 (transfer wrap), :391–519 (block download),
//   :522–611 (RDBI/WDBI), :76–132 (LRE+XOR decompression).

import Foundation

// MARK: - Constants

enum Peregrine {
    // SLIP special bytes (shearwater_common.c:34-37)
    static let SLIP_END: UInt8     = 0xC0
    static let SLIP_ESC: UInt8     = 0xDB
    static let SLIP_ESC_END: UInt8 = 0xDC
    static let SLIP_ESC_ESC: UInt8 = 0xDD

    // libdc fixes the SLIP-write chunk size at 32 bytes (incl. the 2-byte BLE mini-header
    // when transport == BLE). We do the same so the device-side reassembler sees identical
    // framing to what it gets from libdc on desktop. shearwater_common.c:139.
    static let BLE_CHUNK_SIZE_DEFAULT = 32
    // Optimized chunk size: MTU(writeWithoutResponse) = 77, minus 2-byte BLE mini-header = 75.
    static let BLE_CHUNK_SIZE_OPTIMIZED = 75

    // Maximum payload size at the libdc transfer layer. shearwater_common.c:31.
    static let SZ_PACKET = 254

    // Manifest layout. shearwater_petrel.c:34-40.
    static let MANIFEST_ADDR: UInt32 = 0xE0000000
    static let MANIFEST_SIZE: UInt32 = 0x600
    static let RECORD_SIZE = 0x20
    static let RECORD_COUNT = Int(MANIFEST_SIZE) / 0x20

    // Per-dive read ceiling. shearwater_petrel.c:37. Actual size is decided by the
    // LRE end-of-stream marker.
    static let DIVE_SIZE: UInt32 = 0xFFFFFF

    // Wrap header bytes. shearwater_common.c:343-346 / :371.
    static let REQ_HDR_0: UInt8 = 0xFF
    static let REQ_HDR_1: UInt8 = 0x01
    static let RSP_HDR_0: UInt8 = 0x01
    static let RSP_HDR_1: UInt8 = 0xFF

    // Identifier IDs. shearwater_common.h:33-41.
    static let ID_SERIAL:    UInt16 = 0x8010
    static let ID_FIRMWARE:  UInt16 = 0x8011
    static let ID_LOGUPLOAD: UInt16 = 0x8021
    static let ID_HARDWARE:  UInt16 = 0x8050

    // Manifest record markers. shearwater_petrel.c:278-289.
    static let MARK_VALID:   UInt16 = 0xA5C4
    static let MARK_DELETED: UInt16 = 0x5A23
}

// MARK: - Errors

enum PeregrineProtocolError: Error, LocalizedError, CustomStringConvertible {
    case slipShortFrame(Int)
    case slipBadEscape(UInt8)
    case bleFrameTooShort(Int)
    case wrapBadHeader(Data)
    case wrapBadLength(Int, Int)
    case unexpectedResponse(String)
    case nak(request: UInt8, code: UInt8)
    case decompressionAlignment(Int)
    case unknownLogbookFormat(UInt32)
    case timeout
    case notConnected

    var description: String {
        switch self {
        case .slipShortFrame(let n):           return "SLIP: short BLE frame (\(n) bytes)"
        case .slipBadEscape(let c):            return String(format: "SLIP: bad escape byte 0x%02x", c)
        case .bleFrameTooShort(let n):         return "BLE frame too short (\(n) bytes, need >=2)"
        case .wrapBadHeader(let d):            return "Wrap: bad response header \(d.map{String(format:"%02x",$0)}.joined(separator:" "))"
        case .wrapBadLength(let l, let n):     return "Wrap: bad length field=\(l), packet n=\(n)"
        case .unexpectedResponse(let s):       return "Unexpected response: \(s)"
        case .nak(let req, let code):          return String(format: "NAK on request 0x%02x error 0x%02x", req, code)
        case .decompressionAlignment(let n):   return "LRE: \(n) bits not multiple of 9"
        case .unknownLogbookFormat(let a):      return String(format: "Unknown logbook format 0x%08x", a)
        case .timeout:                          return "Protocol timeout"
        case .notConnected:                     return "Not connected"
        }
    }

    var errorDescription: String? { description }
}

// MARK: - SLIP (RFC 1055)

enum SLIP {
    /// Encode a payload as a single SLIP packet (no leading END, single trailing END).
    /// Matches shearwater_common.c which only emits a trailing END (no leading one).
    static func encode(_ payload: Data) -> Data {
        var out = Data()
        out.reserveCapacity(payload.count + 2)
        for c in payload {
            switch c {
            case Peregrine.SLIP_END:
                out.append(Peregrine.SLIP_ESC)
                out.append(Peregrine.SLIP_ESC_END)
            case Peregrine.SLIP_ESC:
                out.append(Peregrine.SLIP_ESC)
                out.append(Peregrine.SLIP_ESC_ESC)
            default:
                out.append(c)
            }
        }
        out.append(Peregrine.SLIP_END)
        return out
    }

    /// Streaming SLIP decoder. Feed bytes; emits payloads (without END) when complete
    /// frames have been received. Empty packets are skipped (libdc behavior).
    final class Decoder {
        private var buf = Data()
        private var escaped = false

        func feed(_ data: Data) -> [Data] {
            var out: [Data] = []
            for c in data {
                switch c {
                case Peregrine.SLIP_END:
                    if escaped {
                        // Protocol violation per shearwater_common.c:264-271, but be tolerant.
                        escaped = false
                    }
                    if !buf.isEmpty {
                        out.append(buf)
                        buf.removeAll(keepingCapacity: true)
                    }
                case Peregrine.SLIP_ESC:
                    if escaped {
                        // Same as above: ESC inside ESC. Tolerate.
                        escaped = false
                    } else {
                        escaped = true
                    }
                default:
                    if escaped {
                        switch c {
                        case Peregrine.SLIP_ESC_END: buf.append(Peregrine.SLIP_END)
                        case Peregrine.SLIP_ESC_ESC: buf.append(Peregrine.SLIP_ESC)
                        default: buf.append(c) // tolerate
                        }
                        escaped = false
                    } else {
                        buf.append(c)
                    }
                }
            }
            return out
        }
    }
}

// MARK: - BLE 2-byte mini-header framing

/// Fragments and reassembles SLIP-encoded payloads into BLE link-layer chunks.
/// Each chunk is `[nframes, frame_idx, ...up to (chunkSize-2) payload bytes...]`.
/// `chunkSize` is the total bytes per BLE write (including the 2-byte header).
/// libdc uses 32; shearwater_common.c:139.
enum BLEFramer {
    /// Split a SLIP-encoded payload into BLE chunks with the 2-byte mini-header.
    /// `chunkSize` must be >= 3 (header + at least 1 payload byte).
    static func fragment(_ slipEncoded: Data, chunkSize: Int = Peregrine.BLE_CHUNK_SIZE_DEFAULT) -> [Data] {
        precondition(chunkSize >= 3, "BLE chunk size must allow at least 1 payload byte")
        let payloadPerChunk = chunkSize - 2
        let total = slipEncoded.count
        let nframes = (total + payloadPerChunk - 1) / payloadPerChunk
        guard nframes > 0 else { return [] }

        var chunks: [Data] = []
        chunks.reserveCapacity(nframes)
        var offset = 0
        var idx: UInt8 = 0
        while offset < total {
            let end = min(offset + payloadPerChunk, total)
            var chunk = Data(capacity: end - offset + 2)
            chunk.append(UInt8(truncatingIfNeeded: nframes))
            chunk.append(idx)
            chunk.append(slipEncoded[offset..<end])
            chunks.append(chunk)
            offset = end
            idx = idx &+ 1
        }
        return chunks
    }

    /// Strip the 2-byte mini-header from one inbound BLE chunk.
    /// shearwater_common.c:252-259.
    static func stripHeader(_ chunk: Data) throws -> Data {
        if chunk.count < 2 {
            throw PeregrineProtocolError.bleFrameTooShort(chunk.count)
        }
        return chunk.subdata(in: (chunk.startIndex + 2)..<chunk.endIndex)
    }
}

// MARK: - Wrap / unwrap (request/response transfer layer)

enum Wrap {
    /// Build the request packet: `[0xFF, 0x01, isize+1, 0x00, payload...]`.
    /// shearwater_common.c:343-347.
    static func wrapRequest(_ payload: Data) -> Data {
        precondition(payload.count <= Peregrine.SZ_PACKET, "payload too large for SZ_PACKET")
        var pkt = Data(capacity: payload.count + 4)
        pkt.append(Peregrine.REQ_HDR_0)
        pkt.append(Peregrine.REQ_HDR_1)
        pkt.append(UInt8(payload.count + 1))
        pkt.append(0x00)
        pkt.append(payload)
        return pkt
    }

    /// Validate and unwrap a response packet. Returns the inner bytes.
    /// shearwater_common.c:371-385.
    static func unwrapResponse(_ packet: Data) throws -> Data {
        let n = packet.count
        if n < 4
            || packet[packet.startIndex]     != Peregrine.RSP_HDR_0
            || packet[packet.startIndex + 1] != Peregrine.RSP_HDR_1
            || packet[packet.startIndex + 3] != 0x00 {
            throw PeregrineProtocolError.wrapBadHeader(packet.prefix(4))
        }
        let length = Int(packet[packet.startIndex + 2])
        if length < 1 || (length - 1 + 4) != n {
            throw PeregrineProtocolError.wrapBadLength(length, n)
        }
        let inner = packet.subdata(in: (packet.startIndex + 4)..<(packet.startIndex + 4 + length - 1))
        return inner
    }
}

// MARK: - RDBI / WDBI request builders + response parsers

enum RDBI {
    /// Build a Read-By-Identifier request payload: `[0x22, hi, lo]`. shearwater_common.c:530-533.
    static func request(id: UInt16) -> Data {
        return Data([0x22, UInt8((id >> 8) & 0xFF), UInt8(id & 0xFF)])
    }

    /// Validate the response and return the data bytes. Throws on NAK or malformed.
    /// shearwater_common.c:540-570.
    static func parse(response: Data, id: UInt16) throws -> Data {
        let hi = UInt8((id >> 8) & 0xFF)
        let lo = UInt8(id & 0xFF)
        let n = response.count
        let s = response.startIndex
        if n == 3 && response[s] == 0x7F && response[s + 1] == 0x22 {
            throw PeregrineProtocolError.nak(request: 0x22, code: response[s + 2])
        }
        if n < 3 || response[s] != 0x62 || response[s + 1] != hi || response[s + 2] != lo {
            throw PeregrineProtocolError.unexpectedResponse(
                "RDBI id=\(String(format:"%04x",id)) got \(response.prefix(8).map{String(format:"%02x",$0)}.joined(separator:" "))"
            )
        }
        return response.subdata(in: (s + 3)..<response.endIndex)
    }
}

enum WDBI {
    /// Build a Write-By-Identifier request: `[0x2E, hi, lo, ...data]`. shearwater_common.c:587-593.
    static func request(id: UInt16, data: Data = Data()) -> Data {
        var p = Data(capacity: data.count + 3)
        p.append(0x2E)
        p.append(UInt8((id >> 8) & 0xFF))
        p.append(UInt8(id & 0xFF))
        p.append(data)
        return p
    }

    static func validate(response: Data, id: UInt16) throws {
        let hi = UInt8((id >> 8) & 0xFF)
        let lo = UInt8(id & 0xFF)
        let n = response.count
        let s = response.startIndex
        if n == 3 && response[s] == 0x7F && response[s + 1] == 0x2E {
            throw PeregrineProtocolError.nak(request: 0x2E, code: response[s + 2])
        }
        if n < 3 || response[s] != 0x6E || response[s + 1] != hi || response[s + 2] != lo {
            throw PeregrineProtocolError.unexpectedResponse(
                "WDBI id=\(String(format:"%04x",id)) got \(response.prefix(8).map{String(format:"%02x",$0)}.joined(separator:" "))"
            )
        }
    }
}

// MARK: - Block download primitives (0x35 / 0x36 / 0x37)

enum BlockDownload {
    /// `req_init`. shearwater_common.c:398-408.
    static func initRequest(address: UInt32, size: UInt32, compression: Bool) -> Data {
        return Data([
            0x35,
            compression ? 0x10 : 0x00,
            0x34,
            UInt8((address >> 24) & 0xFF),
            UInt8((address >> 16) & 0xFF),
            UInt8((address >>  8) & 0xFF),
            UInt8((address      ) & 0xFF),
            UInt8((size    >> 16) & 0xFF),
            UInt8((size    >>  8) & 0xFF),
            UInt8((size         ) & 0xFF),
        ])
    }

    /// Validate `[0x75, 0x10, blockSize]`. shearwater_common.c:433.
    static func parseInitResponse(_ response: Data) throws -> UInt8 {
        let s = response.startIndex
        guard response.count == 3,
              response[s] == 0x75,
              response[s + 1] == 0x10,
              response[s + 2] <= UInt8(Peregrine.SZ_PACKET)
        else {
            throw PeregrineProtocolError.unexpectedResponse(
                "block init got \(response.map{String(format:"%02x",$0)}.joined(separator:" "))"
            )
        }
        return response[s + 2]
    }

    /// `req_block`. block_num is 8-bit and wraps. shearwater_common.c:409, :450.
    static func blockRequest(blockNum: UInt8) -> Data {
        return Data([0x36, blockNum])
    }

    /// Validate `[0x76, blockNum, ...payload...]`. Returns payload. shearwater_common.c:457-460.
    static func parseBlockResponse(_ response: Data, expectedBlock: UInt8) throws -> Data {
        let s = response.startIndex
        guard response.count >= 2,
              response[s] == 0x76,
              response[s + 1] == expectedBlock
        else {
            throw PeregrineProtocolError.unexpectedResponse(
                "block hdr got \(response.prefix(4).map{String(format:"%02x",$0)}.joined(separator:" ")) expected 76 \(String(format:"%02x",expectedBlock))"
            )
        }
        return response.subdata(in: (s + 2)..<response.endIndex)
    }

    static let quitRequest = Data([0x37])

    /// Validate `[0x77, 0x00]`. shearwater_common.c:506.
    static func parseQuitResponse(_ response: Data) throws {
        let s = response.startIndex
        guard response.count == 2, response[s] == 0x77, response[s + 1] == 0x00 else {
            throw PeregrineProtocolError.unexpectedResponse(
                "quit got \(response.map{String(format:"%02x",$0)}.joined(separator:" "))"
            )
        }
    }
}

// MARK: - LRE + XOR decompression (compressed dive bodies)

/// Decompress a compressed dive payload as built by `shearwater_common_download` with
/// compression=1. Algorithm: `shearwater_common.c:76-132`.
///
/// LRE phase: stream is interpreted as 9-bit values, MSB-first.
///   - bit 9 set: lower 8 bits are a literal byte → append as-is
///   - bit 9 clear, value == 0: end-of-stream marker → stop
///   - bit 9 clear, value != 0: append `value` zero bytes
///
/// XOR phase (post-LRE): for i in 32..<size: data[i] ^= data[i-32].
enum Decompress {
    /// Decompress one *complete* compressed buffer. Returns (decompressed, isFinal).
    /// `isFinal` = true if the end-of-stream marker was seen.
    static func lre(_ data: Data) throws -> (out: Data, isFinal: Bool) {
        let nbits = data.count * 8
        if nbits % 9 != 0 {
            throw PeregrineProtocolError.decompressionAlignment(nbits)
        }
        var out = Data()
        out.reserveCapacity(data.count * 2) // rough guess
        var offset = 0
        var done = false
        // Materialize bytes into a stable array for fast indexing.
        let bytes = [UInt8](data)
        while offset + 9 <= nbits {
            let byteIdx = offset / 8
            let bit = offset % 8
            // Read 16 bits big-endian starting at byteIdx, then shift-extract 9 bits.
            // shearwater_common.c:91-92.
            let hi = UInt32(bytes[byteIdx]) << 8
            let lo = UInt32(bytes[byteIdx + 1])
            let word = hi | lo
            let shift = 16 - (bit + 9)
            let value = Int((word >> UInt32(shift)) & 0x1FF)
            if (value & 0x100) != 0 {
                out.append(UInt8(value & 0xFF))
            } else if value == 0 {
                done = true
                break
            } else {
                out.append(contentsOf: repeatElement(UInt8(0), count: value))
            }
            offset += 9
        }
        return (out, done)
    }

    /// In-place XOR de-interleave. shearwater_common.c:122-132.
    static func xorPhase(_ data: inout Data) {
        guard data.count > 32 else { return }
        // We can't subscript Data with arbitrary index unless we know startIndex.
        let s = data.startIndex
        for i in 32..<data.count {
            data[s + i] ^= data[s + i - 32]
        }
    }

    /// Convenience: full LRE+XOR pipeline as used by `shearwater_common_download` for dives.
    static func full(_ compressed: Data) throws -> Data {
        var (out, _) = try Self.lre(compressed)
        Self.xorPhase(&out)
        return out
    }
}

/// Incremental LRE end-of-stream detector. Tracks bit offset across `feed()` calls
/// without re-scanning already-processed bytes. Used during block downloads to detect
/// completion without full re-decompression each block.
final class IncrementalLREDetector {
    private var totalBitsReceived: Int = 0
    private var bitOffset: Int = 0
    private var allBytes: [UInt8] = []
    private(set) var isDone: Bool = false

    /// Feed new compressed bytes. Returns true if end-of-stream marker was found.
    func feed(_ newData: Data) -> Bool {
        if isDone { return true }
        allBytes.append(contentsOf: newData)
        totalBitsReceived = allBytes.count * 8

        while bitOffset + 9 <= totalBitsReceived && !isDone {
            let byteIdx = bitOffset / 8
            let bit = bitOffset % 8
            // Need at least 2 bytes from byteIdx for the 16-bit read.
            guard byteIdx + 1 < allBytes.count else { break }
            let hi = UInt32(allBytes[byteIdx]) << 8
            let lo = UInt32(allBytes[byteIdx + 1])
            let word = hi | lo
            let shift = 16 - (bit + 9)
            let value = Int((word >> UInt32(shift)) & 0x1FF)
            if (value & 0x100) == 0 && value == 0 {
                isDone = true
                return true
            }
            bitOffset += 9
        }
        return isDone
    }
}

// MARK: - Manifest record parsing

/// A 32-byte manifest record. shearwater_petrel.c:272-293.
struct ManifestRecord {
    /// Position in the manifest list, 1-based, as exposed in the UI.
    let index: Int
    /// Dive's storage offset relative to base_addr. shearwater_petrel.c:329.
    let address: UInt32
    /// 4-byte fingerprint (libdc uses this for "already seen" detection). offset +4.
    let fingerprint: Data
    /// The raw 32-byte record (handy for debugging/logging).
    let raw: Data
}

enum Manifest {
    /// Walk a manifest blob and return non-deleted dive records, terminating
    /// at the first non-`A5C4`/`5A23` header. Mirrors shearwater_petrel.c:275-293.
    static func parse(_ data: Data) -> [ManifestRecord] {
        var out: [ManifestRecord] = []
        var offset = data.startIndex
        var displayIndex = 1
        while offset + Peregrine.RECORD_SIZE <= data.endIndex {
            let hi = UInt16(data[offset]) << 8
            let lo = UInt16(data[offset + 1])
            let header = hi | lo
            if header == Peregrine.MARK_DELETED {
                offset += Peregrine.RECORD_SIZE
                continue
            }
            if header != Peregrine.MARK_VALID {
                break
            }
            let raw = data.subdata(in: offset..<(offset + Peregrine.RECORD_SIZE))
            let fingerprint = raw.subdata(in: (raw.startIndex + 4)..<(raw.startIndex + 8))
            let addr =
                (UInt32(raw[raw.startIndex + 20]) << 24) |
                (UInt32(raw[raw.startIndex + 21]) << 16) |
                (UInt32(raw[raw.startIndex + 22]) << 8)  |
                 UInt32(raw[raw.startIndex + 23])
            out.append(ManifestRecord(index: displayIndex, address: addr, fingerprint: fingerprint, raw: raw))
            displayIndex += 1
            offset += Peregrine.RECORD_SIZE
        }
        return out
    }
}

// MARK: - Logbook base address mapping (shearwater_petrel.c:215-235)

enum LogbookFormat {
    /// Read the logupload response (`ID_LOGUPLOAD = 0x8021`) and return the
    /// effective base address. The response is a 1-byte tag + 4-byte big-endian addr
    /// + trailing bytes. shearwater_petrel.c:221-240.
    /// Logic: if high byte >= 0xC0, base is 0xC0000000; else 0x80000000.
    static func baseAddress(fromLogUploadResponse data: Data) throws -> UInt32 {
        guard data.count >= 5 else {
            throw PeregrineProtocolError.unexpectedResponse("logupload too short \(data.count)")
        }
        let s = data.startIndex
        let highByte = data[s + 1]
        // shearwater_petrel.c:221-240: only 0x80 uses legacy base; all others
        // (0x90 Perdix AI, 0xC0 Peregrine, 0xDD newer) use 0xC0000000.
        if highByte == 0x80 {
            return 0x80000000
        } else {
            return 0xC0000000
        }
    }

    /// Manifest address depends on the logbook format/base address.
    /// shearwater_petrel.c:308: 0xC0 base → manifest at 0xFFFF0000; else 0xE0000000.
    static func manifestAddress(forBase base: UInt32) -> UInt32 {
        return base == 0xC0000000 ? 0xFFFF0000 : 0xE0000000
    }
}

// MARK: - Hex helpers (debug)

extension Data {
    func hexShort(_ max: Int = 16) -> String {
        let sliceCount = Swift.min(count, max)
        let head = prefix(sliceCount).map { String(format: "%02x", $0) }.joined(separator: " ")
        return count > max ? "\(head) … (+\(count - max) more)" : head
    }
}
