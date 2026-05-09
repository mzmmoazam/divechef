import type { DecoState, Severity } from "../types.js";

export interface DiveInput {
  maxDepthM: number;
  avgDepthM: number;
  durationSec: number;
  maxAscentRateMps: number;
  minWaterTempC: number | null;
  niveau: string;
}

export interface DiveSampleInput {
  tSec: number;
  depthM: number;
  tempC: number | null;
  cnsPct: number | null;
  decoState: DecoState;
  decoTimeSec: number;
  decoDepthM: number;
  ttsSec: number | null;
}

export interface RuleResult {
  ruleId: string;
  severity: Severity;
  evidence: Record<string, unknown>;
}

export interface Rule {
  id: string;
  deduction: number;
  evaluate: (dive: DiveInput, samples: DiveSampleInput[]) => RuleResult | null;
}

export interface ScoreResult {
  score: number;
  scoringVersion: string;
  insights: RuleResult[];
}
