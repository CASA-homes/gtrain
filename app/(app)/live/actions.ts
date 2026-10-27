'use server';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/data';
import { COMP, PICKS_PER_TEAM, liveRound, onClock, slotFor, type GamePick, type GameRow } from '@/lib/aflw';

type Res = { ok: boolean; error?: string; id?: number };
const toGame = (r: { id: number; round: number; kind: string; name: string; status: 'drafting' | 'done'; draft_order: number[]; created_by: string; created_at: string; finished_at: string | null }): GameRow =>
  ({ id: r.id, round: r.round, kind: r.kind, name: r.name, status: r.status, order: r.draft_order, created_by: r.created_by, created_at: r.created_at, finished_at: r.finished_at });
const COLS = 'id, round, kind, name, status, draft_order, created_by, created_at, finished_at';

/** Every game in the competition, newest first, with its picks. ready=false until the tables exist. */
export async function listGames(): Promise<{ ready: boolean; games: (GameRow & { picks: GamePick[] })[] }> {
  const supabase = await createClient();
  const g = await supabase.from('mini_games').select(COLS).eq('comp', COMP).order('created_at', { ascending: false }).limit(60);
  if (g.error) return { ready: false, games: [] };
  const ids = (g.data ?? []).map((x) => x.id);
  const p = ids.length ? await supabase.from('mini_picks').select('game_id, pick_no, team_id, player_id, player_name, slot, picked_at').in('game_id', ids).order('pick_no') : { data: [] };
  return { ready: true, games: (g.data ?? []).map((x) => ({ ...toGame(x), picks: (p.data ?? []).filter((y) => y.game_id === x.id) as GamePick[] })) };
}

export async function loadGame(id: number): Promise<{ game: GameRow | null; picks: GamePick[] }> {
  const supabase = await createClient();
  const [g, p] = await Promise.all([
    supabase.from('mini_games').select(COLS).eq('id', id).maybeSingle(),
    supabase.from('mini_picks').select('pick_no, team_id, player_id, player_name, slot, picked_at').eq('game_id', id).order('pick_no'),
  ]);
  return { game: g.data ? toGame(g.data) : null, picks: (p.data ?? []) as GamePick[] };
}

/** Start a new game: these clubs, in a random draft order. */
export async function createGame(round: number, kind: string, name: string, teamIds: number[]): Promise<Res> {
  const me = await getMe();
  if (!me) return { ok: false, error: 'Sign in first.' };
  if (kind !== 'snake11') return { ok: false, error: 'That game type isn’t built yet.' };
  const ids = [...new Set(teamIds.map(Number))].filter((x) => Number.isInteger(x) && x > 0);
  if (ids.length < 2 || ids.length > 10) return { ok: false, error: 'Pick between 2 and 10 clubs.' };
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const supabase = await createClient();
  const res = await supabase.from('mini_games').insert({ comp: COMP, round, kind, name: name.trim().slice(0, 60) || `Round ${round} draft`, draft_order: order }).select('id').single();
  return res.error ? { ok: false, error: res.error.message } : { ok: true, id: res.data.id };
}

/** Next pick. The club on the clock picks for itself; the game's creator and the commish can pick for anyone. */
export async function makePick(gameId: number, playerId: number): Promise<Res> {
  const me = await getMe();
  if (!me) return { ok: false, error: 'Sign in first.' };
  const { game, picks } = await loadGame(gameId);
  if (!game || game.status !== 'drafting') return { ok: false, error: 'The draft is closed.' };
  const k = picks.length;
  if (k >= game.order.length * PICKS_PER_TEAM) return { ok: false, error: 'The draft is finished.' };
  const team = onClock(game.order, k);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (team !== me.team_id && !me.is_commish && game.created_by !== user?.id) return { ok: false, error: 'It’s not your pick yet.' };
  if (picks.some((p) => p.player_id === playerId)) return { ok: false, error: 'Already taken.' };
  const data = await liveRound(game.round);
  const pl = data.players.find((p) => p.id === playerId);
  if (!pl) return { ok: false, error: 'That player isn’t playing this round.' };
  const slot = slotFor(pl.pos, picks.filter((p) => p.team_id === team));
  if (!slot) return { ok: false, error: `No ${pl.pos.join('/')} spot left in that team.` };
  const res = await supabase.from('mini_picks').insert({ game_id: gameId, pick_no: k, team_id: team, player_id: playerId, player_name: pl.name, slot });
  return res.error ? { ok: false, error: res.error.message } : { ok: true };
}

/** Creator or commish: take back the last pick. */
export async function undoPick(gameId: number): Promise<Res> {
  const supabase = await createClient();
  const last = await supabase.from('mini_picks').select('pick_no').eq('game_id', gameId).order('pick_no', { ascending: false }).limit(1).maybeSingle();
  if (!last.data) return { ok: true };
  const res = await supabase.from('mini_picks').delete().eq('game_id', gameId).eq('pick_no', last.data.pick_no).select('pick_no');
  if (res.error) return { ok: false, error: res.error.message };
  return res.data?.length ? { ok: true } : { ok: false, error: 'Only the game’s creator or the commish can undo.' };
}

/** Creator or commish: delete the game. */
export async function deleteGame(gameId: number): Promise<Res> {
  const supabase = await createClient();
  const res = await supabase.from('mini_games').delete().eq('id', gameId).select('id');
  if (res.error) return { ok: false, error: res.error.message };
  return res.data?.length ? { ok: true } : { ok: false, error: 'Only the game’s creator or the commish can delete it.' };
}
