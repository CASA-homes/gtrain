'use client';
// Men's matchday TEST view: G-Train round 1, 2027 (mocked). Live ratings vs projection, TOG bars, and a worm
// graph of the live and projected margin across the AFL round. A time slider replays the round.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CLUBS } from '@/lib/clubs';
import { GAME_MINUTES, type MGame, type MPlayer, type MRound, type MTeam } from '@/lib/mens-round';
import { Shell } from './kit';

const PERTH = 'Australia/Perth';
const A_COL = '#4cc9f0', B_COL = '#f5a524';
const LINE_ORDER: MPlayer['line'][] = ['DEF', 'MID', 'RUC', 'FWD', 'BENCH'];
const LINE_NAME: Record<MPlayer['line'], string> = { DEF: 'Defence', MID: 'Midfield', RUC: 'Ruck', FWD: 'Forwards', BENCH: 'Bench' };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const signed = (x: number) => (x > 0 ? `+${x}` : `${x}`);

/** Where a game is at, given minutes since the first bounce: label and fraction of playing time done. */
function phase(min: number): { state: 'pre' | 'live' | 'final'; label: string; play: number } {
  if (min < 0) return { state: 'pre', label: '', play: 0 };
  if (min >= GAME_MINUTES) return { state: 'final', label: 'Final', play: 1 };
  const seg: [number, number, string, number, number][] = [[0, 32, 'Q1', 0, 0.25], [32, 38, 'QT', 0.25, 0.25], [38, 70, 'Q2', 0.25, 0.5], [70, 90, 'HT', 0.5, 0.5], [90, 122, 'Q3', 0.5, 0.75], [122, 128, '3QT', 0.75, 0.75], [128, GAME_MINUTES, 'Q4', 0.75, 1]];
  const s = seg.find(([a, b]) => min >= a && min < b)!;
  const f = (min - s[0]) / (s[1] - s[0]);
  const play = s[3] + (s[4] - s[3]) * f;
  const clock = s[3] === s[4] ? '' : ` ${Math.floor(min - s[0])}:${String(Math.floor(((min - s[0]) % 1) * 60)).padStart(2, '0')}`;
  return { state: 'live', label: `${s[2]}${clock}`, play };
}
const interp = (path: number[], play: number) => { const x = play * 16, i = Math.min(15, Math.floor(x)); return path[i] + (path[i + 1] - path[i]) * (x - i); };
const erf = (x: number) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

type Live = { score: number; play: number; ph: ReturnType<typeof phase>; rating: number | null; proj: number; injured: boolean; st: MPlayer['st']; game: MGame | undefined };
function liveOf(p: MPlayer, gameByClub: Map<string, MGame>, now: number): Live {
  const game = gameByClub.get(p.club);
  const ph = game ? phase((now - Date.parse(game.start)) / 60e3) : { state: 'pre' as const, label: '', play: 0 };
  const frac = ph.play > 0 ? interp(p.path, ph.play) : 0;
  const score = Math.round(p.final * frac);
  const injured = p.injAt != null && ph.play >= p.injAt;
  const remain = injured ? 0 : p.proj * (1 - ph.play);
  let rating: number | null = null;
  if (ph.play > 0) { const exp = p.proj * ph.play, r = (score + p.proj * 0.12) / (exp + p.proj * 0.12); rating = Math.round(clamp(7 + (r - 1) * 5, 3, 10) * 10) / 10; }
  const f = p.final ? score / p.final : 0;
  const st = Object.fromEntries(Object.entries(p.st).map(([k, v]) => [k, Math.round(v * f)])) as unknown as MPlayer['st'];
  return { score, play: ph.play, ph, rating, proj: Math.round(score + remain), injured, st, game };
}
function teamAt(t: MTeam, gameByClub: Map<string, MGame>, now: number) {
  let score = 0, proj = 0, varr = 0;
  for (const p of t.players) {
    if (p.line === 'BENCH') continue;
    const l = liveOf(p, gameByClub, now), x = p.cap === 'C' ? 2 : 1;
    score += l.score * x; proj += l.proj * x;
    if (!l.injured) varr += (0.3 * p.proj * (1 - l.play) * x) ** 2;
  }
  // plus some doubt about the projections themselves, which shrinks as games are played
  return { score, proj, sd: Math.sqrt(varr) + 0.04 * (proj - score) };
}

