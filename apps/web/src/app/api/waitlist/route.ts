import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 320;
const MAX_NOTE_LEN = 500;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const raw = body as { email?: unknown; note?: unknown };
  const emailRaw = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';

  if (!emailRaw || emailRaw.length > MAX_EMAIL_LEN || !EMAIL_RE.test(emailRaw)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  let note: string | null = null;
  if (raw.note !== undefined && raw.note !== null) {
    if (typeof raw.note !== 'string' || raw.note.length > MAX_NOTE_LEN) {
      return NextResponse.json({ error: 'invalid_note' }, { status: 400 });
    }
    note = raw.note.trim() || null;
  }

  try {
    const row = await prisma.waitlist.upsert({
      where: { email: emailRaw },
      create: { email: emailRaw, note },
      update: {},
    });
    return NextResponse.json({ ok: true, email: row.email }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
