import Foundation
import React

@objc(DiveComputer)
class DiveComputerModule: RCTEventEmitter {

    override static func moduleName() -> String! { "DiveComputer" }

    override func supportedEvents() -> [String]! {
        ["diveComputerDiscovered", "diveComputerProgress", "diveComputerDisconnected"]
    }

    override static func requiresMainQueueSetup() -> Bool { false }

    // MARK: - BLE Manager

    private lazy var manager: ShearwaterPetrelManager = {
        let m = ShearwaterPetrelManager()
        m.onDiscovered = { [weak self] identifier, name, rssi in
            let body: [String: Any] = [
                "identifier": identifier,
                "name": name as Any,
                "rssi": rssi,
            ]
            self?.sendEvent(withName: "diveComputerDiscovered", body: body)
        }
        m.onProgress = { [weak self] label, bytesDownloaded in
            let body: [String: Any] = [
                "bytesReceived": bytesDownloaded,
                "bytesExpected": NSNull(),
            ]
            self?.sendEvent(withName: "diveComputerProgress", body: body)
        }
        m.onDisconnected = { [weak self] error in
            let body: [String: Any] = [
                "reason": error ?? "unknown",
            ]
            self?.sendEvent(withName: "diveComputerDisconnected", body: body)
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

    @objc func getDeviceInfo(_ resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                let info = try await manager.getDeviceInfo()
                resolve([
                    "scanName": info.scanName as Any,
                    "serial": info.serial,
                    "firmwareVersion": info.firmwareVersion as Any,
                ])
            } catch {
                reject("DEVICE_INFO_ERROR", error.localizedDescription, error)
            }
        }
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
                        "firmwareVersion": manager.firmwareVersion as Any,
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
