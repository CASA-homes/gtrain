import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { CURRENT_SEASON, getLeague, getMe } from '@/lib/data';
import { ASK_COOKIE, askCodeOk, askToken } from '@/lib/ask-access';
import { chat } from '@/lib/openai';
import { metricsFor } from '@/lib/player-metrics';
import { projected2027 } from '@/lib/projection';
import { noteFor } from '@/lib/notes';
import { coreAge, strengthByYear, windowFor, type Phase } from '@/lib/window';
import { pickPoints } from '@/lib/picks';
import CRYSTAL from '@/lib/crystal-ball.json';
import { LINES } from '@/lib/ratings';

// Clubhouse "List assessment": one model call over a compact brief of the club's list, the league context,
// the club's picks and what's in the draft pool. It lays out three paths (win now, balanced, regenerate), each with a
// keeper call and a pick-by-pick target plan for the club's first five picks, and flags which paths suit the club.
// Same passcode wall and cookie as the Players "Ask" assistant.
export const maxDuration = 60;
const cache = new Map<string, { at: number; report: unknown }>();   // per instance, 6 hours
const CACHE_VER = 'v2';

export type PathKey = 'winNow' | 'balanced' | 'regenerate';
/** Which paths suit a club, best first, from its 2027 premiership-window phase. */
const FIT: Record<Phase, PathKey[]> = {
  'Prime window': ['winNow', 'balanced'],
  'Entering window': ['balanced', 'winNow'],
  'Closing window': ['balanced', 'regenerate'],
  'Mid table': ['balanced', 'regenerate'],
  'Rebuild': ['regenerate', 'balanced'],
};

const PATH_JSON = `{"summary": 2 sentences on what this path means for this club and what it gives up,
"keepers": {"keep": [names to keep on this path], "letGo": [names to release or sell on this path, each "Name: why"]},
"rookie": "who takes the rookie keeper slot on this path (or 'none eligible')",
"picks": [one object per pick, for the club's FIRST FIVE picks in the next draft only, in order:
  {"pick": "#N", "target": one of "Win-now asset" | "List-hole filler" | "Best available" | "Young upside" | "Best rookie",
   "line": "DEF" | "MID" | "RUC" | "FWD" | "Any", "examples": [1-3 names from the DRAFT POOL lists likely to still be there], "why": one short sentence}],
"trades": [1-2 short strings: what to buy or sell on this path, naming players or picks],
"risk": "one sentence: the main risk of this path"}`;

const SYSTEM = `You are a sharp, honest list manager for a 10-team AFL Fantasy keeper league (G-Train). Rules: 18 on field (5 DEF, 7 MID, 1 RUC, 5 FWD),
keep 17 players plus one rookie (10 career games or fewer) each year, the rest go back into a redraft. Scoring is AFL Fantasy. Use ONLY the data given.
Write for the club's coach: casual, direct, Australian spelling, specific names and numbers, no waffle.

Assess the list as three paths the club could take this off-season, and write a full report for EVERY path, even the ones that don't suit:
- winNow: maximise 2027–28 scoring. Keep proven scorers regardless of age, use picks on the best available proven scorers and to fill list holes, sell youth or future picks for points.
- balanced: stay competitive now while topping up the next core. Keep the prime-age core and the young players already scoring, mix picks between ready-made scorers for list holes and the best rookies/young upside.
- regenerate: build for 2029+. Move on from players past their peak, prioritise the best rookies and young upside with every early pick, buy future picks.
Pick targets: "Win-now asset" = best proven scorer left; "List-hole filler" = best established player at the club's weakest line; "Best available" = best player regardless of line or age;
"Young upside" = best young released player with potential; "Best rookie" = best AFL draft prospect. Match each pick's examples to where that pick falls (a late pick can't land the top prospect).
The brief says which paths suit the club (RECOMMENDED). Respect that order, and explain in "verdict" why those fit and why the other doesn't.

Reply with JSON only:
{"grade": "A+".."F" list grade, "headline": one punchy sentence, "window": one sentence on where the club sits,
"verdict": 2 sentences: which path(s) you recommend and why,
"strengths": [2-4 short bullet strings], "holes": [2-4 short bullet strings, naming the line],
"paths": {"winNow": ${PATH_JSON}, "balanced": ${PATH_JSON}, "regenerate": ${PATH_JSON}},
"futurePicks": "one sentence on whether to buy or sell future (2028) picks"}`;

