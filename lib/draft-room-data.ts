// Server-only: the draft room's player pool, the clubs with their keepers, and the room state.
import { createClient } from '@/lib/supabase/server';
import type { League } from '@/lib/data';
import type { PlayerRow } from '@/lib/ratings';
import { age } from '@/lib/ratings';
import { photoUrl } from '@/lib/photos';
import PROFILES from './draft-profiles-2026.json';
import { DRAFT_2026_DONE, PHANTOM_2026, REDRAFTED_2026 } from './phantom-2026';
import { DEFAULT_ROOM, DRAFT_YEAR, FALLBACK_TEAM_COLOURS, type DraftPlayer, type Line, type RoomRequest, type RoomState, type RoomTeam } from '@/lib/draft-room';

const OUT = /retired|delisted/i;
type Profile26 = { year: number; name: string; junior?: string; position: string; height?: number; summary?: string };
/** AFL club names (as the draft list has them) to the codes the rest of the app uses. */
export const AFL_CODE: Record<string, string> = {
  Adelaide: 'ADE', Brisbane: 'BRL', Carlton: 'CAR', Collingwood: 'COL', Essendon: 'ESS', Fremantle: 'FRE', Geelong: 'GEE', 'Gold Coast': 'GCS', GWS: 'GWS',
  Hawthorn: 'HAW', Melbourne: 'MEL', 'North Melbourne': 'NTH', 'Port Adelaide': 'PTA', Richmond: 'RIC', 'St Kilda': 'STK', Sydney: 'SYD', 'Western Bulldogs': 'WBD', 'West Coast': 'WCE',
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function toPlayer(p: PlayerRow, was: string | null): DraftPlayer {
  return {
    key: `p:${p.id}`, n: p.full_name ?? p.name, pos: p.positions[0], positions: p.positions, club: p.afl_club ?? '', img: photoUrl(p),
    avg: p.average != null ? Math.round(p.average * 10) / 10 : null, games: p.games, age: age(p.birth_date), was,
    rookie: p.draft_year === 2026 || undefined,
  };
}

export function profileLine(pos: string): Line[] {
  const out: Line[] = [];
  for (const part of pos.split('/')) {
    const s = part.toLowerCase();
    const l: Line = s.includes('ruc') ? 'RUC' : s.includes('def') ? 'DEF' : s.includes('fwd') ? 'FWD' : s.includes('utility') ? 'DEF' : 'MID';
    if (!out.includes(l)) out.push(l);
  }
  return out.length ? out : ['MID'];
}

/** Clubs in the draft (the ten that hold picks), each with its keepers for 2027. */
export function roomTeams(league: League): RoomTeam[] {
  const holders = new Set(league.picks.filter((p) => p.year === DRAFT_YEAR).map((p) => p.owner_team_id));
  return league.teams.filter((t) => holders.has(t.id)).map((t, i) => ({
    id: t.id, name: t.name, short: t.short_code, coach: t.coach_name, colour: t.colour ?? FALLBACK_TEAM_COLOURS[i % FALLBACK_TEAM_COLOURS.length],
    keepers: league.players.filter((p) => p.team_id === t.id && (p.is_keeper || p.is_rookie_keeper)).map((p) => toPlayer(p, null)),
  }));
}

/** Everyone who can be drafted: players not kept, unowned AFL players, and the 2026 AFL draftees. Best average first. */
export function roomPool(league: League): DraftPlayer[] {
  const teamName = new Map(league.teams.map((t) => [t.id, t.name]));
  const known = new Set<string>();
  const out: DraftPlayer[] = [];
  for (const p of league.players) {
    if (p.is_keeper || p.is_rookie_keeper || OUT.test(p.list_status ?? '')) continue;
    out.push(toPlayer(p, teamName.get(p.team_id) ?? null)); known.add((p.full_name ?? p.name).toLowerCase());
  }
  for (const p of league.freeAgents) {
    if (OUT.test(p.list_status ?? '')) continue;
    out.push(toPlayer(p, null)); known.add((p.full_name ?? p.name).toLowerCase());
  }
  out.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  // The 2026 AFL draftees: the real national draft once it's run (scouting profile joined on where there is one), the
  // profiled prospects before it. Re-drafted AFL veterans are already in the pool as free agents.
  const prof = new Map((PROFILES as Profile26[]).filter((d) => d.year === 2026).map((d) => [d.name.toLowerCase(), d]));
  const list: { name: string; position: string; junior?: string; height?: number; club?: string; pick?: number }[] = DRAFT_2026_DONE
    ? PHANTOM_2026.filter((d) => !REDRAFTED_2026.has(d.name)).map((d) => {
      const pr = prof.get(d.name.toLowerCase());
      return { name: d.name, position: pr?.position || d.position || 'Midfielder', junior: d.from || pr?.junior, height: pr?.height, club: d.club, pick: d.rank };
    })
    : [...prof.values()];
  const draftees = list
    .filter((d) => !known.has(d.name.toLowerCase()))
    .map((d): DraftPlayer => {
      const lines = profileLine(d.position);
      const club = d.club ? (AFL_CODE[d.club] ?? d.club) : (d.junior ?? 'Draftee');
      const note = [d.pick ? `AFL pick ${d.pick}` : null, d.position, d.height ? `${d.height}cm` : null, d.pick && d.junior ? d.junior : null].filter(Boolean).join(' · ');
      return { key: `dr:${slug(d.name)}`, n: d.name, pos: lines[0], positions: lines, club, img: null, avg: null, games: null, age: null, rookie: true, note };
    });
  return [...out, ...draftees];
}

/** The room's state for the first paint (the client then polls draft_room_state). ready is false until 0022 is run. */
export async function loadRoomState(): Promise<{ ready: boolean; state: RoomState }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('draft_room_state', { y: DRAFT_YEAR });
  const blank: RoomState = { now: new Date().toISOString(), room: DEFAULT_ROOM, current: null, sels: [], feed: [], picks: [], trades: [], queue: [] };
  if (error || !data) return { ready: false, state: blank };
  const s = data as RoomState;
  return { ready: true, state: { ...blank, ...s, room: { ...DEFAULT_ROOM, ...(s.room ?? {}) } } };
}

export async function loadReady(): Promise<Map<number, number>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('draft_room_ready', { y: DRAFT_YEAR });
  return new Map(((data ?? []) as { team_id: number; queued: number }[]).map((r) => [r.team_id, r.queued]));
}

/** Sign-off: which clubs have ticked their picks, the change requests, and (once posted) the pre-post squads. */
export async function loadSignoff(): Promise<{ checks: Set<number>; requests: RoomRequest[]; snapshot: { player_id: number; team_id: number; is_keeper: boolean; is_rookie_keeper: boolean }[] | null }> {
  const supabase = await createClient();
  const [c, r, s] = await Promise.all([
    supabase.from('draft_room_checks').select('team_id').eq('year', DRAFT_YEAR),
    supabase.from('draft_room_requests').select('id, team_id, body, status, created_at').eq('year', DRAFT_YEAR).order('id', { ascending: false }),
    supabase.from('draft_room').select('snapshot').eq('year', DRAFT_YEAR).maybeSingle(),
  ]);
  return {
    checks: new Set(((c.data ?? []) as { team_id: number }[]).map((x) => x.team_id)),
    requests: (r.data ?? []) as RoomRequest[],
    snapshot: (s.data?.snapshot ?? null) as { player_id: number; team_id: number; is_keeper: boolean; is_rookie_keeper: boolean }[] | null,
  };
}
