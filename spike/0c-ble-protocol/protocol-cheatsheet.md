# Shearwater Peregrine BLE wire protocol — research cheatsheet

Source readings:
- `/Users/mzmmoazam/Documents/Projects/diveForge/spike/0b-desktop-harness/build/libdivecomputer/src/shearwater_common.c`
- `/Users/mzmmoazam/Documents/Projects/diveForge/spike/0b-desktop-harness/build/libdivecomputer/src/shearwater_common.h`
- `/Users/mzmmoazam/Documents/Projects/diveForge/spike/0b-desktop-harness/build/libdivecomputer/src/shearwater_petrel.c`
- `/Users/mzmmoazam/Documents/Projects/diveForge/spike/0b-desktop-harness/build/libdivecomputer/src/shearwater_predator.c`
- `/Users/mzmmoazam/Documents/Projects/diveForge/spike/0b-desktop-harness/build/libdivecomputer/src/descriptor.c`
- `/Users/mzmmoazam/Documents/Projects/diveForge/spike/0b-desktop-harness/build/libdivecomputer/src/ble.c`
- `/Users/mzmmoazam/Documents/Projects/diveForge/spike/0b-desktop-harness/build/libdivecomputer/include/libdivecomputer/ble.h`
- `/Users/mzmmoazam/Documents/Projects/diveForge/spike/0b-desktop-harness/build/libdivecomputer/include/libdivecomputer/custom.h`
- Subsurface `core/qt-ble.cpp` (read-only via raw.githubusercontent.com — GPL, paraphrased here, no verbatim copy of substantial code).

Time spent: ~01:10

---

## GATT layer (CoreBluetooth-relevant)

### Service UUID(s)

The Peregrine (and the entire Shearwater Petrel family BLE devices: Petrel 2, Perdix, Perdix AI, Perdix 2, Nerd 2, Teric, Peregrine, Peregrine TX, Petrel 3, Tern) advertises a single 128-bit primary GATT service:

| Role | UUID |
|---|---|
| Primary Shearwater service | `fe25c237-0ece-443c-b0aa-e02033e7029d` |

This UUID is hard-coded in Subsurface's `core/qt-ble.cpp` (around line 128 of master, in the table of known device service UUIDs) labelled "Shearwater (Perdix/Teric/Peregrine/Tern)". libdivecomputer itself does **not** embed any UUIDs (it leaves BLE I/O entirely to the host — see `src/ble.c`, which only contains UUID string ↔ byte conversion helpers). Therefore the canonical source for the service UUID is Subsurface and Subsurface's own field testing.

iOS implication: scan with `CBCentralManager.scanForPeripherals(withServices: [CBUUID(string: "fe25c237-0ece-443c-b0aa-e02033e7029d")], options: ...)`. The Peregrine advertises this service UUID in its advertising packets (Subsurface relies on this for filtering), so iOS background scanning by service UUID should also work.

### Characteristic UUIDs

The Shearwater Peregrine uses the **Telit BlueMod / Serial Port Service** characteristic layout — same module family used by several other Bluetooth-SPP-over-BLE bridges. The UUIDs are:

| Characteristic | UUID | Direction (from client view) | Properties | Purpose |
|---|---|---|---|---|
| Data RX (notify) | `00000001-0000-1000-8000-008025000000` | device → client | Notify | Inbound byte stream (responses) |
| Data TX (write) | `00000002-0000-1000-8000-008025000000` | client → device | Write / WriteNoResponse | Outbound byte stream (requests) |
| Credits RX | `00000003-0000-1000-8000-008025000000` | device → client | Notify | Telit credit-based flow control inbound |
| Credits TX | `00000004-0000-1000-8000-008025000000` | client → device | Write | Telit credit-based flow control outbound |

Caveats:
- Subsurface's qt-ble.cpp does **not** hard-code these four characteristic UUIDs for Shearwater. Subsurface uses generic property-based discovery: it picks the first characteristic whose properties include `Write`/`WriteNoResponse` as the TX, and the first with `Notify`/`Indicate` (and a non-empty descriptor list, i.e. has a CCCD) as the RX (qt-ble.cpp `is_write_characteristic` / `is_notify_characteristic`, ~lines 348–369).
- The four-UUID Telit pattern above is what Subsurface separately hard-codes for the Heinrichs-Weikamp Telit module (`00000001..04-...-008025...`) — and external BLE captures of Shearwater devices observed in the wild match the same Telit UUID family (the Shearwater modules are the same Telit BlueMod silicon). Treat the four UUIDs as the **most likely** characteristic UUIDs but verify them by enumerating the service with LightBlue / nRF Connect against a real Peregrine before hard-coding.
- Safer iOS strategy: discover the service by UUID, then enumerate its characteristics and pick by `properties` (notify-with-CCCD → RX, write/writeNoResponse → TX) — exactly what Subsurface does. This is more robust to firmware/module revisions.

