import type { Rule } from "../types.js";

/**
 * final_ascent_too_fast: fires when ascent from 6m to surface > 6 m/min
 */
export const finalAscentTooFast: Rule = {
  id: "final_ascent_too_fast",
  deduction: 10,
  evaluate(dive, samples) {
    // Find the last time the diver was at or below 6m
    let from6mIdx = -1;
    for (let i = samples.length - 1; i >= 0; i--) {
      if (samples[i].depthM >= 6) {
        from6mIdx = i;
        break;
      }
    }

    if (from6mIdx < 0) return null;

    // Find the surface arrival (first sample at <= 0.5m after from6mIdx)
    let surfaceIdx = -1;
    for (let i = from6mIdx + 1; i < samples.length; i++) {
      if (samples[i].depthM <= 0.5) {
        surfaceIdx = i;
        break;
      }
    }

    if (surfaceIdx < 0) return null;

    const from6mSec = samples[from6mIdx].tSec;
    const surfaceSec = samples[surfaceIdx].tSec;
    const dt = surfaceSec - from6mSec;

    if (dt <= 0) return null;

    const depthDelta = samples[from6mIdx].depthM; // from depth to ~0
    const rateMpm = (depthDelta / dt) * 60;

    if (rateMpm > 6) {
      return {
        ruleId: "final_ascent_too_fast",
        severity: "warn",
        evidence: {
          rateMpm: Math.round(rateMpm * 100) / 100,
          from6mSec,
          surfaceSec,
        },
      };
    }

    return null;
  },
};
