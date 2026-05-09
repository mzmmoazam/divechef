# Phase C2 Swift sources

Drop these three files into your Xcode project (`PeregrineBLE`, iOS App, SwiftUI):

- `PeregrineBLEApp.swift` — replaces the auto-generated `PeregrineBLEApp.swift` (just the `@main` entry point)
- `ContentView.swift` — replaces the auto-generated `ContentView.swift`
- `PeregrineClient.swift` — new file, the BLE manager (drag into the project, "Copy items if needed" + add to target)

## Required Info.plist key

Add this string to the project's Info.plist (or via Xcode → Target → Info → Custom iOS Target Properties):

```
Privacy - Bluetooth Always Usage Description
```

Value: `DiveForge spike: read your Shearwater Peregrine over Bluetooth.`

## Required capability

Xcode → Target → Signing & Capabilities → `+ Capability` → search "Background Modes" — NOT NEEDED for this spike (we only scan in foreground). Skip.

Bluetooth itself does not need a capability check; the Info.plist key above is sufficient on iOS 14+.

## Deployment target

iOS 16.0 or later (the SwiftUI `.onChange(of:_)` two-parameter form requires iOS 17, but the rest is iOS 16 compatible — if you're on a Mac with older Xcode, change `.onChange(of: client.log.count) { _, _ in` back to the single-parameter form: `.onChange(of: client.log.count) { _ in`).

## What this spike's Layer 2 demonstrates

Tap **Scan**:
1. Scans for the Shearwater service UUID `FE25C237-0ECE-443C-B0AA-E02033E7029D`.
2. On discovery, connects to the first matching peripheral.
3. Discovers the SPP characteristic `27B7570B-359E-45A3-91BB-CF7E70049BD2`.
4. Subscribes to notifications.
5. Logs every RX byte chunk with hex dump.

If you tap Scan with the Peregrine awake and not paired with Shearwater Cloud, you should see (something like):

```
· Central state: poweredOn
· Scanning for service FE25C237-...
· Discovered: Peregrine RSSI=-43 id=BB6379E9-25AB-9344-...
· Connecting...
· Connected. Discovering services...
· Service: FE25C237-0ECE-443C-B0AA-E02033E7029D
· Char: 27B7570B-359E-45A3-91BB-CF7E70049BD2 props=write+writeNoResp+notify
· Subscribed to notifications. MTU(write/withResponse)=N MTU(noResp)=M
· Notifications ON on 27B7570B-...
```

At this point we have layer-2 confirmed end-to-end. The Peregrine MAY also send unsolicited bytes after subscribing (some Shearwater devices send a banner). If you see RX entries appear without us sending anything, capture a screenshot — that's information for layer 3.

Note the MTU values printed — we need them to size our outbound BLE frames correctly in Layer 3.

## What this does NOT yet do

- Does not send the Shearwater wire protocol (no `0xFF 0x01` request frames yet).
- Does not parse SLIP, does not handle the 2-byte BLE mini-header.
- Does not download dives.

That's Layer 3, which we add after Layer 2 is confirmed working.

## Troubleshooting

- "Scanning..." but nothing found: check the Peregrine is in Bluetooth mode (its menu) AND that Shearwater Cloud is NOT connected (only one BLE master at a time).
- "Bluetooth state: unauthorized": kill the app, go to Settings → Privacy & Security → Bluetooth, enable for `PeregrineBLE`, relaunch.
- "Connect failed" repeatedly: forget the device under iOS Settings → Bluetooth (it only appears there if you previously paired) and retry.
- Build errors related to `.onChange`: see the deployment target note above.
