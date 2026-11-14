'use server';
// Every change goes through a database function (migrations 0030–0033), which checks the rules and who's allowed.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, currentLeagueId } from '@/lib/supabase/server';
import { getCoach, getMe } from '@/lib/data';

export interface Result { ok: boolean; message: string }

async function run(fn: string, args: Record<string, unknown>, done: (data: unknown) => string): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, message: 'Sign in first.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, message: error.message.replace(/^.*?ERROR:\s*/, '') };
  revalidatePath('/', 'layout');
  return { ok: true, message: done(data) };
}

const kt = (n: unknown) => `${Number(n).toLocaleString('en-AU')} KT`;

// Coaches
export async function extendPlayer(contractId: number, years: number, tier: string) {
  if (!(await getCoach())) return { ok: false, message: 'Guests can only look.' };
  return run('kc_extend', { cid: contractId, p_years: years, new_tier: tier }, (s) => `Extended: ${years} years at $${Number(s)}k a year from next season.`);
}
export async function setTier(contractId: number, tier: string) {
  return run('kc_set_tier', { cid: contractId, new_tier: tier }, () => 'Release clause updated.');
}
export async function releasePlayer(contractId: number) {
  return run('kc_release', { cid: contractId }, (d) => `Released. $${d}k of dead money stays on your cap this season. He's now a free agent.`);
}
export async function listAuction(contractId: number, reserve: number, hours: number) {
  return run('kc_list_auction', { cid: contractId, reserve: Math.max(0, Math.round(reserve)), hours: Math.round(hours) }, () => 'Listed. The auction is live on the Transfer Market.');
}
export async function cancelAuction(auctionId: number) {
  return run('kc_cancel_auction', { aid: auctionId }, () => 'Auction cancelled.');
}
export async function bid(auctionId: number, amount: number) {
  return run('kc_bid', { aid: auctionId, amount: Math.round(amount) }, () => `Bid of ${kt(amount)} placed.`);
}
export async function settleAuction(auctionId: number) {
  return run('kc_settle', { aid: auctionId }, (d) => (d === 'sold' ? 'Sold. He joins the winner at season end.' : d === 'unsold' ? 'No valid bids: he stays put.' : 'Auction closed.'));
}
export async function buyClause(contractId: number) {
  return run('kc_buy', { cid: contractId }, () => 'Clause paid. His club has 24 hours to match. If they don’t, he joins you at season end on the rest of his contract.');
}
export async function matchClaim(claimId: number) {
  return run('kc_match', { claim_id: claimId }, (t) => `Matched. He stays, the buyer gets their tokens back, and his clause is now ${t === 'high' ? 'High' : 'off (no clause)'}.`);
}
export async function completeClaim(claimId: number) {
  return run('kc_complete_claim', { claim_id: claimId }, (d) => (d === 'completed' ? 'Done. He finishes the season here, then moves. Tokens paid, less the levy.' : 'The buy fell through and the buyer was refunded.'));
}
export async function acceptOffer(offerId: number) {
  return run('kc_accept_offer', { oid: offerId }, () => 'Offer accepted. The fee is in your bank. He plays out the season with you, then moves.');
}
export async function lockIn(teamId: number) {
  return run('kc_lockin', { t: teamId }, (d) => (d === 'deficit' ? 'Locked in with a deficit. Next year’s keeper cap drops by that amount.' : 'Locked in: you’re under the keeper cap.'));
}
/** Offer for a contracted player: opens a trade desk with him coming to you. */
export async function offerForPlayer(playerId: number, ownerTeamId: number, name: string) {
  const me = await getCoach();
  if (!me) redirect('/login');
  const supabase = await createClient();
  const { data, error } = await supabase.from('desks').insert({ team_id: me.team_id, title: `Offer for ${name}`, details: null }).select('id').single();
  if (error || !data) redirect(`/players/${playerId}?error=${encodeURIComponent(error?.message ?? 'Couldn’t open a desk')}`);
  await supabase.from('desk_items').insert({ desk_id: data.id, from_team_id: ownerTeamId, to_team_id: me.team_id, added_by_team: me.team_id, player_id: playerId, pick_id: null });
  revalidatePath('/market/desk');
  redirect(`/market/desk/${data.id}`);
}
export async function tableOffer(faId: number, years: number, salary: number, tier: string, sweet: number, pickIds: number[]) {
  return run('kc_offer', { faid: faId, p_years: years, p_salary: Math.round(salary), new_tier: tier, sweet: Math.round(sweet), picks_in: pickIds }, (d) => `Offer tabled. Score ${d}.`);
}
export async function closeFreeAgent(faId: number) {
  return run('kc_close_fa', { faid: faId }, (d) => (d === 'signed' ? 'Closed: the best offer signed him.' : 'Closed with no offers: he goes back into the draft pool.'));
}

// Commish
export async function seedContracts() {
  return run('kc_seed', {}, (n) => `${n} contracts set up and every club has its starting bank.`);
}
export async function setWindow(open: boolean, kind: string, hours: number) {
  return run('kc_window', { p_open: open, p_kind: kind, p_hours: Math.round(hours) }, () => (open ? 'Window open.' : 'Window closed.'));
}
export async function grantTokens(teamId: number, amount: number, why: string) {
  return run('kc_grant', { t: teamId, amount: Math.round(amount), why }, () => `${amount > 0 ? 'Gave' : 'Took'} ${kt(Math.abs(amount))}.`);
}
export async function chargeTax() {
  return run('kc_charge_tax', {}, (d) => `Luxury tax charged: ${kt(d)} shared among the bottom three.`);
}
export async function startMidseason() {
  return run('kc_start_midseason', {}, (n) => `Mid-season week started. ${n} final-year players are now pending free agents.`);
}
export async function signDraftees() {
  return run('kc_sign_draftees', {}, (n) => `${n} draftees signed on one-season deals.`);
}
export async function rollover() {
  return run('kc_rollover', {}, (n) => `New season started. ${n} players are now free agents.`);
}
export async function faDeadline(hours: number) {
  return run('kc_fa_deadline', { hours: Math.round(hours) }, () => `Free-agent offers close in ${hours} hours.`);
}
export async function saveSettings(patch: Record<string, number | boolean>): Promise<Result> {
  const me = await getMe();
  if (!me?.is_commish) return { ok: false, message: 'Only the commish can change settings.' };
  const allowed = ['keeper_cap_k', 'season_cap_k', 'tax_line_k', 'tax_kt_per_k', 'start_kt', 'max_years', 'floor_def', 'floor_mid', 'floor_ruc', 'floor_fwd',
    'clause_std', 'clause_high', 'high_pct', 'none_pct', 'home_grown_pct', 'levy_pct', 'max_buys', 'deficit_max_k', 'hold_back_k'];
  const clean = Object.fromEntries(Object.entries(patch).filter(([k, v]) => allowed.includes(k) && Number.isFinite(Number(v))).map(([k, v]) => [k, Math.round(Number(v))]));
  const supabase = await createClient();
  const { error } = await supabase.from('kc_settings').update({ ...clean, updated_at: new Date().toISOString() }).eq('league_id', await currentLeagueId());
  if (error) return { ok: false, message: error.message };
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Settings saved.' };
}
