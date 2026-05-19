import Link from 'next/link';
import { WaitlistForm } from '@/components/WaitlistForm';

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Top nav */}
      <nav className="sticky top-0 z-10 bg-base/80 backdrop-blur border-b border-border-subtle">
        <div className="max-w-prose mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-semibold text-text no-underline">
            DiveChef
          </Link>
          <a href="#beta" className="text-accent text-sm">
            Beta access ▸
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-prose mx-auto px-4 pt-12 pb-8">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-text leading-tight">
          Personal dive intelligence
          <br />
          for Shearwater divers.
        </h1>
        <p className="mt-6 text-lg text-text-muted">
          Sync your Peregrine, Perdix, or Petrel and see what every dive taught you.
          Honest about what&apos;s verified, what&apos;s experimental, and what we
          can&apos;t do yet.
        </p>
        <a
          href="#beta"
          className="inline-block mt-8 rounded-pill bg-accent px-6 py-3 font-semibold text-base no-underline"
        >
          Get a beta invite →
        </a>
        <p className="mt-4 text-sm text-text-dim">
          Closed beta · iOS + Android · French / English
        </p>
      </section>

      {/* How it works */}
      <section className="max-w-prose mx-auto px-4 py-12 border-t border-border-subtle">
        <h2 className="text-2xl font-semibold text-text mb-6">How it works</h2>
        <ol className="space-y-4">
          {[
            ['1', 'Pair your dive computer over Bluetooth.'],
            ['2', 'DiveChef pulls every new dive on the watch — no PC, no cable.'],
            ['3', 'Each dive gets a clarity score and the insights behind it.'],
          ].map(([n, copy]) => (
            <li key={n} className="flex gap-4">
              <span className="text-accent font-mono font-bold text-xl shrink-0 w-8">{n}</span>
              <span className="text-text-muted">{copy}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Verification tiers */}
      <section className="max-w-prose mx-auto px-4 py-12 border-t border-border-subtle">
        <h2 className="text-2xl font-semibold text-text mb-2">
          Verified, Compatible, Experimental
        </h2>
        <p className="text-text-muted mb-6">
          We tell you what we&apos;ve actually tested. Four-tier framework, same as the app.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-card bg-elev p-4 border border-border-subtle">
            <p className="font-semibold text-success">✓ Verified</p>
            <p className="text-text-muted text-sm mt-1">Peregrine — tested end-to-end on real hardware.</p>
          </div>
          <div className="rounded-card bg-elev p-4 border border-border-subtle">
            <p className="font-semibold text-accent">◑ Compatible</p>
            <p className="text-text-muted text-sm mt-1">
              Perdix family, Petrel 2 / 3, Teric, Nerd 2, Tern — same protocol, not yet on our test bench.
            </p>
          </div>
          <div className="rounded-card bg-elev p-4 border border-border-subtle">
            <p className="font-semibold text-warning">◌ Experimental</p>
            <p className="text-text-muted text-sm mt-1">
              Other Shearwater models we haven&apos;t catalogued yet. We&apos;ll work through them with you.
            </p>
          </div>
          <div className="rounded-card bg-elev p-4 border border-border-subtle">
            <p className="font-semibold text-text-dim">— Out of scope</p>
            <p className="text-text-muted text-sm mt-1">
              Petrel 1 / Nerd 1 use older Bluetooth Classic — not supported. Subsurface reads them via USB.
            </p>
          </div>
        </div>
      </section>

      {/* Beta form */}
      <section id="beta" className="max-w-prose mx-auto px-4 py-12 border-t border-border-subtle">
        <h2 className="text-2xl font-semibold text-text mb-2">Beta invite</h2>
        <p className="text-text-muted mb-6">
          Closed beta. Drop your email; we&apos;ll reply with a TestFlight or Play Console invite.
        </p>
        <WaitlistForm />
      </section>

      {/* Footer */}
      <footer className="max-w-prose mx-auto px-4 py-8 border-t border-border-subtle text-sm text-text-dim">
        <p>© {new Date().getFullYear()} DiveChef</p>
        <p className="mt-2 space-x-4">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
        </p>
      </footer>
    </main>
  );
}
