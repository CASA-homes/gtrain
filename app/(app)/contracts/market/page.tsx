import Link from 'next/link';
import { KcHeader, } from '@/components/contracts/KcHeader';
import { BidControl, KcClock, RunButton } from '@/components/contracts/client';
import { clauseKt, floorFor, getContracts, isFinalYear, kt, money, moneyK, playerAge, TIER_LABEL } from '@/lib/contracts';
import { LINES, type Line } from '@/lib/ratings';
import { DealsFeed } from '../shared';

export const dynamic = 'force-dynamic';

export default async function TransferMarket({ searchParams }: { searchParams: Promise<{ line?: string }> }) {
  const sp = await searchParams;
  const line = LINES.includes(sp.line as Line) ? (sp.line as Line) : null;
  const d = await getContracts();
  const s = d.settings;
  const meId = d.me && !d.me.is_guest ? d.me.team_id : null;
  const myClub = meId ? d.clubs.get(meId) : null;
  const team = (id: number | null) => d.teams.find((t) => t.id === id)?.name ?? '—';
  const now = new Date();
  const windowOpen = !!s?.window_open && !!s.window_closes_at && new Date(s.window_closes_at) > now;
  const buysUsed = meId && s?.window_opened_at ? d.transfers.filter((t) => t.kind === 'clause' && t.to_team === meId && new Date(t.created_at) >= new Date(s.window_opened_at!)).length : 0;

  if (!s || !d.ready) {
    return (
      <div className="kc-page">
        <KcHeader settings={s} tab="market" myTeamId={meId} isCommish={d.me?.is_commish} crumb="Keeper HQ / Contracts" title="Transfer Market" />
        <div className="kc-wrap"><section className="kc-card brass"><h2>Contracts aren’t set up yet</h2><p className="kc-sub"><Link href="/contracts">Back to Contracts</Link></p></section></div>
      </div>
    );
  }

  const clauseRows = d.active
    .filter((c) => c.team_id !== meId)
    .map((c) => {
      const p = d.players.get(c.player_id); const rate = d.rates.get(c.player_id) ?? 0;
      const clause = clauseKt(s, c, rate); const l = p?.positions[0] as Line | undefined;
      const seller = d.clubs.get(c.team_id);
      const floorBlocked = !!(l && seller && seller.fit[l] - (p && !['LONG', 'SEASON', 'OUT', 'SUSP', 'DEL'].includes(p.status ?? '') ? 1 : 0) < floorFor(s, l));
      return { c, p, rate, clause, l, floorBlocked };
    })
    .filter((r) => r.clause != null || r.c.tier === 'none')
    .filter((r) => !line || r.p?.positions.includes(line))
    .sort((a, b) => (b.p?.average ?? 0) - (a.p?.average ?? 0));

  return (
    <div className="kc-page">
      <KcHeader settings={s} tab="market" myTeamId={meId} isCommish={d.me?.is_commish}
        crumb="Keeper HQ / Contracts" title="Transfer Market"
        sub={<>Owners’ auctions, free agents and release clauses. Coach-to-coach trades still happen on the <Link href="/market" style={{ color: '#e5c98a' }}>Trademarket</Link>.</>}
        kpis={myClub ? [
          { label: 'Your bank', value: kt(myClub.bank) },
          { label: 'Season cap room', value: moneyK(s.season_cap_k - myClub.salary), note: `${moneyK(Math.max(0, s.tax_line_k - myClub.salary))} before tax line` },
          { label: 'Clause buys', value: `${buysUsed} / ${s.max_buys}`, note: windowOpen ? 'this window' : 'window closed' },
        ] : []} />

      <div className="kc-wrap">
        <section className="kc-card" aria-labelledby="auc-h">
          <div className="row-between"><h2 id="auc-h">Auctions</h2><span className="kc-sub">Listed by their owners · the buyer takes the contract · {s.levy_pct}% of the price is burned</span></div>
          {d.auctions.length === 0 ? <p className="kc-sub" style={{ marginTop: 10 }}>No auctions running. List a player from your Contracts page.</p> : (
            <div className="kc-auctions" style={{ marginTop: 14 }}>
              {d.auctions.map((a) => {
                const c = d.contracts.find((x) => x.id === a.contract_id); const p = d.players.get(a.player_id);
                const top = a.bids[0]; const ended = new Date(a.ends_at) <= now; const mineA = a.seller_team === meId;
                return (
                  <div key={a.id} className={`kc-auction${mineA ? ' mine' : ''}`}>
                    <div className="row-between">
                      <div><strong style={{ fontSize: 16 }}>{p?.name}</strong>
                        <div className="kc-sub" style={{ marginTop: 2 }}>{p?.positions.join('/')} · {playerAge(p) ?? '–'} · avg {p?.average?.toFixed(1) ?? '–'} · {mineA ? 'your listing' : team(a.seller_team)}</div></div>
                      <span className="kc-tag std">{ended ? 'Ended' : <KcClock endsAt={a.ends_at} />}</span>
                    </div>
                    <div className="kc-three">
                      <div><span>Salary</span><b>{c ? money(c.salary_k) : '—'}</b></div>
                      <div><span>Reserve</span><b>{kt(a.reserve_kt)}</b></div>
                      <div><span>Top bid</span><b className="kc-up">{top ? kt(top.amount_kt) : '—'}</b></div>
                    </div>
                    <p className="kc-sub" style={{ margin: 0 }}>{top ? `${team(top.team_id)} leading · ${a.bids.length} bid${a.bids.length > 1 ? 's' : ''}` : 'No bids yet'}{c ? ` · contract to ${c.end_season}` : ''}</p>
                    {ended || d.me?.is_commish ? <RunButton run="settle" id={a.id} label={ended ? 'Settle auction' : 'Settle now (commish)'} kind="sage" />
                      : mineA ? (a.bids.length === 0 ? <RunButton run="cancel" id={a.id} label="Cancel listing" kind="plain" confirmText="Cancel this auction?" /> : <p className="kc-sub">Bids in. It settles when the clock runs out.</p>)
                      : meId ? <BidControl auctionId={a.id} name={p?.name ?? 'him'} minBid={Math.max(a.reserve_kt, (top?.amount_kt ?? 0) + 100)} /> : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="kc-row">
          <div className="kc-main">
            <section className="kc-card" aria-labelledby="fa-h">
              <div className="row-between"><h2 id="fa-h">Free agents</h2><span className="kc-sub">Blind offers · best score wins · ties go to the lower ladder club</span></div>
              {d.freeAgents.length === 0 ? <p className="kc-sub" style={{ marginTop: 10 }}>No free agents right now. Players land here when they’re released, or when their contract runs out at the end of the season.</p> : (
                <div className="kc-table-box" style={{ marginTop: 8 }}>
                  <table className="kc-table" style={{ minWidth: 760 }}>
                    <thead><tr><th>Player</th><th>Ex-club</th><th className="r">Age</th><th className="r">Avg</th><th className="r">Market rate</th><th className="r">Offers</th><th>Closes</th><th><span className="sr-only">Action</span></th></tr></thead>
                    <tbody>
                      {d.freeAgents.map((f) => {
                        const p = d.players.get(f.player_id); const mineO = d.myOffers.find((o) => o.fa_id === f.id);
                        const closed = !!f.closes_at && new Date(f.closes_at) <= now;
                        return (
                          <tr key={f.id}>
                            <td><span className="name">{p?.name ?? `Player ${f.player_id}`}</span> <span className="meta">{p?.positions.join('/')}</span></td>
                            <td className="meta">{team(f.ex_team)}</td>
                            <td className="r">{playerAge(p) ?? '–'}</td>
                            <td className="r">{p?.average?.toFixed(1) ?? '–'}</td>
                            <td className="r" style={{ fontWeight: 700 }}>{money(d.rates.get(f.player_id) ?? 0)}</td>
                            <td className="r"><span className={`kc-tag ${f.offers ? 'rook' : 'std'}`}>{f.offers}</span></td>
                            <td className="meta">{f.closes_at ? (closed ? 'Closed' : <KcClock endsAt={f.closes_at} />) : 'Set by commish'}</td>
                            <td className="r"><span style={{ display: 'inline-flex', gap: 6 }}>
                              {meId && !closed && <Link href={`/contracts/offer/${f.id}`} className="kc-btn small dark">{mineO ? `Raise offer (${mineO.score})` : 'Offer contract'}</Link>}
                              {(d.me?.is_commish || closed) && <RunButton run="close-fa" id={f.id} small kind="plain" label="Close offers" confirmText="Close offers now? The best offer signs him." />}
                            </span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="kc-card" aria-labelledby="cl-h">
              <div className="row-between">
                <div><h2 id="cl-h">Release clauses</h2>
                  <p className="kc-sub">Pay the clause in a window and he’s yours on his contract. Max {s.max_buys} per window. The seller’s depth floor must still hold.</p></div>
                <div className="kc-tabs">
                  {(['All', ...LINES] as const).map((l) => (
                    <Link key={l} href={l === 'All' ? '/contracts/market' : `/contracts/market?line=${l}`} aria-current={(l === 'All' && !line) || l === line ? 'page' : undefined}>{l}</Link>
                  ))}
                </div>
              </div>
              <div className="kc-table-box" style={{ marginTop: 8 }}>
                <table className="kc-table" style={{ minWidth: 860 }}>
                  <thead><tr><th>Player</th><th>Owner</th><th className="r">Age</th><th className="r">Avg</th><th className="r">Salary</th><th>Contract</th><th className="r">Clause</th><th><span className="sr-only">Action</span></th></tr></thead>
                  <tbody>
                    {clauseRows.map(({ c, p, clause, floorBlocked }) => {
                      const fits = myClub ? myClub.salary + c.salary_k <= s.season_cap_k : false;
                      const affordable = myClub ? clause != null && myClub.bank >= clause : false;
                      const reason = clause == null ? 'No clause' : floorBlocked ? `Blocked · ${p?.positions[0]} depth floor` : !windowOpen ? 'Window closed'
                        : !fits ? 'Over your cap' : !affordable ? 'Not enough KT' : buysUsed >= s.max_buys ? 'Buys used' : null;
                      return (
                        <tr key={c.id}>
                          <td><span className="name">{p?.name}</span> <span className="meta">{p?.positions.join('/')}</span></td>
                          <td className="meta">{team(c.team_id)}</td>
                          <td className="r">{playerAge(p) ?? '–'}</td>
                          <td className="r">{p?.average?.toFixed(1) ?? '–'}</td>
                          <td className="r">{money(c.salary_k)}</td>
                          <td className="meta">{isFinalYear(s, c) ? 'Final year (½ clause)' : `To ${c.end_season} · ${TIER_LABEL[c.tier].toLowerCase()}`}</td>
                          <td className="r" style={{ fontWeight: 700 }}>{clause == null ? '—' : kt(clause)}</td>
                          <td className="r">{meId && (reason ? <span className="kc-btn small ghost" aria-disabled="true">{reason}</span>
                            : <RunButton run="buy" id={c.id} small kind="sage" label={`Buy for ${kt(clause!)}`} confirmText={`Pay ${kt(clause!)} for ${p?.name}? He joins you on ${money(c.salary_k)} a year to ${c.end_season}.`} />)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="kc-side">
            {myClub && (
              <section className="kc-card" aria-labelledby="me-h">
                <h2 id="me-h">Your window</h2>
                <div style={{ marginTop: 8 }}>
                  <div className="kc-kv"><span>Bank</span><strong>{kt(myClub.bank)}</strong></div>
                  <div className="kc-kv"><span>Season cap room</span><strong>{moneyK(s.season_cap_k - myClub.salary)}</strong></div>
                  <div className="kc-kv"><span>Room before tax line</span><strong className="kc-brass">{moneyK(Math.max(0, s.tax_line_k - myClub.salary))}</strong></div>
                  <div className="kc-kv"><span>Clause buys used</span><strong>{buysUsed} / {s.max_buys}</strong></div>
                </div>
                {d.myOffers.length > 0 && <>
                  <p className="eyebrow" style={{ marginTop: 14 }}>Your tabled offers</p>
                  {d.myOffers.map((o) => {
                    const f = d.freeAgents.find((x) => x.id === o.fa_id);
                    return <div key={o.id} className="kc-kv"><span>{d.players.get(f?.player_id ?? 0)?.name ?? 'Free agent'}</span><strong>{o.years} × {money(o.salary_k)} · {o.score}</strong></div>;
                  })}
                </>}
              </section>
            )}
            <DealsFeed d={d} />
            <section className="kc-card brass" aria-labelledby="mid-h">
              <h2 id="mid-h">Mid-season week</h2>
              <div className="kc-kv" style={{ borderTop: 0 }}><span>Day 1</span><strong>Release at least 3</strong></div>
              <div className="kc-kv"><span>Day 1–3</span><strong>Window: clauses, auctions, free agents</strong></div>
              <div className="kc-kv"><span>Day 4</span><strong>Mid-season draft, reverse ladder</strong></div>
              <p className="kc-sub" style={{ color: '#6e5220' }}>Every club brings in 3 new players, bought or drafted. Mid-season draft salaries are half the national scale.</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
