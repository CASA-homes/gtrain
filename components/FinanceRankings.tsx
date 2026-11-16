// Rankings › Financials: each club's salary this season and next against the caps, its KT bank and growth,
// and how far out its contracts run.
import Link from 'next/link';
import { getContracts } from '@/lib/contracts';
import { C } from '@/lib/ratings';
import { createClient } from '@/lib/supabase/server';

const ORANGE = '#f0a35a';
/** Salary colour: dark green under $700k, then mid green, light green, yellow, orange, red over $1m. */
const salColour = (k: number) => (k < 700 ? C.green5 : k < 800 ? C.green4 : k < 900 ? C.green3 : k < 950 ? C.yellow : k <= 1000 ? ORANGE : '#d9534f');

function SalaryBars({ k, keeperCap, label }: { k: number; keeperCap: number; label: string }) {
  const hard = Math.min(12, Math.ceil(Math.max(0, k) / 100));
  const colour = salColour(k);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div className="bars" role="img" aria-label={`${label}: $${k}k of $${keeperCap}k`} style={{ alignSelf: 'flex-start' }}>
        {Array.from({ length: 12 }, (_, i) => <span key={i} style={{ height: 8, flex: '0 0 7px', background: i < hard ? colour : C.empty, marginLeft: i === 10 ? 3 : 0 }} />)}
      </div>
      <span className="mono muted" style={{ fontSize: 10 }}>${k.toLocaleString('en-AU')}k{k > keeperCap ? ` · $${k - keeperCap}k over` : ` · $${keeperCap - k}k room`}</span>
    </div>
  );
}

/** Soft cap: the room above the keeper cap a club can run in season, 3 blocks. */
function SoftBar({ k, keeperCap, seasonCap }: { k: number; keeperCap: number; seasonCap: number }) {
  const range = Math.max(1, seasonCap - keeperCap);
  const over = Math.min(range, Math.max(0, k - keeperCap));
  const n = Math.min(3, Math.ceil((over / range) * 3));
  const colour = n >= 3 ? '#d9534f' : n === 2 ? ORANGE : C.yellow;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div className="bars" role="img" aria-label={`Soft cap: $${over}k of $${range}k used`} style={{ alignSelf: 'flex-start' }}>
        {Array.from({ length: 3 }, (_, i) => <span key={i} style={{ height: 8, flex: '0 0 16px', background: i < n ? colour : C.empty }} />)}
      </div>
      <span className="mono muted" style={{ fontSize: 10 }}>${over}k of ${range}k</span>
    </div>
  );
}

function Spark({ points }: { points: number[] }) {
  const w = 110, h = 28;
  if (points.length < 2) return <svg width={w} height={h} aria-hidden="true"><line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke={C.green4} strokeWidth="2" /></svg>;
  const min = Math.min(...points), max = Math.max(...points), span = Math.max(1, max - min);
  const xy = points.map((v, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`);
  const up = points[points.length - 1] >= points[0];
  return (
    <svg width={w} height={h} role="img" aria-label={`KT ${up ? 'up' : 'down'} from ${points[0]} to ${points[points.length - 1]}`}>
      <polyline points={xy.join(' ')} fill="none" stroke={up ? C.green4 : '#d9534f'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export async function FinanceRankings({ tabs }: { tabs: React.ReactNode }) {
  const d = await getContracts();
  const s = d.settings;
  const supabase = await createClient();
  const since = new Date(); since.setFullYear(since.getFullYear() - 2);
  const { data: led } = await supabase.from('kc_ledger').select('team_id, delta, created_at').gte('created_at', since.toISOString()).order('created_at').order('id');
  const season = s?.season ?? new Date().getFullYear();
  const keeperCap = s?.keeper_cap_k ?? 1000, seasonCap = s?.season_cap_k ?? 1250;

  const clubs = [...d.clubs.values()].filter((c) => d.banks.has(c.team.id));
  const rows = clubs.map((c) => {
    // KT growth: running balance over the last two seasons.
    const mine = (led ?? []).filter((l) => l.team_id === c.team.id);
    const before = c.bank - mine.reduce((t, l) => t + l.delta, 0);
    let run = before; const pts = [before, ...mine.map((l) => (run += l.delta))];
    // Contract length: longest deal per player (including extensions), counted from this season.
    const ends = new Map<number, number>();
    for (const x of [...d.active, ...d.pending]) if (x.team_id === c.team.id) ends.set(x.player_id, Math.max(ends.get(x.player_id) ?? 0, x.end_season));
    const yrs = [...ends.values()].map((e) => e - season + 1);
    const plus = [1, 2, 3, 4, 5].map((n) => yrs.filter((y) => y >= n).length);
    return { c, pts, plus };
  }).sort((a, b) => b.c.bank - a.c.bank);

  return (
    <div className="wrap">
      <div className="row-between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="eyebrow">Salary against the caps, KT in the bank, and how far out each club is signed</span>
          <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Financials</h1>
        </div>
        {tabs}
      </div>
      <div className="table-box">
        <table className="squad" style={{ minWidth: 1120 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th><th>Team</th><th style={{ width: 150 }}>{season} salary</th><th style={{ width: 100 }}>{season} soft cap</th><th style={{ width: 150 }}>{season + 1} salary</th>
              <th style={{ textAlign: 'right', width: 90 }}>KT bank</th><th style={{ width: 130 }}>KT, last 2 seasons</th>
              {[1, 2, 3, 4, 5].map((n) => <th key={n} style={{ textAlign: 'right', width: 52 }} title={`Players signed for ${n} or more seasons from ${season}`}>{n}+ yr{n > 1 ? 's' : ''}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, pts, plus }, i) => (
              <tr key={c.team.id}>
                <td className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{i + 1}</td>
                <td style={{ whiteSpace: 'nowrap' }}><Link href={`/clubhouse/${c.team.id}?view=finances`}>{c.team.name}</Link><div className="muted" style={{ fontSize: 12 }}>{c.team.coach_name}</div></td>
                <td><SalaryBars k={c.salary} keeperCap={c.keeperCapNow || keeperCap} label={`${season} salary`} /></td>
                <td><SoftBar k={c.salary} keeperCap={c.keeperCapNow || keeperCap} seasonCap={seasonCap} /></td>
                <td><SalaryBars k={c.nextSalary} keeperCap={c.keeperCapNext || keeperCap} label={`${season + 1} salary`} /></td>
                <td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">{c.bank.toLocaleString('en-AU')}</td>
                <td><Spark points={pts} /></td>
                {plus.map((n, j) => <td key={j} className="mono" style={{ textAlign: 'right', color: n ? C.ink : C.muted }}>{n}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: '75ch' }}>
        The main bar has 12 blocks of $100k against the ${keeperCap.toLocaleString('en-AU')}k keeper (hard) cap: dark green under $700k, mid green to $800k, light green to $900k, yellow to $950k, orange to $1m, red over.
        The soft cap column shows how much of the ${(seasonCap - keeperCap).toLocaleString('en-AU')}k a club can run over the hard cap in season it’s using (yellow, orange, red as it fills).
        The year columns count players signed for at least that many seasons from {season}, extensions included.
      </p>
    </div>
  );
}
