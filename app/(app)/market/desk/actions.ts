'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCoach } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';

const back = (id: string, error?: string) => {
  revalidatePath(`/market/desk/${id}`);
  revalidatePath('/market/desk');
  revalidatePath('/market');
  if (error) redirect(`/market/desk/${id}?error=${encodeURIComponent(error)}`);
};

export async function openDesk(form: FormData) {
  const me = await getCoach();
  if (!me) return;
  const title = String(form.get('title') || '').trim();
  const details = String(form.get('details') || '').trim() || null;
  if (title.length < 3) redirect('/market/desk?error=' + encodeURIComponent('Say what you’re after.'));
  const supabase = await createClient();
  const { data, error } = await supabase.from('desks').insert({ team_id: me.team_id, title, details }).select('id').single();
  if (error) redirect('/market/desk?error=' + encodeURIComponent(error.message));
  revalidatePath('/market/desk');
  redirect(`/market/desk/${data!.id}`);
}

/**
 * Put an asset on the table. asset = "player:123", "pick:45" or "kt:2500"; from/to are team ids.
 * The database checks ownership and that your team is on one side of the move.
 */
export async function addItem(deskId: string, form: FormData) {
  const me = await getCoach();
  if (!me) return;
  const [kind, raw] = String(form.get('asset') || '').split(':');
  const from = Number(form.get('from'));
  const to = Number(form.get('to'));
  if (!raw || !from || !to) return back(deskId, 'Pick an asset and who it goes to.');
  if (from === to) return back(deskId, 'An asset has to move between two different teams.');
  const supabase = await createClient();
  const { error } = await supabase.from('desk_items').insert({
    desk_id: deskId, from_team_id: from, to_team_id: to, added_by_team: me.team_id,
    player_id: kind === 'player' ? Number(raw) : null, pick_id: kind === 'pick' ? Number(raw) : null, kt: kind === 'kt' ? Number(raw) : null,
  });
  back(deskId, error?.message);
}

export async function removeItem(deskId: string, itemId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('desk_items').delete().eq('id', itemId);
  back(deskId, error?.message);
}

export async function joinDesk(deskId: string) {
  const me = await getCoach();
  if (!me) return;
  const supabase = await createClient();
  const { error } = await supabase.from('desk_teams').insert({ desk_id: deskId, team_id: me.team_id });
  back(deskId, error && !/duplicate/.test(error.message) ? error.message : undefined);
}

export async function leaveDesk(deskId: string) {
  const me = await getCoach();
  if (!me) return;
  const supabase = await createClient();
  const { error } = await supabase.from('desk_teams').delete().eq('desk_id', deskId).eq('team_id', me.team_id);
  back(deskId, error?.message);
}

export async function setAccepted(deskId: string, accepted: boolean) {
  const me = await getCoach();
  if (!me) return;
  const supabase = await createClient();
  const { error } = await supabase.from('desk_teams')
    .update({ accepted, accepted_at: accepted ? new Date().toISOString() : null })
    .eq('desk_id', deskId).eq('team_id', me.team_id);
  back(deskId, error?.message);
}

export async function deskComment(deskId: string, form: FormData) {
  const me = await getCoach();
  const body = String(form.get('body') || '').trim();
  if (!me || !body) return;
  const supabase = await createClient();
  const { error } = await supabase.from('desk_comments').insert({ desk_id: deskId, team_id: me.team_id, body });
  back(deskId, error?.message);
}

export async function voteLopsided(deskId: string) {
  const me = await getCoach();
  if (!me) return;
  const supabase = await createClient();
  const { error } = await supabase.from('desk_votes').insert({ desk_id: deskId, team_id: me.team_id });
  back(deskId, error && !/duplicate/.test(error.message) ? error.message : undefined);
}

export async function closeDesk(deskId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('desks').update({ status: 'closed' }).eq('id', deskId).in('status', ['open', 'agreed']);
  back(deskId, error?.message);
}

/** Commish: move every asset in one transaction. */
export async function executeDesk(deskId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('execute_desk', { p_desk: deskId });
  revalidatePath('/clubhouse', 'layout');
  revalidatePath('/draft');
  back(deskId, error?.message);
}

export async function vetoDesk(deskId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('veto_desk', { p_desk: deskId });
  back(deskId, error?.message);
}

/** Offer tokens (and optionally ask for nothing else) for another club's player: opens a desk with both sides on it. */
export async function offerKtForPlayer(form: FormData) {
  const me = await getCoach();
  if (!me) redirect('/login');
  const playerId = Number(form.get('player'));
  const kt = Math.floor(Number(form.get('kt')) || 0);
  if (!playerId || kt < 1) redirect('/market?error=' + encodeURIComponent('Pick a player and an amount of KT.'));
  const supabase = await createClient();
  const { data: sq } = await supabase.from('squad').select('team_id, players(name)').eq('player_id', playerId).maybeSingle();
  if (!sq || sq.team_id === me.team_id) redirect('/market?error=' + encodeURIComponent('He needs to be on another club’s list.'));
  const name = (sq.players as unknown as { name: string } | null)?.name ?? 'a player';
  const { data: desk, error } = await supabase.from('desks').insert({ team_id: me.team_id, title: `${kt.toLocaleString('en-AU')} KT for ${name}`, details: null }).select('id').single();
  if (error || !desk) redirect('/market?error=' + encodeURIComponent(error?.message ?? 'Couldn’t open a desk'));
  const a = await supabase.from('desk_items').insert({ desk_id: desk.id, from_team_id: sq.team_id, to_team_id: me.team_id, added_by_team: me.team_id, player_id: playerId });
  const b = a.error ? a : await supabase.from('desk_items').insert({ desk_id: desk.id, from_team_id: me.team_id, to_team_id: sq.team_id, added_by_team: me.team_id, kt });
  if (b.error) { await supabase.from('desks').update({ status: 'closed' }).eq('id', desk.id); redirect('/market?error=' + encodeURIComponent(b.error.message)); }
  await supabase.from('desk_teams').update({ accepted: true, accepted_at: new Date().toISOString() }).eq('desk_id', desk.id).eq('team_id', me.team_id);
  revalidatePath('/market');
  redirect(`/market/desk/${desk.id}`);
}
