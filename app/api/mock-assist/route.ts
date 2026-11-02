import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { CURRENT_SEASON, getLeague, getMe } from '@/lib/data';
import { ASK_COOKIE, askCodeOk, askToken } from '@/lib/ask-access';
import { chat } from '@/lib/openai';
import { projected2027 } from '@/lib/projection';
import { age, LINES, LINE_SLOTS } from '@/lib/ratings';
import { coreAge, strengthByYear, windowFor } from '@/lib/window';

// Mock draft assistant: one model call with the drafting club's real list (keepers, ages, 2027 projections, line
// depth, premiership window), the board so far, its upcoming picks and the best players still available.
// Same passcode wall as the other assistants.
export const maxDuration = 45;

export interface AssistPlayer { key: string; name: string; kind: string; pos: string; age: number | null; a26: number | null; g26: number; board: number; fut: number; rank?: number; club?: string | null; odds?: number }
interface Body { asTeam: number; overall: number; nextPicks: number[]; haul: { overall: number; name: string; pos: string }[]; taken: { overall: number; team: string; name: string }[]; pool: AssistPlayer[]; question?: string; code?: string; nextOverall?: number | null }

const SYSTEM = `You are a sharp draft assistant for a 10-team AFL Fantasy keeper league (G-Train). Each club keeps 17 players plus a rookie, then a redraft fills the list.
On field: 5 DEF, 7 MID, 1 RUC, 5 FWD (plus bench). Scoring is AFL Fantasy. Use ONLY the data given. Australian spelling, casual and direct, specific names and numbers.
Weigh the club's window: contenders want 2027 points; rebuilding clubs want young upside and rookies. Fill real holes in the best 18 before luxury depth.
Only recommend players from the AVAILABLE list, using their exact names. Where the list shows "% still there at #N", that is the measured chance (from 200 simulated replays of the picks in between) the player lasts to the club's next pick: quote those numbers exactly when asked about availability, and use them to decide what can wait. Don't invent odds for players without one.
If the coach asks whether to take a win-now asset now, weigh the club's window and depth against that player's odds of lasting and the next-best option at the next pick.
Reply with JSON only:
{"pick": {"name": exact name, "why": 1-2 sentences}, "alternatives": [2 objects {"name", "why": one sentence}],
"needs": one sentence on the club's biggest needs right now, "wait": one sentence on what can wait until the next pick (name 1-2 players likely to still be there),
"answer": if the coach asked a question, answer it in 1-3 sentences, else ""}`;

export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'The assistant isn’t switched on yet.' }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.pool?.length) return NextResponse.json({ error: 'Nothing on the board to look at.' }, { status: 400 });

  const jar = await cookies();
  let unlockNow = false;
  if (jar.get(ASK_COOKIE)?.value !== askToken(me.user_id)) {
    if (!body.code) return NextResponse.json({ needCode: true }, { status: 403 });
    if (!askCodeOk(body.code)) return NextResponse.json({ needCode: true, error: 'Wrong code.' }, { status: 403 });
    unlockNow = true;
  }
  const done = (b: unknown, status = 200) => {
    const res = NextResponse.json(b, { status });
    if (unlockNow) res.cookies.set(ASK_COOKIE, askToken(me.user_id), { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 365 });
    return res;
  };

  const league = await getLeague();
  const a = league.byTeam.get(Number(body.asTeam));
  if (!a) return done({ error: 'Club not found.' }, 404);

  // The club's real list: keepers (or the whole squad if keepers aren't set), plus who it has drafted in this mock.
  const kept = a.players.filter((p) => p.is_keeper || p.is_rookie_keeper);
  const list = (kept.length ? kept : a.players).filter((p) => !p.list_status)
    .map((p) => ({ p, proj: projected2027(p), age: age(p.birth_date, new Date(2027, 2, 1)) })).sort((x, y) => y.proj - x.proj);
  const squad = list.map(({ p, proj, age: ag }) => `${p.full_name ?? p.name} | ${p.positions.join('/')} | age ${ag ?? '?'} | 26avg ${p.average ?? '–'} (${p.games ?? 0}g) | proj27 ${proj}${p.is_rookie_keeper ? ' | rookie keeper' : ''}`);
  // Depth by line: how many of the keepers are genuine starters (proj 80+) at each line against the slots to fill.
  const depth = LINES.map((l) => { const n = list.filter(({ p, proj }) => p.positions[0] === l && proj >= 80).length; return `${l} ${n} starters (need ${LINE_SLOTS[l]})`; }).join(', ');

  const teamIds = [...league.byTeam.keys()];
  const lists = new Map([...league.byTeam].map(([k, t]) => [k, t.projection]));
  const strength = strengthByYear(teamIds, league.players, league.ratings, lists);
  const lt = league.ladder.find((l) => l.season === CURRENT_SEASON && l.team_id === a.team.id);
  const win = windowFor({ teamId: a.team.id, teamName: a.team.name, teamIds, premierYears: a.premierships, rank2026: lt?.rank ?? null,
    rank2027: a.projection.rank, futureRank: a.future.rank, coreAge: coreAge(a.team.id, league.players), strength });
  const phase = win.find((w) => w.year === CURRENT_SEASON + 1)?.phase ?? 'Mid table';

  const pool = body.pool.slice(0, 70).map((p) => `${p.name} | ${p.kind}${p.kind === 'Rookie' ? ` (projected AFL pick ${p.rank ?? '?'})` : ''} | ${p.pos} | age ${p.age ?? '?'} | 26avg ${p.a26 != null ? Math.round(p.a26) : '–'} (${p.g26}g) | board ${Math.round(p.board)} | future ${Math.round(p.fut)}${p.odds != null && body.nextOverall ? ` | ${p.odds}% still there at #${body.nextOverall}` : ''}`);
  const brief = [
    `CLUB: ${a.team.name}. 2027 window: ${phase}. Finished ${lt?.rank ?? '?'} in 2026; projected #${a.projection.rank}/10 for 2027.`,
    `DEPTH: ${depth}`,
    `KEPT LIST (${squad.length}):\n${squad.join('\n')}`,
    `DRAFTED IN THIS MOCK SO FAR: ${body.haul.map((h) => `#${h.overall} ${h.name} (${h.pos})`).join('; ') || 'none'}`,
    `ON THE CLOCK: pick #${body.overall}. Next picks after this: ${body.nextPicks.slice(0, 4).map((n) => `#${n}`).join(', ') || 'none'}`,
    `LAST PICKS BY OTHER CLUBS: ${body.taken.slice(-12).map((t) => `#${t.overall} ${t.team}: ${t.name}`).join('; ') || 'none yet'}`,
    `AVAILABLE (best first by board value):\n${pool.join('\n')}`,
    body.question ? `COACH'S QUESTION: ${body.question.slice(0, 300)}` : '',
  ].filter(Boolean).join('\n\n');

  try {
    const raw = await chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: brief }], true, 3000);
    const out = JSON.parse(raw) as { pick?: { name: string; why: string }; alternatives?: { name: string; why: string }[]; needs?: string; wait?: string; answer?: string };
    // Tie names back to the board so the page can offer a Draft button.
    const keyOf = (n?: string) => body.pool.find((p) => p.name.toLowerCase() === (n ?? '').toLowerCase())?.key ?? null;
    return done({ ...out, pickKey: keyOf(out.pick?.name), altKeys: (out.alternatives ?? []).map((x) => keyOf(x.name)), phase });
  } catch (e) {
    return done({ error: (e as Error).message.includes('JSON') ? 'The assistant came back garbled. Try again.' : (e as Error).message }, 502);
  }
}
