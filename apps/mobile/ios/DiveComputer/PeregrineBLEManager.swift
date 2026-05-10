// PeregrineBLEManager.swift
// DiveForge — Production BLE layer for Shearwater Peregrine dive computers.
//
// Adapted from spike/0c-ble-protocol/swift-sources/PeregrineClient.swift.
// Removes SwiftUI/Combine dependencies, logging, auto-connect behavior.
// Adds callback-based event delivery, thread-safety via serial DispatchQueue,
// and connect-by-identifier for React Native bridge integration.

import Foundation
import CoreBluetooth

// MARK: - PeregrineBLEManager

final class PeregrineBLEManager: NSObject {

    // MARK: - Constants

    static let serviceUUID = CBUUID(string: "FE25C237-0ECE-443C-B0AA-E02033E7029D")
    static let sppCharacteristicUUID = CBUUID(string: "27B7570B-359E-45A3-91BB-CF7E70049BD2")

    // MARK: - Callbacks

    /// Called when a peripheral is discovered during scan.
    /// Parameters: (identifier UUID string, name or nil, RSSI)
    var onDiscovered: ((_ identifier: String, _ name: String?, _ rssi: Int) -> Void)?

    /// Called with progress updates during downloads.
    /// Parameters: (description string, bytes downloaded so far)
    var onProgress: ((_ label: String, _ bytesDownloaded: Int) -> Void)?

    /// Called when the peripheral disconnects (including unexpected disconnects).
    /// Parameter: optional error description
    var onDisconnected: ((_ error: String?) -> Void)?

    // MARK: - Public state

    /// Whether the manager is connected and ready to send commands.
    private(set) var isReady: Bool = false

    /// Firmware version string captured from RDBI during listDives().
    private(set) var firmwareVersion: String?

    // MARK: - Internals (CoreBluetooth)

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var sppCharacteristic: CBCharacteristic?
    private var pendingScan = false
    private var scanServiceUUID: CBUUID?

    /// Serial queue for thread-safety. All state mutations and CB delegate work happen here.
    private let queue = DispatchQueue(label: "com.diveforge.peregrine-ble", qos: .userInitiated)

    /// Discovered peripherals cache (for connect-by-identifier).
    private var discoveredPeripherals: [String: CBPeripheral] = [:]

    // MARK: - Internals (protocol layer)

    private let slipDecoder = SLIP.Decoder()

    /// Continuation waiting for the next decoded SLIP frame.
    private var pendingFrameContinuation: CheckedContinuation<Data, Error>?

    /// Queue of frames already decoded but not yet awaited.
    private var pendingFrames: [Data] = []

    /// Per-request timeout (ms). libdc uses 3000 ms (shearwater_common.c:62).
    private let readTimeoutMs: UInt64 = 5000

    // MARK: - Connect completion

    private var connectContinuation: CheckedContinuation<Void, Error>?

