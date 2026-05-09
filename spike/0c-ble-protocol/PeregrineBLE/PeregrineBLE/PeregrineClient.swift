// PeregrineClient.swift
// DiveForge spike — Phase C2 Layer 2 (GATT layer only)
//
// Scans for the Shearwater Peregrine, connects, discovers the SPP service +
// characteristic, subscribes to notifications, and surfaces all incoming bytes
// as a hex log. Sending bytes is also exposed for Layer 3 work later.
//
// Verified GATT layer (LightBlue, 2026-05-09):
//   Service:        FE25C237-0ECE-443C-B0AA-E02033E7029D
//   Characteristic: 27B7570B-359E-45A3-91BB-CF7E70049BD2 (Notify+Write+WriteNoResponse, un-readable)
//
// Throwaway spike code. No tests, minimal error handling.

import Foundation
import CoreBluetooth
import Combine

@MainActor
final class PeregrineClient: NSObject, ObservableObject {

    // MARK: - Published state (drives the SwiftUI)

    @Published private(set) var status: String = "Idle"
    @Published private(set) var connected: Bool = false
    @Published private(set) var canSend: Bool = false
    @Published private(set) var log: [LogEntry] = []
    @Published private(set) var rxBuffer: Data = Data()  // raw inbound bytes accumulator

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

    // MARK: - Internals

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var sppCharacteristic: CBCharacteristic?
    private var pendingScan = false

    // MARK: - Lifecycle

    override init() {
        super.init()
        // Start the central manager on the main queue so delegate calls can update @Published cleanly.
        // For a production app we'd use a dedicated BLE queue and dispatch UI updates explicitly.
        central = CBCentralManager(delegate: self, queue: nil, options: [
            CBCentralManagerOptionShowPowerAlertKey: true,
        ])
    }

    // MARK: - Public actions

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
    }

    /// Send raw bytes to the SPP characteristic. Layer 3 will call this with framed protocol bytes.
    /// Uses .withResponse if the characteristic supports it; otherwise .withoutResponse.
    func send(_ data: Data) {
        guard let p = peripheral, let ch = sppCharacteristic else {
            append(.err, "send: not connected"); return
        }
        let writeType: CBCharacteristicWriteType =
            ch.properties.contains(.write) ? .withResponse : .withoutResponse
        p.writeValue(data, for: ch, type: writeType)
        append(.tx, "TX (\(writeType == .withResponse ? "ACK" : "noACK")) \(data.hex)")
    }

    // MARK: - Logging

    private func append(_ direction: LogEntry.Direction, _ text: String) {
        // Keep the log bounded — spike, not production
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
            // Connect to the first match.
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
                    self.append(.info, "Subscribed to notifications. MTU(write/withResponse)=\(peripheral.maximumWriteValueLength(for: .withResponse)) MTU(noResp)=\(peripheral.maximumWriteValueLength(for: .withoutResponse))")
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
            self.append(.rx, "RX (\(value.count)B) \(value.hex)")
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
