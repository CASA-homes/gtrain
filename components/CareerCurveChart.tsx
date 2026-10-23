import { CURVE_FROM, CURVE_TO, type CareerCurve, type CurvePoint } from '@/lib/careercurve';

const W = 640, H = 270, L = 40, R = 14, T = 16, B = 34;

/** Career line chart: his seasons (solid), most likely path to 32 (dashed) inside a range of outcomes, similar players (grey). */
export function CareerCurveChart({ c, lineName, name }: { c: CareerCurve; lineName: string; name: string }) {
  const pts = [...c.actual, ...c.projected, ...c.similar, ...c.cone.map((k) => ({ age: k.age, avg: k.hi })), ...c.cone.map((k) => ({ age: k.age, avg: k.lo }))];
  if (!c.actual.length) return <p className="muted" style={{ fontSize: 13, margin: 0 }}>No AFL seasons with five or more games yet, so there’s no career line to draw.</p>;
  const lo = Math.max(0, Math.floor((Math.min(...pts.map((p) => p.avg)) - 6) / 10) * 10);
  const hi = Math.ceil((Math.max(...pts.map((p) => p.avg)) + 6) / 10) * 10;
  const toAge = c.toAge;
  const x = (age: number) => L + ((age - CURVE_FROM) / (toAge - CURVE_FROM)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (xs: CurvePoint[]) => xs.map((p, i) => `${i ? 'L' : 'M'}${x(p.age).toFixed(1)},${y(p.avg).toFixed(1)}`).join(' ');
  const yTicks: number[] = [];
  for (let v = lo; v <= hi; v += hi - lo > 60 ? 20 : 10) yTicks.push(v);
  const xTicks: number[] = [];
  for (let a = CURVE_FROM; a <= toAge; a += 2) xTicks.push(a);
  const peakProj = c.projected.slice(1).reduce<CurvePoint | null>((m, p) => (!m || p.avg > m.avg ? p : m), null);
  const cone = c.cone.length > 1 ? c.cone : [];
  const conePath = cone.length
    ? `${cone.map((k, i) => `${i ? 'L' : 'M'}${x(k.age).toFixed(1)},${y(k.hi).toFixed(1)}`).join(' ')} ${[...cone].reverse().map((k) => `L${x(k.age).toFixed(1)},${y(k.lo).toFixed(1)}`).join(' ')} Z`
    : '';
  const bestCase = cone.reduce<{ age: number; hi: number } | null>((m, k) => (!m || k.hi > m.hi ? k : m), null);
  const lowAt = (bestCase && cone.find((k) => k.age === bestCase.age)) ?? cone[cone.length - 1];

  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${name}'s AFL Fantasy average by age, with a projection to ${CURVE_TO} and the path of similar ${lineName}s`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {c.prime && (
          <g>
            <rect x={x(c.prime[0] - 0.5)} y={T} width={x(c.prime[1] + 0.5) - x(c.prime[0] - 0.5)} height={H - T - B} fill="#1f6b3a" opacity=".07" />
            <text x={(x(c.prime[0] - 0.5) + x(c.prime[1] + 0.5)) / 2} y={H - B - 6} textAnchor="middle" style={{ font: '600 10px var(--mono)', fill: '#1f6b3a', letterSpacing: '.08em' }}>PRIME</text>
          </g>
        )}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={L - 6} y={y(v) + 3.5} textAnchor="end" style={{ font: '10px var(--mono)', fill: 'var(--muted)' }}>{v}</text>
          </g>
        ))}
        {xTicks.map((a) => (
          <text key={a} x={x(a)} y={H - B + 16} textAnchor="middle" style={{ font: '10px var(--mono)', fill: 'var(--muted)' }}>{a}</text>
        ))}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" style={{ font: '10px var(--mono)', fill: 'var(--muted)' }}>AGE</text>
        {c.nowAge != null && c.nowAge >= CURVE_FROM && c.nowAge <= toAge && (
          <g>
            <line x1={x(c.nowAge)} x2={x(c.nowAge)} y1={T} y2={H - B} stroke="var(--muted)" strokeDasharray="2 3" opacity=".6" />
            <text x={c.nowAge >= toAge - 1 ? x(c.nowAge) - 4 : x(c.nowAge) + 4} y={H - B - 6} textAnchor={c.nowAge >= toAge - 1 ? 'end' : 'start'} style={{ font: '10px var(--mono)', fill: 'var(--muted)' }}>now</text>
          </g>
        )}
        {c.similar.length > 1 && <path d={path(c.similar)} fill="none" stroke="#9aa39b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />}
        {conePath && (
          <g>
            <path d={conePath} fill="#1f6b3a" opacity=".12" />
            <path d={cone.map((k, i) => `${i ? 'L' : 'M'}${x(k.age).toFixed(1)},${y(k.hi).toFixed(1)}`).join(' ')} fill="none" stroke="#1f6b3a" strokeWidth="1" strokeDasharray="2 4" opacity=".7" />
            <path d={cone.map((k, i) => `${i ? 'L' : 'M'}${x(k.age).toFixed(1)},${y(k.lo).toFixed(1)}`).join(' ')} fill="none" stroke="#1f6b3a" strokeWidth="1" strokeDasharray="2 4" opacity=".7" />
            {bestCase && bestCase.hi > (peakProj?.avg ?? 0) + 2 && <text x={x(bestCase.age)} y={y(bestCase.hi) - 7} textAnchor="middle" style={{ font: '600 10px var(--mono)', fill: '#1f6b3a' }}>best case {Math.round(bestCase.hi)}</text>}
            {lowAt && lowAt.lo < (peakProj?.avg ?? 999) - 2 && <text x={x(lowAt.age)} y={y(lowAt.lo) + 14} textAnchor="middle" style={{ font: '10px var(--mono)', fill: '#1f6b3a' }}>low end {Math.round(lowAt.lo)}</text>}
          </g>
        )}
        {c.projected.length > 1 && <path d={path(c.projected)} fill="none" stroke="#1f6b3a" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" />}
        <path d={path(c.actual)} fill="none" stroke="#1f6b3a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {c.actual.map((p) => (
          <g key={p.age}>
            <circle cx={x(p.age)} cy={y(p.avg)} r="4" fill="#1f6b3a" stroke="var(--bg, #fff)" strokeWidth="1.5"><title>{`${p.year}, age ${p.age}: ${p.avg} from ${p.games} games`}</title></circle>
          </g>
        ))}
        {c.projected.slice(1).map((p) => (
          <circle key={p.age} cx={x(p.age)} cy={y(p.avg)} r="2.5" fill="var(--bg, #fff)" stroke="#1f6b3a" strokeWidth="1.5"><title>{`Projected at ${p.age}: ${Math.round(p.avg)}`}</title></circle>
        ))}
        {peakProj && <text x={x(peakProj.age)} y={y(peakProj.avg) - 9 < T + 22 ? y(peakProj.avg) + 18 : y(peakProj.avg) - 9} textAnchor="middle" style={{ font: '600 10px var(--mono)', fill: '#1f6b3a' }}>{Math.round(peakProj.avg)}</text>}
      </svg>
      <figcaption style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12 }} className="muted">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke="#1f6b3a" strokeWidth="3" /></svg>{name}</span>
{c.projected.length > 1 && (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke="#1f6b3a" strokeWidth="2.5" strokeDasharray="6 5" /></svg>Most likely, to {CURVE_TO}</span>)}
        {cone.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg width="22" height="10" aria-hidden="true"><rect width="22" height="10" rx="2" fill="#1f6b3a" opacity=".15" /></svg>Range: low end to best case</span>}
        {c.similar.length > 1 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke="#9aa39b" strokeWidth="2.5" /></svg>Typical path for {lineName}s like him{c.similarCount ? ` (${c.similarCount} close matches)` : ''}</span>}
      </figcaption>
    </figure>
  );
}
