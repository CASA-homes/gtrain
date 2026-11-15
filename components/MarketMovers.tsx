// League page: weekly risers and fallers in market value, like a stock report. Value is the contract market rate
// (rolling six-game average turned into $k), so "this week" is the move from the previous round to the latest one.
import Link from 'next/link';
import { ClubDot } from '@/components/bits';
import { valueTrend } from '@/lib/contracts';
import { getLeague } from '@/lib/data';
import type { PlayerRow } from '@/lib/ratings';

type Mover = { p: PlayerRow; now: number; prev: number; diff: number; pct: number; spark: number[]; owner: string | null };

function Spark({ v, up }: { v: number[]; up: boolean }) {
  const lo = Math.min(...v), hi = Math.max(...v);
  const pts = v.map((x, i) => [(i / (v.length - 1)) * 62 + 1, 23 - ((x - lo) / (hi - lo || 1)) * 20] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `1,24 ${line} 63,24`;
  const col = up ? '#2e8a55' : '#c2462a';
  return (
    <svg viewBox="0 0 64 24" width="64" height="24" aria-hidden="true" className="mm-spark">
      <polygon points={area} fill={col} opacity=".12" />
      <polyline points={line} fill="none" stroke={col} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={col} />
    </svg>
  );
}

export async function MarketMovers() {
  const league = await getLeague();
  const team = new Map(league.teams.map((t) => [t.id, t.short_code]));
  const movers: Mover[] = [];
  for (const p of [...league.players, ...league.freeAgents]) {
    if ((p.games ?? 0) < 5) continue;
    const full = valueTrend(p, 999);
    if (full.length < 3) continue;
    const now = full[full.length - 1], prev = full[full.length - 2];
    if (prev < 6) continue;
    movers.push({ p, now, prev, diff: now - prev, pct: (now - prev) / prev, spark: full.slice(-8), owner: p.team_id ? team.get(p.team_id) ?? null : null });
  }
  const risers = movers.filter((m) => m.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 5);
  const fallers = movers.filter((m) => m.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 5);
  if (!risers.length && !fallers.length) return null;
  const up = movers.filter((m) => m.diff > 0).length, dn = movers.filter((m) => m.diff < 0).length;

  const List = ({ title, rows, rise }: { title: string; rows: Mover[]; rise: boolean }) => (
    <div className="mm-col">
      <h3 className={rise ? 'up' : 'dn'}>{rise ? '▲' : '▼'} {title}</h3>
      {rows.map((m) => (
        <Link key={m.p.id} href={`/players/${m.p.id}`} className="mm-row">
          <span className="mm-who"><b>{m.p.name}</b><span><ClubDot code={m.p.afl_club} size={12} />{m.p.positions.join('/')} · {m.owner ?? 'FA'}</span></span>
          <Spark v={m.spark} up={rise} />
          <span className="mm-num"><b>${Math.round(m.now)}k</b><em className={rise ? 'up' : 'dn'}>{rise ? '+' : '−'}{Math.abs(Math.round(m.pct * 100))}%</em></span>
        </Link>
      ))}
    </div>
  );

  return (
    <section className="mm card" aria-labelledby="mm-h">
      <div className="mm-head">
        <div><span className="mm-eyebrow">Market report · last round</span><h2 id="mm-h">Risers &amp; fallers</h2></div>
        <span className="mm-breadth"><b className="up">▲ {up}</b><b className="dn">▼ {dn}</b></span>
      </div>
      <div className="mm-grid">
        <List title="Top risers" rows={risers} rise />
        <List title="Top fallers" rows={fallers} rise={false} />
      </div>
      <p className="mm-foot">Market value = contract rate from a rolling six-game average. Tap a player for his profile.</p>
    </section>
  );
}
