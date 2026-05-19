import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    waitlist: {
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { POST } from '../route';

// Cast to access mock helpers
const mockUpsert = prisma.waitlist.upsert as ReturnType<typeof vi.fn>;

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/waitlist', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/waitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({
      id: 'w1',
      email: 'a@b.com',
      note: null,
      createdAt: new Date(),
    });
  });

  it('accepts a valid email and returns 200 with the row', async () => {
    const res = await POST(makeReq({ email: 'a@b.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.email).toBe('a@b.com');
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { email: 'a@b.com' },
      create: { email: 'a@b.com', note: null },
      update: {},
    });
  });

  it('passes the optional note through', async () => {
    await POST(makeReq({ email: 'a@b.com', note: 'I have a Peregrine' }));
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { email: 'a@b.com' },
      create: { email: 'a@b.com', note: 'I have a Peregrine' },
      update: {},
    });
  });

  it('lowercases and trims the email', async () => {
    await POST(makeReq({ email: '  Foo@Example.COM  ' }));
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { email: 'foo@example.com' },
      create: { email: 'foo@example.com', note: null },
      update: {},
    });
  });

  it('returns 400 on missing email', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_email');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed email', async () => {
    const res = await POST(makeReq({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_email');
  });

  it('returns 400 when email exceeds 320 characters', async () => {
    const longEmail = 'a'.repeat(315) + '@b.com'; // 321 chars — exceeds 320
    const res = await POST(makeReq({ email: longEmail }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when note exceeds 500 characters', async () => {
    const res = await POST(makeReq({ email: 'a@b.com', note: 'x'.repeat(501) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_note');
  });

  it('idempotent: a second POST with the same email returns 200, no new row', async () => {
    await POST(makeReq({ email: 'a@b.com' }));
    await POST(makeReq({ email: 'a@b.com' }));
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it('returns 500 on a DB error', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('db down'));
    const res = await POST(makeReq({ email: 'a@b.com' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('internal');
  });
});
