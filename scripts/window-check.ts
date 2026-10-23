// Offline check of the premiership window for every club, from the 2026 data files.
import fs from 'node:fs';
import { buildRatings, age } from '@/lib/ratings';
import { simulate2027, projected2027, futureScore, prospectScore, FUTURE_PIN } from '@/lib/projection';
import { strengthByYear, windowFor, projectAhead, coreAge } from '@/lib/window';
const POS: Record<string, string> = { D: 'DEF', M: 'MID', F: 'FWD', R: 'RUC' };
const dfs = JSON.parse(fs.readFileSync('data/dfs-2026.json', 'utf8'));
const rows = Array.isArray(dfs) ? dfs : Object.values(dfs);
const sq = new Map<string, string[]>();
let team = '';
for (const l of fs.readFileSync('data/squads-2026.txt', 'utf8').split('\n')) {
  if (l.startsWith('## ')) { team = l.slice(3).split(' | ')[0]; continue; }
  if (!l || l.startsWith('#')) continue;
  sq.set(team + '|' + l.split('|')[0], l.split('|'));
}
const league = JSON.parse(fs.readFileSync('data/league.json', 'utf8'));
const names: string[] = league.teams.map((t: any) => t.name);
const tid = (n: string) => names.indexOf(n) + 1;
const players: any[] = rows.map((r: any, i: number) => {
  const s = sq.get(r.team + '|' + r.name) ?? [];
  const pos = (s[1] ?? 'MID').split('/').map((x: string) => (x.length === 1 ? POS[x] : x));
  return { id: i + 1, name: r.name, positions: pos, afl_club: null, team_id: tid(r.team), is_keeper: false, is_rookie_keeper: false,
    games: Number(s[3]) || null, average: Number(s[4]) || null, last5: (s.slice(5, 10)).map((x: string) => (x === '-' ? null : Number(x))), status: null,
    birth_date: r.dob, draft_pick: null, draft_year: r.draft_year, full_name: r.full, dfs_id: r.dfs_id, height_cm: r.height, debut_year: r.debut,
    career_games: r.career_games, box: r.box, hist: r.hist, games_log: r.games26, photo_path: null, list_status: null, lineup: null };
});
const ratings = buildRatings(players);
const picks = JSON.parse(fs.readFileSync('data/picks-2027-2028.json', 'utf8')).picks.filter((p: any) => p.year === 2027).map((p: any) => ({ overall: p.overall, owner_team_id: tid(p.owner) }));
const ids = names.map((_, i) => i + 1);
const sim = simulate2027(players, ids, picks);
const strength = strengthByYear(ids, players, ratings, sim);
const fut = ids.map((id) => {
  const mine = players.filter((p) => p.team_id === id && (age(p.birth_date) ?? 99) <= 24).map((p) => futureScore(p, ratings.get(p.id)?.potential ?? null, ratings.get(p.id)?.lineBonus ?? 0, ratings.get(p.id)?.lineEdge ?? 0));
  const pr = picks.filter((pk: any) => pk.owner_team_id === id).map((pk: any) => prospectScore(pk.overall)).sort((a: number, b: number) => b - a).slice(0, 2);
  return { id, name: names[id - 1], score: [...mine, ...pr].sort((a, b) => b - a).slice(0, 6).reduce((s, x) => s + x, 0) };
}).sort((a, b) => b.score - a.score);
for (const [t, spot] of Object.entries(FUTURE_PIN)) { const i = fut.findIndex((f) => f.name === t); if (i >= 0) fut.splice(spot - 1, 0, ...fut.splice(i, 1)); }
const futRank = (id: number) => fut.findIndex((f) => f.id === id) + 1;
const lad: Record<string, number> = Object.fromEntries(league.ladder_2026_final.map((r: any) => [r.team, r.rank]));
const prem = (n: string) => league.honour_roll.filter((h: any) => h.premier === n).map((h: any) => h.year);
for (const n of names) {
  const id = tid(n);
  const core = players.filter((p) => p.team_id === id).sort((a, b) => projected2027(b) - projected2027(a)).slice(0, 10);
  const ca = core.reduce((s, p) => s + (age(p.birth_date) ?? 26), 0) / core.length;
  const w = windowFor({ teamId: id, teamName: n, teamIds: ids, premierYears: prem(n), rank2026: lad[n], rank2027: sim.get(id)!.rank, strength, coreAge: coreAge(id, players), futureRank: futRank(id) });
  console.log(n.padEnd(22), 'core', ca.toFixed(1), 'fut', futRank(id), '|', w.map((p) => `${String(p.year).slice(2)}:${p.rank}${p.phase.split(' ')[0].slice(0, 5)}`).join(' '));
}
if (process.argv[2] === 'raw') {

  for (const n of names) {
    const id = tid(n);
    const vals = [1, 2, 3, 4].map((k) => players.filter((p) => p.team_id === id).map((p) => projectAhead(p, ratings.get(p.id), k)).sort((a, b) => b - a).slice(0, 18).reduce((s, x) => s + x, 0));
    console.log(n.padEnd(22), 'sim27', sim.get(id)!.rank, 'best18 by year', vals.map((v) => Math.round(v)).join(' '));
  }
  const rd = players.filter((p) => p.team_id === tid('Ram Dawgs')).sort((a, b) => projected2027(b) - projected2027(a)).slice(0, 14);
  for (const p of rd) console.log(' RD', p.name.padEnd(14), age(p.birth_date), p.average, 'pot', ratings.get(p.id)!.potential, [1, 2, 3, 4].map((k) => Math.round(projectAhead(p, ratings.get(p.id), k))).join(' '));
  const bb = players.filter((p) => p.team_id === tid('Bito’s Boys')).sort((a, b) => projected2027(b) - projected2027(a)).slice(0, 14);
  for (const p of bb) console.log(' BB', p.name.padEnd(14), age(p.birth_date), p.average, 'pot', ratings.get(p.id)!.potential, [1, 2, 3, 4].map((k) => Math.round(projectAhead(p, ratings.get(p.id), k))).join(' '));
}
if (process.argv[2] === 'sim') {
  for (const n of names) { const id = tid(n); console.log(n.padEnd(22), 'sim', sim.get(id)!.rank, Math.round(sim.get(id)!.score), 'str27', Math.round(strength.get(2027)!.get(id)!), 'str30', Math.round(strength.get(2030)!.get(id)!), 'keep', sim.get(id)!.keepers.length, 'draft', sim.get(id)!.drafted.length); }
  for (const t of ['Ram Dawgs', 'Bito’s Boys']) { const l = sim.get(tid(t))!; console.log(t, 'drafted', l.drafted.map((d) => d.pick + ':' + players.find((p) => p.id === d.playerId)?.name + ' ' + Math.round(projected2027(players.find((p) => p.id === d.playerId)))).join(', ')); }
}
