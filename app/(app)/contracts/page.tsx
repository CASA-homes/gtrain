import Link from 'next/link';
import { KcHeader } from '@/components/contracts/KcHeader';
import { RunButton } from '@/components/contracts/client';
import { getContracts, kt, moneyK } from '@/lib/contracts';
import { DealsFeed, ordinal, Rules } from './shared';

export const dynamic = 'force-dynamic';

export default async function ContractsHome() {
  const d = await getContracts();
  const s = d.settings;
  const clubs = [...d.clubs.values()].sort((a, b) => (d.ladderRank.get(a.team.id) ?? 99) - (d.ladderRank.get(b.team.id) ?? 99));
  const maxBank = Math.max(1, ...clubs.map((c) => c.bank));
  return (
    <div className="kc-page">
      <KcHeader settings={s} tab="overview" myTeamId={d.me?.is_guest ? null : d.me?.team_id} isCommish={d.me?.is_commish}
        crumb="Keeper HQ / Contracts" title="Contracts & cap"
        sub={<>Every keeper on a contract, a salary cap for every club, and a Transfer Market for buying and selling. {d.seasonLabel}.</>}
        kpis={s ? [
          { label: 'Keeper cap', value: moneyK(s.keeper_cap_k) },
          { label: 'Season cap', value: moneyK(s.season_cap_k), note: `Tax line ${moneyK(s.tax_line_k)}` },
          { label: 'Tokens in play', value: kt(d.totalKt), note: `${s.start_kt.toLocaleString('en-AU')} KT a club` },
        ] : []} />

      <div className="kc-wrap">
        {d.error && <p className="kc-msg err">Couldn’t load contracts: {d.error}</p>}
        {!d.ready && (
          <section className="kc-card brass">
            <h2>Not set up yet</h2>
            <p className="kc-sub" style={{ color: '#6e5220' }}>
              Setting up gives every kept player (17 + rookie keeper) a contract priced from his market rate, cheap rookie deals for young players,
              and every club a starting bank of 10,000 KT. Every club starts under the keeper cap. Nothing on your real lists changes.
            </p>
            {d.me?.is_commish
              ? <div style={{ marginTop: 14 }}><RunButton run="seed" label="Set up the shadow season" confirmText="Create contracts for every kept player and give every club its starting bank?" /></div>
              : <p className="kc-sub" style={{ marginTop: 10 }}>The commish switches this on.</p>}
          </section>
        )}

        {d.ready && s && (
          <div className="kc-row">
            <section className="kc-card kc-main" aria-labelledby="clubs-h">
              <div className="row-between"><h2 id="clubs-h">Every club’s cap</h2><span className="kc-sub">Ordered by last season’s ladder</span></div>
              <div className="kc-table-box">
                <table className="kc-table" style={{ minWidth: 760 }}>
                  <thead><tr><th>Club</th><th>{s.season} salary</th><th className="r">Room</th><th className="r">{s.season + 1} committed</th><th className="r">Bank</th><th className="r">Players</th><th>Tax</th></tr></thead>
                  <tbody>
                    {clubs.map((c) => {
                      const pct = Math.min(100, (c.salary / s.season_cap_k) * 100);
                      const mine = c.team.id === d.me?.team_id;
                      return (
                        <tr key={c.team.id} style={mine ? { background: '#f4f7f3' } : undefined}>
                          <td><Link href={`/clubhouse/${c.team.id}?view=contracts`} className="name" style={{ color: 'inherit' }}>{c.team.name}</Link><div className="meta">{d.ladderRank.get(c.team.id) ? `${ordinal(d.ladderRank.get(c.team.id)!)} last season` : ''}</div></td>
                          <td style={{ minWidth: 200 }}>
                            <div className="row-between" style={{ fontSize: 13 }}><strong>{moneyK(c.salary)}</strong><span className="muted">of {moneyK(s.keeper_cap_k)}</span></div>
                            <div className="kc-bar"><i className={c.overKeeper ? 'over' : ''} style={{ width: `${pct}%` }} /><s style={{ left: `${(s.keeper_cap_k / s.season_cap_k) * 100}%` }} /></div>
                          </td>
                          <td className={`r ${c.overKeeper ? 'kc-down' : ''}`}>{c.overKeeper ? `${moneyK(c.overKeeper)} over` : moneyK(s.keeper_cap_k - c.salary)}</td>
                          <td className="r">{moneyK(c.nextSalary)}</td>
                          <td className="r">{kt(c.bank)}</td>
                          <td className="r">{c.contracts}</td>
                          <td>{c.taxKt ? <span className="kc-tag exp">{kt(c.taxKt)}</span> : <span className="kc-tag std">Under</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="kc-sub">The brass mark on each bar is the keeper cap; the full bar is the season cap. Season salary only counts contracts until the national draft adds draftees.</p>
            </section>

            <aside className="kc-side">
              <section className="kc-card" aria-labelledby="banks-h">
                <h2 id="banks-h">League banks</h2>
                <p className="kc-sub">Luxury tax and selling players move tokens down the ladder.</p>
                <div style={{ marginTop: 10 }}>
                  {[...clubs].sort((a, b) => b.bank - a.bank).map((c) => (
                    <div key={c.team.id} className="kc-bank-row">
                      <span className="nm" style={{ fontWeight: c.team.id === d.me?.team_id ? 700 : 500 }}>{c.team.name}</span>
                      <span className="bar"><i style={{ width: `${(Math.max(0, c.bank) / maxBank) * 100}%`, background: c.team.id === d.me?.team_id ? 'var(--khq-brass)' : undefined }} /></span>
                      <span style={{ width: 80, textAlign: 'right', fontWeight: 600 }}>{kt(c.bank)}</span>
                    </div>
                  ))}
                </div>
              </section>
              <DealsFeed d={d} />
              <Rules s={s} />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
