/**
 * Generate synthetic dive fixtures for scoring rule tests.
 *
 * Usage: npx tsx packages/shared/src/scoring/fixtures/generate-synthetic.ts
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { DiveInput, DiveSampleInput } from "../types.js";

const OUTPUT_DIR = resolve(dirname(import.meta.url.replace("file://", "")), ".");

interface Fixture {
  dive: DiveInput;
  samples: DiveSampleInput[];
}

function makeSample(
  tSec: number,
  depthM: number,
  opts: Partial<DiveSampleInput> = {}
): DiveSampleInput {
  return {
    tSec,
    depthM,
    tempC: opts.tempC ?? 29,
    cnsPct: opts.cnsPct ?? 0,
    decoState: opts.decoState ?? "ndl",
    decoTimeSec: opts.decoTimeSec ?? 0,
    decoDepthM: opts.decoDepthM ?? 0,
    ttsSec: opts.ttsSec ?? null,
  };
}

/**
 * perfect-dive.json: 30min, 18m max, 9 m/min ascent, 3-min stop at 4m, no deco, 29C.
 * Expected: score=100, no rules fire.
 */
function generatePerfectDive(): Fixture {
  const samples: DiveSampleInput[] = [];
  let t = 0;

  // Descent: surface to 18m over 2 minutes (9 m/min descent)
  for (let s = 0; s <= 120; s += 10) {
    samples.push(makeSample(s, (s / 120) * 18));
    t = s;
  }

  // Bottom time at ~18m for 20 minutes
  for (let s = t + 10; s <= t + 1200; s += 10) {
    samples.push(makeSample(s, 18));
  }
  t += 1200;

  // Slow ascent from 18m to 5m at 9 m/min = 13m in ~87s, use 90s
  const ascentStart = t;
  for (let s = 10; s <= 90; s += 10) {
    const depth = 18 - (13 * s) / 90;
    samples.push(makeSample(ascentStart + s, Math.max(5, depth)));
  }
  t = ascentStart + 90;

  // Safety stop at 4m for 3 minutes (180s)
  for (let s = 10; s <= 180; s += 10) {
    samples.push(makeSample(t + s, 4));
  }
  t += 180;

  // Final ascent from 4m to surface at 3 m/min = 4m in 80s
  const finalStart = t;
  for (let s = 10; s <= 80; s += 10) {
    const depth = 4 - (4 * s) / 80;
    samples.push(makeSample(finalStart + s, Math.max(0, depth)));
  }
  t = finalStart + 80;

  // Surface for a few samples
  for (let s = 10; s <= 30; s += 10) {
    samples.push(makeSample(t + s, 0));
  }
  t += 30;

  const dive: DiveInput = {
    maxDepthM: 18,
    avgDepthM: computeAvgDepth(samples),
    durationSec: t,
    maxAscentRateMps: computeMaxAscentRate(samples),
    minWaterTempC: 29,
    niveau: "N2",
  };

  return { dive, samples };
}

/**
 * fast-ascent.json: 20min at 25m, then rocket up at 18+ m/min over 60s.
 * Expected: ascent_too_fast + ascent_dangerous fire.
 */
function generateFastAscent(): Fixture {
  const samples: DiveSampleInput[] = [];
  let t = 0;

  // Descent to 25m over 2 min
  for (let s = 0; s <= 120; s += 10) {
    samples.push(makeSample(s, (s / 120) * 25));
    t = s;
  }

  // Bottom at 25m for 18 minutes
  for (let s = t + 10; s <= t + 1080; s += 10) {
    samples.push(makeSample(s, 25));
  }
  t += 1080;

  // Rocket ascent: 25m to 0m in 60s = 25 m/min (way over 17 m/min)
  const rocketStart = t;
  for (let s = 10; s <= 60; s += 10) {
    const depth = 25 - (25 * s) / 60;
    samples.push(makeSample(rocketStart + s, Math.max(0, depth)));
  }
  t = rocketStart + 60;

  // Surface
  for (let s = 10; s <= 30; s += 10) {
    samples.push(makeSample(t + s, 0));
  }
  t += 30;

  const dive: DiveInput = {
    maxDepthM: 25,
    avgDepthM: computeAvgDepth(samples),
    durationSec: t,
    maxAscentRateMps: computeMaxAscentRate(samples),
    minWaterTempC: 29,
    niveau: "N3", // N3 has 60m limit, so no depth rule fires
  };

  return { dive, samples };
}

/**
 * missed-palier.json: 25m dive, goes straight from 6m to surface with no safety stop.
 * Expected: palier_securite_manque fires.
 */
