import AVKit
import React

@objc(DiveChefCameraEvents)
class DiveChefCameraEvents: RCTEventEmitter {

  private var interaction: NSObject? // AVCaptureEventInteraction (iOS 17.2+)

  override func supportedEvents() -> [String]! {
    return ["onShutterPress"]
  }

  @objc func activate() {
    guard #available(iOS 17.2, *) else { return }

    let captureInteraction = AVCaptureEventInteraction { [weak self] event in
      if event.phase == .ended {
        self?.sendEvent(withName: "onShutterPress", body: [
          "timestamp": Date().timeIntervalSince1970 * 1000
        ])
      }
    } secondary: { _ in
      // Ignore secondary (volume-down) — no action
    }

    self.interaction = captureInteraction

    // Attach to the key window's root view
    DispatchQueue.main.async {
      if let rootView = UIApplication.shared.connectedScenes
        .compactMap({ ($0 as? UIWindowScene)?.keyWindow?.rootViewController?.view })
        .first {
        rootView.addInteraction(captureInteraction)
      }
    }
  }

  @objc func deactivate() {
    guard #available(iOS 17.2, *) else { return }
    guard let captureInteraction = interaction as? AVCaptureEventInteraction else { return }

    DispatchQueue.main.async {
      UIApplication.shared.connectedScenes
        .compactMap { ($0 as? UIWindowScene)?.keyWindow?.rootViewController?.view }
        .first?.removeInteraction(captureInteraction)
    }
    self.interaction = nil
  }

  @objc override static func requiresMainQueueSetup() -> Bool { true }
}
