import Foundation

@objc(DiveComputer)
class DiveComputerModule: RCTEventEmitter {

    override static func moduleName() -> String! { "DiveComputer" }

    override func supportedEvents() -> [String]! {
        ["diveComputerDiscovered", "diveComputerProgress", "diveComputerDisconnected"]
    }

    override static func requiresMainQueueSetup() -> Bool { false }

    // MARK: - BLE Manager

    private lazy var manager: PeregrineBLEManager = {
        let m = PeregrineBLEManager()
        m.onDiscovered = { [weak self] identifier, name, rssi in
            self?.sendEvent(withName: "diveComputerDiscovered", body: [
                "identifier": identifier,
                "name": name ?? NSNull(),
                "rssi": rssi,
            ])
        }
        m.onProgress = { [weak self] label, bytesDownloaded in
            self?.sendEvent(withName: "diveComputerProgress", body: [
                "label": label,
                "bytesDownloaded": bytesDownloaded,
            ])
        }
        m.onDisconnected = { [weak self] error in
            self?.sendEvent(withName: "diveComputerDisconnected", body: [
                "error": error ?? NSNull(),
            ])
        }
        return m
    }()

    // MARK: - Bridge methods

    @objc func startScan(_ serviceUuid: String,
                         resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
        manager.startScan(serviceUuid: serviceUuid)
        resolve(nil)
    }

    @objc func stopScan(_ resolve: @escaping RCTPromiseResolveBlock,
                        reject: @escaping RCTPromiseRejectBlock) {
        manager.stopScan()
        resolve(nil)
    }

    @objc func connect(_ identifier: String,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                try await manager.connect(identifier: identifier)
                resolve(nil)
            } catch {
                reject("CONNECT_ERROR", error.localizedDescription, error)
            }
        }
    }

    @objc func disconnect(_ resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
        manager.disconnect()
        resolve(nil)
    }

    @objc func isConnected(_ resolve: @escaping RCTPromiseResolveBlock,
                           reject: @escaping RCTPromiseRejectBlock) {
        resolve(manager.isReady)
    }

    @objc func listDives(_ resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                let dives = try await manager.listDives()
                let result: [[String: Any]] = dives.map { dive in
                    [
                        "index": dive.index,
                        "address": dive.address,
                        "fingerprintHex": dive.fingerprintHex,
                    ]
                }
                resolve(result)
            } catch {
                reject("LIST_DIVES_ERROR", error.localizedDescription, error)
            }
        }
    }

    @objc func downloadDive(_ index: NSNumber,
                            resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                let data = try await manager.downloadDive(at: index.intValue)
                let base64 = data.base64EncodedString()
                resolve(["rawBytes": base64])
            } catch {
                reject("DOWNLOAD_DIVE_ERROR", error.localizedDescription, error)
            }
        }
    }
}
