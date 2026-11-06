'use server';
// Side comps: entries (opt-in, capped), the commish's settings, and the prize ledger (minted or staked).
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCoach } from '@/lib/data';
import { COMP_BY_KEY, COMP_SEASON, DEFAULT_SETTINGS, OPT_IN, type CompKey, type CompSettings, type Prize, type PrizeKind } from '@/lib/comps';

type Res = { ok: boolean; error?: string };
const MIG = 'Side comps need supabase/migrations/0020_matchday_comps_msd_values.sql run in Supabase first.';
const err = (m: string): Res => ({ ok: false, error: /comp_|relation|does not exist/.test(m) ? MIG : m });
const done = (): Res => { revalidatePath('/live/comps'); revalidatePath('/live'); return { ok: true }; };

export interface CompsState { ready: boolean; settings: CompSettings; entries: { comp: CompKey; team_id: number }[]; prizes: Prize[] }

export async function loadComps(): Promise<CompsState> {
  const supabase = await createClient();
  const [s, e, p] = await Promise.all([
    supabase.from('comp_settings').select('*').eq('season', COMP_SEASON).maybeSingle(),
    supabase.from('comp_entries').select('comp, team_id').eq('season', COMP_SEASON),
    supabase.from('comp_prizes').select('*').eq('season', COMP_SEASON).order('place').order('id'),
  ]);
  if (s.error || e.error || p.error) return { ready: false, settings: DEFAULT_SETTINGS, entries: [], prizes: [] };
  return { ready: true, settings: (s.data as CompSettings | null) ?? DEFAULT_SETTINGS, entries: (e.data ?? []) as CompsState['entries'], prizes: (p.data ?? []) as Prize[] };
}

export async function joinComp(comp: CompKey, join: boolean): Promise<Res> {
  const me = await getCoach();
  if (!me) return { ok: false, error: 'Only coaches can enter comps.' };
  if (!OPT_IN.includes(comp)) return { ok: false, error: `${COMP_BY_KEY[comp]?.name ?? 'That comp'} is league-wide.` };
  const st = await loadComps();
  if (!st.ready) return { ok: false, error: MIG };
  if (st.settings.locks_at && Date.parse(st.settings.locks_at) < Date.now() && !me.is_commish) return { ok: false, error: 'Entries are locked for the season.' };
  const supabase = await createClient();
  if (!join) {
    const staked = st.prizes.some((p) => p.comp === comp && p.staked_by === me.team_id && p.status === 'pool');
    if (staked) return { ok: false, error: 'Take back your stake first.' };
    const r = await supabase.from('comp_entries').delete().eq('season', COMP_SEASON).eq('comp', comp).eq('team_id', me.team_id);
    return r.error ? err(r.error.message) : done();
  }
  if (!st.settings.enabled.includes(comp)) return { ok: false, error: 'The commish hasn’t switched that comp on this season.' };
  const mine = st.entries.filter((x) => x.team_id === me.team_id && OPT_IN.includes(x.comp));
  if (mine.length >= st.settings.cap) return { ok: false, error: `You can enter ${st.settings.cap} side comp${st.settings.cap === 1 ? '' : 's'}. Leave one first.` };
  const r = await supabase.from('comp_entries').insert({ season: COMP_SEASON, comp, team_id: me.team_id });
  return r.error && !/duplicate/.test(r.error.message) ? err(r.error.message) : done();
}

export async function saveCompSettings(cap: number, enabled: CompKey[], locksAt: string | null): Promise<Res> {
  const me = await getCoach();
  if (!me?.is_commish) return { ok: false, error: 'Only the commish can change the comp menu.' };
  const supabase = await createClient();
  const r = await supabase.from('comp_settings').upsert({
    season: COMP_SEASON, cap: Math.max(0, Math.min(OPT_IN.length, Math.round(cap))), enabled: enabled.filter((k) => OPT_IN.includes(k)),
    locks_at: locksAt || null, updated_at: new Date().toISOString(),
  }, { onConflict: 'season' });
  return r.error ? err(r.error.message) : done();
}

