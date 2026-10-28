import { FIRST_YEAR, LAST_YEAR, NOW_YEAR, type Phase, type WindowPoint } from '@/lib/window';

const PHASE: Record<Phase, { fill: string; text: string; short: string }> = {
  'Rebuild': { fill: '#5d6f86', text: '#9fb0c6', short: 'REBUILD' },
  'Mid table': { fill: '#8a8f86', text: '#b3b8ae', short: 'MID TABLE' },
  'Entering window': { fill: '#9ccb84', text: '#9ccb84', short: 'ENTERING' },
  'Prime window': { fill: '#d4a62a', text: '#d4a62a', short: 'PRIME WINDOW' },
  'Closing window': { fill: '#d0583f', text: '#e8806b', short: 'CLOSING' },
};

const W = 500, X0 = 64, X1 = 482, TOP = 26, BOT = 98, H = 118;
const n = LAST_YEAR - FIRST_YEAR;
const step = (X1 - X0) / n;
const xOf = (year: number) => X0 + (year - FIRST_YEAR) * step;
const yOf = (rank: number) => TOP + (rank - 1) * (BOT - TOP) / 9;
const f = (v: number) => v.toFixed(1);

/** Smooth line through points (Catmull-Rom as cubic Béziers). */
function smooth(pts: [number, number][]) {
  if (!pts.length) return '';
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

export function WindowChart({ points }: { points: WindowPoint[] }) {
  if (points.length < 2) return null;
  const past = points.filter((p) => p.year <= NOW_YEAR);
  const fut = points.filter((p) => p.year >= NOW_YEAR);
  const pastXY = past.map((p) => [xOf(p.year), yOf(p.rank)] as [number, number]);
  const futXY = fut.map((p) => [xOf(p.year), yOf(p.rank)] as [number, number]);
  const upper = fut.map((p) => [xOf(p.year), yOf(p.kind === 'proj' ? p.lo : p.rank)] as [number, number]);
  const lower = fut.map((p) => [xOf(p.year), yOf(p.kind === 'proj' ? p.hi : p.rank)] as [number, number]).reverse();
  const fan = futXY.length > 1 ? `${smooth(upper)} L${smooth(lower).slice(1)} Z` : '';
  const area = pastXY.length > 1 ? `${smooth(pastXY)} L${f(pastXY[pastXY.length - 1][0])},${BOT} L${f(pastXY[0][0])},${BOT} Z` : '';

  // Contiguous runs of the same phase become one shaded band.
  const bands: { phase: Phase; from: number; to: number }[] = [];
  for (const p of points) {
    const last = bands[bands.length - 1];
    if (last && last.phase === p.phase) last.to = p.year;
    else bands.push({ phase: p.phase, from: p.year, to: p.year });
  }
  const now = points.find((p) => p.year === NOW_YEAR);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: 'block' }}
      aria-label={`Ladder finishes ${FIRST_YEAR}–${NOW_YEAR} and projected ${NOW_YEAR + 1}–${LAST_YEAR}. Now: ${now?.phase ?? ''}.`}>
      {bands.map((b) => {
        const x = Math.max(X0 - step / 2, xOf(b.from) - step / 2), x2 = Math.min(W - 4, xOf(b.to) + step / 2);
        const c = PHASE[b.phase];
        const label = x2 - x >= (c.short.length * 5.4 + 6) ? c.short : x2 - x >= 40 ? (c.short.includes('TABLE') ? 'MID' : c.short.split(' ')[0]) : '';
        return (
          <g key={`${b.phase}${b.from}`}>
            <rect x={x} y={14} width={x2 - x} height={BOT - 14 + 6} fill={c.fill} fillOpacity={b.from > NOW_YEAR ? 0.11 : 0.18} />
            {label && <text x={(x + x2) / 2} y={10} textAnchor="middle" fill={c.text} fontFamily="var(--mono)" fontSize={8} letterSpacing={0.4}>{label}</text>}
          </g>
        );
      })}
      {[1, 5, 10].map((r) => (
        <g key={r}>
          <line x1={X0 - step / 2} x2={W - 4} y1={yOf(r)} y2={yOf(r)} stroke="#f4f2ea" strokeOpacity={0.08} />
          <text x={X0 - step / 2 - 4} y={yOf(r) + 3} textAnchor="end" fill="#8d978e" fontFamily="var(--mono)" fontSize={9}>{r === 1 ? '1st' : r === 5 ? '5th' : '10th'}</text>
        </g>
      ))}
      <line x1={xOf(NOW_YEAR)} x2={xOf(NOW_YEAR)} y1={14} y2={BOT + 6} stroke="#f4f2ea" strokeOpacity={0.35} strokeDasharray="2 3" />
      {area && <path d={area} fill="#f4f2ea" fillOpacity={0.06} />}
      {fan && <path d={fan} fill="#f4f2ea" fillOpacity={0.1} />}
      <path d={smooth(pastXY)} fill="none" stroke="#f4f2ea" strokeWidth={2.5} strokeLinecap="round" />
      <path d={smooth(futXY)} fill="none" stroke="#f4f2ea" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" strokeOpacity={0.8} />
      {points.map((p) => {
        const x = xOf(p.year), y = yOf(p.rank);
        if (p.flag) return <circle key={p.year} cx={x} cy={y} r={5} fill="#d4a62a" stroke="#151a16" strokeWidth={2}><title>{`${p.year}: premiers`}</title></circle>;
        if (p.kind === 'proj') return <circle key={p.year} cx={x} cy={y} r={3.5} fill="#151a16" stroke="#f4f2ea" strokeWidth={1.5}><title>{`${p.year}: projected ~${Math.round(p.rank)} · core age ${p.coreAge ?? '–'}`}</title></circle>;
        if (p.year === NOW_YEAR) return <g key={p.year}><circle cx={x} cy={y} r={7} fill="none" stroke="#f4f2ea" strokeOpacity={0.35} /><circle cx={x} cy={y} r={4.5} fill="#f4f2ea"><title>{`${p.year}: ${p.rank}`}</title></circle></g>;
        return <circle key={p.year} cx={x} cy={y} r={3.5} fill="#f4f2ea" fillOpacity={p.kind === 'est' ? 0.45 : 1}><title>{`${p.year}: ${p.kind === 'est' ? '~' : ''}${p.rank}`}</title></circle>;
      })}
      {points.map((p) => (
        <text key={p.year} x={xOf(p.year)} y={H - 4} textAnchor="middle" fill={p.year === NOW_YEAR ? '#f4f2ea' : '#8d978e'} fontFamily="var(--mono)" fontSize={9.5}>’{String(p.year).slice(2)}</text>
      ))}
    </svg>
  );
}
