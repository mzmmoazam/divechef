/**
 * Parse spike XMLs (dctool output) into JSON fixtures for scoring tests.
 * Regex-based parser — no xml2js dependency.
 *
 * Usage: npx tsx packages/shared/src/scoring/fixtures/parse-fixture.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { DiveInput, DiveSampleInput } from "../types.js";

const SPIKE_DIR = resolve(dirname(import.meta.url.replace("file://", "")), "../../../../../spike/0a-uddf-inspection/parsed");
const OUTPUT_DIR = resolve(dirname(import.meta.url.replace("file://", "")), ".");

interface ParsedFixture {
  dive: DiveInput;
  samples: DiveSampleInput[];
}

function parseTime(timeStr: string): number {
  // Format: MM:SS
  const parts = timeStr.split(":");
  const minutes = parseInt(parts[0], 10);
  const seconds = parseInt(parts[1], 10);
  return minutes * 60 + seconds;
}

function parseXml(xml: string): ParsedFixture {
  // Extract dive metadata
  const maxdepth = parseFloat(xml.match(/<maxdepth>([\d.]+)<\/maxdepth>/)![1]);
  const divetime = xml.match(/<divetime>([\d:]+)<\/divetime>/)![1];
  const durationSec = parseTime(divetime);

  // Extract samples
  const sampleBlocks = xml.match(/<sample>[\s\S]*?<\/sample>/g) || [];
  const samples: DiveSampleInput[] = [];

  let minTemp: number | null = null;
  let depthSum = 0;

  for (const block of sampleBlocks) {
    const timeMatch = block.match(/<time>([\d:]+)<\/time>/);
    const depthMatch = block.match(/<depth>([\d.]+)<\/depth>/);
    const tempMatch = block.match(/<temperature>([\d.]+)<\/temperature>/);
    const cnsMatch = block.match(/<cns>([\d.]+)<\/cns>/);
    const decoMatch = block.match(/<deco time="(\d+)" depth="([\d.]+)">(ndl|deco)<\/deco>/);
    const ttsMatch = block.match(/<tts>(\d+)<\/tts>/);

    if (!timeMatch || !depthMatch) continue;

    const tSec = parseTime(timeMatch[1]);
    const depthM = parseFloat(depthMatch[1]);
    const tempC = tempMatch ? parseFloat(tempMatch[1]) : null;
    const cnsPct = cnsMatch ? parseFloat(cnsMatch[1]) : null;
    const decoState = decoMatch ? (decoMatch[3] as "ndl" | "deco") : "ndl";
    const decoTimeSec = decoMatch ? parseInt(decoMatch[1], 10) : 0;
    const decoDepthM = decoMatch ? parseFloat(decoMatch[2]) : 0;
    const ttsSec = ttsMatch ? parseInt(ttsMatch[1], 10) : null;

    if (tempC !== null && (minTemp === null || tempC < minTemp)) {
      minTemp = tempC;
    }
    depthSum += depthM;

    samples.push({
      tSec,
      depthM,
      tempC,
      cnsPct,
      decoState,
      decoTimeSec,
      decoDepthM,
      ttsSec,
    });
  }

  // Compute max ascent rate (m/s) from samples
  let maxAscentRateMps = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].tSec - samples[i - 1].tSec;
    if (dt <= 0) continue;
    const depthDelta = samples[i - 1].depthM - samples[i].depthM; // positive = ascending
    if (depthDelta > 0) {
      const rate = depthDelta / dt; // m/s
      if (rate > maxAscentRateMps) {
        maxAscentRateMps = rate;
      }
    }
  }

  const avgDepthM = samples.length > 0 ? depthSum / samples.length : 0;

  const dive: DiveInput = {
    maxDepthM: maxdepth,
    avgDepthM: Math.round(avgDepthM * 100) / 100,
    durationSec,
    maxAscentRateMps: Math.round(maxAscentRateMps * 1000) / 1000,
    minWaterTempC: minTemp,
    niveau: "N2", // default to N2 for real dive fixtures
  };

  return { dive, samples };
}

// Parse all dive XMLs
const diveFiles = ["dive-1.xml", "dive-3.xml", "dive-4.xml", "dive-5.xml"];

mkdirSync(OUTPUT_DIR, { recursive: true });

for (const file of diveFiles) {
  const xml = readFileSync(resolve(SPIKE_DIR, file), "utf-8");
  const fixture = parseXml(xml);
  const outName = file.replace(".xml", ".json");
  writeFileSync(resolve(OUTPUT_DIR, outName), JSON.stringify(fixture, null, 2) + "\n");
  console.log(`Wrote ${outName}: ${fixture.samples.length} samples, maxDepth=${fixture.dive.maxDepthM}m, duration=${fixture.dive.durationSec}s`);
}

console.log("Done. Fixture JSONs written to:", OUTPUT_DIR);
