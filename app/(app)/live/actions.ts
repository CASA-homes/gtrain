'use server';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/data';
import { COMP, SLOTS, type Lineup, type Slot } from '@/lib/aflw';

export interface Mini { ready: boolean; lineups: Record<number, Lineup>; matchups: { home: number; away: number }[] }

/** Every club's 11 and the matchups for a round. ready=false if the tables haven't been created yet. */
export async function loadMini(round: number): Promise<Mini> {
  const supabase = await createClient();
  const [l, m] = await Promise.all([
    supabase.from('mini_lineups').select('team_id, players').eq('comp', COMP).eq('round', round),
    supabase.from('mini_matchups').select('home_team_id, away_team_id').eq('comp', COMP).eq('round', round),
  ]);
  if (l.error || m.error) return { ready: false, lineups: {}, matchups: [] };
  return {
    ready: true,
    lineups: Object.fromEntries((l.data ?? []).map((r) => [r.team_id, r.players as Lineup])),
    matchups: (m.data ?? []).map((r) => ({ home: r.home_team_id, away: r.away_team_id })),
  };
}

function clean(l: Lineup): Lineup {
  const out: Lineup = {};
  const seen = new Set<number>();   // a player fills one slot only
  for (const s of Object.keys(SLOTS) as Slot[]) {
    const ids = [...new Set((l[s] ?? []).map(Number).filter((x) => Number.isInteger(x) && x > 0 && !seen.has(x)))].slice(0, SLOTS[s]);
    ids.forEach((x) => seen.add(x));
    if (ids.length) out[s] = ids;
  }
  return out;
}

/** Commish only: set (or clear) one club's 11 for a round. */
export async function saveLineup(round: number, teamId: number, lineup: Lineup): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me?.is_commish) return { ok: false, error: 'Only the commish can pick teams.' };
  const supabase = await createClient();
  const players = clean(lineup);
  const res = Object.keys(players).length
    ? await supabase.from('mini_lineups').upsert({ comp: COMP, round, team_id: teamId, players, updated_at: new Date().toISOString() }, { onConflict: 'comp,round,team_id' })
    : await supabase.from('mini_lineups').delete().eq('comp', COMP).eq('round', round).eq('team_id', teamId);
  return res.error ? { ok: false, error: res.error.message } : { ok: true };
}

/** Commish only: add or remove a matchup. */
export async function saveMatchup(round: number, home: number, away: number, remove = false): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me?.is_commish) return { ok: false, error: 'Only the commish can set matchups.' };
  if (home === away) return { ok: false, error: 'Pick two different clubs.' };
  const supabase = await createClient();
  const res = remove
    ? await supabase.from('mini_matchups').delete().eq('comp', COMP).eq('round', round).eq('home_team_id', home)
    : await supabase.from('mini_matchups').upsert({ comp: COMP, round, home_team_id: home, away_team_id: away }, { onConflict: 'comp,round,home_team_id' });
  return res.error ? { ok: false, error: res.error.message } : { ok: true };
}
