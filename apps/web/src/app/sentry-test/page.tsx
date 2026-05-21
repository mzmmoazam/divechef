'use client';

/**
 * Temporary verification page for the Sentry round-trip.
 *
 * The button throws an error from real bundled app code (not the devtools
 * console), which produces a stack trace pointing at a `_next/static/chunks/…`
 * source. That stack does NOT match Sentry's "browser extension" heuristic,
 * so the inbound filter accepts it and the event shows up in Issues.
 *
 * Delete this page once Sentry is verified.
 */
export default function SentryTestPage() {
  return (
    <main className="max-w-prose mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-text mb-4">Sentry verify</h1>
      <p className="text-text-muted mb-8">
        Click the button to throw a test error from real bundled app code.
        It should appear in https://divechef.sentry.io/issues/ within ~30s.
      </p>
      <button
        type="button"
        className="rounded-pill px-6 py-3 font-bold text-base"
        style={{
          background: 'linear-gradient(135deg, #22d3ee 0%, #a5f3fc 100%)',
          color: '#0a1220',
        }}
        onClick={() => {
          throw new Error('sentry-verify-' + Date.now());
        }}
      >
        Throw test error
      </button>
    </main>
  );
}