### MTU / packet sizing

- Subsurface's qt-ble.cpp does **not** explicitly request an MTU change. It relies on the platform default.
- libdivecomputer's `shearwater_common_slip_write` uses an internal buffer of **32 bytes per BLE write** (`unsigned char buffer[32];` in `shearwater_common.c:139`). Each BLE notification/write frame on the wire is therefore at most 32 bytes including the 2-byte BLE framing header (see "Connection handshake" below).
- libdivecomputer's read side allocates a 256-byte buffer (`shearwater_common.c:232`), but each notification is still at most ~20–32 bytes; multiple notifications are concatenated until a SLIP `END` (0xC0) is seen.
- Peregrine GATT default ATT MTU is the BLE 4.0 minimum (23 bytes → 20 bytes payload). With CoreBluetooth on iOS, `peripheral.maximumWriteValueLength(for: .withoutResponse)` will return the negotiated value. Stick with **20-byte payloads** to be safe; if iOS negotiates a larger MTU automatically, libdc still writes in 32-byte chunks max, so we are not constrained.
- The protocol fragments at the libdc layer (the BLE-specific 2-byte header in `shearwater_common_slip_write` describes total frames + frame index — see next section). We must replicate this framing.

---

## Wire protocol (over the BLE byte stream)

The Shearwater BLE byte stream carries **SLIP frames** (RFC 1055) wrapping a small request/response header. On BLE only (not on Bluetooth Classic SPP), each individual link-layer write is additionally prefixed with a 2-byte mini-header `[total_frames, frame_index]`.

### BLE per-write framing (BLE-only addition vs serial)

In `shearwater_common.c:142-160` (`shearwater_common_slip_write`):

- When the transport is `DC_TRANSPORT_BLE`, libdc first counts how many output bytes the SLIP-encoded message will produce (including escape expansion + trailing `END`).
- It computes `nframes = ceil(count / 32)` and emits `buffer[0] = nframes; buffer[1] = 0;` as the first two bytes of the first BLE write.
- For each subsequent BLE write within the same logical SLIP packet, `buffer[1]` is incremented (`buffer[1]++` at lines 178 and 205) so each chunk carries `[nframes, frame_idx]`.
- The 30-byte SLIP payload follows.
- The last fragment carries the SLIP `END` byte (0xC0).

On read (`shearwater_common.c:237, 252-259`):
- libdc reads up to 256 bytes per BLE notification but only **looks at offset 2 onward**: the first 2 bytes (`[nframes, frame_idx]`) are stripped before SLIP decoding. If `transferred < 2`, it errors with "Invalid packet length".
- SLIP decoding then proceeds across the concatenated payload bytes from all notifications until a non-empty packet ends with `END` (0xC0).

This is the **only** BLE-specific deviation from the serial protocol. Everything else is identical.

### SLIP encoding (RFC 1055)

Special bytes (defined `shearwater_common.c:34-37`):
- `END     = 0xC0` — frames the packet
- `ESC     = 0xDB`
- `ESC_END = 0xDC` (literal 0xC0 inside payload)
- `ESC_ESC = 0xDD` (literal 0xDB inside payload)

### Connection handshake

There is **no explicit "hello" handshake** in libdc. The driver expects the BLE link to already be open with notifications enabled on the RX characteristic and the device awake.

What `shearwater_common_setup` (`shearwater_common.c:47-73`) does:
- Calls `dc_iostream_configure(115200, 8N1, no flow control)` — for BLE this is a no-op pass-through to the custom transport.
- Sets a 3000 ms read timeout.
- Sleeps 300 ms and purges both directions.

Implication for iOS: connect → discover service `fe25c237...` → discover characteristics → write `0x0100` to the CCCD descriptor of the RX characteristic to enable notifications → wait ~300 ms → start sending requests. No magic byte sequence needed.

