// League settings › League bank: the KT the league has collected from fees, how it has grown, and (behind a toggle)
// what's allocated to prizes. Pledging and paying out live on Bets & fines › League bank.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import './league-bank.css';
import { BankStartForm } from '@/components/league/BankStartForm';
import { getLeagueRules } from '@/lib/league-rules-server';

type Bank = { sources: Record<string, number>; collected: number; paid: number; pledged: number; balance: number; start?: number; history?: [string, number][] };
type Prize = { id: number; season: number; label: string; kt: number; status: 'pledged' | 'paid' | 'cancelled'; team_id: number | null };

export const BANK_SOURCES: [string, string][] = [
  ['start', 'Starting balance'], ['shares', 'Share trading fees and gains tax'], ['levy', 'Transfer levies (clauses, auctions)'], ['release', 'Release fees'],
  ['extension', 'Extension fees'], ['deficit', 'Over-cap deficit fees'], ['burned', 'Burned clause matches'], ['games', 'Mini game and comp pots (20% cut)'],
];
const kt = (n: number) => `${Math.round(n).toLocaleString('en-AU')} KT`;
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

/** The balance over time as a small area chart: one point per day anything moved, held flat to today. */
function Growth({ pts }: { pts: [string, number][] }) {
  if (!pts.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const series = pts[pts.length - 1][0] < today ? [...pts, [today, pts[pts.length - 1][1]] as [string, number]] : pts;
  const t = series.map(([d]) => new Date(d).getTime());
  const t0 = t[0], t1 = Math.max(t[t.length - 1], t0 + 86400000);
  const hi = Math.max(1, ...series.map(([, v]) => v));
  const W = 300, H = 72;
  const x = (i: number) => ((t[i] - t0) / (t1 - t0)) * W;
  const y = (v: number) => H - 4 - (Math.max(0, v) / hi) * (H - 12);
  // Steps, not slopes: the balance only changes when something is collected or paid.
  let line = `M0,${y(series[0][1]).toFixed(1)}`;
  series.forEach(([, v], i) => { if (i) line += ` H${x(i).toFixed(1)} V${y(v).toFixed(1)}`; });
  line += ` H${W}`;
  return (
    <figure className="lb-chart" aria-label={`League bank balance from ${day(series[0][0])} to today: ${kt(series[series.length - 1][1])}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-hidden="true">
        <path d={`${line} V${H} H0 Z`} fill="rgb(31 107 58 / .12)" />
        <path d={line} fill="none" stroke="#1f6b3a" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <figcaption><span>{day(series[0][0])}</span><span>Today</span></figcaption>
    </figure>
  );
}

export async function LeagueBankPanel({ commish }: { commish: boolean }) {
  const supabase = await createClient();
  const [bq, pq, tq, rules] = await Promise.all([
    supabase.rpc('kc_league_bank'),
    supabase.from('bank_prizes').select('id, season, label, kt, status, team_id').neq('status', 'cancelled').order('season').order('created_at'),
    supabase.from('teams').select('id, name'),
    getLeagueRules(),
  ]);
  if (bq.error || !bq.data) return null;
  const b = bq.data as Bank;
  const prizes = (pq.data ?? []) as Prize[];
  const team = (id: number | null) => ((tq.data ?? []) as { id: number; name: string }[]).find((x) => x.id === id)?.name ?? '–';
  const free = b.balance - b.pledged;
  const top = BANK_SOURCES.filter(([k]) => (b.sources[k] ?? 0) > 0);
  const pledged = prizes.filter((p) => p.status === 'pledged');

  return (
    <section className="card lb-card" aria-labelledby="lb-h">
      <div className="row-between" style={{ gap: 8 }}>
        <h2 id="lb-h" className="h2" style={{ fontSize: 18, margin: 0 }}>League bank</h2>
        <span className="muted" style={{ fontSize: 12 }}>Every fee goes here</span>
      </div>
      <div className="lb-big"><b>{kt(b.balance)}</b><span>{kt(b.collected)} collected{b.paid ? ` · ${kt(b.paid)} paid out` : ''}</span></div>
      <Growth pts={b.history ?? []} />
      {top.length ? (
        <dl className="lb-src">{top.map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{kt(b.sources[k])}</dd></div>)}</dl>
      ) : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nothing collected yet. Share trades, release and extension fees, deficit fees, transfer levies and the cut from mini comps all land here.</p>}

      {commish && <BankStartForm value={rules.bank_start_kt} />}

      <details className="lb-alloc">
        <summary>
          <span>Allocations</span>
          <span className="lb-pills"><em>{kt(b.pledged)} allocated</em><em className="free">{kt(free)} free</em></span>
        </summary>
        <div className="lb-bar" aria-hidden="true"><i style={{ width: `${b.balance > 0 ? Math.min(100, (b.pledged / b.balance) * 100) : 0}%` }} /></div>
        {prizes.length ? (
          <ul>
            {prizes.map((p) => (
              <li key={p.id} className={p.status}>
                <span><b>{p.label}</b><small>{p.season}{p.status === 'paid' ? ` · paid to ${team(p.team_id)}` : ' · allocated'}</small></span>
                <b>{kt(p.kt)}</b>
              </li>
            ))}
          </ul>
        ) : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nothing allocated yet. {commish ? 'Set some aside for the Knockout Cup winner, the flag, the spoon, or mark it TBD.' : 'The commish can set KT aside for prizes like the Knockout Cup.'}</p>}
        {pledged.length > 0 && <p className="muted" style={{ margin: 0, fontSize: 12 }}>When a prize is won, the commish pays it out and the KT lands in that club’s bank.</p>}
        {commish && <Link href="/league/bets?tab=bank" className="lg-btn" style={{ alignSelf: 'flex-start' }}>Allocate or pay out →</Link>}
      </details>
    </section>
  );
}
