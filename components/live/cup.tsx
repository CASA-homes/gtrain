'use client';
import { CupPrizes } from '@/components/live/cup-prizes';
import type { CupPrizeSettings } from '@/app/(app)/live/cup-actions';
// G-Train Knockout Cup: the home-page panel and the full cup page (tables, fixture, knockout bracket, cup lineup).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CONF_NAMES, CUP_NAME, CUP_SEASON, CUP_SLOTS, CUP_SLOT_NAME, CUP_SLOT_ORDER, DRAW_AT, FINAL_ROUND, GROUP_ROUNDS, ON_FIELD, QF_ROUND, SAFE, SEMI_ROUND, STAGE_NAME, WILDCARD_ROUND, fitsSlot, roundWeek, standings, type CupLineup, type CupMatch, type CupResult, type CupSlot, type StandRow } from '@/lib/cup';
import { jumper } from '@/lib/jumpers';
import { Shell } from './kit';

export interface CupSquadPlayer { id: number; name: string; pos: string[]; club: string | null; proj: number; a26: number | null; keeper: boolean }
export interface CupData {
  ready: boolean; confs: [number[], number[]]; matches: CupMatch[]; byes: Record<number, number[]>; results: CupResult[];
  teams: { id: number; name: string; short: string }[]; myTeamId: number; lineups: Record<number, CupLineup>; squad: CupSquadPlayer[];
  /** player id → the club he's cup-tied to (played a cup game for them this season) */
  ties: Record<number, number>;
  /** your next cup game, line by line */
  h2h: CupH2H | null;
  people: Record<number, CupPerson>;
}
export interface CupPerson { name: string; pos: string[]; proj: number; club: string | null }
export type LineSource = 'saved' | 'last' | 'assumed';
export interface CupH2H { matchId: string; round: number; stage: CupMatch['stage']; mine: { lineup: CupLineup; source: LineSource }; theirs: { teamId: number; lineup: CupLineup; source: LineSource } | null }
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
          <tr key={r.team} className={`${i < SAFE ? 'safe' : 'elim'} ${r.team === myTeamId ? 'me' : ''}`}>
            <td>{i + 1}</td><td className="l"><span className="rh-ellip">{name(r.team)}</span></td><td>{r.p}</td><td>{r.w}</td>{!compact && <><td>{r.l}</td><td>{r.d}</td></>}<td>{r.p ? r.pct.toFixed(1) : '–'}</td><td><b>{r.pts}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
const Zones = () => <div className="cup-zones"><span><i className="safe" />Top {SAFE}: quarter-finals</span><span><i className="elim" />4th v 5th: wildcard</span></div>;

