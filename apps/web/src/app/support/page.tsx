import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Get help with DiveChef.',
};

export default function SupportPage() {
  return (
    <main className="max-w-prose mx-auto px-4 py-12">
      <Link href="/" className="text-text-muted text-sm">← Home</Link>
      <h1 className="text-3xl font-bold text-text mt-4 mb-2">Support</h1>
      <p className="text-text-dim text-sm mb-8">We reply within a few days during beta.</p>

      <p className="text-text-muted mb-8">
        Email us at{' '}
        <a href="mailto:support@divechef.com">support@divechef.com</a> with
        what happened, what you expected, and (if it&apos;s a sync issue) the model
        of your dive computer.
      </p>

      <h2 className="text-xl font-semibold text-text mb-4">Frequently asked</h2>

      <Faq q="How do I add my dive computer?">
        <p>
          Open DiveChef, go to <em>Sync</em>, tap <em>Add a dive computer</em>,
          pick your model, and the app will scan over Bluetooth. Make sure
          your dive computer is awake and Bluetooth is on.
        </p>
      </Faq>

      <Faq q="What if my model isn't listed?">
        <p>
          On the picker screen, tap <em>Don&apos;t see your computer?</em> for
          guidance. Petrel 1 and Nerd 1 use older Bluetooth Classic and aren&apos;t
          supported — Subsurface reads them via USB. For other Shearwater
          models we haven&apos;t catalogued yet, email us and we&apos;ll work through
          it together.
        </p>
      </Faq>

      <Faq q="I lost my dives — what now?">
        <p>
          If a sync looked successful but a dive isn&apos;t in your list, email us
          with the date / time of the dive and your dive computer&apos;s serial
          number (visible in the app under <em>Profile &rarr; Your dive
          computers</em>). We&apos;ll trace it.
        </p>
      </Faq>

      <Faq q="How do I delete my account?">
        <p>
          In the app: <em>Profile &rarr; Delete account</em>. This removes your
          dives, devices, and account record. To remove a waitlist signup
          before you&apos;ve created an account, email us.
        </p>
      </Faq>
    </main>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="mb-3 rounded-card bg-elev border border-border-subtle p-4">
      <summary className="font-semibold text-text cursor-pointer">{q}</summary>
      <div className="text-text-muted mt-3">{children}</div>
    </details>
  );
}
