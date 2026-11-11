import { NextResponse } from 'next/server';
import { getLeague, getMe } from '@/lib/data';
import { CLUBS } from '@/lib/clubs';

// Header search: clubs, coaches and players (rostered and unowned). Signed-in members only.
export type SearchHit = { kind: 'club' | 'coach' | 'player'; id: number; title: string; sub: string; href: string; avg?: number | null };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '').trim();
/** 3 = starts with the query, 2 = a word starts with it, 1 = contains it, 0 = no match. */
function score(text: string, q: string) {
  const t = norm(text);
  if (t.startsWith(q)) return 3;
  if (t.split(/[\s\-.]+/).some((w) => w.startsWith(q))) return 2;
  return t.includes(q) ? 1 : 0;
}

export async function GET(req: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ hits: [] }, { status: 401 });
  const q = norm(new URL(req.url).searchParams.get('q') ?? '');
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const league = await getLeague();
  const holders = new Set(league.picks.map((p) => p.owner_team_id));
  const teams = league.teams.filter((t) => holders.has(t.id));
  const owner = new Map(teams.map((t) => [t.id, t.name]));

  const hits: (SearchHit & { s: number })[] = [];
  for (const t of teams) {
    const s = Math.max(score(t.name, q), score(t.short_code, q) === 3 ? 3 : 0);
    if (s) hits.push({ kind: 'club', id: t.id, title: t.name, sub: `Coach ${t.coach_name}`, href: `/clubhouse/${t.id}`, s: s + 2 });
    const c = score(t.coach_name ?? '', q);
    if (c) hits.push({ kind: 'coach', id: t.id, title: t.coach_name, sub: t.name, href: `/clubhouse/${t.id}`, s: c + 1 });
  }
  const seen = new Set<number>();
  for (const p of [...league.players, ...league.freeAgents]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const s = Math.max(score(p.full_name ?? '', q), score(p.name, q));
    if (!s) continue;
    const club = p.afl_club ? CLUBS[p.afl_club]?.name ?? p.afl_club : 'No AFL club';
    const where = p.team_id ? owner.get(p.team_id) ?? 'G-Train club' : 'Unowned';
    hits.push({
      kind: 'player', id: p.id, title: p.full_name ?? p.name, href: `/players/${p.id}`, avg: p.average,
      sub: `${p.positions.join('/')} · ${club} · ${where}${p.list_status ? ` · ${p.list_status}` : ''}`,
      // Better scorers first among equal matches, so "Smith" finds Bailey Smith before the rest.
      s: s + Math.min(0.9, (p.average ?? 0) / 150),
    });
  }
  hits.sort((a, b) => b.s - a.s);
  return NextResponse.json({ hits: hits.slice(0, 14).map(({ s: _s, ...h }) => h) });
}
