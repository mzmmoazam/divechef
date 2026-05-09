# Phase A + B findings — Shearwater Cloud SQLite + libdivecomputer

Combined findings doc because Phase A's "what is the export?" and Phase B's "can libdivecomputer parse it?" turned out to be the same question once we discovered the export format.

## TL;DR

1. **Shearwater Cloud mobile app exports a SQLite `.db`, not UDDF.** The `dive_logs` and `dive_log_records` tables are empty; dive data is stored only as raw proprietary blobs in `log_data`.
2. **Each `log_data.data_bytes_1` blob is `[4-byte LE length prefix] + gzip(Shearwater binary log)`.** Header (`data_bytes_2`) and footer (`data_bytes_3`) are JSON metadata.
3. **`dctool parse -d "Shearwater Peregrine"` decodes the decompressed binary cleanly** into structured XML with per-sample depth, temperature, CNS, NDL/deco state, and TTS at 10-second sample intervals. Tested on 4 real dives.
4. **`dctool` BLE on macOS is unavailable** — upstream libdivecomputer's BLE transport requires BlueZ (Linux-only). This was the most important spike finding for production: PATH 1 (libdivecomputer's own BLE on iOS) is dead; PATH 2 (CoreBluetooth + libdivecomputer parser via `dc_custom_open`) is the only viable production path.
5. **All FFESSM scoring rules in the spec are implementable** from the parsed sample data, including `palier_deco_manque` (validated on a real deco dive in the test set).

## What we tested

Test data: 4 real dives (Mar 31 + May 8×2 + May 9), all from a Shearwater Peregrine, exported via the Shearwater Cloud mobile iOS app.

| Dive | Date | Duration | Max depth | Notes |
|---|---|---|---|---|
| #1 | 2026-03-31 | 34:33 | 19.4 m | NDL throughout |
| #3 | 2026-05-08 am | 37:43 | 26.1 m | NDL throughout |
| #4 | 2026-05-08 pm | 35:51 | 27.6 m | NDL throughout |
| #5 | 2026-05-09 | 30:54 | 35.0 m | **70 samples in deco state** — required 60s stop at 3m |

## SQLite schema observations

`log_data` (4 rows, one per dive):
- `log_id` (varchar PK)
- `created_unixtime`, `modified_unixtime`
- `file_name` — pattern `Peregrine[<8-hex-serial>]#<dive_no> <date> <time>.swlogzp`
- `format` — value `"sw-pnf"` for all our samples
- `format_version` — value `0`
- `data_bytes_1` — the dive payload (~7–10 KB compressed)
- `data_bytes_2` — JSON header (~107 bytes)
- `data_bytes_3` — JSON footer (~370 bytes)
- `data_bytes_4` — empty/null in our samples

`data_bytes_1` structure (verified):
1. 4 bytes little-endian length (purpose unclear — may be approximate)
2. gzip stream (magic `1f 8b`)
3. Decompressed: 7.5–10.5 KB Shearwater proprietary binary, parseable by libdivecomputer's `Shearwater Peregrine` descriptor

`data_bytes_2` (JSON):
```json
{
  "DIVE_NUMBER_KEY": 5,
  "HARDWARE_TYPE_KEY": "",
  "DIVE_START_TIME": 1778323460,
  "DIVE_END_TIME": 0,
  "DB_VERSION": 12
}
```

`data_bytes_3` (JSON, abbreviated):
```json
{
  "DiveNumber": 5,
  "StartTime": 1778323460,
  "EndTime": 1778325309,
  "DiveTimeInSeconds": 1854,
  "MaxDepth": 35.0,
  "AverageDepth": 0.0,
  "Mode": 6,
  "OpeningRecordAddress": 144832,
  "ClosingRecordAddress": 153280
}
```

`dive_logs` and `dive_log_records` tables (which would have richly-structured per-sample data with named columns) are **defined but empty** in the mobile export — only the desktop Shearwater Cloud app appears to populate them.

## libdivecomputer parsed XML — actual sample shape

