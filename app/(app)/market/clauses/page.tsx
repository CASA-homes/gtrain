import Link from 'next/link';
import { MarketSub } from '@/components/trade/MarketSub';
import { kt, money, moneyK, playerAge, TIER_LABEL } from '@/lib/contracts';
import { getMarket } from '@/lib/market';
import { LINES, type Line } from '@/lib/ratings';
import '@/components/contracts/contracts.css';
import '@/components/trade/home.css';

export const dynamic = 'force-dynamic';

export default async function ClausesPage({ searchParams }: { searchParams: Promise<{ line?: string; sort?: string }> }) {
  const sp = await searchParams;
  const line = LINES.includes(sp.line as Line) ? (sp.line as Line) : null;
  const m = await getMarket();
  const { d, s, meId, teamName } = m;
  const myClub = meId ? d.clubs.get(meId) : null;
  const buysUsed = meId && s?.window_opened_at ? d.claims.filter((c) => c.buyer_team === meId && c.status !== 'cancelled' && new Date(c.created_at) >= new Date(s.window_opened_at!)).length : 0;
  const claimed = new Set(d.claims.filter((c) => c.status === 'pending').map((c) => c.contract_id));
  const byValue = sp.sort === 'value';
  const rows = m.clauses.filter((r) => !line || r.p?.positions.includes(line))
    .sort((a, b) => (byValue ? b.rate - a.rate : a.clause - b.clause));
  const q = (o: { line?: string | null; sort?: string | null }) => {
    const u = new URLSearchParams();
    const l = o.line === undefined ? line : o.line; const so = o.sort === undefined ? sp.sort : o.sort;
    if (l) u.set('line', l); if (so) u.set('sort', so);
    const str = u.toString(); return `/market/clauses${str ? `?${str}` : ''}`;
  };
  return (
    <div className="th"><main className="th-main">
      <MarketSub tab="clauses" title="Release clauses"
        sub={s ? <>Pay a player’s clause any time of year and offer him 1 to {s.max_years} years at market rate, max {s.max_buys} per club each period. His club has 48 hours to match your terms. If they don’t, he signs with you and moves at the next window.</> : undefined}>
        {myClub && s && (
          <div className="th-card" style={{ padding: '12px 16px', display: 'flex', gap: 22 }}>
            <div><span className="th-eb">Bank</span><b style={{ display: 'block', fontSize: 18 }}>{kt(myClub.bank)}</b></div>
            <div><span className="th-eb">Cap room</span><b style={{ display: 'block', fontSize: 18 }}>{moneyK(s.season_cap_k - myClub.salary)}</b></div>
            <div><span className="th-eb">Buys</span><b style={{ display: 'block', fontSize: 18 }}>{buysUsed} / {s.max_buys}</b></div>
          </div>
        )}
      </MarketSub>
      <section className="th-card">
        <div className="th-ch" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          <div className="th-pills">
            {(['All', ...LINES] as const).map((l) => <Link key={l} href={q({ line: l === 'All' ? null : l })} className="th-pill" aria-current={(l === 'All' && !line) || l === line ? 'page' : undefined}>{l}</Link>)}
          </div>
          <div className="th-pills">
            <Link href={q({ sort: null })} className="th-pill" aria-current={!byValue ? 'page' : undefined}>Cheapest</Link>
            <Link href={q({ sort: 'value' })} className="th-pill" aria-current={byValue ? 'page' : undefined}>Most valuable</Link>
          </div>
        </div>
        <div className="th-scroll">
          <table className="th-tbl" style={{ minWidth: 820 }}>
            <thead><tr><th>Player</th><th>Owner</th><th className="r">Age</th><th className="r">Avg</th><th className="r">Salary</th><th>Contract</th><th className="r">Value</th><th className="r">Clause</th><th><span className="sr-only">Action</span></th></tr></thead>
            <tbody>
              {rows.map(({ c, p, rate, clause }) => {
                const fits = myClub && s ? myClub.salary + c.salary_k <= s.season_cap_k : false;
                const affordable = myClub ? myClub.bank >= clause : false;
                const reason = claimed.has(c.id) ? 'Clause paid · 48h' : !fits ? 'Over your cap' : !affordable ? 'Not enough KT' : s && buysUsed >= s.max_buys ? 'Buys used' : null;
                return (
                  <tr key={c.id}>
                    <td><Link href={`/players/${c.player_id}`}>{p?.name ?? m.pname(c.player_id)}</Link> <span className="meta">{p?.positions.join('/')}</span></td>
                    <td className="meta">{teamName(c.team_id)}</td>
                    <td className="r">{playerAge(p) ?? '–'}</td>
                    <td className="r">{p?.average?.toFixed(1) ?? '–'}</td>
                    <td className="r tn">{money(c.salary_k)}</td>
                    <td className="meta">To {c.end_season} · {TIER_LABEL[c.tier].toLowerCase()}</td>
                    <td className="r tn">{moneyK(rate)}</td>
                    <td className="r tn" style={{ fontWeight: 700 }}>{kt(clause)}</td>
                    <td className="r">{meId && (reason ? <span className="th-btn sm" aria-disabled="true">{reason}</span>
                      : <Link href={`/clubhouse/${c.team_id}?view=contracts`} className="th-btn sm gr">Buy</Link>)}</td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={9} className="meta">No clauses{line ? ` at ${line}` : ''}.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main></div>
  );
}
