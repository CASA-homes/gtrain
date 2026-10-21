// Small presentational pieces shared by every page.
import { CLUBS } from '@/lib/clubs';
import { avgColour, C, scale20, scoreColour, type Form, type Line } from '@/lib/ratings';

export function ClubDot({ code, size = 18 }: { code: string | null; size?: number }) {
  const c = code ? CLUBS[code] : null;
  const label = c?.name ?? 'Club not set yet';
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{
        display: 'inline-block', verticalAlign: 'middle', width: size, height: size, borderRadius: '50%', flex: 'none',
        background: c ? `linear-gradient(135deg, ${c.a} 50%, ${c.b} 50%)` : '#d9ddd6',
        boxShadow: 'inset 0 0 0 1px rgb(21 26 22 / .18)',
      }}
    />
  );
}

export function PosDots({ positions }: { positions: Line[] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: '500 11px var(--mono)', whiteSpace: 'nowrap' }}>
      {positions.map((p) => <span key={p} className="dot" style={{ width: 7, height: 7, background: C[p] }} />)}
      {positions.join('/')}
    </span>
  );
}

export function AvgChip({ value }: { value: number | null }) {
  const [bg, fg] = avgColour(value);
  return <span className="chip num" style={{ background: bg, color: fg }}>{value == null ? '–' : value.toFixed(1)}</span>;
}

export function ScoreChip({ value }: { value: number | null }) {
  const [bg, fg] = scoreColour(value);
  return <span className="score" style={{ background: bg, color: fg }}>{value ?? '–'}</span>;
}

export function FormArrow({ form }: { form: Form }) {
  if (!form) return <span className="muted" aria-label="No recent form">–</span>;
  const map = { up: ['rotate(-45 10 10)', C.green5, 'Form rising'], down: ['rotate(45 10 10)', '#c0392b', 'Form falling'], flat: ['', '#b08a12', 'Form steady'] } as const;
  const [rot, col, label] = map[form];
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" role="img" aria-label={label}>
      <g transform={rot}>
        <path d="M4 10 H15 M11 6 L15 10 L11 14" fill="none" stroke={col} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export function Stars({ value, colour = C.ink, label }: { value: number | null; colour?: string; label: string }) {
  if (value == null) return <span className="muted" title="Needs age data from the stats feed">–</span>;
  return (
    <span className="stars" role="img" aria-label={`${label} ${value} of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const full = value >= i + 1, half = !full && value >= i + 0.5;
        return (
          <span key={i} style={full ? { color: colour } : half
            ? { background: `linear-gradient(90deg, ${colour} 50%, #d9ddd6 50%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
            : { color: '#d9ddd6' }}>★</span>
        );
      })}
    </span>
  );
}

export function Bar20({ value, height = 10, label }: { value: number; height?: number; label: string }) {
  return (
    <div className="bars" role="img" aria-label={`${label} ${value} of 20`}>
      {Array.from({ length: 20 }, (_, i) => (
        <span key={i} style={{ height, background: i < value ? scale20(value) : C.empty }} />
      ))}
    </div>
  );
}

/** League rank as a 10-segment bar: 1st fills all 10, 6th shows 4, last shows 1. */
export const RANK_BARS = [10, 9, 8, 7, 5, 4, 3, 2, 1, 1];
export function RankBar({ rank, height = 10, label }: { rank: number; height?: number; label: string }) {
  const n = RANK_BARS[Math.min(Math.max(rank, 1), 10) - 1];
  const colour = n >= 8 ? C.green5 : n >= 6 ? C.green4 : n >= 4 ? C.green3 : n >= 2 ? C.green2 : C.yellow;
  return (
    <div className="bars" role="img" aria-label={`${label}: ranked ${rank} of 10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} style={{ height, background: i < n ? colour : C.empty }} />
      ))}
    </div>
  );
}

export function Cup({ size = 26, year }: { size?: number; year?: number }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }} title={year ? `Premiers ${year}` : 'Premiership'}>
      <svg width={size} height={size * 1.08} viewBox="0 0 26 28" role="img" aria-label={year ? `Premiers ${year}` : 'Premiership'}>
        <path d="M7 2 H19 V9 C19 13 16.5 16 13 16 C9.5 16 7 13 7 9 Z" fill="#d4a62a" />
        <path d="M7 4 H3.5 C3.5 8 5 10 7.5 10.5 M19 4 H22.5 C22.5 8 21 10 18.5 10.5" fill="none" stroke="#d4a62a" strokeWidth="1.8" />
        <rect x="11.5" y="16" width="3" height="5" fill="#b8891b" />
        <rect x="7.5" y="21" width="11" height="4" rx="1" fill="#b8891b" />
        <path d="M10 5 V10" stroke="#f3d77a" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {year && <span style={{ font: '500 9px var(--mono)', color: '#8a6a12' }}>{year}</span>}
    </span>
  );
}

export function StepBar({ steps, active, colours }: { steps: { name: string; sub?: string }[]; active: number; colours: string[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 4 }}>
      {steps.map((s, i) => (
        <div key={s.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ height: 6, borderRadius: 3, background: i === active ? colours[i] : C.empty }} />
          <span style={{ fontSize: 11, lineHeight: 1.25, ...(i === active ? { fontWeight: 600 } : { color: C.muted }) }}>{s.name}</span>
          {s.sub && <span className="mono muted" style={{ fontSize: 10 }}>{s.sub}</span>}
        </div>
      ))}
    </div>
  );
}

export function TeamBadge({ code, size = 52, dark = true }: { code: string; size?: number; dark?: boolean }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.27, flex: 'none',
      background: dark ? 'var(--ink)' : 'var(--cream)', color: dark ? 'var(--bg)' : 'var(--ink)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 ${Math.round(size * 0.34)}px var(--font)`, letterSpacing: '-.02em',
    }}>{code}</div>
  );
}