/** Add a prize. The commish mints anything; a coach can stake their own pick, player or tokens into a comp they've entered. */
export async function addPrize(input: { comp: CompKey; source: 'minted' | 'staked'; kind: PrizeKind; pick_id?: number | null; player_id?: number | null; amount?: number | null; label: string; place?: number }): Promise<Res> {
  const me = await getCoach();
  if (!me) return { ok: false, error: 'Only coaches can add prizes.' };
  const supabase = await createClient();
  const label = input.label.trim().slice(0, 120);
  if (!label) return { ok: false, error: 'Give the prize a name.' };
  const place = Math.max(1, Math.min(10, Math.round(input.place ?? 1)));
  if (input.source === 'minted') {
    if (!me.is_commish) return { ok: false, error: 'Only the commish can mint prizes.' };
  } else {
    if (!['pick', 'player', 'tokens'].includes(input.kind)) return { ok: false, error: 'You can stake a pick, a player or tokens.' };
    const e = await supabase.from('comp_entries').select('team_id').eq('season', COMP_SEASON).eq('comp', input.comp).eq('team_id', me.team_id).maybeSingle();
    if (e.error) return err(e.error.message);
    if (!e.data && COMP_BY_KEY[input.comp] && !COMP_BY_KEY[input.comp].everyone) return { ok: false, error: 'Enter the comp before you stake into it.' };
    if (input.kind === 'pick') {
      const pk = await supabase.from('picks').select('owner_team_id').eq('id', input.pick_id ?? -1).maybeSingle();
      if (pk.data?.owner_team_id !== me.team_id) return { ok: false, error: 'You can only stake your own picks.' };
    }
    if (input.kind === 'player') {
      const sq = await supabase.from('squad').select('team_id').eq('player_id', input.player_id ?? -1).maybeSingle();
      if (sq.data?.team_id !== me.team_id) return { ok: false, error: 'You can only stake your own players.' };
    }
    if (input.kind === 'tokens') {
      const amt = Math.round(input.amount ?? 0);
      if (amt <= 0) return { ok: false, error: 'How many tokens?' };
      const bal = await supabase.rpc('token_balance', { t: me.team_id });
      if (!bal.error && (bal.data as number) < amt) return { ok: false, error: `You only have ${bal.data} tokens.` };
    }
    // An asset can only sit in one pool at a time.
    const dup = await supabase.from('comp_prizes').select('id').eq('season', COMP_SEASON).in('status', ['pool', 'awarded'])
      .or(input.kind === 'pick' ? `pick_id.eq.${input.pick_id}` : input.kind === 'player' ? `player_id.eq.${input.player_id}` : 'id.eq.-1');
    if ((dup.data ?? []).length) return { ok: false, error: 'That’s already staked in a comp.' };
  }
  const r = await supabase.from('comp_prizes').insert({
    season: COMP_SEASON, comp: input.comp, source: input.source, kind: input.kind, label, place,
    pick_id: input.kind === 'pick' ? input.pick_id ?? null : null, player_id: input.kind === 'player' ? input.player_id ?? null : null,
    amount: input.amount != null ? Math.round(input.amount) : null, staked_by: input.source === 'staked' ? me.team_id : null,
  });
  return r.error ? err(r.error.message) : done();
}

export async function removePrize(id: number): Promise<Res> {
  const me = await getCoach();
  if (!me) return { ok: false, error: 'Sign in.' };
  const supabase = await createClient();
  const r = await supabase.from('comp_prizes').delete().eq('id', id).eq('status', 'pool');
  return r.error ? err(r.error.message) : done();
}

/** Commish: name the winner of a prize (awarded), then hand it over (transferred), or return a stake / void it. */
export async function settlePrize(id: number, action: 'award' | 'transfer' | 'return' | 'void' | 'reopen', winner?: number): Promise<Res> {
  const me = await getCoach();
  if (!me?.is_commish) return { ok: false, error: 'Only the commish settles prizes.' };
  const supabase = await createClient();
  const q = await supabase.from('comp_prizes').select('*').eq('id', id).maybeSingle();
  if (q.error || !q.data) return err(q.error?.message ?? 'Prize not found.');
  const p = q.data as Prize;
  const now = new Date().toISOString();
  if (action === 'award') {
    if (!winner) return { ok: false, error: 'Pick a winner.' };
    const r = await supabase.from('comp_prizes').update({ winner_id: winner, status: 'awarded', settled_at: now }).eq('id', id);
    return r.error ? err(r.error.message) : done();
  }
  if (action === 'reopen' || action === 'return' || action === 'void') {
    const r = await supabase.from('comp_prizes').update({ status: action === 'reopen' ? 'pool' : action === 'return' ? 'returned' : 'void', winner_id: null, settled_at: action === 'reopen' ? null : now }).eq('id', id);
    return r.error ? err(r.error.message) : done();
  }
  // transfer
  const to = p.winner_id;
  if (!to) return { ok: false, error: 'Award it to someone first.' };
  const comp = COMP_BY_KEY[p.comp]?.name ?? p.comp;
  if (p.kind === 'pick' && p.pick_id) {
    const r = await supabase.from('picks').update({ owner_team_id: to }).eq('id', p.pick_id);
    if (r.error) return err(r.error.message);
  } else if (p.kind === 'player' && p.player_id) {
    const r = await supabase.from('squad').update({ team_id: to, is_keeper: false, is_rookie_keeper: false, acquired_how: `Won in the ${comp}`, acquired_season: COMP_SEASON }).eq('player_id', p.player_id);
    if (r.error) return err(r.error.message);
  } else if (p.kind === 'tokens' && p.amount) {
    if (p.staked_by) { const d = await supabase.rpc('grant_tokens', { t: p.staked_by, amount: -p.amount, why: `Stake lost: ${comp}` }); if (d.error) return err(d.error.message); }
    const g = await supabase.rpc('grant_tokens', { t: to, amount: p.amount, why: `Won: ${comp}` });
    if (g.error) return err(g.error.message);
  } else if (p.kind === 'bonus_pick') {
    const r = await supabase.from('picks').insert({ year: COMP_SEASON, round: Math.max(1, Math.min(3, p.amount ?? 1)), overall: null, original_team_id: to, owner_team_id: to, is_optional: true, kind: 'msd' });
    if (r.error) return err(r.error.message);
  }
  // msd_bump is applied when the commish sets the mid-season draft order; trophies and other prizes just get recorded.
  const r = await supabase.from('comp_prizes').update({ status: 'transferred', settled_at: now }).eq('id', id);
  revalidatePath('/draft/msd');
  return r.error ? err(r.error.message) : done();
}