```xml
<dive>
  <number>1</number>
  <size>8960</size>
  <datetime>2026-05-09 10:44:20</datetime>
  <divetime>30:54</divetime>
  <maxdepth>35.00</maxdepth>
  <gasmix><he>0.0</he><o2>21.0</o2><n2>79.0</n2></gasmix>
  <divemode>oc</divemode>
  <decomodel>buhlmann</decomodel>
  <gf>40/85</gf>
  <salinity density="1020.0">salt</salinity>
  <atmospheric>1.00700</atmospheric>
  <sample>
    <time>00:10</time>
    <depth>2.60</depth>
    <temperature>21.00</temperature>
    <cns>0.0</cns>
    <gasmix>0</gasmix>
    <deco time="0" depth="0.00">ndl</deco>
    <tts>60</tts>
  </sample>
  <!-- ...one sample every 10 seconds... -->
  <!-- when in deco: -->
  <sample>
    <time>21:30</time>
    <depth>15.20</depth>
    <temperature>18.00</temperature>
    <cns>3.0</cns>
    <deco time="60" depth="3.00">deco</deco>
    <tts>240</tts>
  </sample>
</dive>
```

**Sample fields confirmed available:**
- `time` (mm:ss into the dive) — sample at every 10 seconds
- `depth` (meters, 2 decimals)
- `temperature` (Celsius, 2 decimals)
- `cns` (percent)
- `gasmix` (index into the gas mix array — only on first sample of a gas)
- `deco` element with text `ndl` (no deco needed) or `deco` (deco required), and attributes:
  - `time` — when ndl: seconds of NDL remaining; when deco: required stop seconds
  - `depth` — when ndl: 0.00; when deco: required stop depth (meters)
- `tts` — total time-to-surface in seconds

**Dive-level fields:** datetime, divetime, maxdepth, gasmix list, divemode (`oc`), decomodel (`buhlmann`), gf (`40/85`), salinity, atmospheric pressure.

**Not available from this export:** GPS (Peregrine has no GPS), tank pressure (Peregrine has no AI), buddy info, location/site (those would be in `dive_details` if user typed them in Shearwater Cloud, but `dive_details` is mostly empty in the mobile export).

## libdivecomputer build on macOS

- Built cleanly via the script at `spike/0b-desktop-harness/build-libdivecomputer.sh` (~30 sec).
- Binary at `spike/0b-desktop-harness/build/install/bin/dctool`.
- `dctool list` shows `Shearwater Peregrine` as a distinct descriptor (not Petrel-family).
- **Configure output explicitly reports `Bluetooth : no`, `BLE : no`** — upstream libdc only enables BLE transport when BlueZ is present (Linux-only). This means `dctool scan/download` over BLE will not work on macOS or iOS.
- `dctool parse` (the path we actually need) works perfectly with `-d "Shearwater Peregrine" -u metric -o out.xml input.bin`.

## Spec implications

### Schema changes for `Dive` / `DiveSample`

Drop `ndlMin` and `cnsPct` as separate columns on `DiveSample` and instead match libdivecomputer's actual emitted fields. Recommended sample shape:

```ts
type DiveSample = {
  tSec: number;            // seconds since dive start (multiple of 10 in practice)
  depthM: number;
  tempC: number | null;
  cnsPct: number | null;
  decoState: "ndl" | "deco";
  decoTimeSec: number;     // when ndl: NDL seconds remaining; when deco: required stop seconds
  decoDepthM: number;      // when ndl: 0; when deco: required stop depth
  ttsSec: number | null;
};
```

### Rule confidence updates

| Rule | Was | Now |
|---|---|---|
| `palier_deco_manque` | Medium — needs deco-stop info | **High — confirmed available via `<deco>deco</deco>` element + attributes** |
| `ascent_too_fast` / `_dangerous` | High | High — sample interval is 10s, so a 60s window = 6 samples; threshold logic unchanged |
| `palier_securite_*` | High | High — depth granularity of 10s is sufficient |
| All others | unchanged | unchanged |

### Data ingestion in v1

The original spec said BLE-only. **This finding strongly suggests pivoting to file-import primary, BLE later** — see `spike/findings.md` (top-level) for the full recommendation.

## Out-of-scope finds

- No `dive_log_records` data in the mobile export — so we cannot use the named-column data Shearwater would provide; we MUST go through libdivecomputer parsing. That's actually fine: it means we have ONE canonical parser regardless of whether bytes come from BLE, file upload, or DB extraction.
- The `dive_details` table holds user-typed dive notes (location, buddy, conditions). Mostly empty in our test data because the user (you) didn't fill it in. v1 doesn't depend on this; it's a phase 2 feature.
