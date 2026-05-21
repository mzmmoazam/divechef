import type { ErrorEvent, EventHint } from '@sentry/core';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'authorization',
  'cookie',
  'bytes',
]);

function scrubObject(obj: unknown): unknown {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(scrubObject);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[scrubbed]' : scrubObject(v);
  }
  return out;
}

/**
 * Strip IP addresses and sensitive request-body keys before Sentry sends an event.
 * Returns a new object — does not mutate the input.
 *
 * Used by all Sentry runtimes (web server, web client, web edge, mobile).
 * Single source of truth for what we consider sensitive.
 */
export function scrubSensitiveData<T extends ErrorEvent>(event: T, _hint?: EventHint): T {
  const next: T = { ...event };

  if (next.user) {
    next.user = { ...next.user };
    delete next.user.ip_address;
  }

  if (next.request) {
    next.request = { ...next.request };
    if (next.request.headers) {
      const headers = { ...next.request.headers };
      delete headers['x-forwarded-for'];
      next.request.headers = headers;
    }
    if (next.request.data !== undefined) {
      next.request.data = scrubObject(next.request.data);
    }
  }

  return next;
}
