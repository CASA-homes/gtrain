import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AvgChip, ClubDot, ScoreChip, Stars } from '@/components/bits';
import { Countdown } from '@/components/Countdown';
import { getLeague, getMe } from '@/lib/data';
import { pickLabel, playerPoints } from '@/lib/picks';
import { C } from '@/lib/ratings';
import { createClient } from '@/lib/supabase/server';
import { acceptOffer, comment, makeOffer, withdrawListing } from '../actions';

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const supabase = await createClient();
  const { data: l } = await supabase.from('listings').select('*').eq('id', id).maybeSingle();
  if (!l) notFound();
  const [{ data: offers }, { data: comments }, { data: myPicks }] = await Promise.all([
    supabase.from('offers').select('*').eq('listing_id', id).order('created_at'),
    supabase.from('listing_comments').select('*').eq('listing_id', id).order('created_at'),
    supabase.from('picks').select('id, year, round, overall').eq('owner_team_id', me?.team_id ?? -1).order('year').order('round'),
  ]);
  const p = league.players.find((x) => x.id === l.player_id)!;
  const r = league.ratings.get(p.id)!;
  const worth = playerPoints(r.value);
  const team = (tid: number) => league.teams.find((t) => t.id === tid);
  const isSeller = me?.team_id === l.team_id;
  const open = l.status === 'open';

  return (
    <div className="wrap" style={{ maxWidth: 980 }}>
      <span className="mono muted" style={{ fontSize: 12 }}><Link href="/market">Trademarket</Link> / {p.name}</span>
      <article className="card" style={{ overflow: 'hidden', borderRadius: 16 }}>
        <div style={{ padding: '20px 22px', display: 'flex', flexWrap: 'wrap', gap: '18px 28px', justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="mono muted" style={{ fontSize: 11 }}>{p.positions.join('/')} · {l.kind === 'auction' ? 'Live auction' : l.kind === 'sale' ? 'For picks' : 'Trade block'}</span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center', font: '600 26px var(--font)', letterSpacing: '-.02em' }}><Link href={`/players/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{p.name}</Link> <ClubDot code={p.afl_club} size={22} /></span>
            <span className="muted" style={{ fontSize: 13 }}>Listed by <Link href={`/clubhouse/${l.team_id}`}>{team(l.team_id)?.name}</Link> · {ago(l.created_at)} ago</span>
          </div>
          <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
            {[['Asking', l.asking], ['Minimum', l.minimum], ['Also open to', l.open_to]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column' }}><span className="eyebrow">{k}</span><b style={{ font: '600 18px var(--font)' }}>{v ?? '–'}</b></div>
            ))}
            {l.ends_at && <Countdown endsAt={l.ends_at} />}
          </div>
        </div>
        <div style={{ padding: '12px 22px', display: 'flex', flexWrap: 'wrap', gap: '10px 22px', alignItems: 'center', fontSize: 13, borderBottom: '1px solid var(--line)' }} className="muted">
          <span>Avg <AvgChip value={p.average} /></span>
          <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>Last 5 {[...p.last5].reverse().map((s, i) => <ScoreChip key={i} value={s} />)}</span>
          <span>Current ability <Stars value={r.valueStars} label="Current ability" /></span>
          <span>Worth about <b style={{ color: C.ink }}>{worth.toLocaleString()} pts</b></span>
          {!open && <span className="pill" style={{ background: C.yellow, color: C.ink }}>Deal pending commish approval</span>}
          {(isSeller || me?.is_commish) && l.status !== 'withdrawn' && l.status !== 'done' && (
            <form action={withdrawListing.bind(null, l.id)} style={{ marginLeft: 'auto' }}>
              <button className="btn">{l.kind === 'auction' ? 'Cancel auction' : 'Remove listing'}</button>
            </form>
          )}
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ font: '600 15px var(--font)' }}>{l.kind === 'auction' ? 'Bids' : 'Offers'} <span className="muted" style={{ fontWeight: 400 }}>{offers?.length ?? 0}</span></h2>
          {(offers ?? []).map((o) => {
            const pct = o.points ? Math.round((o.points / worth) * 100) : null;
            return (
              <div key={o.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: 12, border: '1px solid var(--line)', borderRadius: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span><b>{team(o.team_id)?.name}</b> <span className="muted">offers</span> <b>{o.offer}</b>{o.status !== 'open' && <span className="pill" style={{ marginLeft: 6, background: C.empty }}>{o.status}</span>}</span>
                  {o.message && <span className="muted" style={{ fontSize: 13 }}>“{o.message}”</span>}
                  {pct != null && (
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }} className="muted">
                      <span style={{ width: 120, height: 6, background: C.empty, borderRadius: 3, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${Math.min(100, pct)}%`, background: pct >= 100 ? C.green5 : pct >= 85 ? C.green3 : C.yellow }} /></span>
                      {o.points?.toLocaleString()} pts · {pct >= 100 ? 'fair or better for the seller' : `${pct}% of his value`}
                    </span>
                  )}
                </div>
                {isSeller && open && o.status === 'open' && (
                  <form action={acceptOffer.bind(null, l.id, o.id)}><button className="btn green">Accept</button></form>
                )}
              </div>
            );
          })}
          {!isSeller && open && me && (
            <form action={makeOffer.bind(null, l.id)} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 6 }}>
              <label htmlFor="pick_id" className="sr-only">Offer one of your picks</label>
              <select id="pick_id" name="pick_id" className="input">
                <option value="">Offer a pick…</option>
                {(myPicks ?? []).map((pk) => <option key={pk.id} value={pk.id}>{pickLabel(pk)}</option>)}
              </select>
              <label htmlFor="offer" className="sr-only">Players or extras</label>
              <input id="offer" name="offer" className="input" placeholder="and/or players, e.g. J. Sweet" style={{ flex: '1 1 180px' }} />
              <label htmlFor="message" className="sr-only">Message</label>
              <input id="message" name="message" className="input" placeholder="Message (optional)" style={{ flex: '1 1 180px' }} />
              <button className="btn dark">{l.kind === 'auction' ? 'Place bid' : 'Make offer'}</button>
            </form>
          )}
        </div>

        <div style={{ padding: '4px 22px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ font: '600 15px var(--font)' }}>Chat <span className="muted" style={{ fontWeight: 400 }}>{comments?.length ?? 0}</span></h2>
          {(comments ?? []).map((c) => (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="muted" style={{ fontSize: 12 }}><b style={{ color: C.ink }}>{team(c.team_id)?.name}</b> · {ago(c.created_at)} ago</span>
              <span>{c.body}</span>
            </div>
          ))}
          <form action={comment.bind(null, l.id)} style={{ display: 'flex', gap: 8, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <label htmlFor="body" className="sr-only">Comment</label>
            <input id="body" name="body" required className="input" style={{ flex: '1 1 auto' }} placeholder={isSeller ? 'Reply to the bidders' : 'Say something to the seller'} />
            <button className="btn dark">Send</button>
          </form>
        </div>
      </article>
    </div>
  );
}
