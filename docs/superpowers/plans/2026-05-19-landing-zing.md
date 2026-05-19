# Landing zing — Deep Ocean Refined v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-19
**Status:** Ready for execution.
**Spec:** `docs/superpowers/specs/2026-05-19-landing-zing-design.md`
**Mockup (canonical visual reference):** `.superpowers/brainstorm/87456-1779166009/content/refined-v2.html`
**Depends on:** P2 already merged (branch `main` has the existing landing).

**Goal:** Land six approved "zing" moves on the existing landing — caustics, grain, grid lines, italic-serif accent, glowing CTA + live waitlist counter, signature depth-profile card.

**Architecture:** Add an Instrument Serif font via `next/font/google` for the italic accent. Add three CSS keyframes (`caustics-drift`, `glow-pulse`, `blink-cursor`) + a `prefers-reduced-motion` block. Extract three small server components (`HeroVisual`, `Eyebrow`, `WaitlistTicker`) so the landing page stays readable.

**Tech Stack:** Next.js 16 App Router, Tailwind v4, server components, Prisma 6.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `apps/web/src/app/layout.tsx` | **Modify** | Pull `Instrument_Serif` from `next/font/google`; expose its CSS variable on `<html>`. |
| `apps/web/src/app/globals.css` | **Modify** | Add `@theme` font binding, three `@keyframes`, `prefers-reduced-motion` overrides, the `.serif-italic` accent class. |
| `apps/web/src/components/Eyebrow.tsx` | **Create** | Mono eyebrow with optional cyan dot indicator. Used in hero + section headers. |
| `apps/web/src/components/HeroVisual.tsx` | **Create** | The signature depth-profile card. Pure SVG. `role="img"` + aria-label. |
| `apps/web/src/components/WaitlistTicker.tsx` | **Create** | Server component reading `prisma.waitlist.count()` with 60s revalidation. Mono "N testers in queue_" + blinking caret. |
| `apps/web/src/app/page.tsx` | **Modify** | Hero rebuilt to match the mockup. Sections below get grid + grain. |
| `apps/web/src/components/WaitlistForm.tsx` | **Modify** | Style polish only — no behavior change. |

---

## Task 1: Wire Instrument Serif font + globals.css zing primitives

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`

### Step 1: Add `Instrument_Serif` to the layout

- [ ] Open `apps/web/src/app/layout.tsx`. Replace the imports + font instantiation block at the top:

```tsx
import type { Metadata } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const instrumentSerif = Instrument_Serif({
  weight: '400',
  style: 'italic',
  subsets: ['latin'],
  variable: '--font-instrument-serif',
});
```

- [ ] In the `RootLayout` JSX, change the `<html>` className to include both variables:

```tsx
<html lang="en" className={`${inter.variable} ${instrumentSerif.variable}`}>
```

### Step 2: Update `globals.css`

- [ ] Open `apps/web/src/app/globals.css`. **After** the existing `@theme` block, add the font binding:

```css
@theme {
  --font-serif: var(--font-instrument-serif), 'Times New Roman', 'Iowan Old Style', Georgia, serif;
}
```

- [ ] **At the bottom of the file**, append:

```css
/* === Zing keyframes === */

@keyframes caustics-drift {
  0%   { transform: translate(0, 0)    scale(1);    opacity: 0.55; }
  50%  { transform: translate(-8px, 6px) scale(1.05); opacity: 0.7; }
  100% { transform: translate(0, 0)    scale(1);    opacity: 0.55; }
}

@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 36px #22d3ee66, 0 0 80px #22d3ee22; }
  50%      { box-shadow: 0 0 52px #22d3ee99, 0 0 120px #22d3ee33; }
}

@keyframes blink-cursor {
  0%, 60%   { opacity: 1; }
  61%, 100% { opacity: 0; }
}

@keyframes dot-pulse {
  0%, 100% { transform: scale(1);   opacity: 1; }
  50%      { transform: scale(1.4); opacity: 0.6; }
}

/* === Italic-serif gradient accent — used for ONE word in the headline === */

