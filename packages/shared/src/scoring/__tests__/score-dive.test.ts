import { describe, it, expect } from "vitest";
import { scoreDive, SCORING_VERSION } from "../index.js";
import type { DiveInput, DiveSampleInput } from "../types.js";

// Load fixtures
import perfectDive from "../fixtures/perfect-dive.json";
import fastAscent from "../fixtures/fast-ascent.json";
import missedPalier from "../fixtures/missed-palier.json";
import decoBreach from "../fixtures/deco-breach.json";

const perfect = perfectDive as { dive: DiveInput; samples: DiveSampleInput[] };
const fast = fastAscent as { dive: DiveInput; samples: DiveSampleInput[] };
const missed = missedPalier as { dive: DiveInput; samples: DiveSampleInput[] };
const deco = decoBreach as { dive: DiveInput; samples: DiveSampleInput[] };

describe("scoreDive", () => {
  it("returns scoringVersion", () => {
    const result = scoreDive(perfect.dive, perfect.samples);
    expect(result.scoringVersion).toBe(SCORING_VERSION);
  });

  it("perfect dive scores 100 with no insights", () => {
    const result = scoreDive(perfect.dive, perfect.samples);
    expect(result.score).toBe(100);
    expect(result.insights).toHaveLength(0);
  });

  it("fast-ascent fires ascent rules", () => {
    const result = scoreDive(fast.dive, fast.samples);
    const ruleIds = result.insights.map((i) => i.ruleId);
    expect(ruleIds).toContain("ascent_too_fast");
    expect(ruleIds).toContain("ascent_dangerous");
    // Deductions: 15 + 30 = 45, score should be 55
    // But other rules might also fire (palier_securite_manque since no safety stop)
    expect(result.score).toBeLessThan(100);
  });

  it("missed-palier fires palier_securite_manque", () => {
    const result = scoreDive(missed.dive, missed.samples);
    const ruleIds = result.insights.map((i) => i.ruleId);
    expect(ruleIds).toContain("palier_securite_manque");
  });

  it("deco-breach fires palier_deco_manque", () => {
    const result = scoreDive(deco.dive, deco.samples);
    const ruleIds = result.insights.map((i) => i.ruleId);
    expect(ruleIds).toContain("palier_deco_manque");
  });

  it("score never goes below 0", () => {
    // Create a worst-case dive that triggers many rules
    const dive: DiveInput = {
      maxDepthM: 50,
      avgDepthM: 40,
      durationSec: 2400,
      maxAscentRateMps: 0.5,
      minWaterTempC: 5,
      niveau: "N1", // limit is 20m, excess is 30m (>5m => grave)
    };
    const result = scoreDive(dive, deco.samples);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("snapshot: perfect dive result", () => {
    const result = scoreDive(perfect.dive, perfect.samples);
    expect(result).toMatchSnapshot();
  });

  it("snapshot: fast-ascent result", () => {
    const result = scoreDive(fast.dive, fast.samples);
    expect(result).toMatchSnapshot();
  });

  it("snapshot: deco-breach result", () => {
    const result = scoreDive(deco.dive, deco.samples);
    expect(result).toMatchSnapshot();
  });
});
