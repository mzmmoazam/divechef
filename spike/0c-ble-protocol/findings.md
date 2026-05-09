# Phase C findings — Peregrine BLE on CoreBluetooth (pure Swift)

## Outcome

✅ **Working — BLE → bytes → libdc parse → XML proven on a real Peregrine + iPhone.** The BLE-downloaded dive's parsed XML is **byte-identical** (42541 bytes, zero diff lines) to the SQLite-extracted reference for the same physical dive.

## Time spent

| Sub-task | Time |
|---|---|
| C1 — protocol research from libdc + Subsurface | ~70 min (subagent) |
| C1.5 — LightBlue GATT verification on real device | ~10 min (user) |
| C2 — Swift app: Layer 2 + Layer 3 + Xcode setup | ~3 hours total wall time including device debugging |
| C3 — verify.sh + parse + diff | <5 min |
| **Total Phase C** | **~5 hours**, well under the 5–7 day budget |

## What works

- **Layer 2 (CoreBluetooth)**: scan, connect, discover service+characteristic, subscribe to notifications. Connect time sub-second, RSSI -56 to -43.
- **Layer 3 (wire protocol)**: SLIP framing (RFC 1055), 2-byte BLE mini-header for fragment reassembly, request/response wrap (`0xFF 0x01` / `0x01 0xFF`), RDBI/WDBI primitives, block-download (`0x35`/`0x36`/`0x37`), LRE+XOR decompression.
- **Manifest read** + **dive download** + **persist to Documents/dives/dive-N.bin**.
- The Peregrine descriptor in libdivecomputer (`Shearwater Peregrine`) accepts the BLE-derived bytes via `dctool parse` with no special configuration.

## What didn't work / surprises

| Surprise | Detail |
|---|---|
| Subsurface's predicted Telit 4-char pattern is **wrong** for the Peregrine | Real device has a single bidirectional SPP characteristic at `27B7570B-359E-45A3-91BB-CF7E70049BD2`, NOT the four `00000001..04-...-008025...` Telit UUIDs. Property-based discovery (Subsurface's safer pattern) would have worked anyway. |
| `dctool` BLE on macOS is dead | Upstream libdivecomputer's BLE transport requires BlueZ (Linux-only). Confirmed by configure output. Means production must do BLE in CoreBluetooth + feed bytes into libdc's parser via `dc_custom_open` (or in our case, parse the saved file with `dctool parse` after upload). |
| Manifest dive order ≠ Shearwater Cloud dive numbering | The picker's "Dive 4" turned out to be SQLite-export "Dive #3" (May 8 morning). Production app should not assume manifest position == user-facing dive number. Use device-emitted fingerprints + start timestamps. |
| Xcode container download fails on free Personal Team | Apple restricts container download to paid dev accounts. Workaround for spike: `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` in Info.plist + Files-app AirDrop. Production: build an in-app "share dive" / direct upload-to-backend flow. |
| 384-byte raw-bytes difference between BLE and SQLite paths | BLE path: 10496 bytes after LRE+XOR. SQLite path: 10112 bytes after gunzip. Trailing padding/zeros that libdc's parser silently ignores. **Parsed output is identical.** |

## Verified GATT layout (real device)

- Service UUID: `FE25C237-0ECE-443C-B0AA-E02033E7029D`
- Single SPP characteristic UUID: `27B7570B-359E-45A3-91BB-CF7E70049BD2`
- Properties: Notify + Write + WriteNoResponse, **un-readable**
- Descriptor: CCCD (initial value 0)
- MTU(write/withResponse) = **512 bytes** (DLE negotiated)
- MTU(write/withoutResponse) = **77 bytes** → 75 bytes payload after 2-byte BLE mini-header
- Peregrine sends NO unsolicited bytes after subscribe — strictly master/slave with us as master

## Verified wire protocol (end-to-end roundtrip on real device)

Translated from libdivecomputer's `src/shearwater_petrel.c` and `src/shearwater_common.c`. Verified by getting back identical XML to the SQLite-export path:

| Operation | Working | Notes |
|---|---|---|
| SLIP framing (RFC 1055, `0xC0`/`0xDB` escapes) | ✅ | |
| BLE mini-header `[nframes, frame_idx]` outbound fragment | ✅ | Hardcoded chunk size 32 (matches libdc); 75 byte MTU available, optimization for production |
| BLE mini-header inbound reassembly | ✅ | Verified across multi-frame responses (77B chunks visible in spike app log) |
| Request wrap `0xFF 0x01 ...` | ✅ | |
| Response unwrap `0x01 0xFF ...` | ✅ | |
| RDBI (read by data identifier) | ✅ | Verified for SERIAL, FIRMWARE, HARDWARE, LOGUPLOAD |
| WDBI (write by data identifier) | ✅ | (used for block-download init) |
| Block download (`0x35`/`0x36`/`0x37` request, `0x75`/`0x76`/`0x77` ACK) | ✅ | 5328 compressed bytes for the test dive |
| LRE+XOR decompression | ✅ | 5328 in → 10496 out for the test dive |
| Manifest scan @ `0xE0000000` | ✅ | Returned 4 dives matching SQLite count |

