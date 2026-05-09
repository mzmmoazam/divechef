import type { Rule } from "./types.js";
import { ascentTooFast } from "./rules/ascent-too-fast.js";
import { ascentDangerous } from "./rules/ascent-dangerous.js";
import { finalAscentTooFast } from "./rules/final-ascent-too-fast.js";
import { palierSecuriteManque } from "./rules/palier-securite-manque.js";
import { palierSecuriteCourt } from "./rules/palier-securite-court.js";
import { palierDecoManque } from "./rules/palier-deco-manque.js";
import { profondeurDepasseNiveauLeger, profondeurDepasseNiveauGrave } from "./rules/profondeur-depasse-niveau.js";
import { temperatureBasse } from "./rules/temperature-basse.js";
import { plongeeProfonde } from "./rules/plongee-profonde.js";

export const RULES: Rule[] = [
  ascentTooFast,
  ascentDangerous,
  finalAscentTooFast,
  palierSecuriteManque,
  palierSecuriteCourt,
  palierDecoManque,
  profondeurDepasseNiveauLeger,
  profondeurDepasseNiveauGrave,
  temperatureBasse,
  plongeeProfonde,
];
