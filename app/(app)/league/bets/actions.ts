'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCoach, getMe } from '@/lib/data';
import { COMP_SEASON } from '@/lib/comps';
import { applyRoundFines, type FineKind } from '@/lib/fines';

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

// ---- Fines (commish) ----

const finesBack = (tab: string, error?: string) => {
  revalidatePath('/league/bets');
  if (error) redirect(`/league/bets?tab=${tab}&error=${encodeURIComponent(error)}`);
};
async function commish() { const me = await getMe(); return me?.is_commish ? me : null; }

export async function saveFineRule(form: FormData) {
  if (!(await commish())) return finesBack('fines', 'Only the commish can set fines.');
  const kind = String(form.get('kind')) as FineKind;
  const amount = Math.round(Number(form.get('amount')));
  const t = form.get('threshold');
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000) return finesBack('fines', 'Amounts are $1 to $1,000.');
  const supabase = await createClient();
  const { error } = await supabase.from('fine_rules').upsert({
    kind, amount, active: form.get('active') === 'on',
    threshold: t != null && String(t) !== '' ? Math.round(Number(t)) : null,
  }, { onConflict: 'league_id,kind' });
  finesBack('fines', error?.message);
}

export async function rerunFines(form: FormData) {
  if (!(await commish())) return finesBack('fines', 'Only the commish can run fines.');
  const round = Number(form.get('round'));
  const supabase = await createClient();
  const { data } = await supabase.from('score_rounds').select('snapshot, locked_at').eq('comp', 'gtrain').eq('round', round).maybeSingle();
  if (!data?.locked_at) return finesBack('fines', `Round ${round} isn’t locked yet. Lock it in Overrides first.`);
  const r = await applyRoundFines(round, (data.snapshot ?? {}) as Record<string, number>);
  finesBack('fines', r.ok ? undefined : r.error);
}

export async function addFine(form: FormData) {
  if (!(await commish())) return finesBack('fines', 'Only the commish can fine clubs.');
  const team_id = Number(form.get('team'));
  const amount = Math.round(Number(form.get('amount')));
  const reason = String(form.get('reason') || '').trim().slice(0, 120);
  const round = Number(form.get('round'));
  if (!team_id || !(amount > 0) || reason.length < 2) return finesBack('fines', 'Pick a club, an amount and a reason.');
  const supabase = await createClient();
  const { error } = await supabase.from('fines').insert({ team_id, amount, reason, season: COMP_SEASON, round: round || null, prize: form.get('prize') === 'on' });
  finesBack('fines', error?.message);
}

export async function fineAction(form: FormData) {
  if (!(await commish())) return finesBack('fines', 'Only the commish can change fines.');
  const id = String(form.get('id'));
  const how = String(form.get('how'));
  const supabase = await createClient();
  const q = how === 'delete' ? supabase.from('fines').delete().eq('id', id) : supabase.from('fines').update({ paid: how === 'paid' }).eq('id', id);
  const { error } = await q;
  finesBack('fines', error?.message);
}

// ---- League bank prizes (commish) ----
export async function pledgePrize(form: FormData) {
  if (!(await commish())) return finesBack('bank', 'Only the commish can pledge prizes.');
  const label = String(form.get('label') || '').trim().slice(0, 80);
  const kt = Math.round(Number(form.get('kt')));
  const season = Number(form.get('season')) || COMP_SEASON + 1;
  if (label.length < 3 || !(kt > 0)) return finesBack('bank', 'Name the prize and how much KT.');
  const supabase = await createClient();
  const { data: bank } = await supabase.rpc('kc_league_bank');
  const b = bank as { balance: number; pledged: number } | null;
  if (b && kt > b.balance - b.pledged) return finesBack('bank', `Only ${(b.balance - b.pledged).toLocaleString()} KT is free to pledge.`);
  const { error } = await supabase.from('bank_prizes').insert({ label, kt, season });
  finesBack('bank', error?.message);
}

export async function prizeAction(form: FormData) {
  if (!(await commish())) return finesBack('bank', 'Only the commish can pay prizes.');
  const id = Number(form.get('id'));
  const how = String(form.get('how'));
  const supabase = await createClient();
  if (how === 'pay') {
    const { error } = await supabase.rpc('bank_pay_prize', { p_prize: id, p_team: Number(form.get('team')) });
    return finesBack('bank', error?.message);
  }
  const { error } = await supabase.from('bank_prizes').update({ status: 'cancelled' }).eq('id', id).eq('status', 'pledged');
  finesBack('bank', error?.message);
}
