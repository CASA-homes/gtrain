// League rules the commish sets in League settings: milestone dates, team structure, scoring, keepers & draft, fines and
// the league bank's starting balance. Stored in leagues.settings.rules (merged over these defaults); squad size,
// lineup and keepers live in kc_settings because contracts, the cap and matchday read them there.

export type Pos4 = 'DEF' | 'MID' | 'RUC' | 'FWD';
export const DRAFT_ORDERS = {
  reverse_straight: 'Reverse ladder, same order every round',
  reverse_snake: 'Reverse ladder, snaking each round',
  ladder_straight: 'Ladder order, same order every round',
} as const;
export type DraftOrder = keyof typeof DRAFT_ORDERS;

export interface LeagueRules {
  dates: { preseason_open: string; preseason_close: string; draft_day: string; mid_open: string; mid_close: string; fa_day: string };
  team: { emergencies: number; emergency_mode: 'line' | 'any'; utility: boolean; rookie: boolean };
  scoring: { formula: Record<string, number>; captain: boolean; vc: boolean; captain_tog: number; tog: number; dual_cover: boolean; loophole: boolean; lockout: 'rolling' | 'fixed' };
  draft: { mid_order: DraftOrder; mid_after_round: number; end_order: DraftOrder; pick_years: number };
  fines: { captain_loop: number; zero_on_field_loop: number; lopsided_trade: number };
  bank_start_kt: number;
}

export const FORMULA_KEYS = ['Kick', 'Handball', 'Mark', 'Tackle', 'Hitout', 'Goal', 'Behind', 'Free for', 'Free against'] as const;
export const DEFAULT_RULES: LeagueRules = {
  dates: { preseason_open: '2026-11-01', preseason_close: '2027-03-03', draft_day: '2027-03-03', mid_open: '2027-06-01', mid_close: '2027-06-14', fa_day: '2027-06-15' },
  team: { emergencies: 4, emergency_mode: 'line', utility: false, rookie: true },
  scoring: { formula: { Kick: 3, Handball: 2, Mark: 3, Tackle: 4, Hitout: 1, Goal: 6, Behind: 1, 'Free for': 1, 'Free against': -3 }, captain: true, vc: true, captain_tog: 25, tog: 25, dual_cover: true, loophole: false, lockout: 'rolling' },
  draft: { mid_order: 'reverse_straight', mid_after_round: 9, end_order: 'reverse_straight', pick_years: 2 },
  fines: { captain_loop: 50, zero_on_field_loop: 5, lopsided_trade: 10 },
  bank_start_kt: 100,
};

/** Deep-merge saved rules over the defaults (one level of sections, plus the scoring formula). */
export function mergeRules(saved: Partial<Record<keyof LeagueRules, unknown>> | null | undefined): LeagueRules {
  const s = (saved ?? {}) as Partial<LeagueRules>;
  return {
    dates: { ...DEFAULT_RULES.dates, ...(s.dates ?? {}) },
    team: { ...DEFAULT_RULES.team, ...(s.team ?? {}) },
    scoring: { ...DEFAULT_RULES.scoring, ...(s.scoring ?? {}), formula: { ...DEFAULT_RULES.scoring.formula, ...(s.scoring?.formula ?? {}) } },
    draft: { ...DEFAULT_RULES.draft, ...(s.draft ?? {}) },
    fines: { ...DEFAULT_RULES.fines, ...(s.fines ?? {}) },
    bank_start_kt: typeof s.bank_start_kt === 'number' ? s.bank_start_kt : DEFAULT_RULES.bank_start_kt,
  };
}


/** Draft rounds: everyone fills their list from the keepers up; with a rookie spot, the last round is the rookie round. */
export const draftRounds = (listSize: number, keepers: number, rookie: boolean) => Math.max(1, listSize - (keepers - (rookie ? 1 : 0)));
