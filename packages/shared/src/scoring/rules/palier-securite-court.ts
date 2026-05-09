import type { Rule } from "../types.js";
import { getLongestPalierSec } from "./palier-securite-manque.js";

/**
 * palier_securite_court: fires when some time spent in 3-5m zone but < 180s.
 * Only fires when longestSec > 0 (some attempt was made) but < 180.
 */
export const palierSecuriteCourt: Rule = {
  id: "palier_securite_court",
  deduction: 5,
  evaluate(dive, samples) {
    if (dive.maxDepthM <= 6) return null;

    const longestSec = getLongestPalierSec(samples);

    if (longestSec > 0 && longestSec < 180) {
      return {
        ruleId: "palier_securite_court",
        severity: "info",
        evidence: {
          palierDurationSec: longestSec,
          requiredSec: 180,
        },
      };
    }

    return null;
  },
};