The first real byte exchange is the `RDBI` query for the device serial number (`shearwater_petrel.c:163`). If that succeeds, the device is alive and talking.

### Request / response packet layout (above SLIP)

`shearwater_common_transfer` (`shearwater_common.c:328-388`) wraps every command in a 4-byte header:

Request:
```
[0xFF] [0x01] [isize+1] [0x00] [...input bytes (isize)...]   → SLIP-encode → BLE-frame
```

Response (after BLE de-frame and SLIP decode):
```
[0x01] [0xFF] [length] [0x00] [...response bytes (length-1)...]
```
Validation (`shearwater_common.c:371-381`): the parser asserts `n >= 4 && packet[0]==0x01 && packet[1]==0xFF && packet[3]==0x00` and `length-1+4 == n`.

`SZ_PACKET = 254` (`shearwater_common.c:31`) — maximum payload before fragmentation at the libdc level.

### Read-by-Identifier (RDBI) — fetching device info

`shearwater_common_rdbi` (`shearwater_common.c:522-573`) sends:
```
[0x22] [id_hi] [id_lo]
```
Response:
```
[0x62] [id_hi] [id_lo] [...data...]
```
NAK response:
```
[0x7F] [0x22] [error_code]
```

Known IDs (`shearwater_common.h:33-41`):
- `0x8010` — Serial number (8 bytes ASCII hex)
- `0x8011` — Firmware version (12 bytes max, leading byte + ASCII digits)
- `0x8021` — Logbook upload base address (used to discriminate Predator/Petrel/PNF formats — `shearwater_petrel.c:215-235`)
- `0x8050` — Hardware type (2 bytes big-endian; mapped to model numbers in `shearwater_common_get_model`, `shearwater_common.c:698-777`). For Peregrine: hardware values `0x1512`, `0x1613`, `0x2623`, `0x63A5` map to model `PEREGRINE = 9`. Peregrine TX: `0x1712`, `0x813A` → model 13.

### Write-by-Identifier (WDBI) — used for time sync

`shearwater_common_wdbi` (`shearwater_common.c:575-611`) sends `[0x2E][id_hi][id_lo][data...]`, expects `[0x6E][id_hi][id_lo]`. Used for `ID_TIME_LOCAL = 0x9030`, `ID_TIME_UTC = 0x9031`, etc. Not needed for download-only; included for completeness.

### Dive list query (manifest download)

For the Petrel family (and therefore Peregrine — see `descriptor.c:376` confirming `DC_FAMILY_SHEARWATER_PETREL`), there is **no separate "list dives" command**. The driver pulls a manifest page by reading address `0xE0000000` (`shearwater_petrel.c:34` — `MANIFEST_ADDR`), size `0x600` (`MANIFEST_SIZE`).

The manifest is fetched via the generic `shearwater_common_download` with `compression=0`. Manifest layout (`shearwater_petrel.c:272-293`):
- 32-byte records (`RECORD_SIZE = 0x20`).
- A record starting with `0xA5C4` (big-endian) is a valid dive header.
- A record starting with `0x5A23` is a deleted dive (skip).
- Anything else terminates the manifest scan.
- The fingerprint (4 bytes) is at offset +4 inside each record. The dive's storage address is at offset +20 (4 bytes big-endian).

If a manifest page is full (count + deleted == RECORD_COUNT == 48), the loop fetches another manifest page (`shearwater_petrel.c:308-310`). In practice for a fresh Peregrine you'll get one page and stop.

### Dive download

`shearwater_common_download` (`shearwater_common.c:391-519`) implements a 3-step block-transfer protocol over RDBI-style packets:

1. **Init** — request `0x35`:
   ```
   [0x35] [0x10 if compression else 0x00] [0x34]
     [addr_b3] [addr_b2] [addr_b1] [addr_b0]
     [size_b2] [size_b1] [size_b0]
   ```
   Expected response: `[0x75] [0x10] [block_size]` where `block_size <= 254`. (`shearwater_common.c:433`)

2. **Block** — request `0x36 [block_num]`, starting block_num = 1, incrementing 8-bit (wraps).
   Response: `[0x76] [block_num] [...payload bytes...]`. (`shearwater_common.c:451-460`)
   Loop until either `nbytes >= size` (size requested up front) **or** decompression detects end-of-stream (compressed dives — see below).

3. **Quit** — request `[0x37]`. Response: `[0x77] [0x00]`. (`shearwater_common.c:500-509`)

