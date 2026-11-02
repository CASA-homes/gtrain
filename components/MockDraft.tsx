'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TeamBadge } from '@/components/bits';
import { clearMockEdits, loadMockEdits, saveMockEdit, saveMockEdits } from '@/app/(app)/draft/mock/actions';
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
  const [posLine, setPosLine] = useState<'All' | 'DEF' | 'MID' | 'RUC' | 'FWD'>('All');
  const [sortBy, setSortBy] = useState<'avg' | 'rating'>('avg');
  const [menu, setMenu] = useState<number | null>(null);
  const [synced, setSynced] = useState<boolean | null>(null);   // edits saved to your login (true) or only this browser (false)
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const st = load<{ asTeam?: number; seed?: number; mine?: Record<number, string> }>(STATE_KEY, {});
    setAsTeam(st.asTeam ?? myTeamId ?? teams[0].id); setSeed(st.seed ?? newSeed()); setMine(st.mine ?? {});
    const local = load<Edits>(EDITS_KEY, { out: [], adj: {} });
    setEdits(local);
    setReady(true);
    // Saved edits live against your login. Anything only in this browser gets moved across once.
    loadMockEdits().then(async ({ ready: dbReady, edits: remote }) => {
      if (!dbReady) { setSynced(false); return; }
      const merged: Edits = { out: [...new Set([...remote.out, ...local.out])], adj: { ...local.adj, ...remote.adj } };
      const localOnly = local.out.some((k) => !remote.out.includes(k)) || Object.keys(local.adj).some((k) => !(k in remote.adj));
      if (localOnly) await saveMockEdits(merged);
      setEdits(merged); setSynced(true);
    }).catch(() => setSynced(false));
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
  // Odds each player is still there at your next pick: replay the picks in between 200 times with fresh randomness.
  const nextMine = onClock ? picks.find((p) => p.teamId === asTeam && p.overall > onClock.overall) ?? null : null;
  const odds = useMemo(() => {
    const m = new Map<string, number>();
    if (!onClock || !nextMine) return m;
    const between = picks.filter((p) => p.overall > onClock.overall && p.overall < nextMine.overall);
    const takenBase: Record<number, MockPlayer[]> = {};
    for (const r of results) if (r.player) (takenBase[r.pick.teamId] ??= []).push(r.player);
    const top = [...pool].sort((a, b) => effectiveBoard(b, edits) - effectiveBoard(a, edits)).slice(0, 120);
    const SIMS = 200;
    for (const p of top) m.set(p.key, 0);
    for (let s2 = 0; s2 < SIMS; s2++) {
      let avail = pool.slice();
      const taken: Record<number, MockPlayer[]> = Object.fromEntries(Object.entries(takenBase).map(([k, v]) => [k, v.slice()]));
      const r = rng((s2 + 1) * 7919 + onClock.overall * 104729);
      for (const pk of between) {
        const c = aiPick(team(pk.teamId), avail, taken[pk.teamId] ?? [], edits, r);
        if (!c) break;
        avail = avail.filter((x) => x.key !== c.key);
        (taken[pk.teamId] ??= []).push(c);
      }
      const left = new Set(avail.map((x) => x.key));
      for (const p of top) if (left.has(p.key)) m.set(p.key, m.get(p.key)! + 1);
    }
    for (const [k, v] of m) m.set(k, Math.round((v / SIMS) * 100));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClock?.overall, nextMine?.overall, pool, results, edits, asTeam]);
  const list = pool
    .filter((p) => (kind === 'All' || p.kind === kind) && (posLine === 'All' || p.lines.includes(posLine)) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => sortBy === 'avg'
      ? (b.a26 ?? -1) - (a.a26 ?? -1) || effectiveBoard(b, edits) - effectiveBoard(a, edits)   // no 2026 average (rookies) goes last, best-rated first
      : effectiveBoard(b, edits) - effectiveBoard(a, edits))
    .slice(0, 150);

  const draft = (p: MockPlayer) => { if (onClock) setMine({ ...mine, [onClock.overall]: p.key }); setQ(''); };
  const undo = () => { const last = [...myHaul].pop(); if (!last) return; const m = { ...mine }; delete m[last.pick.overall]; setMine(m); };
  const restart = () => { setSeed(newSeed()); setMine({}); setMenu(null); };
  const edit = (p: MockPlayer, how: 'out' | 'high' | 'low') => {
    setMenu(null);
    const next: Edits = how === 'out' ? { ...edits, out: [...new Set([...edits.out, p.key])] }
      : { ...edits, adj: { ...edits.adj, [p.key]: (edits.adj[p.key] ?? 0) + (how === 'high' ? -12 : 12) } };
    setEdits(next);
    if (synced) saveMockEdit(p.key, next.out.includes(p.key), next.adj[p.key] ?? 0).then((r) => { if (!r.ok) setSynced(false); });
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
        <span className="muted" style={{ fontSize: 12 }} title={synced ? 'Your edits are saved to your login and sync across devices' : 'Your edits are saved in this browser only'}>{synced ? '✓ Edits saved to your login' : synced === false ? 'Edits saved in this browser' : ''}</span>
        <span className="muted" style={{ fontSize: 12 }}>Your picks: {myNext.slice(0, 8).map((p) => p.overall).join(', ')}{myNext.length > 8 ? '…' : ''}</span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={undo} disabled={!myHaul.length}>Undo my last pick</button>
          <button type="button" className="btn" onClick={() => { setEdits({ out: [], adj: {} }); if (synced) clearMockEdits(); }} disabled={!editCount} title="Clear every retired / too high / too low call">Reset my edits{editCount ? ` (${editCount})` : ''}</button>
          <button type="button" className="btn dark" onClick={restart}>New mock</button>
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12 }} className="muted">
        <span>How clubs draft (from 2026 wins and draft habits):</span>
        {[...teams].sort((a, b) => b.wNow - a.wNow).map((t) => (
          <span key={t.id} title={`Weighs 2027 points ${Math.round(t.wNow * 100)}%, the future ${Math.round((1 - t.wNow) * 100)}%`}>
            <b style={{ color: 'var(--ink)' }}>{t.short}</b> {t.window}{t.oneRookieEarly ? ' (+1 rookie)' : ''}
          </span>
        ))}
      </div>

      <div className="card" role="status" style={{ padding: '10px 14px', border: 0, background: onClock ? '#1f6b3a' : '#e8eee5', color: onClock ? '#fff' : 'var(--ink)', fontWeight: 600 }}>
        {onClock ? <>On the clock: pick {onClock.overall} (round {onClock.round}), {team(asTeam).name}. Choose from the list.</> : <>Draft complete. {myHaul.length} picks for {team(asTeam).name}.</>}
        {results.some((r) => r.bumped) && <span style={{ fontWeight: 400 }}> One of your earlier choices was taken before your pick after an edit; pick again.</span>}
      </div>

      {onClock && (
        <DraftAssistant key={`${asTeam}-${onClock.overall}`} asTeam={asTeam} overall={onClock.overall}
          nextPicks={myNext.filter((p) => p.overall > onClock.overall).map((p) => p.overall)}
          haul={myHaul.map((r) => ({ overall: r.pick.overall, name: r.player?.name ?? '', pos: r.player?.pos ?? '' }))}
          taken={results.filter((r) => !r.mine).map((r) => ({ overall: r.pick.overall, team: team(r.pick.teamId).short, name: r.player?.name ?? '' }))}
          pool={[...pool].sort((a, b) => effectiveBoard(b, edits) - effectiveBoard(a, edits)).slice(0, 70)}
          board={(p) => effectiveBoard(p, edits)} odds={odds} nextOverall={nextMine?.overall ?? null}
          onDraft={(key) => { const p = pool.find((x) => x.key === key); if (p) draft(p); }} />
      )}

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
                  <TeamBadge code={t.short} logo={t.logo} size={22} />
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
            {onClock && <div className="mock-row clock"><span className="mono" style={{ fontSize: 12 }}>{onClock.overall}</span><TeamBadge code={team(asTeam).short} logo={team(asTeam).logo} size={22} /><b>Your pick…</b><span /></div>}
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
              {['All', 'Rookie', 'Released', 'Free agent'].map((k) => <option key={k} value={k}>{k === 'All' ? 'All types' : k}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="own-toggle" role="tablist" aria-label="Position" style={{ flex: '1 1 auto' }}>
              {(['All', 'DEF', 'MID', 'RUC', 'FWD'] as const).map((l) => (
                <a key={l} role="tab" aria-selected={posLine === l} className={posLine === l ? 'on' : undefined} onClick={() => setPosLine(l)} style={{ cursor: 'pointer' }}>{l}</a>
              ))}
            </span>
            <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} style={{ minHeight: 32, fontSize: 13 }} aria-label="Sort by">
              <option value="avg">Sort: ’26 average</option>
              <option value="rating">Sort: board rating</option>
            </select>
          </div>
          <div className="mock-avail">
            {list.map((p) => (
              <div key={p.key} className="mock-arow">
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.id ? <Link href={`/players/${p.id}`} style={{ color: 'inherit' }}>{p.name}</Link> : p.name}</span>
                  <span className="muted" style={{ fontSize: 11 }}><Chip k={p.kind} /> {line(p)}</span>
                </span>
                {nextMine && odds.has(p.key) ? <span className="mono" title={`Chance he's still there at your next pick (#${nextMine.overall})`} style={{ fontSize: 10.5, color: (odds.get(p.key) ?? 0) >= 60 ? '#1f6b3a' : (odds.get(p.key) ?? 0) >= 25 ? '#8a6a12' : '#b4532a' }}>{odds.get(p.key)}%</span> : <span />}
                <span className="mono" title={sortBy === 'avg' ? '2026 average' : 'Board rating'} style={{ fontSize: 12, fontWeight: 600 }}>{sortBy === 'avg' ? (p.a26 != null ? Math.round(p.a26) : '–') : Math.round(effectiveBoard(p, edits))}</span>
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
  if (p.kind === 'Rookie') return `${p.pos} · AFL #${p.rank}${p.club ? ` · ${p.club}` : ''}`;
  return `${p.pos} · ${p.age ?? '–'} · ’26 ${p.a26 != null ? Math.round(p.a26) : '–'} (${p.g26}g)${p.from ? ` · from ${p.from}` : p.club ? ` · ${p.club}` : ''}`;
}

type Advice = { pick?: { name: string; why: string }; alternatives?: { name: string; why: string }[]; needs?: string; wait?: string; answer?: string; pickKey?: string | null; altKeys?: (string | null)[]; phase?: string };
/** AI draft assistant: reads your club's real kept list, depth, window and the board, and suggests a pick. */
function DraftAssistant({ asTeam, overall, nextPicks, haul, taken, pool, board, odds, nextOverall, onDraft }: {
  asTeam: number; overall: number; nextPicks: number[]; haul: { overall: number; name: string; pos: string }[]; taken: { overall: number; team: string; name: string }[];
  pool: MockPlayer[]; board: (p: MockPlayer) => number; odds: Map<string, number>; nextOverall: number | null; onDraft: (key: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [adv, setAdv] = useState<Advice | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gate, setGate] = useState<{ error?: string } | null>(null);
  const [code, setCode] = useState('');
  const [question, setQuestion] = useState('');
  const ask = async (passcode?: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/mock-assist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        asTeam, overall, nextPicks, haul, taken, question: question.trim() || undefined, code: passcode,
        pool: pool.map((p) => ({ key: p.key, name: p.name, kind: p.kind, pos: p.pos, age: p.age, a26: p.a26, g26: p.g26, board: board(p), fut: p.fut, rank: p.rank, club: p.club, odds: odds.get(p.key) })),
        nextOverall,
      }) });
      const j = await r.json();
      if (j.needCode) { setGate({ error: passcode ? j.error ?? 'Wrong code.' : undefined }); setCode(''); }
      else if (j.error) { setGate(null); setErr(j.error); }
      else { setGate(null); setAdv(j); }
    } catch { setErr('Couldn’t reach the assistant. Try again.'); }
    setBusy(false);
  };
  const Option = ({ name, why, k, main }: { name: string; why: string; k?: string | null; main?: boolean }) => (
    <div className={`mock-ai-opt${main ? ' main' : ''}`}>
      <span style={{ minWidth: 0 }}><b>{name}</b>{k && odds.has(k) && nextOverall ? <span className="mono" style={{ fontSize: 11, marginLeft: 6, color: (odds.get(k) ?? 0) >= 60 ? '#1f6b3a' : (odds.get(k) ?? 0) >= 25 ? '#8a6a12' : '#b4532a' }}>{odds.get(k)}% at #{nextOverall}</span> : null} <span className="muted" style={{ fontSize: 13 }}>{why}</span></span>
      {k ? <button type="button" className={`btn ${main ? 'green' : ''}`} onClick={() => onDraft(k)} style={{ minHeight: 28, padding: '0 10px', flex: 'none' }}>Draft</button> : <span className="muted" style={{ fontSize: 11 }}>gone</span>}
    </div>
  );
  return (
    <section className="card mock-ai">
      {gate && (
        <div className="logo-modal" role="dialog" aria-modal="true" aria-label="Enter passcode" onClick={(e) => { if (e.target === e.currentTarget) setGate(null); }}>
          <form className="logo-modal-card" style={{ width: 280 }} onSubmit={(e) => { e.preventDefault(); ask(code); }}>
            <b style={{ fontSize: 16 }}>Passcode</b>
            <span className="muted" style={{ fontSize: 13 }}>Enter the code to use the assistant. You’ll only need it once on this device.</span>
            <input className="input" autoFocus inputMode="numeric" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} aria-label="Passcode" style={{ width: '100%', textAlign: 'center', fontSize: 22, letterSpacing: '.3em' }} />
            {gate.error && <span style={{ color: '#a3271c', fontSize: 13 }}>{gate.error}</span>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
              <button type="button" className="btn" onClick={() => setGate(null)}>Cancel</button>
              <button type="submit" className="btn dark" disabled={busy || !code}>{busy ? 'Checking…' : 'Unlock'}</button>
            </div>
          </form>
        </div>
      )}
      <div className="row-between" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="ask-spark" style={{ width: 28, height: 28, fontSize: 13 }} aria-hidden>✦</span><b>Draft assistant</b>{adv?.phase && <span className="muted" style={{ fontSize: 12 }}>· reads your list as {adv.phase.toLowerCase()}</span>}</span>
        <span style={{ display: 'flex', gap: 6, flex: '1 1 260px', justifyContent: 'flex-end' }}>
          <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask anything: “chances X is there at my next pick?”, “take my win-now asset now?”" maxLength={300} style={{ flex: 1, minHeight: 32, fontSize: 13 }} aria-label="Question for the assistant"
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) ask(); }} />
          <button type="button" className="btn dark" disabled={busy} onClick={() => ask()}>{busy ? 'Thinking…' : adv ? 'Ask again' : `Who at #${overall}?`}</button>
        </span>
      </div>
      {err && <p style={{ margin: 0, color: '#a3271c', fontSize: 14 }}>{err}</p>}
      {!adv && !err && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Looks at your kept list (ages, 2027 projections, depth on each line), your premiership window, your next picks and who’s left, then suggests a pick and two alternatives. {nextOverall ? `It also gets the odds each player is still there at #${nextOverall}, from 200 replays of the picks in between.` : ''}</p>}
      {adv && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {adv.answer && <p style={{ margin: 0, fontSize: 14 }}>{adv.answer}</p>}
          {adv.pick && <Option name={adv.pick.name} why={adv.pick.why} k={adv.pickKey} main />}
          {(adv.alternatives ?? []).map((x, i) => <Option key={i} name={x.name} why={x.why} k={adv.altKeys?.[i]} />)}
          {adv.needs && <span style={{ fontSize: 13 }}><b>Needs:</b> {adv.needs}</span>}
          {adv.wait && <span style={{ fontSize: 13 }}><b>Can wait:</b> {adv.wait}</span>}
          <span className="muted" style={{ fontSize: 11 }}>AI suggestion from the site’s numbers. A second opinion, not gospel.</span>
        </div>
      )}
    </section>
  );
}
