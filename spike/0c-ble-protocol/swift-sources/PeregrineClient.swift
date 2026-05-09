// PeregrineClient.swift
// DiveForge spike — Phase C2 Layer 2 (GATT) + Layer 3 (wire protocol).
//
// Layer 2: scans for the Shearwater Peregrine, connects, discovers the SPP service
// + characteristic, subscribes to notifications. Verified end-to-end against a real
// Peregrine 2026-05-09.
//
// Layer 3: implements the Shearwater wire protocol (BLE 2-byte mini-header + SLIP +
// request/response wrap + RDBI/WDBI + block-download) by composing PeregrineProtocol.swift.
// Async/await is used at the public API; CoreBluetooth callbacks feed continuations.
//
// Verified GATT layer (LightBlue, 2026-05-09):
//   Service:        FE25C237-0ECE-443C-B0AA-E02033E7029D
//   Characteristic: 27B7570B-359E-45A3-91BB-CF7E70049BD2 (Notify+Write+WriteNoResponse, un-readable)
//
// Throwaway spike code. Single-dive happy path. Bail on first error.

import Foundation
import CoreBluetooth
import Combine

// MARK: - Public DTOs

struct DiveSummary: Identifiable, Hashable {
    var id: Int { index }
    let index: Int        // 1-based
    let address: UInt32   // dive offset relative to base_addr
    let fingerprintHex: String
}

@MainActor
final class PeregrineClient: NSObject, ObservableObject {

    // MARK: - Published state (drives the SwiftUI)

    @Published private(set) var status: String = "Idle"
    @Published private(set) var connected: Bool = false
    @Published private(set) var canSend: Bool = false
    @Published private(set) var log: [LogEntry] = []
    @Published private(set) var rxBuffer: Data = Data()  // raw inbound bytes accumulator (debug only)
    @Published private(set) var dives: [DiveSummary] = []
    @Published private(set) var downloadProgress: String = ""

    struct LogEntry: Identifiable {
        let id = UUID()
        let timestamp = Date()
        let direction: Direction
        let text: String
        enum Direction: String { case info, rx, tx, err }
    }

    // MARK: - Constants

    static let serviceUUID = CBUUID(string: "FE25C237-0ECE-443C-B0AA-E02033E7029D")
    static let sppCharacteristicUUID = CBUUID(string: "27B7570B-359E-45A3-91BB-CF7E70049BD2")

    // MARK: - Internals (CoreBluetooth)

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var sppCharacteristic: CBCharacteristic?
    private var pendingScan = false

    // MARK: - Internals (protocol layer)

    private let slipDecoder = SLIP.Decoder()

    /// Continuation waiting for the next decoded SLIP frame. Only one outstanding request
    /// at a time — Shearwater is strictly master/slave so this is fine.
    private var pendingFrameContinuation: CheckedContinuation<Data, Error>?

    /// Queue of frames already decoded but not yet awaited. In practice this stays empty
    /// because the protocol is request/response — but defensive for late notifications.
    private var pendingFrames: [Data] = []

    /// Per-request timeout (ms). libdc uses 3000 ms (shearwater_common.c:62).
    private let readTimeoutMs: UInt64 = 5000