.serif-italic {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 400;
  background: linear-gradient(90deg, #22d3ee 0%, #a5f3fc 60%, #22d3ee 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.02em;
}

/* === Reduced motion: collapse all zing animations to static === */

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Step 3: Verify

- [ ] Run: `cd apps/web && timeout 180 pnpm exec next build 2>&1 | tail -10`
- [ ] Expected: build succeeds. The new font is downloaded at build time and bundled.

### Step 4: Commit

- [ ] Run:

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/globals.css
git commit -m "$(cat <<'EOF'
feat(web): Instrument Serif font + zing keyframes + reduced-motion

next/font/google pulls Instrument Serif Italic 400 (the single weight
we need for the one-word headline accent). Exposed via the
--font-instrument-serif CSS variable on <html>, bound in @theme so
Tailwind's font-serif utility resolves to it.

Four CSS keyframes: caustics-drift (12s underwater light shimmer),
glow-pulse (CTA + live-dot pulse, 3.2s and 1.4s instances),
blink-cursor (mono caret, 1.1s step), dot-pulse (max-depth marker).

prefers-reduced-motion globally collapses animations to 0.01ms so
users with vestibular triggers see static states.

.serif-italic class encapsulates the cyan→pale→cyan gradient text
treatment used on the signature word.

Landing zing — task 1 of 6.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `Eyebrow` component

**Files:**
- Create: `apps/web/src/components/Eyebrow.tsx`

### Step 1: Create the component

- [ ] Create `apps/web/src/components/Eyebrow.tsx`:

```tsx
type Props = {
  children: React.ReactNode;
  /** When true, render a glowing cyan dot to the left. */
  withDot?: boolean;
  className?: string;
};

/**
 * Mono uppercase eyebrow text. Used above headlines + section titles.
 * The optional dot signals "live" / "active" content (used in the hero).
 */
export function Eyebrow({ children, withDot = false, className = '' }: Props) {
  return (
    <p
      className={`font-mono text-[11px] tracking-[0.22em] uppercase text-accent inline-flex items-center gap-2 ${className}`}
    >
      {withDot && (
        <span
          aria-hidden
          className="inline-block w-[6px] h-[6px] rounded-full bg-accent shadow-[0_0_8px_#22d3ee]"
        />
      )}
      {children}
    </p>
  );
}
```

### Step 2: Verify it typechecks

- [ ] Run: `cd apps/web && timeout 60 pnpm exec tsc --noEmit 2>&1 | tail -5`
- [ ] Expected: clean (pre-existing noise OK; no new errors).

### Step 3: Commit

- [ ] Run:

```bash
git add apps/web/src/components/Eyebrow.tsx
git commit -m "$(cat <<'EOF'
feat(web): Eyebrow component — mono caps with optional cyan dot

Reusable section-eyebrow for the landing. Mono, 11px, uppercase,
0.22em tracking, cyan. Optional withDot renders a 6×6 cyan dot with
glow — used to signal "live" content in the hero.

Landing zing — task 2 of 6.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `HeroVisual` component — signature depth-profile card

**Files:**
- Create: `apps/web/src/components/HeroVisual.tsx`

### Step 1: Create the component

- [ ] Create `apps/web/src/components/HeroVisual.tsx`:

```tsx
/**
 * Signature visual for the landing hero. Server component, pure SVG.
 *
 * Renders a stylized dive log: title row, three numeric stats, depth
 * profile chart with a pulsing max-depth marker, and a CLARITY score
 * pill. Static sample data — this is decorative, not live.
 */
export function HeroVisual() {
  return (
    <div
      role="img"
      aria-label="Sample dive: 28 metres max depth, 42 minute duration, water 14.7°C, clarity score 87 of 100"
      className="relative w-full"
    >
      <div className="relative rounded-hero p-[22px] bg-gradient-to-b from-elev to-base border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur">
        {/* gradient border glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-hero"
          style={{
            padding: '1px',
            background:
              'linear-gradient(135deg, rgba(34,211,238,0.27) 0%, transparent 30%, transparent 70%, rgba(34,211,238,0.13) 100%)',
            WebkitMask:
              'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />

        {/* head row */}
        <div className="flex justify-between items-baseline font-mono text-[10px] tracking-[0.12em] uppercase text-text-dim mb-[14px]">
          <span>DIVE_0072 · LE FRIOUL</span>
          <span className="inline-flex items-center gap-[5px] text-accent">
            <span
              aria-hidden
              className="inline-block w-[5px] h-[5px] rounded-full bg-accent"
              style={{ animation: 'dot-pulse 1.4s ease-in-out infinite' }}
            />
            LIVE
          </span>
        </div>

        {/* stats grid */}
        <div className="grid grid-cols-3 gap-1 mb-[14px]">
          <Stat num="28" unit="m" label="max depth" />
          <Stat num="42" unit="min" label="duration" />
          <Stat num="14.7" unit="°" label="water" />
        </div>

        {/* depth profile SVG */}
        <svg
          aria-hidden
          viewBox="0 0 240 110"
          preserveAspectRatio="none"
          className="block w-full h-[110px]"
        >
          <defs>
            <linearGradient id="hero-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="hero-line" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#a5f3fc" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.4" />
            </linearGradient>
          </defs>
          <line x1="0" y1="25" x2="240" y2="25" stroke="rgba(255,255,255,0.03)" />
          <line x1="0" y1="55" x2="240" y2="55" stroke="rgba(255,255,255,0.03)" />
          <line x1="0" y1="85" x2="240" y2="85" stroke="rgba(255,255,255,0.03)" />
          <path
            d="M0,5 L18,18 L36,42 L60,72 L88,86 L120,90 L150,82 L172,68 L198,48 L218,28 L240,12 L240,110 L0,110 Z"
            fill="url(#hero-area)"
          />
          <path
            d="M0,5 L18,18 L36,42 L60,72 L88,86 L120,90 L150,82 L172,68 L198,48 L218,28 L240,12"
            fill="none"
            stroke="url(#hero-line)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx="120" cy="90" r="3.5" fill="#22d3ee">
            <animate attributeName="r" values="3.5;5;3.5" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.6;1" dur="2.4s" repeatCount="indefinite" />
          </circle>
        </svg>

        {/* foot row */}
        <div className="mt-[10px] flex justify-between font-mono text-[9px] text-text-dim">
          <span>00:00</span>
          <span className="text-accent font-bold tracking-[0.1em]">CLARITY 87/100</span>
          <span>42:14</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ num, unit, label }: { num: string; unit: string; label: string }) {
  return (
    <div>
      <div
        className="font-mono text-[22px] text-text font-semibold tracking-[-0.02em]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {num}
        <small className="text-text-dim text-[12px] font-normal">{unit}</small>
      </div>
      <div className="font-mono text-[9px] tracking-[0.12em] text-text-dim uppercase">{label}</div>
    </div>
  );
}
```

### Step 2: Verify

- [ ] Run: `cd apps/web && timeout 60 pnpm exec tsc --noEmit 2>&1 | tail -5`
- [ ] Expected: clean.

### Step 3: Commit

- [ ] Run:

```bash
git add apps/web/src/components/HeroVisual.tsx
git commit -m "$(cat <<'EOF'
feat(web): HeroVisual — signature depth-profile card for the landing

The landing hero's right-column visual element. Renders a stylized
dive log card: dive name + LIVE indicator (with pulsing dot), three
stats in tabular-nums mono (max depth / duration / water), an SVG
depth profile with cyan gradient line + area fill + animated max-
depth marker, and a CLARITY score pill at the bottom.

Static sample data — decorative, not connected to real dives.

role="img" + aria-label so screen readers get a useful summary
instead of an SVG abyss.

Landing zing — task 3 of 6.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `WaitlistTicker` server component

**Files:**
- Create: `apps/web/src/components/WaitlistTicker.tsx`

### Step 1: Create the component

- [ ] Create `apps/web/src/components/WaitlistTicker.tsx`:

```tsx
import { prisma } from '@/lib/db';

export const revalidate = 60;

/**
 * Live waitlist counter — server component.
 *
 * Reads the current row count from the Waitlist table at request time
 * (cached for 60s). Renders mono "N testers in queue_" with a blinking
 * caret next to the hero CTA.
 *
 * Returns null silently if the DB read fails — the CTA stays usable.
 */
export async function WaitlistTicker() {
  let count = 0;
  try {
    count = await prisma.waitlist.count();
  } catch {
    return null;
  }

  return (
    <span className="font-mono text-[11px] text-text-dim tracking-[0.08em]">
      {count} {count === 1 ? 'tester' : 'testers'} in queue
      <span
        aria-hidden
        className="text-accent ml-[1px]"
        style={{ animation: 'blink-cursor 1.1s step-end infinite' }}
      >
        _
      </span>
    </span>
  );
}
```

### Step 2: Verify

- [ ] Run: `cd apps/web && timeout 60 pnpm exec tsc --noEmit 2>&1 | tail -5`
- [ ] Expected: clean.

### Step 3: Commit

- [ ] Run:

```bash
git add apps/web/src/components/WaitlistTicker.tsx
git commit -m "$(cat <<'EOF'
feat(web): WaitlistTicker — server component live counter

Reads prisma.waitlist.count() on the server at request time, cached
for 60s via export const revalidate = 60. Renders "N testers in
queue_" with a blinking mono caret next to the hero CTA.

Pluralizes correctly. On DB failure, returns null silently — the CTA
stays usable. The 60s cache means the count moves over time without
hitting the DB on every request.

Landing zing — task 4 of 6.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Rebuild the landing hero in `page.tsx`

This is the core task. Replaces the existing hero with the v2 mockup, keeps the rest of the page (How it works / Tiers / Beta / Footer) — but adds the grid lines + grain treatment so the whole page feels coherent.

**Files:**
- Modify: `apps/web/src/app/page.tsx`

### Step 1: Replace the file

- [ ] Replace `apps/web/src/app/page.tsx` contents with:

```tsx
import Link from 'next/link';
import { WaitlistForm } from '@/components/WaitlistForm';
import { Eyebrow } from '@/components/Eyebrow';
import { HeroVisual } from '@/components/HeroVisual';
import { WaitlistTicker } from '@/components/WaitlistTicker';

const GRAIN_SVG =
  'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'240\' height=\'240\'><filter id=\'n\'><feTurbulence baseFrequency=\'0.85\' numOctaves=\'2\' stitchTiles=\'stitch\'/><feColorMatrix values=\'0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.04 0\'/></filter><rect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/></svg>")';

export default function HomePage() {
  return (
    <main className="min-h-screen relative">
      {/* site-wide grain overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 mix-blend-overlay opacity-50"
        style={{ backgroundImage: GRAIN_SVG }}
      />

      {/* Top nav */}
      <nav className="sticky top-0 z-20 backdrop-blur border-b border-border-subtle" style={{ background: 'rgba(10,18,32,0.8)' }}>
        <div className="max-w-[1100px] mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-semibold text-text no-underline">DiveChef</Link>
          <a href="#beta" className="text-accent text-sm">Beta access ▸</a>
        </div>
      </nav>

      {/* === Hero === */}
      <section className="relative overflow-hidden">
        {/* gradient backdrop */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 60% 80% at 20% 110%, rgba(34,211,238,0.18) 0%, transparent 55%), radial-gradient(ellipse 80% 60% at 85% -10%, #103952 0%, transparent 60%), linear-gradient(180deg, #0a1220 0%, #0a1220 100%)',
          }}
        />
        {/* caustics layer */}
        <div
          aria-hidden
          className="absolute -inset-10 -z-10 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 200px 80px at 30% 20%, rgba(34,211,238,0.094) 0%, transparent 60%), radial-gradient(ellipse 250px 100px at 70% 50%, rgba(165,243,252,0.078) 0%, transparent 60%), radial-gradient(ellipse 180px 70px at 50% 80%, rgba(34,211,238,0.063) 0%, transparent 60%)',
            filter: 'blur(20px)',
            animation: 'caustics-drift 12s ease-in-out infinite',
          }}
        />
        {/* decorative grid lines */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 90% at 50% 50%, black 0%, transparent 100%)',
            maskImage: 'radial-gradient(ellipse 70% 90% at 50% 50%, black 0%, transparent 100%)',
          }}
        />

        <div className="max-w-[1100px] mx-auto px-6 py-16 md:py-24 grid md:grid-cols-[1.4fr_1fr] gap-12 items-center">
          <div>
            <Eyebrow withDot className="mb-6">Closed beta · iOS &amp; Android</Eyebrow>
            <h1 className="text-[44px] md:text-[64px] leading-[0.98] tracking-[-0.035em] font-medium mb-6 text-text">
              Personal dive<br />
              <span className="serif-italic">intelligence</span><br />
              for Shearwater divers.
            </h1>
            <p className="text-lg text-text-muted mb-8 max-w-[460px]">
              Sync your Peregrine, Perdix, or Petrel and see what every dive taught you.{' '}
              <strong className="text-text font-medium">Honest about what&apos;s verified</strong>,
              what&apos;s experimental, and what we can&apos;t do yet.
            </p>
            <div className="flex items-center gap-5 flex-wrap">
              <a
                href="#beta"
                className="inline-flex items-center gap-2 rounded-pill px-7 py-[14px] font-bold text-[14px] text-base no-underline"
                style={{
                  background: 'linear-gradient(135deg, #22d3ee 0%, #a5f3fc 100%)',
                  color: '#0a1220',
                  animation: 'glow-pulse 3.2s ease-in-out infinite',
                }}
              >
                Get a beta invite →
              </a>
              <WaitlistTicker />
            </div>
          </div>
          <div className="md:pl-4">
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* === How it works === */}
      <section className="max-w-[1100px] mx-auto px-6 py-16 border-t border-border-subtle">
        <Eyebrow className="mb-3">The flow</Eyebrow>
        <h2 className="text-3xl font-semibold text-text mb-8">How it works</h2>
        <ol className="space-y-5 max-w-prose">
          {[
            ['1', 'Pair your dive computer over Bluetooth.'],
            ['2', 'DiveChef pulls every new dive on the watch — no PC, no cable.'],
            ['3', 'Each dive gets a clarity score and the insights behind it.'],
          ].map(([n, copy]) => (
            <li key={n} className="flex gap-5">
              <span className="text-accent font-mono font-bold text-2xl shrink-0 w-10" style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</span>
              <span className="text-text-muted text-base pt-[2px]">{copy}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* === Verification tiers === */}
      <section className="max-w-[1100px] mx-auto px-6 py-16 border-t border-border-subtle">
        <Eyebrow className="mb-3">Honesty</Eyebrow>
        <h2 className="text-3xl font-semibold text-text mb-3">Verified, Compatible, Experimental</h2>
        <p className="text-text-muted mb-8 max-w-prose">
          We tell you what we&apos;ve actually tested. Four-tier framework, same as the app.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Tier color="text-success" mark="✓" label="Verified" body="Peregrine — tested end-to-end on real hardware." />
          <Tier color="text-accent" mark="◑" label="Compatible" body="Perdix family, Petrel 2 / 3, Teric, Nerd 2, Tern — same protocol, not yet on our test bench." />
          <Tier color="text-warning" mark="◌" label="Experimental" body="Other Shearwater models we haven't catalogued yet. We'll work through them with you." />
          <Tier color="text-text-dim" mark="—" label="Out of scope" body="Petrel 1 / Nerd 1 use older Bluetooth Classic — not supported. Subsurface reads them via USB." />
        </div>
      </section>

      {/* === Beta form === */}
      <section id="beta" className="max-w-[1100px] mx-auto px-6 py-16 border-t border-border-subtle">
        <Eyebrow className="mb-3">Beta invite</Eyebrow>
        <h2 className="text-3xl font-semibold text-text mb-3">Drop your email</h2>
        <p className="text-text-muted mb-8 max-w-prose">
          Closed beta. We&apos;ll reply with a TestFlight or Play Console invite.
        </p>
        <div className="max-w-prose">
          <WaitlistForm />
        </div>
      </section>

      {/* === Footer === */}
      <footer className="max-w-[1100px] mx-auto px-6 py-8 border-t border-border-subtle text-sm text-text-dim flex flex-wrap items-center justify-between gap-4">
        <p>© {new Date().getFullYear()} DiveChef</p>
        <p className="space-x-5">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
        </p>
      </footer>
    </main>
  );
}

