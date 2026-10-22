'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';

const back = (id: string, error?: string) => {
  revalidatePath(`/market/desk/${id}`);
  revalidatePath('/market/desk');
  revalidatePath('/market');
  if (error) redirect(`/market/desk/${id}?error=${encodeURIComponent(error)}`);
};

export async function openDesk(form: FormData) {
  const me = await getMe();
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
 * Put an asset on the table. asset = "player:123" or "pick:45"; from/to are team ids.
 * The database checks ownership and that your team is on one side of the move.
 */
export async function addItem(deskId: string, form: FormData) {
  const me = await getMe();
  if (!me) return;
  const [kind, raw] = String(form.get('asset') || '').split(':');
  const from = Number(form.get('from'));
  const to = Number(form.get('to'));
  if (!raw || !from || !to) return back(deskId, 'Pick an asset and who it goes to.');
  if (from === to) return back(deskId, 'An asset has to move between two different teams.');
  const supabase = await createClient();
  const { error } = await supabase.from('desk_items').insert({
    desk_id: deskId, from_team_id: from, to_team_id: to, added_by_team: me.team_id,
    player_id: kind === 'player' ? Number(raw) : null, pick_id: kind === 'pick' ? Number(raw) : null,
  });
  back(deskId, error?.message);
}

export async function removeItem(deskId: string, itemId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('desk_items').delete().eq('id', itemId);
  back(deskId, error?.message);
}

export async function joinDesk(deskId: string) {
  const me = await getMe();
  if (!me) return;
  const supabase = await createClient();
  const { error } = await supabase.from('desk_teams').insert({ desk_id: deskId, team_id: me.team_id });
  back(deskId, error && !/duplicate/.test(error.message) ? error.message : undefined);
}

export async function leaveDesk(deskId: string) {
  const me = await getMe();
  if (!me) return;
  const supabase = await createClient();
  const { error } = await supabase.from('desk_teams').delete().eq('desk_id', deskId).eq('team_id', me.team_id);
  back(deskId, error?.message);
}

export async function setAccepted(deskId: string, accepted: boolean) {
  const me = await getMe();
  if (!me) return;
  const supabase = await createClient();
  const { error } = await supabase.from('desk_teams')
    .update({ accepted, accepted_at: accepted ? new Date().toISOString() : null })
    .eq('desk_id', deskId).eq('team_id', me.team_id);
  back(deskId, error?.message);
}

export async function deskComment(deskId: string, form: FormData) {
  const me = await getMe();
  const body = String(form.get('body') || '').trim();
  if (!me || !body) return;
  const supabase = await createClient();
  const { error } = await supabase.from('desk_comments').insert({ desk_id: deskId, team_id: me.team_id, body });
  back(deskId, error?.message);
}

export async function voteLopsided(deskId: string) {
  const me = await getMe();
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
