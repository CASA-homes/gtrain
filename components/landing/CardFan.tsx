'use client';
// Sign-in page showcase: six app cards held like a hand. One lifts at a time with a caption (Smith first, then
// Anderson's heat map, then the rest); hover or tap picks one. Anderson's heat map steps through his recent
// rounds on its own until someone taps a round.
import { useEffect, useRef, useState } from 'react';

export type HeatGame = { round: number; opp: string; score: number; tog: number | null; heat: string | null };
export type Honour = { year: number; premier: string; spoon: string | null; medal: string | null };
export interface FanData {
  anderson: { avg: number; playerNo: string; games: HeatGame[] };
  honours: Honour[];
  drever: { height: number; avg: number; best: number; boards: [string, number][]; traits: string[]; flag: string; chance: number; landing: string };
}

const TONE = (x: number): [string, string] => x >= 120 ? ['#1f6b3a', '#fff'] : x >= 100 ? ['#4f9a5f', '#fff'] : x >= 80 ? ['#9ccb84', '#151a16'] : x >= 70 ? ['#d6e49a', '#151a16'] : x >= 50 ? ['#f1e8a8', '#151a16'] : ['#f3c2b9', '#7a1d12'];
const RND = (r: number) => (r === 0 ? 'OR' : r >= 25 ? (['QF', 'SF', 'PF', 'GF'][r - 25] ?? `R${r}`) : `R${r}`);

const CARDS = ['history', 'rookie', 'profile', 'heat', 'trade', 'cup'] as const;
type Key = typeof CARDS[number];
const ORDER: Key[] = ['profile', 'heat', 'cup', 'trade', 'rookie', 'history'];
const HERO: Partial<Record<Key, number>> = { profile: 0, heat: 1 };
const CAPTION: Record<Key, [string, string]> = {
  profile: ['Player profiles', 'Every attribute out of 20, and a keeper value rating for each player.'],
  heat: ['Heat maps', 'A heat map for every game. Tap any round in his form line to see where he played.'],
  cup: ['Knockout Cup', 'Run a cup alongside the season, with draft picks for the winner and runner-up.'],
  trade: ['Pick trading', 'Trade players, future picks and mid-season picks, with a fairness meter.'],
  rookie: ['Rookie scouting', 'Draft boards, junior scores, traits and the chance he becomes a star.'],
  history: ['History and records', 'Every premiership, spoon and medal, plus league records.'],
};

/** An AFL guernsey in club colours (no logos), in place of a player photo. */
const KIT_BODY = 'M13 3 L17 3 Q20 7.5 23 3 L27 3 L35 8.5 L31.5 15.5 L30.5 37 L9.5 37 L8.5 15.5 L5 8.5 Z';
function Kit({ club }: { club: 'GEE' | 'GCS' }) {
  const id = `kit-${club}`;
  return (
    <svg className="kl-kit" viewBox="0 0 40 40" aria-hidden="true">
      <defs><clipPath id={id}><path d={KIT_BODY} /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        {club === 'GEE' ? (
          <><rect width="40" height="40" fill="#1c3c63" />{[9, 17.5, 26, 34.5].map((y) => <rect key={y} y={y} width="40" height="4.2" fill="#fff" />)}</>
        ) : (
          <><rect width="40" height="40" fill="#e02112" /><path d="M0 0 H40 V12 Q20 17 0 12 Z" fill="#ffd700" /><rect x="8" y="18" width="3" height="20" fill="#ffd700" /><rect x="29" y="18" width="3" height="20" fill="#ffd700" /></>
        )}
      </g>
      <path d={KIT_BODY} fill="none" stroke="rgb(0 0 0 / .25)" strokeWidth=".8" />
      <path d="M17 3 Q20 7.5 23 3" fill="none" stroke="rgb(0 0 0 / .35)" strokeWidth="1" />
    </svg>
  );
}

function Bar20({ v }: { v: number }) {
  return <span className="kl-b20">{Array.from({ length: 20 }, (_, i) => <i key={i} className={i < v ? (v >= 18 ? 'on hi' : 'on') : ''} />)}</span>;
}

function ProfileCard() {
  const attrs: [string, number][] = [['Ball winning', 20], ['Contested ball', 18], ['Clearances', 17], ['Kicking', 16], ['Metres gained', 19], ['Tackling', 14]];
  return (
    <>
      <div className="kl-pf"><span className="kl-face"><Kit club="GEE" /></span><div><b>Bailey Smith</b><small>Geelong · MID · 25</small></div><div className="kl-avg"><b>118.2</b><small>2026 avg</small></div></div>
      <div className="kl-kv"><span>Keeper value</span><span className="kl-stars" aria-label="5 out of 5">★★★★★</span><b>Elite keeper</b></div>
      <div className="kl-body">{attrs.map(([l, v]) => <div key={l} className="kl-attr"><span>{l}</span><Bar20 v={v} /><b>{v}</b></div>)}</div>
    </>
  );
}