    // MARK: - Lifecycle

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: queue, options: [
            CBCentralManagerOptionShowPowerAlertKey: true,
        ])
    }

    // MARK: - Public actions (Layer 2)

    /// Start scanning for Peregrine peripherals. Discovered peripherals are reported via onDiscovered.
    func startScan(serviceUuid: String? = nil) {
        let uuid = serviceUuid.flatMap { CBUUID(string: $0) } ?? Self.serviceUUID
        scanServiceUUID = uuid
        queue.async { [weak self] in
            guard let self = self else { return }
            guard self.central.state == .poweredOn else {
                self.pendingScan = true
                return
            }
            self.discoveredPeripherals.removeAll()
            self.central.scanForPeripherals(withServices: [uuid], options: [
                CBCentralManagerScanOptionAllowDuplicatesKey: false,
            ])
        }
    }

    /// Stop scanning.
    func stopScan() {
        queue.async { [weak self] in
            self?.central.stopScan()
        }
    }

    /// Connect to a specific peripheral by its UUID identifier string.
    /// Resolves when the GATT characteristic is discovered and notifications are enabled (isReady = true).
    func connect(identifier: String) async throws {
        try await withCheckedThrowingContinuation { (cc: CheckedContinuation<Void, Error>) in
            queue.async { [weak self] in
                guard let self = self else {
                    cc.resume(throwing: PeregrineProtocolError.notConnected)
                    return
                }
                guard let targetUUID = UUID(uuidString: identifier) else {
                    cc.resume(throwing: PeregrineProtocolError.unexpectedResponse("Invalid UUID: \(identifier)"))
                    return
                }

                // Check if we discovered it during scan.
                if let p = self.discoveredPeripherals[identifier] {
                    self.connectContinuation = cc
                    self.peripheral = p
                    p.delegate = self
                    self.central.stopScan()
                    self.central.connect(p, options: nil)
                } else {
                    // Try to retrieve by known identifier.
                    let known = self.central.retrievePeripherals(withIdentifiers: [targetUUID])
                    if let p = known.first {
                        self.connectContinuation = cc
                        self.peripheral = p
                        p.delegate = self
                        self.central.stopScan()
                        self.central.connect(p, options: nil)
                    } else {
                        cc.resume(throwing: PeregrineProtocolError.unexpectedResponse("Peripheral \(identifier) not found"))
                    }
                }
            }
        }
    }

    /// Disconnect from the current peripheral.
    func disconnect() {
        queue.async { [weak self] in
            guard let self = self else { return }
            if let p = self.peripheral, p.state != .disconnected {
                self.central.cancelPeripheralConnection(p)
            }
            self.cleanupConnection(error: nil)
        }
    }

    // MARK: - Public actions (Layer 3)

    /// Discover dives on the device. Reads serial/firmware/hardware/logupload, then the
    /// manifest. Returns array of (index, address, fingerprintHex) tuples.
    func listDives() async throws -> [(index: Int, address: UInt32, fingerprintHex: String)] {
        guard isReady else { throw PeregrineProtocolError.notConnected }

        // Per shearwater_petrel.c:160-220, libdc reads serial -> firmware -> hardware -> logupload
        let _ = try await rdbi(id: Peregrine.ID_SERIAL, expectedLen: 8)

        let firmware = try await rdbi(id: Peregrine.ID_FIRMWARE)
        firmwareVersion = String(data: firmware, encoding: .ascii)

        let _ = try await rdbi(id: Peregrine.ID_HARDWARE, expectedLen: 2)

        let logupload = try await rdbi(id: Peregrine.ID_LOGUPLOAD, expectedLen: 9)
        let baseAddr = try LogbookFormat.baseAddress(fromLogUploadResponse: logupload)

        // Download the manifest (uncompressed).
        let manifestBlob = try await downloadBlob(
            address: Peregrine.MANIFEST_ADDR,
            size: Peregrine.MANIFEST_SIZE,
            compression: false
        )
        let records = Manifest.parse(manifestBlob)

        // Cache for downloadDive.
        self._baseAddr = baseAddr
        self._records = records

        return records.map { rec in
            (index: rec.index,
             address: rec.address,
             fingerprintHex: rec.fingerprint.map { String(format: "%02x", $0) }.joined())
        }
    }

    /// Download the dive at the given 1-based index. Returns raw decompressed bytes.
    func downloadDive(at index: Int) async throws -> Data {
        guard isReady else { throw PeregrineProtocolError.notConnected }
        guard let baseAddr = _baseAddr else {
            throw PeregrineProtocolError.unexpectedResponse("call listDives() first")
        }
        guard let rec = _records.first(where: { $0.index == index }) else {
            throw PeregrineProtocolError.unexpectedResponse("dive index \(index) not in manifest")
        }

        onProgress?("Starting dive \(index)...", 0)

        // Compressed dive-body download.
        let compressedBlob = try await downloadBlob(
            address: baseAddr + rec.address,
            size: Peregrine.DIVE_SIZE,
            compression: true,
            progressLabel: "dive \(index)"
        )

        // Decompress: LRE + XOR.
        let decompressed = try Decompress.full(compressedBlob)

        onProgress?("Done. \(decompressed.count) bytes.", decompressed.count)

        return decompressed
    }

    // Cache populated by listDives(), used by downloadDive(at:).
    private var _baseAddr: UInt32?
    private var _records: [ManifestRecord] = []

    // MARK: - Layer 3 internals (transfer + block download)

    /// One round-trip: wrap -> SLIP-encode -> BLE-fragment -> write; then await one logical
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
    private func downloadBlob(address: UInt32, size: UInt32, compression: Bool,
                              progressLabel: String? = nil) async throws -> Data {
        // Init.
        let initReq = BlockDownload.initRequest(address: address, size: size, compression: compression)
        let initRsp = try await transfer(initReq)
        let _ = try BlockDownload.parseInitResponse(initRsp)

        // Loop blocks.
        var raw = Data()
        var blockNum: UInt8 = 1
        var nbytes: UInt32 = 0
        var done = false

        while nbytes < size && !done {
            let req = BlockDownload.blockRequest(blockNum: blockNum)
            let rsp = try await transfer(req)
            let payload = try BlockDownload.parseBlockResponse(rsp, expectedBlock: blockNum)
            raw.append(payload)
            nbytes &+= UInt32(payload.count)
            blockNum = blockNum &+ 1

            if compression {
                // Cheap done-check: try LRE-decode to detect end-of-stream marker.
                if (raw.count * 8) % 9 == 0 {
                    let (_, isFinal) = try Decompress.lre(raw)
                    if isFinal { done = true }
                }
            }

            if let label = progressLabel {
                onProgress?(label, raw.count)
            }
        }

        // Quit.
        let quitRsp = try await transfer(BlockDownload.quitRequest)
        try BlockDownload.parseQuitResponse(quitRsp)

        return raw
    }

    // MARK: - BLE-frame I/O

    /// Fragment a single SLIP-encoded logical frame into BLE chunks and write each chunk.
    private func sendBLEFrames(_ slipFrame: Data) async throws {
        guard let p = peripheral, let ch = sppCharacteristic else {
            throw PeregrineProtocolError.notConnected
        }
        let chunkSize = Peregrine.BLE_CHUNK_SIZE

        // Prefer writeWithoutResponse for speed.
        let writeType: CBCharacteristicWriteType =
            ch.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse

        let chunks = BLEFramer.fragment(slipFrame, chunkSize: chunkSize)
        for chunk in chunks {
            if writeType == .withoutResponse {
                while !p.canSendWriteWithoutResponse {
                    try await Task.sleep(nanoseconds: 2_000_000) // 2 ms
                }
            }
            p.writeValue(chunk, for: ch, type: writeType)
        }
    }

    /// Drain incoming notification chunks: strip 2-byte mini-header, feed SLIP decoder,
    /// dispatch any complete logical frames.
    private func handleIncoming(_ chunk: Data) {
        let stripped: Data
        do {
            stripped = try BLEFramer.stripHeader(chunk)
        } catch {
            return
        }
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
                    self?.queue.async {
                        guard let self = self else {
                            cc.resume(throwing: PeregrineProtocolError.notConnected)
                            return
                        }
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
            let first = try await group.next()!
            group.cancelAll()
            // Clear any dangling continuation if the timeout won the race.
            self.queue.async { [weak self] in
                if let cc = self?.pendingFrameContinuation {
                    self?.pendingFrameContinuation = nil
                    cc.resume(throwing: PeregrineProtocolError.timeout)
                }
            }
            return first
        }
    }

    // MARK: - Internal helpers

    private func cleanupConnection(error: String?) {
        peripheral = nil
        sppCharacteristic = nil
        isReady = false
        _baseAddr = nil
        _records.removeAll()
        firmwareVersion = nil
        // Fail any in-flight frame wait.
        if let cc = pendingFrameContinuation {
            pendingFrameContinuation = nil
            cc.resume(throwing: PeregrineProtocolError.notConnected)
        }
        pendingFrames.removeAll()
        // Fail connect continuation if pending.
        if let cc = connectContinuation {
            connectContinuation = nil
            cc.resume(throwing: PeregrineProtocolError.notConnected)
        }
        onDisconnected?(error)
    }
}

