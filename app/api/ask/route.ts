import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ASK_COOKIE, askCodeOk, askToken } from '@/lib/ask-access';
import { getLeague, getMe } from '@/lib/data';
import { METRIC_KEYS, metricsFor, runQuery, type Metrics, type Query } from '@/lib/player-metrics';

// "Ask" on the Players page. Two small model calls:
//   1. turn the question into a Query (filters + sort over pre-computed metrics) — the model never sees the data dump;
//   2. write a 1–3 sentence answer from the top rows the server found.
// Key and model come from Vercel env vars: OPENAI_API_KEY (required), OPENAI_MODEL (optional).
export const maxDuration = 30;
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const DAILY_LIMIT = 40;
const used = new Map<string, { day: string; n: number }>();
const wrong = new Map<string, { hour: string; n: number }>();   // wrong-passcode attempts per person per hour   // per-instance soft cap; set a hard cap in the OpenAI dashboard too

const METRIC_HELP = `avg26 (2026 season average), avg25, avg24, jump (avg26 minus avg25, both 5+ games), last3, last5, last8 (average of his most recent games),
trend (last8 minus avg26: positive = finished 2026 stronger than his season average), secondHalf (average from round 13 on), max (best 2026 score),
tons (2026 games of 100+), games26, games25, tog (time on ground %), cba (centre-bounce attendance %: midfield time), age, value (0–100 rating), potential (0–5 stars).`;

const SYSTEM_QUERY = `You turn an AFL Fantasy keeper-league coach's question into a JSON query over a player table. Reply with JSON only.
Schema: {"title": short heading, "ownership": "owned"|"free"|"all", "team": G-Train team name or null, "club": AFL club code (ADE BRL CAR COL ESS FRE GEE GCS GWS HAW MEL NTH PTA RIC STK SYD WCE WBD) or null,
"position": "DEF"|"MID"|"RUC"|"FWD"|null (2026 eligibility), "position2025": same for 2025, "pureForward": boolean,
"minAge","maxAge","minGames26","minGames25": numbers or null, "min": {metric: number}, "max": {metric: number},
"sortBy": metric, "order": "desc"|"asc", "limit": 5-25, "columns": [up to 5 metrics to show besides the name]}.
Metrics: ${METRIC_HELP}
Rules: default ownership "all" and team null: only set team when the question names a G-Train team or says "my team"/"my list". For "biggest jump"/"most improved" sort by jump with minGames26 10. For "trending up"/"finishing strong" sort by trend with min.avg26 50 and minGames26 10.
"Free agent"/"available"/"unowned" means ownership "free". "Slept on"/"cheap" usually means max.avg26 around 80. Ages are current ages. Unless the coach says otherwise, always set minGames26 to at least 8 (10 for jump/trend) so tiny samples don't top the list. Keep limit 15 unless asked.`;

const SYSTEM_ANSWER = `You are a sharp, casual AFL Fantasy analyst for a 10-team keeper league. Answer the coach's question in 1–3 short sentences using ONLY the rows given
(name, numbers, owner). Name the standout players and the key number for each. Australian spelling, no hype, no made-up facts, no markdown headings.`;

async function chat(messages: { role: string; content: string }[], json: boolean) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, reasoning_effort: 'low', ...(json ? { response_format: { type: 'json_object' } } : {}), max_completion_tokens: json ? 2500 : 1500 }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message ?? `OpenAI ${r.status}`);
  return String(d.choices?.[0]?.message?.content ?? '');
}

export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'The assistant isn’t switched on yet: the commish needs to add the OpenAI key in Vercel.' }, { status: 503 });
  const { q, code } = (await req.json().catch(() => ({}))) as { q?: string; code?: string };
  // Passcode wall: the first ask needs the code, then a cookie remembers it for this person.
  const jar = await cookies();
  let unlockNow = false;
  if (jar.get(ASK_COOKIE)?.value !== askToken(me.user_id)) {
    if (!code) return NextResponse.json({ needCode: true }, { status: 403 });
    const hour = new Date().toISOString().slice(0, 13);
    const w = wrong.get(me.user_id);
    const tries = w?.hour === hour ? w.n : 0;
    if (tries >= 5) return NextResponse.json({ needCode: true, error: 'Too many wrong codes. Try again in an hour.' }, { status: 429 });
    if (!askCodeOk(code)) { wrong.set(me.user_id, { hour, n: tries + 1 }); return NextResponse.json({ needCode: true, error: 'Wrong code.' }, { status: 403 }); }
    unlockNow = true;
  }
  const question = String(q ?? '').trim().slice(0, 300);
  if (question.length < 3) return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });

  const day = new Date().toISOString().slice(0, 10);
  const u = used.get(me.user_id);
  const n = u?.day === day ? u.n : 0;
  if (n >= DAILY_LIMIT) return NextResponse.json({ error: `That’s ${DAILY_LIMIT} questions today. Back tomorrow.` }, { status: 429 });
  used.set(me.user_id, { day, n: n + 1 });

  const league = await getLeague();
  const teamName = (id: number) => league.teams.find((t) => t.id === id)?.name ?? 'Free agent';
  const all: Metrics[] = [...league.players, ...league.freeAgents].map((p) => {
    const r = league.ratings.get(p.id);
    return metricsFor(p, p.team_id ? teamName(p.team_id) : 'Free agent', r?.value ?? 0, r?.potential ?? null);
  });

  try {
    // Only tell the model who's asking when the question is about "my" team; otherwise it over-filters.
    const myTeam = !me.is_guest && /\b(my|mine|our|i)\b/i.test(question) ? teamName(me.team_id) : null;
    const raw = await chat([
      { role: 'system', content: SYSTEM_QUERY },
      { role: 'user', content: `${myTeam ? `(The coach asking runs "${myTeam}"; "my team"/"my list" means that team.)\n` : ''}${question}` },
    ], true);
    let query: Query;
    try { query = JSON.parse(raw) as Query; } catch { throw new Error('The assistant got confused by that one. Try rephrasing.'); }
    const rows = runQuery(all, query);
    const cols = (query.columns ?? []).filter((c) => (METRIC_KEYS as readonly string[]).includes(c)).slice(0, 5);
    const columns = cols.length ? cols : [query.sortBy ?? 'avg26'];
    const brief = rows.slice(0, 15).map((m) => `${m.full} (${m.positions.join('/')}, ${m.club}, ${m.owner}, age ${m.age ?? '?'}): ` +
      [...new Set([query.sortBy ?? 'avg26', ...columns, 'avg26', 'avg25'])].map((k) => `${k} ${m[k as keyof Metrics] ?? '–'}`).join(', ')).join('\n');
    const answer = rows.length
      ? await chat([{ role: 'system', content: SYSTEM_ANSWER }, { role: 'user', content: `Question: ${question}\nTop rows (sorted by ${query.sortBy ?? 'avg26'}):\n${brief}` }], false)
      : 'No players match that. Try loosening it (fewer games, wider age range or a different position).';
    const res = NextResponse.json({
      title: query.title ?? question, answer, columns, sortBy: query.sortBy ?? 'avg26',
      rows: rows.map((m) => ({ id: m.id, name: m.name, positions: m.positions, club: m.club, owner: m.owner, age: m.age, ...Object.fromEntries(columns.map((c) => [c, m[c]])) })),
    });
    if (unlockNow) res.cookies.set(ASK_COOKIE, askToken(me.user_id), { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 365 });
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