## Diff vs SQLite-extracted parsing

```
$ diff /tmp/dive-blobs/c2-parsed.xml spike/0a-uddf-inspection/parsed/dive-3.xml
(no output)
$ wc -c /tmp/dive-blobs/c2-parsed.xml spike/0a-uddf-inspection/parsed/dive-3.xml
   42541 /tmp/dive-blobs/c2-parsed.xml
   42541 dive-3.xml
```

**Conclusion: BLE-downloaded bytes are parser-equivalent to DB-extracted bytes. Yes, fully.**

## Recommendation for Plan 3 (BLE in production RN app)

### Plumbing (mechanical engineering, not unknowns)

- **Wrap the spike's `PeregrineClient.swift` + `PeregrineProtocol.swift` as a TurboModule** — exposed to RN as `DiveComputer.scan() / connect() / listDives() / downloadDive()`. The Swift code is ~500 lines of pure logic with no internal RN coupling — a very clean wrap.
- **Estimated effort: 3–5 days** for iOS, including the bridge boilerplate, Promise plumbing, and connection-state observability.
- **Android port: 5–8 days.** Android's `BluetoothGatt` differs from CoreBluetooth in lifecycle and threading. Port the protocol layer 1:1 (it's pure byte logic) and reimplement the transport. Same wire protocol, same libdc parser. Note: libdc-for-Android needs to be cross-compiled from the JNI side, OR we keep parsing on the backend (the path of least resistance for v1 — see D2 spec amendments).

### Robustness items still needed in production

- Pairing UX: handle "device not advertising" (Peregrine sleeps, needs button-press wake), "Shearwater Cloud is connected" (only one BLE master allowed) — surface clear error states.
- Retry/backoff: a single block-download timeout currently aborts the whole dive. Production should retry the block 1–2 times before bailing.
- Partial-download recovery: if the user disconnects mid-dive download, we should resume from the last-acked block, not restart.
- Optimize chunk size to 75 bytes (full noResp MTU) — currently 32, ~2.3x slower than necessary.
- Address-space iteration: spike fetches one manifest page (48 dives). Production loops to handle larger manifests.
- LRE end-detection: spike re-decompresses the full accumulated buffer each block to check the end marker. Production should track decompression state across blocks (libdc does this).
- Dive-number reconciliation: device-side dive index ≠ user-visible dive number from any source. Use start timestamps + fingerprints to deduplicate across resyncs.

### Architectural confirmation for Plan 3

Plan 3's fundamental question — "can we BLE the Peregrine on iOS at all?" — is answered: **YES, fully**. Plan 3 becomes mechanical engineering work, not exploration.

## Outstanding risks for v1.5 / v2

- **No Android validation in this spike.** We assume the same wire protocol works over Android `BluetoothGatt` (it should — protocol is transport-agnostic). First Android attempt should re-validate on a real device.
- **Other Shearwater models untested.** Petrel/Perdix/Teric/Tern are spec'd to use the same protocol but were not tested. Promised by libdc, but verification recommended before claiming "supports all Shearwater" in marketing.
- **Firmware updates may break things.** Shearwater could change anything in a firmware update. Production should record device firmware version per sync and have an alert mechanism if syncs fail spike-wide.

## Files produced

- [`spike/0c-ble-protocol/protocol-cheatsheet.md`](protocol-cheatsheet.md) — research + verified GATT layout
- [`spike/0c-ble-protocol/swift-sources/PeregrineProtocol.swift`](swift-sources/PeregrineProtocol.swift) — pure-byte protocol helpers, ~511 LOC
- [`spike/0c-ble-protocol/swift-sources/PeregrineClient.swift`](swift-sources/PeregrineClient.swift) — CoreBluetooth + async API, ~570 LOC
- [`spike/0c-ble-protocol/swift-sources/ContentView.swift`](swift-sources/ContentView.swift) — SwiftUI test harness
- [`spike/0c-ble-protocol/PeregrineBLE/`](PeregrineBLE/) — Xcode project (target deployable to iPhone)
- [`spike/0c-ble-protocol/verify.sh`](verify.sh) — diff harness for byte-identity check
