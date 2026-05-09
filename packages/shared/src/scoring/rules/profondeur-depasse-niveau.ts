import type { Rule } from "../types.js";

const NIVEAU_LIMITS: Record<string, number | null> = {
  N1: 20,
  N2: 20,
  N3: 60,
  N4: null,
  INITIATEUR: null,
  MF1: null,
  MF2: null,
  UNKNOWN: null, // disabled
};

/**
 * profondeur_depasse_niveau_leger: fires when maxDepth exceeds niveau limit by <=5m
 */
export const profondeurDepasseNiveauLeger: Rule = {
  id: "profondeur_depasse_niveau_leger",
  deduction: 10,
  evaluate(dive) {
    const limit = NIVEAU_LIMITS[dive.niveau];
    if (limit === null || limit === undefined) return null;
    if (dive.niveau === "UNKNOWN") return null;

    const excessM = dive.maxDepthM - limit;
    if (excessM > 0 && excessM <= 5) {
      return {
        ruleId: "profondeur_depasse_niveau_leger",
        severity: "warn",
        evidence: {
          maxDepthM: dive.maxDepthM,
          limitM: limit,
          excessM: Math.round(excessM * 100) / 100,
          niveau: dive.niveau,
        },
      };
    }

    return null;
  },
};

/**
 * profondeur_depasse_niveau_grave: fires when maxDepth exceeds niveau limit by >5m
 */
export const profondeurDepasseNiveauGrave: Rule = {
  id: "profondeur_depasse_niveau_grave",
  deduction: 30,
  evaluate(dive) {
    const limit = NIVEAU_LIMITS[dive.niveau];
    if (limit === null || limit === undefined) return null;
    if (dive.niveau === "UNKNOWN") return null;

    const excessM = dive.maxDepthM - limit;
    if (excessM > 5) {
      return {
        ruleId: "profondeur_depasse_niveau_grave",
        severity: "alert",
        evidence: {
          maxDepthM: dive.maxDepthM,
          limitM: limit,
          excessM: Math.round(excessM * 100) / 100,
          niveau: dive.niveau,
        },
      };
    }

    return null;
  },
};