function generateMissedPalier(): Fixture {
  const samples: DiveSampleInput[] = [];
  let t = 0;

  // Descent to 25m: skip 3-5m zone entirely in descent
  // 0m -> 6m in one step, then 6m -> 25m over rest of 2 min
  samples.push(makeSample(0, 0));
  samples.push(makeSample(10, 6));
  for (let s = 20; s <= 120; s += 10) {
    const depth = 6 + (19 * (s - 10)) / 110;
    samples.push(makeSample(s, depth));
  }
  t = 120;

  // Bottom at 25m for 20 minutes
  for (let s = t + 10; s <= t + 1200; s += 10) {
    samples.push(makeSample(s, 25));
  }
  t += 1200;

  // Ascent from 25m to 6m at 9 m/min = 19m in ~127s, use 130s
  const ascentStart = t;
  for (let s = 10; s <= 130; s += 10) {
    const depth = 25 - (19 * s) / 130;
    samples.push(makeSample(ascentStart + s, Math.max(6, depth)));
  }
  t = ascentStart + 130;

  // Skip safety stop entirely: ascend from 6m to surface over 70s
  // avoiding samples in 3-5m zone. Rate: 6m/70s*60 = 5.14 m/min (< 6, avoids final_ascent_too_fast)
  // Intermediate depths: 5.1 (>5), 2.9 (<3), then linear to 0
  // Max rate between consecutive: (5.1->2.9)/10s*60 = 13.2 m/min < 15 (avoids ascent rules)
  const depths = [5.1, 5.1, 2.9, 2.0, 1.3, 0.6, 0.0];
  for (let i = 0; i < depths.length; i++) {
    samples.push(makeSample(t + (i + 1) * 10, depths[i]));
  }
  t += depths.length * 10;

  // Surface
  for (let s = 10; s <= 30; s += 10) {
    samples.push(makeSample(t + s, 0));
  }
  t += 30;

  const dive: DiveInput = {
    maxDepthM: 25,
    avgDepthM: computeAvgDepth(samples),
    durationSec: t,
    maxAscentRateMps: computeMaxAscentRate(samples),
    minWaterTempC: 29,
    niveau: "N3",
  };

  return { dive, samples };
}

/**
 * deco-breach.json: Dive with deco obligation, diver surfaces without stopping.
 * Expected: palier_deco_manque fires.
 */
function generateDecoBreach(): Fixture {
  const samples: DiveSampleInput[] = [];
  let t = 0;

  // Descent to 40m over 2 min
  for (let s = 0; s <= 120; s += 10) {
    samples.push(makeSample(s, (s / 120) * 40));
    t = s;
  }

  // Bottom at 40m for 25 minutes — in deco from 15 min onward
  for (let s = t + 10; s <= t + 900; s += 10) {
    samples.push(makeSample(s, 40, { decoState: "ndl" }));
  }
  t += 900;

  // Deco obligation kicks in at 40m
  for (let s = t + 10; s <= t + 600; s += 10) {
    samples.push(makeSample(s, 40, {
      decoState: "deco",
      decoTimeSec: 180, // 3 min stop required
      decoDepthM: 3,    // at 3m
    }));
  }
  t += 600;

  // Ascent from 40m directly to surface in 4 minutes (10 m/min) — skips deco stop
  const ascentStart = t;
  for (let s = 10; s <= 240; s += 10) {
    const depth = 40 - (40 * s) / 240;
    samples.push(makeSample(ascentStart + s, Math.max(0, depth), {
      decoState: "deco",
      decoTimeSec: 180,
      decoDepthM: 3,
    }));
  }
  t = ascentStart + 240;

  // Surface
  for (let s = 10; s <= 30; s += 10) {
    samples.push(makeSample(t + s, 0));
  }
  t += 30;

  const dive: DiveInput = {
    maxDepthM: 40,
    avgDepthM: computeAvgDepth(samples),
    durationSec: t,
    maxAscentRateMps: computeMaxAscentRate(samples),
    minWaterTempC: 29,
    niveau: "N3",
  };

  return { dive, samples };
}

function computeAvgDepth(samples: DiveSampleInput[]): number {
  if (samples.length === 0) return 0;
  const sum = samples.reduce((acc, s) => acc + s.depthM, 0);
  return Math.round((sum / samples.length) * 100) / 100;
}

function computeMaxAscentRate(samples: DiveSampleInput[]): number {
  let maxRate = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].tSec - samples[i - 1].tSec;
    if (dt <= 0) continue;
    const depthDelta = samples[i - 1].depthM - samples[i].depthM;
    if (depthDelta > 0) {
      const rate = depthDelta / dt;
      if (rate > maxRate) maxRate = rate;
    }
  }
  return Math.round(maxRate * 1000) / 1000;
}

// Generate all synthetic fixtures
const fixtures: [string, Fixture][] = [
  ["perfect-dive.json", generatePerfectDive()],
  ["fast-ascent.json", generateFastAscent()],
  ["missed-palier.json", generateMissedPalier()],
  ["deco-breach.json", generateDecoBreach()],
];

for (const [name, fixture] of fixtures) {
  writeFileSync(resolve(OUTPUT_DIR, name), JSON.stringify(fixture, null, 2) + "\n");
  console.log(`Wrote ${name}: ${fixture.samples.length} samples, maxDepth=${fixture.dive.maxDepthM}m, duration=${fixture.dive.durationSec}s`);
}

console.log("Done. Synthetic fixtures written to:", OUTPUT_DIR);
