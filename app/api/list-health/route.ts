import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { CURRENT_SEASON, getLeague, getMe } from '@/lib/data';
import { ASK_COOKIE, askCodeOk, askToken } from '@/lib/ask-access';
import { chat } from '@/lib/openai';
import { metricsFor } from '@/lib/player-metrics';
import { projected2027 } from '@/lib/projection';
import { noteFor } from '@/lib/notes';
import { coreAge, strengthByYear, windowFor } from '@/lib/window';
import { pickPoints } from '@/lib/picks';
import CRYSTAL from '@/lib/crystal-ball.json';
import { LINES } from '@/lib/ratings';

// Clubhouse "List health" report: one model call over a compact brief of the club's list, the league context,
// the club's picks and what's in the draft pool. Same passcode wall and cookie as the Players "Ask" assistant.
export const maxDuration = 45;
const cache = new Map<string, { at: number; report: unknown }>();   // per instance, 6 hours

const SYSTEM = `You are a sharp, honest list manager for a 10-team AFL Fantasy keeper league (G-Train). Rules: 18 on field (5 DEF, 7 MID, 1 RUC, 5 FWD),
keep 17 players plus one rookie (10 career games or fewer) each year, the rest go back into a redraft. Scoring is AFL Fantasy. Use ONLY the data given.
Write for the club's coach: casual, direct, Australian spelling, specific names and numbers, no waffle. Reply with JSON only:
{"grade": "A+".."F" list health grade, "headline": one punchy sentence, "window": one sentence on where the club sits (contend now / build),
"keepers": {"core": [names: no-brainer keeps], "keep": [solid keeps], "bubble": [names on the 17/18 line, each "Name: why"], "letGo": [names to release or sell, each "Name: why"]},
"rookie": "who should take the rookie keeper slot and why (or 'none eligible')",
"strengths": [2-4 short bullet strings], "holes": [2-4 short bullet strings, naming the line],
"draftPlan": [one string per pick the club owns in the next draft, in order: "Pick N: what to target (and 1-2 example names from the pool or prospects)"],
"tradeIdeas": [1-3 short strings: what to sell or buy, naming players or picks],
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
  const key = `${a.team.id}`;
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

  const kept = new Set([...lists.values()].flatMap((l) => l.keepers));
  const pool = league.players.filter((p) => !kept.has(p.id) && !p.list_status && p.team_id !== a.team.id)
    .concat(league.freeAgents.filter((p) => !p.list_status))
    .map((p) => ({ p, proj: projected2027(p) })).sort((x, y) => y.proj - x.proj).slice(0, 45)
    .map(({ p, proj }) => `${p.full_name ?? p.name} | ${p.positions.join('/')} | age ${p.birth_date ? new Date().getFullYear() - Number(p.birth_date.slice(0, 4)) : '?'} | 26avg ${p.average ?? '–'} | proj27 ${proj} | ${p.team_id ? `released by ${teamName(p.team_id)}` : 'free agent'}`);

  const prospects = (CRYSTAL as unknown as { prospects: { name: string; slot: number; chance: number; role: string; position: string }[] }).prospects
    .slice().sort((x, y) => x.slot - y.slot).slice(0, 25)
    .map((x) => `${x.name} | ${x.position} ${x.role} | projected AFL pick ${x.slot} | Crystal Ball 90+ chance ${x.chance}%`);

  const lines = LINES.map((l) => `${l} ${a.lineStrength[l].rank}/10`).join(', ');
  const brief = [
    `CLUB: ${a.team.name} (coach ${a.team.coach_name})`,
    `2026: finished ${lt?.rank ?? '?'} on the ladder; power rank ${a.rank}/10 on best 18 (${a.best18}); line ranks ${lines}`,
    `2027 projection after keepers + simulated redraft: #${a.projection.rank}/10. Future-build rank (24 and under): #${a.future.rank}/10.`,
    `Premiership window by year: ${win.filter((w) => w.year >= CURRENT_SEASON).map((w) => `${w.year} ${w.phase}${w.kind === 'proj' ? ` (~${Math.round(w.rank)})` : ''}`).join(', ')}`,
    `PICKS OWNED: ${picks.join('; ') || 'none'}`,
    `SQUAD (33):\n${squad.join('\n')}`,
    `DRAFT POOL — best released/free-agent players by 2027 projection:\n${pool.join('\n')}`,
    `DRAFT POOL — top AFL draft prospects (rookies; consensus order):\n${prospects.join('\n')}`,
  ].join('\n\n');

  try {
    const raw = await chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: brief }], true, 6000);
    const report = JSON.parse(raw);
    cache.set(key, { at: Date.now(), report });
    return done({ report });
  } catch (e) {
    return done({ error: (e as Error).message.includes('JSON') ? 'The report came back garbled. Try again.' : (e as Error).message }, 502);
  }
}
