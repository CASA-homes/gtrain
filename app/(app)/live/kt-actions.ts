'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

type Res = { ok: boolean; error?: string };
const done = (path?: string): Res => { if (path) revalidatePath(path); revalidatePath('/live/comps'); revalidatePath('/clubhouse', 'layout'); return { ok: true }; };

export async function payIn(potId: number, path?: string): Promise<Res> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('kt_pot_enter', { p_pot: potId });
  return error ? { ok: false, error: error.message } : done(path);
}
export async function payOut(potId: number, path?: string, team?: number): Promise<Res> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('kt_pot_leave', { p_pot: potId, p_team: team ?? null });
  return error ? { ok: false, error: error.message } : done(path);
}
export async function refundPot(potId: number, path?: string): Promise<Res> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('kt_pot_refund', { p_pot: potId });
  return error ? { ok: false, error: error.message } : done(path);
}
export async function settleCompPot(potId: number, order: number[]): Promise<Res> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('kt_pot_settle_comp', { p_pot: potId, p_order: order });
  return error ? { ok: false, error: error.message } : done();
}
