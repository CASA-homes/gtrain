'use server';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/data';
import { CAP_BUDGETS, CAP_PICKS, COMP, PRIZE_SPLITS, type Prize, PICKS_PER_TEAM, liveRound, lockedIds, onClock, priceOf, slotFor, type CapEntry, type GamePick, type GameRow } from '@/lib/aflw';

type Res = { ok: boolean; error?: string; id?: number };
type RawGame = { id: number; round: number; kind: string; name: string; status: 'drafting' | 'done'; draft_order: number[]; created_by: string; created_at: string; finished_at: string | null; budget?: number | null; match_id?: number | null; prize?: Prize | null };
const toGame = (r: RawGame): GameRow =>
  ({ id: r.id, round: r.round, kind: r.kind, name: r.name, status: r.status, order: r.draft_order, created_by: r.created_by, created_at: r.created_at, finished_at: r.finished_at, budget: r.budget ?? null, match_id: r.match_id ?? null, prize: r.prize ?? null });
const COLS_OLD = 'id, round, kind, name, status, draft_order, created_by, created_at, finished_at';
const COLS_CAP = COLS_OLD + ', budget, match_id';
const COLS = COLS_CAP + ', prize';
/** Select games with the newest columns that exist (prize 0012, salary cap 0011), falling back gracefully. */
async function selectGames(q: (cols: string) => PromiseLike<{ data: unknown; error: unknown }>) {
  for (const c of [COLS, COLS_CAP]) { const r = await q(c); if (!r.error) return r; }
  return q(COLS_OLD);
}
function cleanPrize(p?: Prize | null): Prize | null {
  if (!p?.on) return null;
  const entry = Math.max(0, Math.min(1000, Math.round(Number(p.entry) || 0)));
  const extras = (p.extras ?? []).map((x) => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 5);
  if (!entry && !extras.length) return null;
  return { on: true, entry, split: PRIZE_SPLITS[p.split] ? p.split : 'wta', extras };
}

/** Every game in the competition, newest first, with its picks. ready=false until the tables exist. */
export async function listGames(): Promise<{ ready: boolean; games: (GameRow & { picks: GamePick[] })[] }> {
  const supabase = await createClient();
  const g = await selectGames((c) => supabase.from('mini_games').select(c).eq('comp', COMP).order('created_at', { ascending: false }).limit(60)) as { data: RawGame[] | null; error: unknown };
  if (g.error) return { ready: false, games: [] };
  const ids = (g.data ?? []).map((x) => x.id);
  const p = ids.length ? await supabase.from('mini_picks').select('game_id, pick_no, team_id, player_id, player_name, slot, picked_at').in('game_id', ids).order('pick_no') : { data: [] };
  return { ready: true, games: (g.data ?? []).map((x) => ({ ...toGame(x), picks: (p.data ?? []).filter((y) => y.game_id === x.id) as GamePick[] })) };
}

export async function loadGame(id: number): Promise<{ game: GameRow | null; picks: GamePick[] }> {
  const supabase = await createClient();
  const [g, p] = await Promise.all([
    selectGames((c) => supabase.from('mini_games').select(c).eq('id', id).maybeSingle()) as Promise<{ data: RawGame | null; error: unknown }>,
    supabase.from('mini_picks').select('pick_no, team_id, player_id, player_name, slot, picked_at').eq('game_id', id).order('pick_no'),
  ]);
  return { game: g.data ? toGame(g.data) : null, picks: (p.data ?? []) as GamePick[] };
}

