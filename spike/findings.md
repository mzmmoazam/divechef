# DiveForge Plan 0 spike — final findings

**Spike duration:** 2026-05-09 (single-day session)
**Time spent:** ~6 hours of focused work (well under the 5–7 day budget)
**Outcome:** ✅ **Fully validated. Plans 1, 2, 3 unblocked.**

## TL;DR

1. **BLE → bytes → libdivecomputer parser → structured XML works end-to-end on a real Shearwater Peregrine via a pure Swift CoreBluetooth implementation on iOS.** The BLE-downloaded dive's parsed XML is **byte-identical** (42541 bytes, zero diff lines) to the parsed XML from the SQLite-export reference path for the same physical dive.
2. **Two big assumptions in the original spec turned out wrong** — both surfaced and resolved here:
   - libdivecomputer's BLE transport is BlueZ-only (Linux), so we cannot use it on iOS or macOS. PATH-2 (CoreBluetooth + libdc parser via raw bytes) is the only viable production path.
   - Subsurface's predicted Telit 4-characteristic UUID pattern is wrong for the Peregrine. The device exposes a single bidirectional SPP characteristic at `27B7570B-359E-45A3-91BB-CF7E70049BD2`. Property-based discovery would have caught this anyway.
3. **The dive data schema in the original spec was an educated guess. Now it's a fact** — see [Phase A+B findings](0a-uddf-inspection/findings.md) and the spec amendment commit `771e471`. All FFESSM scoring rules originally proposed are implementable from libdc's parsed sample data, including `palier_deco_manque` which is now High-confidence.

## Phase summaries

### Phase A — UDDF inspection (1 hour planned, 1 hour actual)

Discovered: **Shearwater Cloud's mobile app exports a SQLite `.db`, not UDDF.** Dive data lives only as `.swlogzp` proprietary blobs in the `log_data` table — `[4-byte LE length][gzip(Shearwater proprietary binary)]`, plus JSON header/footer rows.

Built `extract-dives.py` that decompresses the blob and runs `dctool parse` against the result. Validated against 4 real dives. Full findings at [`spike/0a-uddf-inspection/findings.md`](0a-uddf-inspection/findings.md).

### Phase B — libdivecomputer on macOS (2–3 days planned, 30 minutes actual)

Built libdivecomputer cleanly via Homebrew toolchain. Single binary `dctool` produced under `spike/0b-desktop-harness/build/install/bin/`.

**Key finding:** configure output reports `BLUEZ : no` / `BLE : no` because BlueZ is Linux-only. **`dctool` cannot use BLE on macOS or iOS.** The parser layer (`dctool parse`) works perfectly when fed bytes from any source.

This finding caused the Plan 0 amendment that replaced original Phase C with a focused pure-Swift CoreBluetooth spike.

### Phase C (revised) — Pure Swift CoreBluetooth BLE (5–7 days planned, ~5 hours actual)

Subagent-driven research produced [`protocol-cheatsheet.md`](0c-ble-protocol/protocol-cheatsheet.md) from libdc source. LightBlue Explorer verified GATT layout on the real device (and corrected the Subsurface assumption). User wrote a SwiftUI Xcode project; subagent wrote ~900 LOC of Layer 2 + Layer 3 Swift. Real-device test downloaded a real dive over BLE; `dctool parse` decoded it into XML byte-identical to the SQLite reference.

Full findings at [`spike/0c-ble-protocol/findings.md`](0c-ble-protocol/findings.md).

## Recommended changes to spec

Already applied in commit `771e471`. Summary:

### Schema changes (Section 3 — Data model)

`DiveSample` reshaped to match libdc's actual emitted fields:

```prisma
tSec         Int       // sample time, native interval 10s
depthM       Float
tempC        Float?
cnsPct       Float?
decoState    String    // "ndl" | "deco"
decoTimeSec  Int       // when ndl: NDL seconds remaining; when deco: required stop seconds
decoDepthM   Float     // when ndl: 0; when deco: required stop depth
ttsSec       Int?      // total time-to-surface seconds
```

Dropped speculative `ndlMin` and `cnsPct` columns in favor of the structured deco/NDL representation libdc actually provides.

