'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCoach } from '@/lib/data';

const names = (v: FormDataEntryValue | null) => String(v || '').split(/[,&]/).map((s) => s.trim()).filter(Boolean).slice(0, 10);

export async function logBet(form: FormData) {
  const me = await getCoach();
  if (!me) return;
  const kind = String(form.get('kind') || 'over_under') as 'over_under' | 'yes_no' | 'versus';
  const subject = String(form.get('subject') || '').trim().slice(0, 160);
  const a = names(form.get('side_a')), b = names(form.get('side_b'));
  if (subject.length < 2 || !a.length) return;
  const line = Number(form.get('line'));
  const labels = kind === 'yes_no' ? ['Yes', 'No'] : kind === 'versus' ? [a.join(' & '), b.join(' & ') || 'The field'] : ['Over', 'Under'];
  const supabase = await createClient();
  await supabase.from('side_bets').insert({
    season: Number(form.get('season')) || 2027,
    category: String(form.get('category') || '').trim().slice(0, 40) || 'Other',
    subject, kind, line: kind === 'over_under' && Number.isFinite(line) && String(form.get('line')) !== '' ? line : null,
    side_a_label: labels[0], side_b_label: labels[1], side_a: a, side_b: b,
    stake: String(form.get('stake') || '').trim().slice(0, 80) || 'A pint',
  });
  revalidatePath('/league/bets');
}

export async function settleBet(form: FormData) {
  const id = Number(form.get('id'));
  const how = String(form.get('how'));
  const supabase = await createClient();
  if (how === 'delete') await supabase.from('side_bets').delete().eq('id', id);
  else if (how === 'reopen') await supabase.from('side_bets').update({ result: null }).eq('id', id);
  else if (['a', 'b', 'push', 'void'].includes(how)) await supabase.from('side_bets').update({ result: how }).eq('id', id);
  revalidatePath('/league/bets');
}
