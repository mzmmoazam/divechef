import Foundation

extension Data {
    /// Parse "c0 db 42" or "c0db42" into Data. Whitespace ignored.
    init(hex: String) {
        let cleaned = hex.replacingOccurrences(of: " ", with: "")
        var bytes = [UInt8]()
        var idx = cleaned.startIndex
        while idx < cleaned.endIndex {
            let next = cleaned.index(idx, offsetBy: 2)
            bytes.append(UInt8(cleaned[idx..<next], radix: 16)!)
            idx = next
        }
        self.init(bytes)
    }
    var hexString: String { map { String(format: "%02x", $0) }.joined(separator: " ") }
}
