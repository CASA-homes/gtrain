'use server';
// League settings: the commish names the league.
import { revalidatePath } from 'next/cache';
import { createClient, currentLeagueId } from '@/lib/supabase/server';
import { getMe } from '@/lib/data';

export async function setLeagueName(raw: string): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me?.is_commish) return { ok: false, error: 'Only the commish can rename the league.' };
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, error: 'Give the league a name.' };
  if (name.length > 40) return { ok: false, error: 'Keep it to 40 characters or fewer.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('leagues').update({ name }).eq('id', await currentLeagueId()).select('id');
  if (error) return { ok: false, error: /leagues/.test(error.message) ? 'Run supabase/migrations/0027_multi_league.sql in Supabase first.' : error.message };
  if (!data?.length) return { ok: false, error: 'Could not save the league name.' };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/* ---------- Coaches & invites (commish): who can sign in to this league and which club they run ---------- */
export interface InviteRow { email: string; team_id: number | null; is_commish: boolean; joined: boolean }

export async function listInvites(): Promise<{ ok: boolean; rows: InviteRow[]; error?: string }> {
  const me = await getMe();
  if (!me?.is_commish) return { ok: false, rows: [], error: 'Commish only.' };
  const supabase = await createClient();
  const [inv, mem] = await Promise.all([
    supabase.from('allowed_emails').select('email, team_id, is_commish').order('email'),
    supabase.from('members').select('email'),
  ]);
  if (inv.error) return { ok: false, rows: [], error: inv.error.message };
  const joined = new Set((mem.data ?? []).map((m) => String(m.email).toLowerCase()));
  return { ok: true, rows: (inv.data ?? []).map((r) => ({ email: r.email, team_id: r.team_id ?? null, is_commish: !!r.is_commish, joined: joined.has(String(r.email).toLowerCase()) })) };
}

export async function saveInvite(rawEmail: string, teamId: number | null, isCommish: boolean): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me?.is_commish) return { ok: false, error: 'Only the commish can invite coaches.' };
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) return { ok: false, error: 'That doesn’t look like an email address.' };
  if (teamId == null) return { ok: false, error: 'Pick the club they’ll run.' };
  const supabase = await createClient();
  const t = await supabase.from('teams').select('id').eq('id', teamId).maybeSingle();
  if (!t.data) return { ok: false, error: 'Pick a club in this league.' };
  const r = await supabase.from('allowed_emails').upsert({ email, team_id: teamId, is_commish: isCommish }, { onConflict: 'league_id,email' });
  if (r.error) return { ok: false, error: r.error.message };
  // Already a member here? Keep their club and commish flag in step (commish_set_member: migration 0030).
  await supabase.rpc('commish_set_member', { member_email: email, new_team: teamId, make_commish: isCommish });
  revalidatePath('/league/settings');
  return { ok: true };
}

export async function removeInvite(rawEmail: string): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me?.is_commish) return { ok: false, error: 'Only the commish can remove coaches.' };
  const email = rawEmail.trim().toLowerCase();
  if (email === me.email.toLowerCase()) return { ok: false, error: 'You can’t remove yourself.' };
  const supabase = await createClient();
  const r = await supabase.from('allowed_emails').delete().eq('email', email);
  if (r.error) return { ok: false, error: r.error.message };
  // Take away their access to this league too (commish_remove_member: migration 0030).
  await supabase.rpc('commish_remove_member', { member_email: email });
  revalidatePath('/league/settings');
  return { ok: true };
}