/** Start a new game: these clubs, in a random draft order. */
export async function createGame(round: number, kind: string, name: string, teamIds: number[], opts: { budget?: number; matchId?: number | null; prize?: Prize | null } = {}): Promise<Res> {
  const me = await getMe();
  if (!me) return { ok: false, error: 'Sign in first.' };
  if (kind !== 'snake11' && kind !== 'cap5') return { ok: false, error: 'That game type isn’t built yet.' };
  const ids = [...new Set(teamIds.map(Number))].filter((x) => Number.isInteger(x) && x > 0);
  if (ids.length < 2 || ids.length > 10) return { ok: false, error: 'Pick between 2 and 10 clubs.' };
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const supabase = await createClient();
  const row: Record<string, unknown> = { comp: COMP, round, kind, name: name.trim().slice(0, 60) || (kind === 'cap5' ? `Round ${round} salary cap` : `Round ${round} draft`), draft_order: order };
  if (kind === 'cap5') { row.budget = CAP_BUDGETS.includes(Number(opts.budget)) ? Number(opts.budget) : 350; row.match_id = opts.matchId ? Number(opts.matchId) : null; }
  const prize = cleanPrize(opts.prize);
  if (prize) row.prize = prize;
  const res = await supabase.from('mini_games').insert(row).select('id').single();
  if (res.error && prize && /prize/i.test(res.error.message)) return { ok: false, error: 'Prizes need supabase/migrations/0012_game_prizes.sql run first.' };
  if (res.error && kind === 'cap5' && /column|check/i.test(res.error.message)) return { ok: false, error: 'Salary cap needs supabase/migrations/0011_salary_cap.sql run first.' };
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

/* ---------------- Salary Cap 5 ---------------- */

/** Every entry in a salary-cap game. Rivals' players stay hidden until their game starts (count and cost only). */
export async function loadEntries(gameId: number): Promise<{ ready: boolean; entries: CapEntry[] }> {
  const me = await getMe();
  const supabase = await createClient();
  const { game } = await loadGame(gameId);
  const q = await supabase.from('mini_entries').select('team_id, players, captain, cost, updated_at').eq('game_id', gameId);
  if (q.error || !game) return { ready: false, entries: [] };
  const locked = lockedIds(await liveRound(game.round));
  return {
    ready: true,
    entries: (q.data ?? []).map((e) => {
      const mine = e.team_id === me?.team_id;
      const seen = mine ? e.players : e.players.filter((id: number) => locked.has(id));
      return { team_id: e.team_id, players: seen, hidden: e.players.length - seen.length, captain: mine || (e.captain != null && locked.has(e.captain)) ? e.captain : null, cost: mine ? e.cost : null, updated_at: e.updated_at };
    }),
  };
}

/** Save my club's 5 (or the commish for any club in the game). Budget, scope and lockouts are checked here. */
export async function saveEntry(gameId: number, players: number[], captain: number | null, teamId?: number): Promise<Res> {
  const me = await getMe();
  if (!me) return { ok: false, error: 'Sign in first.' };
  const team = teamId && me.is_commish ? teamId : me.team_id;
  const { game } = await loadGame(gameId);
  if (!game || game.kind !== 'cap5') return { ok: false, error: 'Not a salary-cap game.' };
  if (!game.order.includes(team)) return { ok: false, error: 'Your club isn’t in this game.' };
  const ids = [...new Set(players.map(Number))].filter((x) => Number.isInteger(x) && x > 0);
  if (ids.length > CAP_PICKS) return { ok: false, error: `Pick at most ${CAP_PICKS}.` };
  if (captain != null && !ids.includes(captain)) return { ok: false, error: 'Your captain has to be in your 5.' };
  const round = await liveRound(game.round);
  const byId = new Map(round.players.map((p) => [p.id, p]));
  const inScope = (sid: number) => !game.match_id || round.games.some((g) => g.id === game.match_id && (g.homeId === sid || g.awayId === sid));
  for (const id of ids) { const p = byId.get(id); if (!p) return { ok: false, error: 'One of those players isn’t playing this round.' }; if (!inScope(p.squadId)) return { ok: false, error: `${p.name} isn’t in this match.` }; }
  const cost = ids.reduce((s, id) => s + priceOf(byId.get(id)!), 0);
  const budget = game.budget ?? 350;
  if (cost > budget) return { ok: false, error: `That’s $${cost}k: $${cost - budget}k over the $${budget}k cap.` };
  const supabase = await createClient();
  const prev = await supabase.from('mini_entries').select('players, captain').eq('game_id', gameId).eq('team_id', team).maybeSingle();
  const locked = lockedIds(round);
  const before: number[] = prev.data?.players ?? [];
  const moved = [...before.filter((x) => !ids.includes(x)), ...ids.filter((x) => !before.includes(x))].find((x) => locked.has(x));
  if (moved) return { ok: false, error: `${byId.get(moved)?.name ?? 'That player'} is locked: their game has started.` };
  const oldC = prev.data?.captain ?? null;
  if (oldC !== captain && ((oldC != null && locked.has(oldC)) || (captain != null && locked.has(captain)))) return { ok: false, error: 'Captain is locked once their game starts.' };
  const res = await supabase.from('mini_entries').upsert({ game_id: gameId, team_id: team, players: ids, captain, cost, updated_at: new Date().toISOString() }, { onConflict: 'game_id,team_id' });
  return res.error ? { ok: false, error: res.error.message } : { ok: true };
}
