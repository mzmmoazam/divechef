import { RULES } from "./registry.js";
import type { DiveInput, DiveSampleInput, ScoreResult, RuleResult } from "./types.js";

export const SCORING_VERSION = "v1.0";

export function scoreDive(dive: DiveInput, samples: DiveSampleInput[]): ScoreResult {
  const insights: RuleResult[] = [];
  let score = 100;

  for (const rule of RULES) {
    try {
      const result = rule.evaluate(dive, samples);
      if (result) {
        insights.push(result);
        score -= rule.deduction;
      }
    } catch (error) {
      console.error(`Scoring rule "${rule.id}" threw:`, error);
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { score, scoringVersion: SCORING_VERSION, insights };
}

export type { DiveInput, DiveSampleInput, ScoreResult, RuleResult, Rule } from "./types.js";
