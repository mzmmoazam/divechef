/**
 * Deep Ocean Modern design tokens.
 *
 * Single source of truth for color, typography, spacing, and radius
 * across the mobile app. Locked in spec
 * docs/superpowers/specs/2026-05-18-phase-a-beta-ship-design.md.
 */

export const tokens = {
  color: {
    bgBase: '#0a1220',
    bgElev: '#0f1d33',
    bgDeep: '#103952',
    accent: '#22d3ee',
    accent2: '#a5f3fc',
    text: '#f0f9ff',
    text2: '#94a3b8',
    text3: '#64748b',
    borderSubtle: 'rgba(255, 255, 255, 0.08)',
    success: '#22c55e',
    warning: '#facc15',
    danger: '#ef4444',
  },
  type: {
    display: { size: 30, weight: '700' as const, letterSpacing: -0.02 },
    title: { size: 24, weight: '700' as const, letterSpacing: -0.01 },
    heading: { size: 18, weight: '600' as const, letterSpacing: 0 },
    bodyStrong: { size: 15, weight: '600' as const, letterSpacing: 0 },
    body: { size: 15, weight: '400' as const, letterSpacing: 0 },
    small: { size: 13, weight: '500' as const, letterSpacing: 0 },
    caption: { size: 11, weight: '600' as const, letterSpacing: 0.12 },
    monoDigit: { size: 18, weight: '600' as const, letterSpacing: -0.02 },
  },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48 } as const,
  radius: { sm: 8, card: 12, hero: 16, pill: 999 } as const,
} as const;

export type Tokens = typeof tokens;
