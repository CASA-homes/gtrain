'use server';
// Draft sign-off: the commish posts the draft into squads (or undoes it). Picks are fixed in the browser via draft_room_edit.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCoach, getLeague } from '@/lib/data';
import { loadRoomState, profileLine } from '@/lib/draft-room-data';
import { DRAFT_YEAR } from '@/lib/draft-room';
import PROFILES from '@/lib/draft-profiles-2026.json';

type Res = { ok: boolean; error?: string; result?: { added: number; created: number; moved: number; released: number } };
const MIG = 'Sign-off needs supabase/migrations/0024_draft_signoff.sql run in Supabase first.';
const short = (full: string) => { const w = full.trim().split(/\s+/); return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(' ')}` : full; };

export async function postDraft(): Promise<Res> {
  const me = await getCoach();
  if (!me?.is_commish) return { ok: false, error: 'Commish only.' };
  const [league, { ready, state }] = await Promise.all([getLeague(), loadRoomState()]);
  if (!ready) return { ok: false, error: MIG };
  if (state.room.status !== 'done') return { ok: false, error: 'The draft has to be finished first.' };
  const inDb = new Set(league.players.map((p) => p.id));
  const fa = new Map(league.freeAgents.map((p) => [p.id, p]));
  const profiles = new Map((PROFILES as { year: number; name: string; position: string; height?: number }[]).filter((d) => d.year === DRAFT_YEAR - 1)
    .map((d) => [`dr:${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, d]));
  const sels = state.sels.filter((s) => s.player_key && s.player);

  // Details for every drafted player who isn't in the players table yet.
  const newp: unknown[] = [];
  for (const s of sels) {
    const key = s.player_key!;
    const id = /^p:\d+$/.test(key) ? Number(key.slice(2)) : null;
    if (id != null && inDb.has(id)) continue;
    const f = id != null ? fa.get(id) : undefined;
    if (f) {
      newp.push({
        key, player: { name: f.name, full_name: f.full_name, afl_club: f.afl_club, positions: f.positions, dfs_id: f.dfs_id, birth_date: f.birth_date, draft_year: f.draft_year,
          draft_pick: f.draft_pick, height_cm: f.height_cm, debut_year: f.debut_year, career_games: f.career_games, hist: f.hist },
        season: f.games != null ? { games: f.games, average: f.average, last5: f.last5, box: f.box, games_log: f.games_log ?? null } : null,
      });
      continue;
    }
    const d = profiles.get(key);
    const full = d?.name ?? s.player!.n;
    newp.push({
      key, player: { name: short(full), full_name: full, afl_club: null, positions: d ? profileLine(d.position) : s.player!.positions ?? [s.player!.pos],
        dfs_id: null, birth_date: null, draft_year: DRAFT_YEAR - 1, draft_pick: null, height_cm: d?.height ?? null, debut_year: null, career_games: 0, hist: null },
      season: null,
    });
  }

  // The news post.
  const tn = (id: number) => league.teams.find((t) => t.id === id)?.name ?? 'Club';
  const r1 = sels.filter((s) => s.round === 1).sort((a, b) => (a.overall ?? 0) - (b.overall ?? 0));
  const rookies = sels.filter((s) => s.player!.rookie).length;
  const byTeam = new Map<number, typeof sels>();
  for (const s of sels) byTeam.set(s.team_id, [...(byTeam.get(s.team_id) ?? []), s]);
  const details = [
    `${r1[0] ? `${tn(r1[0].team_id)} opened the night with ${r1[0].player!.n} at pick 1. ` : ''}${sels.length} players went across the draft${rookies ? `, ${rookies} of them 2026 draftees` : ''}.`,
    '', 'Round 1',
    ...r1.map((s) => `${s.overall}. ${s.player!.n} (${s.player!.club}, ${s.player!.pos}) to ${tn(s.team_id)}`),
    '', 'Every club\'s haul',
    ...[...byTeam].map(([t, list]) => `${tn(t)} (${list.length}): ${list.map((s) => `${s.player!.n} #${s.overall ?? 'make-up'}`).join(', ')}`),
  ].join('\n');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('draft_room_post', { y: DRAFT_YEAR, newp, title: `${DRAFT_YEAR} Draft results`, details });
  if (error) return { ok: false, error: /draft_room_post|does not exist/.test(error.message) ? MIG : error.message };
  revalidatePath('/', 'layout');
  return { ok: true, result: data as Res['result'] };
}

export async function unpostDraft(): Promise<Res> {
  const me = await getCoach();
  if (!me?.is_commish) return { ok: false, error: 'Commish only.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('draft_room_unpost', { y: DRAFT_YEAR });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
