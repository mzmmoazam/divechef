import type { Rule } from "../types.js";

/**
 * plongee_profonde: informational — fires when maxDepth > 30m (no deduction)
 */
export const plongeeProfonde: Rule = {
  id: "plongee_profonde",
  deduction: 0,
  evaluate(dive) {
    if (dive.maxDepthM > 30) {
      return {
        ruleId: "plongee_profonde",
        severity: "info",
        evidence: {
          maxDepthM: dive.maxDepthM,
        },
      };
    }

    return null;
  },
};
