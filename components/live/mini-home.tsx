'use client';
// Mini Games home: your games this round, past results, and a short animation of how a mini game plays out.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { lineupsFromPicks, onClock, type GamePick, type GameRow, type LRound } from '@/lib/live';
import { Empty, LiveChip, Shell, totals, useRound, type TeamRow } from './kit';

type Game = GameRow & { picks: GamePick[] };
const kindName = (g: Game) => (g.kind === 'custom' ? (g.settings?.mode === 'duels' ? 'Player duels' : 'Custom') : g.kind === 'cap5' ? 'Salary cap' : g.kind === 'duel5' ? 'Duel' : 'Snake draft');

/* ---------------- how it works ---------------- */
const STEPS = ['Challenge', 'Set the rules', 'Stake it', 'Scores roll in', 'Winner crowned'] as const;
const STAKES = [{ k: 'cash', icon: '💵', label: '$20 each' }, { k: 'pick', icon: '🎟️', label: '2027 R3 pick' }, { k: 'tokens', icon: '🪙', label: '50 tokens' }, { k: 'player', icon: '🏉', label: 'A list player' }];

export function MiniDemo() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [t, setT] = useState(0);           // 0..1 progress of the scores
  const reduce = useRef(false);
  useEffect(() => { reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches; if (reduce.current) setT(1); }, []);
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), step === 3 ? 4200 : 2600);
    return () => clearTimeout(id);
  }, [step, paused]);
  useEffect(() => {
    if (step !== 3 || reduce.current) { if (step < 3) setT(0); if (step === 4) setT(1); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (now: number) => { const x = Math.min(1, (now - t0) / 3600); setT(x); if (x < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [step]);
  // Scores: a back-and-forth race that Bodega edges at the end.
  const ease = (x: number) => 1 - Math.pow(1 - x, 2);
  const a = Math.round(612 * ease(t) + Math.sin(t * 9) * 18 * t * (1 - t)), b = Math.round(588 * ease(t) - Math.sin(t * 9) * 18 * t * (1 - t));
  return (
    <section className="rh-card mg-demo" aria-label="How a mini game works">
      <div className="mg-demo-h">
        <span className="rh-k">How a mini game works</span>
        <button type="button" className="rh-btn alt sm" onClick={() => setPaused((p) => !p)}>{paused ? 'Play' : 'Pause'}</button>
      </div>
      <ol className="mg-steps">
        {STEPS.map((s, i) => (
          <li key={s}><button type="button" className={`mg-step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`} onClick={() => { setStep(i); setPaused(true); }}><i>{i + 1}</i>{s}</button></li>
        ))}
      </ol>
      <div className="mg-stage" data-step={step}>
        {step === 0 && (
          <div className="mg-scene mg-challenge">
            <div className="mg-club a">Bodega Boys</div>
            <div className="mg-fly" aria-hidden="true">⚔️</div>
            <div className="mg-club b">Ram Dawgs</div>
            <p>Pick a club and send a challenge. They accept, and it&apos;s on for this round.</p>
          </div>
        )}
        {step === 1 && (
          <div className="mg-scene">
            <div className="mg-chips">{['Snake draft', '5 a side', 'Captain ×2', 'Round 1 only', 'Any AFL player'].map((c, i) => <span key={c} style={{ animationDelay: `${i * 0.25}s` }}>{c}</span>)}</div>
            <p>Choose the format: snake draft, salary cap, player duels or your own custom rules.</p>
          </div>
        )}
        {step === 2 && (
          <div className="mg-scene">
            <div className="mg-stakes">{STAKES.map((s, i) => <span key={s.k} className={i === 1 ? 'pick' : ''} style={{ animationDelay: `${i * 0.2}s` }}><b aria-hidden="true">{s.icon}</b>{s.label}</span>)}</div>
            <p>Put something on it, or play for bragging rights. Both clubs stake the same: cash, tokens, a draft pick or a player.</p>
          </div>
        )}
        {(step === 3 || step === 4) && (
          <div className="mg-scene">
            <div className="mg-score">
              <div className={`mg-side ${step === 4 ? 'win' : ''}`}><span>Bodega Boys</span><b className="rh-mono">{a}</b></div>
              <div className="mg-bar"><i style={{ width: `${a + b ? (a / (a + b)) * 100 : 50}%` }} /></div>
              <div className={`mg-side r ${step === 4 ? 'lose' : ''}`}><span>Ram Dawgs</span><b className="rh-mono">{b}</b></div>
            </div>
            {step === 3 ? <p>Scores tick over live through the weekend, player by player.</p> : (
              <div className="mg-crown">
                <span className="mg-trophy" aria-hidden="true">🏆</span>
                <b>Bodega Boys win by {a - b}</b>
                <span>and take the 2027 R3 pick</span>
                <span className="mg-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ left: `${(i * 7.3) % 100}%`, animationDelay: `${(i % 5) * 0.12}s`, background: ['#d6a92a', '#1d8a3c', '#2563c9', '#d23b2a'][i % 4] }} />)}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <span className="rh-dim" style={{ fontSize: 12 }}>A mini game lasts one round. Once it&apos;s set up it shows in your Squad Selector and Live Matchups for that week.</span>
    </section>
  );
}

/* ---------------- page ---------------- */
export function MiniHome({ initial, games, ready, teams, myTeamId }: { initial: LRound; games: Game[]; ready: boolean; teams: TeamRow[]; myTeamId: number }) {
  const { data, byId, gameBySquad } = useRound(initial);
  const name = (id: number) => teams.find((t) => t.id === id)?.name ?? `Club ${id}`;
  const mine = games.filter((g) => g.order.includes(myTeamId));
  const open = new Set(data.rounds.filter((r) => r.status !== 'completed').map((r) => r.n));
  const now = mine.filter((g) => open.has(g.round));
  const past = mine.filter((g) => !open.has(g.round)).slice(0, 12);
  const myTurn = now.find((g) => g.kind !== 'cap5' && g.status === 'drafting' && onClock(g.order, g.picks.length) === myTeamId);
  const card = (g: Game, live: boolean) => {
    const l = lineupsFromPicks(g.picks);
    const sc = (t: number) => totals(l[t], byId, gameBySquad);
    const opp = g.order.filter((t) => t !== myTeamId).sort((x, y) => sc(y).score - sc(x).score)[0];
    const a = sc(myTeamId), b = opp != null ? sc(opp) : null;
    const scored = live && g.status === 'done' && b && a.score + b.score > 0;
    return (
      <Link key={g.id} href={`/live/g/${g.id}`} className="rh-card mg-game">
        <div className="mg-game-h">
          <div style={{ minWidth: 0 }}><b className="rh-ellip" style={{ display: 'block' }}>{g.name}</b><span className="rh-dim" style={{ fontSize: 12 }}>Round {g.round} · {kindName(g)} · {g.order.length === 2 ? `v ${name(opp ?? 0)}` : `${g.order.length} clubs`}</span></div>
          {live ? <LiveChip live={g.status === 'drafting'} text={g.status === 'drafting' ? (onClock(g.order, g.picks.length) === myTeamId ? 'Your pick' : 'Drafting') : 'Drafted'} /> : <span className="rh-chip">Finished</span>}
        </div>
        {scored && b && <div className="mg-game-sc"><b className={`rh-mono ${a.score >= b.score ? 'rh-up' : 'rh-down'}`}>{a.score}</b><span className="rh-dim">v</span><b className="rh-mono">{b.score}</b><span className="rh-dim" style={{ fontSize: 12 }}>proj {a.proj}–{b.proj}</span></div>}
        {g.prize?.on && <span className="rh-prizechip">🏆 {g.prize.entry ? `$${g.prize.entry * g.order.length} pool` : 'Prize'}{g.prize.extras.length ? ` · ${g.prize.extras[0]}` : ''}</span>}
      </Link>
    );
  };
  return (
    <Shell title="Mini Games" sub={<>One-round games against any club, with whatever you want on the line · {data.name}</>}
      right={<div style={{ display: 'flex', gap: 8 }}><Link href="/live/games" className="rh-btn alt">Current games</Link><Link href="/live/new" className="rh-btn go">New game</Link></div>}>
      {!ready && <Empty>Run supabase/migrations/0010_mini_draft.sql in the Supabase SQL editor to switch games on.</Empty>}
      {myTurn && <Link href={`/live/g/${myTurn.id}`} className="rh-alert">You’re on the clock in <b>{myTurn.name}</b> <span>Pick now →</span></Link>}
      <div className="mg-home">
        <div className="mg-col">
          <h2 className="rh-h2">Your games this round</h2>
          {now.length ? <div className="mg-list">{now.map((g) => card(g, true))}</div> : <Empty>You’re not in a mini game this round. <Link href="/live/new" className="rh-link">Challenge someone</Link>.</Empty>}
          <h2 className="rh-h2">Past results</h2>
          {past.length ? <div className="mg-list">{past.map((g) => card(g, false))}</div> : <Empty>Nothing finished yet. Your results land here.</Empty>}
        </div>
        <div className="mg-col"><MiniDemo /></div>
      </div>
    </Shell>
  );
}
