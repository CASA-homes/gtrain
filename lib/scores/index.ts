// The one place that decides where live scores come from.
//
// Switch competition with the NEXT_PUBLIC_SCORE_FEED env var in Vercel (redeploy after changing it):
//   aflw  AFLW 2026 (default, what the site runs today)
//   afl   men's AFL 2027: turn on once AFL Fantasy publishes the 2027 files (usually February)
//
// To move to a licensed provider later (Champion Data, Sportradar…), write a new file that returns a ScoreProvider
// (see types.ts and afl-fantasy.ts) and point the matching FEEDS entry at it. Nothing else in the app needs to change.
import { aflFantasy } from './afl-fantasy';
import type { ScoreProvider } from './types';

export * from './types';

interface Feed { key: string; label: string; comp: string; provider: ScoreProvider }

const FEEDS: Record<string, Feed> = {
  aflw: { key: 'aflw', label: 'AFLW', comp: 'aflw2026', provider: aflFantasy('aflw_fantasy') },
  afl: { key: 'afl', label: 'AFL', comp: 'afl2027', provider: aflFantasy('fantasy') },
};

/** The active feed. NEXT_PUBLIC_ so the client (headshots) and server agree. */
export const FEED: Feed = FEEDS[process.env.NEXT_PUBLIC_SCORE_FEED ?? ''] ?? FEEDS.aflw;
/** Competition id stored on mini games and challenges, so each season's games stay separate. */
export const COMP = FEED.comp;

export const liveRound = (round?: number) => FEED.provider.liveRound(round);
export const feedRounds = () => FEED.provider.rounds();
export const playerProfile = (id: number) => FEED.provider.profile(id);
export const playerPhoto = (id: number) => FEED.provider.photo(id);