export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'The assistant isn’t switched on yet.' }, { status: 503 });
  const { teamId, code, fresh } = (await req.json().catch(() => ({}))) as { teamId?: number; code?: string; fresh?: boolean };

  const jar = await cookies();
  let unlockNow = false;
  if (jar.get(ASK_COOKIE)?.value !== askToken(me.user_id)) {
    if (!code) return NextResponse.json({ needCode: true }, { status: 403 });
    if (!askCodeOk(code)) return NextResponse.json({ needCode: true, error: 'Wrong code.' }, { status: 403 });
    unlockNow = true;
  }
  const done = (body: unknown, status = 200) => {
    const res = NextResponse.json(body, { status });
    if (unlockNow) res.cookies.set(ASK_COOKIE, askToken(me.user_id), { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 365 });
    return res;
  };

  const league = await getLeague();
  const a = league.byTeam.get(Number(teamId));
  if (!a) return done({ error: 'Club not found.' }, 404);
  const key = `${CACHE_VER}:${a.team.id}`;
  const hit = cache.get(key);
  if (hit && !fresh && Date.now() - hit.at < 6 * 3600e3) return done({ report: hit.report, cached: true });

  // League context
  const teamIds = [...league.byTeam.keys()];
  const lists = new Map([...league.byTeam].map(([k, t]) => [k, t.projection]));
  const strength = strengthByYear(teamIds, league.players, league.ratings, lists);
  const lt = league.ladder.find((l) => l.season === CURRENT_SEASON && l.team_id === a.team.id);
  const win = windowFor({ teamId: a.team.id, teamName: a.team.name, teamIds, premierYears: a.premierships, rank2026: lt?.rank ?? null,
    rank2027: a.projection.rank, futureRank: a.future.rank, coreAge: coreAge(a.team.id, league.players), strength });
  const teamName = (id: number) => league.teams.find((t) => t.id === id)?.name ?? 'Free agent';

  const squad = a.players.map((p) => {
    const r = league.ratings.get(p.id);
    const m = metricsFor(p, a.team.name, r?.value ?? 0, r?.potential ?? null);
    const rookieOk = (p.career_games ?? 99) <= 10;
    const note = noteFor(p.name, p.afl_club);
    return `${m.full} | ${m.positions.join('/')} | ${m.club} | age ${m.age ?? '?'} | 26avg ${m.avg26 ?? '–'} (${m.games26}g) | 25avg ${m.avg25 ?? '–'} | L8 ${m.last8 ?? '–'} | proj27 ${projected2027(p)} | value ${m.value} | pot ${m.potential ?? '–'}★` +
      `${p.is_keeper ? ' | KEPT' : ''}${p.is_rookie_keeper ? ' | ROOKIE KEEPER' : ''}${rookieOk ? ' | rookie-eligible' : ''}${p.list_status ? ` | ${p.list_status}` : ''}${note?.delta ? ` | role note ${note.delta > 0 ? '+' : ''}${note.delta}` : ''}`;
  });

  const picks = league.picks.filter((p) => p.owner_team_id === a.team.id && p.year >= CURRENT_SEASON + 1)
    .sort((x, y) => x.year - y.year || (x.overall ?? x.round * 10) - (y.overall ?? y.round * 10))
    .map((p) => `${p.year} R${p.round}${p.overall ? ` #${p.overall}` : ''}${p.original_team_id !== a.team.id ? ` (via ${teamName(p.original_team_id)})` : ''}${p.overall ? ` = ${pickPoints(p.overall)} pts` : ''}`);

  const nextDraft = league.picks.filter((p) => p.owner_team_id === a.team.id && p.year === CURRENT_SEASON + 1)
    .sort((x, y) => (x.overall ?? x.round * 10) - (y.overall ?? y.round * 10)).slice(0, 5)
    .map((p) => (p.overall ? `#${p.overall}` : `R${p.round}`));
  const phase2027 = win.find((w) => w.year === CURRENT_SEASON + 1)?.phase ?? 'Mid table';
  const recommended = FIT[phase2027];
  const weakest = LINES.slice().sort((x, y) => a.lineStrength[y].rank - a.lineStrength[x].rank).slice(0, 2);

  const kept = new Set([...lists.values()].flatMap((l) => l.keepers));
  const pool = league.players.filter((p) => !kept.has(p.id) && !p.list_status && p.team_id !== a.team.id)
    .concat(league.freeAgents.filter((p) => !p.list_status))
    .map((p) => ({ p, proj: projected2027(p) })).sort((x, y) => y.proj - x.proj).slice(0, 60)
    .map(({ p, proj }) => `${p.full_name ?? p.name} | ${p.positions.join('/')} | age ${p.birth_date ? new Date().getFullYear() - Number(p.birth_date.slice(0, 4)) : '?'} | 26avg ${p.average ?? '–'} | proj27 ${proj} | ${p.team_id ? `released by ${teamName(p.team_id)}` : 'free agent'}`);

  const prospects = (CRYSTAL as unknown as { prospects: { name: string; slot: number; chance: number; role: string; position: string }[] }).prospects
    .slice().sort((x, y) => x.slot - y.slot).slice(0, 35)
    .map((x) => `${x.name} | ${x.position} ${x.role} | projected AFL pick ${x.slot} | Crystal Ball 90+ chance ${x.chance}%`);

  const lines = LINES.map((l) => `${l} ${a.lineStrength[l].rank}/10`).join(', ');
  const brief = [
    `CLUB: ${a.team.name} (coach ${a.team.coach_name})`,
    `2026: finished ${lt?.rank ?? '?'} on the ladder; power rank ${a.rank}/10 on best 18 (${a.best18}); line ranks ${lines}`,
    `2027 projection after keepers + simulated redraft: #${a.projection.rank}/10. Future-build rank (24 and under): #${a.future.rank}/10.`,
    `Premiership window by year: ${win.filter((w) => w.year >= CURRENT_SEASON).map((w) => `${w.year} ${w.phase}${w.kind === 'proj' ? ` (~${Math.round(w.rank)})` : ''}`).join(', ')}`,
    `PICKS OWNED: ${picks.join('; ') || 'none'}`,
    `FIRST FIVE PICKS IN THE ${CURRENT_SEASON + 1} DRAFT (plan these, in this order): ${nextDraft.join(', ') || 'none'}`,
    `WEAKEST LINES (league rank): ${weakest.map((l) => `${l} ${a.lineStrength[l].rank}/10`).join(', ')}`,
    `RECOMMENDED PATHS for a club in its ${phase2027} (best first): ${recommended.join(', ')}`,
    `SQUAD (33):\n${squad.join('\n')}`,
    `DRAFT POOL — best released/free-agent players by 2027 projection:\n${pool.join('\n')}`,
    `DRAFT POOL — top AFL draft prospects (rookies; consensus order):\n${prospects.join('\n')}`,
  ].join('\n\n');

  try {
    const raw = await chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: brief }], true, 12000);
    const report = { ...JSON.parse(raw), recommended, phase: phase2027 };
    cache.set(key, { at: Date.now(), report });
    return done({ report });
  } catch (e) {
    return done({ error: (e as Error).message.includes('JSON') ? 'The report came back garbled. Try again.' : (e as Error).message }, 502);
  }
}
