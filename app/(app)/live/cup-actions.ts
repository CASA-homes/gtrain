'use server';
// Knockout Cup: cup lineups and results.
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/data';
import { CUP_SEASON, CUP_SLOTS, CUP_SLOT_ORDER, conferences, cupFixture, cupTies, fitsSlot, type CupLineup, type CupResult } from '@/lib/cup';

type Res = { ok: boolean; error?: string };
const needMigration = (m: string) => (/cup_/.test(m) ? 'The cup needs supabase/migrations/0019_cup.sql run in Supabase first.' : m);

export type CupRow = { cup_round: number; team_id: number; lineup: CupLineup };
export async function loadCupData(teamId: number): Promise<{ ready: boolean; lineups: Record<number, CupLineup>; results: CupResult[]; all: CupRow[] }> {
  const supabase = await createClient();
  const [l, r] = await Promise.all([
    supabase.from('cup_lineups').select('cup_round, team_id, lineup').eq('season', CUP_SEASON),
    supabase.from('cup_results').select('match_id, home_score, away_score').eq('season', CUP_SEASON),
  ]);
  if (l.error || r.error) return { ready: false, lineups: {}, results: [], all: [] };
  const all = (l.data ?? []) as CupRow[];
  return { ready: true, lineups: Object.fromEntries(all.filter((x) => x.team_id === teamId).map((x) => [x.cup_round, x.lineup])), results: (r.data ?? []) as CupResult[], all };
}

/** Players in this lineup who are cup-tied to another club. Returns an error message, or null if the lineup is fine. */
export async function cupTiedError(teamId: number, ids: number[]): Promise<string | null> {
  const supabase = await createClient();
  const [l, r, lad, t, pl] = await Promise.all([
    supabase.from('cup_lineups').select('cup_round, team_id, lineup').eq('season', CUP_SEASON),
    supabase.from('cup_results').select('match_id, home_score, away_score').eq('season', CUP_SEASON),
    supabase.from('ladder').select('team_id, rank').eq('season', 2026),
    supabase.from('teams').select('id, name'),
    supabase.from('players').select('id, full_name').in('id', ids.length ? ids : [0]),
  ]);
  if (l.error || r.error || !(r.data ?? []).length) return null;
  const ladder = (lad.data ?? []).sort((a, b) => a.rank - b.rank).map((x) => x.team_id as number);
  const order = [...ladder, ...(t.data ?? []).map((x) => x.id as number).filter((id) => !ladder.includes(id))].slice(0, 10);
  const { matches } = cupFixture(conferences(order));
  const ties = cupTies((l.data ?? []) as CupRow[], matches, (r.data ?? []) as CupResult[]);
  const hit = ids.find((id) => ties[id] != null && ties[id] !== teamId);
  if (hit == null) return null;
  const who = (pl.data ?? []).find((x) => x.id === hit)?.full_name ?? 'One of your players';
  const club = (t.data ?? []).find((x) => x.id === ties[hit])?.name ?? 'another club';
  return `${who} is cup-tied: he has already played in the cup for ${club} this season.`;
}

/** Save my club's cup lineup for a cup round. Positions are checked against each player's eligibility. */
export async function saveCupLineup(round: number, lineup: CupLineup): Promise<Res> {
  const me = await getMe();
  if (!me || me.is_guest) return { ok: false, error: 'Only coaches can set a cup lineup.' };
  const supabase = await createClient();
  const sq = await supabase.from('squad').select('player_id, players(positions)').eq('team_id', me.team_id);
  const positions: Record<number, string[]> = Object.fromEntries((sq.data ?? []).map((x) => [x.player_id, ((x.players as unknown as { positions: string[] } | null)?.positions ?? [])]));
  const seen = new Set<number>();
  const clean: CupLineup = {};
  for (const s of CUP_SLOT_ORDER) {
    const ids = (lineup[s] ?? []).map(Number).filter((x) => Number.isInteger(x) && x > 0).slice(0, CUP_SLOTS[s]);
    for (const id of ids) {
      if (seen.has(id)) return { ok: false, error: 'A player can only be in one spot.' };
      if (!(id in positions)) return { ok: false, error: 'Only your own players can go in your cup lineup.' };
      if (!fitsSlot(positions[id], s)) return { ok: false, error: `That player can’t play ${s}.` };
      seen.add(id);
    }
    clean[s] = ids;
  }
  const tied = await cupTiedError(me.team_id, [...seen]);
  if (tied) return { ok: false, error: tied };
  const res = await supabase.from('cup_lineups').upsert({ season: CUP_SEASON, cup_round: round, team_id: me.team_id, lineup: clean, updated_at: new Date().toISOString() }, { onConflict: 'season,cup_round,team_id' });
  return res.error ? { ok: false, error: needMigration(res.error.message) } : { ok: true };
}

/** Commish: enter or correct a cup result. */
export async function saveCupResult(matchId: string, home: number, away: number): Promise<Res> {
  const supabase = await createClient();
  const res = await supabase.from('cup_results').upsert({ season: CUP_SEASON, match_id: matchId, home_score: Math.round(home), away_score: Math.round(away), updated_at: new Date().toISOString() }, { onConflict: 'season,match_id' });
  return res.error ? { ok: false, error: needMigration(res.error.message) } : { ok: true };
}
