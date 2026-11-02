'use client';
// G-Train Knockout Cup: the home-page panel and the full cup page (tables, fixture, knockout bracket, cup lineup).
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { CONF_NAMES, CUP_NAME, CUP_SEASON, CUP_SLOTS, CUP_SLOT_NAME, CUP_SLOT_ORDER, FINAL_ROUND, GROUP_ROUNDS, ON_FIELD, SEMI_ROUND, fitsSlot, roundWeek, standings, type CupLineup, type CupMatch, type CupResult, type CupSlot, type StandRow } from '@/lib/cup';
import { saveCupLineup } from '@/app/(app)/live/cup-actions';
import { CLUBS } from '@/lib/clubs';
import { Shell } from './kit';

export interface CupSquadPlayer { id: number; name: string; pos: string[]; club: string | null; proj: number; a26: number | null; keeper: boolean }
export interface CupData {
  ready: boolean; confs: [number[], number[]]; matches: CupMatch[]; byes: Record<number, number[]>; results: CupResult[];
  teams: { id: number; name: string; short: string }[]; myTeamId: number; lineups: Record<number, CupLineup>; squad: CupSquadPlayer[];
}
const filled = (l?: CupLineup) => (l ? CUP_SLOT_ORDER.filter((s) => s !== 'EMG').reduce((a, s) => a + (l[s]?.length ?? 0), 0) : 0);

function Trophy({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M9 4h14v7a7 7 0 0 1-14 0z" fill="#f2c94c" /><path d="M9 6H4v2a5 5 0 0 0 5 5M23 6h5v2a5 5 0 0 1-5 5" fill="none" stroke="#f2c94c" strokeWidth="2" />
      <rect x="14" y="17" width="4" height="5" fill="#d9a92c" /><rect x="10" y="22" width="12" height="4" rx="1" fill="#f2c94c" /><rect x="8" y="26" width="16" height="3" rx="1" fill="#d9a92c" />
    </svg>
  );
}

