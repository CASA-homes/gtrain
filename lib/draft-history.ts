// AFL national drafts 2016–2025 (every pick, from Wikipedia) matched to each player's AFL career (DFS Australia).
// Built by scripts/draft-history-pull.py → lib/draft-history.json.
import raw from './draft-history.json';
import type { Hist } from '@/lib/ratings';

export interface Draftee {
  y: number; p: number; n: string; c: string; f: string; l: string;   // year, pick, name, club drafted to, recruited from, league
  id?: string; dob?: string | null; ht?: number | null; h?: Hist[];    // DFS id, birth date, height, AFL seasons
}
export const DRAFTEES = raw as Draftee[];
export const DRAFT_YEARS = [...new Set(DRAFTEES.map((d) => d.y))].sort((a, b) => b - a);

export type DraftStatus = 'Active' | 'Yet to debut' | 'Delisted / retired' | 'Never played';

/** Where a draftee is now, from his AFL seasons and the G-Train lists. */
export function draftStatus(d: Draftee, onGTrainList: boolean, gtrainListStatus: string | null): { status: DraftStatus; last: number | null } {
  const played = (d.h ?? []).filter((h) => h[1] > 0);
  const last = played.length ? played[played.length - 1][0] : null;
  if (onGTrainList) return { status: gtrainListStatus === 'Retired' || gtrainListStatus === 'Delisted' ? 'Delisted / retired' : 'Active', last };
  if (last === 2026) return { status: 'Active', last };
  if (!played.length) return { status: d.y >= 2024 ? 'Yet to debut' : 'Never played', last };
  if (d.y >= 2025) return { status: 'Active', last };
  return { status: 'Delisted / retired', last };
}

/** 2026 average and games, or null if he didn't play in 2026. */
export function current(d: Draftee): { avg: number; games: number } | null {
  const s = (d.h ?? []).find((h) => h[0] === 2026 && h[1] > 0);
  return s ? { avg: s[2], games: s[1] } : null;
}

export function bestSeason(d: Draftee): { year: number; avg: number } | null {
  const xs = (d.h ?? []).filter((h) => h[1] >= 5);
  if (!xs.length) return null;
  const b = xs.reduce((m, h) => (h[2] > m[2] ? h : m));
  return { year: b[0], avg: b[2] };
}
