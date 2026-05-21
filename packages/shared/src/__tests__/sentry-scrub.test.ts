import { describe, it, expect } from 'vitest';
import { scrubSensitiveData } from '../sentry-scrub';

describe('scrubSensitiveData', () => {
  it('returns the event unchanged when there is nothing sensitive', () => {
    const event = {
      request: { url: '/api/me', method: 'GET', data: { ok: true } },
    } as any;
    const out = scrubSensitiveData(event);
    expect(out.request.data).toEqual({ ok: true });
  });

  it('removes user.ip_address', () => {
    const event = { user: { id: 'u1', ip_address: '1.2.3.4' } } as any;
    const out = scrubSensitiveData(event);
    expect(out.user.ip_address).toBeUndefined();
    expect(out.user.id).toBe('u1');
  });

  it('removes the x-forwarded-for header', () => {
    const event = {
      request: { headers: { 'x-forwarded-for': '5.6.7.8', 'user-agent': 'jest' } },
    } as any;
    const out = scrubSensitiveData(event);
    expect(out.request.headers['x-forwarded-for']).toBeUndefined();
    expect(out.request.headers['user-agent']).toBe('jest');
  });

  it('scrubs sensitive keys in request.data (case-insensitive)', () => {
    const event = {
      request: {
        data: {
          email: 'a@b.com',
          password: 'hunter2',
          PasswordHash: 'should-also-go',
          token: 'abc',
          authorization: 'Bearer xyz',
          cookie: 'sid=1',
          bytes: 'BASE64BLOB',
          nested: { token: 'inner', other: 'keep' },
        },
      },
    } as any;
    const out = scrubSensitiveData(event);
    expect(out.request.data.password).toBe('[scrubbed]');
    expect(out.request.data.PasswordHash).toBe('[scrubbed]');
    expect(out.request.data.token).toBe('[scrubbed]');
    expect(out.request.data.authorization).toBe('[scrubbed]');
    expect(out.request.data.cookie).toBe('[scrubbed]');
    expect(out.request.data.bytes).toBe('[scrubbed]');
    expect(out.request.data.email).toBe('a@b.com');
    expect(out.request.data.nested.token).toBe('[scrubbed]');
    expect(out.request.data.nested.other).toBe('keep');
  });

  it('scrubs sensitive keys inside arrays', () => {
    const event = {
      request: { data: { items: [{ password: 'a' }, { keep: 'me' }] } },
    } as any;
    const out = scrubSensitiveData(event);
    expect(out.request.data.items[0].password).toBe('[scrubbed]');
    expect(out.request.data.items[1].keep).toBe('me');
  });

  it('handles missing/null fields without crashing', () => {
    expect(scrubSensitiveData({} as any)).toEqual({});
    expect(scrubSensitiveData({ request: undefined } as any)).toEqual({ request: undefined });
    const evt = { request: { data: null } } as any;
    expect(scrubSensitiveData(evt).request.data).toBeNull();
  });

  it('does not mutate the input object', () => {
    const input = {
      request: { data: { password: 'p' } },
      user: { ip_address: '1.1.1.1' },
    } as any;
    scrubSensitiveData(input);
    expect(input.request.data.password).toBe('p');
    expect(input.user.ip_address).toBe('1.1.1.1');
  });
});
