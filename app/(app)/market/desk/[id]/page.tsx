// Trade desk: each club's side of the deal, add players / picks / KT from dropdowns, put it forward, and see a counter
// (what was added and removed) when one comes back. Both sides accept, then the commish approves.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClubDot, TeamBadge } from '@/components/bits';
import { getLeague, getMe } from '@/lib/data';
import { pickLabel, pickValue, playerPoints } from '@/lib/picks';
import { createClient } from '@/lib/supabase/server';
import { getContracts } from '@/lib/contracts';
import { joinDesk, acceptDesk, addDrop, addItem, declineDesk, deskComment, executeDesk, inviteClub, proposeDesk, removeDrop, removeItem, vetoDesk, voteLopsided } from '../actions';
import { TradeAdd, type TradeAsset } from './TradeAdd';
import '@/components/trade/desk.css';

type Item = { id: string; from_team_id: number; to_team_id: number; player_id: number | null; pick_id: number | null; kt: number | null; added_by_team: number; created_at: string };
type Snap = { from: number; to: number; player: number | null; pick: number | null; kt: number | null };
type Ev = { id: number; team_id: number; kind: string; note: string | null; items: Snap[]; created_at: string };

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const keyOf = (x: Snap) => `${x.from}|${x.to}|${x.player ?? ''}|${x.pick ?? ''}|${x.kt ?? ''}`;

