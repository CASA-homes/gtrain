'use server';
// "Who'd you rather": record one swipe.
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/data';
import type { ValueMode } from '@/lib/values';

export async function castVote(mode: ValueMode, a: number, b: number, winner: number | null): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me) return { ok: false, error: 'Sign in to vote.' };
  if (a === b || (winner != null && winner !== a && winner !== b) || !['dynasty', 'now'].includes(mode)) return { ok: false, error: 'Bad vote.' };
  const supabase = await createClient();
  const r = await supabase.from('value_votes').insert({ voter_id: me.team_id, mode, a_id: a, b_id: b, winner });
  if (r.error) return { ok: false, error: /value_votes|relation/.test(r.error.message) ? 'Voting needs supabase/migrations/0020_matchday_comps_msd_values.sql run in Supabase first.' : r.error.message };
  return { ok: true };
}