    // MARK: - Lifecycle

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil, options: [
            CBCentralManagerOptionShowPowerAlertKey: true,
        ])
    }

    // MARK: - Public actions (Layer 2)

    func startScan() {
        guard central.state == .poweredOn else {
            pendingScan = true
            append(.info, "Waiting for Bluetooth to power on...")
            return
        }
        log.removeAll()
        rxBuffer.removeAll()
        status = "Scanning"
        append(.info, "Scanning for service \(Self.serviceUUID.uuidString)...")
        central.scanForPeripherals(withServices: [Self.serviceUUID], options: [
            CBCentralManagerScanOptionAllowDuplicatesKey: false,
        ])
    }

    func stopScanAndDisconnect() {
        central.stopScan()
        if let p = peripheral, p.state != .disconnected {
            central.cancelPeripheralConnection(p)
        }
        peripheral = nil
        sppCharacteristic = nil
        connected = false
        canSend = false
        status = "Disconnected"
        append(.info, "Disconnected by user")
        // Fail any in-flight wait.
        if let cc = pendingFrameContinuation {
            pendingFrameContinuation = nil
            cc.resume(throwing: PeregrineProtocolError.notConnected)
        }
        pendingFrames.removeAll()
    }

    // MARK: - Public actions (Layer 3)

    /// Discover dives on the device. Reads serial/firmware/hardware/logupload, then the
    /// manifest. Populates `self.dives` and returns the summaries.
    func listDives() async throws -> [DiveSummary] {
        guard connected else { throw PeregrineProtocolError.notConnected }
        append(.info, "Listing dives...")

        // Per shearwater_petrel.c:160-220, libdc reads serial → firmware → hardware → logupload
        // before downloading the manifest. We replicate; the device info is also useful for the UI.
        let serial = try await rdbi(id: Peregrine.ID_SERIAL, expectedLen: 8)
        append(.info, "Serial: \(String(data: serial, encoding: .ascii) ?? serial.hexShort())")

        let firmware = try await rdbi(id: Peregrine.ID_FIRMWARE)
        append(.info, "Firmware: \(String(data: firmware, encoding: .ascii) ?? firmware.hexShort())")

        let hardware = try await rdbi(id: Peregrine.ID_HARDWARE, expectedLen: 2)
        append(.info, "Hardware: \(hardware.hexShort())")

        let logupload = try await rdbi(id: Peregrine.ID_LOGUPLOAD, expectedLen: 9)
        let baseAddr = try LogbookFormat.baseAddress(fromLogUploadResponse: logupload)
        append(.info, String(format: "Logbook base addr: 0x%08x", baseAddr))

        // Download the manifest (uncompressed). For a typical Peregrine one page is enough.
        let manifestBlob = try await downloadBlob(
            address: Peregrine.MANIFEST_ADDR,
            size: Peregrine.MANIFEST_SIZE,
            compression: false
        )
        let records = Manifest.parse(manifestBlob)
        append(.info, "Manifest: \(records.count) dive(s) found")

        let summaries = records.map { rec in
            DiveSummary(
                index: rec.index,
                address: rec.address,
                fingerprintHex: rec.fingerprint.hexShort()
            )
        }
        // Cache base addr for later download. Stash on self via a dictionary keyed on index.
        self._baseAddr = baseAddr
        self._records = records
        self.dives = summaries
        return summaries
    }

    /// Download the dive at the given 1-based index. Saves raw decompressed bytes to
    /// `Documents/dives/dive-<index>.bin`. Returns the same bytes.
    func downloadDive(at index: Int) async throws -> Data {
        guard connected else { throw PeregrineProtocolError.notConnected }
        guard let baseAddr = _baseAddr else {
            throw PeregrineProtocolError.unexpectedResponse("call listDives() first")
        }
        guard let rec = _records.first(where: { $0.index == index }) else {
            throw PeregrineProtocolError.unexpectedResponse("dive index \(index) not in manifest")
        }
        downloadProgress = "Starting dive \(index)..."
        append(.info, String(format: "Downloading dive %d at 0x%08x", index, baseAddr + rec.address))

        // Compressed dive-body download. The init request asks for DIVE_SIZE (the ceiling);
        // the LRE end-marker tells us when to stop.
        let compressedBlob = try await downloadBlob(
            address: baseAddr + rec.address,
            size: Peregrine.DIVE_SIZE,
            compression: true,
            progressLabel: "dive \(index)"
        )
        append(.info, "Compressed blob: \(compressedBlob.count) bytes — running LRE+XOR")

        // For libdc parity, return decompressed bytes (this is what `dctool parse` accepts
        // when fed via the standard parser path).
        let decompressed = try Decompress.full(compressedBlob)
        append(.info, "Decompressed: \(decompressed.count) bytes")

        // Persist to Documents/dives so the user can copy off-device via Files.
        try saveDive(index: index, bytes: decompressed)

        downloadProgress = "Done. \(decompressed.count) bytes saved."
        return decompressed
    }

    // Cache populated by listDives(), used by downloadDive(at:).
    private var _baseAddr: UInt32?
    private var _records: [ManifestRecord] = []

    // MARK: - Layer 3 internals (transfer + block download)

    /// One round-trip: wrap → SLIP-encode → BLE-fragment → write; then await one logical
    /// SLIP frame, BLE-strip per chunk, SLIP-decode (already done), unwrap.
    /// Mirrors `shearwater_common_transfer` shearwater_common.c:328-388.
    private func transfer(_ payload: Data) async throws -> Data {
        // 1) Send.
        let req = Wrap.wrapRequest(payload)
        let slip = SLIP.encode(req)
        try await sendBLEFrames(slip)

        // 2) Await one full SLIP frame.
        let frame = try await awaitFrame(timeoutMs: readTimeoutMs)

        // 3) Unwrap.
        return try Wrap.unwrapResponse(frame)
    }

    /// RDBI helper. If `expectedLen` is non-nil, asserts the returned data has that exact length.
    private func rdbi(id: UInt16, expectedLen: Int? = nil) async throws -> Data {
        let resp = try await transfer(RDBI.request(id: id))
        let inner = try RDBI.parse(response: resp, id: id)
        if let n = expectedLen, inner.count != n {
            throw PeregrineProtocolError.unexpectedResponse(
                "RDBI id=\(String(format:"%04x",id)) expected \(n) got \(inner.count)"
            )
        }
        return inner
    }

    /// Block download driver — mirrors `shearwater_common_download` shearwater_common.c:391-519.
    /// Returns raw concatenated payload bytes. For compressed (dive bodies) the caller must
    /// run Decompress.lre + Decompress.xorPhase to get the parser-friendly bytes.
    private func downloadBlob(address: UInt32, size: UInt32, compression: Bool,
                              progressLabel: String? = nil) async throws -> Data {
        // Init.
        let initReq = BlockDownload.initRequest(address: address, size: size, compression: compression)
        let initRsp = try await transfer(initReq)
        let blockSize = try BlockDownload.parseInitResponse(initRsp)
        append(.info, "Block init OK, block size = \(blockSize)")

        // Loop blocks. For compressed transfers, libdc decompresses incrementally to detect
        // end-of-stream. We use a simpler approach: since the LRE end-marker fits within one
        // block (it's a 9-bit zero), we run the LRE incrementally per block to know when to stop.
        var raw = Data()
        var blockNum: UInt8 = 1
        var nbytes: UInt32 = 0
        var done = false
        // Carry-over bits across blocks for incremental LRE end-detection.
        // We re-decompress the entire `raw` after each block to check `done`. For a single-dive
        // spike this is fine — typical compressed dive payloads are tens of KB at most.
        while nbytes < size && !done {
            let req = BlockDownload.blockRequest(blockNum: blockNum)
            let rsp = try await transfer(req)
            let payload = try BlockDownload.parseBlockResponse(rsp, expectedBlock: blockNum)
            raw.append(payload)
            nbytes &+= UInt32(payload.count)
            blockNum = blockNum &+ 1

            if compression {
                // Cheap done-check: try to LRE-decode what we have so far. The LRE decoder
                // requires bit-count % 9 == 0; if not, we just don't bother checking until
                // we have an aligned amount. This mirrors the libdc behaviour in spirit
                // (libdc decompresses each block as it arrives — see :476-486).
                if (raw.count * 8) % 9 == 0 {
                    let (_, isFinal) = try Decompress.lre(raw)
                    if isFinal { done = true }
                }
            }

            if let label = progressLabel {
                downloadProgress = "\(label): \(raw.count) bytes (block #\(blockNum))"
            }
        }

        // Quit.
        let quitRsp = try await transfer(BlockDownload.quitRequest)
        try BlockDownload.parseQuitResponse(quitRsp)
        append(.info, "Block download complete: \(raw.count) bytes")

        return raw
    }

    // MARK: - BLE-frame I/O

    /// Fragment a single SLIP-encoded logical frame into BLE chunks (each prefixed with the
    /// 2-byte mini-header) and write each chunk. Uses writeWithoutResponse if available.
    /// shearwater_common.c:142-160 / :177-209.
    private func sendBLEFrames(_ slipFrame: Data) async throws {
        guard let p = peripheral, let ch = sppCharacteristic else {
            throw PeregrineProtocolError.notConnected
        }
        // Pick chunk size. libdc uses 32 (shearwater_common.c:139). The Peregrine's BLE
        // write/withoutResponse MTU is 77 (verified in cheatsheet), but using 32 matches
        // libdc exactly — safest. We deliberately do NOT increase chunk size.
        let chunkSize = Peregrine.BLE_CHUNK_SIZE

        // Prefer writeWithoutResponse — faster and the protocol doesn't need link-layer ACKs.
        let writeType: CBCharacteristicWriteType =
            ch.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse

        let chunks = BLEFramer.fragment(slipFrame, chunkSize: chunkSize)
        append(.tx, "TX logical \(slipFrame.count)B → \(chunks.count) BLE frames (\(writeType == .withoutResponse ? "noACK" : "ACK"))")
        for chunk in chunks {
            // Throttle if iOS is back-pressured for writeWithoutResponse.
            if writeType == .withoutResponse {
                while !p.canSendWriteWithoutResponse {
                    try await Task.sleep(nanoseconds: 2_000_000) // 2 ms
                }
            }
            p.writeValue(chunk, for: ch, type: writeType)
        }
    }

    /// Drain incoming notification chunks: strip 2-byte mini-header, feed SLIP decoder,
    /// dispatch any complete logical frames. Called from the BLE delegate.
    private func handleIncoming(_ chunk: Data) {
        // Strip BLE mini-header.
        let stripped: Data
        do {
            stripped = try BLEFramer.stripHeader(chunk)
        } catch {
            append(.err, "BLE strip: \(error)")
            return
        }
        // Feed the SLIP decoder.
        let frames = slipDecoder.feed(stripped)
        for frame in frames {
            if let cc = pendingFrameContinuation {
                pendingFrameContinuation = nil
                cc.resume(returning: frame)
            } else {
                pendingFrames.append(frame)
            }
        }
    }

    /// Wait for one complete logical SLIP frame, with timeout.
    private func awaitFrame(timeoutMs: UInt64) async throws -> Data {
        // If we have a queued frame, return immediately.
        if !pendingFrames.isEmpty {
            return pendingFrames.removeFirst()
        }
        return try await withThrowingTaskGroup(of: Data.self) { group in
            group.addTask { [weak self] in
                try await withCheckedThrowingContinuation { (cc: CheckedContinuation<Data, Error>) in
                    Task { @MainActor in
                        guard let self = self else {
                            cc.resume(throwing: PeregrineProtocolError.notConnected)
                            return
                        }
                        // It's possible a frame arrived between the empty-check and now.
                        if !self.pendingFrames.isEmpty {
                            cc.resume(returning: self.pendingFrames.removeFirst())
                        } else {
                            self.pendingFrameContinuation = cc
                        }
                    }
                }
            }
            group.addTask {
                try await Task.sleep(nanoseconds: timeoutMs * 1_000_000)
                throw PeregrineProtocolError.timeout
            }
            // Whichever finishes first wins.
            let first = try await group.next()!
            group.cancelAll()
            // Clear any dangling continuation if the timeout won the race.
            await MainActor.run { [weak self] in
                if let cc = self?.pendingFrameContinuation {
                    self?.pendingFrameContinuation = nil
                    cc.resume(throwing: PeregrineProtocolError.timeout)
                }
            }
            return first
        }
    }

    // MARK: - File save

    private func saveDive(index: Int, bytes: Data) throws {
        let fm = FileManager.default
        let docs = try fm.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let dir = docs.appendingPathComponent("dives", isDirectory: true)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("dive-\(index).bin")
        try bytes.write(to: url)
        append(.info, "Saved \(bytes.count) bytes → \(url.path)")
    }

    // MARK: - Logging

    private func append(_ direction: LogEntry.Direction, _ text: String) {
        if log.count > 500 { log.removeFirst(log.count - 500) }
        log.append(LogEntry(direction: direction, text: text))
    }
}

