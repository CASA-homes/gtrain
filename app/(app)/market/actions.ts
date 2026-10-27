'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCoach } from '@/lib/data';
import { pickLabel, pickValue } from '@/lib/picks';

export async function createListing(form: FormData) {
  const me = await getCoach();
  if (!me) return;
  const kind = String(form.get('kind')) as 'trade' | 'sale' | 'auction';
  const hours = Number(form.get('hours') || 48);
  const supabase = await createClient();
  const { data, error } = await supabase.from('listings').insert({
    player_id: Number(form.get('player_id')),
    team_id: me.team_id,
    kind,
    asking: String(form.get('asking') || '') || null,
    minimum: String(form.get('minimum') || '') || null,
    open_to: String(form.get('open_to') || '') || null,
    reserve_pts: Number(form.get('reserve_pts') || 0) || null,
    ends_at: kind === 'auction' ? new Date(Date.now() + hours * 3600_000).toISOString() : null,
  }).select('id').single();
  if (error) redirect(`/market/new?error=${encodeURIComponent(error.message)}`);
  revalidatePath('/market');
  redirect(`/market/${data!.id}`);
}

export async function makeOffer(listingId: string, form: FormData) {
  const me = await getCoach();
  if (!me) return;
  const supabase = await createClient();
  const pickId = Number(form.get('pick_id') || 0);
  let offer = String(form.get('offer') || '').trim();
  let points: number | null = null;
  if (pickId) {
    const { data: pick } = await supabase.from('picks').select('year, round, overall, owner_team_id').eq('id', pickId).single();
    if (pick && pick.owner_team_id === me.team_id) {
      offer = [pickLabel(pick), offer].filter(Boolean).join(' + ');
      points = pickValue(pick);
    }
  }
  if (!offer) return;
  await supabase.from('offers').insert({ listing_id: listingId, team_id: me.team_id, offer, points, message: String(form.get('message') || '') || null });
  revalidatePath(`/market/${listingId}`);
}

export async function comment(listingId: string, form: FormData) {
  const me = await getCoach();
  const body = String(form.get('body') || '').trim();
  if (!me || !body) return;
  const supabase = await createClient();
  await supabase.from('listing_comments').insert({ listing_id: listingId, team_id: me.team_id, body });
  revalidatePath(`/market/${listingId}`);
}

/** Seller accepts an offer: listing goes pending and a trade is sent to the commish for approval. */
export async function acceptOffer(listingId: string, offerId: string) {
  const me = await getCoach();
  if (!me) return;
  const supabase = await createClient();
  const { data: l } = await supabase.from('listings').select('id, team_id, players(name)').eq('id', listingId).single();
  const { data: o } = await supabase.from('offers').select('*').eq('id', offerId).single();
  if (!l || !o || l.team_id !== me.team_id) return;
  const playerName = (l.players as unknown as { name: string }).name;
  await supabase.from('offers').update({ status: 'accepted' }).eq('id', offerId);
  await supabase.from('listings').update({ status: 'pending' }).eq('id', listingId);
  await supabase.from('trades').insert({ team_a: me.team_id, team_b: o.team_id, a_gives: playerName, b_gives: o.offer, b_points: o.points, listing_id: listingId });
  revalidatePath('/market');
  revalidatePath(`/market/${listingId}`);
}

export async function decideTrade(tradeId: string, approve: boolean) {
  const me = await getCoach();
  if (!me?.is_commish) return;
  const supabase = await createClient();
  await supabase.from('trades').update({ status: approve ? 'approved' : 'vetoed', decided_by: me.user_id, decided_at: new Date().toISOString() }).eq('id', tradeId);
  revalidatePath('/market');
}

export async function voteVeto(tradeId: string) {
  const me = await getCoach();
  if (!me) return;
  const supabase = await createClient();
  await supabase.from('trade_votes').insert({ trade_id: tradeId, team_id: me.team_id, veto: true });
  revalidatePath('/market');
}

export async function postWish(form: FormData) {
  const me = await getCoach();
  const want = String(form.get('want') || '').trim();
  if (!me || !want) return;
  const supabase = await createClient();
  await supabase.from('wishes').insert({ team_id: me.team_id, want, offering: String(form.get('offering') || '') || null, tag: String(form.get('tag') || 'Player') });
  revalidatePath('/market');
}

/** Seller or commish takes a listing or live auction down. */
export async function withdrawListing(listingId: string) {
  const me = await getCoach();
  if (!me) return;
  const supabase = await createClient();
  await supabase.from('listings').update({ status: 'withdrawn' }).eq('id', listingId).in('status', ['open', 'pending']);
  revalidatePath('/market');
  revalidatePath(`/market/${listingId}`);
  redirect('/market');
}

/** Owner or commish takes a wish down. */
export async function closeWish(wishId: string) {
  const me = await getCoach();
  if (!me) return;
  const supabase = await createClient();
  await supabase.from('wishes').update({ status: 'closed' }).eq('id', wishId);
  revalidatePath('/market');
}
