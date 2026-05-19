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
