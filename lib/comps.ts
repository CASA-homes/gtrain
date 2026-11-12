// G-Train mini comps. The Knockout Cup is league-wide (its fixture needs all ten clubs); everything else on the menu
// is opt-in, and the commish sets how many each coach may enter. Prizes are minted by the commish or staked by
// entrants from their own list, and the winner takes them once the commish settles.

export const COMP_SEASON = 2027;

export type CompKey = 'cup' | 'plate' | 'shield' | 'survivor' | 'captain';
export interface CompDef {
  key: CompKey; name: string; short: string; blurb: string; how: string;
  /** league-wide comps don't count towards the entry cap */
  everyone?: boolean;
  /** which lineup it needs on Matchday: its own, or none (scored off your G-Train team) */
  lineup: 'own' | 'gtrain' | 'cup';
  rounds: string;
  /** colour for chips */
  hue: string;
}
export const COMPS: CompDef[] = [
  { key: 'cup', name: 'Knockout Cup', short: 'Cup', everyone: true, lineup: 'cup', rounds: 'Groups R5–R8 · wildcards R9 · quarters R16 · final R20', hue: '#c79a1c',
    blurb: 'Two groups of five, top three safe, 4th v 5th wildcards, then random quarter-finals.', how: '16 a side (4/6/1/4 + utility), 4 emergencies, no captains.' },
  { key: 'shield', name: 'Rookie Shield', short: 'Shield', lineup: 'own', rounds: 'Every round', hue: '#2f7de1',
    blurb: 'A weekly team of kids: only players 21 or under on 1 March, or your rookie keeper.', how: '3 DEF, 4 MID, 1 RUC, 3 FWD, captain scores double. Highest season total wins.' },
  { key: 'survivor', name: 'Survivor', short: 'Survivor', lineup: 'own', rounds: 'Every round until one is left', hue: '#d4470f',
    blurb: 'Pick one player a round. He has to score 100. Miss and you’re out.', how: 'Any player in the AFL, but you can only use him once. Last coach standing wins.' },
  { key: 'plate', name: 'The Plate', short: 'Plate', lineup: 'cup', rounds: 'R13, R15, R17, R19', hue: '#6b5bd6',
    blurb: 'The consolation cup for clubs knocked out of the Cup in the groups.', how: 'Cup rules, four rounds, highest total wins. Only open to clubs that miss the Cup semis.' },
  { key: 'captain', name: 'Captain’s Challenge', short: 'Captains', lineup: 'gtrain', rounds: 'Every round', hue: '#1d8a3c',
    blurb: 'Your captain’s score, every week, added up.', how: 'Nothing extra to pick: it reads your regular-season captain. Highest season total wins.' },
];
export const COMP_BY_KEY = Object.fromEntries(COMPS.map((c) => [c.key, c])) as Record<CompKey, CompDef>;
export const OPT_IN = COMPS.filter((c) => !c.everyone).map((c) => c.key);

export interface CompSettings { season: number; cap: number; enabled: CompKey[]; locks_at: string | null }
export const DEFAULT_SETTINGS: CompSettings = { season: COMP_SEASON, cap: 2, enabled: ['plate', 'shield', 'survivor', 'captain'], locks_at: null };

export type PrizeKind = 'pick' | 'player' | 'tokens' | 'msd_bump' | 'bonus_pick' | 'trophy' | 'other';
export interface Prize {
  id: number; season: number; comp: CompKey; source: 'minted' | 'staked'; kind: PrizeKind;
  pick_id: number | null; player_id: number | null; amount: number | null; label: string; place: number;
  staked_by: number | null; winner_id: number | null; status: 'pool' | 'awarded' | 'transferred' | 'returned' | 'void';
  created_at: string; settled_at: string | null;
}
export const PRIZE_KIND_NAME: Record<PrizeKind, string> = {
  pick: 'Draft pick', player: 'Player', tokens: 'Tokens', msd_bump: 'Move up the MSD order', bonus_pick: 'Bonus MSD pick', trophy: 'Trophy', other: 'Other',
};
/** Minted prize ideas the commish can add in one tap. */
export const MINT_PRESETS: { kind: PrizeKind; label: string; amount?: number }[] = [
  { kind: 'bonus_pick', label: 'Bonus pick at the end of MSD round 1', amount: 1 },
  { kind: 'msd_bump', label: 'Move up 2 spots in the mid-season draft', amount: 2 },
  { kind: 'tokens', label: '500 tokens', amount: 500 },
  { kind: 'trophy', label: 'Trophy for the clubhouse cabinet' },
];
export const placeName = (n: number) => (n === 1 ? 'Winner' : n === 2 ? 'Runner-up' : n === 3 ? 'Third' : `${n}th`);
