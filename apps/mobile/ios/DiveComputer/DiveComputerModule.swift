import Foundation

@objc(DiveComputer)
class DiveComputerModule: RCTEventEmitter {

    override static func moduleName() -> String! { "DiveComputer" }

    override func supportedEvents() -> [String]! {
        ["diveComputerDiscovered", "diveComputerProgress", "diveComputerDisconnected"]
    }

    override static func requiresMainQueueSetup() -> Bool { false }

    @objc func startScan(_ serviceUuid: String,
                         resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
        resolve(nil)
    }

    @objc func stopScan(_ resolve: @escaping RCTPromiseResolveBlock,
                        reject: @escaping RCTPromiseRejectBlock) {
        resolve(nil)
    }

    @objc func connect(_ identifier: String,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
        resolve(nil)
    }

    @objc func disconnect(_ resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
        resolve(nil)
    }

    @objc func isConnected(_ resolve: @escaping RCTPromiseResolveBlock,
                           reject: @escaping RCTPromiseRejectBlock) {
        resolve(false)
    }

    @objc func listDives(_ resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
        resolve([])
    }

    @objc func downloadDive(_ index: NSNumber,
                            resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
        resolve(["rawBytes": ""])
    }
}
