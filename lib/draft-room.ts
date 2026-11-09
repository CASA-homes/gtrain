// G-Train Draft Centre + Draft Room: shared types and the client-side mirror of the room rules in
// supabase/migrations/0022_draft_room.sql (who is on the clock, N/A picks, what's next).

export const DRAFT_YEAR = 2027;
export type Line = 'DEF' | 'MID' | 'RUC' | 'FWD';

export interface RoomSettings {
  year: number; status: 'scheduled' | 'live' | 'paused' | 'done'; starts_at: string | null;
  pick_seconds: number; break_every: number; break_minutes: number; snake: boolean; trading: boolean; list_max: number;
  on_clock_since: string | null; paused_left: number | null; makeups: number[];
}
export interface RoomPick { id: number; overall: number; round: number; owner: number; orig: number }
export interface DraftPlayer {
  key: string; n: string; pos: Line; positions: Line[]; club: string; img: string | null;
  avg: number | null; games: number | null; age: number | null; rookie?: boolean; was?: string | null; note?: string | null;
}
export interface RoomSel { id: number; pick_id: number | null; overall: number | null; round: number | null; team_id: number; player_key: string | null; player: DraftPlayer | null; how: 'pick' | 'auto' | 'skip' | 'makeup' | 'commish'; made_at: string }
export interface RoomFeed { id: number; kind: 'pick' | 'skip' | 'trade' | 'info'; body: string; made_at: string }
export interface RoomTrade { id: number; from_team: number; to_team: number; give_picks: number[]; get_picks: number[]; status: string; created_at: string; decided_at: string | null }
export interface RoomCurrent { pick_id: number | null; overall: number | null; team_id: number; rnd: number | null; makeup: boolean }
export interface RoomState {
  now: string; room: RoomSettings; current: RoomCurrent | null; sels: RoomSel[]; feed: RoomFeed[]; picks: RoomPick[];
  trades: RoomTrade[]; queue: { key: string; player: DraftPlayer }[];
}
export interface RoomTeam { id: number; name: string; short: string; coach: string; colour: string; keepers: DraftPlayer[] }

export const DEFAULT_ROOM: RoomSettings = {
  year: DRAFT_YEAR, status: 'scheduled', starts_at: '2027-02-20T11:00:00Z', pick_seconds: 90, break_every: 4, break_minutes: 5,
  snake: false, trading: true, list_max: 33, on_clock_since: null, paused_left: null, makeups: [],
};

/** Picks in draft order (snake reverses the even rounds). */
export function orderPicks(picks: RoomPick[], snake: boolean): RoomPick[] {
  return [...picks].sort((a, b) => a.round - b.round || (snake && a.round % 2 === 0 ? b.overall - a.overall : a.overall - b.overall));
}

/** Picks a club can't use because its list would be full: list_max minus keepers, counted in draft order. */
export function naPicks(ordered: RoomPick[], keepers: Map<number, number>, listMax: number): Set<number> {
  const used = new Map<number, number>(), out = new Set<number>();
  for (const p of ordered) {
    const c = (used.get(p.owner) ?? 0) + 1; used.set(p.owner, c);
    if (c > listMax - (keepers.get(p.owner) ?? 0)) out.add(p.id);
  }
  return out;
}

export type Slot = { kind: 'pick'; pick: RoomPick } | { kind: 'makeup'; team: number };
/** Every pick still to come, in order: usable picks with no selection, then the make-up picks. */
export function upcoming(ordered: RoomPick[], usedPickIds: Set<number>, na: Set<number>, makeups: number[]): Slot[] {
  return [
    ...ordered.filter((p) => !usedPickIds.has(p.id) && !na.has(p.id)).map((pick): Slot => ({ kind: 'pick', pick })),
    ...makeups.map((team): Slot => ({ kind: 'makeup', team })),
  ];
}

export const CLUB_COLOURS: Record<string, [string, string]> = {
  ADE: ['#002b5c', '#e21937'], BRL: ['#7a0026', '#fdbe57'], CAR: ['#0e1e2d', '#ffffff'], COL: ['#000000', '#ffffff'], ESS: ['#cc2031', '#000000'],
  FRE: ['#2a0d54', '#ffffff'], GEE: ['#1c3c63', '#ffffff'], GCS: ['#e02112', '#ffd700'], GWS: ['#f47920', '#4a4f55'], HAW: ['#4d2004', '#fbbf15'],
  MEL: ['#0f1131', '#cc2031'], NTH: ['#013b9f', '#ffffff'], PTA: ['#008aab', '#000000'], RIC: ['#000000', '#fed102'], STK: ['#ed0f05', '#000000'],
  SYD: ['#ed171f', '#ffffff'], WCE: ['#002b79', '#f2a900'], WBD: ['#014896', '#e31937'],
};
export const CLUB_NAME: Record<string, string> = {
  ADE: 'Adelaide', BRL: 'Brisbane Lions', CAR: 'Carlton', COL: 'Collingwood', ESS: 'Essendon', FRE: 'Fremantle', GEE: 'Geelong', GCS: 'Gold Coast',
  GWS: 'GWS Giants', HAW: 'Hawthorn', MEL: 'Melbourne', NTH: 'North Melbourne', PTA: 'Port Adelaide', RIC: 'Richmond', STK: 'St Kilda', SYD: 'Sydney',
  WCE: 'West Coast', WBD: 'Western Bulldogs',
};
/** A team colour for clubs that haven't picked one in Club settings. */
export const FALLBACK_TEAM_COLOURS = ['#1d4ed8', '#16a34a', '#64748b', '#ea580c', '#ca8a04', '#be123c', '#db2777', '#7c3aed', '#0891b2', '#0d9488'];

/** "the Bodega Boys" for names that read as a group; everyone else as is. */
export function withThe(name: string): string {
  return /^(the |a )/i.test(name) || /['’]s\b/.test(name.split(' ')[0]) || !/(boys|dawgs|academy|saints|lions)$/i.test(name) ? name : `the ${name}`;
}

export const fmtClock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
