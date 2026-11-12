'use client';
// The live G-Train Draft Room. Polls draft_room_state every 2 seconds (with the server clock, so every screen counts
// down together), calls draft_room_tick when the clock hits zero, and plays the pick announcement for every new selection.
import './draft.css';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  CLUB_COLOURS, CLUB_NAME, DRAFT_YEAR, fmtClock, naPicks, orderPicks, pickName, upcoming, withThe,
  type DraftPlayer, type Line, type RoomPick, type RoomSel, type RoomState, type RoomTeam,
} from '@/lib/draft-room';

type Me = { team_id: number | null; is_commish: boolean; first: string };
type Anim =
  | { id: string; kind: 'pick'; sel: RoomSel; phase: 'ann' | 'reveal' }
  | { id: string; kind: 'skip'; sel: RoomSel }
  | { id: string; kind: 'trade'; body: string };

const LINES: Line[] = ['DEF', 'MID', 'RUC', 'FWD'];
const ini = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('');

function Av({ p, size }: { p: { n: string; img: string | null } | null; size: 's' | 'm' | 'l' | 'xl' }) {
  const [bad, setBad] = useState(false);
  if (!p) return <span className={`dr-av ${size}`}>?</span>;
  return (
    <span className={`dr-av ${size}`}>
      {ini(p.n)}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.img && !bad && <img src={p.img} alt="" loading="lazy" onError={() => setBad(true)} />}
    </span>
  );
}
const Chip = ({ club, title = true }: { club: string; title?: boolean }) => {
  const c = CLUB_COLOURS[club];
  return c ? <i className="dr-cc" title={title ? CLUB_NAME[club] : undefined} style={{ background: `linear-gradient(135deg,${c[0]} 50%,${c[1]} 50%)` }} /> : null;
};
const Pos = ({ l }: { l: Line }) => <i className={`dr-pos ${l}`}>{l}</i>;

function chime(notes: number[], type: OscillatorType = 'triangle', gap = 0.09) {
  try {
    const W = window as unknown as { webkitAudioContext?: typeof AudioContext };
    const a = new (window.AudioContext || W.webkitAudioContext!)();
    notes.forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + i * gap;
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.55);
    });
    setTimeout(() => a.close(), 2500);
  } catch { /* no audio */ }
}
const sparks = (cols: string[]) => Array.from({ length: 26 }, (_, i) => {
  const a = (i / 26) * Math.PI * 2, r = 140 + ((i * 37) % 70);
  return <i key={i} className="dr-spark" style={{ ['--x' as string]: `${Math.cos(a) * r}px`, ['--y' as string]: `${Math.sin(a) * r}px`, background: cols[i % cols.length] }} />;
});

