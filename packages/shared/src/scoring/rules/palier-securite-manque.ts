import type { Rule } from "../types.js";

/**
 * palier_securite_manque: fires when maxDepth > 6m AND no continuous >=180s
 * between 3-5m before surfacing.
 */
export const palierSecuriteManque: Rule = {
  id: "palier_securite_manque",
  deduction: 10,
  evaluate(dive, samples) {
    if (dive.maxDepthM <= 6) return null;

    // Find the longest continuous stretch between 3-5m in the ascent phase
    // (before the final surfacing)
    const longestSec = getLongestPalierSec(samples);

    if (longestSec === 0) {
      return {
        ruleId: "palier_securite_manque",
        severity: "warn",
        evidence: {
          maxDepthM: dive.maxDepthM,
          longestPalierSec: 0,
        },
      };
    }

    return null;
  },
};

export function getLongestPalierSec(samples: { tSec: number; depthM: number }[]): number {
  let longestSec = 0;
  let currentStart: number | null = null;

  for (let i = 0; i < samples.length; i++) {
    const depth = samples[i].depthM;
    if (depth >= 3 && depth <= 5) {
      if (currentStart === null) {
        currentStart = samples[i].tSec;
      }
    } else {
      if (currentStart !== null) {
        const duration = samples[i].tSec - currentStart;
        if (duration > longestSec) {
          longestSec = duration;
        }
        currentStart = null;
      }
    }
  }

  // Handle case where dive ends while in the 3-5m zone
  if (currentStart !== null) {
    const duration = samples[samples.length - 1].tSec - currentStart;
    if (duration > longestSec) {
      longestSec = duration;
    }
  }

  return longestSec;
}
