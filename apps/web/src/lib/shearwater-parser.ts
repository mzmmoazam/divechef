/**
 * Pure TypeScript parser for Shearwater dive computer data (PNF format).
 * Ported from libdivecomputer's shearwater_predator_parser.c.
 * Runs on Vercel serverless — no native binary dependencies.
 */
import type { DiveSampleInput } from "@divechef/shared";

// Record types (from shearwater_predator_parser.c)
const LOG_RECORD_DIVE_SAMPLE = 0x01;
const LOG_RECORD_OPENING_0 = 0x10;
const LOG_RECORD_OPENING_9 = 0x19;
const LOG_RECORD_CLOSING_0 = 0x20;
const LOG_RECORD_CLOSING_9 = 0x29;
const LOG_RECORD_FINAL = 0xff;

const SZ_SAMPLE_PETREL = 0x20; // 32 bytes per record
const METRIC = 0;

const UNDEFINED = 0xffffffff;

function u16be(buf: Buffer, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

function u24be(buf: Buffer, offset: number): number {
  return (buf[offset] << 16) | (buf[offset + 1] << 8) | buf[offset + 2];
}

function u32be(buf: Buffer, offset: number): number {
  return (
    ((buf[offset] << 24) >>> 0) |
    (buf[offset + 1] << 16) |
    (buf[offset + 2] << 8) |
    buf[offset + 3]
  );
}

function isAllZero(buf: Buffer, offset: number, len: number): boolean {
  for (let i = 0; i < len; i++) {
    if (buf[offset + i] !== 0) return false;
  }
  return true;
}

export interface ShearwaterParseResult {
  startedAt: Date;
  durationSec: number;
  maxDepthM: number;
  avgDepthM: number;
  maxAscentRateMps: number;
  minWaterTempC: number | null;
  samples: DiveSampleInput[];
}

export function parseShearwaterDive(raw: Buffer): ShearwaterParseResult {
  const size = raw.length;
  if (size < SZ_SAMPLE_PETREL * 2) {
    throw new Error(`Data too short: ${size} bytes`);
  }

  // Detect PNF format: first 2 bytes != 0xFFFF
  const isPnf = u16be(raw, 0) !== 0xffff;
  if (!isPnf) {
    throw new Error("Non-PNF (legacy Predator) format not supported");
  }

  // Scan all 32-byte records to find opening/closing/sample positions
  const opening: number[] = new Array(10).fill(UNDEFINED);
  const closing: number[] = new Array(10).fill(UNDEFINED);
  let finalOffset = UNDEFINED;

  let offset = 0;
  while (offset + SZ_SAMPLE_PETREL <= size) {
    if (isAllZero(raw, offset, SZ_SAMPLE_PETREL)) {
      offset += SZ_SAMPLE_PETREL;
      continue;
    }

    const type = raw[offset];

    if (type >= LOG_RECORD_OPENING_0 && type <= LOG_RECORD_OPENING_9) {
      opening[type - LOG_RECORD_OPENING_0] = offset;
    } else if (type >= LOG_RECORD_CLOSING_0 && type <= LOG_RECORD_CLOSING_9) {
      closing[type - LOG_RECORD_CLOSING_0] = offset;
    } else if (type === LOG_RECORD_FINAL) {
      finalOffset = offset;
    }

    offset += SZ_SAMPLE_PETREL;
  }

  // Verify required records
  if (opening[0] === UNDEFINED || closing[0] === UNDEFINED) {
    throw new Error("Missing required opening/closing records");
  }

  // Extract metadata from opening records
  const timestamp = u32be(raw, opening[0] + 12);
  const startedAt = new Date(timestamp * 1000);
  const units = raw[opening[0] + 8];

  // Log version from opening[4]
  let logversion = 0;
  if (opening[4] !== UNDEFINED) {
    logversion = raw[opening[4] + 16];
  }

  // Sample interval (milliseconds), default 10000ms = 10s
  let intervalMs = 10000;
  if (logversion >= 9 && opening[5] !== UNDEFINED) {
    intervalMs = u16be(raw, opening[5] + 23);
  }
  const intervalSec = intervalMs / 1000;

  // Max depth and duration from closing record
  const maxDepthRaw = u16be(raw, closing[0] + 4);
  const durationSec = u24be(raw, closing[0] + 6);

  let maxDepthM: number;
  if (units === METRIC) {
    maxDepthM = maxDepthRaw / 10.0;
  } else {
    maxDepthM = (maxDepthRaw * 0.3048) / 10.0;
  }

  // Parse samples
  const samples: DiveSampleInput[] = [];
  let time = 0;
  let depthSum = 0;
  let minTemp: number | null = null;
  let maxAscentRateMps = 0;
  let prevDepth = 0;
  let prevTime = 0;

  offset = 0;
  while (offset + SZ_SAMPLE_PETREL <= size) {
    if (isAllZero(raw, offset, SZ_SAMPLE_PETREL)) {
      offset += SZ_SAMPLE_PETREL;
      continue;
    }

    const type = raw[offset];

    if (type === LOG_RECORD_DIVE_SAMPLE) {
      time += intervalSec;

      // Depth: 2 bytes BE at offset+1 (pnf=1), value / 10.0 for meters
      const depthRaw = u16be(raw, offset + 1);
      let depthM: number;
      if (units === METRIC) {
        depthM = depthRaw / 10.0;
      } else {
        depthM = (depthRaw * 0.3048) / 10.0;
      }

      // Temperature: signed byte at offset+14
      let tempRaw = raw[offset + 14];
      if (tempRaw > 127) tempRaw -= 256; // signed byte
      let tempC: number;
      if (tempRaw < 0) {
        tempC = tempRaw + 102;
        if (tempC > 0) tempC = 0;
      } else {
        tempC = tempRaw;
      }
      if (units !== METRIC) {
        tempC = (tempC - 32.0) * (5.0 / 9.0);
      }

      // Deco stop depth: 2 bytes BE at offset+3
      const decoStopRaw = u16be(raw, offset + 3);
      let decoState: "ndl" | "deco";
      let decoDepthM: number;
      if (decoStopRaw) {
        decoState = "deco";
        decoDepthM = units === METRIC ? decoStopRaw : decoStopRaw * 0.3048;
      } else {
        decoState = "ndl";
        decoDepthM = 0;
      }

      // NDL/deco time: 1 byte at offset+10, × 60 for seconds
      const decoTimeSec = raw[offset + 10] * 60;

      // TTS: 2 bytes BE at offset+5, × 60 for seconds
      const ttsRaw = u16be(raw, offset + 5);
      const ttsSec = ttsRaw * 60;

      // CNS: 1 byte at offset+23, / 100.0 for fraction → × 100 for percent
      const cnsPct = raw[offset + 23];

      // Track stats
      depthSum += depthM;
      if (minTemp === null || tempC < minTemp) {
        minTemp = tempC;
      }

      // Ascent rate
      if (samples.length > 0) {
        const dt = time - prevTime;
        if (dt > 0) {
          const depthDelta = prevDepth - depthM;
          if (depthDelta > 0) {
            const rate = depthDelta / dt;
            if (rate > maxAscentRateMps) {
              maxAscentRateMps = rate;
            }
          }
        }
      }
      prevDepth = depthM;
      prevTime = time;

      samples.push({
        tSec: time,
        depthM: Math.round(depthM * 100) / 100,
        tempC: Math.round(tempC * 100) / 100,
        cnsPct: cnsPct > 0 ? cnsPct : null,
        decoState,
        decoTimeSec,
        decoDepthM: Math.round(decoDepthM * 100) / 100,
        ttsSec: ttsSec > 0 ? ttsSec : null,
      });
    }

    offset += SZ_SAMPLE_PETREL;
  }

  const avgDepthM =
    samples.length > 0
      ? Math.round((depthSum / samples.length) * 100) / 100
      : 0;

  return {
    startedAt,
    durationSec,
    maxDepthM: Math.round(maxDepthM * 100) / 100,
    avgDepthM,
    maxAscentRateMps: Math.round(maxAscentRateMps * 1000) / 1000,
    minWaterTempC: minTemp !== null ? Math.round(minTemp * 100) / 100 : null,
    samples,
  };
}
