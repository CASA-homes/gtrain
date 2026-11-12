// Provider-neutral shapes for live footy data. Everything in the app (live page, mini games, matchups) works off these,
// so a new data source (Champion Data, Sportradar, a manual feed…) only has to produce them. See lib/scores/index.ts.

export interface LPlayer { id: number; name: string; squad: string; squadId: number; pos: string[]; avg: number | null; l3: number | null; hi: number | null; games: number; status: string; score: number | null;
  /** What the feed says, when an override or lock changed `score`. */ feed?: number | null;
  /** The commish set this score by hand. */ manual?: boolean }
export interface LGame { id: number; date: string; status: string; home: string; away: string; homeId: number; awayId: number; homeScore: number | null; awayScore: number | null; period: number | null; periodSeconds: number }
export interface LRound { round: number; name: string; status: string; rounds: { n: number; name: string; status: string }[]; games: LGame[]; players: LPlayer[]; fetchedAt: string;
  /** Top scorer of the last completed round before this one: he gets the score plate in this round's matchups. */
  top?: { id: number; name: string; squad: string; score: number; round: number } | null;
  /** False when the round's live-scores file couldn't be reached (fixture and players still loaded). */
  feedOk?: boolean;
  /** Commish overrides applied to this round (see lib/scores/overrides.ts). */
  scoreState?: { paused: boolean; locked: boolean; overrides: number } }

export interface LProfile {
  id: number; name: string; squad: string; club: string; pos: string[]; age: number | null; firstSeason: number | null; seasons: number;
  status: string; injury: string | null; price: number; seasonPriceChange: number; owned: number | null;
  games: number; avg: number | null; l3: number | null; l5: number | null; hi: number | null; lo: number | null; total: number;
  rank: number | null; posRank: { pos: string; rank: number; of: number } | null;
  log: { round: number; score: number; opp: string; home: boolean }[];
  next: { round: number; opp: string; home: boolean; date: string; status: string } | null;
}

/** What a score source has to provide. Game status strings follow AFL Fantasy's: 'scheduled' | 'playing' | 'completed'. */
export interface ScoreProvider {
  /** Every round with its status (cheap: used just to know which rounds are finished). */
  rounds(): Promise<{ n: number; status: string }[]>;
  /** One round in full: fixture, live game scores and every playing player's score. Defaults to the current round. */
  liveRound(round?: number): Promise<LRound>;
  /** A player's season profile for the pop-up. */
  profile(id: number): Promise<LProfile | null>;
  /** Headshot URL (used client-side, so it must not need secrets). */
  photo(id: number): string;
}
