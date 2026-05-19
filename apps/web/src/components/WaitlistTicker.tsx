import { prisma } from '@/lib/db';

export const revalidate = 60;

/**
 * Live waitlist counter — server component.
 *
 * Reads the current row count from the Waitlist table at request time
 * (cached for 60s). Renders mono "N testers in queue_" with a blinking
 * caret next to the hero CTA.
 *
 * Returns null silently if the DB read fails — the CTA stays usable.
 */
export async function WaitlistTicker() {
  let count = 0;
  try {
    count = await prisma.waitlist.count();
  } catch {
    return null;
  }

  return (
    <span className="font-mono text-[11px] text-text-dim tracking-[0.08em]">
      {count} {count === 1 ? 'tester' : 'testers'} in queue
      <span
        aria-hidden
        className="text-accent ml-[1px]"
        style={{ animation: 'blink-cursor 1.1s step-end infinite' }}
      >
        _
      </span>
    </span>
  );
}
