// Clubhouse home: "Matchups". This club's game this week (with every other game in the round) and its last result.
// Before the 2027 fixture is loaded, the round is the Matchday test draw for round 1, projected from each club's
// best 22; the last result is the club's final game of 2026.
import Link from 'next/link';
import type { League } from '@/lib/data';
import { buildMensRound } from '@/lib/mens-round';
import RESULTS from '@/lib/results-2026.json';
import './matchups.css';

const norm = (s: string) => s.toLowerCase().replace(/[’'`]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();
const ROUND_NAME: Record<string, string> = { F1: 'Finals week 1', F2: 'Preliminary final', F3: 'Grand final' };
const n = (x: number) => Math.round(x).toLocaleString('en-AU');

export function ClubMatchups({ league, teamId, legacy }: { league: League; teamId: number; legacy: boolean }) {
  const round = buildMensRound(league);
  const proj = new Map(round.teams.map((t) => [t.id, t.players.filter((p) => p.line !== 'BENCH').reduce((s, p) => s + p.proj * (p.cap === 'C' ? 2 : 1), 0)]));
  const name = (id: number) => league.teams.find((t) => t.id === id)?.name ?? 'Club';
  const short = (id: number) => league.teams.find((t) => t.id === id)?.short_code ?? '?';
  const mine = round.matchups.find((m) => m.includes(teamId));
  const opp = mine ? (mine[0] === teamId ? mine[1] : mine[0]) : null;
  const others = round.matchups.filter((m) => m !== mine);
  const r1 = new Date(round.start).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Perth' });

  // Last result: the club's final game of 2026 (G-Train's own results).
  const club = name(teamId);
  const res = legacy ? (RESULTS as unknown as { teams: Record<string, [string, string, string, number, number][]> }).teams : {};
  const rows = Object.entries(res).find(([t]) => norm(t) === norm(club))?.[1] ?? [];
  const last = rows[rows.length - 1];
  const oppId = last ? league.teams.find((t) => norm(t.name) === norm(last[1]))?.id ?? null : null;

  return (
    <section className="card cm" aria-labelledby="cm-h">
      <div className="row-between">
        <h2 id="cm-h" className="eyebrow" style={{ margin: 0 }}>Matchups</h2>
        <Link href="/live/matchups" className="ch-news-more">All matchups →</Link>
      </div>

      {opp != null && (
        <Link href="/live" className="cm-next">
          <span className="cm-tag">Round {round.round} · {r1}</span>
          <span className="cm-vs">
            <b>{club}</b><em>{n(proj.get(teamId) ?? 0)}</em>
            <i>v</i>
            <em>{n(proj.get(opp) ?? 0)}</em><b>{name(opp)}</b>
          </span>
          <span className="cm-note">Projected scores · {proj.get(teamId)! >= proj.get(opp)! ? `${club.split(' ')[0]} by ${n(proj.get(teamId)! - proj.get(opp)!)}` : `${name(opp).split(' ')[0]} by ${n(proj.get(opp)! - proj.get(teamId)!)}`}</span>
        </Link>
      )}

      {others.length > 0 && (
        <ul className="cm-others" aria-label={`Other round ${round.round} games`}>
          {others.map(([a, b]) => (
            <li key={`${a}-${b}`}><span>{short(a)}</span><em>{n(proj.get(a) ?? 0)}</em><i>v</i><em>{n(proj.get(b) ?? 0)}</em><span>{short(b)}</span></li>
          ))}
        </ul>
      )}

      {last && (
        <div className={`cm-last ${last[2] === 'W' ? 'w' : 'l'}`}>
          <span className="cm-tag">Last result · {ROUND_NAME[last[0]] ?? `Round ${last[0]}`} 2026</span>
          <span className="cm-res"><b className="cm-wl">{last[2] === 'W' ? 'W' : 'L'}</b>{n(last[3])} – {n(last[4])} v {oppId ? name(oppId) : last[1]}</span>
        </div>
      )}
    </section>
  );
}
