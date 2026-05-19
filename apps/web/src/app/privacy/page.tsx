import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'How DiveChef handles your data.',
};

export default function PrivacyPage() {
  return (
    <main className="max-w-prose mx-auto px-4 py-12">
      <Link href="/" className="text-text-muted text-sm">← Home</Link>
      <h1 className="text-3xl font-bold text-text mt-4 mb-2">Privacy policy</h1>
      <p className="text-text-dim text-sm mb-8">Last updated: 2026-05-19</p>

      <Section title="What we collect">
        <ul className="list-disc pl-6 space-y-2 text-text-muted">
          <li><strong className="text-text">Waitlist:</strong> your email address, the optional note you submit (e.g. which dive computer you own), and the timestamp.</li>
          <li><strong className="text-text">Account:</strong> your email, a bcrypt-hashed password, your display name, your certification level (<em>niveau</em>), and your preferred locale.</li>
          <li><strong className="text-text">Devices:</strong> for each dive computer you register — the model name, the serial number (the canonical hex-encoded RDBI bytes the device reports), the friendly name you chose, the BLE-advertised name we observed during scan, the firmware version we read, the registration timestamp, and the time of your last successful sync.</li>
          <li><strong className="text-text">Dives:</strong> max depth, average depth, duration, samples (depth-over-time pairs), max ascent rate, water temperature, and the dive computer&apos;s internal external-id used for deduplication.</li>
          <li><strong className="text-text">Crash reports (Sentry):</strong> error types, stack traces, request URL/method/status. <strong>Your IP address and any sensitive request payloads (passwords, tokens, dive-data binary) are scrubbed before the report is sent.</strong></li>
        </ul>
      </Section>

      <Section title="What we don't collect">
        <ul className="list-disc pl-6 space-y-2 text-text-muted">
          <li>Location coordinates.</li>
          <li>Advertising identifiers.</li>
          <li>Browser cookies.</li>
          <li>Third-party analytics. The landing page is cookie-free.</li>
          <li>Cross-site tracking of any kind.</li>
        </ul>
      </Section>

      <Section title="How we use it">
        <p className="text-text-muted">
          We use what you give us to sync your dives to your account, score them
          against FFESSM/MN90 norms, surface trends, send beta invites, and
          debug crashes. Nothing else. We do not sell, share, or rent your data
          to anyone.
        </p>
      </Section>

      <Section title="Where it lives">
        <p className="text-text-muted">
          Postgres database hosted on Neon, region <code className="text-text">fra1</code> (Frankfurt, EU).
          Crash reports go to Sentry&apos;s standard EU project. Backups are handled
          by the hosting providers&apos; defaults.
        </p>
      </Section>

      <Section title="Your rights (GDPR)">
        <ul className="list-disc pl-6 space-y-2 text-text-muted">
          <li><strong className="text-text">Access / export:</strong> email <a href="mailto:support@divechef.com">support@divechef.com</a> for v1; we&apos;ll send your data within 30 days. A self-service export is on the roadmap.</li>
          <li><strong className="text-text">Delete:</strong> use the in-app account-deletion flow. It cascades to your dives and devices. To remove yourself from the waitlist before signing up, email support.</li>
          <li><strong className="text-text">Correct:</strong> change your email, display name, and certification level via the in-app profile.</li>
        </ul>
      </Section>

      <Section title="Children">
        <p className="text-text-muted">
          DiveChef is intended for users aged 16 or older. We don&apos;t knowingly
          collect data from anyone younger.
        </p>
      </Section>

      <Section title="Contact">
        <p className="text-text-muted">
          Questions or requests: <a href="mailto:support@divechef.com">support@divechef.com</a>.
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
