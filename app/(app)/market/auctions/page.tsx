import Link from 'next/link';
import { Countdown } from '@/components/Countdown';
import { BidControl, KcClock, RunButton } from '@/components/contracts/client';
import { MarketSub } from '@/components/trade/MarketSub';
import { kt, money, moneyK, playerAge } from '@/lib/contracts';
import { getMarket } from '@/lib/market';
import '@/components/contracts/contracts.css';
import '@/components/trade/home.css';

export const dynamic = 'force-dynamic';

export default async function AuctionsPage() {
  const m = await getMarket();
  const { d, s, meId, teamName, allPlayers, pname } = m;
  const now = new Date();
  const listAuctions = m.listings.filter((l) => l.kind === 'auction' && l.status === 'open');
  return (
    <div className="th"><main className="th-main">
      <MarketSub tab="auctions" title="Auctions"
        sub={<>Contracted players up for KT. Mid-season window only. The winner takes the rest of his contract from next season{s ? `, and ${s.levy_pct}% of the price is burned` : ''}.</>} />
      {d.auctions.length === 0 && listAuctions.length === 0 && (
        <section className="th-card"><p className="th-mut" style={{ margin: 0 }}>No auctions running. During the mid-season window, list a player from your Clubhouse contracts.</p></section>
      )}
      {d.auctions.length > 0 && (
        <div className="kc-auctions">
          {d.auctions.map((a) => {
            const c = d.contracts.find((x) => x.id === a.contract_id); const p = allPlayers.get(a.player_id);
            const top = a.bids[0]; const ended = new Date(a.ends_at) <= now; const mine = a.seller_team === meId;
            return (
              <div key={a.id} className={`kc-auction${mine ? ' mine' : ''}`}>
                <div className="row-between">
                  <div><Link href={`/players/${a.player_id}`} style={{ color: 'inherit', fontWeight: 700, fontSize: 16 }}>{p?.name ?? pname(a.player_id)}</Link>
                    <div className="kc-sub" style={{ marginTop: 2 }}>{p?.positions.join('/')} · {playerAge(p) ?? '–'} · avg {p?.average?.toFixed(1) ?? '–'} · {mine ? 'your listing' : teamName(a.seller_team)}</div></div>
                  <span className="kc-tag std">{ended ? 'Ended' : <KcClock endsAt={a.ends_at} />}</span>
                </div>
                <div className="kc-three">
                  <div><span>Salary</span><b>{c ? money(c.salary_k) : '—'}</b></div>
                  <div><span>Value</span><b>{moneyK(d.rates.get(a.player_id) ?? 0)}</b></div>
                  <div><span>Top bid</span><b className="kc-up">{top ? kt(top.amount_kt) : '—'}</b></div>
                </div>
                <p className="kc-sub" style={{ margin: 0 }}>Reserve {kt(a.reserve_kt)} · {top ? `${teamName(top.team_id)} leading · ${a.bids.length} bid${a.bids.length > 1 ? 's' : ''}` : 'no bids yet'}{c ? ` · contract to ${c.end_season}` : ''}</p>
                {ended || d.me?.is_commish ? <RunButton run="settle" id={a.id} label={ended ? 'Settle auction' : 'Settle now (commish)'} kind="sage" />
                  : mine ? (a.bids.length === 0 ? <RunButton run="cancel" id={a.id} label="Cancel listing" kind="plain" confirmText="Cancel this auction?" /> : <p className="kc-sub">Bids in. It settles when the clock runs out.</p>)
                  : meId ? <BidControl auctionId={a.id} name={p?.name ?? 'him'} minBid={Math.max(a.reserve_kt, (top?.amount_kt ?? 0) + 100)} /> : null}
              </div>
            );
          })}
        </div>
      )}
      {listAuctions.length > 0 && (
        <section className="th-card">
          <div className="th-ch"><h2>Trade auctions</h2><span className="th-mut">Bids in players, picks or KT</span></div>
          {listAuctions.map((l) => {
            const bids = [...(l.offers ?? [])].sort((x, y) => (y.points ?? 0) - (x.points ?? 0));
            return (
              <div key={l.id} className="th-feed" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto auto' }}>
                <span><b><Link href={`/market/${l.id}`}>{pname(l.player_id)}</Link></b> <span className="th-mut">{teamName(l.team_id)}</span>
                  <span className="s">Start {l.asking ?? 'open'} · top bid {bids[0]?.offer ?? 'none yet'} · {bids.length} bid{bids.length === 1 ? '' : 's'}</span></span>
                {l.ends_at ? <Countdown endsAt={l.ends_at} /> : <span />}
                <Link href={`/market/${l.id}`} className="th-btn sm">Bid</Link>
              </div>
            );
          })}
        </section>
      )}
    </main></div>
  );
}
