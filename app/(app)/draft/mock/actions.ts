'use server';
import { createClient } from '@/lib/supabase/server';
import type { Edits } from '@/lib/mock-draft';

/** The signed-in coach's saved mock-draft edits; ready=false if the table isn't there yet. */
export async function loadMockEdits(): Promise<{ ready: boolean; edits: Edits }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ready: false, edits: { out: [], adj: {} } };
  const q = await supabase.from('mock_edits').select('player_key, is_out, adj').eq('user_id', user.id);
  if (q.error) return { ready: false, edits: { out: [], adj: {} } };
  const edits: Edits = { out: [], adj: {} };
  for (const r of q.data ?? []) { if (r.is_out) edits.out.push(r.player_key); if (r.adj) edits.adj[r.player_key] = r.adj; }
  return { ready: true, edits };
}

/** Save (or clear) the edit for one player. */
export async function saveMockEdit(key: string, isOut: boolean, adj: number): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || key.length < 3 || key.length > 80) return { ok: false };
  const a = Math.max(-120, Math.min(120, Math.round(adj)));
  const res = !isOut && a === 0
    ? await supabase.from('mock_edits').delete().eq('user_id', user.id).eq('player_key', key)
    : await supabase.from('mock_edits').upsert({ user_id: user.id, player_key: key, is_out: isOut, adj: a, updated_at: new Date().toISOString() }, { onConflict: 'user_id,player_key' });
  return { ok: !res.error };
}

/** Upload a batch at once (moving edits saved in this browser into the database). */
export async function saveMockEdits(edits: Edits): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const keys = new Set([...edits.out, ...Object.keys(edits.adj)]);
  const rows = [...keys].filter((k) => k.length >= 3 && k.length <= 80).map((k) => ({ user_id: user.id, player_key: k, is_out: edits.out.includes(k), adj: Math.max(-120, Math.min(120, edits.adj[k] ?? 0)), updated_at: new Date().toISOString() }));
  if (!rows.length) return { ok: true };
  const res = await supabase.from('mock_edits').upsert(rows, { onConflict: 'user_id,player_key' });
  return { ok: !res.error };
}

export async function clearMockEdits(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const res = await supabase.from('mock_edits').delete().eq('user_id', user.id);
  return { ok: !res.error };
}
