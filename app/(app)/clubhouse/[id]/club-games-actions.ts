'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/data';
import { MANUAL_SEASONS } from '@/lib/club-games';

/** Save a season's games for a club from pasted lines like "Bailey Smith, 22" or "B. Smith 22". */
export async function saveClubGames(teamId: number, form: FormData) {
  const me = await getMe();
  if (!me || (me.team_id !== teamId && !me.is_commish)) return { error: 'Only this club (or the commish) can edit its history.' };
  const season = Number(form.get('season'));
  if (!(MANUAL_SEASONS as readonly number[]).includes(season)) return { error: 'Pick a season from 2022 to 2025.' };
  const text = String(form.get('lines') ?? '');
  const rows: { team_id: number; season: number; player_name: string; games: number }[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)[\s,;:\t-]+(\d{1,2})\s*$/);
    if (!m || m[1].trim().length < 2 || Number(m[2]) > 30) { bad.push(line); continue; }
    rows.push({ team_id: teamId, season, player_name: m[1].trim(), games: Number(m[2]) });
  }
  if (!rows.length) return { error: bad.length ? `Couldn’t read: ${bad.slice(0, 3).join(' | ')}` : 'Nothing to save.' };
  const supabase = await createClient();
  const { error } = await supabase.from('club_games').upsert(rows, { onConflict: 'team_id,season,player_name' });
  if (error) return { error: error.message.includes('club_games') ? 'The club history table isn’t set up yet. Ask the commish.' : error.message };
  revalidatePath(`/clubhouse/${teamId}`);
  return { ok: true, saved: rows.length, skipped: bad };
}

export async function deleteClubGame(teamId: number, season: number, playerName: string) {
  const me = await getMe();
  if (!me || (me.team_id !== teamId && !me.is_commish)) return { error: 'Not your club.' };
  const supabase = await createClient();
  const { error } = await supabase.from('club_games').delete().match({ team_id: teamId, season, player_name: playerName });
  if (error) return { error: error.message };
  revalidatePath(`/clubhouse/${teamId}`);
  return { ok: true };
}