/* ---------------- rules pop-up ---------------- */
export function CupRules({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const cal: [string, string][] = [...GROUP_ROUNDS.map((r) => [`R${r}`, 'Group'] as [string, string]), [`R${WILDCARD_ROUND}`, 'Wildcard'], [`R${QF_ROUND}`, 'Quarters'], [`R${SEMI_ROUND}`, 'Semis'], [`R${FINAL_ROUND}`, 'Final']];
  return (
    <div className="rh-sheet-back" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-sheet cup-rules-sheet" role="dialog" aria-modal="true" aria-label="Knockout Cup rules">
        <div className="mx-sh-head">
          <Trophy size={30} />
          <div style={{ flex: 1, minWidth: 0 }}><span className="rh-k">{CUP_SEASON}</span><h3 className="mx-sh-name">Knockout Cup rules</h3></div>
          <button className="rh-btn alt" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mx-sh-sec"><span className="rh-k">Format</span>
          <ul className="cup-rules">
            <li>Two groups of five, seeded off the 2026 ladder (1st, 4th, 5th, 8th and 9th in Group A; 2nd, 3rd, 6th, 7th and 10th in Group B).</li>
            <li>Four group games, AFL rounds {GROUP_ROUNDS[0]} to {GROUP_ROUNDS[GROUP_ROUNDS.length - 1]}. Five clubs only make two games a round, so each round the spare club in Group A plays the spare club in Group B. That game counts on both tables.</li>
            <li>4 points a win, 2 a draw. Percentage breaks ties.</li>
            <li><b className="cup-safe-t">Top {SAFE} in each group are safe</b> and go straight to the quarter-finals.</li>
            <li><b className="cup-elim-t">4th plays 5th</b> in a wildcard game in round {WILDCARD_ROUND}. The loser is out.</li>
            <li>The eight left are drawn at random into quarter-finals (round {QF_ROUND}), then semi-finals (round {SEMI_ROUND}) and the final (round {FINAL_ROUND}). The cup stays clear of the round 11 to 15 byes.</li>
            <li>A drawn knockout goes to the club that finished higher in the group stage.</li>
          </ul>
        </div>
        <div className="mx-sh-sec"><span className="rh-k">When it&apos;s played</span>
          <div className="cup-cal">{cal.map(([r, s]) => <span key={r}><b className="rh-mono">{r}</b><em>{s}</em></span>)}</div>
        </div>
        <div className="mx-sh-sec"><span className="rh-k">Your cup team</span>
          <ul className="cup-rules">
            <li>A separate lineup from your G-Train team. Same AFL round, same fantasy scores.</li>
            <li>4 DEF, 5 MID, 1 RUC, 4 FWD and a utility, plus 4 emergencies.</li>
            <li>No captain or vice-captain. Every player scores once.</li>
            <li>A player locks at his own game&apos;s first bounce.</li>
          </ul>
        </div>
        <div className="cup-tied-box">
          <span className="cup-new">NEW</span><b>Cup-tied</b>
          <ul className="cup-rules">
            <li>Once a player has played a cup game for one club, he&apos;s tied to that club for the rest of that season&apos;s cup.</li>
            <li>If he&apos;s traded, his new club can still pick him in the G-Train, but not in the cup.</li>
            <li>Played means he was on the field in a cup game that has been played. A cup-tied player can&apos;t be named as an emergency either. Ties reset each season.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
export function RulesButton() {
  const [open, setOpen] = useState(false);
  return <><button className="rh-btn alt sm cup-rules-btn" onClick={() => setOpen(true)}>Rules</button>{open && <CupRules onClose={() => setOpen(false)} />}</>;
}

/* ---------------- home panel ---------------- */
export function CupPanel({ data, compact = false }: { data: CupData; compact?: boolean }) {
  const name = (id: number) => data.teams.find((t) => t.id === id)?.name ?? `Club ${id}`;
  const myConf = data.confs[0].includes(data.myTeamId) ? 0 : data.confs[1].includes(data.myTeamId) ? 1 : 0;
  const rows = standings(data.confs[myConf], data.matches, data.results);
  const played = new Set(data.results.map((r) => r.match_id));
  const mine = data.matches.filter((m) => m.home === data.myTeamId || m.away === data.myTeamId);
  const next = mine.find((m) => !played.has(m.id));
  const opp = next ? (next.home === data.myTeamId ? next.away : next.home) : null;
  const set = next ? filled(data.lineups[next.round]) : 0;
  return (
    <section className={`rh-card cup-panel ${compact ? 'cup-compact' : ''}`}>
      {compact ? (
        <div className="cup-head">
          <Trophy />
          <b className="cup-title" style={{ flex: 1 }}>{CUP_NAME}</b>
          <RulesButton />
          <Link href="/live/cup" className="rh-link" style={{ fontSize: 12 }}>Full cup →</Link>
        </div>
      ) : (<>
      <div className="cup-head">
        <Trophy />
        <div style={{ minWidth: 0, flex: 1 }}>
          <span className="rh-k">{CUP_SEASON} · separate from the regular season</span>
          <b className="cup-title">{CUP_NAME}</b>
        </div>
        <RulesButton />
        <Link href="/live/cup" className="rh-link" style={{ fontSize: 13 }}>Full cup</Link>
      </div>
      <div className="cup-format">
        <span>2 groups of 5</span><span>4 group games</span><span>Top {SAFE} safe · 4v5 wildcard</span><span>Quarters R{QF_ROUND}</span><span>Final R{FINAL_ROUND}</span>
      </div>
      </>)}
      <div className="cup-next">
        {next ? (
          <>
            <span className="rh-k">{compact ? `Next · Round ${next.round}` : <>Your next cup game · Round {next.round} · week of {roundWeek(next.round)}{next.stage !== 'group' ? ` · ${STAGE_NAME[next.stage]}` : ` · group game ${mine.filter((m) => m.stage === 'group').indexOf(next) + 1} of 4${next.cross ? ' (crossover)' : ''}`}</>}</span>
            <b>v {opp ? name(opp) : next.label ?? 'TBC'}</b>
            <span className={set >= ON_FIELD ? 'rh-up' : 'rh-down'} style={{ fontSize: 13 }}>{set >= ON_FIELD ? 'Cup lineup set' : set ? `Cup lineup ${set}/${ON_FIELD}` : 'Cup lineup not set yet'}</span>
          </>
        ) : <b>Your cup run is over for {CUP_SEASON}.</b>}
      </div>
      <div><span className="rh-k">{CONF_NAMES[myConf]}</span><Table rows={rows} name={name} myTeamId={data.myTeamId} compact />{!compact && <Zones />}</div>
      {!compact && <Link href="/live/cup#lineup" className="rh-btn go" style={{ alignSelf: 'flex-start' }}>Set cup lineup</Link>}
    </section>
  );
}

/* ---------------- full page ---------------- */
const SRC: Record<LineSource, string> = { saved: 'Saved team', last: 'Last team fielded', assumed: 'Best guess' };

function GroupCard({ data, ci, name }: { data: CupData; ci: 0 | 1; name: (id: number | null) => string }) {
  const [view, setView] = useState<'table' | 'fixtures'>('table');
  const res = new Map(data.results.map((r) => [r.match_id, r]));
  const conf = data.confs[ci];
  const games = data.matches.filter((m) => m.stage === 'group' && (m.conf === ci || (m.cross && (conf.includes(m.home!) || conf.includes(m.away!)))));
  return (
    <section className="rh-card cup-group">
      <div className="cup-group-h">
        <span className="rh-k">{CONF_NAMES[ci]}</span>
        <div className="cup-toggle" role="tablist" aria-label={`${CONF_NAMES[ci]} view`}>
          <button role="tab" aria-selected={view === 'table'} className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
          <button role="tab" aria-selected={view === 'fixtures'} className={view === 'fixtures' ? 'on' : ''} onClick={() => setView('fixtures')}>Fixtures</button>
        </div>
      </div>
      {view === 'table' ? <><Table rows={standings(conf, data.matches, data.results)} name={(id) => name(id)} myTeamId={data.myTeamId} /><Zones /></> : (
        <div className="cup-fx">
          {GROUP_ROUNDS.map((r, i) => (
            <div key={r} className="cup-round">
              <span className="cup-round-h">Game {i + 1} · AFL round {r} · week of {roundWeek(r)}</span>
              {games.filter((m) => m.round === r).map((m) => {
                const x = res.get(m.id);
                return (
                  <div key={m.id} className={`cup-game ${m.home === data.myTeamId || m.away === data.myTeamId ? 'me' : ''}`}>
                    <span className="rh-ellip">{name(m.home)}</span>
                    <b className="rh-mono">{x ? `${x.home_score} – ${x.away_score}` : 'v'}</b>
                    <span className="rh-ellip r">{name(m.away)}</span>
                    {m.cross && <em className="cup-cross">Crossover with Group {ci === 0 ? 'B' : 'A'}</em>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Bracket({ data, name }: { data: CupData; name: (id: number | null) => string }) {
  const res = new Map(data.results.map((r) => [r.match_id, r]));
  const m = (id: string) => data.matches.find((x) => x.id === id)!;
  const tables = data.confs.map((c) => standings(c, data.matches, data.results));
  const groupsDone = data.matches.filter((x) => x.stage === 'group').every((x) => res.has(x.id));
  const Tie = ({ id, a, b }: { id: string; a?: string; b?: string }) => {
    const g = m(id), r = res.get(id);
    const win = r && g.home != null && g.away != null ? (r.home_score >= r.away_score ? g.home : g.away) : null;
    const row = (t: number | null, ph: string | undefined, sc: number | undefined) => (
      <div className={`br-team ${t != null && t === win ? 'win' : ''} ${t === data.myTeamId ? 'me' : ''}`}>
        <span className="rh-ellip">{t != null ? name(t) : <span className="rh-dim">{ph ?? 'TBC'}</span>}</span>
        {sc != null && <b className="rh-mono">{sc}</b>}
      </div>
    );
    return <div className="br-tie">{row(g.home, a, r?.home_score)}{row(g.away, b, r?.away_score)}</div>;
  };
  const champ = (() => { const g = m('final'), r = res.get('final'); return r && g.home != null && g.away != null ? (r.home_score >= r.away_score ? g.home : g.away) : null; })();
  const safe = groupsDone ? tables.flatMap((t) => t.slice(0, SAFE).map((r) => r.team)) : [];
  return (
    <section className="rh-card">
      <div className="cup-group-h"><span className="rh-k">Path to the cup</span><span className="rh-dim" style={{ fontSize: 12 }}>Quarter-finals are drawn at random</span></div>
      <div className="br-wrap">
        <div className="br">
          <div className="br-col">
            <span className="br-h">Wildcard · R{WILDCARD_ROUND}</span>
            <Tie id="wc1" a="A4" b="A5" /><Tie id="wc2" a="B4" b="B5" />
            <div className="br-safe"><span className="br-h">Safe</span>
              {(safe.length ? safe : ['A1', 'A2', 'A3', 'B1', 'B2', 'B3']).map((t) => <span key={t} className={`br-chip ${t === data.myTeamId ? 'me' : ''}`}>{typeof t === 'number' ? name(t) : t}</span>)}
            </div>
          </div>
          <div className="br-col">
            <span className="br-h">Quarters · R{QF_ROUND}</span>
            {[1, 2, 3, 4].map((i) => <Tie key={i} id={`qf${i}`} a="Draw" b="Draw" />)}
          </div>
          <div className="br-col">
            <span className="br-h">Semis · R{SEMI_ROUND}</span>
            <Tie id="sf1" a="Winner QF1" b="Winner QF2" /><Tie id="sf2" a="Winner QF3" b="Winner QF4" />
          </div>
          <div className="br-col">
            <span className="br-h">Final · R{FINAL_ROUND}</span>
            <Tie id="final" a="Winner SF1" b="Winner SF2" />
          </div>
          <div className="br-col br-champ">
            <span className="br-h">Champion</span>
            <div className="br-cup"><Trophy size={34} /><b className="rh-ellip">{champ != null ? name(champ) : 'TBC'}</b></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function useNow() { const [now, setNow] = useState<number | null>(null); useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []); return now; }

function DrawPanel() {
  const now = useNow(), at = Date.parse(DRAW_AT);
  const left = now != null ? at - now : null;
  const days = left != null ? Math.max(0, Math.floor(left / 86400e3)) : null;
  const when = now != null ? new Date(at).toLocaleString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) : '';
  return (
    <section className="rh-card cup-draw">
      <div className="cup-draw-ic" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="30" height="30"><circle cx="11" cy="13" r="6" fill="#f2c94c" /><circle cx="21" cy="11" r="5" fill="#e5b93a" /><circle cx="17" cy="21" r="6" fill="#f6d97a" /><text x="17" y="24" textAnchor="middle" fontSize="7" fontWeight="800" fill="#7a5a08">QF</text></svg>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <span className="rh-k">Next cup draw · quarter-finals</span>
        <b className="cup-draw-when" suppressHydrationWarning>{when || ' '}</b>
        <span className="rh-dim" style={{ fontSize: 12.5 }}>Sunday night of round {QF_ROUND - 1}, once that round has locked. The six safe clubs and the two wildcard winners go into the hat.</span>
      </div>
      {left != null && <div className="cup-draw-cd">{left > 0 ? <><b className="rh-mono">{days}</b><span>days</span></> : <span>Drawn</span>}</div>}
    </section>
  );
}

function H2H({ data, name }: { data: CupData; name: (id: number | null) => string }) {
  const h = data.h2h;
  if (!h) return <section className="rh-card"><span className="rh-k">Your next cup game</span><b>Your cup run is over for {CUP_SEASON}.</b></section>;
  const ppl = (id: number) => data.people[id];
  const tot = (l: CupLineup | undefined) => (l ? CUP_SLOT_ORDER.filter((s) => s !== 'EMG').reduce((t, s) => t + (l[s] ?? []).reduce((a, id) => a + (ppl(id)?.proj ?? 0), 0), 0) : 0);
  const a = tot(h.mine.lineup), b = tot(h.theirs?.lineup);
  const opp = h.theirs ? name(h.theirs.teamId) : 'TBC';
  const cell = (id: number | undefined, side: 'l' | 'r') => {
    const p = id != null ? ppl(id) : undefined;
    if (!p) return <span className={`h2h-p ${side} empty`}><span className="rh-dim">–</span></span>;
    return (
      <span className={`h2h-p ${side}`}>
        <i className="h2h-disc" style={{ background: jumper(p.club) }} />
        <span className="rh-ellip">{p.name.replace(/^(\S)\S*\s/, '$1. ')}</span>
        <b className="rh-mono">{p.proj}</b>
      </span>
    );
  };
  return (
    <section className="rh-card cup-h2h">
      <div className="cup-group-h"><span className="rh-k">Round {h.round} · {STAGE_NAME[h.stage]} · projected</span><Link href="/live" className="rh-link" style={{ fontSize: 12 }}>Set your cup team in Squad Selector →</Link></div>
      <div className="h2h-top">
        <div><span className="rh-dim">{SRC[h.mine.source]}</span><b className="rh-ellip">{name(data.myTeamId)}</b><span className="h2h-big rh-mono">{a}</span></div>
        <span className="h2h-vs">v</span>
        <div className="r"><span className="rh-dim">{h.theirs ? SRC[h.theirs.source] : 'Opponent'}</span><b className="rh-ellip">{opp}</b><span className="h2h-big rh-mono">{b}</span></div>
      </div>
      <span className="md-winbar"><i style={{ width: `${a + b ? (a / (a + b)) * 100 : 50}%` }} /></span>
      <div className="h2h-lines">
        {CUP_SLOT_ORDER.map((s) => {
          const n = CUP_SLOTS[s];
          const L = (h.mine.lineup[s] ?? []).slice(0, n), R = (h.theirs?.lineup[s] ?? []).slice(0, n);
          const lt = L.reduce((t, id) => t + (ppl(id)?.proj ?? 0), 0), rt = R.reduce((t, id) => t + (ppl(id)?.proj ?? 0), 0);
          return (
            <div key={s} className={`h2h-line ${s === 'EMG' ? 'emg' : ''}`}>
              <div className="h2h-lh"><span className={`rh-mono ${lt >= rt ? 'up' : ''}`}>{lt}</span><b>{CUP_SLOT_NAME[s]}</b><span className={`rh-mono ${rt > lt ? 'up' : ''}`}>{rt}</span></div>
              {Array.from({ length: n }, (_, i) => <div key={i} className="h2h-row">{cell(L[i], 'l')}{cell(R[i], 'r')}</div>)}
            </div>
          );
        })}
      </div>
      <span className="rh-dim" style={{ fontSize: 12 }}>Lineups can only be changed in Squad Selector. Emergencies aren&apos;t counted in the totals. If they haven&apos;t saved a team for this round, you see their last cup team, or their best 15 by projection.</span>
    </section>
  );
}

function News({ data, name }: { data: CupData; name: (id: number | null) => string }) {
  const res = new Map(data.results.map((r) => [r.match_id, r]));
  const items: { tag: string; text: string }[] = [];
  const played = data.matches.filter((m) => res.has(m.id)).sort((x, y) => y.round - x.round);
  for (const m of played.slice(0, 4)) {
    const r = res.get(m.id)!, hw = r.home_score >= r.away_score;
    items.push({ tag: `R${m.round}`, text: `${name(hw ? m.home : m.away)} beat ${name(hw ? m.away : m.home)} ${Math.max(r.home_score, r.away_score)} to ${Math.min(r.home_score, r.away_score)}${m.stage !== 'group' ? ` in the ${STAGE_NAME[m.stage].toLowerCase()}` : ''}.` });
  }
  const tied = Object.entries(data.ties).filter(([id, t]) => t !== data.myTeamId && data.squad.some((p) => p.id === Number(id)));
  for (const [id, t] of tied) items.push({ tag: 'Cup-tied', text: `${data.squad.find((p) => p.id === Number(id))?.name} played for ${name(t)} and can't play in your cup team this season.` });
  const next = data.matches.find((m) => !res.has(m.id));
  if (next) items.push({ tag: 'Next', text: next.stage === 'group' ? `Group game ${next.groupRound} is AFL round ${next.round}, week of ${roundWeek(next.round)}.` : `${STAGE_NAME[next.stage]}s are AFL round ${next.round}, week of ${roundWeek(next.round)}.` });
  if (!played.length) {
    items.push({ tag: 'Draw', text: `Groups set off the 2026 ladder. Group A: ${data.confs[0].map((t) => name(t)).join(', ')}. Group B: ${data.confs[1].map((t) => name(t)).join(', ')}.` });
    items.push({ tag: 'New', text: 'Cup-tied rule: once a player plays a cup game for one club, he can only play in the cup for that club this season.' });
    items.push({ tag: 'Format', text: `Top ${SAFE} in each group go straight to the quarter-finals; 4th and 5th play a wildcard in round ${WILDCARD_ROUND}.` });
  }
  return (
    <section className="rh-card">
      <span className="rh-k">Cup news</span>
      <ul className="cup-news">{items.map((x, i) => <li key={i}><em>{x.tag}</em><span>{x.text}</span></li>)}</ul>
    </section>
  );
}

export function CupPage({ data, isCommish, prizes }: { data: CupData; isCommish: boolean; prizes?: CupPrizeSettings | null }) {
  const fin = data.matches.find((m) => m.id === 'final');
  const finRes = fin ? data.results.find((r) => r.match_id === 'final') : undefined;
  const finalResult = fin && finRes && fin.home != null && fin.away != null
    ? (finRes.home_score >= finRes.away_score ? { winner: fin.home, runner: fin.away } : { winner: fin.away, runner: fin.home }) : null;
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
    <Shell title={`${CUP_NAME} ${CUP_SEASON}`} sub={<>Groups rounds {GROUP_ROUNDS[0]} to {GROUP_ROUNDS[GROUP_ROUNDS.length - 1]} · wildcards round {WILDCARD_ROUND} · quarter-finals round {QF_ROUND} · semis round {SEMI_ROUND} · final round {FINAL_ROUND}</>} right={<RulesButton />}>
      <div className="cup-page">
        <div className="cup-col">
          {prizes !== undefined && <CupPrizes settings={prizes} isCommish={isCommish} teams={data.teams} final={finalResult} />}
          <GroupCard data={data} ci={0} name={name} />
          <GroupCard data={data} ci={1} name={name} />
          <Bracket data={data} name={name} />
          <section className="rh-card">
            <span className="rh-k">Knockouts</span>
            <div className="cup-kos">
            {data.matches.filter((m) => m.stage !== 'group').map((m) => (
              <div key={m.id} className="cup-ko">
                <span className="rh-dim" style={{ fontSize: 12 }}>{STAGE_NAME[m.stage]} {m.stage === 'qf' || m.stage === 'semi' ? m.id.slice(2) : m.stage === 'wildcard' ? (m.conf === 0 ? 'A' : 'B') : ''} · round {m.round}{m.label && m.stage !== 'qf' ? ` · ${m.label}` : ''}</span>
                {game(m)}
              </div>
            ))}
            </div>
          </section>
        </div>
        <div className="cup-col">
          <DrawPanel />
          <H2H data={data} name={name} />
          <News data={data} name={name} />
        </div>
      </div>
    </Shell>
  );
}

/** Both group tables, for the League page. */
export function CupTables({ data }: { data: CupData }) {
  const name = (id: number) => data.teams.find((t) => t.id === id)?.name ?? `Club ${id}`;
  return (
    <div className="rh cup-league">
      {data.confs.map((c, i) => (
        <div key={i} className="cup-league-g">
          <span className="rh-k">{CONF_NAMES[i]}</span>
          <Table rows={standings(c, data.matches, data.results)} name={name} myTeamId={data.myTeamId} compact />
        </div>
      ))}
      <Zones />
    </div>
  );
}