function Tier({ color, mark, label, body }: { color: string; mark: string; label: string; body: string }) {
  return (
    <div className="rounded-card bg-elev/60 backdrop-blur p-5 border border-border-subtle">
      <p className={`font-semibold ${color} flex items-center gap-2`}>
        <span aria-hidden>{mark}</span>
        {label}
      </p>
      <p className="text-text-muted text-sm mt-2">{body}</p>
    </div>
  );
}
```

### Step 2: Verify

- [ ] Run: `cd apps/web && timeout 240 pnpm exec next build 2>&1 | tail -15`
- [ ] Expected: `/` still listed as static (`○`). Build succeeds.

If the build flags any Tailwind classes that don't resolve, add the missing token to `globals.css` `@theme` and rebuild.

### Step 3: Visual smoke test (local)

- [ ] Run: `cd apps/web && timeout 30 pnpm dev 2>&1 | tail -3` (will time out — that's fine, just confirm Ready)
- [ ] If you can hit it in a browser at `http://localhost:3000`, eyeball the result:
  - Dark dramatic hero with caustics shimmer
  - Italic-serif gradient on "intelligence"
  - Glowing CTA + ticker
  - Depth-profile card on the right
  - Section dividers, grid lines fade subtly behind hero
- [ ] Skipping this step is OK if the dev server can't boot in the harness — the production deploy will be the real visual check.

