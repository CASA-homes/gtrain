'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCoach } from '@/lib/data';

export async function logBet(form: FormData) {
  const me = await getCoach();
  if (!me) return;
  const opp = Number(form.get('opponent')) || null;
  const title = String(form.get('title') || '').trim().slice(0, 200);
  if (title.length < 3) return;
  const supabase = await createClient();
  await supabase.from('side_bets').insert({
    season: Number(form.get('season')) || 2027,
    title,
    team_a: me.team_id,
    team_b: opp && opp !== me.team_id ? opp : null,
    stake: String(form.get('stake') || '').trim().slice(0, 80) || 'A pint',
  });
  revalidatePath('/league/bets');
}

export async function settleBet(form: FormData) {
  const id = Number(form.get('id'));
  const how = String(form.get('how'));
  const supabase = await createClient();
  if (how === 'delete') await supabase.from('side_bets').delete().eq('id', id);
  else if (how === 'void') await supabase.from('side_bets').update({ status: 'void', winner_id: null }).eq('id', id);
  else if (how === 'reopen') await supabase.from('side_bets').update({ status: 'open', winner_id: null }).eq('id', id);
  else if (Number(how)) await supabase.from('side_bets').update({ status: 'settled', winner_id: Number(how) }).eq('id', id);
  revalidatePath('/league/bets');
}
