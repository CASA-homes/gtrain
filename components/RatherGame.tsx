'use client';
// "Who'd you rather": two cards, pick one. Each swipe feeds the league's player values (dynasty or win-now).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CLUBS } from '@/lib/clubs';
import { castVote } from '@/app/(app)/players/rather/actions';
import type { Valued, ValueMode, VItem } from '@/lib/values';

type Pair = [VItem, VItem];
type Take = { pick: VItem; over: VItem; against: boolean; gap: number };
const SESSION = 10;

function pickPair(pool: VItem[], val: Map<number, number>, last: Set<number>): Pair | null {
  if (pool.length < 2) return null;
  const top = pool.slice(0, Math.min(pool.length, 240));
  const a = top[Math.floor(Math.random() ** 1.6 * top.length)];
  const va = val.get(a.id) ?? 5000;
  // Close calls tell us the most: 80% of the time, someone within ~8% of his value.
  const close = top.filter((x) => x.id !== a.id && !last.has(x.id) && Math.abs((val.get(x.id) ?? 0) - va) <= Math.max(250, va * 0.08));
  const b = Math.random() < 0.8 && close.length ? close[Math.floor(Math.random() * close.length)] : top.filter((x) => x.id !== a.id)[Math.floor(Math.random() * (top.length - 1))];
  return Math.random() < 0.5 ? [a, b] : [b, a];
}

function Card({ it, value, onPick, side }: { it: VItem; value: number; onPick: () => void; side: 'l' | 'r' }) {
  const [bad, setBad] = useState(false);
  const c = it.club ? CLUBS[it.club] : null;
  return (
    <button className={`wr-card ${side}`} onClick={onPick} style={{ ['--ca' as string]: c?.a ?? '#121513', ['--cb' as string]: c?.b ?? '#d6dad3' }}>
      <span className="wr-band" aria-hidden="true" />
      <span className="wr-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {it.photo && !bad ? <img src={it.photo} alt="" onError={() => setBad(true)} /> : <span className="wr-init">{it.kind === 'pick' ? '#' : it.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>}
      </span>
      <span className="wr-name">{it.name}</span>
      <span className="wr-sub">{it.sub}</span>
      <span className="wr-stats">
        {it.kind === 'player' ? <><span><b>{it.avg ?? '–'}</b>2026 avg</span><span><b>{it.proj || '–'}</b>2027 proj</span><span><b>{it.age ?? '–'}</b>age</span></>
          : <><span><b>{value.toLocaleString()}</b>league value</span></>}
      </span>
      <span className="wr-tap">{side === 'l' ? '← ' : ''}Him{side === 'r' ? ' →' : ''}</span>
    </button>
  );
}

export function RatherGame({ ready, items, values, totals, myTeamId, teams }: {
  ready: boolean; items: VItem[]; myTeamId: number; teams: { id: number; short: string }[];
  values: Record<ValueMode, Valued[]>; totals: { votes: number; mine: number; voters: number };
}) {
  const [mode, setMode] = useState<ValueMode>('dynasty');
  const [tab, setTab] = useState<'play' | 'board'>('play');
  const val = useMemo(() => new Map(values[mode].map((v) => [v.id, v.value])), [values, mode]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const pool = useMemo(() => values[mode].map((v) => byId.get(v.id)!).filter((x) => x && (mode === 'dynasty' || x.kind === 'player')), [values, mode, byId]);
  const recent = useRef(new Set<number>());
  const [pair, setPair] = useState<Pair | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [count, setCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const next = useCallback(() => setPair(pickPair(pool, val, recent.current)), [pool, val]);
  useEffect(() => { next(); }, [next]);

  const vote = (winner: VItem | null) => {
    if (!pair) return;
    const [a, b] = pair;
    pair.forEach((x) => { recent.current.add(x.id); });
    if (recent.current.size > 16) recent.current = new Set([...recent.current].slice(-16));
    if (winner) {
      const loser = winner.id === a.id ? b : a;
      const gap = (val.get(loser.id) ?? 0) - (val.get(winner.id) ?? 0);
      setTakes((t) => [...t, { pick: winner, over: loser, against: gap > 0, gap }]);
    }
    setCount((c) => c + 1);
    castVote(mode, a.id, b.id, winner?.id ?? null).then((r) => setErr(r.ok ? null : r.error ?? 'Couldn’t save that vote.'));
    next();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (tab !== 'play' || !pair || (e.target as HTMLElement).closest('input,select,textarea')) return;
      if (e.key === 'ArrowLeft') vote(pair[0]); else if (e.key === 'ArrowRight') vote(pair[1]); else if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); vote(null); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });

  const showSummary = count > 0 && count % SESSION === 0 && takes.length > 0;
  const hot = [...takes].filter((t) => t.against).sort((x, y) => y.gap - x.gap).slice(0, 3);

  return (
    <div className="wrap wr">
      <div className="row-between" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div>
          <span className="eyebrow">Player values · {totals.votes.toLocaleString()} swipes from {totals.voters} coach{totals.voters === 1 ? '' : 'es'} · {totals.mine + count} of them yours</span>
          <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Who’d you rather?</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="wr-seg" role="tablist" aria-label="Mode">
            <button className={mode === 'dynasty' ? 'on' : ''} onClick={() => { setMode('dynasty'); setTakes([]); }}>Dynasty</button>
            <button className={mode === 'now' ? 'on' : ''} onClick={() => { setMode('now'); setTakes([]); }}>Win-now</button>
          </div>
          <div className="wr-seg" role="tablist" aria-label="View">
            <button className={tab === 'play' ? 'on' : ''} onClick={() => setTab('play')}>Swipe</button>
            <button className={tab === 'board' ? 'on' : ''} onClick={() => setTab('board')}>Value board</button>
          </div>
        </div>
      </div>
      {!ready && <div className="card msd-note">Votes save once <code>supabase/migrations/0020_matchday_comps_msd_values.sql</code> has been run. You can still play.</div>}

      {tab === 'play' ? (
        <>
          <p className="wr-q">{mode === 'dynasty' ? 'Keeper league, long term. Who would you rather have on your list for the next five years?' : 'This season only. Who would you rather have for 2027?'}</p>
          {showSummary ? (
            <section className="card wr-sum">
              <span className="eyebrow">Your last {SESSION}</span>
              <h2 className="h2">{hot.length ? 'Your hottest takes' : 'You’re in step with the league'}</h2>
              {hot.map((t) => (
                <div key={`${t.pick.id}-${t.over.id}`} className="wr-take"><b>{t.pick.name}</b><span className="muted">over</span><b>{t.over.name}</b><span className="mono muted">league has him {t.gap.toLocaleString()} lower</span></div>
              ))}
              <button className="btn dark" style={{ alignSelf: 'flex-start' }} onClick={() => setTakes([])}>Keep going</button>
            </section>
          ) : pair ? (
            <div className="wr-duel">
              <Card it={pair[0]} value={val.get(pair[0].id) ?? 0} onPick={() => vote(pair[0])} side="l" />
              <div className="wr-or"><span>or</span><button className="btn" onClick={() => vote(null)}>Too close</button></div>
              <Card it={pair[1]} value={val.get(pair[1].id) ?? 0} onPick={() => vote(pair[1])} side="r" />
            </div>
          ) : <div className="card" style={{ padding: 20 }}>Not enough players to compare.</div>}
          <span className="muted wr-keys">Tap a card, or use ← → and ↓ for too close. Votes on your own players count half.</span>
          {err && <span style={{ color: 'var(--red-fg)', fontSize: 13 }}>{err}</span>}
        </>
      ) : (
        <Board values={values[mode]} byId={byId} myTeamId={myTeamId} teams={teams} mode={mode} />
      )}
    </div>
  );
}

