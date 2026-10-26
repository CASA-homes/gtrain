'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TeamBadge } from '@/components/bits';
import { aiPick, effectiveBoard, rng, type Edits, type MockPick, type MockPlayer, type MockTeam } from '@/lib/mock-draft';

const KIND: Record<string, [string, string]> = { Rookie: ['#ece0f8', '#5b2d8e'], Released: ['#f5ecc8', '#6b5310'], 'Free agent': ['#dcefd6', '#1f6b3a'] };
const EDITS_KEY = 'gtrain-mock-edits';
const STATE_KEY = 'gtrain-mock-state';
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };
const newSeed = () => Math.floor(Math.random() * 1e9) + 1;

interface Result { pick: MockPick; player: MockPlayer | null; mine: boolean; bumped?: boolean }

export function MockDraft({ players, teams, picks, myTeamId }: { players: MockPlayer[]; teams: MockTeam[]; picks: MockPick[]; myTeamId: number | null }) {
  const [ready, setReady] = useState(false);
  const [asTeam, setAsTeam] = useState<number>(myTeamId ?? teams[0].id);
  const [seed, setSeed] = useState(1);
  const [mine, setMine] = useState<Record<number, string>>({});      // overall -> player key
  const [edits, setEdits] = useState<Edits>({ out: [], adj: {} });
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'All' | 'Rookie' | 'Released' | 'Free agent'>('All');
  const [menu, setMenu] = useState<number | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const st = load<{ asTeam?: number; seed?: number; mine?: Record<number, string> }>(STATE_KEY, {});
    setAsTeam(st.asTeam ?? myTeamId ?? teams[0].id); setSeed(st.seed ?? newSeed()); setMine(st.mine ?? {});
    setEdits(load<Edits>(EDITS_KEY, { out: [], adj: {} }));
    setReady(true);
  }, [myTeamId, teams]);
  useEffect(() => { if (ready) save(STATE_KEY, { asTeam, seed, mine }); }, [ready, asTeam, seed, mine]);
  useEffect(() => { if (ready) save(EDITS_KEY, edits); }, [ready, edits]);

  const team = (id: number) => teams.find((t) => t.id === id)!;
  const byKey = useMemo(() => new Map(players.map((p) => [p.key, p])), [players]);

  // Replay the whole draft from the seed, the edits and your picks. Stops at your next pick.
  const { results, onClock, pool } = useMemo(() => {
    const out = new Set(edits.out);
    let avail = players.filter((p) => !out.has(p.key));
    const taken: Record<number, MockPlayer[]> = {};
    const res: Result[] = [];
    let clock: MockPick | null = null;
    for (const pk of picks) {
      const isMine = pk.teamId === asTeam;
      let chosen: MockPlayer | null = null, bumped = false;
      if (isMine) {
        const k = mine[pk.overall];
        const p = k ? avail.find((x) => x.key === k) : null;
        if (!p) { if (k) bumped = true; clock = pk; break; }
        chosen = p;
      } else {
        chosen = aiPick(team(pk.teamId), avail, taken[pk.teamId] ?? [], edits, rng(seed ^ Math.imul(pk.overall, 2654435761)));
      }
      if (!chosen) break;
      avail = avail.filter((x) => x.key !== chosen!.key);
      (taken[pk.teamId] ??= []).push(chosen);
      res.push({ pick: pk, player: chosen, mine: isMine, bumped });
    }
    return { results: res, onClock: clock, pool: avail };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, picks, asTeam, seed, mine, edits]);

  // Keep the current pick in view as the board grows
  useEffect(() => {
    const el = boardRef.current?.querySelector('.mock-row.clock') as HTMLElement | null;
    const box = boardRef.current;
    if (el && box) box.scrollTop = el.offsetTop - box.clientHeight + el.clientHeight + 40;
  }, [results.length]);
  const myHaul = results.filter((r) => r.mine);
  const myNext = picks.filter((p) => p.teamId === asTeam);
  const list = pool
    .filter((p) => (kind === 'All' || p.kind === kind) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => effectiveBoard(b, edits) - effectiveBoard(a, edits)).slice(0, 120);

  const draft = (p: MockPlayer) => { if (onClock) setMine({ ...mine, [onClock.overall]: p.key }); setQ(''); };
  const undo = () => { const last = [...myHaul].pop(); if (!last) return; const m = { ...mine }; delete m[last.pick.overall]; setMine(m); };
  const restart = () => { setSeed(newSeed()); setMine({}); setMenu(null); };
  const edit = (p: MockPlayer, how: 'out' | 'high' | 'low') => {
    setMenu(null);
    if (how === 'out') setEdits({ ...edits, out: [...new Set([...edits.out, p.key])] });
    else setEdits({ ...edits, adj: { ...edits.adj, [p.key]: (edits.adj[p.key] ?? 0) + (how === 'high' ? -12 : 12) } });
  };
  const editCount = edits.out.length + Object.keys(edits.adj).length;

  if (!ready) return <p className="muted">Setting up the board…</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span className="muted">Draft as</span>
          <select className="input" value={asTeam} onChange={(e) => { setAsTeam(Number(e.target.value)); setMine({}); }}>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.id === myTeamId ? ' (you)' : ''}</option>)}
          </select>
        </label>
        <span className="muted" style={{ fontSize: 12 }}>Your picks: {myNext.slice(0, 8).map((p) => p.overall).join(', ')}{myNext.length > 8 ? '…' : ''}</span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={undo} disabled={!myHaul.length}>Undo my last pick</button>
          <button type="button" className="btn" onClick={() => setEdits({ out: [], adj: {} })} disabled={!editCount} title="Clear every retired / too high / too low call">Reset my edits{editCount ? ` (${editCount})` : ''}</button>
          <button type="button" className="btn dark" onClick={restart}>New mock</button>
        </span>
      </div>

      <div className="card" role="status" style={{ padding: '10px 14px', border: 0, background: onClock ? '#1f6b3a' : '#e8eee5', color: onClock ? '#fff' : 'var(--ink)', fontWeight: 600 }}>
        {onClock ? <>On the clock: pick {onClock.overall} (round {onClock.round}), {team(asTeam).name}. Choose from the list.</> : <>Draft complete. {myHaul.length} picks for {team(asTeam).name}.</>}
        {results.some((r) => r.bumped) && <span style={{ fontWeight: 400 }}> One of your earlier choices was taken before your pick after an edit; pick again.</span>}
      </div>

      <div className="mock-grid">
        {/* Board */}
        <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="mock-board" ref={boardRef}>
            {results.map(({ pick, player, mine: m }) => {
              const t = team(pick.teamId);
              const adj = player ? edits.adj[player.key] : 0;
              return (
                <div key={pick.overall} className={`mock-row${m ? ' mine' : ''}`}>
                  <span className="mono muted" style={{ fontSize: 12 }}>{pick.overall}</span>
                  <TeamBadge code={t.short} size={22} />
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {player?.id ? <Link href={`/players/${player.id}`} style={{ color: 'inherit' }}>{player.name}</Link> : player?.name}
                      {adj ? <span className="mono" style={{ fontSize: 10, marginLeft: 6, color: adj > 0 ? '#1f6b3a' : '#b4532a' }}>{adj > 0 ? '+' : ''}{adj}</span> : null}
                    </span>
                    {player && <span className="muted" style={{ fontSize: 11 }}><Chip k={player.kind} /> {line(player)}</span>}
                  </span>
                  {!m && player && (
                    <span style={{ position: 'relative' }}>
                      <button type="button" className="btn" aria-label={`Edit pick ${pick.overall}`} aria-expanded={menu === pick.overall} onClick={() => setMenu(menu === pick.overall ? null : pick.overall)} style={{ minHeight: 26, padding: '0 8px' }}>⋯</button>
                      {menu === pick.overall && (
                        <span className="card mock-menu">
                          <button type="button" onClick={() => edit(player, 'out')}>Retired / delisted</button>
                          <button type="button" onClick={() => edit(player, 'high')}>Rated too high here</button>
                          <button type="button" onClick={() => edit(player, 'low')}>Rated too low (should go earlier)</button>
                        </span>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
            {onClock && <div className="mock-row clock"><span className="mono" style={{ fontSize: 12 }}>{onClock.overall}</span><TeamBadge code={team(asTeam).short} size={22} /><b>Your pick…</b><span /></div>}
          </div>
        </section>

        {/* Available */}
        <section className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'start', position: 'sticky', top: 76 }}>
          <div className="row-between" style={{ gap: 8, flexWrap: 'wrap' }}>
            <b>{onClock ? 'Available' : 'Still on the board'}</b>
            <span className="muted" style={{ fontSize: 12 }}>{pool.length} players</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input className="input" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: '1 1 140px', minHeight: 32, fontSize: 13 }} aria-label="Search available players" />
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} style={{ minHeight: 32, fontSize: 13 }} aria-label="Player type">
              {['All', 'Rookie', 'Released', 'Free agent'].map((k) => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div className="mock-avail">
            {list.map((p) => (
              <div key={p.key} className="mock-arow">
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.id ? <Link href={`/players/${p.id}`} style={{ color: 'inherit' }}>{p.name}</Link> : p.name}</span>
                  <span className="muted" style={{ fontSize: 11 }}><Chip k={p.kind} /> {line(p)}</span>
                </span>
                <span className="mono" title="Board rating" style={{ fontSize: 12 }}>{Math.round(effectiveBoard(p, edits))}</span>
                {onClock ? <button type="button" className="btn green" onClick={() => draft(p)} style={{ minHeight: 28, padding: '0 10px' }}>Draft</button> : <span />}
              </div>
            ))}
          </div>
          {myHaul.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, fontSize: 13 }}>
              <span className="eyebrow">Your picks</span>
              {myHaul.map((r) => <div key={r.pick.overall}><span className="mono muted">{r.pick.overall}</span> {r.player?.name} <span className="muted" style={{ fontSize: 11 }}>{r.player ? line(r.player) : ''}</span></div>)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Chip({ k }: { k: string }) {
  const [bg, fg] = KIND[k] ?? ['#eee', '#333'];
  return <span style={{ background: bg, color: fg, borderRadius: 6, padding: '0 5px', fontSize: 10, fontWeight: 600 }}>{k === 'Free agent' ? 'FA' : k === 'Released' ? 'REL' : 'ROOKIE'}</span>;
}
function line(p: MockPlayer) {
  if (p.kind === 'Rookie') return `${p.pos} · phantom #${p.rank} · ${Math.round(p.chance ?? 0)}% star`;
  return `${p.pos} · ${p.age ?? '–'} · ’26 ${p.a26 != null ? Math.round(p.a26) : '–'} (${p.g26}g)${p.from ? ` · from ${p.from}` : p.club ? ` · ${p.club}` : ''}`;
}
