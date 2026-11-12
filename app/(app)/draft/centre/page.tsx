import Link from 'next/link';
import { getLeagueName } from '@/lib/league-name';
import { redirect } from 'next/navigation';
import '@/components/draft/draft.css';
import { DraftTabs } from '@/components/DraftTabs';
import { Countdown, DraftSettings, StartDraftButton } from '@/components/draft/DraftCentreClient';
import { DraftReview, UndoPostButton } from '@/components/draft/DraftReview';
import { CLUB_COLOURS } from '@/lib/draft-room';
import { getLeague, getMe } from '@/lib/data';
import { loadReady, loadRoomState, loadSignoff, roomPool, roomTeams } from '@/lib/draft-room-data';
import { DRAFT_YEAR, naPicks, orderPicks, upcoming, type RoomPick } from '@/lib/draft-room';
import PROFILES from '@/lib/draft-profiles-2026.json';

export const metadata = { title: 'Draft Centre' };
export const dynamic = 'force-dynamic';

const perth = (iso: string | null) => iso
  ? new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Perth', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  : 'Date to be set';

export default async function DraftCentrePage() {
  const leagueName = await getLeagueName();
  const me = await getMe();
  if (!me) redirect('/');
  const [league, { ready, state }, readyMap, signoff] = await Promise.all([getLeague(), loadRoomState(), loadReady(), loadSignoff()]);
  const teams = roomTeams(league);
  const team = new Map(teams.map((t) => [t.id, t]));
  const tn = (id: number) => team.get(id)?.name ?? 'Club';
  const room = state.room;
  const started = room.status !== 'scheduled';

  // Picks: from the room state once 0022 is run, otherwise straight from the league data.
  const picks: RoomPick[] = state.picks.length ? state.picks
    : league.picks.filter((p) => p.year === DRAFT_YEAR && p.overall != null && (p.kind ?? 'draft') === 'draft')
      .map((p) => ({ id: p.id, overall: p.overall!, round: p.round, owner: p.owner_team_id, orig: p.original_team_id, bonus: (p as { bonus?: string | null }).bonus ?? null, first: !!(p as { slot_first?: boolean }).slot_first }));
  const ordered = orderPicks(picks, room.snake);
  const keep = new Map(teams.map((t) => [t.id, t.keepers.length]));
  const na = naPicks(ordered, keep, room.list_max);
  const used = new Map(state.sels.filter((s) => s.pick_id != null).map((s) => [s.pick_id!, s]));
  const slots = upcoming(ordered, new Set(used.keys()), na, room.makeups ?? []);
  const rounds = Math.max(0, ...ordered.map((p) => p.round));
  const r1 = ordered.filter((p) => p.round === 1 && !p.first);
  const mine = ordered.filter((p) => p.owner === me.team_id);
  const isCoach = team.has(me.team_id);

  const spots = teams.map((t) => {
    const held = ordered.filter((p) => p.owner === t.id);
    const allow = room.list_max - t.keepers.length;
    return { t, held: held.length, allow, na: held.filter((p) => na.has(p.id)).length, drafted: state.sels.filter((s) => s.team_id === t.id && s.player).length, first: held[0]?.overall ?? null };
  });

  // ---- news ----
  type News = { team: number; title: string; body: string };
  const news: News[] = [];
  const sels = state.sels.filter((s) => s.player);
  if (sels.length) {
    const byTeam = new Map<number, typeof sels>();
    for (const s of sels) byTeam.set(s.team_id, [...(byTeam.get(s.team_id) ?? []), s]);
    const first = sels[0];
    news.push({ team: first.team_id, title: `${first.player!.n} goes first`, body: `${tn(first.team_id)} opened the night with ${first.player!.n} (${first.player!.club}, ${first.player!.pos}) at pick ${first.overall ?? 1}.` });
    for (const s of sels.filter((x) => x.player!.rookie).slice(0, 3)) {
      news.push({ team: s.team_id, title: `Rookie watch: ${s.player!.n}`, body: `${tn(s.team_id)} took the ${s.player!.club === 'Draftee' ? '2026 draftee' : `${s.player!.club} youngster`} at ${s.overall ? `pick ${s.overall}` : 'a make-up pick'}.` });
    }
    for (const [tid, list] of [...byTeam].sort((a, b) => b[1].length - a[1].length).slice(0, 4)) {
      news.push({ team: tid, title: `${tn(tid)}: ${list.length} in`, body: list.map((s) => `${s.player!.n} (${s.overall ? `#${s.overall}` : 'make-up'})`).join(', ') + '.' });
    }
  }
  const p1 = r1[0];
  if (p1 && !sels.length) {
    const top20 = ordered.filter((p) => p.owner === p1.owner && p.overall <= 20).length;
    news.push({ team: p1.owner, title: `${tn(p1.owner)} hold the No.1 pick`, body: `First on the clock${top20 > 1 ? `, with ${top20} picks inside the top 20` : ''}. Expect the best player on the board, not a need.` });
  }
  const multi = teams.map((t) => ({ t, n: r1.filter((p) => p.owner === t.id).length, list: r1.filter((p) => p.owner === t.id).map((p) => p.overall) })).filter((x) => x.n > 1);
  for (const m of multi) news.push({ team: m.t.id, title: `${m.t.name} double up in round one`, body: `Picks ${m.list.join(' and ')}: two first-rounders${m.list.some((o) => r1.find((p) => p.overall === o)?.orig !== m.t.id) ? ' thanks to a trade' : ''}.` });
  const none = teams.filter((t) => !r1.some((p) => p.owner === t.id));
  if (none.length) news.push({ team: none[0].id, title: `No first-rounder for ${none.map((t) => t.name).join(', ')}`, body: none.map((t) => { const f = ordered.find((p) => p.owner === t.id); return `${t.name} first pick at ${f ? `No.${f.overall}` : '—'}`; }).join(' · ') + '.' });
  for (const s of spots.filter((x) => x.na > 0).sort((a, b) => b.na - a.na)) {
    news.push({ team: s.t.id, title: `${s.t.name} have more picks than spots`, body: `${s.held} picks but only ${s.allow} list spots (${s.t.keepers.length} keepers). Their last ${s.na} pick${s.na > 1 ? 's are' : ' is'} N/A unless they trade.` });
  }
  for (const s of spots.filter((x) => x.held < x.allow)) {
    news.push({ team: s.t.id, title: `Room to move: ${s.t.name}`, body: `${s.allow - s.held} list spot${s.allow - s.held > 1 ? 's' : ''} more than they have picks. A buyer if picks come up in the room.` });
  }

  // ---- names to watch ----
  const pool = roomPool(league);
  const taken = new Set(state.sels.map((s) => s.player_key));
  const draftees = (PROFILES as { year: number; name: string; junior?: string; position: string; height?: number; stats?: { label: string; value: string }[] }[])
    .filter((d) => d.year === 2026).slice(0, 3);
  const vets = pool.filter((p) => !p.rookie && !taken.has(p.key) && p.avg != null && (p.games ?? 0) >= 6).slice(0, 5);
  const curTeam = state.current?.team_id ?? null;

  const header = (
    <div className="row-between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
      <div>
        <span className="eyebrow">{DRAFT_YEAR} national draft</span>
        <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>{leagueName} Draft Centre</h1>
      </div>
      <DraftTabs active="centre" />
    </div>
  );
  const chipOf = (club: string) => { const c = CLUB_COLOURS[club]; return c ? <i className="rv-cc" style={{ background: `linear-gradient(135deg,${c[0]} 50%,${c[1]} 50%)` }} /> : null; };

  // ---- awaiting sign-off ----
  if (room.status === 'done') {
    const dbIds = new Set(league.players.map((p) => p.id));
    const notKept = league.players.filter((p) => !p.is_keeper && !p.is_rookie_keeper);
    const notKeptIds = new Set(notKept.map((p) => p.id));
    const keys = sels.map((s) => s.player_key!);
    const idOf = (k: string) => (/^p:\d+$/.test(k) ? Number(k.slice(2)) : null);
    const moved = keys.filter((k) => { const id = idOf(k); return id != null && notKeptIds.has(id); }).length;
    const counts = {
      drafted: sels.length, na: na.size, moved, released: notKept.length - moved,
      created: keys.filter((k) => { const id = idOf(k); return id == null || !dbIds.has(id); }).length,
    };
    return (
      <div className="wrap">
        {header}
        <DraftReview teams={teams} sels={state.sels} pool={roomPool(league)} checks={[...signoff.checks]} requests={signoff.requests}
          me={{ team_id: isCoach ? me.team_id : null, is_commish: me.is_commish }} counts={counts} />
      </div>
    );
  }

  // ---- posted ----
  if (room.status === 'posted') {
    const snap = signoff.snapshot ?? [];
    const snapIds = new Set(snap.map((r) => r.player_id));
    const movedN = sels.filter((s) => { const m = /^p:(\d+)$/.exec(s.player_key ?? ''); return m && snapIds.has(Number(m[1])); }).length;
    const releasedN = snap.filter((r) => !r.is_keeper && !r.is_rookie_keeper).length - movedN;
    const r1s = sels.filter((s) => s.round === 1).sort((a, b) => (a.overall ?? 0) - (b.overall ?? 0));
    const byTeam = teams.map((t) => ({ t, list: sels.filter((s) => s.team_id === t.id) }));
    return (
      <div className="wrap">
        {header}
        <div className="dc-hero">
          <div style={{ position: 'relative', zIndex: 1 }}>
            <span className="k">{DRAFT_YEAR} national draft</span><span className="dc-pill ok">Posted</span>
            <h1>The {DRAFT_YEAR} draft is official</h1>
            <p>Signed off {room.posted_at ? `on ${perth(room.posted_at)}` : ''}. Every club&apos;s {DRAFT_YEAR} list is updated and the results are on the news feed.</p>
          </div>
          <div className="dc-stats"><div><b>{sels.length}</b><span>Drafted</span></div><div><b>{teams.length}</b><span>Clubs updated</span></div><div><b>{Math.max(0, releasedN)}</b><span>To free agency</span></div></div>
        </div>
        <div className="rv-banner">
          <div><b>Lists are live.</b> <span className="dc-dim">Your clubhouse now shows your {DRAFT_YEAR} list.</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isCoach && <Link href={`/clubhouse/${me.team_id}`} className="dc-btn">Go to my clubhouse</Link>}
            {me.is_commish && <UndoPostButton />}
          </div>
        </div>
        <div className="dc-grid">
          <div className="dc-col">
            <div className="dc-card">
              <span className="dc-ck">League news</span>
              <h2 style={{ fontSize: 20 }}>{DRAFT_YEAR} Draft results</h2>
              <p style={{ margin: 0 }}>{r1s[0] ? `${tn(r1s[0].team_id)} opened the night with ${r1s[0].player!.n} at pick 1. ` : ''}{sels.length} players went across the draft, {sels.filter((s) => s.player!.rookie).length} of them 2026 draftees.</p>
              <span className="dc-ck">Round 1</span>
              <div className="rv-r1">{r1s.map((s) => <div key={s.id}><em>{s.overall}</em>{chipOf(s.player!.club)}<b>{s.player!.n}</b><span>{tn(s.team_id)}</span></div>)}</div>
              <span className="dc-ck">Every club&apos;s haul</span>
              <div className="rv-hauls">{byTeam.map(({ t, list }) => <div key={t.id}><b>{t.name} · {list.length}</b>{list.map((s) => s.player!.n).join(', ') || 'No picks'}</div>)}</div>
            </div>
          </div>
          <div className="dc-col">
            <div className="dc-card"><h2>What changed</h2>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 13 }}>
                <li>{sels.length} drafted players joined their new clubs</li>
                {movedN > 0 && <li>{movedN} player{movedN > 1 ? 's' : ''} not kept were re-drafted by a new club</li>}
                <li>{Math.max(0, releasedN)} players not kept went back to free agency</li>
                <li>The draft room is locked{me.is_commish ? '. You can undo the post if something needs fixing.' : '.'}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      {header}
      {!ready && <div className="dc-warn" style={{ marginBottom: 14 }}>The draft room needs <b>supabase/migrations/0022_draft_room.sql</b> run in Supabase. Until then this page shows the pick order only.</div>}

      <div className="dc-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span className="k">{leagueName} Draft Centre · {DRAFT_YEAR} national draft</span>{' '}
          <span className={`dc-status ${room.status === 'live' ? 'live' : ''}`}>{room.status === 'live' ? 'Live now' : room.status === 'paused' ? 'Paused' : 'Scheduled'}</span>
          <h1>{room.status === 'live' || room.status === 'paused' ? `${curTeam ? tn(curTeam) : 'The room'} on the clock` : `Draft night: ${perth(room.starts_at)}`}</h1>
          <p>
            {rounds} rounds, {ordered.length} picks, {room.snake ? 'snake' : 'straight'} order. {r1[0] ? `${tn(r1[0].owner)} pick first. ` : ''}
            {'Set your queue before the night: if your timer runs out, the room picks from it.'}
          </p>
          <div className="dc-acts">
            <Link href="/draft/room" className="dc-btn lime">{started ? 'Go to the draft room' : 'Enter the draft room'}</Link>
            {isCoach && !started && <Link href="/draft/room" className="dc-btn ghost">Set my queue</Link>}
            {me.is_commish && ready && !started && <StartDraftButton />}
          </div>
        </div>
        {!started && <Countdown to={room.starts_at} />}
      </div>

      <div className="dc-grid">
        <div className="dc-col">
          <div className="dc-card">
            <span className="dc-ck">At a glance</span>
            <div className="dc-facts">
              <div><b>{room.snake ? 'Snake' : 'Straight'}</b><span>Draft order</span></div>
              <div><b>{rounds}</b><span>Rounds</span></div>
              <div><b>{Math.floor(room.pick_seconds / 60)}:{String(room.pick_seconds % 60).padStart(2, '0')}</b><span>Pick timer</span></div>
              <div><b>{room.break_every && room.break_minutes ? `${room.break_minutes} min` : 'None'}</b><span>{room.break_every && room.break_minutes ? `Break every ${room.break_every} rounds` : 'Breaks'}</span></div>
              <div><b>{room.list_max}</b><span>List size</span></div>
              <div><b>{room.trading ? 'On' : 'Off'}</b><span>Pick trading</span></div>
            </div>
          </div>

          <div className="dc-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}><h2>Round 1 order</h2><span className="dc-dim">Traded picks show where they came from</span></div>
            <div className="dc-order">
              {r1.map((p) => (
                <div key={p.id} className={p.owner === me.team_id ? 'me' : ''}>
                  <b>{p.overall}</b>
                  <span style={{ color: team.get(p.owner)?.colour }}>{tn(p.owner)}</span>
                  <em>{p.orig !== p.owner ? `from ${tn(p.orig)}` : 'own pick'}</em>
                </div>
              ))}
            </div>
            {isCoach && (<>
              <span className="dc-ck" style={{ marginTop: 4 }}>Your picks · {tn(me.team_id)} · {spots.find((s) => s.t.id === me.team_id)?.allow} list spots</span>
              <div className="dc-mine">
                {mine.map((p, i) => <span key={p.id} className={na.has(p.id) ? 'na' : used.has(p.id) ? 'used' : i < 3 ? 'early' : ''} title={na.has(p.id) ? 'N/A: your list is full by then' : undefined}>{p.first ? `R${p.round} Cup pick` : `Pick ${p.overall}`}</span>)}
                {!mine.length && <span className="dc-dim">No picks held.</span>}
              </div>
            </>)}
          </div>

          <div className="dc-card">
            <h2>Draft news</h2>
            <ul className="dc-news">
              {news.slice(0, 9).map((n, i) => (
                <li key={i}><span className="ic" style={{ background: team.get(n.team)?.colour ?? '#475569' }}>{team.get(n.team)?.short ?? '—'}</span><div><b>{n.title}</b><p>{n.body}</p></div></li>
              ))}
            </ul>
          </div>

          <div className="dc-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}><h2>Rookies and names to watch</h2><span className="dc-dim">2026 AFL draftees and the best players not kept</span></div>
            <div className="dc-rk">
              {draftees.map((d) => {
                const rank = d.stats?.find((s) => /rank/i.test(s.label))?.value;
                const tk = state.sels.find((s) => s.player?.n === d.name);
                return <div key={d.name}><b>{d.name}</b><span>{d.position}{d.height ? ` · ${d.height}cm` : ''}</span><span>{tk ? `Taken by ${tn(tk.team_id)}` : `${d.junior ?? ''}${rank ? ` · ranked ${rank}` : ''}`}</span></div>;
              })}
              {vets.map((p) => <div key={p.key}><b>{p.n}</b><span><i className={`dc-pos ${p.pos}`}>{p.pos}</i>{p.club}</span><span>Averaged {Math.round(p.avg!)} in 2026{p.was ? ` · was ${p.was}` : ' · unowned'}</span></div>)}
            </div>
          </div>
        </div>

        <div className="dc-col">
          {me.is_commish && ready && (
            <div className="dc-card dc-commish">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2>Draft settings</h2><span className="dc-ck">Commish only</span></div>
              <DraftSettings room={room} started={started} />
            </div>
          )}
          <div className="dc-card">
            <h2>List spots</h2>
            <span className="dc-dim">{room.list_max}-player lists. Keepers include the rookie keeper. Picks past a club&apos;s spots are N/A.</span>
            <table className="dc-spots">
              <thead><tr><th>Club</th><th>Keep</th><th>Spots</th><th>Picks</th><th>N/A</th>{started && <th>Drafted</th>}</tr></thead>
              <tbody>
                {spots.map((s) => (
                  <tr key={s.t.id} style={s.t.id === me.team_id ? { background: '#f3f9f4' } : undefined}>
                    <td>{s.t.name}</td><td>{s.t.keepers.length}</td><td>{s.allow}</td><td>{s.held}</td><td className={s.na ? 'bad' : ''}>{s.na || '–'}</td>{started && <td>{s.drafted}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dc-card">
            <h2>Who&apos;s ready</h2>
            <span className="dc-dim">Clubs with a queue saved</span>
            <div className="dc-ready">
              {teams.map((t) => <span key={t.id}><i className={readyMap.get(t.id) ? 'on' : ''} />{t.name}{readyMap.get(t.id) ? ` · ${readyMap.get(t.id)}` : ''}</span>)}
            </div>
          </div>
          <div className="dc-card">
            <h2>How draft night works</h2>
            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, fontSize: 13 }}>
              <li>The commish starts the draft from here or the room.</li>
              <li>Each coach gets {Math.floor(room.pick_seconds / 60)}:{String(room.pick_seconds % 60).padStart(2, '0')} on the clock.</li>
              <li>Out of time: the room takes the top player on your queue. No queue: you&apos;re skipped and pick again at the end.</li>
              <li>Trade picks in the room any time. It goes through when the other coach accepts.</li>
            </ol>
            {slots.length > 0 && started && <span className="dc-dim">{slots.length} picks to go.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