### Step 4: Commit

- [ ] Run:

```bash
git add apps/web/src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(web): rebuild hero with caustics, grid, italic-serif accent + signature visual

Hero now matches the approved Refined v2 mockup:
- Site-wide grain overlay (fixed, mix-blend-mode: overlay)
- Caustics light-shimmer drift (12s loop)
- 64px engineer's-grid lines, radial-faded
- Italic Instrument Serif on "intelligence" with cyan→pale→cyan
  gradient text-fill
- Glowing pill CTA (3.2s box-shadow pulse)
- WaitlistTicker shows live count next to the CTA
- HeroVisual signature depth-profile card on the right column
- Eyebrow component used above each section heading

Sections below (How it works, Tiers, Beta, Footer) keep their copy
but get the new Eyebrow treatment, slightly larger type, max-width
1100px instead of prose-only, and tier cards use bg-elev/60 +
backdrop-blur for depth.

Tier card markup factored out into a small Tier helper.

Landing zing — task 5 of 6.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Polish `WaitlistForm` aesthetic

Behavior unchanged. Just bring the form's look in line with the new hero.

**Files:**
- Modify: `apps/web/src/components/WaitlistForm.tsx`

### Step 1: Read current state

- [ ] Run: `cat apps/web/src/components/WaitlistForm.tsx`

### Step 2: Edit the form's success-state and inputs

- [ ] In the success-state JSX, change the wrapper to add a subtle gradient border treatment. Replace:

```tsx
<div className="rounded-card bg-elev p-6 text-text">
```

with:

```tsx
<div className="rounded-card bg-elev/80 backdrop-blur p-6 text-text border border-accent/20">
```

- [ ] In the form's inputs, replace each `<input>` and `<textarea>` `className`:

```tsx
className="w-full rounded-card bg-elev border border-border-subtle px-4 py-3 text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
```

with:

```tsx
className="w-full rounded-card bg-elev/60 backdrop-blur border border-border-subtle px-4 py-3 text-text placeholder:text-text-dim focus:border-accent focus:outline-none focus:shadow-[0_0_24px_#22d3ee33] transition-shadow"
```

- [ ] In the submit button, replace:

```tsx
className="rounded-pill bg-accent px-6 py-3 font-semibold text-base disabled:opacity-50"
```

with:

```tsx
className="rounded-pill px-7 py-[14px] font-bold text-[14px] text-base disabled:opacity-50 transition-all"
style={{
  background: 'linear-gradient(135deg, #22d3ee 0%, #a5f3fc 100%)',
  color: '#0a1220',
  boxShadow: state.kind === 'submitting' ? 'none' : '0 0 24px #22d3ee44',
}}
```

(If the existing button has a different opening tag, just update the `className` and add the matching `style` prop on the same element.)

### Step 3: Verify tests still pass

- [ ] Run: `cd apps/web && pnpm test -- WaitlistForm 2>&1 | tail -10`
- [ ] Expected: 5/5 still pass (we only changed styles, no behavior).

### Step 4: Commit

- [ ] Run:

```bash
git add apps/web/src/components/WaitlistForm.tsx
git commit -m "$(cat <<'EOF'
feat(web): WaitlistForm aesthetic polish to match new hero

