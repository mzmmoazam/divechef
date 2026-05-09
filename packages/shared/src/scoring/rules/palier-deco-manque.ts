import type { Rule, DiveSampleInput } from "../types.js";

/**
 * palier_deco_manque: fires when decoState=="deco" sample exists AND
 * final 60s lacks sufficient time at ±0.5m of required decoDepthM.
 */
export const palierDecoManque: Rule = {
  id: "palier_deco_manque",
  deduction: 40,
  evaluate(dive, samples) {
    // Find any sample with decoState == "deco"
    const decoSamples = samples.filter((s) => s.decoState === "deco");
    if (decoSamples.length === 0) return null;

    // Get the last deco obligation (the required stop)
    const lastDeco = decoSamples[decoSamples.length - 1];
    const requiredDepthM = lastDeco.decoDepthM;
    const requiredTimeSec = lastDeco.decoTimeSec;

    if (requiredTimeSec <= 0) return null;

    // Check the final 60s of the dive — did the diver spend enough time
    // at ±0.5m of the required decoDepthM?
    const diveEnd = samples[samples.length - 1].tSec;
    const windowStart = diveEnd - 60;

    let actualTimeSec = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      const s = samples[i];
      const next = samples[i + 1];
      if (s.tSec < windowStart) continue;
      if (Math.abs(s.depthM - requiredDepthM) <= 0.5) {
        actualTimeSec += next.tSec - s.tSec;
      }
    }

    if (actualTimeSec < requiredTimeSec) {
      return {
        ruleId: "palier_deco_manque",
        severity: "alert",
        evidence: {
          requiredDepthM,
          requiredTimeSec,
          actualTimeSec,
        },
      };
    }

    return null;
  },
};