### Rule changes (Section 4 — Scoring engine)

- `palier_deco_manque` confidence: Medium → **High**. Predicate now concrete: any sample with `decoState == "deco"` AND no continuous segment of ≥ `decoTimeSec` seconds within ±0.5m of `decoDepthM` in the final 60 s before surfacing.
- All other rules unchanged.

### Architecture confirmation (Section 2)

- BLE-direct ingestion remains the v1 plan, now validated as feasible.
- Approach A (smart app, smart backend) is reaffirmed: the app handles BLE I/O and downloads raw bytes; the backend handles parsing (via libdc) and scoring. The spike's success means the in-app native module's responsibility is just BLE transport — no parser logic required client-side.

## Recommendations for the production plans

### Plan 1 — Foundation + Scoring (ready to write now)

- Schema is locked. Backend libdivecomputer integration uses `dctool parse` (or libdc's parser API directly via FFI) on uploaded byte blobs. Scoring engine consumes the parsed sample stream.
- No spike-induced changes to backend stack.

### Plan 2 — Mobile App Shell (ready to write now)

- No changes from original sketch. Screens, i18n, auth, charts are all unchanged. Initial mock dives can be the parsed XMLs from Phase A.

### Plan 3 — BLE + Native Module (mechanical engineering only)

- **Wrap the spike's `PeregrineClient.swift` + `PeregrineProtocol.swift` as a TurboModule.** Estimated 3–5 days for iOS.
- Android port: 5–8 days. Same wire protocol, reimplement transport on `BluetoothGatt`. **First Android attempt should re-validate against a real device** (we did not test Android in the spike).
- Production polish items called out in [`spike/0c-ble-protocol/findings.md`](0c-ble-protocol/findings.md): chunk-size optimization, retry/backoff, partial-download recovery, manifest pagination, incremental LRE state, dive-number reconciliation across resyncs.

## Open questions remaining (none of these block Plan 1)

1. **Exact FFESSM threshold sources** — release-gate item, requires credentialed reviewer pass before public release.
2. **Android BLE port not validated** — Plan 3 risk. Same protocol expected to work; verify on real device early.
3. **Other Shearwater models untested** — Petrel/Perdix/Teric/Tern share the protocol per libdc but were not exercised in this spike.

## Files produced (committed)

- [`spike/README.md`](README.md)
- [`spike/0a-uddf-inspection/`](0a-uddf-inspection/) — SQLite extractor, parser, findings, sample DB anonymization rules
- [`spike/0b-desktop-harness/`](0b-desktop-harness/) — libdivecomputer build script (build artifacts gitignored)
- [`spike/0c-ble-protocol/protocol-cheatsheet.md`](0c-ble-protocol/protocol-cheatsheet.md) — research + verified GATT layout
- [`spike/0c-ble-protocol/swift-sources/`](0c-ble-protocol/swift-sources/) — canonical Swift sources (~900 LOC)
- [`spike/0c-ble-protocol/PeregrineBLE/`](0c-ble-protocol/PeregrineBLE/) — Xcode iOS project
- [`spike/0c-ble-protocol/verify.sh`](0c-ble-protocol/verify.sh) — diff harness for byte-identity check
- [`spike/0c-ble-protocol/findings.md`](0c-ble-protocol/findings.md) — Phase C detailed findings

## Spike code lifecycle

The `spike/` directory is throwaway exploration — none of its code ships in production. The Swift sources will be **rewritten cleanly** as a TurboModule in Plan 3 (the spike code is single-dive happy path, not production-grade). The Phase A SQLite extractor is no longer needed in production (BLE direct works). The libdivecomputer desktop build can stay around as a debugging aid.

Recommend keeping `spike/` in the repo until v1 ships, then archiving with a git tag (e.g., `spike-archive-v1`) and deleting from main if it bothers anyone.

---

**Handoff:** Plan 1 (Foundation + Scoring) can now be written against the amended spec at [`docs/superpowers/specs/2026-05-09-diveforge-v1-design.md`](../docs/superpowers/specs/2026-05-09-diveforge-v1-design.md) with full confidence.