function Table({ rows, name, myTeamId, compact }: { rows: StandRow[]; name: (id: number) => string; myTeamId: number; compact?: boolean }) {
  return (
    <table className="cup-table">
      <thead><tr><th>#</th><th className="l">Club</th><th>P</th><th>W</th>{!compact && <><th>L</th><th>D</th></>}<th>%</th><th>Pts</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.team} className={`${i < 2 ? 'q' : ''} ${r.team === myTeamId ? 'me' : ''}`}>
            <td>{i + 1}</td><td className="l"><span className="rh-ellip">{name(r.team)}</span></td><td>{r.p}</td><td>{r.w}</td>{!compact && <><td>{r.l}</td><td>{r.d}</td></>}<td>{r.p ? r.pct.toFixed(1) : '–'}</td><td><b>{r.pts}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------- home panel ---------------- */
export function CupPanel({ data }: { data: CupData }) {
  const name = (id: number) => data.teams.find((t) => t.id === id)?.name ?? `Club ${id}`;
  const myConf = data.confs[0].includes(data.myTeamId) ? 0 : data.confs[1].includes(data.myTeamId) ? 1 : 0;
  const rows = standings(data.confs[myConf], data.matches, data.results);
  const played = new Set(data.results.map((r) => r.match_id));
  const mine = data.matches.filter((m) => m.home === data.myTeamId || m.away === data.myTeamId);
  const next = mine.find((m) => !played.has(m.id));
  const nextBye = GROUP_ROUNDS.find((r) => data.byes[r]?.includes(data.myTeamId) && (!next || r < next.round));
  const opp = next ? (next.home === data.myTeamId ? next.away : next.home) : null;
  const set = next ? filled(data.lineups[next.round]) : 0;
  return (
    <section className="rh-card cup-panel">
      <div className="cup-head">
        <Trophy />
        <div style={{ minWidth: 0, flex: 1 }}>
          <span className="rh-k">{CUP_SEASON} · separate from the regular season</span>
          <b className="cup-title">{CUP_NAME}</b>
        </div>
        <Link href="/live/cup" className="rh-link" style={{ fontSize: 13 }}>Full cup</Link>
      </div>
      <div className="cup-format">
        <span>2 conferences of 5</span><span>4 group games</span><span>Top 2 → semis</span><span>Final R{FINAL_ROUND}</span><span>16 a side · no captains</span>
      </div>
      <div className="cup-next">
        {next ? (
          <>
            <span className="rh-k">Your next cup game · Round {next.round} · week of {roundWeek(next.round)}{next.stage !== 'group' ? ` · ${next.stage === 'semi' ? 'Semi-final' : 'Final'}` : ` · group game ${mine.filter((m) => m.stage === 'group').indexOf(next) + 1} of 4`}</span>
            <b>v {opp ? name(opp) : next.label ?? 'TBC'}</b>
            {nextBye && <span className="rh-dim" style={{ fontSize: 12.5 }}>You have the bye in round {nextBye}.</span>}
            <span className={set >= ON_FIELD ? 'rh-up' : 'rh-down'} style={{ fontSize: 13 }}>{set >= ON_FIELD ? 'Cup lineup set' : set ? `Cup lineup ${set}/${ON_FIELD}` : 'Cup lineup not set yet'}</span>
          </>
        ) : <b>Your cup run is over for {CUP_SEASON}.</b>}
      </div>
      <div><span className="rh-k">{CONF_NAMES[myConf]}</span><Table rows={rows} name={name} myTeamId={data.myTeamId} compact /></div>
      <Link href="/live/cup#lineup" className="rh-btn go" style={{ alignSelf: 'flex-start' }}>Set cup lineup</Link>
    </section>
  );
}

/* ---------------- full page ---------------- */
function autoFill(squad: CupSquadPlayer[]): CupLineup {
  const pool = [...squad].sort((a, b) => b.proj - a.proj);
  const used = new Set<number>(), out: CupLineup = {};
  for (const s of ['RUC', 'DEF', 'FWD', 'MID'] as CupSlot[]) {
    out[s] = [];
    for (const p of pool) { if (out[s]!.length >= CUP_SLOTS[s]) break; if (!used.has(p.id) && p.pos.includes(s)) { out[s]!.push(p.id); used.add(p.id); } }
  }
  for (const s of ['UTIL', 'EMG'] as CupSlot[]) { out[s] = pool.filter((p) => !used.has(p.id)).slice(0, CUP_SLOTS[s]).map((p) => p.id); out[s]!.forEach((id) => used.add(id)); }
  return out;
}

function LineupEditor({ data }: { data: CupData }) {
  const mine = data.matches.filter((m) => m.home === data.myTeamId || m.away === data.myTeamId);
  const rounds = [...new Set([...mine.map((m) => m.round), SEMI_ROUND, FINAL_ROUND])].sort((a, b) => a - b);
  const played = new Set(data.results.map((r) => r.match_id));
  const first = mine.find((m) => !played.has(m.id))?.round ?? rounds[0];
  const [round, setRound] = useState(first);
  const savedFor = (r: number) => data.lineups[r] ?? [...rounds].reverse().filter((x) => x < r).map((x) => data.lineups[x]).find(Boolean);
  const [lineup, setLineup] = useState<CupLineup>(() => savedFor(first) ?? {});
  const [sel, setSel] = useState<{ slot: CupSlot; i: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const byId = useMemo(() => new Map(data.squad.map((p) => [p.id, p])), [data.squad]);
  const used = new Set(CUP_SLOT_ORDER.flatMap((s) => lineup[s] ?? []));
  const match = mine.find((m) => m.round === round);
  const name = (id: number) => data.teams.find((t) => t.id === id)?.name ?? `Club ${id}`;
  const opp = match ? (match.home === data.myTeamId ? match.away : match.home) : null;
  const pickRound = (r: number) => { setRound(r); setLineup(savedFor(r) ?? {}); setSel(null); setMsg(null); };
  const place = (id: number) => {
    if (!sel) return;
    const next: CupLineup = Object.fromEntries(CUP_SLOT_ORDER.map((s) => [s, (lineup[s] ?? []).filter((x) => x !== id)]));
    const arr = [...(next[sel.slot] ?? [])];
    arr[sel.i] = id;
    next[sel.slot] = arr.filter((x) => x != null);
    setLineup(next); setSel(null); setMsg(null);
  };
  const remove = (s: CupSlot, id: number) => { setLineup({ ...lineup, [s]: (lineup[s] ?? []).filter((x) => x !== id) }); setMsg(null); };
  const options = sel ? data.squad.filter((p) => fitsSlot(p.pos, sel.slot)).sort((a, b) => b.proj - a.proj) : [];
  const count = filled(lineup);
  return (
    <section className="rh-card" id="lineup" style={{ gap: 14 }}>
      <div className="cup-head">
        <div style={{ flex: 1, minWidth: 0 }}><span className="rh-k">Cup lineup</span><b className="cup-title">Round {round}{opp ? ` v ${name(opp)}` : match?.label ? ` · ${match.label}` : !match && round !== SEMI_ROUND && round !== FINAL_ROUND ? ' · bye' : ''}</b></div>
        <select className="rh-select sm" id="cup-round" value={round} onChange={(e) => pickRound(Number(e.target.value))}>
          {rounds.map((r) => <option key={r} value={r}>Round {r}{r === SEMI_ROUND ? ' · semis' : r === FINAL_ROUND ? ' · final' : ''}{data.lineups[r] ? ' · saved' : ''}</option>)}
        </select>
      </div>
      <span className="rh-dim" style={{ fontSize: 13 }}>4 DEF, 6 MID, 1 RUC, 4 FWD and a utility on the field, plus 4 emergencies. No captain: every player scores once. Tap a spot, then a player.</span>
      <div className="cup-lineup">
        {CUP_SLOT_ORDER.map((s) => (
          <div key={s} className="cup-line">
            <span className="rh-k">{CUP_SLOT_NAME[s]} · {(lineup[s] ?? []).length}/{CUP_SLOTS[s]}</span>
            <div className="cup-slots">
              {Array.from({ length: CUP_SLOTS[s] }, (_, i) => {
                const id = lineup[s]?.[i]; const p = id != null ? byId.get(id) : undefined;
                const on = sel?.slot === s && sel.i === i;
                return (
                  <button key={i} className={`cup-slot ${p ? 'full' : ''} ${on ? 'on' : ''}`} onClick={() => setSel(on ? null : { slot: s, i: p ? i : (lineup[s] ?? []).length })}>
                    {p ? <><b className="rh-ellip">{p.name}</b><span className="rh-dim">{p.pos.join('/')} · {p.proj}</span></> : <span className="rh-dim">+ {s === 'UTIL' ? 'Any position' : s === 'EMG' ? 'Emergency' : s}</span>}
                    {p && <span className="cup-x" role="button" aria-label={`Remove ${p.name}`} onClick={(e) => { e.stopPropagation(); remove(s, p.id); }}>×</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {sel && (
        <div className="cup-picker">
          <span className="rh-k">Pick for {CUP_SLOT_NAME[sel.slot].toLowerCase()} · sorted by 2027 projection</span>
          {options.map((p) => (
            <button key={p.id} className={`cup-opt ${used.has(p.id) ? 'used' : ''}`} onClick={() => place(p.id)}>
              <span className="sw" style={{ background: p.club ? CLUBS[p.club]?.a ?? '#444' : '#444' }} />
              <span className="rh-ellip" style={{ flex: 1, textAlign: 'left' }}>{p.name}<span className="rh-dim"> {p.pos.join('/')}{used.has(p.id) ? ' · in lineup (moves here)' : ''}</span></span>
              <span className="rh-mono">{p.proj}</span>
            </button>
          ))}
        </div>
      )}
      {msg && <div className={`rh-toast ${msg.ok ? 'up' : 'down'}`}>{msg.text}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="rh-btn go" disabled={pending || !data.ready} onClick={() => start(async () => { const r = await saveCupLineup(round, lineup); setMsg(r.ok ? { ok: true, text: `Saved for round ${round}.` } : { ok: false, text: r.error ?? 'Couldn’t save.' }); })}>Save lineup</button>
        <button className="rh-btn alt" onClick={() => { setLineup(autoFill(data.squad)); setMsg(null); }}>Auto-fill best 16</button>
        <button className="rh-btn alt" onClick={() => { setLineup({}); setMsg(null); }}>Clear</button>
        <span className={count >= ON_FIELD ? 'rh-up' : 'rh-dim'} style={{ fontSize: 13 }}>{count}/{ON_FIELD} on field · {(lineup.EMG ?? []).length}/4 emergencies</span>
      </div>
      {!data.ready && <span className="rh-down" style={{ fontSize: 13 }}>Saving switches on once supabase/migrations/0019_cup.sql has been run.</span>}
    </section>
  );
}

export function CupPage({ data, isCommish }: { data: CupData; isCommish: boolean }) {
  const name = (id: number | null) => (id == null ? 'TBC' : data.teams.find((t) => t.id === id)?.name ?? `Club ${id}`);
  const res = new Map(data.results.map((r) => [r.match_id, r]));
  const game = (m: CupMatch) => {
    const r = res.get(m.id);
    return (
      <div key={m.id} className={`cup-game ${m.home === data.myTeamId || m.away === data.myTeamId ? 'me' : ''}`}>
        <span className="rh-ellip">{name(m.home)}</span>
        <b className="rh-mono">{r ? `${r.home_score} – ${r.away_score}` : 'v'}</b>
        <span className="rh-ellip r">{name(m.away)}</span>
      </div>
    );
  };
  return (
    <Shell title={`${CUP_NAME} ${CUP_SEASON}`} sub={<>A cup run alongside the regular season. Group games every fortnight from round {GROUP_ROUNDS[0]}, semi-finals round {SEMI_ROUND}, final round {FINAL_ROUND}, the week before the grand final.</>}>
      <div className="cup-page">
        <div className="cup-col">
          <section className="rh-card">
            <span className="rh-k">How it works</span>
            <ul className="cup-rules">
              <li>Two conferences of five, seeded off the 2026 ladder (1st, 4th, 5th, 8th and 9th in A; 2nd, 3rd, 6th, 7th and 10th in B).</li>
              <li>Each club plays the other four in its conference once. There are five group rounds, so every club sits one out.</li>
              <li>4 points for a win, 2 for a draw. Percentage breaks ties.</li>
              <li>Top two in each conference cross over in the semis: A1 v B2, B1 v A2. Winners meet in the final.</li>
              <li>Same weekend’s AFL Fantasy scores, separate cup lineup: 4 DEF, 6 MID, 1 RUC, 4 FWD + 1 utility, 4 emergencies, no captains.</li>
            </ul>
          </section>
          {data.confs.map((c, i) => (
            <section key={i} className="rh-card"><span className="rh-k">{CONF_NAMES[i]}</span><Table rows={standings(c, data.matches, data.results)} name={(id) => name(id)} myTeamId={data.myTeamId} /></section>
          ))}
          <section className="rh-card">
            <span className="rh-k">Knockouts</span>
            {data.matches.filter((m) => m.stage !== 'group').map((m) => (
              <div key={m.id} className="cup-ko">
                <span className="rh-dim" style={{ fontSize: 12 }}>{m.stage === 'semi' ? 'Semi-final' : 'Final'} · round {m.round} · {m.label}</span>
                {game(m)}
              </div>
            ))}
          </section>
        </div>
        <div className="cup-col">
          <LineupEditor data={data} />
          <section className="rh-card">
            <span className="rh-k">Group fixture</span>
            {GROUP_ROUNDS.map((r, i) => (
              <div key={r} className="cup-round">
                <span className="cup-round-h">Group round {i + 1} · AFL round {r} · week of {roundWeek(r)}</span>
                {data.matches.filter((m) => m.round === r && m.stage === 'group').map(game)}
                <span className="rh-dim" style={{ fontSize: 12 }}>Bye: {(data.byes[r] ?? []).map((t) => name(t)).join(', ')}</span>
              </div>
            ))}
            {isCommish && <span className="rh-dim" style={{ fontSize: 12 }}>Results will fill in from the cup lineups once the 2027 scores are flowing.</span>}
          </section>
        </div>
      </div>
    </Shell>
  );
}
