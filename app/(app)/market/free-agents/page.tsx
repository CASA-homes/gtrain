import Link from 'next/link';
import { KcClock, RunButton } from '@/components/contracts/client';
import { MarketSub } from '@/components/trade/MarketSub';
import { money, moneyK, playerAge, TIER_LABEL } from '@/lib/contracts';
import { getMarket } from '@/lib/market';
import '@/components/contracts/contracts.css';
import '@/components/trade/home.css';

export const dynamic = 'force-dynamic';

export default async function FreeAgentsPage() {
  const m = await getMarket();
  const { d, meId, teamName, allPlayers, pname } = m;
  const now = new Date();
  return (
    <div className="th"><main className="th-main">
      <MarketSub tab="free-agents" title="Free agents"
        sub="Open free agents take blind offers: best score wins, ties go to the lower ladder club. Pending free agents are in the last six months of their deal; his club picks the offer and he moves at season end." />
      {(['open', 'pending'] as const).map((kind) => {
        const list = d.freeAgents.filter((f) => f.kind === kind || (kind === 'pending' && f.kind === 'offseason'));
        return (
          <section key={kind} className="th-card" aria-labelledby={`fa-${kind}`}>
            <div className="th-ch"><h2 id={`fa-${kind}`}>{kind === 'open' ? 'Open now' : 'Pending'}</h2><span className="th-mut">{list.length} player{list.length === 1 ? '' : 's'}</span></div>
            {list.length === 0 ? <p className="th-mut" style={{ fontSize: 13, margin: 0 }}>{kind === 'open' ? 'Nobody right now. Released and unsigned players land here.' : 'Final-year players who aren’t re-signed land here when the mid-season window closes.'}</p> : (
              <div className="th-scroll">
                <table className="th-tbl" style={{ minWidth: 760 }}>
                  <thead><tr><th>Player</th><th>{kind === 'pending' ? 'Club' : 'Ex-club'}</th><th className="r">Age</th><th className="r">Avg</th><th className="r">Value</th><th className="r">Offers</th><th>{kind === 'pending' ? 'Decided by' : 'Closes'}</th><th><span className="sr-only">Action</span></th></tr></thead>
                  <tbody>
                    {list.map((f) => {
                      const p = allPlayers.get(f.player_id); const mine = d.myOffers.find((o) => o.fa_id === f.id);
                      const closed = !!f.closes_at && new Date(f.closes_at) <= now; const own = f.ex_team === meId;
                      return (
                        <tr key={f.id}>
                          <td><Link href={`/players/${f.player_id}`}>{p?.name ?? pname(f.player_id)}</Link> <span className="meta">{p?.positions.join('/')}</span></td>
                          <td className="meta">{f.ex_team ? teamName(f.ex_team) : '—'}</td>
                          <td className="r">{playerAge(p) ?? '–'}</td>
                          <td className="r">{p?.average?.toFixed(1) ?? '–'}</td>
                          <td className="r tn" style={{ fontWeight: 700 }}>{moneyK(d.rates.get(f.player_id) ?? 0)}</td>
                          <td className="r">{f.offers}</td>
                          <td className="meta">{kind === 'pending' ? 'His club, by season end' : f.closes_at ? (closed ? 'Closed' : <KcClock endsAt={f.closes_at} />) : 'Set by commish'}</td>
                          <td className="r"><span style={{ display: 'inline-flex', gap: 6 }}>
                            {own ? <Link href={`/clubhouse/${meId}?view=contracts`} className="th-btn sm">Your player · offers</Link>
                              : meId && !closed && <Link href={`/contracts/offer/${f.id}`} className="th-btn sm dk">{mine ? 'Raise offer' : 'Make offer'}</Link>}
                            {kind === 'open' && (d.me?.is_commish || closed) && <RunButton run="close-fa" id={f.id} small kind="plain" label="Close offers" confirmText="Close offers now? The best offer signs him." />}
                          </span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
      <section className="th-card" aria-labelledby="next-h">
        <div className="th-ch"><h2 id="next-h">Coming into free agency</h2><span className="th-mut">Final-year deals not yet re-signed · {m.comingFa.length}</span></div>
        <div className="th-scroll">
          <table className="th-tbl" style={{ minWidth: 680 }}>
            <thead><tr><th>Player</th><th>Club</th><th className="r">Age</th><th className="r">Avg</th><th className="r">Salary</th><th>Contract</th><th className="r">Value</th></tr></thead>
            <tbody>
              {m.comingFa.map(({ c, p, rate }) => (
                <tr key={c.id}>
                  <td><Link href={`/players/${c.player_id}`}>{p?.name ?? pname(c.player_id)}</Link> <span className="meta">{p?.positions.join('/')}</span></td>
                  <td className="meta">{teamName(c.team_id)}</td>
                  <td className="r">{playerAge(p) ?? '–'}</td>
                  <td className="r">{p?.average?.toFixed(1) ?? '–'}</td>
                  <td className="r tn">{money(c.salary_k)}</td>
                  <td className="meta">Ends {c.end_season} · {TIER_LABEL[c.tier].toLowerCase()}</td>
                  <td className={`r tn${rate > c.salary_k ? ' th-up' : ''}`} style={{ fontWeight: 700 }}>{moneyK(rate)}</td>
                </tr>
              ))}
              {!m.comingFa.length && <tr><td colSpan={7} className="meta">Nobody in a final year.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main></div>
  );
}