export default async function DeskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const supabase = await createClient();
  const { data: desk } = await supabase.from('desks').select('*').eq('id', id).maybeSingle();
  if (!desk) notFound();
  const [{ data: itemsQ }, { data: parts }, { data: comments }, { data: votes }, { data: allPicks }, { data: drops }, { data: evQ }] = await Promise.all([
    supabase.from('desk_items').select('*').eq('desk_id', id).order('created_at'),
    supabase.from('desk_teams').select('*').eq('desk_id', id).order('joined_at'),
    supabase.from('desk_comments').select('*').eq('desk_id', id).order('created_at'),
    supabase.from('desk_votes').select('team_id').eq('desk_id', id),
    supabase.from('picks').select('*').in('year', [2027, 2028]),
    supabase.from('desk_drops').select('*').eq('desk_id', id),
    supabase.from('desk_events').select('*').eq('desk_id', id).order('created_at'),
  ]);
  const kc = await getContracts();
  const items = (itemsQ ?? []) as Item[];
  const events = (evQ ?? []) as Ev[];
  const team = (tid: number) => league.teams.find((t) => t.id === tid)!;
  const pickById = new Map((allPicks ?? []).map((p) => [p.id, p]));
  const rate = (pid: number) => kc.rates.get(pid) ?? 0;

  const describe = (x: { player: number | null; pick: number | null; kt: number | null }) => {
    if (x.kt) return { ic: 'KT', cls: 'kt', label: `${x.kt.toLocaleString('en-AU')} KT`, sub: 'From the bank', value: `${x.kt.toLocaleString('en-AU')}`, unit: 'KT', points: 0, kt: x.kt, club: null as string | null, href: null as string | null };
    if (x.player) {
      const p = league.players.find((q) => q.id === x.player);
      const r = p ? league.ratings.get(p.id) : null;
      const c = kc.byPlayer.get(x.player);
      return { ic: p?.positions[0] ?? 'PL', cls: 'pl', label: p?.name ?? 'Player', sub: p ? `${p.afl_club ?? ''} · ${p.average?.toFixed(1) ?? '–'} avg${c ? ` · $${c.salary_k}k to ${c.end_season}` : ''}` : '', value: `$${rate(x.player)}k`, unit: 'value', points: r ? playerPoints(r.value) : 0, kt: 0, club: p?.afl_club ?? null, href: p ? `/players/${p.id}` : null };
    }
    const pk = pickById.get(x.pick!);
    const via = pk && pk.original_team_id !== pk.owner_team_id ? ` · orig. ${team(pk.original_team_id).short_code}` : '';
    return { ic: pk ? `R${pk.round}` : 'PK', cls: 'pk', label: pk ? pickLabel(pk) : 'Pick', sub: pk ? `Round ${pk.round}${via}` : '', value: pk ? pickValue(pk).toLocaleString() : '–', unit: 'pts', points: pk ? pickValue(pk) : 0, kt: 0, club: null, href: null };
  };
  const snapOf = (i: Item): Snap => ({ from: i.from_team_id, to: i.to_team_id, player: i.player_id, pick: i.pick_id, kt: i.kt });

  const myId = me && !me.is_guest ? me.team_id : -1;
  const involved = [...new Set(items.flatMap((i) => [i.from_team_id, i.to_team_id]))];
  const partIds = [...new Set([...(parts ?? []).map((p) => p.team_id as number), ...involved])].sort((a, b) => (a === myId ? -1 : b === myId ? 1 : 0));
  const accepted = new Set((parts ?? []).filter((p) => p.accepted).map((p) => p.team_id as number));
  const isOpen = desk.status === 'open' || desk.status === 'agreed';
  const iAmIn = partIds.includes(myId);
  const others = partIds.filter((t) => t !== myId);
  const two = partIds.length === 2 && iAmIn;

  // Offers and counters.
  const props = events.filter((e) => e.kind === 'proposed' || e.kind === 'countered');
  const last = props[props.length - 1] ?? null;
  const prev = props[props.length - 2] ?? null;
  const boardKeys = new Set(items.map((i) => keyOf(snapOf(i))));
  const lastKeys = new Set((last?.items ?? []).map(keyOf));
  const boardChanged = !last || boardKeys.size !== lastKeys.size || [...boardKeys].some((k) => !lastKeys.has(k));
  const added = last && prev ? last.items.filter((x) => !prev.items.some((y) => keyOf(y) === keyOf(x))) : [];
  const removed = last && prev ? prev.items.filter((x) => !last.items.some((y) => keyOf(y) === keyOf(x))) : [];
  const theirOffer = isOpen && last && last.team_id !== myId && iAmIn && !accepted.has(myId);
  const myOffer = isOpen && last && last.team_id === myId;

  // Points either way, for the meter (two clubs).
  const givePts = items.filter((i) => i.from_team_id === myId).reduce((s, i) => s + describe(snapOf(i)).points, 0);
  const getPts = items.filter((i) => i.to_team_id === myId).reduce((s, i) => s + describe(snapOf(i)).points, 0);
  const lean = givePts + getPts ? getPts / (givePts + getPts) : 0.5;

  const onTable = new Set(items.map((i) => i.player_id).filter(Boolean));
  const sizeOf = (tid: number) => {
    const inP = items.filter((i) => i.to_team_id === tid && i.player_id).length;
    const outP = items.filter((i) => i.from_team_id === tid && i.player_id).length;
    const ds = (drops ?? []).filter((x) => x.team_id === tid) as { id: number; team_id: number; player_id: number }[];
    return { inP, outP, drops: ds, after: league.players.filter((p) => p.team_id === tid).length + inP - outP - ds.length };
  };
  const pickOnTable = new Set(items.map((i) => i.pick_id).filter(Boolean));
  const assetsFor = (tid: number): { players: TradeAsset[]; picks: TradeAsset[] } => ({
    players: league.players.filter((p) => p.team_id === tid && !p.list_status && !onTable.has(p.id))
      .sort((a, b) => rate(b.id) - rate(a.id))
      .map((p) => ({ key: `player:${p.id}`, label: `${p.name} · ${p.positions.join('/')}`, value: `$${rate(p.id)}k` })),
    picks: (allPicks ?? []).filter((p) => p.owner_team_id === tid && !pickOnTable.has(p.id))
      .sort((a, b) => a.year - b.year || a.round - b.round || (a.overall ?? 99) - (b.overall ?? 99))
      .map((p) => ({ key: `pick:${p.id}`, label: `${pickLabel(p)}${p.original_team_id !== tid ? ` (orig. ${team(p.original_team_id).short_code})` : ''}`, value: `${pickValue(p).toLocaleString()} pts` })),
  });

  const overClubs = partIds.filter((t) => sizeOf(t).after > 33);
  const title = two ? `Trade with ${team(others[0]).name}` : desk.title;
  const evLine = (e: Ev) => {
    const who = e.team_id === myId ? 'You' : team(e.team_id).name;
    if (e.kind === 'proposed') return `${who} put it forward`;
    if (e.kind === 'countered') return `${who} countered`;
    if (e.kind === 'accepted') return `${who} accepted`;
    if (e.kind === 'declined') return `${who} declined`;
    return `${who} withdrew the offer`;
  };
  const row = (x: Snap, opts: { tag?: 'new' | 'gone'; removeId?: string; dir?: string }) => {
    const d = describe(x);
    return (
      <div key={keyOf(x) + (opts.tag ?? '')} className={`td-item${opts.tag ? ` ${opts.tag}` : ''}`}>
        <span className={`td-ic ${d.cls}`}>{d.ic}</span>
        <span className="td-nm">
          <b>{d.club && <ClubDot code={d.club} size={13} />}{d.href ? <Link href={d.href}>{d.label}</Link> : d.label}{opts.tag === 'new' && <i className="td-chg add">NEW</i>}{opts.tag === 'gone' && <i className="td-chg rm">REMOVED</i>}</b>
          <span>{d.sub}{opts.dir ? ` · ${opts.dir}` : ''}</span>
        </span>
        <span className="td-v">{d.value}<small>{d.unit}</small></span>
        {opts.removeId ? <form action={removeItem.bind(null, id, opts.removeId)}><button className="td-x" aria-label={`Remove ${d.label}`}>×</button></form> : <span />}
      </div>
    );
  };

  return (
    <div className="wrap td" style={{ maxWidth: 1240 }}>
      <span className="mono muted" style={{ fontSize: 12 }}><Link href="/market">Trademarket</Link> / <Link href="/market/desk">Trade desk</Link> / {title}</span>
      <div className="td-head">
        <div>
          <h1>{title}</h1>
          <p className="muted">{desk.details ?? 'Put players, picks or KT on each side, then put it forward. They can accept, counter or decline.'}</p>
        </div>
        <div className="td-head-acts">
          <span className={`td-status ${desk.status}`}>{desk.status === 'open' ? (last ? 'Offer on the table' : 'Draft') : desk.status === 'agreed' ? 'Agreed · with the commish' : desk.status === 'done' ? 'Done' : desk.status === 'vetoed' ? 'Vetoed' : 'Closed'}</span>
          {isOpen && me && !me.is_guest && !iAmIn && <form action={joinDesk.bind(null, id)}><button className="btn dark">Join this trade</button></form>}
          {isOpen && iAmIn && (
            <details className="td-invite">
              <summary className="btn">＋ Add a club</summary>
              <form action={inviteClub.bind(null, id)}>
                <select name="team" className="input">{league.teams.filter((t) => !partIds.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                <button className="btn dark">Add</button>
              </form>
            </details>
          )}
          {isOpen && (iAmIn || me?.is_commish) && (
            <details className="td-invite td-cancel">
              <summary className="btn">Cancel trade</summary>
              <form action={declineDesk.bind(null, id)}>
                <span>Call it off for every club on this trade?</span>
                <button className="btn danger">Yes, cancel it</button>
              </form>
            </details>
          )}
          {desk.status === 'agreed' && me?.is_commish && <>
            <form action={vetoDesk.bind(null, id)}><button className="btn">Veto</button></form>
            <form action={executeDesk.bind(null, id)}><button className="btn green">Approve and execute</button></form>
          </>}
        </div>
      </div>

      {error && <div role="alert" className="td-alert">{error}</div>}

      {/* Offer / counter banner */}
      {theirOffer && last && (
        <section className="td-offer" aria-labelledby="off-h">
          <div className="td-banner"><span className="td-dot" /><span><b id="off-h">{team(last.team_id).name} {last.kind === 'countered' ? 'countered' : 'put a trade forward'}</b> · {ago(last.created_at)}{last.note && <><br /><span className="td-quote">“{last.note}”</span></>}</span></div>
          {prev ? (
            <div className="td-diff">
              {added.map((x) => row(x, { tag: 'new', dir: `${team(x.from).short_code} → ${team(x.to).short_code}` }))}
              {removed.map((x) => row(x, { tag: 'gone', dir: `${team(x.from).short_code} → ${team(x.to).short_code}` }))}
              {!added.length && !removed.length && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Same deal as before.</p>}
            </div>
          ) : null}
          <div className="td-offer-acts">
            <form action={declineDesk.bind(null, id)}><button className="btn">Decline</button></form>
            <span style={{ display: 'flex', gap: 8 }}>
              <a href="#build" className="btn">Counter back</a>
              {!boardChanged && <form action={acceptDesk.bind(null, id)}><button className="btn green">{last.kind === 'countered' ? 'Accept counter' : 'Accept trade'}</button></form>}
            </span>
          </div>
          {boardChanged && <p className="muted" style={{ margin: 0, fontSize: 12 }}>The board has changed since their offer. Put your version forward as a counter below.</p>}
        </section>
      )}
      {myOffer && !boardChanged && desk.status === 'open' && (
        <div className="td-wait"><span>Your {last!.kind === 'countered' ? 'counter' : 'offer'} is with {others.filter((t) => !accepted.has(t)).map((t) => team(t).name).join(', ') || 'the other club'} · {ago(last!.created_at)}</span>
          <form action={declineDesk.bind(null, id)}><button className="btn">Withdraw</button></form></div>
      )}

      {/* The board */}
      <section id="build" className="td-board" style={{ gridTemplateColumns: `repeat(${Math.max(2, partIds.length)}, minmax(0, 1fr))` }}>
        {partIds.map((tid) => {
          const t = team(tid);
          const gives = items.filter((i) => i.from_team_id === tid);
          const pts = gives.reduce((s, i) => s + describe(snapOf(i)).points, 0);
          const kt = gives.reduce((s, i) => s + (i.kt ?? 0), 0);
          const val = gives.reduce((s, i) => s + (i.player_id ? rate(i.player_id) : 0), 0);
          const club = kc.clubs.get(tid);
          const isMe = tid === myId;
          const canEdit = isOpen && iAmIn;
          const a = assetsFor(tid);
          return (
            <div key={tid} className={`td-side ${isMe ? 'give' : 'get'}`}>
              <div className="td-club">
                <TeamBadge code={t.short_code} logo={t.logo_url} size={40} />
                <div><b>{t.name}</b><small>{isMe ? 'You' : t.coach_name}{club ? ` · bank ${club.bank.toLocaleString('en-AU')} KT · cap room $${(kc.settings?.season_cap_k ?? 0) - club.salary}k` : ''}</small></div>
                {involved.includes(tid) && <span className={`td-acc ${accepted.has(tid) ? 'on' : ''}`}>{accepted.has(tid) ? '✓ Accepted' : 'Not yet'}</span>}
              </div>
              <span className="td-lbl">{isMe ? 'You give' : two ? 'You get' : `${t.short_code} gives`}</span>
              {gives.length ? gives.map((i) => row(snapOf(i), { removeId: canEdit && [i.from_team_id, i.to_team_id, i.added_by_team].includes(myId) ? i.id : undefined, dir: two ? undefined : `to ${team(i.to_team_id).short_code}` }))
                : <p className="td-empty">Nothing yet</p>}
              {canEdit && (
                <TradeAdd from={tid} toOptions={partIds.filter((x) => x !== tid).sort((a, b) => (a === myId ? -1 : b === myId ? 1 : 0)).map((x) => ({ id: x, name: team(x).name }))}
                  players={a.players} picks={a.picks} bank={club?.bank ?? null} action={addItem.bind(null, id)} />
              )}
              {(() => {
                const sz = sizeOf(tid); const over = sz.after - 33;
                const canDrop = isOpen && (tid === myId || me?.is_commish);
                const options = league.players.filter((p) => p.team_id === tid && !onTable.has(p.id) && !sz.drops.some((x) => x.player_id === p.id)).sort((x, y) => (x.average ?? 0) - (y.average ?? 0));
                return (
                  <div className={`td-list${over > 0 ? ' over' : ''}`}>
                    <span>List after trade <b>{sz.after} / 33</b>{sz.inP || sz.outP ? <em> · {sz.inP} in, {sz.outP} out</em> : null}</span>
                    {sz.drops.map((x) => { const p = league.players.find((pp) => pp.id === x.player_id); return <span key={x.id} className="td-dropchip">Releases {p?.name ?? 'player'}{canDrop && <form action={removeDrop.bind(null, id, x.id)}><button aria-label={`Keep ${p?.name}`}>×</button></form>}</span>; })}
                    {over > 0 && <span className="td-list-warn">{tid === myId ? 'You' : team(tid).short_code} must release {over} player{over > 1 ? 's' : ''} for this trade to go through.</span>}
                    {canDrop && over > 0 && options.length > 0 && (
                      <form action={addDrop.bind(null, id, tid)} className="td-dropform">
                        <select name="player" className="input" required defaultValue=""><option value="" disabled>Choose who to release…</option>{options.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.positions.join('/')} · {p.average?.toFixed(1) ?? '–'}</option>)}</select>
                        <button className="btn">Release</button>
                      </form>
                    )}
                  </div>
                );
              })()}
              <div className="td-tot"><span className="muted">{isMe ? 'You give' : two ? 'You get' : 'Gives'}</span><b>{[val ? `$${val}k` : null, kt ? `${kt.toLocaleString('en-AU')} KT` : null, `${pts.toLocaleString()} pts`].filter(Boolean).join(' · ')}</b></div>
            </div>
          );
        })}
      </section>

      {two && items.length > 0 && (
        <div className="td-meter-wrap">
          <div className="td-meter-h"><span className="eyebrow">How it looks</span><span className="muted">Trade points · you give {givePts.toLocaleString()} · you get {getPts.toLocaleString()} · {Math.abs(lean - 0.5) < 0.06 ? 'fair' : lean > 0.5 ? 'leans your way' : 'leans their way'}</span></div>
          <div className="td-meter"><i style={{ left: `${Math.round(lean * 100)}%` }} /></div>
          <div className="td-meter-h muted"><span>Lopsided their way</span><span>Fair</span><span>Lopsided your way</span></div>
        </div>
      )}

      {isOpen && iAmIn && items.length > 0 && boardChanged && (
        <form action={proposeDesk.bind(null, id)} className="td-propose">
          <label htmlFor="td-note" className="sr-only">Message</label>
          <input id="td-note" name="note" className="input" maxLength={500} placeholder="Add a message (optional)" />
          {overClubs.length > 0 && <span className="td-list-warn" style={{ alignSelf: 'center' }}>{overClubs.map((t) => team(t).short_code).join(', ')} over 33: pick who to release first</span>}
          <button className="btn green" disabled={overClubs.includes(myId)}>{last && last.team_id !== myId ? 'Put counter forward' : last ? 'Update offer' : 'Put it forward'}</button>
        </form>
      )}
      {isOpen && !iAmIn && <p className="muted" style={{ margin: 0 }}>{partIds.length ? `On this trade: ${partIds.map((t) => team(t).name).join(', ')}. Join to put something on the table.` : 'Join to put something on the table.'}</p>}

      <div className="td-lower">
        <section>
          <h2 className="h2">History</h2>
          <div className="td-hist">
            <div><span>{ago(desk.created_at)}</span><span>{desk.team_id === myId ? 'You' : team(desk.team_id).name} opened the trade</span></div>
            {events.map((e) => <div key={e.id}><span>{ago(e.created_at)}</span><span>{evLine(e)}{e.note ? ` · “${e.note}”` : ''}</span></div>)}
          </div>
          {(desk.status === 'agreed' || desk.status === 'open') && me && !involved.includes(myId) && involved.length >= 2 && (
            <div className="row-between" style={{ fontSize: 13, marginTop: 10 }}>
              <span className="muted">{(votes ?? []).length} of 6 lopsided flags</span>
              {!(votes ?? []).some((v) => v.team_id === myId) && <form action={voteLopsided.bind(null, id)}><button className="btn">Flag as lopsided</button></form>}
            </div>
          )}
        </section>
        <section>
          <h2 className="h2">Chat</h2>
          <div className="td-chat">
            {(comments ?? []).length ? (comments ?? []).map((c) => (
              <div key={c.id}><span><b>{team(c.team_id).name}</b> <span className="muted">· {ago(c.created_at)}</span></span><span>{c.body}</span></div>
            )) : <p className="muted" style={{ fontSize: 13, margin: 0 }}>No chat yet.</p>}
          </div>
          {me && (
            <form action={deskComment.bind(null, id)} style={{ display: 'flex', gap: 8 }}>
              <label htmlFor="desk-body" className="sr-only">Message</label>
              <input id="desk-body" name="body" className="input" style={{ flex: 1 }} placeholder="Say something…" maxLength={1000} />
              <button className="btn dark">Send</button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
