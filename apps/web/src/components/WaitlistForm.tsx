'use client';

import { useState } from 'react';

type State =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: 'submitting' });
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, note: note || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message =
          body.error === 'invalid_email'
            ? 'Check your email address and try again.'
            : body.error === 'invalid_note'
              ? 'Your note is too long — keep it under 500 characters.'
              : 'Something went wrong. Please try again.';
        setState({ kind: 'error', message });
        return;
      }
      setState({ kind: 'success' });
    } catch {
      setState({ kind: 'error', message: 'Something went wrong. Please try again.' });
    }
  }

  if (state.kind === 'success') {
    return (
      <div className="rounded-card bg-elev/80 backdrop-blur p-6 text-text border border-accent/20">
        <p className="font-semibold">Thanks — we&apos;ll be in touch.</p>
        <p className="text-text-muted mt-2 text-sm">
          We review the waitlist a few times a week and reply with a TestFlight or Play Console invite.
        </p>
      </div>
    );
  }

  return (
    /* noValidate: JS handler + server-side validation own correctness;
       suppressing the browser's native popovers gives consistent UX
       and lets tests drive malformed input through onSubmit. */
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1 text-text">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-card bg-elev/60 backdrop-blur border border-border-subtle px-4 py-3 text-text placeholder:text-text-dim focus:border-accent focus:outline-none focus:shadow-[0_0_24px_#22d3ee33] transition-shadow"
        />
      </div>
      <div>
        <label htmlFor="note" className="block text-sm font-medium mb-1 text-text">
          Which dive computer do you have? <span className="text-text-dim">(optional)</span>
        </label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. Shearwater Peregrine, recently"
          className="w-full rounded-card bg-elev/60 backdrop-blur border border-border-subtle px-4 py-3 text-text placeholder:text-text-dim focus:border-accent focus:outline-none focus:shadow-[0_0_24px_#22d3ee33] transition-shadow"
        />
      </div>
      {state.kind === 'error' && (
        <p className="text-danger text-sm">{state.message}</p>
      )}
      <button
        type="submit"
        disabled={state.kind === 'submitting'}
        className="rounded-pill px-7 py-[14px] font-bold text-[14px] text-base disabled:opacity-50 transition-all"
        style={{
          background: 'linear-gradient(135deg, #22d3ee 0%, #a5f3fc 100%)',
          color: '#0a1220',
          boxShadow: state.kind === 'submitting' ? 'none' : '0 0 24px #22d3ee44',
        }}
      >
        {state.kind === 'submitting' ? 'Sending…' : 'Request invite'}
      </button>
    </form>
  );
}
