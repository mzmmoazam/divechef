/**
 * Subprocess wrapper for `dctool parse`.
 * Takes raw Peregrine bytes, writes to temp file, runs dctool,
 * parses the XML output, returns structured dive data.
 */
import { execFile } from "node:child_process";
import { writeFile, readFile, unlink, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import type { DiveSampleInput } from "@diveforge/shared";

const execFileAsync = promisify(execFile);

const DCTOOL_PATH =
  process.env.DCTOOL_PATH ??
  join(process.cwd(), "../../spike/0b-desktop-harness/build/install/bin/dctool");

export interface DctoolParseResult {
  maxDepthM: number;
  avgDepthM: number;
  durationSec: number;
  maxAscentRateMps: number;
  minWaterTempC: number | null;
  samples: DiveSampleInput[];
}

function parseTime(timeStr: string): number {
  const parts = timeStr.split(":");
  const minutes = parseInt(parts[0], 10);
  const seconds = parseInt(parts[1], 10);
  return minutes * 60 + seconds;
}

function parseXmlOutput(xml: string): DctoolParseResult {
  // Extract dive metadata
  const maxDepthM = parseFloat(
    xml.match(/<maxdepth>([\d.]+)<\/maxdepth>/)![1]
  );
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
    const decoMatch = block.match(
      /<deco time="(\d+)" depth="([\d.]+)">(ndl|deco)<\/deco>/
    );
    const ttsMatch = block.match(/<tts>(\d+)<\/tts>/);

    if (!timeMatch || !depthMatch) continue;

    const tSec = parseTime(timeMatch[1]);
    const depthM = parseFloat(depthMatch[1]);
    const tempC = tempMatch ? parseFloat(tempMatch[1]) : null;
    const cnsPct = cnsMatch ? parseFloat(cnsMatch[1]) : null;
    const decoState = decoMatch
      ? (decoMatch[3] as "ndl" | "deco")
      : "ndl";
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

  // Compute max ascent rate (m/s)
  let maxAscentRateMps = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].tSec - samples[i - 1].tSec;
    if (dt <= 0) continue;
    const depthDelta = samples[i - 1].depthM - samples[i].depthM;
    if (depthDelta > 0) {
      const rate = depthDelta / dt;
      if (rate > maxAscentRateMps) {
        maxAscentRateMps = rate;
      }
    }
  }

  const avgDepthM =
    samples.length > 0 ? Math.round((depthSum / samples.length) * 100) / 100 : 0;

  return {
    maxDepthM,
    avgDepthM,
    durationSec,
    maxAscentRateMps: Math.round(maxAscentRateMps * 1000) / 1000,
    minWaterTempC: minTemp,
    samples,
  };
}

/**
 * Parse raw Peregrine dive computer bytes using dctool.
 * Writes bytes to a temp file, invokes dctool, parses the XML output.
 */
export async function parseDiveBytes(
  rawBytes: Buffer
): Promise<DctoolParseResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), "diveforge-"));
  const inPath = join(tmpDir, "raw.bin");
  const outPath = join(tmpDir, "parsed.xml");

  try {
    await writeFile(inPath, rawBytes);

    await execFileAsync(DCTOOL_PATH, [
      "-d",
      "Shearwater Peregrine",
      "parse",
      "-u",
      "metric",
      "-o",
      outPath,
      inPath,
    ]);

    const xml = await readFile(outPath, "utf-8");
    return parseXmlOutput(xml);
  } finally {
    // Clean up temp files
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
    // Remove temp dir (will fail if not empty, which is fine since we cleaned files)
    const { rmdir } = await import("node:fs/promises");
    await rmdir(tmpDir).catch(() => {});
  }
}
