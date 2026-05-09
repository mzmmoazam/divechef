import type { Rule } from "../types.js";

/**
 * ascent_too_fast: fires when max ascent rate over any 60s window > 15 m/min
 */
export const ascentTooFast: Rule = {
  id: "ascent_too_fast",
  deduction: 15,
  evaluate(dive, samples) {
    let maxRateMpm = 0;
    let startSec = 0;
    let endSec = 0;

    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const dt = samples[j].tSec - samples[i].tSec;
        if (dt > 60) break;
        if (dt <= 0) continue;

        const depthDelta = samples[i].depthM - samples[j].depthM; // positive = ascending
        if (depthDelta <= 0) continue;

        const rateMpm = (depthDelta / dt) * 60;
        if (rateMpm > maxRateMpm) {
          maxRateMpm = rateMpm;
          startSec = samples[i].tSec;
          endSec = samples[j].tSec;
        }
      }
    }

    if (maxRateMpm > 15) {
      return {
        ruleId: "ascent_too_fast",
        severity: "warn",
        evidence: {
          maxRateMpm: Math.round(maxRateMpm * 100) / 100,
          startSec,
          endSec,
        },
      };
    }

    return null;
  },
};