// MARK: - CBCentralManagerDelegate

extension PeregrineBLEManager: CBCentralManagerDelegate {

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn, pendingScan {
            pendingScan = false
            let uuid = scanServiceUUID ?? Self.serviceUUID
            central.scanForPeripherals(withServices: [uuid], options: [
                CBCentralManagerScanOptionAllowDuplicatesKey: false,
            ])
        }
    }

    func centralManager(_ central: CBCentralManager,
                        didDiscover peripheral: CBPeripheral,
                        advertisementData: [String : Any],
                        rssi RSSI: NSNumber) {
        let id = peripheral.identifier.uuidString
        discoveredPeripherals[id] = peripheral
        onDiscovered?(id, peripheral.name, RSSI.intValue)
    }

    func centralManager(_ central: CBCentralManager,
                        didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([Self.serviceUUID])
    }

    func centralManager(_ central: CBCentralManager,
                        didFailToConnect peripheral: CBPeripheral,
                        error: Error?) {
        let msg = error?.localizedDescription ?? "unknown error"
        if let cc = connectContinuation {
            connectContinuation = nil
            cc.resume(throwing: PeregrineProtocolError.unexpectedResponse("Connect failed: \(msg)"))
        }
    }

    func centralManager(_ central: CBCentralManager,
                        didDisconnectPeripheral peripheral: CBPeripheral,
                        error: Error?) {
        cleanupConnection(error: error?.localizedDescription)
    }
}