export function DraftRoom({ teams, pool, initial, ready, me }: { teams: RoomTeam[]; pool: DraftPlayer[]; initial: RoomState; ready: boolean; me: Me }) {
  const supabase = useMemo(() => createClient(), []);
  const [st, setSt] = useState<RoomState>(initial);
  const [offset, setOffset] = useState(() => new Date(initial.now).getTime() - Date.now());
  const [, setTick] = useState(0);
  const [tab, setTab] = useState<'queue' | 'all'>(initial.queue.length ? 'queue' : 'all');
  const [filter, setFilter] = useState<'ALL' | Line>('ALL');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [busy, setBusy] = useState(false);
  const [tradeTo, setTradeTo] = useState<number | ''>('');
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const animQ = useRef<Anim[]>([]);
  const seenSel = useRef(Math.max(0, ...initial.sels.map((s) => s.id)));
  const seenFeed = useRef(Math.max(0, ...initial.feed.map((f) => f.id)));
  const lastTick = useRef(0);
  const mutedRef = useRef(muted); mutedRef.current = muted;
  const boardRef = useRef<HTMLDivElement>(null);

  const team = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const tn = (id: number | null | undefined) => (id != null ? team.get(id)?.name ?? 'Club' : 'Club');
  const keepCount = useMemo(() => new Map(teams.map((t) => [t.id, t.keepers.length])), [teams]);
  const room = st.room;

  // ---- data -----------------------------------------------------------------------------------------------
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('draft_room_state', { y: DRAFT_YEAR });
    if (error || !data) return;
    const s = data as RoomState;
    setOffset(new Date(s.now).getTime() - Date.now());
    setSt((prev) => ({ ...prev, ...s, room: { ...prev.room, ...s.room } }));
  }, [supabase]);
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(refresh, 2000);
    const c = setInterval(() => setTick((x) => x + 1), 250);
    return () => { clearInterval(t); clearInterval(c); };
  }, [ready, refresh]);

  // ---- derived ----------------------------------------------------------------------------------------------
  const ordered = useMemo(() => orderPicks(st.picks, room.snake), [st.picks, room.snake]);
  const selByPick = useMemo(() => new Map(st.sels.filter((s) => s.pick_id != null).map((s) => [s.pick_id!, s])), [st.sels]);
  const na = useMemo(() => naPicks(ordered, keepCount, room.list_max), [ordered, keepCount, room.list_max]);
  const slots = useMemo(() => upcoming(ordered, new Set(selByPick.keys()), na, room.makeups ?? []), [ordered, selByPick, na, room.makeups]);
  const taken = useMemo(() => new Set(st.sels.map((s) => s.player_key).filter(Boolean) as string[]), [st.sels]);
  const cur = st.current;
  const curTeam = cur?.team_id ?? null;
  const live = room.status === 'live', paused = room.status === 'paused', done = room.status === 'done';
  const myTurn = live && curTeam != null && curTeam === me.team_id;
  const canDraft = live && (myTurn || me.is_commish);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // First render uses the server's time so server and browser HTML match; then the live clock takes over.
  const nowMs = mounted ? Date.now() + offset : new Date(initial.now).getTime();
  const since = room.on_clock_since ? new Date(room.on_clock_since).getTime() : null;
  const onBreak = live && since != null && nowMs < since;
  const left = paused ? room.paused_left ?? room.pick_seconds : live && since != null ? (onBreak ? (since - nowMs) / 1000 : room.pick_seconds - (nowMs - since) / 1000) : room.pick_seconds;
  const startsIn = room.starts_at ? (new Date(room.starts_at).getTime() - nowMs) / 1000 : null;

  // Clock hit zero: ask the server to auto-pick or skip (it re-checks the time, so every screen can ask).
  useEffect(() => {
    if (!live || onBreak || left > -0.5 || anim) return;
    if (Date.now() - lastTick.current < 3000) return;
    lastTick.current = Date.now();
    supabase.rpc('draft_room_tick', { y: DRAFT_YEAR }).then(() => refresh());
  });

  // ---- the moment: new selections and trades ------------------------------------------------------------------
  useEffect(() => {
    const fresh: Anim[] = [];
    for (const s of st.sels) if (s.id > seenSel.current) fresh.push(s.how === 'skip' ? { id: `s${s.id}`, kind: 'skip', sel: s } : { id: `s${s.id}`, kind: 'pick', sel: s, phase: 'ann' });
    for (const f of [...st.feed].reverse()) if (f.id > seenFeed.current && f.kind === 'trade') fresh.push({ id: `f${f.id}`, kind: 'trade', body: f.body });
    seenSel.current = Math.max(seenSel.current, ...st.sels.map((s) => s.id));
    seenFeed.current = Math.max(seenFeed.current, ...st.feed.map((f) => f.id));
    if (fresh.length) { animQ.current.push(...fresh); if (!anim) playNext(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.sels, st.feed]);

  function playNext() {
    const a = animQ.current.shift();
    if (!a) { setAnim(null); return; }
    setAnim(a);
    const snd = !mutedRef.current;
    if (a.kind === 'pick') {
      if (snd) chime([196, 196, 247], 'sine', 0.32);
      setTimeout(() => { setAnim({ ...a, phase: 'reveal' }); if (snd) chime([523.25, 659.25, 783.99, 1046.5]); }, 1700);
      setTimeout(playNext, 1700 + 2600);
    } else if (a.kind === 'skip') {
      if (snd) chime([392, 330]);
      setTimeout(playNext, 2200);
    } else {
      if (snd) chime([659.25, 880]);
      setTimeout(playNext, 2600);
    }
  }

  // Keep the pick on the clock in view on the board.
  useEffect(() => {
    const w = boardRef.current, el = w?.querySelector<HTMLElement>('.dr-cell.now');
    if (!w || !el) return;
    const rel = el.getBoundingClientRect().top - w.getBoundingClientRect().top + w.scrollTop;
    w.scrollTo({ top: Math.max(0, rel - w.clientHeight / 2 + el.offsetHeight / 2), behavior: 'smooth' });
  }, [cur?.pick_id]);

  // ---- actions --------------------------------------------------------------------------------------------------
  async function run(f: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true); setMsg(null);
    const { error } = await f();
    setBusy(false);
    if (error) setMsg(error.message.replace(/^.*?: /, ''));
    await refresh();
    return !error;
  }
  const draft = (p: DraftPlayer) => run(() => supabase.rpc('draft_room_pick', { y: DRAFT_YEAR, pkey: p.key, pl: p }));
  const control = (action: string) => run(() => supabase.rpc('draft_room_control', { y: DRAFT_YEAR, action }));
  const queueKeys = st.queue.map((x) => x.key);
  async function toggleQueue(p: DraftPlayer) {
    if (!me.team_id) return;
    if (queueKeys.includes(p.key)) {
      setSt((s) => ({ ...s, queue: s.queue.filter((x) => x.key !== p.key) }));
      await run(() => supabase.from('draft_room_queue').delete().match({ year: DRAFT_YEAR, team_id: me.team_id, player_key: p.key }));
    } else {
      setSt((s) => ({ ...s, queue: [...s.queue, { key: p.key, player: p }] }));
      await run(() => supabase.from('draft_room_queue').insert({ year: DRAFT_YEAR, team_id: me.team_id, player_key: p.key, player: p, rank: Date.now() % 2_000_000_000 }));
    }
  }
  async function moveUp(key: string) {
    const i = queueKeys.indexOf(key);
    if (i <= 0 || !me.team_id) return;
    const next = [...st.queue];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setSt((s) => ({ ...s, queue: next }));
    await run(() => Promise.all(next.map((x, r) => supabase.from('draft_room_queue').update({ rank: r }).match({ year: DRAFT_YEAR, team_id: me.team_id, player_key: x.key })))
      .then((rs) => ({ error: rs.find((r) => r.error)?.error ?? null })));
  }
  async function sendOffer() {
    if (!tradeTo) return;
    const ok = await run(() => supabase.rpc('draft_room_offer', { y: DRAFT_YEAR, to_team: tradeTo, gv: give, gt: get }));
    if (ok) { setGive([]); setGet([]); setMsg('Offer sent. It goes through when they accept.'); }
  }
  const respond = (id: number, accept: boolean) => run(() => supabase.rpc('draft_room_respond', { trade: id, accept }));

  // ---- views ---------------------------------------------------------------------------------------------------
  const pickLabel = (id: number) => { const p = st.picks.find((x) => x.id === id); return p ? pickName(p) : 'a pick'; };
  const cols = useMemo(() => ordered.filter((p) => p.round === 1 && !p.first).map((p) => p.orig), [ordered]);
  const bonusPicks = ordered.filter((p) => p.first);
  const rounds = useMemo(() => [...new Set(ordered.map((p) => p.round))].sort((a, b) => a - b), [ordered]);
  const myPicks = ordered.filter((p) => p.owner === me.team_id);
  const myNext = slots.find((s) => (s.kind === 'pick' ? s.pick.owner : s.team) === me.team_id);
  const myAllow = me.team_id ? room.list_max - (keepCount.get(me.team_id) ?? 0) : null;

  const players = useMemo(() => {
    const avail = pool.filter((p) => !taken.has(p.key));
    if (tab === 'queue') return st.queue.map((x) => avail.find((p) => p.key === x.key) ?? (taken.has(x.key) ? null : x.player)).filter(Boolean) as DraftPlayer[];
    const s = q.trim().toLowerCase();
    return avail.filter((p) => (filter === 'ALL' || p.positions.includes(filter)) && (!s || p.n.toLowerCase().includes(s) || p.club.toLowerCase().includes(s))).slice(0, 250);
  }, [pool, taken, tab, st.queue, q, filter]);

  // Team panel follows the club picking (or on the clock).
  const focusTeamId = anim && anim.kind !== 'trade' ? anim.sel.team_id : curTeam ?? me.team_id ?? teams[0]?.id;
  const focus = focusTeamId != null ? team.get(focusTeamId) : undefined;
  const drafted = focus ? st.sels.filter((s) => s.team_id === focus.id && s.player).map((s) => ({ ...s.player!, at: s.overall })) : [];
  const fHeld = focus ? ordered.filter((p) => p.owner === focus.id) : [];
  const fNa = fHeld.filter((p) => na.has(p.id)).length;
  const lastNew = anim && anim.kind === 'pick' ? anim.sel.player_key : null;

  const recent = [...st.sels].filter((s) => s.player).reverse();
  const latest = recent[0];
  const incoming = st.trades.filter((t) => t.status === 'pending' && t.to_team === me.team_id);
  const outgoing = st.trades.filter((t) => t.status === 'pending' && t.from_team === me.team_id);
  const unused = (owner: number | '' | null) => ordered.filter((p) => p.owner === owner && !selByPick.has(p.id));

  const circ = 238.8;
  const frac = live && !onBreak ? Math.max(0, Math.min(1, left / room.pick_seconds)) : paused ? Math.max(0, Math.min(1, left / room.pick_seconds)) : 1;
  const ringText = done ? '✓' : live || paused ? fmtClock(left) : startsIn != null && startsIn > 0
    ? (startsIn > 86400 ? `${Math.floor(startsIn / 86400)}d ${Math.floor((startsIn % 86400) / 3600)}h` : startsIn > 3600 ? `${Math.floor(startsIn / 3600)}h ${Math.floor((startsIn % 3600) / 60)}m` : fmtClock(startsIn))
    : fmtClock(room.pick_seconds);

  const cell = (p: RoomPick) => {
    const s = selByPick.get(p.id);
    const dead = na.has(p.id) && !s;
    const now = live && cur?.pick_id === p.id;
    const cls = ['dr-cell', s && s.how !== 'skip' ? 'fill' : '', s?.how === 'skip' ? 'skip' : '', dead ? 'na' : '', now ? 'now' : '',
      s && latest && s.id === latest.id ? 'just' : '', p.owner === me.team_id ? 'my' : ''].join(' ');
    return (
      <div key={p.id} className={cls}>
        <span className="no">Pick <b>{p.overall}</b></span>
        {p.owner !== p.orig && <span className="ow">{tn(p.owner)}<br />via {tn(p.orig)}</span>}
        {dead ? <span className="pl"><b>N/A · list full</b></span>
          : s?.how === 'skip' ? <span className="pl"><b>Skipped · picks at the end</b></span>
          : s?.player ? (
            <span className="pl"><Av p={s.player} size="s" /><span><b>{s.player.n}</b><span className="dr-cl"><Chip club={s.player.club} /><Pos l={s.player.pos} /></span></span></span>
          ) : null}
      </div>
    );
  };

  if (!ready) {
    return (
      <div className="drm"><div className="dr-welcome"><div><h1>Draft Room</h1><p>The draft room needs <b>supabase/migrations/0022_draft_room.sql</b> run in Supabase first.</p></div></div></div>
    );
  }

  return (
    <div className="drm">
      <div className="dr-welcome">
        <div>
          <h1>Welcome to the draft room, <span>{me.first}</span></h1>
          <p>
            {DRAFT_YEAR} national draft
            {me.team_id ? <> · {tn(me.team_id)} · {keepCount.get(me.team_id)} keepers, {myAllow} list spots to fill
              {myNext ? <> · your next pick is {myNext.kind === 'pick' ? `No.${myNext.pick.overall}` : 'a make-up pick'}</> : myPicks.length ? ' · you’re done' : ''}</> : null}
          </p>
        </div>
        <div className="dr-ctrl">
          <Link href="/draft/centre" className="dr-btn" style={{ textDecoration: 'none' }}>Draft Centre</Link>
          <button className="dr-btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? 'Sound off' : 'Sound on'}</button>
          {me.is_commish && (<>
            {room.status === 'scheduled' && <button className="dr-btn g" disabled={busy} onClick={() => control('start')}>Start the draft</button>}
            {live && <button className="dr-btn" disabled={busy} onClick={() => control('pause')}>Pause</button>}
            {paused && <button className="dr-btn g" disabled={busy} onClick={() => control('resume')}>Resume</button>}
            {(live || paused || done) && st.sels.length > 0 && <button className="dr-btn r" disabled={busy} onClick={() => { if (confirm('Undo the last pick? That club goes back on the clock.')) control('undo'); }}>Undo last pick</button>}
          </>)}
        </div>
      </div>
      {(done || room.status === 'posted') && (
        <div className="dr-welcome" style={{ padding: '12px 16px' }}>
          <p style={{ margin: 0, color: 'var(--nt)' }}>{room.status === 'posted' ? 'The draft has been signed off and posted. Every club’s list is updated.' : 'That’s the draft done. Check your new list and tick it off in the Draft Centre before the commish posts it.'}</p>
          <Link href="/draft/centre" className="dr-btn g" style={{ textDecoration: 'none' }}>{room.status === 'posted' ? 'See the results' : 'Review my list'}</Link>
        </div>
      )}
      {msg && <div className="dr-msg" role="status">{msg}</div>}

      <div className="dr-main">
        {/* players: full height on the left */}
        <aside className="dr-p dr-players">
          <h3>Players <span className="dr-k">{pool.length - taken.size} left</span></h3>
          <div className="dr-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'on' : ''} onClick={() => setTab('queue')}>My queue ({st.queue.filter((x) => !taken.has(x.key)).length})</button>
            <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>All available</button>
          </div>
          {tab === 'all' && (<>
            <input className="dr-search" placeholder="Search players or clubs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
            <div className="dr-filt">{(['ALL', ...LINES] as const).map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>)}</div>
          </>)}
          <div className="dr-list">
            {players.length ? players.map((p, i) => (
              <div key={p.key} className="dr-row">
                {tab === 'queue' ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="qn">{i + 1}</span><Av p={p} size="m" /></span> : <Av p={p} size="m" />}
                <div style={{ minWidth: 0 }}>
                  <b>{p.n}{p.rookie && <span className="dr-rook">ROOKIE</span>}</b>
                  <span className="sub dr-cl"><Pos l={p.pos} /><Chip club={p.club} />{p.club}{p.was ? ` · was ${p.was}` : p.note ? ` · ${p.note}` : ''}</span>
                </div>
                <em title={p.avg != null ? `2026 average${p.games ? ` from ${p.games} games` : ''}` : 'No AFL games yet'}>{p.avg != null ? Math.round(p.avg) : '–'}</em>
                <span className="acts">
                  {me.team_id && (tab === 'queue'
                    ? <><button className="q" onClick={() => moveUp(p.key)} aria-label="Move up">↑</button><button className="q" onClick={() => toggleQueue(p)} aria-label="Remove from queue">✕</button></>
                    : <button className={`q ${queueKeys.includes(p.key) ? 'on' : ''}`} onClick={() => toggleQueue(p)}>{queueKeys.includes(p.key) ? 'Queued' : '+ Queue'}</button>)}
                  <button className="d" disabled={!canDraft || busy || !!anim} onClick={() => draft(p)} title={canDraft ? `Draft ${p.n}` : 'Not your pick'}>Draft</button>
                </span>
              </div>
            )) : <div className="dr-help" style={{ padding: 10 }}>{tab === 'queue' ? 'Your queue is empty. Add players from "All available".' : 'No players match.'}</div>}
          </div>
          {tab === 'queue' && <span className="dr-help">Saved to your club. If your timer runs out, the room takes the top player still on your queue. Empty queue: your pick is skipped and you pick again at the end of the draft.</span>}
        </aside>

        <div className="dr-right">
          <div className="dr-top">
            <div className="dr-clock">
              <div className="dr-ring" aria-label="Pick clock">
                <svg width="86" height="86" viewBox="0 0 86 86">
                  <circle cx="43" cy="43" r="38" fill="none" stroke="#272b34" strokeWidth="7" />
                  <circle cx="43" cy="43" r="38" fill="none" stroke={live && !onBreak && left <= 15 ? '#ff6b5b' : onBreak ? '#4cc9f0' : '#c6f135'} strokeWidth="7" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)} />
                </svg>
                <b className={`num ${ringText.length > 5 ? 'long' : ''}`}>{ringText}</b>
              </div>
              <div className="dr-who">
                <span className="dr-k g">{done ? 'Draft complete' : paused ? 'Paused' : onBreak ? 'Break · back in' : live ? (cur?.makeup ? 'On the clock · make-up pick' : 'On the clock') : 'First pick'}</span>
                <h2>{done ? 'That’s a wrap' : curTeam != null ? tn(curTeam) : '—'}</h2>
                <p>{done ? `${st.sels.filter((s) => s.player).length} players drafted` : curTeam != null ? team.get(curTeam)?.coach : ''}</p>
                {!done && cur && <span className="pk">{cur.makeup ? 'Skipped pick, taken at the end' : `${cur.overall != null ? `Pick ${cur.overall}` : 'Cup bonus pick'} · Round ${cur.rnd}${(() => { const p = st.picks.find((x) => x.id === cur.pick_id); return p && p.orig !== p.owner ? ` · via ${tn(p.orig)}` : ''; })()}`}</span>}
              </div>
            </div>
            <div className="dr-next">
              <span className="dr-k">Up next</span>
              <div className="dr-nx num">
                {slots.slice(cur ? 1 : 0, (cur ? 1 : 0) + 5).map((s, i) => {
                  const owner = s.kind === 'pick' ? s.pick.owner : s.team;
                  const via = s.kind === 'pick' && s.pick.orig !== s.pick.owner ? s.pick.orig : null;
                  return (
                    <div key={i} className={owner === me.team_id ? 'me' : ''}>
                      <i style={{ background: team.get(owner)?.colour }} />
                      <small>{s.kind === 'pick' ? (s.pick.first ? 'Cup pick' : 'Pick') : 'Make-up'}</small>
                      <b>{s.kind === 'pick' ? s.pick.overall ?? '★' : '+'}</b>
                      <strong>{tn(owner)}</strong>
                      <span>{team.get(owner)?.coach}</span>
                      {via ? <em>via {tn(via)}</em> : owner === me.team_id ? <em>That’s you</em> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="dr-board-wrap" ref={boardRef}>
            <div className="dr-board num">
              <div className="dr-bh">Rd</div>
              {cols.map((t) => <div key={t} className={`dr-bh ${t === me.team_id ? 'me' : ''}`}><i style={{ background: team.get(t)?.colour }} />{tn(t)}</div>)}
              {rounds.map((r) => {
                const inRound = ordered.filter((p) => p.round === r && !p.first);
                return [
                  <div key={`r${r}`} className="dr-rl">{r}</div>,
                  ...cols.map((c, i) => { const p = inRound.find((x) => x.orig === c) ?? inRound[i]; return p ? cell(p) : <div key={`e${r}-${i}`} className="dr-cell" />; }),
                ];
              })}
            </div>
          </div>
          {bonusPicks.length > 0 && (
            <div className="dr-makeups">
              <span className="dr-k">Cup bonus picks · first in their round</span>
              {bonusPicks.map((p) => { const x = selByPick.get(p.id); return (
                <span key={p.id} className="dr-chip" style={live && cur?.pick_id === p.id ? { boxShadow: 'inset 0 0 0 2px var(--ng)' } : undefined}>
                  {p.bonus ?? 'Bonus'} · R{p.round} · {tn(p.owner)}{x?.player ? <> · <Chip club={x.player.club} />{x.player.n}</> : na.has(p.id) ? ' · N/A' : ''}
                </span>
              ); })}
            </div>
          )}
          {(room.makeups?.length > 0 || st.sels.some((s) => s.pick_id == null)) && (
            <div className="dr-makeups">
              <span className="dr-k">Make-up picks</span>
              {st.sels.filter((s) => s.pick_id == null && s.player).map((s) => <span key={s.id} className="dr-chip"><Chip club={s.player!.club} />{s.player!.n} · {tn(s.team_id)}</span>)}
              {(room.makeups ?? []).map((t, i) => <span key={`m${i}`} className="dr-chip" style={{ opacity: 0.7 }}>{tn(t)} · to come</span>)}
            </div>
          )}

          <div className="dr-low">
            <div className="dr-p">
              {focus && (<>
                <div className="dr-team-h">
                  <i className="sw" style={{ background: focus.colour }} />
                  <div>
                    <span className="dr-k g">{focus.id === curTeam && live ? 'On the clock · ' : ''}Squad</span>
                    <b>{focus.name}</b>
                    <span className="meta">{focus.coach} · {focus.keepers.length} keepers + {drafted.length} drafted · <strong style={{ color: 'var(--nt)' }}>{focus.keepers.length + drafted.length}/{room.list_max}</strong> list spots · can draft {room.list_max - focus.keepers.length}, holds {fHeld.length} picks{fNa ? <> · <strong style={{ color: '#ff8b7d' }}>{fNa} N/A</strong></> : null}</span>
                  </div>
                </div>
                <div className="dr-lines">
                  {LINES.map((ln) => {
                    const ps = [...focus.keepers.map((p) => ({ ...p, at: null as number | null })), ...drafted].filter((p) => p.pos === ln);
                    return (
                      <div key={ln} className="dr-ln"><span>{ln} · {ps.length}</span>
                        <div>{ps.map((p) => (
                          <div key={p.key} className={`dr-pp ${p.at != null || p.key === lastNew ? 'new' : ''}`} title={p.at != null ? `Pick ${p.at}` : 'Keeper'}>
                            <Av p={p} size="s" /><Chip club={p.club} /><span className="nm">{p.n}</span>
                          </div>
                        ))}</div>
                      </div>
                    );
                  })}
                </div>
              </>)}
            </div>

            <div className="dr-p">
              <h3>Last picked</h3>
              {latest?.player ? (
                <div className="dr-last">
                  <Av p={latest.player} size="l" />
                  <div>
                    <span className="dr-k g">{latest.overall ? `Pick ${latest.overall}` : 'Make-up pick'} · {tn(latest.team_id)}</span>
                    <b>{latest.player.n}</b>
                    <span className="sub dr-cl"><Chip club={latest.player.club} />{latest.player.club} <Pos l={latest.player.pos} />{latest.how === 'auto' ? ' · from their queue' : latest.how === 'commish' ? ' · by the commish' : ''}</span>
                  </div>
                </div>
              ) : <div className="dr-last"><Av p={null} size="l" /><div><span className="dr-k">Waiting</span><b>No picks yet</b><span className="sub">The first pick lands here</span></div></div>}
              <div className="dr-recent">
                {recent.slice(1, 3).map((s) => <div key={s.id}><em>{s.overall ? `#${s.overall}` : '+'}</em><Av p={s.player} size="s" /><Chip club={s.player!.club} /><b>{s.player!.n}</b><span>{tn(s.team_id)}</span></div>)}
              </div>
              <span className="dr-k">Room feed</span>
              <div className="dr-feed">
                {st.feed.length ? st.feed.map((f) => <div key={f.id} className={f.kind}>{f.body}</div>) : <div>The room opens before the first pick. Set your queue while you wait.</div>}
              </div>

              {room.trading && me.team_id && !done && (
                <div className="dr-trade">
                  <span className="dr-k">Trade picks</span>
                  {incoming.map((t) => (
                    <div key={t.id} className="dr-offer">
                      <span><b style={{ color: 'var(--nt)' }}>{tn(t.from_team)}</b> offer {t.give_picks.map(pickLabel).join(' + ') || 'nothing'} for your {t.get_picks.map(pickLabel).join(' + ') || 'nothing'}.</span>
                      <span className="acts"><button className="dr-btn g" disabled={busy} onClick={() => respond(t.id, true)}>Accept</button><button className="dr-btn" disabled={busy} onClick={() => respond(t.id, false)}>Decline</button></span>
                    </div>
                  ))}
                  {outgoing.map((t) => (
                    <div key={t.id} className="dr-offer">
                      <span>Waiting on <b style={{ color: 'var(--nt)' }}>{tn(t.to_team)}</b>: your {t.give_picks.map(pickLabel).join(' + ') || 'nothing'} for their {t.get_picks.map(pickLabel).join(' + ') || 'nothing'}.</span>
                      <span className="acts"><button className="dr-btn" disabled={busy} onClick={() => respond(t.id, false)}>Cancel offer</button></span>
                    </div>
                  ))}
                  <select value={tradeTo} onChange={(e) => { setTradeTo(e.target.value ? Number(e.target.value) : ''); setGet([]); }} aria-label="Club to trade with">
                    <option value="">Trade with…</option>
                    {teams.filter((t) => t.id !== me.team_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {tradeTo !== '' && (<>
                    <span className="dr-help">You give</span>
                    <div className="dr-pickchips">{unused(me.team_id).map((p) => <button key={p.id} className={give.includes(p.id) ? 'on' : ''} onClick={() => setGive((g) => g.includes(p.id) ? g.filter((x) => x !== p.id) : [...g, p.id])}>{p.overall ?? `R${p.round} Cup`}</button>)}</div>
                    <span className="dr-help">You get from {tn(tradeTo)}</span>
                    <div className="dr-pickchips">{unused(tradeTo).map((p) => <button key={p.id} className={get.includes(p.id) ? 'on' : ''} onClick={() => setGet((g) => g.includes(p.id) ? g.filter((x) => x !== p.id) : [...g, p.id])}>{p.overall ?? `R${p.round} Cup`}</button>)}</div>
                    <button className="dr-btn g" disabled={busy || (!give.length && !get.length)} onClick={sendOffer}>Send offer</button>
                  </>)}
                  <span className="dr-help">Goes through once the other coach accepts. The whole room is told.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={`dr-reveal ${anim ? 'on' : ''}`} aria-live="polite" onClick={() => { /* let people dismiss early */ }}>
        {anim && (
          anim.kind === 'pick' ? (anim.phase === 'ann' ? (
            <div className="dr-rv ann">
              <span className="dr-k g">{anim.sel.how === 'auto' ? 'Auto-picked from their queue' : anim.sel.how === 'commish' ? 'Entered by the commish' : 'The pick is in'}</span>
              <p className="dr-ann">{anim.sel.overall ? `At pick ${anim.sel.overall}` : 'With their make-up pick'},<br /><b>{withThe(tn(anim.sel.team_id))}</b> have selected…</p>
              <div className="dr-dots"><i /><i /><i /></div>
            </div>
          ) : (
            <div className="dr-rv">
              <span className="dr-k g">{anim.sel.overall ? `Pick ${anim.sel.overall}` : 'Make-up pick'} · {tn(anim.sel.team_id)}</span>
              <Av p={anim.sel.player} size="xl" />
              <h2>{anim.sel.player?.n}</h2>
              <p className="dr-meta">
                {anim.sel.player && CLUB_COLOURS[anim.sel.player.club] ? <><Chip club={anim.sel.player.club} /><span>{CLUB_NAME[anim.sel.player.club]}</span></> : <span>{anim.sel.player?.club}{anim.sel.player?.rookie ? ' · 2026 draftee' : ''}</span>}
                {anim.sel.player && <Pos l={anim.sel.player.pos} />}
              </p>
              {sparks(['#c6f135', '#4cc9f0', '#ffffff', ...(anim.sel.player && CLUB_COLOURS[anim.sel.player.club] ? CLUB_COLOURS[anim.sel.player.club] : [])])}
            </div>
          )) : anim.kind === 'skip' ? (
            <div className="dr-rv skip">
              <span className="dr-k" style={{ color: '#ff8b7d' }}>Pick {anim.sel.overall} skipped</span>
              <h2>{tn(anim.sel.team_id)}</h2>
              <p>Out of time and no queue. They’ll pick again at the end of the draft.</p>
            </div>
          ) : (
            <div className="dr-rv trade">
              <span className="dr-k" style={{ color: 'var(--nc)' }}>Trade accepted by both coaches</span>
              <h2>Pick trade</h2>
              <p style={{ maxWidth: 420 }}>{anim.body.replace(/^Trade done: /, '')}</p>
              {sparks(['#4cc9f0', '#ffffff'])}
            </div>
          )
        )}
      </div>
    </div>
  );
}
