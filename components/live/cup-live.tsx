'use client';
// Live Matchups · Knockout Cup. Both 15s slot against slot, one position at a time: a gold break line per position
// carries the line score, who leads, each side's average rating and the projected line totals. Utility is on field;
// emergencies sit underneath, not counting. Tabs: Preview, Live scores, Run home.
// Before 2027 scores exist every player shows his projection (faded). "Test scores" fills in a seeded, simulated
// Saturday night so the live look can be checked now.
import { useMemo, useState } from 'react';
import type { GameOpt } from '@/lib/matchday-data';
import type { MdLineup, MdPlayer, Rules } from '@/lib/matchday';
import { DEFAULT_PARS, baseAverage, matchRating, ratingBasis, ratingPos, type RatingBasis } from '@/lib/match-rating';
import { CLUBS } from '@/lib/clubs';
import { Disc } from './matchday';
import { rtCol } from './mens';

const A_COL = '#2563c9', B_COL = '#e0780f';
const LINES = ['DEF', 'MID', 'RUC', 'FWD', 'UTIL'] as const;
type Line = (typeof LINES)[number];
const LINE_NAME: Record<Line, string> = { DEF: 'Defence', MID: 'Midfield', RUC: 'Ruck', FWD: 'Forwards', UTIL: 'Utility' };
const PERTH = 'Australia/Perth';
const GAME_MIN = 165;

type Fx = { home: string; away: string; start: string };
type State = 'pre' | 'live' | 'final';
interface Row { p: MdPlayer; slot: Line | 'EMG'; st: State; score: number | null; proj: number; rating: number | null; when: string }

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const normal = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const timeLabel = (iso: string) => new Date(iso).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: PERTH });

function basisOf(p: MdPlayer, slot: Line | 'EMG'): RatingBasis {
  const avg = baseAverage({ prevAvg: p.avg ?? null, prevGames: p.avg != null ? 10 : 0, proj: p.proj || null });
  return ratingBasis(avg, ratingPos(slot === 'UTIL' || slot === 'EMG' ? null : slot, p.pos, DEFAULT_PARS), DEFAULT_PARS);
}

/** Every player's state at `now`. Without test scores nothing has been played yet. */
function rowsFor(l: MdLineup, look: (id: number) => MdPlayer | undefined, fx: Fx[], test: boolean, now: number): Record<Line | 'EMG', Row[]> {
  const gameOf = (club: string | null) => fx.find((g) => g.home === club || g.away === club);
  const out = Object.fromEntries([...LINES, 'EMG'].map((k) => [k, [] as Row[]])) as Record<Line | 'EMG', Row[]>;
  for (const k of [...LINES, 'EMG'] as const) {
    for (const id of l.slots[k] ?? []) {
      const p = look(id); if (!p) continue;
      const g = gameOf(p.club);
      const proj = Math.round(p.proj || p.avg || 0);
      let st: State = 'pre', score: number | null = null, when = g ? timeLabel(g.start) : 'No game';
      if (test && g) {
        const mins = (now - Date.parse(g.start)) / 60e3;
        const r = rng(p.id * 7919 + 5);
        const final = Math.max(8, Math.round(proj * Math.exp(normal(r) * 0.24)));
        if (mins >= GAME_MIN) { st = 'final'; score = final; when = 'Final'; }
        else if (mins > 0) { const f = Math.min(1, mins / GAME_MIN); st = 'live'; score = Math.round(final * f); when = `Live · ${f < .25 ? 'Q1' : f < .5 ? 'Q2' : f < .75 ? 'Q3' : 'Q4'}`; }
      }
      const played = st === 'final' ? 1 : st === 'live' ? Math.min(1, (now - Date.parse(g!.start)) / 60e3 / GAME_MIN) : 0;
      const projNow = st === 'final' ? score! : st === 'live' ? Math.round(score! + proj * (1 - played)) : proj;
      const rating = score != null && played > 0 ? matchRating(score, basisOf(p, k), played) : null;
      out[k].push({ p, slot: k, st, score, proj: projNow, rating, when });
    }
  }
  return out;
}