// MARK: - CBPeripheralDelegate

extension PeregrineBLEManager: CBPeripheralDelegate {

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let e = error {
            if let cc = connectContinuation {
                connectContinuation = nil
                cc.resume(throwing: PeregrineProtocolError.unexpectedResponse("discoverServices: \(e.localizedDescription)"))
            }
            return
        }
        for svc in peripheral.services ?? [] {
            if svc.uuid == Self.serviceUUID {
                peripheral.discoverCharacteristics([Self.sppCharacteristicUUID], for: svc)
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didDiscoverCharacteristicsFor service: CBService,
                    error: Error?) {
        if let e = error {
            if let cc = connectContinuation {
                connectContinuation = nil
                cc.resume(throwing: PeregrineProtocolError.unexpectedResponse("discoverCharacteristics: \(e.localizedDescription)"))
            }
            return
        }
        for ch in service.characteristics ?? [] {
            if ch.uuid == Self.sppCharacteristicUUID {
                sppCharacteristic = ch
                peripheral.setNotifyValue(true, for: ch)
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didUpdateNotificationStateFor characteristic: CBCharacteristic,
                    error: Error?) {
        if let e = error {
            if let cc = connectContinuation {
                connectContinuation = nil
                cc.resume(throwing: PeregrineProtocolError.unexpectedResponse("setNotifyValue: \(e.localizedDescription)"))
            }
            return
        }
        if characteristic.uuid == Self.sppCharacteristicUUID && characteristic.isNotifying {
            isReady = true
            if let cc = connectContinuation {
                connectContinuation = nil
                cc.resume()
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didUpdateValueFor characteristic: CBCharacteristic,
                    error: Error?) {
        guard error == nil, let value = characteristic.value else { return }
        handleIncoming(value)
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didWriteValueFor characteristic: CBCharacteristic,
                    error: Error?) {
        // No-op for production; write errors surface as timeouts on awaitFrame.
    }
}
