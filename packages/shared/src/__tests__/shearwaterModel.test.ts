import { describe, expect, it } from 'vitest';
import {
  parseShearwaterModel,
  verificationTier,
  type ShearwaterModel,
} from '../shearwaterModel.js';

describe('parseShearwaterModel', () => {
  it.each([
    ['Peregrine', 'peregrine'],
    ['Peregrine TX', 'peregrine'],
    ['Perdix 2', 'perdix-2'],
    ['Perdix AI', 'perdix-ai'],
    ['Perdix', 'perdix'],
    ['Petrel 3', 'petrel-3'],
    ['Petrel 2', 'petrel-2'],
    ['Teric', 'teric'],
    ['NERD 2', 'nerd-2'],
    ['Nerd 2', 'nerd-2'],
    ['Tern', 'tern'],
    ['Tern TX', 'tern'],
  ])('parses %s → %s', (input, expected) => {
    expect(parseShearwaterModel(input)).toBe(expected);
  });

  it('matches longer prefixes before shorter (Perdix 2 not Perdix)', () => {
    expect(parseShearwaterModel('Perdix 2')).toBe('perdix-2');
    expect(parseShearwaterModel('Perdix AI')).toBe('perdix-ai');
    expect(parseShearwaterModel('Petrel 3')).toBe('petrel-3');
  });

  it('returns null for unparseable names', () => {
    expect(parseShearwaterModel('')).toBeNull();
    expect(parseShearwaterModel(null)).toBeNull();
    expect(parseShearwaterModel('Garmin Descent')).toBeNull();
    expect(parseShearwaterModel('Pe regrine')).toBeNull();
    expect(parseShearwaterModel('PEREGRINE-1234')).toBeNull();
    expect(parseShearwaterModel('Some random Bluetooth speaker')).toBeNull();
  });

  it('never returns unknown-shearwater (parser-only models)', () => {
    // unknown-shearwater is a user-driven label, not a parser output.
    const samples = ['', 'unknown', 'Unknown Shearwater', 'foobar'];
    for (const s of samples) {
      const result = parseShearwaterModel(s);
      expect(result).not.toBe('unknown-shearwater');
    }
  });
});

describe('verificationTier', () => {
  it('puts peregrine in verified', () => {
    expect(verificationTier('peregrine')).toBe('verified');
  });

  it.each<ShearwaterModel>(['perdix', 'perdix-ai', 'perdix-2', 'petrel-2', 'petrel-3', 'teric', 'nerd-2', 'tern'])(
    'puts %s in compatible',
    (model) => {
      expect(verificationTier(model)).toBe('compatible');
    }
  );

  it('puts unknown-shearwater in experimental', () => {
    expect(verificationTier('unknown-shearwater')).toBe('experimental');
  });

  it('is total — every model maps to a tier', () => {
    const all: ShearwaterModel[] = [
      'peregrine', 'perdix', 'perdix-ai', 'perdix-2',
      'petrel-2', 'petrel-3', 'teric', 'nerd-2', 'tern',
      'unknown-shearwater',
    ];
    for (const m of all) {
      const tier = verificationTier(m);
      expect(['verified', 'compatible', 'experimental']).toContain(tier);
    }
  });
});