/* ---------------- worm ---------------- */
function useTimeline(games: MGame[]) {
  return useMemo(() => {
    const iv = games.map((g) => [Date.parse(g.start), Date.parse(g.start) + GAME_MINUTES * 60e3] as [number, number]).sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [a, b] of iv) { const l = merged[merged.length - 1]; if (l && a <= l[1]) l[1] = Math.max(l[1], b); else merged.push([a, b]); }
    const total = merged.reduce((s, [a, b]) => s + (b - a), 0);
    const toX = (t: number) => { let acc = 0; for (const [a, b] of merged) { if (t < a) return acc / total; if (t <= b) return (acc + t - a) / total; acc += b - a; } return 1; };
    const samples: number[] = [];
    for (const [a, b] of merged) for (let t = a; t <= b; t += 6 * 60e3) samples.push(t);
    return { merged, toX, samples };
  }, [games]);
}

function Worm({ a, b, round, now, gameByClub, tl }: { a: MTeam; b: MTeam; round: MRound; now: number; gameByClub: Map<string, MGame>; tl: ReturnType<typeof useTimeline> }) {
  // Drawn at the container's real width so labels stay readable on a phone.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(760);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const H = W < 500 ? 210 : 240, L = 36, R = 50, T = 14, Bm = 40;
  const pts = useMemo(() => tl.samples.map((t) => {
    const A = teamAt(a, gameByClub, t), B = teamAt(b, gameByClub, t);
    return { t, live: A.score - B.score, proj: A.proj - B.proj };
  }), [a, b, gameByClub, tl.samples]);
  const nowPts = pts.filter((p) => p.t <= now);
  const A = teamAt(a, gameByClub, now), B = teamAt(b, gameByClub, now);
  const cur = { live: A.score - B.score, proj: A.proj - B.proj };
  const span = Math.max(40, ...pts.map((p) => Math.max(Math.abs(p.proj), Math.abs(p.live)))) * 1.15;
  const top = Math.ceil(span / 20) * 20;
  const x = (t: number) => L + tl.toX(t) * (W - L - R), y = (v: number) => T + (1 - (v + top) / (2 * top)) * (H - T - Bm);
  const line = (arr: { t: number; v: number }[]) => arr.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const liveArr = [...nowPts.map((p) => ({ t: p.t, v: p.live })), ...(now > tl.samples[0] ? [{ t: now, v: cur.live }] : [])];
  const projArr = [...nowPts.map((p) => ({ t: p.t, v: p.proj })), ...(now > tl.samples[0] ? [{ t: now, v: cur.proj }] : [])];
  const area = liveArr.length > 1 ? `${line(liveArr)} L${x(liveArr[liveArr.length - 1].t).toFixed(1)},${y(0)} L${x(liveArr[0].t).toFixed(1)},${y(0)} Z` : '';
  const xNow = x(clamp(now, tl.samples[0], tl.samples[tl.samples.length - 1]));
  const ticks = [-top, -top / 2, 0, top / 2, top];
  const days = round.games.reduce<{ day: string; t: number }[]>((acc, g) => { const d = new Date(g.start).toLocaleDateString('en-AU', { weekday: 'short', timeZone: PERTH }); if (!acc.find((x) => x.day === d)) acc.push({ day: d, t: Date.parse(g.start) }); return acc; }, []);
  return (
    <div ref={box} style={{ width: '100%' }}>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Worm: live margin ${signed(cur.live)}, projected ${signed(cur.proj)} to ${cur.proj >= 0 ? a.name : b.name}`} style={{ display: 'block' }}>
      <defs>
        <clipPath id="wa"><rect x={L} y={T} width={W - L - R} height={y(0) - T} /></clipPath>
        <clipPath id="wb"><rect x={L} y={y(0)} width={W - L - R} height={H - Bm - y(0)} /></clipPath>
      </defs>
      <rect x={xNow} y={T} width={Math.max(0, W - R - xNow)} height={H - T - Bm} fill="#fff" fillOpacity={0.025} />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#fff" strokeOpacity={v === 0 ? 0.28 : 0.07} />
          <text x={L - 6} y={y(v) + 3.5} textAnchor="end" fill="#8a928e" fontSize={10} fontFamily="var(--mono)">{v === 0 ? '0' : Math.abs(v)}</text>
        </g>
      ))}
      <text x={L + 6} y={T + 12} fill={A_COL} fontSize={10.5} fontWeight={600}>▲ {a.short}</text>
      <text x={L + 6} y={H - Bm - 6} fill={B_COL} fontSize={10.5} fontWeight={600}>▼ {b.short}</text>
      {round.games.map((g) => { const gx = x(Date.parse(g.start)); return (
        <g key={g.id}>
          <line x1={gx} x2={gx} y1={H - Bm} y2={H - Bm + 5} stroke="#8a928e" strokeOpacity={0.6} />
          <text x={gx + 2} y={H - Bm + 15} fill="#8a928e" fontSize={8.5} fontFamily="var(--mono)">{g.home}</text>
          <text x={gx + 2} y={H - Bm + 25} fill="#5c6461" fontSize={8.5} fontFamily="var(--mono)">{g.away}</text>
        </g>); })}
      {days.map((d) => <text key={d.day} x={x(d.t) + 2} y={H - 3} fill="#c9cfcc" fontSize={10} fontWeight={600}>{d.day}</text>)}
      {area && <path d={area} fill={A_COL} fillOpacity={0.22} clipPath="url(#wa)" />}
      {area && <path d={area} fill={B_COL} fillOpacity={0.22} clipPath="url(#wb)" />}
      {projArr.length > 1 && <path d={line(projArr)} fill="none" stroke="#f4f6f5" strokeOpacity={0.75} strokeWidth={1.5} strokeDasharray="4 4" />}
      {liveArr.length > 1 && <path d={line(liveArr)} fill="none" stroke="#f4f6f5" strokeWidth={2.2} strokeLinejoin="round" />}
      {now > tl.samples[0] && now < tl.samples[tl.samples.length - 1] && <>
        <line x1={xNow} x2={xNow} y1={T} y2={H - Bm} stroke="#00c805" strokeOpacity={0.6} strokeDasharray="2 3" />
        <line x1={xNow} x2={W - R} y1={y(cur.proj)} y2={y(cur.proj)} stroke="#f4f6f5" strokeOpacity={0.35} strokeDasharray="2 4" />
      </>}
      <circle cx={xNow} cy={y(cur.live)} r={4.5} fill="#f4f6f5" />
      <circle cx={W - R} cy={y(cur.proj)} r={4} fill="none" stroke={cur.proj >= 0 ? A_COL : B_COL} strokeWidth={2} />
      <text x={W - R + 7} y={y(cur.proj) - 2} fill={cur.proj >= 0 ? A_COL : B_COL} fontSize={11} fontWeight={700} fontFamily="var(--mono)">{signed(Math.round(cur.proj))}</text>
      <text x={W - R + 7} y={y(cur.proj) + 10} fill="#8a928e" fontSize={8.5}>proj.</text>
    </svg>
    </div>
  );
}

/* ---------------- bits ---------------- */
function MFace({ p, size = 34 }: { p: MPlayer; size?: number }) {
  const [bad, setBad] = useState(false);
  const c = CLUBS[p.club];
  const ring = c ? (c.m ? `conic-gradient(${c.a} 0 45%, ${c.m} 45% 55%, ${c.b} 55% 100%)` : `conic-gradient(${c.a} 0 50%, ${c.b} 50% 100%)`) : '#2a302d';
  return (
    <span className="rh-face" style={{ width: size, height: size, background: ring }} aria-hidden="true">
      <span>{bad || !p.photo ? p.name.split(' ').map((w) => w[0]).slice(0, 2).join('') : <img src={p.photo} alt="" loading="lazy" onError={() => setBad(true)} />}</span>
    </span>
  );
}
const rtCol = (r: number) => (r >= 8.5 ? '#00c805' : r >= 7.5 ? '#7ddc5a' : r >= 6.5 ? '#d9c24f' : r >= 5.5 ? '#ff9a3c' : '#ff5000');
function tip(l: Live) {
  if (!l.game) return 'No game';
  if (l.ph.state === 'pre') return new Date(l.game.start).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: PERTH });
  return l.ph.label;
}

function PlayerRow({ p, l, side }: { p: MPlayer; l: Live; side: 'a' | 'b' }) {
  const pre = l.ph.state === 'pre', live = l.ph.state === 'live';
  const pace = l.play > 0 ? l.score - Math.round(p.proj * l.play) : 0;
  const togCol = l.injured ? '#ff5000' : p.tog >= 80 ? '#00c805' : p.tog >= 70 ? '#d9c24f' : '#ff9a3c';
  return (
    <div className={`mx-row ${p.line === 'BENCH' ? 'bench' : ''}`}>
      <MFace p={p} />
      <div className="mx-who">
        <span className="mx-name">
          <span className="rh-ellip">{p.name}</span>
          {p.cap && <span className={`mx-cap ${p.cap}`}>{p.cap}</span>}
          {l.injured && <span className="mx-inj">INJ</span>}
        </span>
        <span className="mx-sub">
          <span className={live ? 'rh-up' : ''}>{live && <span className="rh-pulse" />}{p.club} · {tip(l)}</span>
          {!pre && <span className="mx-stats rh-mono">{l.st.k + l.st.h}D {l.st.m}M {l.st.t}T {l.st.g}.{l.st.b}{l.st.ho ? ` ${l.st.ho}HO` : ''}</span>}
        </span>
      </div>
      <div className="mx-tog" title={pre ? 'Not played yet' : `${l.injured ? 'Injured, ' : ''}${p.tog}% time on ground`}>
        {!pre && <><span className="mx-togbar"><i style={{ width: `${l.injured ? p.tog : p.tog}%`, background: togCol }} /></span><span className="rh-mono">{p.tog}%</span></>}
      </div>
      <div className="mx-rate">{l.rating != null ? <span className="mx-chip" style={{ background: rtCol(l.rating) }}>{l.rating.toFixed(1)}</span> : <span className="rh-dim rh-mono">–</span>}</div>
      <div className={`mx-score ${side}`}>
        <b className="rh-mono">{pre ? <span className="rh-dim">{p.proj}</span> : l.score}</b>
        <span className={`rh-mono ${pre ? 'rh-dim' : pace >= 0 ? 'rh-up' : 'rh-down'}`}>{pre ? 'proj' : l.ph.state === 'final' ? `${signed(l.score - p.proj)} v proj` : `${signed(pace)} pace`}</span>
      </div>
    </div>
  );
}

function TeamCol({ t, side, gameByClub, now }: { t: MTeam; side: 'a' | 'b'; gameByClub: Map<string, MGame>; now: number }) {
  return (
    <div className="mx-col">
      {LINE_ORDER.map((ln) => {
        const ps = t.players.filter((p) => p.line === ln);
        if (!ps.length) return null;
        return (
          <div key={ln} className="mx-line">
            <span className="rh-k">{LINE_NAME[ln]}{ln === 'BENCH' ? ' · emergencies' : ''}</span>
            {ps.map((p) => <PlayerRow key={p.id} p={p} l={liveOf(p, gameByClub, now)} side={side} />)}
          </div>
        );
      })}
    </div>
  );
}

function MiniWorm({ a, b, gameByClub, tl, now }: { a: MTeam; b: MTeam; gameByClub: Map<string, MGame>; tl: ReturnType<typeof useTimeline>; now: number }) {
  const pts = useMemo(() => tl.samples.filter((_, i) => i % 3 === 0).map((t) => ({ t, v: teamAt(a, gameByClub, t).score - teamAt(b, gameByClub, t).score })), [a, b, gameByClub, tl.samples]);
  const shown = pts.filter((p) => p.t <= now);
  const m = Math.max(30, ...pts.map((p) => Math.abs(p.v)));
  const x = (t: number) => tl.toX(t) * 120, y = (v: number) => 16 - (v / m) * 14;
  if (shown.length < 2) return <svg width={120} height={32} aria-hidden="true"><line x1={0} x2={120} y1={16} y2={16} stroke="#fff" strokeOpacity={0.15} /></svg>;
  const d = shown.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  return (
    <svg width={120} height={32} viewBox="0 0 120 32" aria-hidden="true">
      <line x1={0} x2={120} y1={16} y2={16} stroke="#fff" strokeOpacity={0.15} />
      <path d={`${d} L${x(shown[shown.length - 1].t)},16 L${x(shown[0].t)},16 Z`} fill={shown[shown.length - 1].v >= 0 ? A_COL : B_COL} fillOpacity={0.25} />
      <path d={d} fill="none" stroke="#f4f6f5" strokeWidth={1.4} />
    </svg>
  );
}

/* ---------------- page ---------------- */
export function MensRound({ round, myTeamId }: { round: MRound; myTeamId: number }) {
  const gameByClub = useMemo(() => { const m = new Map<string, MGame>(); for (const g of round.games) { m.set(g.home, g); m.set(g.away, g); } return m; }, [round.games]);
  const tl = useTimeline(round.games);
  const t0 = Date.parse(round.start), t1 = Date.parse(round.end), nowDefault = Date.parse(round.now);
  const [now, setNow] = useState(nowDefault);
  const [playing, setPlaying] = useState(false);
  const mineIdx = round.matchups.findIndex((m) => m.includes(myTeamId));
  const [sel, setSel] = useState(mineIdx >= 0 ? mineIdx : 0);
  const team = (id: number) => round.teams.find((t) => t.id === id)!;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setNow((n) => {
      let next = n + 12 * 60e3;
      // skip dead time between games
      const inGame = tl.merged.some(([a, b]) => next >= a && next <= b);
      if (!inGame) { const nxt = tl.merged.find(([a]) => a > n); next = nxt ? nxt[0] : t1; }
      if (next >= t1) { setPlaying(false); return t1; }
      return next;
    }), 120);
    return () => clearInterval(id);
  }, [playing, tl.merged, t1]);

  const [aId, bId] = round.matchups[sel];
  let A = team(aId), B = team(bId);
  if (bId === myTeamId) [A, B] = [B, A];
  const sa = teamAt(A, gameByClub, now), sb = teamAt(B, gameByClub, now);
  const win = phi((sa.proj - sb.proj) / Math.max(1, Math.hypot(sa.sd, sb.sd)));
  const live = round.games.filter((g) => phase((now - Date.parse(g.start)) / 60e3).state === 'live');
  const nowLabel = new Date(now).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: PERTH });

  return (
    <Shell title="Round 1 · 2027" sub={<>Men’s matchday test. Real AFL fixture, randomised G-Train draw, simulated scores. <span className="rh-mono">{nowLabel}</span> Perth time.</>}
      right={live.length ? <span className="rh-chip live"><span className="rh-pulse" />{live.map((g) => `${g.home} v ${g.away}`).join(', ')}</span> : <span className="rh-chip">{now >= t1 ? 'Round complete' : 'No games on'}</span>}>

      <div className="mx-scrub rh-card">
        <div className="mx-scrubtop">
          <span className="rh-k">Replay the round</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="rh-btn alt" onClick={() => { if (now >= t1) setNow(t0); setPlaying((p) => !p); }}>{playing ? 'Pause' : now >= t1 ? 'Replay from start' : 'Play'}</button>
            <button className="rh-btn soft" onClick={() => { setPlaying(false); setNow(nowDefault); }}>Back to “now”</button>
          </div>
        </div>
        <input type="range" id="mx-time" min={t0} max={t1} step={60e3} value={now} onChange={(e) => { setPlaying(false); setNow(Number(e.target.value)); }} aria-label="Point in the round" />
        <div className="mx-games">
          {round.games.map((g) => { const ph = phase((now - Date.parse(g.start)) / 60e3); return (
            <span key={g.id} className={`mx-game ${ph.state}`}>
              <b className="rh-mono">{g.home} v {g.away}</b>
              <span>{ph.state === 'pre' ? new Date(g.start).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: PERTH }) : ph.label}</span>
            </span>); })}
        </div>
      </div>

      <div className="mx-matchups">
        {round.matchups.map(([x, y], i) => {
          let ta = team(x), tb = team(y);
          if (y === myTeamId) [ta, tb] = [tb, ta];
          const a = teamAt(ta, gameByClub, now), b = teamAt(tb, gameByClub, now);
          const w = phi((a.proj - b.proj) / Math.max(1, Math.hypot(a.sd, b.sd)));
          return (
            <button key={i} className={`mx-mu ${i === sel ? 'on' : ''}`} onClick={() => setSel(i)} aria-pressed={i === sel}>
              <span className="mx-mu-t"><span className="rh-ellip">{ta.name}</span><b className="rh-mono" style={{ color: A_COL }}>{a.score}</b></span>
              <span className="mx-mu-t"><span className="rh-ellip">{tb.name}</span><b className="rh-mono" style={{ color: B_COL }}>{b.score}</b></span>
              <MiniWorm a={ta} b={tb} gameByClub={gameByClub} tl={tl} now={now} />
              <span className="mx-mu-p rh-mono"><span>proj {a.proj}–{b.proj}</span><span>{Math.round(w * 100)}%</span></span>
              <span className="mx-winbar"><i style={{ width: `${w * 100}%`, background: A_COL }} /><i style={{ width: `${(1 - w) * 100}%`, background: B_COL }} /></span>
            </button>
          );
        })}
      </div>

      <section className="rh-card mx-board">
        <div className="mx-sb">
          <div className="mx-sbt a">
            <span className="rh-k">{A.coach}</span>
            <b>{A.name}</b>
            <span className="mx-big rh-mono" style={{ color: A_COL }}>{sa.score}</span>
            <span className="rh-dim rh-mono">projected {sa.proj}</span>
          </div>
          <div className="mx-sbm">
            <span className="rh-k">Win chance</span>
            <span className="mx-pct rh-mono">{Math.round(win * 100)}<small>%</small></span>
            <span className="mx-winbar wide"><i style={{ width: `${win * 100}%`, background: A_COL }} /><i style={{ width: `${(1 - win) * 100}%`, background: B_COL }} /></span>
            <span className="rh-dim rh-mono" style={{ fontSize: 12 }}>{sa.proj === sb.proj ? 'Projected level' : `${sa.proj > sb.proj ? A.short : B.short} by ${Math.abs(sa.proj - sb.proj)} projected`}</span>
          </div>
          <div className="mx-sbt b">
            <span className="rh-k">{B.coach}</span>
            <b>{B.name}</b>
            <span className="mx-big rh-mono" style={{ color: B_COL }}>{sb.score}</span>
            <span className="rh-dim rh-mono">projected {sb.proj}</span>
          </div>
        </div>
        <div className="mx-worm">
          <div className="mx-legend"><span><i className="solid" />Live margin</span><span><i className="dash" />Projected final margin</span><span className="rh-dim">Shading shows who’s ahead</span></div>
          <Worm a={A} b={B} round={round} now={now} gameByClub={gameByClub} tl={tl} />
        </div>
      </section>

      <div className="mx-teams">
        <div><h2 className="rh-h2" style={{ color: A_COL }}>{A.name}</h2><TeamCol t={A} side="a" gameByClub={gameByClub} now={now} /></div>
        <div><h2 className="rh-h2" style={{ color: B_COL }}>{B.name}</h2><TeamCol t={B} side="b" gameByClub={gameByClub} now={now} /></div>
      </div>
      <p className="rh-dim" style={{ fontSize: 12, margin: 0 }}>Ratings compare each player’s score with where his 2027 projection says he should be at this point of his game: 7.0 is on track, 8.5+ well ahead, under 5.5 well behind. Totals are the 18 on field with the captain doubled. Emergencies aren’t applied in this test.</p>
    </Shell>
  );
}