Inputs: bg-elev/60 + backdrop-blur, focus state adds a 24px cyan
glow via box-shadow + transition. Submit button: same cyan→pale
gradient as the hero CTA, with conditional glow shadow that drops
during the submitting state. Success card: backdrop-blur + cyan/20
border to give it a glow-card feel.

No behavior change. 5 form tests stay green.

Landing zing — task 6 of 6.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Final build + smoke

Not a code commit. One-time verification after all 6 commits land.

### Step 1: Full test suite

- [ ] Run: `cd apps/web && pnpm test 2>&1 | tail -10`
- [ ] Expected: 21 tests pass (sentry-scrub 7 + waitlist 9 + WaitlistForm 5).

### Step 2: Production build

- [ ] Run: `cd apps/web && timeout 240 pnpm exec next build 2>&1 | tail -15`
- [ ] Expected: 4 routes static (`/`, `/privacy`, `/terms`, `/support`), `/api/waitlist` dynamic.

### Step 3: Push + deploy

- [ ] Run: `git push`
- [ ] Watch the Vercel build log for: Instrument Serif font fetched, no Tailwind class warnings, build completed.
- [ ] Visit the production URL. Confirm: dark hero with caustics, italic-serif "intelligence", depth-profile card, ticker pulses with live count, form has glow on focus.

