// KT pots for mini games and side comps (see supabase/migrations/0070_kt_pots.sql).
import { createClient } from '@/lib/supabase/server';

export interface KtPot { id: number; kind: 'mini' | 'comp'; ref: string; label: string; entry: number; split: string; cut_pct: number; status: 'open' | 'paid' | 'refunded'; pool_kt: number | null; cut_kt: number | null; result: { team: number; place: number; kt: number }[] | null }
export interface KtEntry { pot_id: number; team_id: number; kt: number }
export const KT_COMP_MAX = 50;

export async function loadPots(kind: 'mini' | 'comp', refs?: string[]): Promise<{ pots: KtPot[]; entries: KtEntry[] }> {
  const supabase = await createClient();
  let q = supabase.from('kt_pots').select('*').eq('kind', kind);
  if (refs) q = q.in('ref', refs.length ? refs : ['-']);
  const { data, error } = await q;
  if (error || !data?.length) return { pots: [], entries: [] };
  const e = await supabase.from('kt_pot_entries').select('pot_id, team_id, kt').in('pot_id', data.map((p) => p.id));
  return { pots: data as KtPot[], entries: (e.data ?? []) as KtEntry[] };
}

/** Pay out any open mini-game pots whose round is locked. Safe to call from anywhere: the database does the scoring. */
export async function settleMiniPots(gameIds?: number[]) {
  const supabase = await createClient();
  let q = supabase.from('kt_pots').select('id').eq('kind', 'mini').eq('status', 'open');
  if (gameIds) q = q.in('ref', gameIds.map(String));
  const { data } = await q;
  for (const p of data ?? []) await supabase.rpc('kt_pot_settle_mini', { p_pot: p.id });
  return (data ?? []).length;
}
