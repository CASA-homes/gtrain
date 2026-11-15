// Assistant coach (template). Answers questions about a club's cap using OpenAI's chat API.
// Not wired into the UI yet. To switch it on: add OPENAI_API_KEY (and optionally OPENAI_MODEL) in Vercel, then
// point the Finances "Ask" box at POST /api/assistant with { question }.
import { NextResponse } from 'next/server';
import { getContracts } from '@/lib/contracts';

export const dynamic = 'force-dynamic';

const SYSTEM = `You are the assistant coach for a club in an AFL keeper league with player contracts and a salary cap.
Answer in plain, short sentences with real numbers from the club data given. Salaries are in $1,000s. KT are paper tokens.
Rules: keeper cap (hard) at lock-in, season cap (soft) in season, one cap-free rookie keeper (10 or fewer games),
release clauses only in the mid-season window, players move at season end. Suggest concrete moves and their cap effect.`;

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'The assistant coach isn’t switched on yet.' }, { status: 501 });
  const { question } = (await req.json().catch(() => ({}))) as { question?: string };
  if (!question || question.length > 500) return NextResponse.json({ error: 'Ask a question (500 characters max).' }, { status: 400 });
  const d = await getContracts();
  const me = d.me && !d.me.is_guest ? d.me.team_id : null;
  if (!me || !d.settings) return NextResponse.json({ error: 'Sign in as a coach.' }, { status: 401 });
  const club = d.clubs.get(me)!;
  const roster = d.active.filter((c) => c.team_id === me).map((c) => {
    const p = d.players.get(c.player_id);
    return { name: p?.full_name ?? p?.name, pos: p?.positions.join('/'), games: p?.career_games, salary_k: c.salary_k, to: c.end_season, clause: c.tier, market_k: d.rates.get(c.player_id), rookie_slot: c.rookie_slot_season };
  });
  const context = { season: d.settings.season, caps: { keeper_k: d.settings.keeper_cap_k, season_k: d.settings.season_cap_k, tax_line_k: d.settings.tax_line_k },
    club: { salary_k: club.salary, next_salary_k: club.nextSalary, keeper_cap_next_k: club.keeperCapNext, bank_kt: club.bank, kept_next: club.keptNext }, roster };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini', temperature: 0.3, max_tokens: 500,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Club data: ${JSON.stringify(context)}\n\nQuestion: ${question}` }] }),
  });
  if (!r.ok) return NextResponse.json({ error: 'The assistant couldn’t answer right now.' }, { status: 502 });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return NextResponse.json({ answer: j.choices?.[0]?.message?.content ?? '' });
}