### Step 4: Done

- [ ] If anything looks off, commit a small fix on `main` and re-deploy.
- [ ] No further commit needed for this task.

---

## Self-Review

**1. Spec coverage:**

| Spec move | Task |
|---|---|
| Animated caustics | Task 1 (keyframe) + Task 5 (applied) |
| Grain overlay | Task 5 (applied site-wide as `<main>` overlay) |
| Decorative grid lines | Task 5 (hero `<section>`) |
| Italic-serif display accent | Task 1 (font + class) + Task 5 (used) |
| Glowing CTA + live counter | Task 1 (keyframe) + Task 4 (ticker) + Task 5 (applied) |
| Live depth-profile card | Task 3 (component) + Task 5 (placed) |
| `prefers-reduced-motion` | Task 1 |
| `aria-label` on depth profile | Task 3 |
| `next/font` for Instrument Serif | Task 1 |
| `WaitlistForm` style polish | Task 6 |

All 6 spec moves covered. Reduced motion, a11y, and font wiring all explicit.

**2. Placeholder scan:** No "TBD"s. Every step has the exact code or command. The mockup file is referenced as canonical visual truth, not as a placeholder.

**3. Type consistency:**

- `Eyebrow` props (`children`, `withDot?`, `className?`) — used consistently in Task 5.
- `HeroVisual` exports a no-prop component — used as `<HeroVisual />` in Task 5.
- `WaitlistTicker` exports an async server component — `await`ed implicitly via `<WaitlistTicker />` rendering pattern (Next 16 server components return Promises that the runtime awaits).
- Tailwind utility names (`text-accent`, `text-text-muted`, `text-text-dim`, `bg-elev`, `border-border-subtle`, `rounded-card`, `rounded-pill`, `font-mono`, `font-serif`) — all already defined in `globals.css` `@theme` block from P2 Task 1, except `font-serif` which Task 1 adds.

---

## Execution notes

- One worktree (or just `main` directly). 6 commits + 1 verification step. ~1–2 hours.
- All tasks land sequentially — Task 5 imports Tasks 2/3/4, so order matters.
- No tests are added; 21 existing tests continue to pass.
