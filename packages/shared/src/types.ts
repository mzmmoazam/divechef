export type Niveau = "N1" | "N2" | "N3" | "N4" | "INITIATEUR" | "MF1" | "MF2" | "UNKNOWN";
export type Locale = "fr" | "en";
export type DecoState = "ndl" | "deco";
export type Severity = "info" | "warn" | "alert";

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  niveau: Niveau;
  locale: Locale;
}

export interface Dive {
  id: string;
  externalId: string;
  startedAt: string;
  durationSec: number;
  maxDepthM: number;
  avgDepthM: number;
  minWaterTempC: number | null;
  maxAscentRateMps: number;
  safetyScore: number | null;
  scoringVersion: string | null;
}

export interface DiveSummary {
  id: string;
  startedAt: string;
  durationSec: number;
  maxDepthM: number;
  safetyScore: number | null;
}

export interface DiveSample {
  tSec: number;
  depthM: number;
  tempC: number | null;
  cnsPct: number | null;
  decoState: DecoState;
  decoTimeSec: number;
  decoDepthM: number;
  ttsSec: number | null;
}

export interface Insight {
  id: string;
  ruleId: string;
  severity: Severity;
  evidence: Record<string, unknown>;
}
