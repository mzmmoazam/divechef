/**
 * Signature visual for the landing hero. Server component, pure SVG.
 *
 * Renders a stylized dive log: title row, three numeric stats, depth
 * profile chart with a pulsing max-depth marker, and a CLARITY score
 * pill. Static sample data — this is decorative, not live.
 */
export function HeroVisual() {
  return (
    <div
      role="img"
      aria-label="Sample dive: 28 metres max depth, 42 minute duration, water 14.7°C, clarity score 87 of 100"
      className="relative w-full"
    >
      <div className="relative rounded-hero p-[22px] bg-gradient-to-b from-elev to-base border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur">
        {/* gradient border glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-hero"
          style={{
            padding: '1px',
            background:
              'linear-gradient(135deg, rgba(34,211,238,0.27) 0%, transparent 30%, transparent 70%, rgba(34,211,238,0.13) 100%)',
            WebkitMask:
              'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />

        {/* head row */}
        <div className="flex justify-between items-baseline font-mono text-[10px] tracking-[0.12em] uppercase text-text-dim mb-[14px]">
          <span>DIVE_0072 · LE FRIOUL</span>
          <span className="inline-flex items-center gap-[5px] text-accent">
            <span
              aria-hidden
              className="inline-block w-[5px] h-[5px] rounded-full bg-accent"
              style={{ animation: 'dot-pulse 1.4s ease-in-out infinite' }}
            />
            LIVE
          </span>
        </div>

        {/* stats grid */}
        <div className="grid grid-cols-3 gap-1 mb-[14px]">
          <Stat num="28" unit="m" label="max depth" />
          <Stat num="42" unit="min" label="duration" />
          <Stat num="14.7" unit="°" label="water" />
        </div>

        {/* depth profile SVG */}
        <svg
          aria-hidden
          viewBox="0 0 240 110"
          preserveAspectRatio="none"
          className="block w-full h-[110px]"
        >
          <defs>
            <linearGradient id="hero-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="hero-line" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#a5f3fc" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.4" />
            </linearGradient>
          </defs>
          <line x1="0" y1="25" x2="240" y2="25" stroke="rgba(255,255,255,0.03)" />
          <line x1="0" y1="55" x2="240" y2="55" stroke="rgba(255,255,255,0.03)" />
          <line x1="0" y1="85" x2="240" y2="85" stroke="rgba(255,255,255,0.03)" />
          <path
            d="M0,5 L18,18 L36,42 L60,72 L88,86 L120,90 L150,82 L172,68 L198,48 L218,28 L240,12 L240,110 L0,110 Z"
            fill="url(#hero-area)"
          />
          <path
            d="M0,5 L18,18 L36,42 L60,72 L88,86 L120,90 L150,82 L172,68 L198,48 L218,28 L240,12"
            fill="none"
            stroke="url(#hero-line)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx="120" cy="90" r="3.5" fill="#22d3ee">
            <animate attributeName="r" values="3.5;5;3.5" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.6;1" dur="2.4s" repeatCount="indefinite" />
          </circle>
        </svg>

        {/* foot row */}
        <div className="mt-[10px] flex justify-between font-mono text-[9px] text-text-dim">
          <span>00:00</span>
          <span className="text-accent font-bold tracking-[0.1em]">CLARITY 87/100</span>
          <span>42:14</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ num, unit, label }: { num: string; unit: string; label: string }) {
  return (
    <div>
      <div
        className="font-mono text-[22px] text-text font-semibold tracking-[-0.02em]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {num}
        <small className="text-text-dim text-[12px] font-normal">{unit}</small>
      </div>
      <div className="font-mono text-[9px] tracking-[0.12em] text-text-dim uppercase">{label}</div>
    </div>
  );
}