// MARK: - CBCentralManagerDelegate

extension PeregrineClient: CBCentralManagerDelegate {

    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            self.append(.info, "Central state: \(stateString(central.state))")
            if central.state == .poweredOn, self.pendingScan {
                self.pendingScan = false
                self.startScan()
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didDiscover peripheral: CBPeripheral,
                                    advertisementData: [String : Any],
                                    rssi RSSI: NSNumber) {
        let name = peripheral.name ?? "(unnamed)"
        Task { @MainActor in
            self.append(.info, "Discovered: \(name) RSSI=\(RSSI) id=\(peripheral.identifier)")
            self.peripheral = peripheral
            peripheral.delegate = self
            central.stopScan()
            self.status = "Connecting to \(name)"
            self.append(.info, "Connecting...")
            central.connect(peripheral, options: nil)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didConnect peripheral: CBPeripheral) {
        Task { @MainActor in
            self.append(.info, "Connected. Discovering services...")
            self.status = "Discovering"
            peripheral.discoverServices([Self.serviceUUID])
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didFailToConnect peripheral: CBPeripheral,
                                    error: Error?) {
        Task { @MainActor in
            self.append(.err, "Failed to connect: \(error?.localizedDescription ?? "unknown")")
            self.status = "Connect failed"
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didDisconnectPeripheral peripheral: CBPeripheral,
                                    error: Error?) {
        Task { @MainActor in
            if let e = error {
                self.append(.err, "Disconnected with error: \(e.localizedDescription)")
            } else {
                self.append(.info, "Disconnected")
            }
            self.peripheral = nil
            self.sppCharacteristic = nil
            self.connected = false
            self.canSend = false
            self.status = "Disconnected"
            if let cc = self.pendingFrameContinuation {
                self.pendingFrameContinuation = nil
                cc.resume(throwing: PeregrineProtocolError.notConnected)
            }
        }
    }
}

// MARK: - CBPeripheralDelegate

extension PeregrineClient: CBPeripheralDelegate {

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        Task { @MainActor in
            if let e = error {
                self.append(.err, "discoverServices error: \(e.localizedDescription)")
                return
            }
            for svc in peripheral.services ?? [] {
                self.append(.info, "Service: \(svc.uuid.uuidString)")
                if svc.uuid == Self.serviceUUID {
                    peripheral.discoverCharacteristics([Self.sppCharacteristicUUID], for: svc)
                }
            }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didDiscoverCharacteristicsFor service: CBService,
                                error: Error?) {
        Task { @MainActor in
            if let e = error {
                self.append(.err, "discoverCharacteristics error: \(e.localizedDescription)")
                return
            }
            for ch in service.characteristics ?? [] {
                self.append(.info, "Char: \(ch.uuid.uuidString) props=\(propsString(ch.properties))")
                if ch.uuid == Self.sppCharacteristicUUID {
                    self.sppCharacteristic = ch
                    peripheral.setNotifyValue(true, for: ch)
                    self.append(.info, "Subscribed. MTU(write/withResponse)=\(peripheral.maximumWriteValueLength(for: .withResponse)) MTU(noResp)=\(peripheral.maximumWriteValueLength(for: .withoutResponse))")
                    self.connected = true
                    self.canSend = true
                    self.status = "Connected — ready"
                }
            }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didUpdateNotificationStateFor characteristic: CBCharacteristic,
                                error: Error?) {
        Task { @MainActor in
            if let e = error {
                self.append(.err, "setNotifyValue error: \(e.localizedDescription)")
                return
            }
            self.append(.info, "Notifications \(characteristic.isNotifying ? "ON" : "OFF") on \(characteristic.uuid.uuidString)")
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didUpdateValueFor characteristic: CBCharacteristic,
                                error: Error?) {
        Task { @MainActor in
            if let e = error {
                self.append(.err, "didUpdateValue error: \(e.localizedDescription)")
                return
            }
            guard let value = characteristic.value else { return }
            self.rxBuffer.append(value)
            self.append(.rx, "RX (\(value.count)B) \(value.hexShort())")
            self.handleIncoming(value)
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didWriteValueFor characteristic: CBCharacteristic,
                                error: Error?) {
        Task { @MainActor in
            if let e = error {
                self.append(.err, "Write error: \(e.localizedDescription)")
            }
        }
    }
}

// MARK: - Helpers

private func stateString(_ s: CBManagerState) -> String {
    switch s {
    case .unknown: return "unknown"
    case .resetting: return "resetting"
    case .unsupported: return "unsupported"
    case .unauthorized: return "unauthorized — check Bluetooth permission in Settings"
    case .poweredOff: return "poweredOff"
    case .poweredOn: return "poweredOn"
    @unknown default: return "?"
    }
}

private func propsString(_ p: CBCharacteristicProperties) -> String {
    var parts: [String] = []
    if p.contains(.read) { parts.append("read") }
    if p.contains(.write) { parts.append("write") }
    if p.contains(.writeWithoutResponse) { parts.append("writeNoResp") }
    if p.contains(.notify) { parts.append("notify") }
    if p.contains(.indicate) { parts.append("indicate") }
    return parts.joined(separator: "+")
}

extension Data {
    /// Compact hex string: "01 ff a3 ..."
    var hex: String {
        map { String(format: "%02x", $0) }.joined(separator: " ")
    }
}
