'use client';
// Matchday · Squad Selector. Left: your whole list beside the field (3-2 / 4-3 / 1 / 3-2 + emergencies), drag and drop
// or tap to place. Right: the matchup for whichever game is picked in the dropdown, and the Knockout Cup.
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CLUBS } from '@/lib/clubs';
import { jumper } from '@/lib/jumpers';
import { RULES, autoFill, filledField, fits, onField, projTotal, rowsFor, type MdLineup, type MdPlayer, type Pos, type Rules, type SlotRule } from '@/lib/matchday';
import type { GameOpt, MatchdayData, Side } from '@/lib/matchday-data';
import type { MiniLink } from '@/lib/minis';
import { saveGameLineup } from '@/app/(app)/live/matchday-actions';
import { CupPanel, type CupData } from './cup';
import { Shell } from './kit';
import { ProfileTabs } from './profile-tabs';
import { R1_2027 } from '@/lib/mens-round';
import { liveOf, rtCol } from './mens';
import type { MGame, MPlayer } from '@/lib/mens-round';

const POS_COL: Record<Pos, string> = { DEF: 'var(--def)', MID: 'var(--mid)', RUC: 'var(--ruc)', FWD: 'var(--fwd)' };
const empty = (r: Rules): MdLineup => ({ slots: Object.fromEntries(r.slots.map((s) => [s.key, []])), c: null, vc: null });
const initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('');
const short = (n: string) => { const w = n.split(' '); return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(' ')}` : n; };
export const shortGame = (g: GameOpt) => `${g.label.replace('Knockout Cup · Round ', 'Cup R').replace(' · Round ', ' R')}${g.opp ? ` · v ${g.opp.name}` : ''}`;

export function Disc({ p, size = 16, label = false }: { p: MdPlayer; size?: number; label?: boolean }) {
  return (
    <span className="sq-disc" style={{ width: size, height: size, background: jumper(p.club) }} title={p.club ? CLUBS[p.club]?.name ?? p.club : undefined} aria-hidden="true">
      {label && <b style={{ fontSize: Math.round(size * 0.32) }}>{initials(p.name)}</b>}
    </span>
  );
}

export function Form({ p, size = 14 }: { p: MdPlayer; size?: number }) {
  if (!p.form) return null;
  const [rot, col, label] = ({ up: ['rotate(-45 10 10)', '#10a35a', 'Form rising'], down: ['rotate(45 10 10)', '#d6452f', 'Form falling'], flat: ['', '#c9930f', 'Form steady'] } as const)[p.form];
  return (
    <svg className="sq-form" width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={label}>
      <title>{`${label}${p.l5 != null ? `: last 5 avg ${p.l5}` : ''}`}</title>
      <g transform={rot}><path d="M4 10 H15 M11 6 L15 10 L11 14" fill="none" stroke={col} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></g>
    </svg>
  );
}

const Info = ({ p, onInfo }: { p: MdPlayer; onInfo: (p: MdPlayer) => void }) => (
  <button type="button" className="sq-info" draggable={false} aria-label={`${p.name} profile`} title="Profile"
    onClick={(e) => { e.stopPropagation(); onInfo(p); }} onPointerDown={(e) => e.stopPropagation()}>i</button>
);

/* ---------------- profile pop-up (same layout as the Matchups pop-up) ---------------- */
function SquadSheet({ p, slot, cap, vc, onClose, clubName, gameName }: { p: MdPlayer; slot: string | null; cap: boolean; vc: boolean; onClose: () => void; clubName: string | null; gameName: string }) {
  const afl = p.club ? R1_2027.find((g) => g.home === p.club || g.away === p.club) : undefined;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, []);
  const t0 = afl ? Date.parse(afl.start) : 0;
  const started = now != null && afl != null && now >= t0, live = started && now! < t0 + 3 * 3600e3;
  const when = afl && now != null ? new Date(afl.start).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const pr = p.prof;
  return (
    <div className="rh-sheet-back" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-sheet" role="dialog" aria-modal="true" aria-label={`${p.name} profile`}>
        <div className="mx-sh-head">
          <Disc p={p} size={56} label />
          <div style={{ minWidth: 0, flex: 1 }}>
            <span className="rh-k">{p.keeper === 'RK' ? 'Rookie keeper' : p.keeper === 'K' ? 'Keeper' : 'On your list'}{cap ? ' · Captain' : vc ? ' · Vice-captain' : ''}</span>
            <h3 className="mx-sh-name">{p.name}</h3>
            <span className="rh-dim" style={{ fontSize: 13 }}>{p.club ? CLUBS[p.club]?.name ?? p.club : 'No club'} · {p.pos.join('/')}{p.age != null ? ` · ${p.age} yo` : ''}</span>
          </div>
          <button className="rh-btn alt" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <ProfileTabs roundLabel="This round" prof={pr} proj={p.proj} clubName={clubName} round={<>
          {afl && (
            <div className="pt-match">
              <div><b>{afl.home} v {afl.away}</b><span className="rh-dim" suppressHydrationWarning>{afl.venue} · {when}</span></div>
              <span className={`pt-state ${live ? 'live' : ''}`}>{live ? 'Live' : started ? 'Played' : 'Not started'}</span>
            </div>
          )}
          <div className="mx-sh-now">
            <div><span className="rh-k">{gameName}</span><b className="rh-mono">{slot ?? '–'}</b><span className="rh-dim">{slot ? (slot === 'EMG' || slot.startsWith('E') && slot.length === 4 ? 'emergency' : 'in your team') : 'not selected'}</span></div>
            <div><span className="rh-k">Projected</span><b className="rh-mono">{cap ? p.proj * 2 : p.proj}</b><span className="rh-dim">{cap ? 'doubled as captain' : vc ? 'vice-captain' : 'this round'}</span></div>
            <div><span className="rh-k">Form</span><b className="rh-mono" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Form p={p} size={14} />{p.l5 ?? '–'}</b><span className="rh-dim">last 5 avg</span></div>
          </div>
          <span className="rh-dim" style={{ fontSize: 12.5 }}>{started ? 'Live scores and his stat line show here once 2027 scores are flowing.' : 'His score, time on ground and stat line show here once his game starts.'}</span>
        </>} />
        <a href={`/players/${p.id}`} className="rh-btn go lg" style={{ alignSelf: 'stretch', textAlign: 'center' }}>Open full profile →</a>
      </div>
    </div>
  );
}

/* ---------------- squad selector (left) ---------------- */
type Pick = { pid: number; from: string | null } | null;
/** Live scores for the mobile list: this round's simulated men's games (same source as Live Matchups). */
export interface LiveSrc { now: number; games: MGame[]; players: MPlayer[] }
function Selector({ game, games, onGame, rules, squad, initial, used, tied, clubName, onChange, liveSrc }: {
  liveSrc?: LiveSrc | null; clubName: string | null; game: GameOpt; games: GameOpt[]; onGame: (id: string) => void; rules: Rules; squad: MdPlayer[]; initial: MdLineup | null; used: number[]; tied: Record<number, string>; onChange: (l: MdLineup) => void;
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);
  // Cut a saved lineup to the current slot counts (e.g. cup lineups saved when it had 6 MID).
  const [lineup, setLineupRaw] = useState<MdLineup>(() => initial ? { ...initial, slots: Object.fromEntries(rules.slots.map((sl) => [sl.key, (initial.slots[sl.key] ?? []).slice(0, sl.n)])) } : empty(rules));
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState<'ALL' | Pos>('ALL');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Pick>(null);
  const [swap, setSwap] = useState<number | null>(null);
  const [drag, setDrag] = useState<Pick>(null);
  const [over, setOver] = useState<string | null>(null);
  const [sheet, setSheet] = useState<MdPlayer | null>(null);
  const [showProj, setShowProj] = useState(true);
  useEffect(() => { try { if (localStorage.getItem('khq-sq-proj') === '0') setShowProj(false); } catch { /* storage off */ } }, []);
  const toggleProj = () => setShowProj((v) => { try { localStorage.setItem('khq-sq-proj', v ? '0' : '1'); } catch { /* storage off */ } return !v; });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  /** this round's AFL game for a club: "v SYD · Wed 7:30pm" in the viewer's time */
  const fixtureOf = (club: string | null) => {
    const g = club ? R1_2027.find((x) => x.home === club || x.away === club) : undefined;
    if (!g) return 'No game this round';
    const opp = g.home === club ? g.away : `@ ${g.home}`;
    const when = mounted ? new Date(g.start).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace(',', '').replace(/\s?([ap])m/, '$1m') : '';
    return `${g.home === club ? 'v ' : ''}${opp}${when ? ` · ${when}` : ''}`;
  };
  const [pending, start] = useTransition();
  const setLineup = (l: MdLineup) => { setLineupRaw(l); setDirty(true); setMsg(null); onChange(l); };

  const slotOf = useMemo(() => { const m = new Map<number, string>(); for (const [k, ids] of Object.entries(lineup.slots)) for (const id of ids) m.set(id, k); return m; }, [lineup]);
  const rule = (key: string) => rules.slots.find((s) => s.key === key)!;
  const proj = (id: number) => byId.get(id)?.proj ?? 0;
  const total = projTotal(rules, lineup, proj), count = filledField(rules, lineup), need = onField(rules);
  const moving = drag ?? picked;
  const movingP = moving ? byId.get(moving.pid) : undefined;
  const big = rules.key !== 'survivor';

  // Every spot as (slot key, index) so a line's spots can be laid out across rows.
  const place = (pid: number, key: string, i: number) => {
    const p = byId.get(pid), s = rule(key);
    if (!p) return;
    if (!fits(p, s, rules)) { setMsg({ ok: false, text: rules.eligible && !rules.eligible(p) ? `${short(p.name)} isn’t eligible for the ${rules.name}.` : `${short(p.name)} can’t play ${s.label}.` }); return; }
    if (used.includes(pid)) { setMsg({ ok: false, text: `You’ve already used ${short(p.name)}.` }); return; }
    if (tied[pid]) { setMsg({ ok: false, text: `${short(p.name)} is cup-tied: he played a cup game for ${tied[pid]}, so he can’t play in your cup team.` }); return; }
    const slots: Record<string, (number | undefined)[]> = Object.fromEntries(rules.slots.map((r) => [r.key, Array.from({ length: r.n }, (_, j) => lineup.slots[r.key]?.[j])]));
    let from: [string, number] | null = null;
    for (const [k, arr] of Object.entries(slots)) { const j = arr.indexOf(pid); if (j >= 0) { from = [k, j]; arr[j] = undefined; } }
    const occupant = slots[key][i];
    slots[key][i] = pid;
    let c = lineup.c, vc = lineup.vc;
    if (occupant != null && occupant !== pid) {
      const op = byId.get(occupant)!;
      if (from && fits(op, rule(from[0]), rules)) slots[from[0]][from[1]] = occupant;
      else { if (c === occupant) c = null; if (vc === occupant) vc = null; }
    }
    if (s.bench) { if (c === pid) c = null; if (vc === pid) vc = null; }
    setLineup({ slots: Object.fromEntries(Object.entries(slots).map(([k, arr]) => [k, arr.filter((x): x is number => x != null)])), c, vc });
    setPicked(null);
  };
  const remove = (pid: number) => {
    setLineup({ slots: Object.fromEntries(Object.entries(lineup.slots).map(([k, v]) => [k, v.filter((x) => x !== pid)])), c: lineup.c === pid ? null : lineup.c, vc: lineup.vc === pid ? null : lineup.vc });
    setPicked(null);
  };
  // Swap arrows: pick one player, then any player he can trade places with lights up; the rest grey out.
  const locOf = (pid: number): [string, number] | null => { const k = slotOf.get(pid); return k ? [k, lineup.slots[k].indexOf(pid)] : null; };
  const blocked = (pid: number) => used.includes(pid) || !!tied[pid] || (!!rules.eligible && !rules.eligible(byId.get(pid)!));
  const swapOk = (a: number, b: number) => {
    if (a === b) return false;
    const pa = byId.get(a), pb = byId.get(b); if (!pa || !pb) return false;
    const la = locOf(a), lb = locOf(b);
    if (la && lb) return fits(pa, rule(lb[0]), rules) && fits(pb, rule(la[0]), rules);
    if (la) return !blocked(b) && fits(pb, rule(la[0]), rules);
    if (lb) return !blocked(a) && fits(pa, rule(lb[0]), rules);
    return false;
  };
  const doSwap = (b: number) => {
    const a = swap; if (a == null) return;
    if (!swapOk(a, b)) { setMsg({ ok: false, text: `${short(byId.get(a)!.name)} and ${short(byId.get(b)!.name)} can’t swap: they don’t fit each other’s spots.` }); return; }
    const lb = locOf(b), la = locOf(a);
    if (lb) place(a, lb[0], lb[1]); else if (la) place(b, la[0], la[1]);
    setSwap(null);
  };
  const swapTo = (key: string, i: number) => { const a = swap; if (a == null) return; const pa = byId.get(a); if (pa && !blocked(a) && fits(pa, rule(key), rules)) { place(a, key, i); setSwap(null); } };
  const swapCls = (pid: number) => (swap == null ? '' : swap === pid ? 'swap-src' : swapOk(swap, pid) ? 'swap-ok' : 'swap-no');
  const swapBtn = (pid: number) => (
    <button type="button" className={`sq-swap ${swap === pid ? 'on' : ''}`} aria-label={swap == null ? `Swap ${byId.get(pid)?.name}` : swap === pid ? 'Cancel swap' : `Swap with ${byId.get(pid)?.name}`}
      onClick={(e) => { e.stopPropagation(); if (swap == null) { setSwap(pid); setPicked(null); } else if (swap === pid) setSwap(null); else doSwap(pid); }}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 2v10M4 12l-2.5-2.5M4 12l2.5-2.5M12 14V4M12 4L9.5 6.5M12 4l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
  const role = (pid: number, kind: 'c' | 'vc') => {
    const next = { ...lineup, [kind]: lineup[kind] === pid ? null : pid };
    if (kind === 'c' && next.vc === pid) next.vc = null;
    if (kind === 'vc' && next.c === pid) next.c = null;
    setLineup(next);
  };
  const save = () => start(async () => {
    const r = await saveGameLineup(rules.key, game.round, lineup);
    setMsg(r.ok ? { ok: true, text: `Saved for ${game.label}.` } : { ok: false, text: r.error ?? 'Couldn’t save.' });
    if (r.ok) { setDirty(false); router.refresh(); }
  });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPicked(null); setSwap(null); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);

  const spotState = (s: SlotRule) => (movingP ? (fits(movingP, s, rules) && !used.includes(movingP.id) && !tied[movingP.id] ? 'can' : 'cant') : '');
  const dropProps = (key: string, i: number) => ({
    onDragOver: (e: React.DragEvent) => { if (movingP && fits(movingP, rule(key), rules)) { e.preventDefault(); setOver(`${key}:${i}`); } },
    onDragLeave: () => setOver((o) => (o === `${key}:${i}` ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); const pid = Number(e.dataTransfer.getData('text/plain')); setDrag(null); setOver(null); if (pid) place(pid, key, i); },
  });
  const dragProps = (pid: number, from: string | null) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData('text/plain', String(pid)); e.dataTransfer.effectAllowed = 'move'; setDrag({ pid, from }); },
    onDragEnd: () => { setDrag(null); setOver(null); },
  });

  const spot = (s: SlotRule, i: number) => {
    const k = `${s.key}:${i}`;
    const id = lineup.slots[s.key]?.[i]; const p = id != null ? byId.get(id) : undefined;
    const st = spotState(s), isOver = over === `${s.key}:${i}`;
    const tap = () => { if (swap != null) { if (p) doSwap(p.id); else swapTo(s.key, i); return; } if (picked) place(picked.pid, s.key, i); else if (p) setPicked({ pid: p.id, from: s.key }); };
    if (!p) return (
      <div key={k} className={`sq-spot ${st} ${isOver ? 'over' : ''} ${swap != null ? (byId.get(swap) && !blocked(swap) && fits(byId.get(swap)!, s, rules) ? 'swap-ok' : 'swap-no') : ''}`} role="button" tabIndex={0} onClick={tap} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } }} {...dropProps(s.key, i)}>
        <span className="sq-ph">{s.bench ? (s.fits === 'any' ? 'EMG' : `${s.fits[0]} EMG`) : s.fits === 'any' ? 'ANY' : s.fits[0]}</span>
      </div>
    );
    const capd = rules.captain && lineup.c === p.id, vcd = rules.vc && lineup.vc === p.id;
    return (
      <div key={k} className={`sq-spot full sqc pos-${s.fits === 'any' ? p.pos[0] : s.fits.length === 1 ? s.fits[0] : p.pos.find((x) => (s.fits as Pos[]).includes(x)) ?? p.pos[0]} ${capd ? 'row-c' : vcd ? 'row-vc' : ''} ${swapCls(p.id)} ${st} ${isOver ? 'over' : ''} ${picked?.pid === p.id ? 'picked' : ''} ${drag?.pid === p.id ? 'dragging' : ''}`} role="button" tabIndex={0} title={p.name}
        onClick={tap} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } }} {...dropProps(s.key, i)} {...dragProps(p.id, s.key)}>
        <span className="sqc-h">
          <button type="button" className="sqc-n" onClick={(e) => { e.stopPropagation(); setSheet(p); }} onKeyDown={(e) => e.stopPropagation()} title={`${p.name} · profile`}>{short(p.name)}</button>
          <Form p={p} size={12} />
          {!s.bench && rules.captain && <>
            <button type="button" className={`sqc-role c ${lineup.c === p.id ? 'on' : ''}`} aria-label={`Captain ${p.name}`} aria-pressed={lineup.c === p.id} onClick={(e) => { e.stopPropagation(); role(p.id, 'c'); }}>C</button>
            {rules.vc && <button type="button" className={`sqc-role vc ${lineup.vc === p.id ? 'on' : ''}`} aria-label={`Vice-captain ${p.name}`} aria-pressed={lineup.vc === p.id} onClick={(e) => { e.stopPropagation(); role(p.id, 'vc'); }}>VC</button>}
          </>}
          {swapBtn(p.id)}
          <Info p={p} onInfo={setSheet} />
        </span>
        <span className="sqc-b">
          <Disc p={p} size={28} />
          <span className="sqc-meta"><b>{p.club ?? '–'}</b> | {p.pos.join('/')}</span>
          <span className="sqc-sub" title={`2026 average${p.l5 != null ? ` · last 5: ${p.l5}` : ''}`}>{p.avg != null ? p.avg.toFixed(1) : 'no games'}</span>
          {showProj && <span className={`sqc-proj est ${capd ? 'is-cap' : ''}`} title={capd ? `Projected ${p.proj}, doubled as captain` : 'Projected score'}>{capd ? p.proj * 2 : p.proj}</span>}
        </span>
        <span className="sqc-f" suppressHydrationWarning>{fixtureOf(p.club)}</span>
      </div>
    );
  };

  const lines = rules.slots.filter((s) => !s.bench), bench = rules.slots.filter((s) => s.bench);
  const benchSpots = bench.flatMap((s) => Array.from({ length: s.n }, (_, i) => ({ s, i })));
  const lineTotal = (s: SlotRule) => Math.round((lineup.slots[s.key] ?? []).reduce((t, id) => t + proj(id) * (rules.captain && lineup.c === id ? 2 : 1), 0));
  const shown = squad.filter((p) => (filter === 'ALL' || p.pos.includes(filter)) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))).slice(0, big ? 400 : 120);
  const where = (pid: number) => { const k = slotOf.get(pid); if (!k) return null; const r = rule(k); return r.bench ? 'EMG' : r.key === 'UTIL' ? 'UTIL' : r.key === 'PICK' ? 'PICK' : 'IN'; };


  /* ---------- phones: one scrolling list, tap a player then tap who to swap him with ---------- */
  const gameByClub = useMemo(() => { const m = new Map<string, MGame>(); for (const g of liveSrc?.games ?? []) { m.set(g.home, g); m.set(g.away, g); } return m; }, [liveSrc]);
  const liveById = useMemo(() => new Map((liveSrc?.players ?? []).map((p) => [p.id, p])), [liveSrc]);
  const liveFor = (id: number) => { const mp = liveById.get(id); if (!mp || !liveSrc) return null; const l = liveOf(mp, gameByClub, liveSrc.now); return l.ph.state === 'pre' ? null : l; };
  const isStarter = (pid: number) => { const k = slotOf.get(pid); return !!k && !rule(k).bench; };
  const mTotal = Math.round(lines.reduce((t, s) => t + (lineup.slots[s.key] ?? []).reduce((a, id) => { const l = liveFor(id); return a + (l ? l.proj : proj(id)) * (rules.captain && lineup.c === id ? 2 : 1); }, 0), 0));
  const tapPlayer = (pid: number) => {
    if (swap == null) { setSwap(pid); setPicked(null); return; }
    if (swap === pid) { setSwap(null); return; }
    if (swapOk(swap, pid)) doSwap(pid); else setSwap(pid);
  };
  const swapP = swap != null ? byId.get(swap) : undefined;
  const POS_ORDER: Pos[] = ['DEF', 'MID', 'RUC', 'FWD'];
  const extended = squad.filter((p) => !slotOf.has(p.id)).sort((a, b) => POS_ORDER.indexOf(a.pos[0]) - POS_ORDER.indexOf(b.pos[0]) || b.proj - a.proj).slice(0, big ? 400 : 60);
  const LINE_TITLE: Record<string, string> = { DEF: 'Defenders', MID: 'Midfielders', RUC: 'Ruck', FWD: 'Forwards', UTIL: 'Utility', PICK: 'Your pick' };
  const mRow = (p: MdPlayer | undefined, s: SlotRule | null, i: number) => {
    const key = s ? `${s.key}:${i}` : `x:${p?.id}`;
    if (!p) {
      const ok = swapP != null && s != null && !blocked(swapP.id) && fits(swapP, s, rules);
      return (
        <button key={key} type="button" className={`sqm-row empty ${ok ? 'target' : swap != null ? 'fade' : ''}`} onClick={() => { if (s && swap != null) swapTo(s.key, i); }}>
          <span className="sqm-bar" style={{ background: s && s.fits !== 'any' ? POS_COL[s.fits[0]] : 'var(--rh-dim)' }} />
          <span className="sqm-main"><b>Empty {s?.bench ? 'emergency' : s?.fits === 'any' ? 'spot' : `${s?.fits[0]} spot`}</b><span className="sqm-sub">{swap != null ? (ok ? 'Tap to move him here' : 'He can’t play here') : 'Tap a player below, then tap here'}</span></span>
          {ok && <span className="sqm-swap">Move</span>}
        </button>
      );
    }
    const onField = s != null && !s.bench;
    const capd = onField && rules.captain && lineup.c === p.id, vcd = onField && rules.vc && lineup.vc === p.id;
    const mult = capd ? 2 : 1;
    const l = s ? liveFor(p.id) : null;
    const isSel = swap === p.id, target = swap != null && !isSel && swapOk(swap, p.id);
    const off = used.includes(p.id) || !!tied[p.id] || (!!rules.eligible && !rules.eligible(p));
    const sub = [s?.bench ? s.label : null, p.pos.join('/'), l ? `${l.ph.label} · ${fixtureOf(p.club).split(' · ')[0]}` : fixtureOf(p.club)].filter(Boolean).join(' · ');
    return (
      <div key={key} role="button" tabIndex={0} aria-pressed={isSel} className={`sqm-row ${isSel ? 'sel' : ''} ${target ? 'target' : ''} ${swap != null && !isSel && !target ? 'fade' : ''} ${capd ? 'cap' : ''} ${off ? 'off' : ''}`}
        onClick={() => tapPlayer(p.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapPlayer(p.id); } }}>
        <span className="sqm-bar" style={{ background: POS_COL[p.pos[0]] }} />
        <Disc p={p} size={24} />
        <span className="sqm-main">
          <span className="sqm-nm">
            <b>{short(p.name)}</b><Form p={p} size={12} />
            {onField && rules.captain && <button type="button" className={`sqm-role c ${capd ? 'on' : ''}`} aria-label={`Captain ${p.name}`} aria-pressed={capd} onClick={(e) => { e.stopPropagation(); role(p.id, 'c'); }}>C</button>}
            {onField && rules.vc && <button type="button" className={`sqm-role vc ${vcd ? 'on' : ''}`} aria-label={`Vice-captain ${p.name}`} aria-pressed={vcd} onClick={(e) => { e.stopPropagation(); role(p.id, 'vc'); }}>VC</button>}
            {!target && <span className="sqm-sw">{swapBtn(p.id)}</span>}
          </span>
          <span className="sqm-sub" suppressHydrationWarning>{sub}{tied[p.id] ? ' · cup-tied' : used.includes(p.id) ? ' · used' : ''}</span>
        </span>
        {target ? <span className="sqm-swap">Swap</span> : <>
          <span className="sqm-rat" style={l?.rating != null ? { borderColor: rtCol(l.rating) } : undefined} title="Live match rating">{l?.rating != null ? l.rating.toFixed(1) : ''}</span>
          <span className="sqm-l5" title="Average of his last 5 games">{p.l5 ?? '–'}</span>
          <span className="sqm-num">
            <b className={l ? '' : 'est'}>{!s ? '–' : l ? l.score * mult : p.proj * mult}</b>
            <small>{l ? `proj ${l.proj * mult}` : `avg ${p.avg != null ? Math.round(p.avg) : 'new'}`}</small>
          </span>
        </>}
      </div>
    );
  };
  const section = (title: string, note: string, tone: string, rows: React.ReactNode[]) => rows.length ? (
    <section className="sqm-sec" key={title} aria-label={title}>
      <h3 className="sqm-h" style={{ color: tone }}><span>{title} <small>{note}</small></span><span className="sqm-cols" aria-hidden="true"><i>Rat</i><i>L5</i><i>Score</i></span></h3>
      <div className="sqm-list">{rows}</div>
    </section>
  ) : null;
  const mobile = (
    <div className="sqm">
      <div className="sqm-top">
        <label className="sqm-game"><span className="sr-only">Game</span>
          <select className="rh-select" value={game.id} onChange={(e) => onGame(e.target.value)}>
            {games.map((g) => <option key={g.id} value={g.id}>{shortGame(g)}</option>)}
          </select>
        </label>
        <div className="sqm-stats">
          <span><small>{liveSrc ? 'Live proj' : 'Projected'}</small><b className="rh-mono">{mTotal}</b></span>
          <span><small>On field</small><b className={`rh-mono ${count >= need ? 'rh-up' : ''}`}>{count}/{need}</b></span>
          <span className={`sq-state ${dirty ? 'dirty' : initial ? 'saved' : ''}`}>{dirty ? 'Unsaved' : initial ? 'Saved' : 'Not set'}</span>
          <button type="button" className="rh-btn alt" onClick={() => setLineup(autoFill(rules, squad, new Set([...used, ...Object.keys(tied).map(Number)])))}>Auto-pick</button>
        </div>
      </div>
      {swapP && (
        <div className="sqm-swapbar" role="status">
          <div className="sqm-swapbar-top">
            <span>Swap <b>{swapP.name}</b> <span className="sqm-dimw">({swapP.pos.join('/')})</span><br /><span className="sqm-dimw">Tap a highlighted player to swap them</span></span>
            <button type="button" onClick={() => setSwap(null)}>Cancel</button>
          </div>
          <div className="sqm-swapbar-acts">
            {rules.captain && isStarter(swapP.id) && <button type="button" className="gold" onClick={() => { role(swapP.id, 'c'); setSwap(null); }}>{lineup.c === swapP.id ? 'Remove captain' : 'Make captain'}</button>}
            {rules.vc && isStarter(swapP.id) && <button type="button" onClick={() => { role(swapP.id, 'vc'); setSwap(null); }}>{lineup.vc === swapP.id ? 'Remove vice' : 'Make vice-captain'}</button>}
            {slotOf.has(swapP.id) && <button type="button" onClick={() => { remove(swapP.id); setSwap(null); }}>Take out</button>}
            <button type="button" onClick={() => { setSheet(swapP); setSwap(null); }}>Profile</button>
          </div>
        </div>
      )}
      {msg && <div className={`rh-toast ${msg.ok ? 'up' : 'down'}`} style={{ margin: '8px 0 0' }}>{msg.text}</div>}
      {lines.map((s) => section(LINE_TITLE[s.key] ?? s.label, s.n > 1 ? `${s.n} on field` : '1 on field', s.fits === 'any' ? 'var(--ink)' : `var(--${s.fits[0].toLowerCase()})`,
        Array.from({ length: s.n }, (_, i) => { const id = lineup.slots[s.key]?.[i]; return mRow(id != null ? byId.get(id) : undefined, s, i); })))}
      {section('Bench · emergencies', bench.length > 1 && bench.every((b) => b.n === 1) ? 'one per line' : `${benchSpots.length}`, 'var(--ink)', benchSpots.map(({ s, i }) => { const id = lineup.slots[s.key]?.[i]; return mRow(id != null ? byId.get(id) : undefined, s, i); }))}
      {section(rules.key === 'survivor' ? 'Everyone else' : 'Extended bench', 'don’t score', 'var(--muted)', extended.map((p) => mRow(p, null, 0)))}
      <p className="sqm-hint">Tap a player, then tap who you want to swap him with: only players who fit each other’s spots light up. Once his game starts you see his live score (captain ×2) and live match rating; before that his projection in grey. Arrow = form, last 5 v average.</p>
      <div className="sqm-save">
        <span>{dirty ? 'Changes not saved' : initial ? 'Team saved' : 'Not saved yet'}</span>
        <button className="rh-btn go lg" disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save team'}</button>
      </div>
    </div>
  );

  return (
    <>
      <div className="sq-top sq-desk">
        <label className="sq-game"><span className="sr-only">Game</span>
          <select className="rh-select" value={game.id} onChange={(e) => onGame(e.target.value)}>
            {games.map((g) => <option key={g.id} value={g.id}>{shortGame(g)}</option>)}
          </select>
        </label>
        <div className="sq-rest">
          <div className="sq-stat"><span className="rh-k">Projected</span><b className="rh-mono">{total}</b></div>
          <div className="sq-stat"><span className="rh-k">On field</span><b className={`rh-mono ${count >= need ? 'rh-up' : ''}`}>{count}<small>/{need}</small></b></div>
          <span className={`sq-state ${dirty ? 'dirty' : initial ? 'saved' : ''}`}>{dirty ? 'Unsaved' : initial ? 'Saved' : 'Not set'}</span>
          <button type="button" className={`sq-projtog ${showProj ? 'on' : ''}`} aria-pressed={showProj} onClick={toggleProj} title="Show projected scores on the field">
            <i aria-hidden="true" />Projections
          </button>
          <div className="sq-acts">
            <button className="rh-btn alt" onClick={() => setLineup(autoFill(rules, squad, new Set([...used, ...Object.keys(tied).map(Number)])))}>Auto-pick</button>
            <button className="rh-btn alt" onClick={() => setLineup(empty(rules))}>Clear</button>
            <button className="rh-btn go" disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save team'}</button>
          </div>
        </div>
      </div>
      {msg && <div className={`rh-toast sq-desk ${msg.ok ? 'up' : 'down'}`} style={{ margin: 0 }}>{msg.text}</div>}

      {mobile}

      <div className="sq-body sq-desk">
        <div className={`sq-list ${drag?.from ? 'drop-ok' : ''}`}
          onDragOver={(e) => { if (drag?.from) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); const pid = Number(e.dataTransfer.getData('text/plain')); setDrag(null); setOver(null); if (pid && slotOf.has(pid)) remove(pid); }}>
          <div className="sq-lh">
            <div className="sq-lh-row"><span className="rh-k">{rules.key === 'survivor' ? 'Any player' : `Your list · ${squad.length}`}</span></div>
            {!big && <input className="sq-search" placeholder="Search players" value={q} onChange={(e) => setQ(e.target.value)} />}
            <div className="sq-filters" role="group" aria-label="Filter by position">
              {(['ALL', 'DEF', 'MID', 'RUC', 'FWD'] as const).map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>)}
            </div>
          </div>
          <div className="sq-rows">
            <div className="sq-cols" aria-hidden="true"><span /><span className="rh-k">Player</span><span className="rh-k" title="2026 average">Avg</span><span className="rh-k" title="Average of his last 5 games">L5</span><span className="rh-k" title="Average match rating out of 10, 2026">Rat</span><span /></div>
            {shown.map((p) => {
              const w = where(p.id), burnt = used.includes(p.id), isTied = !!tied[p.id], ok = !rules.eligible || rules.eligible(p);
              return (
                <div key={p.id} className={`sq-row ${w ? 'in' : ''} ${picked?.pid === p.id ? 'picked' : ''} ${!ok || burnt || isTied ? 'off' : ''} ${swapCls(p.id)}`} role="button" tabIndex={0}
                  onClick={() => swap != null ? doSwap(p.id) : setPicked(picked?.pid === p.id ? null : { pid: p.id, from: slotOf.get(p.id) ?? null })}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked(picked?.pid === p.id ? null : { pid: p.id, from: slotOf.get(p.id) ?? null }); } }}
                  {...(ok && !burnt ? dragProps(p.id, slotOf.get(p.id) ?? null) : {})}>
                  <Disc p={p} size={26} label />
                  <span className="sq-row-main">
                    <span className="sq-row-nm"><button type="button" className="sq-nm-btn" onClick={(e) => { e.stopPropagation(); setSheet(p); }} onKeyDown={(e) => e.stopPropagation()}>{p.name}</button><Form p={p} size={11} />{p.keeper && <em>{p.keeper}</em>}</span>
                    <span className="sq-row-sub">{p.pos.map((x) => <i key={x} style={{ background: POS_COL[x] }}>{x}</i>)}{w && <i className="in">{w}</i>}{burnt && <i className="in">USED</i>}{isTied && <i className="tied" title={`Played a cup game for ${tied[p.id]}`}>CUP-TIED</i>}{!ok && <span className="rh-dim">not eligible</span>}</span>
                  </span>
                  <span className="sq-row-av">{p.avg != null ? Math.round(p.avg) : '–'}</span>
                  <span className="sq-row-l5">{p.l5 ?? '–'}</span>
                  <span className="sq-row-rt">{p.rat != null ? <i style={{ background: rtCol(p.rat) }}>{p.rat.toFixed(1)}</i> : '–'}</span>
                  {ok && !burnt && !isTied ? swapBtn(p.id) : <span />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="sq-fieldcol">
          <div className={`sq-field ${rules.key === 'cup' ? 'cup-gold' : ''}`}>
            {lines.map((s, li) => {
              let i = 0;
              return (
                <div key={s.key} className="sq-lgroup">
                  {li > 0 && <div className="sq-sep" />}
                  {rowsFor(s.n).map((n, r) => (
                    <div key={r} className="sq-line">
                      <span className="sq-lk">{r === 0 && <><i style={{ background: s.fits === 'any' ? 'var(--rh-dim)' : POS_COL[s.fits[0]] }} />{s.key === 'PICK' ? 'PICK' : s.key}<small>{lineTotal(s)}</small></>}</span>
                      <div className="sq-spots">{Array.from({ length: n }, () => spot(s, i++))}</div>
                    </div>
                  ))}
                </div>
              );
            })}
            {benchSpots.length > 0 && (
              <div className="sq-lgroup"><div className="sq-sep" />
                <div className="sq-line emg"><span className="sq-lk">EMG<small>{bench.length > 1 ? '1/line' : `${benchSpots.length}`}</small></span>
                  <div className="sq-spots">{benchSpots.map(({ s, i }) => spot(s, i))}</div>
                </div>
              </div>
            )}
          </div>
          <span className="sq-hint sq-desk">Faded number = projected score{rules.captain ? ' (captain ×2)' : ''} · form arrows: last 5 v average · Rat = average match rating · drag onto a spot, or tap the swap arrows on two players · drag back to the list to remove · {rules.summary}</span>
        </div>
      </div>
      {sheet && <SquadSheet p={sheet} slot={(() => { const w = where(sheet.id); return w === 'IN' ? rule(slotOf.get(sheet.id)!).key : w; })()} cap={lineup.c === sheet.id} vc={lineup.vc === sheet.id} onClose={() => setSheet(null)} clubName={clubName} gameName={rules.name} />}
    </>
  );
}

/* ---------------- matchup (right) ---------------- */
function SideList({ side, rules, look }: { side: { lineup: MdLineup }; rules: Rules; look: (id: number) => MdPlayer | undefined }) {
  return (
    <div className="md-sidelist">
      {rules.slots.filter((s) => !s.bench).map((s) => (
        <div key={s.key} className="md-sl-line">
          <span className="md-sl-k">{s.key}</span>
          {(side.lineup.slots[s.key] ?? []).map((id) => { const p = look(id); return p ? (
            <span key={id} className="md-sl-p"><span className="md-ellip">{p.name.split(' ').slice(-1)[0]}</span>{side.lineup.c === id && <i className="md-c">C</i>}<b className="rh-mono">{p.proj}</b></span>
          ) : null; })}
        </div>
      ))}
    </div>
  );
}

export function Matchup({ game, rules, mine, myName, myTeamId, look }: { game: GameOpt; rules: Rules; mine: MdLineup; myName: string; myTeamId: number; look: (id: number) => MdPlayer | undefined }) {
  const proj = (id: number) => look(id)?.proj ?? 0;
  if (game.opp) {
    const a = projTotal(rules, mine, proj), b = projTotal(rules, game.opp.lineup, proj);
    const sd = Math.max(1, Math.sqrt(onField(rules)) * 22);
    const win = 1 / (1 + Math.exp(-1.702 * ((a - b) / (sd * Math.SQRT2))));
    const lineSum = (l: MdLineup, k: string) => (l.slots[k] ?? []).reduce((t, id) => t + proj(id) * (rules.captain && l.c === id ? 2 : 1), 0);
    return (
      <section className="rh-card md-mu">
        <div className="md-mu-h"><span className="rh-k">{game.label}{game.key === 'cup' && game.note ? ` · ${game.note}` : ''} · projected</span><Link href="/live/matchups" className="rh-link" style={{ fontSize: 12 }}>All matchups →</Link></div>
        <div className="md-score">
          <div className="me"><span className="rh-dim">You</span><b className="md-ellip">{myName}</b><span className="md-big rh-mono">{a}</span></div>
          <div className="md-vs"><span className="md-pct rh-mono">{Math.round(win * 100)}<small>%</small></span><span className="rh-dim">win chance</span></div>
          <div className="them"><span className="rh-dim">{game.opp.saved ? 'Their team' : 'Their best guess'}</span><b className="md-ellip">{game.opp.name}</b><span className="md-big rh-mono">{b}</span></div>
        </div>
        <span className="md-winbar"><i style={{ width: `${win * 100}%` }} /></span>
        <div className="md-lines-cmp">
          {rules.slots.filter((s) => !s.bench).map((s) => {
            const x = Math.round(lineSum(mine, s.key)), y = Math.round(lineSum(game.opp!.lineup, s.key)), m = Math.max(1, x, y);
            return (
              <div key={s.key} className="md-lc">
                <span className={`rh-mono ${x >= y ? 'rh-up' : ''}`}>{x}</span>
                <span className="md-lc-bar l"><i style={{ width: `${(x / m) * 100}%` }} /></span>
                <span className="md-lc-k">{s.key}</span>
                <span className="md-lc-bar r"><i style={{ width: `${(y / m) * 100}%` }} /></span>
                <span className={`rh-mono ${y > x ? 'rh-down' : ''}`}>{y}</span>
              </div>
            );
          })}
        </div>
        <details className="md-det"><summary>Their lineup</summary><SideList side={game.opp} rules={rules} look={look} /></details>
      </section>
    );
  }
  if (game.table) {
    const rows = game.table.map((s) => { const l = s.teamId === myTeamId ? mine : s.lineup; return { s: { ...s, lineup: l }, t: rules.key === 'survivor' ? 0 : projTotal(rules, l, proj) }; });
    const sorted = [...rows].sort((x, y) => y.t - x.t);
    return (
      <section className="rh-card md-mu">
        <div className="md-mu-h"><span className="rh-k">{game.label}</span><span className="rh-chip">{rules.key === 'survivor' ? 'Picks' : 'Projected'}</span></div>
        {game.note && <span className="rh-dim" style={{ fontSize: 12.5 }}>{game.note}</span>}
        {!sorted.length && <span className="rh-dim">No one has entered yet.</span>}
        <div className="md-table">
          {sorted.map(({ s, t }, i) => {
            const pick = s.lineup.slots.PICK?.[0];
            return (
              <div key={s.teamId} className={`md-tr ${s.teamId === myTeamId ? 'me' : ''}`}>
                <span className="rh-mono rh-dim">{i + 1}</span>
                <b className="md-ellip">{s.name}</b>
                {rules.key === 'survivor'
                  ? <span className="md-ellip rh-dim">{pick ? `${look(pick)?.name ?? 'Picked'} · ${look(pick)?.proj ?? '–'}` : 'No pick yet'}</span>
                  : <span className="rh-mono">{t}{!s.saved && <small className="rh-dim"> est.</small>}</span>}
              </div>
            );
          })}
        </div>
      </section>
    );
  }
  return <section className="rh-card md-mu"><span className="rh-k">{game.label}</span><span className="rh-dim">No opponent this round.</span></section>;
}

/* ---------------- AFL fixture strip ---------------- */
function Fixtures({ round, games }: { round: number; games: { home: string; away: string; start: string }[] }) {
  // Times in the viewer's own time zone, so only render them after mount.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const t = (iso: string) => new Date(iso).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace(' am', 'am').replace(' pm', 'pm').replace(',', '');
  return (
    <div className="sq-fx" aria-label={`AFL round ${round} fixture`}>
      <span className="sq-fx-r">R{round}</span>
      {games.map((g) => (
        <span key={`${g.home}${g.away}`} className="sq-fx-g">
          <b>{g.home} v {g.away}</b>
          <small suppressHydrationWarning>{ready ? t(g.start) : ' '}</small>
        </span>
      ))}
    </div>
  );
}

/* ---------------- lineups status ---------------- */
function Lineups({ games, savedIds, locks, current, onPick, minis = [] }: { games: GameOpt[]; savedIds: string[]; locks: Record<string, string | null>; current: string; onPick: (id: string) => void; minis?: MiniLink[] }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const when = (iso: string) => new Date(iso).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace(' am', 'am').replace(' pm', 'pm').replace(',', '');
  const done = games.filter((g) => savedIds.includes(g.id)).length;
  return (
    <section className="rh-card sq-locks" aria-label="Your lineups">
      <div className="md-mu-h"><span className="rh-k">Lineups · {done}/{games.length} saved</span></div>
      {games.map((g) => {
        const ok = savedIds.includes(g.id), lock = locks[g.id], locked = lock && now != null && Date.parse(lock) <= now;
        return (
          <button key={g.id} type="button" className={`sq-lock ${g.id === current ? 'on' : ''}`} onClick={() => onPick(g.id)}>
            <i className={`sq-dot ${ok ? 'ok' : ''}`} aria-hidden="true">{ok ? '✓' : ''}</i>
            <span className="md-ellip">{shortGame(g)}</span>
            <em className={locked ? 'locked' : ''} suppressHydrationWarning>{locked ? 'Locked' : lock && now != null ? `Locks ${when(lock)}` : ok ? 'Saved' : 'Not set'}</em>
          </button>
        );
      })}
      {minis.map((m) => (
        <Link key={`m${m.id}`} href={`/live/g/${m.id}`} className="sq-lock mini">
          <i className={`sq-dot ${m.status === 'done' ? 'ok' : ''}`} aria-hidden="true">{m.status === 'done' ? '✓' : ''}</i>
          <span className="md-ellip">Mini · {m.name} · {m.sub}</span>
          <em>{m.status === 'drafting' ? 'Drafting →' : 'Drafted →'}</em>
        </Link>
      ))}
    </section>
  );
}

/* ---------------- page ---------------- */
export function Matchday({ data, cup, minis = [], liveSrc = null }: { data: MatchdayData; cup: CupData; minis?: MiniLink[]; liveSrc?: LiveSrc | null }) {
  const [gid, setGid] = useState(data.games[0]?.id ?? '');
  const game = data.games.find((g) => g.id === gid) ?? data.games[0];
  const rules = RULES[game.key];
  const squad = game.key === 'survivor' ? data.pool : data.squad;
  const look = useMemo(() => { const m = new Map<number, MdPlayer>([...Object.values(data.others), ...data.squad, ...data.pool].map((p) => [p.id, p])); return (id: number) => m.get(id); }, [data]);
  const [live, setLive] = useState<Record<string, MdLineup>>({});
  const tied = game.key === 'cup' ? data.cupTied : {};
  const mine = live[game.id] ?? data.lineups[game.id] ?? autoFill(rules, squad, new Set([...data.survivorUsed, ...Object.keys(tied).map(Number)]));
  // On desktop both columns run to the bottom of the screen and end together.
  const gridRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<number | null>(null);
  useEffect(() => {
    const f = () => {
      const el = gridRef.current; if (!el) return;
      if (window.innerWidth <= 1180) { setFit(null); return; }
      const top = el.getBoundingClientRect().top + window.scrollY;
      setFit(Math.max(600, window.innerHeight - top - 14));
    };
    f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f);
  }, []);
  return (
    <Shell compact title="Squad Selector" sub={<>Round {data.round}, {data.season} · {data.myName}</>} right={<Fixtures round={data.round} games={data.fixtures} />}>
      {!data.ready && <div className="rh-card md-warn">Saving teams needs <code>supabase/migrations/0020_matchday_comps_msd_values.sql</code>. You can still build and preview.</div>}
      <div className="sq-grid" ref={gridRef} style={fit ? { height: fit } : undefined}>
        <section className="rh-card sq-card" aria-label="Set your team">
          <Selector key={game.id} game={game} games={data.games} onGame={setGid} rules={rules} squad={squad} initial={data.lineups[game.id] ?? null}
            used={game.key === 'survivor' ? data.survivorUsed : []} tied={tied} clubName={data.myName || null} liveSrc={liveSrc} onChange={(l) => setLive((x) => ({ ...x, [game.id]: l }))} />
        </section>
        <div className="sq-right">
          <Lineups games={data.games} savedIds={data.savedIds} locks={data.locks} current={game.id} onPick={setGid} minis={minis} />
          <Matchup game={game} rules={rules} mine={mine} myName={data.myName} myTeamId={data.myTeamId} look={look} />
          <CupPanel data={cup} compact />
        </div>
      </div>
    </Shell>
  );
}

export type { Side };
