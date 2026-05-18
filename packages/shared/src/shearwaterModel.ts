/**
 * Shearwater Petrel-family model identification.
 *
 * Source of truth for what counts as a "known model name" across the iOS,
 * Android, and JS layers. Used during the add-a-device flow to cross-check
 * the user's picked model against the BLE-advertised GAP name.
 *
 * Authoritative references:
 *  - libdivecomputer src/descriptor.c (transport flags per model)
 *  - Subsurface core/qt-ble.cpp:177 (single shared service UUID for the family)
 */

export type ShearwaterModel =
  | 'peregrine'
  | 'perdix'
  | 'perdix-ai'
  | 'perdix-2'
  | 'petrel-2'
  | 'petrel-3'
  | 'teric'
  | 'nerd-2'
  | 'tern'
  | 'unknown-shearwater';

export type ShearwaterVerificationTier = 'verified' | 'compatible' | 'experimental';

/** Parser-eligible models (everything except the user-driven `unknown-shearwater`). */
type ParseableModel = Exclude<ShearwaterModel, 'unknown-shearwater'>;

/**
 * Prefix table — longest match first. The parser walks this in order so
 * "Perdix 2" matches before "Perdix" and "Petrel 3" before "Petrel".
 *
 * Each entry: [advertised-name prefix, model id]. Comparison is
 * case-insensitive and trims surrounding whitespace.
 */
const PREFIX_TABLE: ReadonlyArray<readonly [string, ParseableModel]> = [
  ['Peregrine TX', 'peregrine'],
  ['Peregrine', 'peregrine'],
  ['Perdix 2', 'perdix-2'],
  ['Perdix AI', 'perdix-ai'],
  ['Perdix', 'perdix'],
  ['Petrel 3', 'petrel-3'],
  ['Petrel 2', 'petrel-2'],
  ['Teric', 'teric'],
  ['NERD 2', 'nerd-2'],
  ['Nerd 2', 'nerd-2'],
  ['Tern TX', 'tern'],
  ['Tern', 'tern'],
];

/**
 * Returns the parsed model for an advertised BLE GAP name, or null if the
 * name doesn't match any known prefix. Never returns 'unknown-shearwater' —
 * that's a user-driven label, not a parser output.
 */
export function parseShearwaterModel(advertisedName: string | null | undefined): ParseableModel | null {
  if (!advertisedName) return null;
  const trimmed = advertisedName.trim();
  if (!trimmed) return null;

  // Case-insensitive prefix match. We require the prefix to be the start of
  // the name AND followed by either end-of-string or whitespace — this lets
  // firmware-appended serials through ("Peregrine 1234") while rejecting
  // glued-together garbage ("PEREGRINE-1234", "Peregrineish").
  const upper = trimmed.toUpperCase();
  for (const [prefix, model] of PREFIX_TABLE) {
    const upperPrefix = prefix.toUpperCase();
    if (!upper.startsWith(upperPrefix)) continue;
    const next = upper.charAt(upperPrefix.length);
    if (next === '' || /\s/.test(next)) {
      return model;
    }
  }
  return null;
}

/**
 * Returns the verification tier for a model. Total — every ShearwaterModel
 * maps to exactly one tier.
 */
export function verificationTier(model: ShearwaterModel): ShearwaterVerificationTier {
  switch (model) {
    case 'peregrine':
      return 'verified';
    case 'unknown-shearwater':
      return 'experimental';
    case 'perdix':
    case 'perdix-ai':
    case 'perdix-2':
    case 'petrel-2':
    case 'petrel-3':
    case 'teric':
    case 'nerd-2':
    case 'tern':
      return 'compatible';
    default: {
      // If a new ShearwaterModel variant is added without a case here,
      // TypeScript fails compilation: "Type 'newModel' is not assignable to type 'never'".
      const _exhaustive: never = model;
      throw new Error(`unreachable: unhandled ShearwaterModel ${_exhaustive as string}`);
    }
  }
}