function Board({ values, byId, myTeamId, teams, mode }: { values: Valued[]; byId: Map<number, VItem>; myTeamId: number; teams: { id: number; short: string }[]; mode: ValueMode }) {
  const [pos, setPos] = useState('ALL');
  const [owned, setOwned] = useState<'all' | 'mine' | 'fa'>('all');
  const max = values[0]?.value ?? 10000;
  const rows = values.map((v) => ({ v, it: byId.get(v.id)! })).filter(({ it }) => it && (mode === 'dynasty' || it.kind === 'player')
    && (pos === 'ALL' || (pos === 'PICK' ? it.kind === 'pick' : it.pos.includes(pos)))
    && (owned === 'all' || (owned === 'mine' ? it.owner === myTeamId : !it.owner))).slice(0, 200);
  const short = (id: number | null) => (id ? teams.find((t) => t.id === id)?.short ?? '?' : 'FA');
  return (
    <section className="card wr-board">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '14px 16px 6px' }}>
        <div className="msd-seg">{['ALL', 'DEF', 'MID', 'RUC', 'FWD', ...(mode === 'dynasty' ? ['PICK'] : [])].map((x) => <button key={x} className={pos === x ? 'on' : ''} onClick={() => setPos(x)}>{x}</button>)}</div>
        <div className="msd-seg">{(['all', 'mine', 'fa'] as const).map((x) => <button key={x} className={owned === x ? 'on' : ''} onClick={() => setOwned(x)}>{x === 'all' ? 'Everyone' : x === 'mine' ? 'My list' : 'Free agents'}</button>)}</div>
      </div>
      <div className="table-box" style={{ border: 0, borderRadius: 0 }}>
        <table className="squad">
          <thead><tr><th>#</th><th>Player</th><th>Club</th><th style={{ textAlign: 'right' }}>Value</th><th style={{ minWidth: 120 }} /><th style={{ textAlign: 'right' }}>v model</th><th style={{ textAlign: 'right' }}>Votes</th></tr></thead>
          <tbody>
            {rows.map(({ v, it }, i) => {
              const d = v.value - v.model;
              return (
                <tr key={v.id}>
                  <td className="mono muted">{i + 1}</td>
                  <td>{it.kind === 'player' ? <Link href={`/players/${it.id}`}>{it.name}</Link> : <b>{it.name}</b>}<span className="muted" style={{ marginLeft: 6, fontSize: 11.5 }}>{it.sub}</span></td>
                  <td className="mono">{short(it.owner)}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{v.value.toLocaleString()}</td>
                  <td><span className="wr-bar"><i style={{ width: `${(v.value / max) * 100}%` }} /></span></td>
                  <td className="mono" style={{ textAlign: 'right', color: Math.abs(d) < 60 ? 'var(--muted)' : d > 0 ? 'var(--g5)' : 'var(--red-fg)' }}>{d > 0 ? '+' : ''}{d.toLocaleString()}</td>
                  <td className="mono muted" style={{ textAlign: 'right' }}>{v.votes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
