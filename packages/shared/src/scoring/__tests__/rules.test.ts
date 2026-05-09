import { describe, it, expect } from "vitest";
import type { DiveInput, DiveSampleInput } from "../types.js";

import { ascentTooFast } from "../rules/ascent-too-fast.js";
import { ascentDangerous } from "../rules/ascent-dangerous.js";
import { finalAscentTooFast } from "../rules/final-ascent-too-fast.js";
import { palierSecuriteManque } from "../rules/palier-securite-manque.js";
import { palierSecuriteCourt } from "../rules/palier-securite-court.js";
import { palierDecoManque } from "../rules/palier-deco-manque.js";
import { profondeurDepasseNiveauLeger, profondeurDepasseNiveauGrave } from "../rules/profondeur-depasse-niveau.js";
import { temperatureBasse } from "../rules/temperature-basse.js";
import { plongeeProfonde } from "../rules/plongee-profonde.js";

// Load fixtures
import perfectDive from "../fixtures/perfect-dive.json";
import fastAscent from "../fixtures/fast-ascent.json";
import missedPalier from "../fixtures/missed-palier.json";
import decoBreach from "../fixtures/deco-breach.json";

const perfect = perfectDive as { dive: DiveInput; samples: DiveSampleInput[] };
const fast = fastAscent as { dive: DiveInput; samples: DiveSampleInput[] };
const missed = missedPalier as { dive: DiveInput; samples: DiveSampleInput[] };
const deco = decoBreach as { dive: DiveInput; samples: DiveSampleInput[] };

describe("ascent_too_fast", () => {
  it("does NOT fire on perfect dive", () => {
    expect(ascentTooFast.evaluate(perfect.dive, perfect.samples)).toBeNull();
  });

  it("fires on fast-ascent fixture", () => {
    const result = ascentTooFast.evaluate(fast.dive, fast.samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("ascent_too_fast");
    expect(result!.severity).toBe("warn");
    expect((result!.evidence as { maxRateMpm: number }).maxRateMpm).toBeGreaterThan(15);
  });
});

describe("ascent_dangerous", () => {
  it("does NOT fire on perfect dive", () => {
    expect(ascentDangerous.evaluate(perfect.dive, perfect.samples)).toBeNull();
  });

  it("fires on fast-ascent fixture", () => {
    const result = ascentDangerous.evaluate(fast.dive, fast.samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("ascent_dangerous");
    expect(result!.severity).toBe("alert");
    expect((result!.evidence as { maxRateMpm: number }).maxRateMpm).toBeGreaterThan(17);
  });
});

describe("final_ascent_too_fast", () => {
  it("does NOT fire on perfect dive", () => {
    expect(finalAscentTooFast.evaluate(perfect.dive, perfect.samples)).toBeNull();
  });

  it("does NOT fire on missed-palier (final ascent is slow)", () => {
    expect(finalAscentTooFast.evaluate(missed.dive, missed.samples)).toBeNull();
  });
});

describe("palier_securite_manque", () => {
  it("does NOT fire on perfect dive (has 3-min safety stop)", () => {
    expect(palierSecuriteManque.evaluate(perfect.dive, perfect.samples)).toBeNull();
  });

  it("fires on missed-palier fixture", () => {
    const result = palierSecuriteManque.evaluate(missed.dive, missed.samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("palier_securite_manque");
    expect(result!.severity).toBe("warn");
  });
});

describe("palier_securite_court", () => {
  it("does NOT fire on perfect dive (has full 180s stop)", () => {
    expect(palierSecuriteCourt.evaluate(perfect.dive, perfect.samples)).toBeNull();
  });

  it("does NOT fire on missed-palier (no time in 3-5m at all)", () => {
    // palier_securite_manque fires instead since longestSec == 0
    expect(palierSecuriteCourt.evaluate(missed.dive, missed.samples)).toBeNull();
  });
});

describe("palier_deco_manque", () => {
  it("does NOT fire on perfect dive (no deco)", () => {
    expect(palierDecoManque.evaluate(perfect.dive, perfect.samples)).toBeNull();
  });

  it("fires on deco-breach fixture", () => {
    const result = palierDecoManque.evaluate(deco.dive, deco.samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("palier_deco_manque");
    expect(result!.severity).toBe("alert");
  });
});

describe("profondeur_depasse_niveau_leger", () => {
  it("does NOT fire on perfect dive (18m, N2 limit 20m)", () => {
    expect(profondeurDepasseNiveauLeger.evaluate(perfect.dive, perfect.samples)).toBeNull();
  });

  it("fires when depth exceeds limit by <=5m", () => {
    const dive: DiveInput = { ...perfect.dive, maxDepthM: 23, niveau: "N2" };
    const result = profondeurDepasseNiveauLeger.evaluate(dive, perfect.samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("profondeur_depasse_niveau_leger");
    expect((result!.evidence as { excessM: number }).excessM).toBe(3);
  });

  it("does NOT fire when depth exceeds limit by >5m", () => {
    const dive: DiveInput = { ...perfect.dive, maxDepthM: 28, niveau: "N2" };
    expect(profondeurDepasseNiveauLeger.evaluate(dive, perfect.samples)).toBeNull();
  });
});

describe("profondeur_depasse_niveau_grave", () => {
  it("does NOT fire on perfect dive", () => {
    expect(profondeurDepasseNiveauGrave.evaluate(perfect.dive, perfect.samples)).toBeNull();
  });

  it("fires when depth exceeds limit by >5m", () => {
    const dive: DiveInput = { ...perfect.dive, maxDepthM: 28, niveau: "N2" };
    const result = profondeurDepasseNiveauGrave.evaluate(dive, perfect.samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("profondeur_depasse_niveau_grave");
    expect((result!.evidence as { excessM: number }).excessM).toBe(8);
  });

  it("does NOT fire for N4 (no cap)", () => {
    const dive: DiveInput = { ...perfect.dive, maxDepthM: 50, niveau: "N4" };
    expect(profondeurDepasseNiveauGrave.evaluate(dive, perfect.samples)).toBeNull();
  });
});

describe("temperature_basse", () => {
  it("does NOT fire on perfect dive (29C)", () => {
    expect(temperatureBasse.evaluate(perfect.dive, perfect.samples)).toBeNull();
  });

  it("fires when temp < 10 and duration > 30min", () => {
    const dive: DiveInput = { ...perfect.dive, minWaterTempC: 8, durationSec: 2400 };
    const result = temperatureBasse.evaluate(dive, perfect.samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("temperature_basse");
    expect(result!.severity).toBe("info");
  });

  it("does NOT fire when duration <= 30min even if cold", () => {
    const dive: DiveInput = { ...perfect.dive, minWaterTempC: 8, durationSec: 1500 };
    expect(temperatureBasse.evaluate(dive, perfect.samples)).toBeNull();
  });
});

describe("plongee_profonde", () => {
  it("does NOT fire on perfect dive (18m)", () => {
    expect(plongeeProfonde.evaluate(perfect.dive, perfect.samples)).toBeNull();
  });

  it("fires when maxDepth > 30m", () => {
    const dive: DiveInput = { ...perfect.dive, maxDepthM: 35 };
    const result = plongeeProfonde.evaluate(dive, perfect.samples);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("plongee_profonde");
    expect(result!.severity).toBe("info");
    expect(result!.evidence).toEqual({ maxDepthM: 35 });
  });
});
