import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'DiveChef terms of service.',
};

export default function TermsPage() {
  return (
    <main className="max-w-prose mx-auto px-4 py-12">
      <Link href="/" className="text-text-muted text-sm">← Home</Link>
      <h1 className="text-3xl font-bold text-text mt-4 mb-2">Terms of service</h1>
      <p className="text-text-dim text-sm mb-8">Last updated: 2026-05-19</p>

      <Section title="What DiveChef is">
        <p className="text-text-muted">
          DiveChef is a dive logging and feedback tool. It reads dive data from
          supported computers over Bluetooth, scores each dive against
          FFESSM/MN90 norms, and surfaces insights about your patterns over
          time.
        </p>
      </Section>

      <Section title="What it isn't">
        <p className="text-text-muted">
          DiveChef is <strong className="text-text">not a dive computer</strong>.
          It does not replace your training, your buddy, your instructor, or
          your dive computer&apos;s alarms. <strong className="text-text">Do not dive based
          on what DiveChef says.</strong> Read your computer; trust your training.
        </p>
      </Section>

      <Section title="Verification tiers">
        <p className="text-text-muted mb-3">
          We use a four-tier framework — same vocabulary as the app — to be
          explicit about what we&apos;ve tested:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-text-muted">
          <li><strong className="text-success">Verified:</strong> tested end-to-end on real hardware. Currently: Peregrine.</li>
          <li><strong className="text-accent">Compatible:</strong> uses the same protocol family, expected to work but not bench-tested. Currently: Perdix family, Petrel 2 / 3, Teric, Nerd 2, Tern.</li>
          <li><strong className="text-warning">Experimental:</strong> other Shearwater models we haven&apos;t catalogued yet.</li>
          <li><strong className="text-text-dim">Out of scope:</strong> Petrel 1 / Nerd 1 (older Bluetooth Classic — not supported).</li>
        </ul>
        <p className="text-text-muted mt-3">
          When you sync from a Compatible or Experimental device, we&apos;ll ask you
          to share how it went. That&apos;s how the framework moves devices toward
          Verified.
        </p>
      </Section>

      <Section title="Beta status">
        <p className="text-text-muted">
          DiveChef v1 is invite-only beta. Things will break. We may delete
          data, change schemas, or push fixes that require you to re-sync. If
          you&apos;re relying on DiveChef for anything important, email us first so
          we can talk you through it.
        </p>
      </Section>

      <Section title="Account suspension">
        <p className="text-text-muted">
          If you use DiveChef abusively (spamming the waitlist, attempting to
          access other users&apos; data, etc.), we&apos;ll close your account. There&apos;s
          no fee during beta — paid tiers may come later, with notice.
        </p>
      </Section>

      <Section title="Liability">
        <p className="text-text-muted">
          To the maximum extent permitted by law, DiveChef has no liability for
          diving incidents, equipment misuse, or decisions made on the basis of
          DiveChef&apos;s output. Diving is inherently risky; DiveChef is a
          retrospective feedback tool and nothing more.
        </p>
      </Section>

      <Section title="Governing law">
        <p className="text-text-muted">
          These terms are governed by French law. Any dispute that can&apos;t be
          resolved by direct discussion goes to French courts.
        </p>
      </Section>

      <Section title="Changes">
        <p className="text-text-muted">
          We&apos;ll update this page when terms change, and email registered users
          if the change is material.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-text mb-3">{title}</h2>
      {children}
    </section>
  );
}
