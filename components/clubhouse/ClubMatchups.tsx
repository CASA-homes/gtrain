// Clubhouse home: "Matchups". Three boxes: this club's next game (projected), its next Knockout Cup game, and its
// last three results. Before the 2027 fixture is loaded, the next game is the Matchday test draw for round 1; the last
// results are its final games of 2026.
import Link from 'next/link';
import type { League } from '@/lib/data';
import { buildMensRound } from '@/lib/mens-round';
import { conferences, cupFixture, resolveKnockouts, roundWeek, CUP_NAME, CUP_SEASON, STAGE_NAME, type CupResult } from '@/lib/cup';
import { createClient } from '@/lib/supabase/server';
import RESULTS from '@/lib/results-2026.json';
import './matchups.css';

const norm = (s: string) => s.toLowerCase().replace(/[’'`]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();
const ROUND_NAME: Record<string, string> = { F1: 'F1', F2: 'Prelim', F3: 'GF' };
const n = (x: number) => Math.round(x).toLocaleString('en-AU');

export async function ClubMatchups({ league, teamId, legacy }: { league: League; teamId: number; legacy: boolean }) {
  const team = (id: number | null) => league.teams.find((t) => t.id === id);
  const club = team(teamId)?.name ?? 'Club';

  // Next game: the round's draw, projected from each club's best 22.
  const round = buildMensRound(league);
  const proj = new Map(round.teams.map((t) => [t.id, t.players.filter((p) => p.line !== 'BENCH').reduce((s, p) => s + p.proj * (p.cap === 'C' ? 2 : 1), 0)]));
  const mine = round.matchups.find((m) => m.includes(teamId));
  const opp = mine ? (mine[0] === teamId ? mine[1] : mine[0]) : null;
  const r1 = new Date(round.start).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Perth' });

  // Next cup game: the same fixture the cup page draws, from last season's ladder.
  const ladder = league.ladder.filter((l) => l.season === 2026).sort((a, b) => a.rank - b.rank).map((l) => l.team_id);
  const order = [...ladder, ...league.teams.map((t) => t.id).filter((id) => !ladder.includes(id))].slice(0, 10);
  const confs = conferences(order);
  const { data: rq } = await (await createClient()).from('cup_results').select('match_id, home_score, away_score').eq('season', CUP_SEASON);
  const results = (rq ?? []) as CupResult[];
  const done = new Set(results.map((r) => r.match_id));
  const cupNext = order.includes(teamId) ? resolveKnockouts(cupFixture(confs).matches, confs, results).find((m) => (m.home === teamId || m.away === teamId) && !done.has(m.id)) : null;
  const cupOpp = cupNext ? (cupNext.home === teamId ? cupNext.away : cupNext.home) : null;

  // Last three results (G-Train's own 2026 results).
  const res = legacy ? (RESULTS as unknown as { teams: Record<string, [string, string, string, number, number][]> }).teams : {};
  const rows = Object.entries(res).find(([t]) => norm(t) === norm(club))?.[1] ?? [];
  const last3 = rows.slice(-3).reverse().map((r) => ({ r: ROUND_NAME[r[0]] ?? `R${r[0]}`, opp: league.teams.find((t) => norm(t.name) === norm(r[1])) ?? null, oppName: r[1], w: r[2] === 'W', f: r[3], a: r[4] }));

  return (
    <section className="card cm" aria-labelledby="cm-h">
      <div className="row-between">
        <h2 id="cm-h" className="eyebrow" style={{ margin: 0 }}>Matchups</h2>
        <Link href="/live/matchups" className="ch-news-more">All matchups →</Link>
      </div>
      <div className="cm-boxes">
        <Link href="/live" className="cm-box">
          <span className="cm-tag">Round {round.round} · {r1}</span>
          {opp != null ? (
            <>
              <span className="cm-row"><b>{club}</b><em>{n(proj.get(teamId) ?? 0)}</em></span>
              <span className="cm-row"><b>{team(opp)?.name}</b><em>{n(proj.get(opp) ?? 0)}</em></span>
              <span className="cm-foot">Projected</span>
            </>
          ) : <span className="cm-foot">No game this round</span>}
        </Link>

        <Link href="/live/cup" className="cm-box">
          <span className="cm-tag">{CUP_NAME}{cupNext ? ` · ${roundWeek(cupNext.round)}` : ''}</span>
          {cupNext ? (
            <>
              <span className="cm-row"><b>{cupOpp != null ? `v ${team(cupOpp)?.name ?? 'TBC'}` : cupNext.label ?? 'Opponent TBC'}</b></span>
              <span className="cm-foot">{STAGE_NAME[cupNext.stage]}{cupNext.groupRound ? ` ${cupNext.groupRound} of 4` : ''} · Round {cupNext.round}</span>
            </>
          ) : <span className="cm-foot">{order.includes(teamId) ? 'Out of the cup' : 'Not in the cup'}</span>}
        </Link>

        <div className="cm-box cm-res">
          <span className="cm-tag">Last results</span>
          {last3.length ? last3.map((g, i) => (
            <span key={i} className="cm-rrow">
              <b className={`cm-wl ${g.w ? 'w' : 'l'}`} aria-label={g.w ? 'Won' : 'Lost'}>{g.w ? 'W' : 'L'}</b>
              <span className="cm-sc">{n(g.f)}–{n(g.a)}</span>
              <span className="cm-op">v {g.opp?.short_code ?? g.oppName}</span>
              <span className="cm-rd">{g.r}</span>
            </span>
          )) : <span className="cm-foot">No results yet</span>}
        </div>
      </div>
    </section>
  );
}
