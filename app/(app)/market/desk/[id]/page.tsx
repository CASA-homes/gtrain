import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClubDot, TeamBadge } from '@/components/bits';
import { getLeague, getMe } from '@/lib/data';
import { pickLabel, pickValue, playerPoints } from '@/lib/picks';
import { C } from '@/lib/ratings';
import { createClient } from '@/lib/supabase/server';
import { addItem, closeDesk, deskComment, executeDesk, joinDesk, leaveDesk, removeItem, setAccepted, vetoDesk, voteLopsided } from '../actions';
import { AddItem, type Asset } from './AddItem';

const STATUS: Record<string, [string, string, string]> = {
  open: ['Open', C.green2, C.ink],
  agreed: ['Agreed, waiting on the commish', C.green4, '#fff'],
  done: ['Done', C.green5, '#fff'],
  vetoed: ['Vetoed', C.redBg, C.redFg],
  closed: ['Closed', C.empty, C.muted],
};
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

export default async function DeskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const supabase = await createClient();
  const { data: desk } = await supabase.from('desks').select('*').eq('id', id).maybeSingle();
  if (!desk) notFound();
  const [{ data: items }, { data: parts }, { data: comments }, { data: votes }, { data: allPicks }] = await Promise.all([
    supabase.from('desk_items').select('*').eq('desk_id', id).order('created_at'),
    supabase.from('desk_teams').select('*').eq('desk_id', id).order('joined_at'),
    supabase.from('desk_comments').select('*').eq('desk_id', id).order('created_at'),
    supabase.from('desk_votes').select('team_id').eq('desk_id', id),
    supabase.from('picks').select('id, year, round, overall, owner_team_id, original_team_id').in('year', [2027, 2028]),
  ]);
  const team = (tid: number) => league.teams.find((t) => t.id === tid)!;
  const pickById = new Map((allPicks ?? []).map((p) => [p.id, p]));

  // Label and value every asset the same way the rest of the market does.
  const describe = (it: { player_id: number | null; pick_id: number | null }) => {
    if (it.player_id) {
      const p = league.players.find((x) => x.id === it.player_id);
      const r = p ? league.ratings.get(p.id) : null;
      return { label: p?.name ?? 'Player', sub: p ? `${p.positions.join('/')} · ${p.average?.toFixed(1) ?? '–'} avg` : '', points: r ? playerPoints(r.value) : 0, club: p?.afl_club ?? null, href: p ? `/players/${p.id}` : null };
    }
    const pk = pickById.get(it.pick_id!);
    const via = pk && pk.original_team_id !== pk.owner_team_id ? ` (orig. ${team(pk.original_team_id).short_code})` : '';
    return { label: pk ? pickLabel(pk) : 'Pick', sub: pk ? `Round ${pk.round}${via}` : '', points: pk ? pickValue(pk) : 0, club: null, href: null };
  };

  const list = items ?? [];
  const involved = [...new Set(list.flatMap((i) => [i.from_team_id, i.to_team_id]))];
  const partIds = [...new Set([...(parts ?? []).map((p) => p.team_id), ...involved])];
  const accepted = new Set((parts ?? []).filter((p) => p.accepted).map((p) => p.team_id));
  const isOpen = desk.status === 'open' || desk.status === 'agreed';
  const myId = me?.team_id ?? -1;
  const iAmIn = partIds.includes(myId);
  const iAmInvolved = involved.includes(myId);
  const iVoted = (votes ?? []).some((v) => v.team_id === myId);
  const [statusLabel, statusBg, statusFg] = STATUS[desk.status] ?? STATUS.open;

  // Assets anyone could put on the table: every rostered player and every 2027/2028 pick, by owner.
  const assets: Asset[] = [
    ...league.players.filter((p) => !p.list_status).map((p) => ({ key: `player:${p.id}`, teamId: p.team_id, label: `${p.name} (${p.positions.join('/')}, ${p.average?.toFixed(0) ?? '–'})`, points: playerPoints(league.ratings.get(p.id)!.value), kind: 'player' as const }))
      .sort((a, b) => b.points - a.points),
    ...(allPicks ?? []).map((p) => ({ key: `pick:${p.id}`, teamId: p.owner_team_id, label: pickLabel(p), points: pickValue(p), kind: 'pick' as const }))
      .sort((a, b) => b.points - a.points),
  ];

  return (
    <div className="wrap" style={{ maxWidth: 1180 }}>
      <span className="mono muted" style={{ fontSize: 12 }}><Link href="/market">Trademarket</Link> / <Link href="/market/desk">Trade desk</Link> / {desk.title}</span>

      <header className="card" style={{ padding: '20px 22px', display: 'flex', flexWrap: 'wrap', gap: 18, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
          <TeamBadge code={team(desk.team_id).short_code} logo={team(desk.team_id).logo_url} size={46} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="eyebrow">{team(desk.team_id).name} wants</span>
            <h1 style={{ font: '600 28px/1.1 var(--font)', letterSpacing: '-.025em' }}>{desk.title}</h1>
            {desk.details && <p className="muted" style={{ margin: '4px 0 0', maxWidth: '70ch' }}>{desk.details}</p>}
            <span className="muted" style={{ fontSize: 12 }}>Opened {ago(desk.created_at)} ago</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <span className="pill" style={{ background: statusBg, color: statusFg, padding: '5px 12px', fontSize: 12 }}>{statusLabel}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isOpen && me && !iAmIn && <form action={joinDesk.bind(null, id)}><button className="btn dark">Join this desk</button></form>}
            {isOpen && iAmIn && !iAmInvolved && myId !== desk.team_id && <form action={leaveDesk.bind(null, id)}><button className="btn">Leave</button></form>}
            {isOpen && (myId === desk.team_id || me?.is_commish) && <form action={closeDesk.bind(null, id)}><button className="btn">Close desk</button></form>}
            {desk.status === 'agreed' && me?.is_commish && <>
              <form action={vetoDesk.bind(null, id)}><button className="btn">Veto</button></form>
              <form action={executeDesk.bind(null, id)}><button className="btn green">Approve and execute</button></form>
            </>}
          </div>
        </div>
      </header>

      {error && <div role="alert" className="card" style={{ padding: '10px 14px', background: C.redBg, color: C.redFg, border: 0 }}>{error}</div>}

      {/* The deal sheet: one card per team, what they get and what they give */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row-between">
          <h2 className="h2">The deal</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            {involved.length >= 2 ? `${accepted.size >= involved.length ? involved.length : [...accepted].filter((t) => involved.includes(t)).length} of ${involved.length} teams have accepted` : 'Nothing on the table yet'}
          </span>
        </div>
        {partIds.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            {partIds.map((tid) => {
              const t = team(tid);
              const gets = list.filter((i) => i.to_team_id === tid);
              const gives = list.filter((i) => i.from_team_id === tid);
              const inPts = gets.reduce((s, i) => s + describe(i).points, 0);
              const outPts = gives.reduce((s, i) => s + describe(i).points, 0);
              const net = inPts - outPts;
              const isMe = tid === myId;
              const row = (i: (typeof list)[number], dir: 'in' | 'out') => {
                const d = describe(i);
                const other = team(dir === 'in' ? i.from_team_id : i.to_team_id);
                const canRemove = isOpen && [i.from_team_id, i.to_team_id, i.added_by_team].includes(myId);
                return (
                  <li key={i.id + dir} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 8, alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--line)' }}>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                        {d.club && <ClubDot code={d.club} size={14} />}
                        {d.href ? <Link href={d.href} style={{ color: 'inherit' }}>{d.label}</Link> : d.label}
                      </span>
                      <span className="muted" style={{ fontSize: 11 }}>{d.sub} · {dir === 'in' ? 'from' : 'to'} {other.name}</span>
                    </span>
                    <span className="mono" style={{ fontSize: 12 }}>{d.points.toLocaleString()}</span>
                    {canRemove ? (
                      <form action={removeItem.bind(null, id, i.id)}><button className="btn" aria-label={`Remove ${d.label}`} title="Remove" style={{ minHeight: 26, padding: '0 8px' }}>×</button></form>
                    ) : <span />}
                  </li>
                );
              };
              return (
                <div key={tid} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, outline: isMe ? `2px solid ${C.green5}` : undefined }}>
                  <div className="row-between" style={{ alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <TeamBadge code={t.short_code} logo={t.logo_url} size={30} />
                      <span style={{ display: 'flex', flexDirection: 'column' }}>
                        <b style={{ fontWeight: 600 }}>{t.name}</b>
                        <span className="muted" style={{ fontSize: 11 }}>{t.coach_name}{tid === desk.team_id ? ' · opened the desk' : ''}</span>
                      </span>
                    </span>
                    {involved.includes(tid) && (
                      <span className="pill" style={{ background: accepted.has(tid) ? C.green5 : C.empty, color: accepted.has(tid) ? '#fff' : C.muted, padding: '3px 10px' }}>
                        {accepted.has(tid) ? '✓ Accepted' : 'Not yet'}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="eyebrow">Gets</span>
                    <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>{gets.length ? gets.map((i) => row(i, 'in')) : <li className="muted" style={{ fontSize: 12, padding: '6px 0' }}>Nothing yet</li>}</ul>
                  </div>
                  <div>
                    <span className="eyebrow">Gives</span>
                    <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>{gives.length ? gives.map((i) => row(i, 'out')) : <li className="muted" style={{ fontSize: 12, padding: '6px 0' }}>Nothing yet</li>}</ul>
                  </div>
                  <div className="row-between" style={{ fontSize: 13, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                    <span className="muted">Net</span>
                    <b style={{ color: net > 0 ? C.green5 : net < 0 ? C.redFg : C.ink }}>{net > 0 ? '+' : ''}{net.toLocaleString()} pts</b>
                  </div>
                  {isMe && isOpen && involved.includes(tid) && (
                    <form action={setAccepted.bind(null, id, !accepted.has(tid))}>
                      <button className={accepted.has(tid) ? 'btn' : 'btn green'} style={{ width: '100%', justifyContent: 'center' }}>
                        {accepted.has(tid) ? 'Withdraw acceptance' : 'Accept this deal'}
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        ) : <p className="muted">No one’s joined yet.</p>}
      </section>

      {isOpen && me && iAmIn && (
        <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="h2">Add to the deal</h2>
          <AddItem myTeamId={myId} teams={league.teams.map((t) => ({ id: t.id, name: t.name }))} assets={assets} action={addItem.bind(null, id)} />
        </section>
      )}
      {isOpen && me && !iAmIn && (
        <p className="muted" style={{ margin: 0 }}>Join the desk to put something on the table or ask for something.</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="h2">Chat</h2>
          <div className="card" style={{ padding: '4px 14px' }}>
            {(comments ?? []).length ? (comments ?? []).map((c) => (
              <div key={c.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12 }}><b>{team(c.team_id).name}</b> <span className="muted">· {ago(c.created_at)}</span></span>
                <span>{c.body}</span>
              </div>
            )) : <p className="muted" style={{ fontSize: 13 }}>No chat yet.</p>}
          </div>
          {me && (
            <form action={deskComment.bind(null, id)} style={{ display: 'flex', gap: 8 }}>
              <label htmlFor="desk-body" className="sr-only">Message</label>
              <input id="desk-body" name="body" className="input" style={{ flex: 1 }} placeholder="Throw in a counter, ask a question…" maxLength={1000} />
              <button className="btn dark">Send</button>
            </form>
          )}
        </section>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="h2">How the desk works</h2>
          <ol className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
            <li>Anyone can join and either offer from their own list or ask another team for something.</li>
            <li>Points use the same scale as the rest of the market, so every team can see its net.</li>
            <li>Every team that sends or receives something has to accept. Any change clears all acceptances.</li>
            <li>Once everyone’s in, it goes to the commish. Approving moves every player and pick in one go. If anything has changed hands in the meantime, nothing moves.</li>
            <li>Teams outside the deal can flag it as lopsided. Six flags is the charter’s veto line.</li>
          </ol>
          {(desk.status === 'agreed' || desk.status === 'open') && me && !iAmInvolved && involved.length >= 2 && (
            <div className="row-between" style={{ fontSize: 13 }}>
              <span className="muted">{(votes ?? []).length} of 6 lopsided flags</span>
              {!iVoted && <form action={voteLopsided.bind(null, id)}><button className="btn">Flag as lopsided</button></form>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
