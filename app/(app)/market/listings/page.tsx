import Link from 'next/link';
import { MarketSub } from '@/components/trade/MarketSub';
import { moneyK } from '@/lib/contracts';
import { getMarket } from '@/lib/market';
import { pickPoints } from '@/lib/picks';
import { C, LINES, type Line } from '@/lib/ratings';
import { closeWish, postWish } from '../actions';
import '@/components/trade/home.css';

export const dynamic = 'force-dynamic';

export default async function ListingsPage({ searchParams }: { searchParams: Promise<{ line?: string }> }) {
  const sp = await searchParams;
  const line = LINES.includes(sp.line as Line) ? (sp.line as Line) : null;
  const m = await getMarket();
  const { d, meId, teamName, allPlayers, pname } = m;
  const rows = m.listings.filter((l) => l.kind !== 'auction' && (!line || allPlayers.get(l.player_id)?.positions.includes(line)));
  return (
    <div className="th"><main className="th-main">
      <MarketSub tab="listings" title="Trade block" sub="Players coaches will move for players, picks or KT. Every trade needs the commish’s tick, and 6 votes vetoes a lopsided one.">
        <Link href="/market/new" className="th-btn dk">List a player</Link>
      </MarketSub>
      <div className="th-g2">
        <section className="th-card">
          <div className="th-ch" style={{ marginBottom: 10 }}>
            <h2>Listings</h2>
            <div className="th-pills">{(['All', ...LINES] as const).map((l) => <Link key={l} href={l === 'All' ? '/market/listings' : `/market/listings?line=${l}`} className="th-pill" aria-current={(l === 'All' && !line) || l === line ? 'page' : undefined}>{l}</Link>)}</div>
          </div>
          {rows.map((l) => {
            const p = allPlayers.get(l.player_id); const mine = l.team_id === meId;
            return (
              <div key={l.id} className="th-feed" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto auto' }}>
                <span><b><Link href={`/market/${l.id}`}>{p?.name ?? pname(l.player_id)}</Link></b> <span className="th-mut">{mine ? 'You' : teamName(l.team_id)}</span>
                  <span className="s">{p?.positions.join('/')} · {p?.average?.toFixed(1) ?? '–'} avg · {l.asking ? `wants ${l.asking}` : 'open to offers'} · {(l.offers ?? []).length} offer{(l.offers ?? []).length === 1 ? '' : 's'}{l.status === 'pending' ? ' · deal pending' : ''}</span></span>
                <span className="tn">{d.rates.get(l.player_id) ? moneyK(d.rates.get(l.player_id)!) : '—'}</span>
                <Link href={`/market/${l.id}`} className="th-btn sm">{mine ? 'View' : 'Offer'}</Link>
              </div>
            );
          })}
          {!rows.length && <p className="th-mut" style={{ fontSize: 13, margin: 0 }}>Nothing listed{line ? ` at ${line}` : ''}.</p>}
        </section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="th-card" id="wishes">
            <div className="th-ch"><h2>Wish board</h2><span className="th-mut">What coaches are chasing</span></div>
            {m.wishes.map((w) => (
              <div key={w.id} className="th-feed" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                <span><b>{w.want}</b><span className="s">{teamName(w.team_id)} · {w.tag}{w.offering ? ` · offering ${w.offering}` : ''}</span></span>
                {(meId === w.team_id || d.me?.is_commish) ? <form action={closeWish.bind(null, w.id)}><button className="th-btn sm">Remove</button></form> : <span />}
              </div>
            ))}
            {!m.wishes.length && <p className="th-note">No wishes posted.</p>}
            {meId && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Post a wish</summary>
                <form action={postWish} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  <label className="th-eb" htmlFor="want">What are you after?</label>
                  <input id="want" name="want" required className="input" placeholder="A pick in the top 10" />
                  <label className="th-eb" htmlFor="offering">What can you offer?</label>
                  <input id="offering" name="offering" className="input" placeholder="Two second-rounders" />
                  <label className="th-eb" htmlFor="tag">Type</label>
                  <select id="tag" name="tag" className="input"><option>Player</option><option>Pick</option><option>Rebuild</option></select>
                  <button className="th-btn dk" style={{ alignSelf: 'flex-start' }}>Post</button>
                </form>
              </details>
            )}
          </section>
          <section className="th-card" id="picks">
            <div className="th-ch"><h2>Pick price guide</h2><span className="th-mut">Trade points</span></div>
            {[1, 5, 10, 15, 20, 30, 40].map((n, i) => (
              <div key={n} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) 56px', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: i ? '1px solid #eef0ec' : 0 }}>
                <span className="mono" style={{ fontSize: 12 }}>Pick {n}</span>
                <div style={{ height: 8, background: C.empty, borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pickPoints(n) / 30}%`, background: pickPoints(n) >= 2000 ? C.green5 : pickPoints(n) >= 1000 ? C.green4 : C.green3 }} /></div>
                <span className="mono th-mut" style={{ fontSize: 12, textAlign: 'right' }}>{pickPoints(n).toLocaleString()}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </main></div>
  );
}