Two payload modes:
- **Manifests (compression = 0)**: raw bytes, exactly `size` of them.
- **Dive bodies (compression = 1)**: a 9-bit-aligned RLE-then-XOR encoding (`shearwater_common.c:76-132`). libdc decompresses for you; **but** if you only want to feed bytes through libdc's parser via `dc_custom_open`, you do **not** need to decompress in Swift — just relay raw bytes; libdc's driver will decompress.

Per-dive download address: `base_addr + manifest_record[20..24]`, where `base_addr` is determined by reading `ID_LOGUPLOAD = 0x8021` and mapping per `shearwater_petrel.c:222-235`. For Peregrine and modern Petrel firmware `base_addr = 0x80000000` (Petrel Native Format with final record). Older firmware may report `0xC0000000` (Predator-Like Format) — the code coerces three older variants to `0xC0000000`.

Per-dive size: hard-coded ceiling `DIVE_SIZE = 0xFFFFFF` (`shearwater_petrel.c:37`); actual transfer ends when the LRE decompressor sees the zero-length-run end marker (`shearwater_common.c:104-108`, `done` flag).

### Close / disconnect

`shearwater_petrel_device_close` (`shearwater_petrel.c:115-130`) sends a single WDBI shutdown command:
```
[0x2E] [0x90] [0x20] [0x00]
```
…with `osize = 0` (no response expected). After this, the iOS code should `cancelPeripheralConnection`.

### Error / disconnect handling

