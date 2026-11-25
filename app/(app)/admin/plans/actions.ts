'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isSiteAdmin } from '@/lib/plan';

/** Site admin: set a league to Free or Pro (optionally Pro until a date, Perth time). */
export async function setLeaguePlan(form: FormData) {
  if (!(await isSiteAdmin())) throw new Error('Site admins only');
  const league = Number(form.get('league'));
  const plan = form.get('plan') === 'pro' ? 'pro' : 'free';
  const until = String(form.get('until') ?? '').trim();
  const note = String(form.get('note') ?? '').trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_league_plan', {
    p_league: league, p_plan: plan, p_until: plan === 'pro' && until ? new Date(`${until}T23:59:59+08:00`).toISOString() : null, p_note: note || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/plans');
}
