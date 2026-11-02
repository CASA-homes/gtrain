'use server';
// Battle desk: token cash, buying tokens from the commish, and club-v-club challenges with stakes.
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/data';
import { COMP, cleanSettings, customResults, liveRound, matchesInPlay, type GameSettings } from '@/lib/aflw';
import { createGame, loadGame, loadRoles } from './actions';

type Res = { ok: boolean; error?: string; id?: number };
export interface Stake { tokens: number; picks: number[]; players: number[]; note?: string }
export interface Challenge {
  id: number; comp: string; round: number; from_team: number; to_team: number; settings: GameSettings; stake: Stake; counter_stake: Stake | null; message: string | null;
  status: 'offered' | 'accepted' | 'declined' | 'cancelled' | 'settled'; game_id: number | null; winner_team: number | null; assets_done: boolean; created_at: string;
}
export interface TokenRequest { id: number; team_id: number; amount: number; note: string | null; status: 'pending' | 'approved' | 'declined'; created_at: string }
export interface Desk { ready: boolean; balances: Record<number, number>; ledger: { delta: number; reason: string; created_at: string }[]; requests: TokenRequest[]; challenges: Challenge[] }

const needMigration = (m: string) => /token_|challenge|function|relation/i.test(m) ? 'The battle desk needs supabase/migrations/0018_battle_desk.sql run first.' : m;
const cleanStake = (s: Partial<Stake> | null | undefined): Stake => ({
  tokens: Math.max(0, Math.min(100000, Math.round(Number(s?.tokens) || 0))),
  picks: [...new Set((s?.picks ?? []).map(Number))].filter(Number.isInteger).slice(0, 4),
  players: [...new Set((s?.players ?? []).map(Number))].filter(Number.isInteger).slice(0, 4),
  note: String(s?.note ?? '').trim().slice(0, 120) || undefined,
});