const sum = (rs: Row[], f: (r: Row) => number) => rs.reduce((t, r) => t + f(r), 0);
const avgRating = (rs: Row[]) => { const xs = rs.filter((r) => r.rating != null).map((r) => r.rating!); return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null; };
const short = (n: string) => { const w = n.split(' '); return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(' ')}` : n; };

function Card({ r, side, onOpen }: { r: Row; side: 'a' | 'b'; onOpen?: (p: MdPlayer) => void }) {
  const chip = <span className="cl-chip" style={{ background: r.rating != null ? rtCol(r.rating) : 'var(--rh-2)' }}>{r.rating != null ? r.rating.toFixed(1) : '–'}</span>;
  const sc = <span className={`cl-sc ${r.score == null ? 'proj' : ''} ${(r.score ?? 0) >= 100 ? 'ton' : ''}`} title={r.score == null ? 'Projected' : r.st === 'live' ? `Live · on track for ${r.proj}` : 'Final'}>{r.score ?? r.proj}</span>;
  const who = (
    <span className="cl-who">
      <span className="cl-nm" data-pid={r.p.id} role="link" tabIndex={0} onClick={() => onOpen?.(r.p)}>{short(r.p.name)}</span>
      <span className="cl-sub">{side === 'a'
        ? <><span className={r.st === 'live' ? 'cl-live' : ''}>{r.when}</span> · {r.p.club}{r.slot === 'UTIL' ? ' · UTIL' : ''}</>
        : <>{r.p.club}{r.slot === 'UTIL' ? ' · UTIL' : ''} · <span className={r.st === 'live' ? 'cl-live' : ''}>{r.when}</span></>}</span>
    </span>
  );
  const disc = <Disc p={r.p} size={30} />;
  return <div className={`cl-pc ${side} ${r.slot === 'UTIL' ? 'util' : ''}`} title={r.p.club ? CLUBS[r.p.club]?.name : undefined}>{side === 'a' ? <>{chip}{who}{sc}{disc}</> : <>{disc}{sc}{who}{chip}</>}</div>;
}

export function CupLive({ game, rules, mine, myName, look, fixtures, onOpen }: { game: GameOpt; rules: Rules; mine: MdLineup; myName: string; look: (id: number) => MdPlayer | undefined; fixtures: Fx[]; onOpen?: (p: MdPlayer) => void }) {
  const [view, setView] = useState<'preview' | 'live' | 'home'>('live');
  const [test, setTest] = useState(false);
  // test "now": partway through the round, so some games are done, one is live and the rest are still to come
  const now = useMemo(() => {
    const ts = fixtures.map((f) => Date.parse(f.start)).sort((x, y) => x - y);
    if (!ts.length) return Date.now();
    const i = Math.max(0, Math.floor(ts.length * 0.55));
    return ts[i] + 0.68 * GAME_MIN * 60e3;
  }, [fixtures]);
  const trim = (l: MdLineup): MdLineup => ({ ...l, slots: Object.fromEntries(rules.slots.map((s) => [s.key, (l.slots[s.key] ?? []).slice(0, s.n)])) });
  const A = useMemo(() => rowsFor(trim(mine), look, fixtures, test, now), [mine, look, fixtures, test, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const opp = game.opp;
  const B = useMemo(() => (opp ? rowsFor(trim(opp.lineup), look, fixtures, test, now) : null), [opp, look, fixtures, test, now]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!opp || !B) return <section className="rh-card"><span className="rh-dim">No cup opponent this round.</span></section>;

  const field = (x: Record<string, Row[]>) => LINES.flatMap((k) => x[k]);
  const aTot = sum(field(A), (r) => r.score ?? 0), bTot = sum(field(B), (r) => r.score ?? 0);
  const aProj = sum(field(A), (r) => r.proj), bProj = sum(field(B), (r) => r.proj);
  const aLeft = field(A).filter((r) => r.st !== 'final').length, bLeft = field(B).filter((r) => r.st !== 'final').length;
  // uncertainty shrinks as players finish
  const sd = Math.max(8, Math.sqrt(field(A).concat(field(B)).filter((r) => r.st !== 'final').reduce((t, r) => t + (0.24 * r.proj) ** 2, 0)));
  const win = 1 / (1 + Math.exp(-1.702 * ((aProj - bProj) / sd)));
  const started = test;
  const lines = LINES.map((k) => {
    const a = sum(A[k], (r) => r.score ?? 0), b = sum(B[k], (r) => r.score ?? 0);
    const pa = sum(A[k], (r) => r.proj), pb = sum(B[k], (r) => r.proj);
    const done = [...A[k], ...B[k]].every((r) => r.st === 'final');
    const lead = started ? Math.sign(a - b) : Math.sign(pa - pb);
    return { k, a, b, pa, pb, done, lead, ar: avgRating(A[k]), br: avgRating(B[k]) };
  });
  const linesA = lines.filter((l) => l.lead > 0).length, linesB = lines.filter((l) => l.lead < 0).length;
  const oppName = opp.name;

  const leftRows = (x: Record<string, Row[]>) => field(x).filter((r) => r.st !== 'final');
  const toCome = (x: Record<string, Row[]>) => sum(leftRows(x), (r) => r.proj - (r.score ?? 0));
  const games = fixtures.map((f) => ({ f, a: leftRows(A).filter((r) => r.p.club === f.home || r.p.club === f.away), b: leftRows(B).filter((r) => r.p.club === f.home || r.p.club === f.away) }))
    .filter((g) => g.a.length || g.b.length).sort((x, y) => Date.parse(x.f.start) - Date.parse(y.f.start));

  return (
    <div className="cl">
      <section className="cl-plate">
        <div className="cl-side a">
          <b>{myName}</b>
          <span className="cl-big rh-mono" style={{ color: A_COL }}>{started ? aTot : aProj}</span>
          <span className="rh-dim rh-mono">{started ? `projected ${aProj} · ${aLeft} to play` : 'projected'}</span>
        </div>
        <div className="cl-mid">
          <svg width="38" height="38" viewBox="0 0 64 64" aria-hidden="true"><path fill="#c9a13a" d="M18 8h28v6h10v6c0 8-6 14-13 15-2 5-6 8-9 9v8h8v6H22v-6h8v-8c-3-1-7-4-9-9C14 34 8 28 8 20v-6h10V8zm-4 12c0 4 2 7 5 8-1-3-1-5-1-8h-4zm36 0h-4c0 3 0 5-1 8 3-1 5-4 5-8z" /></svg>
          <span className="rh-k cl-gold">{game.label}{game.note ? ` · ${game.note}` : ''}</span>
          <span className="rh-mono" style={{ fontSize: 13 }}><b style={{ color: A_COL }}>{Math.round(win * 100)}%</b> win chance <b style={{ color: B_COL }}>{Math.round((1 - win) * 100)}%</b></span>
          <span className="rh-dim" style={{ fontSize: 12 }}>Lines {started ? 'won' : 'projected'} <b className="rh-mono" style={{ color: A_COL }}>{linesA}</b>–<b className="rh-mono" style={{ color: B_COL }}>{linesB}</b> · {aProj === bProj ? 'level' : `${aProj > bProj ? 'you' : oppName} by ${Math.abs(aProj - bProj)} projected`}</span>
        </div>
        <div className="cl-side b">
          <b>{oppName}</b>
          <span className="cl-big rh-mono" style={{ color: B_COL }}>{started ? bTot : bProj}</span>
          <span className="rh-dim rh-mono">{started ? `projected ${bProj} · ${bLeft} to play` : opp.saved ? 'projected' : 'projected · best guess team'}</span>
        </div>
      </section>

      <div className="cl-bar">
        <div className="mx-views" role="tablist" aria-label="Cup matchup view">
          {([['preview', 'Preview'], ['live', 'Live scores'], ['home', 'Run home']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{label}</button>
          ))}
        </div>
        <label className="cl-test"><input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} /> Test scores</label>
      </div>

      {view === 'live' && (
        <div className="cl-board">
          <div className="cl-grp cl-heads"><span className="rh-k" style={{ textAlign: 'right' }}>{myName} · on field</span><span className="rh-k">{oppName} · on field</span></div>
          {lines.map((l) => (
            <div key={l.k}>
              <div className="cl-lhead">
                <span className="cl-rule" />
                <div className="cl-strip">
                  <span className="cl-ln">{LINE_NAME[l.k]}</span>
                  <span className="cl-v rh-mono" style={{ color: A_COL }}>{started ? l.a : l.pa}</span><span className="rh-k">v</span><span className="cl-v rh-mono" style={{ color: B_COL }}>{started ? l.b : l.pb}</span>
                  {started && <span className={`cl-won ${l.lead > 0 ? 'a' : l.lead < 0 ? 'b' : ''} ${l.done ? 'done' : ''}`}>{l.lead === 0 ? 'Level' : l.done ? `${l.lead > 0 ? 'You' : 'They'} won` : `${l.lead > 0 ? 'You' : 'They'} +${Math.abs(l.a - l.b)}`}</span>}
                  {started && <><span className="cl-sep" /><span className="rh-k" style={{ fontSize: 9.5 }}>Rating</span>
                    <span className="cl-chip" style={{ background: l.ar != null ? rtCol(l.ar) : 'var(--rh-2)' }}>{l.ar?.toFixed(1) ?? '–'}</span>
                    <span className="cl-chip" style={{ background: l.br != null ? rtCol(l.br) : 'var(--rh-2)' }}>{l.br?.toFixed(1) ?? '–'}</span>
                    <span className="cl-sep" /><span className="rh-mono rh-dim" style={{ fontSize: 11 }}>proj {l.pa}–{l.pb}</span></>}
                  {!started && <span className="rh-dim" style={{ fontSize: 11.5 }}>projected</span>}
                </div>
                <span className="cl-rule" />
              </div>
              <div className="cl-grp">
                <div className="cl-stack">{A[l.k].map((r) => <Card key={r.p.id} r={r} side="a" onOpen={onOpen} />)}</div>
                <div className="cl-stack">{B[l.k].map((r) => <Card key={r.p.id} r={r} side="b" onOpen={onOpen} />)}</div>
              </div>
            </div>
          ))}
          <div className="cl-lhead emg"><span className="cl-rule" /><div className="cl-strip"><span className="cl-ln">Emergencies</span><span className="rh-dim" style={{ fontSize: 12 }}>only count if a player on field doesn’t play</span></div><span className="cl-rule" /></div>
          <div className="cl-grp cl-emg">
            <div className="cl-stack">{A.EMG.map((r) => <Card key={r.p.id} r={r} side="a" onOpen={onOpen} />)}</div>
            <div className="cl-stack">{B.EMG.map((r) => <Card key={r.p.id} r={r} side="b" onOpen={onOpen} />)}</div>
          </div>
          <span className="rh-dim cl-foot">15 on field each: {rules.summary} Line scores and lines won are a way to read the game; the cup is decided on total points. Faded numbers are projections for players yet to play.{test ? ' Test scores are simulated.' : ''}</span>
        </div>
      )}

      {view === 'home' && (
        <div className="cl-home">
          <div className="rh-card cl-come">
            <span className="cl-h">Still to come</span>
            <div className="cl-two">
              <div className="a"><span className="rh-k">{myName} · {aLeft} players</span><b className="rh-mono">+{toCome(A)}</b><span className="rh-dim">projected to come</span></div>
              <div className="b"><span className="rh-k">{oppName} · {bLeft} players</span><b className="rh-mono">+{toCome(B)}</b><span className="rh-dim">projected to come</span></div>
            </div>
            {started && (() => {
              const gap = aTot - bTot;
              return <span className="cl-need">{gap > 0
                ? <>{oppName} need <b className="rh-mono">{gap + 1}</b> more to catch you: {bLeft ? <b>{Math.ceil((gap + 1) / bLeft)} a player</b> : 'and they have nobody left'} from their {bLeft}.</>
                : gap < 0 ? <>You need <b className="rh-mono">{-gap + 1}</b> more: {aLeft ? <b>{Math.ceil((-gap + 1) / aLeft)} a player</b> : 'and nobody is left'} from your {aLeft}.</>
                : <>Dead level.</>}</span>;
            })()}
          </div>
          <div className="rh-card cl-games">
            <span className="cl-h">The games that decide it</span>
            {games.length ? games.map(({ f, a, b }) => (
              <div key={f.start + f.home} className="cl-game">
                <span><b className="rh-mono">{f.home} v {f.away}</b><span className="rh-dim">{timeLabel(f.start)}</span></span>
                <div>{a.map((r) => <span key={r.p.id} className="cl-pill a">{short(r.p.name)} <em className="rh-mono">{r.score != null ? `${r.score} → ${r.proj}` : r.proj}</em></span>)}{b.map((r) => <span key={r.p.id} className="cl-pill b">{short(r.p.name)} <em className="rh-mono">{r.score != null ? `${r.score} → ${r.proj}` : r.proj}</em></span>)}</div>
              </div>
            )) : <span className="rh-dim">Everyone has played.</span>}
          </div>
        </div>
      )}

      {view === 'preview' && (
        <section className="rh-card pv">
          <div className="pv-head"><b style={{ color: A_COL }}>{myName}</b><span className="rh-k">Preview</span><b style={{ color: B_COL }}>{oppName}</b></div>
          {(() => {
            const fA = field(A), fB = field(B);
            const rat = (rs: Row[]) => { const xs = rs.map((r) => r.p.rat).filter((x): x is number => x != null); return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '–'; };
            const age = (rs: Row[]) => { const xs = rs.map((r) => r.p.age).filter((x): x is number => x != null); return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '–'; };
            const best = (rs: Row[]) => [...rs].sort((x, y) => y.proj - x.proj)[0];
            const rows: [string, React.ReactNode, React.ReactNode][] = [
              ['Projected', <b key="a" className="rh-mono" style={{ color: A_COL }}>{sum(fA, (r) => r.proj)}</b>, <b key="b" className="rh-mono" style={{ color: B_COL }}>{sum(fB, (r) => r.proj)}</b>],
              ...lines.map((l) => [LINE_NAME[l.k], <span key="a" className="rh-mono" style={{ fontWeight: l.pa > l.pb ? 800 : 500 }}>{l.pa}</span>, <span key="b" className="rh-mono" style={{ fontWeight: l.pb > l.pa ? 800 : 500 }}>{l.pb}</span>] as [string, React.ReactNode, React.ReactNode]),
              ['Top projected', best(fA) ? `${short(best(fA).p.name)} · ${best(fA).proj}` : '–', best(fB) ? `${short(best(fB).p.name)} · ${best(fB).proj}` : '–'],
              ['Avg rating 2026', rat(fA), rat(fB)],
              ['Avg age', age(fA), age(fB)],
              ['Team', 'Saved', opp.saved ? 'Saved' : 'Not saved: best guess'],
            ];
            return rows.map(([k, x, y]) => <div key={k} className="pv-row"><div className="pv-a">{x}</div><div className="pv-k">{k}</div><div className="pv-b">{y}</div></div>);
          })()}
        </section>
      )}
    </div>
  );
}
