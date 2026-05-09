import type { Rule } from "../types.js";

/**
 * temperature_basse: fires when minWaterTempC < 10 AND durationSec > 1800
 */
export const temperatureBasse: Rule = {
  id: "temperature_basse",
  deduction: 3,
  evaluate(dive) {
    if (dive.minWaterTempC === null) return null;

    if (dive.minWaterTempC < 10 && dive.durationSec > 1800) {
      return {
        ruleId: "temperature_basse",
        severity: "info",
        evidence: {
          minTempC: dive.minWaterTempC,
          durationMin: Math.round(dive.durationSec / 60),
        },
      };
    }

    return null;
  },
};