function HeatCard({ d, active }: { d: FanData['anderson']; active: boolean }) {
  const games = d.games;
  const [i, setI] = useState(games.length - 1);
  const [manual, setManual] = useState(false);
  const [fade, setFade] = useState(false);
  const form = useRef<HTMLDivElement>(null);
  const g = games[i];
  const go = (n: number) => { setFade(true); setTimeout(() => { setI(n); setFade(false); }, 160); };
  useEffect(() => {
    if (manual || !active || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((c) => (c <= games.length - 8 ? games.length - 1 : c - 1)), 1600);
    return () => clearInterval(t);
  }, [manual, active, games.length]);
  useEffect(() => {
    const el = form.current?.children[i] as HTMLElement | undefined;
    if (el && form.current) form.current.scrollTo({ left: el.offsetLeft - form.current.clientWidth + el.offsetWidth + 4, behavior: 'smooth' });
  }, [i]);
  // Warm the next few images so the auto-play doesn't flash.
  useEffect(() => { games.slice(-8).forEach((x) => { if (x.heat) { const im = new Image(); im.src = heatSrc(x.heat, d.playerNo); } }); }, [games, d.playerNo]);
  return (
    <>
      <div className="kl-pf"><span className="kl-face"><Kit club="GCS" /></span><div><b>Noah Anderson</b><small>Gold Coast · MID · 26</small></div><div className="kl-avg"><b>{d.avg.toFixed(1)}</b><small>2026 avg</small></div></div>
      <div className="kl-body" style={{ gap: 6 }}>
        <div className="kl-hh"><span>Heat map</span><b>{RND(g.round)} v {g.opp} · {g.score}</b></div>
        <div className={`kl-heat ${fade ? 'fade' : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {g.heat ? <img key={g.heat} src={heatSrc(g.heat, d.playerNo)} alt={`Heat map, ${RND(g.round)} v ${g.opp}`} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span>No heat map for this game</span>}
        </div>
        <div className="kl-rounds" ref={form} onClick={(e) => e.stopPropagation()}>
          {games.map((x, n) => { const [bg, fg] = TONE(x.score); return (
            <button key={n} type="button" aria-pressed={n === i} aria-label={`${RND(x.round)} v ${x.opp}, ${x.score} points`} onClick={() => { setManual(true); go(n); }}>
              <b style={{ background: bg, color: fg }}>{x.score}</b><i>{RND(x.round)}</i>
            </button>
          ); })}
        </div>
        <div className="kl-hline"><span><b>{g.tog ?? '–'}%</b> TOG</span><span><b>{g.score - d.avg > 0 ? '+' : ''}{Math.round(g.score - d.avg)}</b> v avg</span><span className="kl-dim">tap a round</span></div>
      </div>
    </>
  );
}
const heatSrc = (id: string, no: string) => `https://s.afl.com.au/heatmaps/2026/match-${id}-${no}.png`;

function RookieCard({ d }: { d: FanData['drever'] }) {
  return (
    <>
      <div className="kl-h"><b>Draft profile</b><span>2026 draft</span></div>
      <div className="kl-body">
        <div className="kl-rk"><b>2</b><div><strong>Ethan Drever</strong><small>GWV Rebels · inside mid · {d.landing}</small></div></div>
        <div className="kl-tiles"><div><span>Height</span><b>{d.height}</b></div><div><span>Talent Lg avg</span><b>{d.avg.toFixed(1)}</b></div><div><span>Best</span><b>{d.best}</b></div></div>
        <div className="kl-boards">Boards: {d.boards.map(([n, r], k) => <span key={n}>{k ? ' · ' : ''}{n} <b>#{r}</b></span>)}</div>
        <div className="kl-chips">{d.traits.map((t) => <span key={t}>{t}</span>)}<span className="warn">{d.flag}</span></div>
        <div className="kl-chance"><span>Star chance</span><span className="kl-track"><i style={{ width: `${d.chance}%` }} /></span><b>{Math.round(d.chance)}%</b></div>
      </div>
    </>
  );
}

function HistoryCard({ rows }: { rows: Honour[] }) {
  const flags = rows.reduce<Record<string, number>>((a, r) => { a[r.premier] = (a[r.premier] ?? 0) + 1; return a; }, {});
  const [top, n] = Object.entries(flags).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  return (
    <>
      <div className="kl-h"><b>Honour roll</b><span>Since {rows[rows.length - 1]?.year}</span></div>
      <div className="kl-body kl-hon">
        {rows.slice(0, 4).map((r) => (
          <div key={r.year}><b>{r.year}</b><span className="pr">🏆 {r.premier}</span><span className="kl-dim">{r.medal ? `Medal: ${r.medal}` : r.spoon ? `Spoon: ${r.spoon}` : ''}</span></div>
        ))}
        <div className="rec"><span>Most flags</span><b>{top} · {n}</b></div>
      </div>
    </>
  );
}

function TradeCard() {
  return (
    <>
      <div className="kl-h"><b>Trade planner</b><span>Mid-season</span></div>
      <div className="kl-body">
        <div className="kl-tr"><div><span>You give</span>Tom Sparrow<br />George Hewett<br />Dayne Zorko</div><em>⇄</em><div><span>You get</span>Lachie O’Sullivan<br /><b>2028 R2 pick</b><br /><b>Mid-season R1</b></div></div>
        <div className="kl-meter"><span><i /></span><div><span>Fair to them</span><b>Slight win for you</b></div></div>
      </div>
    </>
  );
}

function CupCard() {
  return (
    <>
      <div className="kl-h"><b>Knockout Cup</b><span>Semis → final</span></div>
      <div className="kl-body">
        <div className="kl-br">
          <div className="col">
            <div className="m"><div className="w"><span>Bodega Boys</span><b>1,812</b></div><div><span>Ram Dawgs</span><b>1,746</b></div></div>
            <div className="m"><div><span>Such Is Fyfe</span><b>1,690</b></div><div className="w"><span>NSW-ACT Academy</span><b>1,734</b></div></div>
          </div>
          <span className="join" />
          <div className="col"><div className="m"><div><span>Bodega Boys</span><b>–</b></div><div><span>NSW-ACT Academy</span><b>–</b></div></div><span className="kl-dim" style={{ textAlign: 'center', fontSize: 11 }}>Final</span></div>
        </div>
        <div className="kl-prize">🏆 <span>Winner: <b>round 2 pick</b> · runner-up: round 4</span></div>
      </div>
    </>
  );
}

export function CardFan({ data }: { data: FanData }) {
  const [cur, setCur] = useState<Key>('profile');
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setCur((c) => ORDER[(ORDER.indexOf(c) + 1) % ORDER.length]), cur in HERO ? 4200 : 3000);
    return () => clearTimeout(t);
  }, [cur, paused]);
  const mid = (CARDS.length - 1) / 2;
  return (
    <div className="kl-fanwrap">
      <div className="kl-fan" onMouseLeave={() => setPaused(false)} aria-label="What's inside Keeper HQ">
        {CARDS.map((k, i) => {
          const back = !(k in HERO), up = cur === k, off = i - mid;
          const z = up ? 30 : k in HERO ? 20 - HERO[k]! : 10 - Math.abs(off);
          const base = `translate(-50%,-50%) translateX(calc(${off} * var(--spread))) translateY(${Math.abs(off) * 16 + (back ? 18 : 0)}px) rotate(${off * 6}deg)`;
          const transform = up ? `${base} translateY(-56px) rotate(${-off * 6}deg) scale(1.08)` : `${base}${back ? ' scale(.88)' : k === 'profile' ? ' scale(1.06)' : ''}`;
          return (
            <div key={k} className={`kl-card ${back ? 'back' : ''} ${up ? 'up' : ''} ${k === 'heat' || k === 'profile' ? 'tall' : ''}`} style={{ transform, zIndex: z }}
              onMouseEnter={() => { setPaused(true); setCur(k); }} onClick={() => { setPaused(true); setCur(k); }}>
              {k === 'profile' ? <ProfileCard /> : k === 'heat' ? <HeatCard d={data.anderson} active={cur === 'heat'} /> : k === 'rookie' ? <RookieCard d={data.drever} />
                : k === 'history' ? <HistoryCard rows={data.honours} /> : k === 'trade' ? <TradeCard /> : <CupCard />}
            </div>
          );
        })}
      </div>
      <div className="kl-cap" aria-live="polite">
        <b>{CAPTION[cur][0]}</b><span>{CAPTION[cur][1]}</span>
        <div className="kl-dots">{ORDER.map((k) => <i key={k} className={k === cur ? 'on' : ''} />)}</div>
      </div>
    </div>
  );
}