export async function loadDesk(): Promise<Desk> {
  const me = await getMe();
  const supabase = await createClient();
  const [l, r, c] = await Promise.all([
    supabase.from('token_ledger').select('team_id, delta, reason, created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('token_requests').select('id, team_id, amount, note, status, created_at').order('created_at', { ascending: false }).limit(40),
    supabase.from('challenges').select('id, comp, round, from_team, to_team, settings, stake, counter_stake, message, status, game_id, winner_team, assets_done, created_at').order('created_at', { ascending: false }).limit(40),
  ]);
  if (l.error || r.error || c.error) return { ready: false, balances: {}, ledger: [], requests: [], challenges: [] };
  const balances: Record<number, number> = {};
  for (const x of l.data ?? []) balances[x.team_id] = (balances[x.team_id] ?? 0) + x.delta;
  return {
    ready: true, balances,
    ledger: (l.data ?? []).filter((x) => x.team_id === me?.team_id).slice(0, 8),
    requests: ((r.data ?? []) as TokenRequest[]).filter((x) => me?.is_commish || x.team_id === me?.team_id),
    challenges: (c.data ?? []) as Challenge[],
  };
}

export async function requestTokens(amount: number, note: string): Promise<Res> {
  const me = await getMe();
  if (!me || me.is_guest) return { ok: false, error: 'Only coaches can buy tokens.' };
  const a = Math.round(Number(amount));
  if (!(a >= 1 && a <= 100000)) return { ok: false, error: 'Pick an amount between 1 and 100,000.' };
  const supabase = await createClient();
  const res = await supabase.from('token_requests').insert({ team_id: me.team_id, amount: a, note: note.trim().slice(0, 200) || null });
  return res.error ? { ok: false, error: needMigration(res.error.message) } : { ok: true };
}

export async function decideRequest(id: number, approve: boolean): Promise<Res> {
  const supabase = await createClient();
  const res = await supabase.rpc('decide_token_request', { rid: id, approve });
  return res.error ? { ok: false, error: needMigration(res.error.message) } : { ok: true };
}

export async function grantTokens(teamId: number, amount: number, why: string): Promise<Res> {
  const supabase = await createClient();
  const res = await supabase.rpc('grant_tokens', { t: teamId, amount: Math.round(amount), why });
  return res.error ? { ok: false, error: needMigration(res.error.message) } : { ok: true };
}

/** Offer another club a custom game for the current round, with an optional stake. */
export async function offerChallenge(toTeam: number, settings: Partial<GameSettings>, stake: Partial<Stake>, ask: Partial<Stake>, message: string): Promise<Res> {
  const me = await getMe();
  if (!me || me.is_guest) return { ok: false, error: 'Only coaches can send challenges.' };
  if (toTeam === me.team_id) return { ok: false, error: 'Pick another club.' };
  const round = await liveRound();
  if (round.status === 'completed') return { ok: false, error: 'This round is over. Challenges open again when the next round is up.' };
  const s = cleanSettings({ ...settings }, round.games.map((g) => g.id));
  const st = cleanStake(stake), ak = cleanStake(ask);
  const supabase = await createClient();
  if (st.tokens > 0) {
    const bal = await supabase.rpc('token_balance', { t: me.team_id });
    if (bal.error) return { ok: false, error: needMigration(bal.error.message) };
    if ((bal.data ?? 0) < st.tokens) return { ok: false, error: `You only have ${bal.data ?? 0} tokens.` };
  }
  if (st.picks.length) {
    const own = await supabase.from('picks').select('id').in('id', st.picks).eq('owner_team_id', me.team_id);
    if (!own.error && (own.data ?? []).length !== st.picks.length) return { ok: false, error: 'You can only stake picks you own.' };
  }
  const res = await supabase.from('challenges').insert({ comp: COMP, round: round.round, from_team: me.team_id, to_team: toTeam, settings: s, stake: st, counter_stake: ak.picks.length || ak.players.length ? ak : null, message: message.trim().slice(0, 200) || null }).select('id').single();
  return res.error ? { ok: false, error: needMigration(res.error.message) } : { ok: true, id: res.data.id };
}

async function getChallenge(id: number) {
  const supabase = await createClient();
  const r = await supabase.from('challenges').select('*').eq('id', id).maybeSingle();
  return (r.data ?? null) as Challenge | null;
}

/** The challenged club accepts (game created, tokens held) or declines. */
export async function respondChallenge(id: number, accept: boolean): Promise<Res> {
  const me = await getMe();
  if (!me) return { ok: false, error: 'Sign in first.' };
  const c = await getChallenge(id);
  if (!c || c.status !== 'offered') return { ok: false, error: 'That challenge is no longer open.' };
  const supabase = await createClient();
  if (!accept) { const r = await supabase.rpc('close_challenge', { cid: id, how: 'declined' }); return r.error ? { ok: false, error: needMigration(r.error.message) } : { ok: true }; }
  if (c.to_team !== me.team_id && !me.is_commish) return { ok: false, error: 'Only the challenged club can accept.' };
  const g = await createGame(c.round, 'custom', `Challenge #${c.id}`, [c.from_team, c.to_team], { settings: c.settings });
  if (!g.ok || !g.id) return g;
  const r = await supabase.rpc('accept_challenge', { cid: id, gid: g.id });
  if (r.error) { await supabase.from('mini_games').delete().eq('id', g.id); return { ok: false, error: needMigration(r.error.message) }; }
  return { ok: true, id: g.id };
}

export async function cancelChallenge(id: number): Promise<Res> {
  const supabase = await createClient();
  const r = await supabase.rpc('close_challenge', { cid: id, how: 'cancelled' });
  return r.error ? { ok: false, error: needMigration(r.error.message) } : { ok: true };
}

/** Once every match in play is final: work out the winner from the game and pay out the tokens. */
export async function settleChallenge(id: number): Promise<Res> {
  const c = await getChallenge(id);
  if (!c || c.status !== 'accepted' || !c.game_id) return { ok: false, error: 'That challenge isn’t waiting on a result.' };
  const { game, picks } = await loadGame(c.game_id);
  if (!game || !game.settings) return { ok: false, error: 'The challenge’s game is missing.' };
  if (game.status !== 'done') return { ok: false, error: 'The draft isn’t finished yet.' };
  const round = await liveRound(game.round);
  if (matchesInPlay(game.settings, round.games).some((g) => g.status !== 'completed')) return { ok: false, error: 'Not every match in this game is final yet.' };
  const byId = new Map(round.players.map((p) => [p.id, p]));
  const gameBySquad = new Map(round.games.flatMap((g) => [[g.homeId, g], [g.awayId, g]] as const));
  const res = customResults(game.settings, game.order, picks, await loadRoles(game.id), byId, gameBySquad, round.games);
  const [a, b] = res;
  const key = (x: typeof a) => (game.settings!.mode === 'duels' ? x.points * 10000 + x.score : x.score);
  const winner = key(a) === key(b) ? null : key(a) > key(b) ? a.team : b.team;
  const supabase = await createClient();
  const r = await supabase.rpc('settle_challenge', { cid: id, winner });
  return r.error ? { ok: false, error: needMigration(r.error.message) } : { ok: true };
}

export async function markAssetsDone(id: number): Promise<Res> {
  const supabase = await createClient();
  const r = await supabase.rpc('challenge_assets_done', { cid: id });
  return r.error ? { ok: false, error: needMigration(r.error.message) } : { ok: true };
}
