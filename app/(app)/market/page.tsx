// Trademarket home: the ticker, then the player market (every player as a stock: value, moves, scores, contract,
// clause) with your desk and recent transactions in the rail beside it. Below: the featured auction, the trade block,
// clauses and next free agents. Each list has an "All" page for the full thing.
import Link from 'next/link';
import { Countdown } from '@/components/Countdown';
import { MarketBoard } from '@/components/trade/MarketBoard';
import { MarketTicker } from '@/components/trade/MarketTicker';
import { WithdrawOffer } from '@/components/trade/WithdrawOffer';
import { clauseKt, isFinalYear, kt, moneyK, playerAge, TIER_LABEL, valueTrend } from '@/lib/contracts';
import { ago, getMarket, shortName, windowLine } from '@/lib/market';
import { buildBoard } from '@/lib/market-board';
import { decideTrade, voteVeto } from './actions';
import '@/components/trade/home.css';
import '@/components/trade/board.css';

export const dynamic = 'force-dynamic';

const pct = (x: number) => `${x >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(x * 100))}%`;

export default async function MarketHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const m = await getMarket();
  const board = buildBoard(m);
  const { d, s, meId, teamName, teamCode, allPlayers, pname } = m;
  const me = d.me;
  const seasonPct = (pid: number) => {
    const t = valueTrend(allPlayers.get(pid), 999);
    return t.length > 1 && t[0] ? (t[t.length - 1] - t[0]) / t[0] : null;
  };

  // Featured: the contracts auction with the biggest bid, then an auction listing, then the best player on the block.
  const kcAuctions = [...d.auctions].sort((a, b) => (b.bids[0]?.amount_kt ?? b.reserve_kt) - (a.bids[0]?.amount_kt ?? a.reserve_kt));
  const listAuctions = m.listings.filter((l) => l.kind === 'auction' && l.status === 'open');
  const block = m.listings.filter((l) => l.kind !== 'auction').sort((a, b) => (d.rates.get(b.player_id) ?? 0) - (d.rates.get(a.player_id) ?? 0));
  const auctionCount = kcAuctions.length + listAuctions.length;

  // Your desk.
  const myClub = meId ? d.clubs.get(meId) : null;
  const myDesks = m.desks.filter((x) => meId && (x.team_id === meId || (x.desk_teams ?? []).some((t) => t.team_id === meId)));
  const myTrades = m.pendingTrades.filter((t) => meId && (t.team_a === meId || t.team_b === meId));
  const claimsOnMe = d.claims.filter((c) => c.status === 'pending' && c.seller_team === meId);
  const offersOnMine = d.offersOnMine.length;
  const cheapest = s && meId ? d.active
    .filter((c) => c.team_id === meId && !isFinalYear(s, c))
    .map((c) => ({ c, rate: d.rates.get(c.player_id) ?? 0, clause: clauseKt(s, c, d.rates.get(c.player_id) ?? 0, d.pendingFa.has(c.player_id)) }))
    .filter((r) => r.clause != null && r.rate >= 20)
    .sort((a, b) => a.clause! / a.rate - b.clause! / b.rate)[0] : null;
  // Who could actually pay it today: other clubs with the KT in the bank.
  const rivalBanks = meId ? [...d.clubs.entries()].filter(([id]) => id !== meId).map(([, c]) => c.bank ?? 0) : [];
  const canPay = cheapest ? rivalBanks.filter((b) => b >= cheapest.clause!).length : 0;
  const richest = rivalBanks.length ? Math.max(...rivalBanks) : 0;
  const windowOpen = !!s?.window_open && !!s.window_closes_at && new Date(s.window_closes_at) > new Date();
  const buysUsed = meId && s?.window_opened_at ? d.claims.filter((c) => c.buyer_team === meId && c.status !== 'cancelled' && new Date(c.created_at) >= new Date(s.window_opened_at!)).length : 0;
  const clubBase = meId ? `/clubhouse/${meId}` : '/clubhouse';

  const openFa = d.freeAgents.filter((f) => f.kind === 'open');

  return (
    <div className="th">
      <MarketTicker items={m.ticker.map((t) => ({ id: t.id, name: t.name.split(' ').slice(-1)[0].toUpperCase(), value: Math.round(t.value), pct: Math.round(t.pct * 100) }))} />

      <main className="th-main wide">
        {sp.error && <div role="alert" className="th-alert">{sp.error}</div>}
        <div className="th-head">
          <div>
            <span className="th-eb">Trademarket</span>
            <h1>The market</h1>
            <p>{windowLine(d)}</p>
          </div>
          <div className="th-acts">
            <Link href="/market/desk" className="th-btn dk">＋ Make a trade</Link>
            <Link href="/market/new" className="th-btn">List a player</Link>
            <Link href="/market/desk" className="th-btn">Trade desk</Link>
            <Link href="/market/planner" className="th-btn">Planner</Link>
          </div>
        </div>

        {m.pendingTrades.length > 0 && (
          <section className="th-card" aria-labelledby="ap-h">
            <div className="th-ch"><h2 id="ap-h">Awaiting approval</h2><span className="th-mut">The commish ticks every trade · 6 votes vetoes a lopsided one</span></div>
            {m.pendingTrades.map((t) => {
              const n = m.votes.filter((v) => v.trade_id === t.id).length;
              const voted = m.votes.some((v) => v.trade_id === t.id && v.team_id === meId);
              return (
                <div key={t.id} className="th-feed"><span className="th-ico brass">TR</span>
                  <span><b>{teamName(t.team_a)} ⇄ {teamName(t.team_b)}</b><span className="s">{teamCode(t.team_a)} gives {t.a_gives} · {teamCode(t.team_b)} gives {t.b_gives} · {n} of 6 veto votes</span></span>
                  <span className="acts">
                    {!voted && meId && ![t.team_a, t.team_b].includes(meId) && <form action={voteVeto.bind(null, t.id)}><button className="th-btn sm">Vote lopsided</button></form>}
                    {me?.is_commish && <>
                      <form action={decideTrade.bind(null, t.id, false)}><button className="th-btn sm">Veto</button></form>
                      <form action={decideTrade.bind(null, t.id, true)}><button className="th-btn sm gr">Approve</button></form>
                    </>}
                  </span>
                </div>
              );
            })}
          </section>
        )}

        <div className="th-split">
          <MarketBoard rows={board.rows} cur={board.cur} meCode={board.meCode} />
          <aside className="th-rail" aria-label="Your desk and recent transactions">
            {/* Your desk */}
            <section className="th-card" aria-labelledby="desk-h">
              <div className="th-ch"><h2 id="desk-h">Your desk</h2><span className="th-mut">{meId ? teamName(meId) : ''}</span></div>
              {!meId && <p className="th-note">Coaches see their offers, trades and bank here.</p>}
              {claimsOnMe.map((c) => (
                <div key={c.id} className="th-feed"><span className="th-ico rust">!</span>
                  <span><b>{teamName(c.buyer_team)} paid {pname(c.player_id)}’s clause</b><span className="s">{kt(c.price_kt)} · match it or let him go</span></span>
                  <Link href={`${clubBase}?view=contracts`} className="th-btn sm dk">Respond</Link></div>
              ))}
              {d.myOffers.map((o) => {
                const f = d.freeAgents.find((x) => x.id === o.fa_id); const pid = f?.player_id ?? 0; const rivals = Math.max(0, (f?.offers ?? 1) - 1);
                return (
                  <div key={o.id} className="th-feed"><span className="th-ico yellow">FA</span>
                    <span><b>Offer for <Link href={`/players/${pid}`}>{shortName(pname(pid))}</Link></b><span className="s">{o.years} yr{o.years > 1 ? 's' : ''} × {moneyK(o.salary_k)} · waiting{rivals ? ` · ${rivals} rival offer${rivals > 1 ? 's' : ''}` : ''}</span></span>
                    <span className="acts"><Link href={`/contracts/offer/${o.fa_id}`} className="th-btn sm">Raise</Link><WithdrawOffer offerId={o.id} name={pname(pid)} sweet={o.sweet_kt} small /></span>
                  </div>
                );
              })}
              {offersOnMine > 0 && (
                <div className="th-feed"><span className="th-ico brass">FA</span>
                  <span><b>{offersOnMine} offer{offersOnMine > 1 ? 's' : ''} on your pending free agents</b><span className="s">Match within 48 hours or let him go</span></span>
                  <Link href={`${clubBase}?view=contracts`} className="th-btn sm dk">Review</Link></div>
              )}
              {myDesks.slice(0, 3).map((x) => (
                <div key={x.id} className="th-feed"><span className="th-ico green">TR</span>
                  <span><b>{x.team_id === meId ? 'Your trade desk' : `Trade desk with ${teamName(x.team_id)}`}</b><span className="s">{x.title} · {(x.desk_teams ?? []).length} team{(x.desk_teams ?? []).length === 1 ? '' : 's'}{x.status === 'agreed' ? ' · agreed' : ''}</span></span>
                  <Link href={`/market/desk/${x.id}`} className="th-btn sm dk">Review</Link></div>
              ))}
              {myTrades.map((t) => (
                <div key={t.id} className="th-feed"><span className="th-ico grey">TR</span>
                  <span><b>Trade with {teamName(t.team_a === meId ? t.team_b : t.team_a)}</b><span className="s">Awaiting the commish · {t.team_a === meId ? t.a_gives : t.b_gives} for {t.team_a === meId ? t.b_gives : t.a_gives}</span></span>
                  <span className="th-mut" style={{ fontSize: 12 }}>{ago(t.created_at)}</span></div>
              ))}
              {cheapest && (
                <div className="th-feed"><span className={`th-ico ${canPay ? 'rust' : 'grey'}`}>{canPay ? '!' : 'OK'}</span>
                  <span><b>{shortName(pname(cheapest.c.player_id))} has your lowest clause for his value</b><span className="s">{kt(cheapest.clause!)} for a {moneyK(cheapest.rate)} player · {canPay ? `${canPay} club${canPay === 1 ? '' : 's'} could pay it in the window` : `nobody can afford it yet (richest rival bank ${kt(richest)})`}</span></span>
                  <Link href={`${clubBase}?view=contracts`} className="th-btn sm">Extend</Link></div>
              )}
              {myClub && s && (
                <div className="th-feed"><span className="th-ico brass">KT</span>
                  <span><b>Bank {kt(myClub.bank)}</b><span className="s">{moneyK(s.season_cap_k - myClub.salary)} season cap room · {windowOpen ? `${buysUsed} of ${s.max_buys} clause buys used` : `max ${s.max_buys} clause buys a window`}</span></span>
                  <Link href={`${clubBase}?view=finances`} className="th-btn sm">Finances</Link></div>
              )}
              {meId && !d.myOffers.length && !myDesks.length && !myTrades.length && !claimsOnMe.length && !offersOnMine && (
                <p className="th-note" style={{ marginTop: 6 }}>No offers or trades on the go. <Link href="/market/free-agents">Find a free agent</Link> or <Link href="/market/desk">start a trade</Link>.</p>
              )}
            </section>
            <section className="th-card" aria-labelledby="tx-h">
              <div className="th-ch"><h2 id="tx-h">Recent transactions</h2><Link href="/market/transactions">Full log →</Link></div>
              {m.feed.slice(0, 8).map((f) => (
                <div key={f.id} className="th-feed"><span className={`th-ico ${f.tone}`}>{f.tag}</span>
                  <span><b>{f.player_id ? <Link href={`/players/${f.player_id}`}>{f.title}</Link> : f.title}</b><span className="s">{f.sub}</span></span>
                  <span className="th-mut" style={{ fontSize: 12 }}>{ago(f.at)}</span></div>
              ))}
              {!m.feed.length && <p className="th-mut" style={{ fontSize: 13 }}>Nothing yet.</p>}
            </section>
          </aside>
        </div>

        <div className="th-more">
          {/* Auction of the week */}
          {kcAuctions[0] ? (() => {
            const a = kcAuctions[0]; const p = allPlayers.get(a.player_id); const c = d.contracts.find((x) => x.id === a.contract_id);
            const top = a.bids[0]; const rate = d.rates.get(a.player_id) ?? 0; const sp2 = seasonPct(a.player_id);
            const others = kcAuctions.slice(1, 4).map((x) => shortName(pname(x.player_id)).split(' ').slice(-1)[0]);
            return (
              <section className="th-card th-auc" aria-labelledby="auc-h">
                <div className="th-auc-top">
                  <div>
                    <span className="th-eb">Auction of the week</span>
                    <h2 id="auc-h"><Link href={`/players/${a.player_id}`}>{p?.name ?? pname(a.player_id)}</Link></h2>
                    <span style={{ opacity: .85 }}>{p?.positions.join('/')} · {playerAge(p) ?? '–'} · {teamName(a.seller_team)}</span>
                  </div>
                  <div className="th-auc-clock"><span className="th-eb">Ends in</span><b><Countdown endsAt={a.ends_at} /></b></div>
                </div>
                <div className="th-auc-stats">
                  <div><span className="th-eb">Top bid</span><b>{top ? kt(top.amount_kt) : '—'}</b><small>{top ? `${teamName(top.team_id)} · ${a.bids.length} bid${a.bids.length > 1 ? 's' : ''}` : `Reserve ${kt(a.reserve_kt)}`}</small></div>
                  <div><span className="th-eb">Contract</span><b>{c ? moneyK(c.salary_k) : '—'}</b><small>{c ? `to ${c.end_season} · ${TIER_LABEL[c.tier].toLowerCase()}` : ''}</small></div>
                  <div><span className="th-eb">Market value</span><b>{moneyK(rate)}</b>{sp2 != null && <small className={sp2 >= 0 ? 'th-up' : 'th-dn'}>{pct(sp2)} this season</small>}</div>
                  <div><span className="th-eb">Average</span><b>{p?.average?.toFixed(1) ?? '–'}</b><small>{p?.games ?? 0} games</small></div>
                </div>
                <div className="th-auc-foot">
                  {meId && a.seller_team !== meId && <Link href="/market/auctions" className="th-btn gr">Bid {kt(Math.max(a.reserve_kt, (top?.amount_kt ?? 0) + 100))}</Link>}
                  <Link href={`/players/${a.player_id}`} className="th-btn">Player profile</Link>
                  <span className="th-mut">{others.length ? <>Also on the block: {others.join(' · ')} · </> : null}<Link href="/market/auctions">All {auctionCount} →</Link></span>
                </div>
              </section>
            );
          })() : listAuctions[0] ? (() => {
            const l = listAuctions[0]; const p = allPlayers.get(l.player_id);
            const bids = [...(l.offers ?? [])].sort((x, y) => (y.points ?? 0) - (x.points ?? 0));
            return (
              <section className="th-card th-auc" aria-labelledby="auc-h">
                <div className="th-auc-top">
                  <div>
                    <span className="th-eb">Auction of the week</span>
                    <h2 id="auc-h"><Link href={`/market/${l.id}`}>{p?.name ?? pname(l.player_id)}</Link></h2>
                    <span style={{ opacity: .85 }}>{p?.positions.join('/')} · {playerAge(p) ?? '–'} · {teamName(l.team_id)}</span>
                  </div>
                  {l.ends_at && <div className="th-auc-clock"><span className="th-eb">Ends in</span><b><Countdown endsAt={l.ends_at} /></b></div>}
                </div>
                <div className="th-auc-stats">
                  <div><span className="th-eb">Top bid</span><b style={{ fontSize: 16 }}>{bids[0]?.offer ?? 'None yet'}</b><small>{bids.length} bid{bids.length === 1 ? '' : 's'}</small></div>
                  <div><span className="th-eb">Start</span><b style={{ fontSize: 16 }}>{l.asking ?? 'Open'}</b></div>
                  <div><span className="th-eb">Market value</span><b>{moneyK(d.rates.get(l.player_id) ?? 0)}</b></div>
                  <div><span className="th-eb">Average</span><b>{p?.average?.toFixed(1) ?? '–'}</b><small>{p?.games ?? 0} games</small></div>
                </div>
                <div className="th-auc-foot">
                  <Link href={`/market/${l.id}`} className="th-btn gr">Bid</Link>
                  <span className="th-mut"><Link href="/market/auctions">All {auctionCount} →</Link></span>
                </div>
              </section>
            );
          })() : (
            <section className="th-card th-auc" aria-labelledby="auc-h">
              <div className="th-auc-top">
                <div>
                  <span className="th-eb">Auction of the week</span>
                  <h2 id="auc-h">{block[0] ? <Link href={`/market/${block[0].id}`}>{pname(block[0].player_id)}</Link> : 'Nothing under the hammer'}</h2>
                  <span style={{ opacity: .85 }}>{block[0] ? `No auction running · top of the trade block · ${teamName(block[0].team_id)}` : 'Auctions run in the mid-season window'}</span>
                </div>
              </div>
              {block[0] ? (() => {
                const l = block[0]; const p = allPlayers.get(l.player_id); const sp2 = seasonPct(l.player_id);
                return <>
                  <div className="th-auc-stats">
                    <div><span className="th-eb">Asking</span><b style={{ fontSize: 16 }}>{l.asking ?? 'Open to offers'}</b></div>
                    <div><span className="th-eb">Offers</span><b>{(l.offers ?? []).length}</b></div>
                    <div><span className="th-eb">Market value</span><b>{moneyK(d.rates.get(l.player_id) ?? 0)}</b>{sp2 != null && <small className={sp2 >= 0 ? 'th-up' : 'th-dn'}>{pct(sp2)} this season</small>}</div>
                    <div><span className="th-eb">Average</span><b>{p?.average?.toFixed(1) ?? '–'}</b><small>{p?.games ?? 0} games</small></div>
                  </div>
                  <div className="th-auc-foot">
                    <Link href={`/market/${l.id}`} className="th-btn gr">Make an offer</Link>
                    <Link href={`/players/${l.player_id}`} className="th-btn">Player profile</Link>
                  </div>
                </>;
              })() : (
                <div className="th-auc-empty">
                  <p className="th-mut" style={{ margin: 0 }}>When a coach puts a contracted player up for auction, the biggest one shows here with the clock and the top bid. Coaches can list from their Clubhouse contracts during the mid-season window.</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Link href="/market/new" className="th-btn gr">List a player</Link><Link href="/market/auctions" className="th-btn">Auctions</Link></div>
                </div>
              )}
            </section>
          )}

          <section className="th-card" aria-labelledby="li-h">
            <div className="th-ch"><h2 id="li-h">On the trade block</h2><Link href="/market/listings">All listings →</Link></div>
            {block.slice(0, 6).map((l) => {
              const mine = l.team_id === meId;
              return (
                <div key={l.id} className="th-feed" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto auto' }}>
                  <span><b><Link href={`/market/${l.id}`}>{shortName(pname(l.player_id))}</Link></b> <span className="th-mut">{mine ? 'You' : teamName(l.team_id)}</span>
                    <span className="s">{l.asking ? `Wants: ${l.asking}` : 'Open to offers'} · {(l.offers ?? []).length} offer{(l.offers ?? []).length === 1 ? '' : 's'}</span></span>
                  <span className="tn">{d.rates.get(l.player_id) ? moneyK(d.rates.get(l.player_id)!) : '—'}</span>
                  <Link href={`/market/${l.id}`} className="th-btn sm">{mine ? 'View' : 'Offer'}</Link>
                </div>
              );
            })}
            {!block.length && <p className="th-mut" style={{ fontSize: 13 }}>Nobody listed. <Link href="/market/new">List a player</Link>.</p>}
            <p className="th-note" style={{ marginTop: 10 }}><Link href="/market/listings#wishes">Wish board</Link> · <Link href="/market/listings#picks">Pick price guide</Link></p>
          </section>
          <section className="th-card" aria-labelledby="cl-h">
            <div className="th-ch"><h2 id="cl-h">On release clauses</h2><Link href="/market/clauses">All {m.clauses.length} →</Link></div>
            <p className="th-note">Cheapest clauses in the league. Pay it in the window and he’s yours.</p>
            {m.clauses.length ? (
              <table className="th-tbl">
                <thead><tr><th>Player</th><th className="r">Clause</th><th className="r">Value</th></tr></thead>
                <tbody>{m.clauses.slice(0, 6).map((r) => (
                  <tr key={r.c.id}><td><Link href={`/players/${r.c.player_id}`}>{shortName(pname(r.c.player_id))}</Link> <span className="meta">{teamCode(r.c.team_id)}</span></td><td className="r tn">{kt(r.clause)}</td><td className="r tn">{moneyK(r.rate)}</td></tr>
                ))}</tbody>
              </table>
            ) : <p className="th-mut" style={{ fontSize: 13 }}>No clauses on the market yet.</p>}
          </section>

          <section className="th-card" aria-labelledby="fa-h">
            <div className="th-ch"><h2 id="fa-h">Coming into free agency</h2><Link href="/market/free-agents">All →</Link></div>
            <p className="th-note">Final-year deals. Not re-signed in time? They hit the market.</p>
            <table className="th-tbl">
              <thead><tr><th>Player</th><th className="r">Salary</th><th className="r">Value</th></tr></thead>
              <tbody>
                {m.comingFa.slice(0, 6).map((r) => (
                  <tr key={r.c.id}><td><Link href={`/players/${r.c.player_id}`}>{shortName(pname(r.c.player_id))}</Link> <span className="meta">{teamCode(r.c.team_id)}</span></td>
                    <td className="r tn">{moneyK(r.c.salary_k)}</td><td className={`r tn${r.rate > r.c.salary_k ? ' th-up' : ''}`}>{moneyK(r.rate)}</td></tr>
                ))}
                {!m.comingFa.length && <tr><td colSpan={3} className="meta">Nobody in a final year.</td></tr>}
                <tr><td colSpan={3}><span className="meta">Open free agents now: <b>{openFa.length}</b> · <Link href="/market/free-agents" style={{ color: '#1f6b3a' }}>Make an offer</Link></span></td></tr>
              </tbody>
            </table>
          </section>

        </div>
        <p className="th-note">Prices are market values: the contract rate from a rolling six-game average.</p>
      </main>
    </div>
  );
}
