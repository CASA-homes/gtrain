'use client';
// Sign-in page showcase: three player cards standing in front of a faded contracts page. One pops forward at a
// time with a caption (Smith, then Anderson's heat map, then Drever); hover or tap picks one. Anderson's heat map steps through his recent
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

const CARDS = ['rookie', 'profile', 'heat'] as const;
type Key = typeof CARDS[number];
const ORDER: Key[] = ['profile', 'heat', 'rookie'];
const CAPTION: Record<Key, [string, string]> = {
  profile: ['Player profiles', 'Every attribute out of 20, and a keeper value rating for each player.'],
  heat: ['Heat maps', 'A heat map for every game. Tap any round in his form line to see where he played.'],
  rookie: ['Rookie scouting', 'Draft boards, junior scores, traits and the chance he becomes a star.'],
};

/** An AFL guernsey in club colours (no logos), in place of a player photo. */
const KIT_BODY = 'M13 3 L17 3 Q20 7.5 23 3 L27 3 L35 8.5 L31.5 15.5 L30.5 37 L9.5 37 L8.5 15.5 L5 8.5 Z';
function Kit({ club, no }: { club: 'GEE' | 'GCS'; no: number }) {
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
      <text x="20" y="28.5" textAnchor="middle" className="kl-kitno" stroke={club === 'GEE' ? '#1c3c63' : '#8a1409'}>{no}</text>
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
      <div className="kl-pf"><span className="kl-face"><Kit club="GEE" no={3} /></span><div><b>Bailey Smith</b><small>Geelong · MID · 25</small></div><div className="kl-avg"><b>118.2</b><small>2026 avg</small></div></div>
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
      <div className="kl-pf"><span className="kl-face"><Kit club="GCS" no={15} /></span><div><b>Noah Anderson</b><small>Gold Coast · MID · 26</small></div><div className="kl-avg"><b>{d.avg.toFixed(1)}</b><small>2026 avg</small></div></div>
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






/** The backdrop: a faded slice of a club's contracts page, the deck the cards pop out of. */
const ROWS: [string, string, string, string, string, string][] = [
  ['Bailey Smith', 'MID · GEE', '4 yrs → 2030', 'No clause', '—', '$154k'], ['Nick Daicos', 'MID · COL', '5 yrs → 2031', 'High', '40.5k KT', '$162k'],
  ['Noah Anderson', 'MID · GCS', '4 yrs → 2030', 'No clause', '—', '$113k'], ['Max Hall', 'MID · STK', '3 yrs → 2029', 'Standard', '12.2k KT', '$81k'],
  ['Harley Garcia', 'MID · STK', '4 yrs → 2030', 'Extended', '—', '$56k'], ['Lachie Whitfield', 'DEF · CAR', '1 yr → 2027', 'Pending FA', '—', '$69k'],
  ['Izak Rankine', 'MID · ADE', '4 yrs → 2030', 'Standard', '12.6k KT', '$84k'], ['Darcy Wilmot', 'DEF · BRL', '3 yrs → 2029', 'No clause', '—', '$67k'],
  ['Tim English', 'RUC · WBD', '2 yrs → 2028', 'Standard', '6.9k KT', '$47k'], ['Dan Wilson', 'MID · STK', '4 yrs → 2030', 'Rookie', '—', '$14k'],
  ['Sam Bolton', 'MID · FRE', '2 yrs → 2028', 'High', '12.5k KT', '$50k'], ['Ethan Drever', 'MID · GWV', '1 yr → 2027', 'Draft', '—', '$32k'],
  ['Jarrod Berry', 'MID · BRL', '1 yr → 2027', 'Final year', '—', '$29k'], ['Tom Sparrow', 'MID · MEL', '2 yrs → 2028', 'No clause', '—', '$86k'],
];
function Backdrop() {
  return (
    <div className="kl-deck" aria-hidden="true">
      <div className="kl-deck-head"><b>Bodega Boys · Contracts</b><span>$953k / $1.25M</span></div>
      <div className="kl-deck-row th"><span>Player</span><span>Length</span><span>Type</span><span>Clause</span><span>Cost</span></div>
      {ROWS.map(([n, m, l, t, c, v]) => (
        <div key={n} className="kl-deck-row"><span><b>{n}</b><small>{m}</small></span><span>{l}</span><span><i className={`t-${t.split(' ')[0].toLowerCase()}`}>{t}</i></span><span>{c}</span><span><b>{v}</b></span></div>
      ))}
    </div>
  );
}

export function CardFan({ data }: { data: FanData }) {
  const [cur, setCur] = useState<Key>('profile');
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setCur((c) => ORDER[(ORDER.indexOf(c) + 1) % ORDER.length]), 4200);
    return () => clearTimeout(t);
  }, [cur, paused]);
  const i0 = ORDER.indexOf(cur);
  const slot = (k: Key) => (ORDER.indexOf(k) - i0 + ORDER.length) % ORDER.length; // 0 front, 1 right, 2 left
  return (
    <div className="kl-fanwrap">
      <div className="kl-fan" onMouseLeave={() => setPaused(false)} aria-label="What's inside Keeper HQ">
        <Backdrop />
        {CARDS.map((k) => {
          const sl = slot(k), up = sl === 0;
          const transform = up ? 'translate(-50%,-50%) translateY(-8px) scale(1)'
            : `translate(-50%,-50%) translateX(calc(${sl === 1 ? 1 : -1} * var(--spread))) translateY(26px) scale(.84)`;
          return (
            <div key={k} className={`kl-card tall ${up ? 'up' : 'back'}`} style={{ transform, zIndex: up ? 30 : 10 }}
              onMouseEnter={() => { setPaused(true); setCur(k); }} onClick={() => { setPaused(true); setCur(k); }}>
              {k === 'profile' ? <ProfileCard /> : k === 'heat' ? <HeatCard d={data.anderson} active={cur === 'heat'} /> : <RookieCard d={data.drever} />}
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
