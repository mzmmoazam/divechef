# Landing zing — Deep Ocean Refined v2 design

**Date:** 2026-05-19
**Status:** Approved by user. Lightweight spec — the visual mockup is the canonical reference.
**Type:** Polish pass on already-shipped P2 landing.

## Source of truth (visual)

`/Users/mzmmoazam/Documents/Projects/diveForge/.superpowers/brainstorm/87456-1779166009/content/refined-v2.html`

That file is the pixel-level reference for the new hero. It contains the exact gradients, animation curves, typography, and DOM structure the implementation should match.

## Goal

Elevate `apps/web/src/app/page.tsx` (and the brand tokens that surround it) from "functional landing" to a memorable, on-brand surface — without changing scope (still single page + 3 legal pages), content, or palette.

## What changes (the six "zing" moves, all approved)

1. **Animated caustics.** A slow-drifting `radial-gradient` overlay on the hero (12s ease-in-out loop). Pure CSS keyframes, GPU-cheap. No additional JS.
2. **Grain overlay.** Inline SVG `feTurbulence` noise, ~4% white opacity, `mix-blend-mode: overlay`. Static.
3. **Decorative grid lines.** 64px × 64px white-04% grid behind the hero, radial-masked so it fades at the edges. Sets an engineer's-grid undertone.
4. **Italic serif display headline.** "Personal dive **intelligence** for Shearwater divers." The word "intelligence" rendered in an italic serif with a cyan→pale-cyan→cyan gradient `background-clip: text`. The rest of the headline stays in the body sans (Inter), but at a much larger size.
5. **Glowing CTA + live caret.** The CTA pill has a `box-shadow` glow that pulses (3.2s loop). Next to it, a mono caption like "3 testers in queue_" with a blinking caret (1.1s step). The number reads from a server count of `Waitlist` rows at request time.
6. **Live depth-profile signature card.** The signature visual: a 240×110 SVG depth profile with a cyan stroke + gradient area-fill, three numeric stats (max depth / duration / water temp) in mono with tabular-nums, a pulsing max-depth marker, and a "CLARITY 87/100" score pill at the bottom. Lives in the hero's right column on `md+`, stacks below the headline on mobile.

Everything else on the page (How it works, Verification tiers, Beta form, Footer, legal pages) keeps its existing structure and copy. The same six moves bleed into the rest of the page in toned-down ways: grain stays site-wide, the cyan→pale gradient appears as an accent text style available for any keyword that needs lift, the decorative grid lines fade in behind section headers.

## Typography decisions

- **Body:** Inter via `next/font/google` (already wired). No change.
- **Display serif (new):** Pull a serif via `next/font/google` for the italic accent only. **Pick: Instrument Serif** — italic style is exceptional, weights are limited (one weight) which is fine for a single-word accent, and it's free on Google Fonts. Fallback chain: `'Instrument Serif', 'Times New Roman', 'Iowan Old Style', Georgia, serif`.
- **Numerics:** keep the system mono fallback chain. No new font.

## Motion budget

All animations are CSS-only, GPU-accelerated, and respect `@media (prefers-reduced-motion: reduce)` — caustics, glow pulse, blink, and pulsing dot all collapse to static states under reduced motion.

## Accessibility

- Headline contrast: white on the darkest gradient point ≥ 14:1. The italic gradient text stays ≥ 7:1 (cyan on bg-base = 9.4:1).
- CTA contrast: bg-base text on cyan = 9.4:1.
- All animations honor `prefers-reduced-motion`.
- The depth-profile card has `role="img"` + an `aria-label="Sample dive: 28m max depth, 42 min duration, clarity score 87"` so screen readers get a useful summary instead of an SVG abyss.

## Implementation surface (files)

| File | Status | Responsibility |
|---|---|---|
| `apps/web/src/app/page.tsx` | **Modify** | Hero rewritten to match the mockup. How-it-works / Tiers / Beta / Footer keep their structure; spacing + grid lines applied. |
| `apps/web/src/app/globals.css` | **Modify** | Add `@theme` font for Instrument Serif (via next/font CSS variable). Add `@keyframes` for caustics-drift, glow-pulse, blink-cursor. Add `prefers-reduced-motion` overrides. |
| `apps/web/src/app/layout.tsx` | **Modify** | Pull `Instrument_Serif` from `next/font/google`, expose its CSS variable on `<html>`. |
| `apps/web/src/components/HeroVisual.tsx` | **Create** | The signature depth-profile card. Server component (no JS needed). Pure SVG. |
| `apps/web/src/components/Eyebrow.tsx` | **Create** | Small reusable eyebrow with the cyan dot indicator (used in hero and section headers). |
| `apps/web/src/components/WaitlistTicker.tsx` | **Create** | Reads `prisma.waitlist.count()` server-side, renders `"N testers in queue_"` with the blinking caret. Server component; revalidates every 60s via `export const revalidate = 60`. |
| `apps/web/src/components/WaitlistForm.tsx` | **Modify (small)** | Style polish to match the new aesthetic. No behavior change. |

No tests are added or removed for visual changes. Existing 9 (waitlist) + 5 (form) tests stay green; ignored regions in tests are visual-only.

## Out of scope

- New images / OG image polish — placeholders stay until a real design asset exists.
- Section dividers between How-it-works / Tiers / Beta — current borders are fine; bigger redesign is a future task if needed.
- Legal pages restyle — they're already dense prose; the existing layout is the appropriate "ignore me, read me" feel.

## Self-review

**Placeholder scan:** none. Every move maps to specific code in the mockup file.

**Internal consistency:** font additions in `globals.css` and `layout.tsx` line up. The `WaitlistTicker` server component pulls from the same `Waitlist` table the form posts to, so the displayed count moves when someone signs up.

**Scope check:** focused on the visual polish only. No content/copy changes. No new pages.

**Ambiguity:** the mockup file is the canonical source — anything ambiguous in this spec defers to the HTML.
