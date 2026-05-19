type Props = {
  children: React.ReactNode;
  /** When true, render a glowing cyan dot to the left. */
  withDot?: boolean;
  className?: string;
};

/**
 * Mono uppercase eyebrow text. Used above headlines + section titles.
 * The optional dot signals "live" / "active" content (used in the hero).
 */
export function Eyebrow({ children, withDot = false, className = '' }: Props) {
  return (
    <p
      className={`font-mono text-[11px] tracking-[0.22em] uppercase text-accent inline-flex items-center gap-2 ${className}`}
    >
      {withDot && (
        <span
          aria-hidden
          className="inline-block w-[6px] h-[6px] rounded-full bg-accent shadow-[0_0_8px_#22d3ee]"
        />
      )}
      {children}
    </p>
  );
}