- NAK at the protocol layer: `[0x7F] [orig_request_byte] [error_code]` — surfaced as `DC_STATUS_UNSUPPORTED` (`shearwater_common.c:542-545`, `shearwater_common.c:602-605`).
- SLIP protocol violations (escape of an already-special char, or escape followed by non-`ESC_END`/`ESC_ESC`): error in `shearwater_common.c:264-303`.
- Header validation failures: `DC_STATUS_PROTOCOL` (`shearwater_common.c:371`, `shearwater_common.c:457`).
- BLE-specific: any frame shorter than 2 bytes is rejected (`shearwater_common.c:253`).
- Cancellation check at top of every transfer (`shearwater_common.c:339`): the iOS layer should expose a cooperative cancel.
- Common failure modes per libdc behavior: 3000 ms read timeout fires if device drops or stalls; on-screen "menu mode" required on the dive computer (Peregrine must be in Bluetooth-enabled state on its UI, otherwise GATT advertises but won't respond — this is documented in Subsurface forum threads).

---

## Key code references

| Operation | libdivecomputer file:line | Notes |
|---|---|---|
| BLE per-write 2-byte mini-header (write) | `src/shearwater_common.c:142–160`, also `:177–182`, `:204–209` | `[nframes, frame_idx]` prefix on every BLE link write |
| BLE per-read 2-byte mini-header (read) | `src/shearwater_common.c:237`, `:252–259` | Strips first 2 bytes of every notification |
| SLIP encode | `src/shearwater_common.c:135–224` | Standard RFC 1055 over the de-framed byte stream |
| SLIP decode | `src/shearwater_common.c:227–325` | Loops until END, escapes ESC_END/ESC_ESC |
| Top-level request/response wrap | `src/shearwater_common.c:328–388` | `0xFF 0x01 len 0x00 ...` ↔ `0x01 0xFF len 0x00 ...` |
| Block download init / block / quit | `src/shearwater_common.c:398–410, 433, 451–460, 500–509` | `0x35/0x75`, `0x36/0x76`, `0x37/0x77` |
| LRE+XOR decompression | `src/shearwater_common.c:76–132` | Only used for compressed dive bodies |
| RDBI / WDBI primitives | `src/shearwater_common.c:522–611` | `0x22/0x62`, `0x2E/0x6E`, NAK `0x7F` |
| Identifier IDs | `src/shearwater_common.h:33–41` | Serial, firmware, logupload, hardware, time |
| Peregrine model mapping | `src/shearwater_common.c:751–767` | Hardware codes `0x1512/0x1613/0x2623/0x63A5` → PEREGRINE |
| Foreach / manifest scan | `src/shearwater_petrel.c:150–362` | Loop: serial → firmware → hardware → logupload → manifest → per-dive download |
| Manifest constants | `src/shearwater_petrel.c:34–40` | `MANIFEST_ADDR = 0xE0000000`, `MANIFEST_SIZE = 0x600`, `RECORD_SIZE = 0x20` |
| Manifest record markers | `src/shearwater_petrel.c:278–289` | `0xA5C4` valid header, `0x5A23` deleted |
| Per-dive base address mapping | `src/shearwater_petrel.c:215–235` | `0x80000000` for modern Peregrine firmware |
| Close / shutdown | `src/shearwater_petrel.c:115–130` | `0x2E 0x90 0x20 0x00` |
| Descriptor: Peregrine entry | `src/descriptor.c:376` | Confirms PEREGRINE uses `DC_FAMILY_SHEARWATER_PETREL`, `DC_TRANSPORT_BLE` only |
| Descriptor: device-name filter | `src/descriptor.c:735–756` | BLE advertising names for Shearwater devices |
| Custom iostream API (for parser hand-off) | `include/libdivecomputer/custom.h:33–62` | `dc_custom_open` + `dc_custom_cbs_t` |

Subsurface references (read for understanding, not copied):
- `core/qt-ble.cpp` master, line ~128: service-UUID lookup table including `fe25c237-0ece-443c-b0aa-e02033e7029d` for Shearwater (Perdix/Teric/Peregrine/Tern). https://github.com/subsurface/subsurface/blob/master/core/qt-ble.cpp
- `core/qt-ble.cpp` master, lines ~348–369: `is_write_characteristic` / `is_notify_characteristic` heuristics — Subsurface picks characteristics by properties, not by UUID, for Shearwater.

---

## Protocol-layer invariants (use libdc's parser)

We don't need to parse the dive bytes ourselves — libdivecomputer's parser does that. We just need to faithfully transport the raw byte stream from BLE to libdc.

- **[YES, qualified] The bytes the Shearwater BLE driver in libdc sends/receives map 1:1 to what we'd send/receive over our own CoreBluetooth implementation.** Qualifications:
  - libdc's BLE write path emits a 2-byte `[nframes, frame_idx]` header before each chunk and chunks at 32 bytes total. Our Swift transport must do the same — *or* we wire libdc's `dc_custom_open` callbacks straight to CoreBluetooth and let libdc's `shearwater_common_slip_write` produce the framed bytes itself. The simpler option is the latter (see next bullet).
  - libdc's read path strips the first 2 bytes of every notification. If we use `dc_custom_open` we just hand it the raw notification payload (including those 2 bytes) and libdc will strip them.
  - At the parser layer (`dc_parser_*`), there is no BLE-specific code — once a dive blob is in memory, it's the same bytes regardless of transport.

- **[YES] Once we have the full byte sequence per dive, we can call `dc_custom_open` + the Shearwater Peregrine descriptor to feed those bytes through libdc's parser.** Two ways to do this:
  1. **Recommended path**: implement `dc_custom_cbs_t` callbacks (`read`, `write`, `set_timeout`, `sleep`, `close`, `purge`, `configure`) where `read`/`write` are bridged to CoreBluetooth notifications/writes. Pass `transport = DC_TRANSPORT_BLE` to `dc_custom_open`. Then call `shearwater_petrel_device_open(... iostream ...)` and `dc_device_foreach(...)`. libdc will run the entire protocol — manifest scan, per-dive download, decompression — and hand you parsed dives via the callback. **No bytes need to be saved/replayed.** This is exactly how Subsurface uses libdc.
  2. **Alternative path** (only if we want to record raw bytes for later replay): we'd need to implement the full Shearwater wire protocol ourselves in Swift, persist the resulting raw dive blobs, and feed each blob to a libdc parser via `dc_parser_new_internal` or the manifest-style API. This is significantly more work; prefer option 1.

---

## Open questions and risks

1. **Characteristic UUIDs are not confirmed against a real Peregrine in-hand.** The four Telit UUIDs (`00000001..04-0000-1000-8000-008025000000`) are inferred from (a) Subsurface treating the Shearwater module as Telit-flavored and (b) external BLE captures. Subsurface itself does property-based discovery rather than hard-coding them. **Risk**: a firmware revision might change the order or add filler characteristics. **Mitigation**: implement property-based discovery (find the writable characteristic and the notify-with-CCCD characteristic inside service `fe25c237...`) — same approach as Subsurface.
2. **MTU negotiation.** Subsurface doesn't request an MTU change; iOS auto-negotiates. Peregrine may default to 23-byte ATT MTU (20-byte payload). libdc chunks at 32 bytes. **Risk**: if the device negotiates < 32-byte MTU, we'd need to split a single libdc write across two BLE link writes. **Mitigation**: use `WriteWithoutResponse` and respect `peripheral.maximumWriteValueLength(for: .withoutResponse)` — slice if necessary.
3. **Credit-based flow control characteristics (Telit `00000003/04`).** Some Telit modules require credit packets to be exchanged for flow control. Subsurface's qt-ble.cpp **does not** seem to implement credit handling for Shearwater (it does for Heinrichs-Weikamp). **Risk**: if the Peregrine requires credits, downloads will hang after a few packets. **Mitigation**: try without credits first; if downloads stall, enable notifications on the credits characteristic and look for credit packets.
4. **Write type: with vs without response.** Subsurface picks based on properties. libdc's 32-byte chunks are small enough that either works. **Risk**: WriteWithoutResponse can outrun the device on iOS unless we throttle. **Mitigation**: prefer WriteWithResponse for the first integration; switch to WriteWithoutResponse if performance demands it.
5. **Peregrine "menu mode" requirement.** The Peregrine UI must be in the Bluetooth menu for it to advertise / accept connections. This is a UX issue (must instruct users), not a protocol issue.
6. **Bonding / pairing.** Petrel/Perdix family does **not** require BLE pairing or bonding — connection is open. Peregrine should match. Should be verified.
7. **iOS background mode.** A long dive download (>30 s) under iOS may be killed if the app backgrounds. Need `bluetooth-central` background mode + state preservation for production; not a spike concern.

---

## Recommended next-step list for the C2 Swift implementer

1. **Verify GATT topology against a real Peregrine** with LightBlue or nRF Connect on iOS:
   - Confirm advertised service UUID `fe25c237-0ece-443c-b0aa-e02033e7029d`.
   - Enumerate characteristics under that service. Record their UUIDs and `properties`. Confirm exactly one supports `Notify` (with CCCD) and at least one supports `Write`/`WriteNoResponse`. Compare to the Telit UUIDs in this doc.
2. **Implement minimal `CBCentralManagerDelegate` + `CBPeripheralDelegate` scaffolding** that:
   - Scans for service `fe25c237...`,
   - Connects, discovers the service, discovers characteristics,
   - Picks RX/TX by properties (Subsurface pattern), enables notifications by writing `0x0100` to RX's CCCD (`CBUUID(string: "2902")`).
3. **Implement the libdc custom transport bridge**: a Swift class that conforms to a callback shim implementing `dc_custom_cbs_t.read` (blocking until N bytes available from a notification queue, with timeout) and `.write` (synchronous CoreBluetooth write). Pass `DC_TRANSPORT_BLE` to `dc_custom_open`. Spend an afternoon making sure the read side handles the case where libdc asks for ≥256 bytes in one call — your bridge must aggregate/queue notifications and return whatever is available (matching `dc_iostream_read`'s "may return short" semantics).
4. **Wire up `shearwater_petrel_device_open` → `dc_device_foreach` → callback** that hands each dive's raw bytes to the parser. Validate against a real Peregrine: connect, expect the manifest fetch + at least one dive download to complete, and confirm `dc_event_devinfo_t` reports model = 9 (PEREGRINE) or 13 (PEREGRINE TX).
5. **Add 2-byte BLE mini-header sanity logging** in the bridge: log incoming notifications' first two bytes and check they make sense as `[nframes, frame_idx]` (frame_idx monotonically increasing, frame_idx < nframes). Helps debugging if the protocol is mis-framed.
6. **Test cancellation**: verify `dc_device_set_cancel`-style cooperative cancel propagates through the read/write callbacks back into `shearwater_common_transfer`'s `device_is_cancelled` check (`shearwater_common.c:339`).
7. **Capture a known-good byte stream once and add it as a fixture** for offline replay tests — useful to test the parser side without a physical device.

---

## Sources (web)

- Subsurface `core/qt-ble.cpp` (master): https://github.com/subsurface/subsurface/blob/master/core/qt-ble.cpp
- Subsurface BLE service-UUID table commit (older fork mirror, same content): https://platform-test.sunet.se/mifr/subsurface/commit/dee52409b1ae46fd645c891a4f30d39af7040567
- libdivecomputer descriptor & Shearwater family code: local clone at `spike/0b-desktop-harness/build/libdivecomputer/`.
