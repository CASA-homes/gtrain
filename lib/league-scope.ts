// Which league a request is for, and that league's profile (rules charter, honour roll).
// G-Train (league 1) came from files: its 2026 results, draft history, club rounds and Crystal Ball are archives
// that only make sense for G-Train, so they're gated to league 1. Every other league reads its own rules from
// leagues.settings and builds its history in the database as it plays.
import { cache } from 'react';
import LEAGUE from '@/data/league.json';
import { createClient, currentLeagueId } from '@/lib/supabase/server';

export const LEGACY_LEAGUE = 1;

export type Charter = typeof LEAGUE.charter;
export interface HonourRow { year: number; premier: string; runner_up?: string | null; spoon?: string | null; medal?: string | null }
export interface LeagueProfile {
  id: number; name: string; legacy: boolean; season: number; source: string | null;
  founded: number | null; platform: string | null; scoring: string;
  charter: Charter; honourRoll: HonourRow[];
}

/** True for G-Train, whose archives live in files. */
export async function isLegacyLeague(): Promise<boolean> {
  return (await currentLeagueId()) === LEGACY_LEAGUE;
}

/** The standard keeper-league rules, used for a new league until its commish sets its own (setup wizard). */
export const DEFAULT_CHARTER: Charter = LEAGUE.charter;

export const getLeagueProfile = cache(async (): Promise<LeagueProfile> => {
  const id = await currentLeagueId();
  const legacy = id === LEGACY_LEAGUE;
  type Row = { name: string; season: number; source: string | null; settings: Record<string, unknown> | null };
  const row: Row | null = await (async () => {
    try {
      const supabase = await createClient();
      const q = await supabase.from('leagues').select('name, season, source, settings').eq('id', id).maybeSingle();
      return (q.data as Row | null) ?? null;
    } catch { return null; }
  })();
  const s = (row?.settings ?? {}) as { charter?: Charter; honour_roll?: HonourRow[]; founded?: number; platform?: string; scoring?: string };
  return {
    id, legacy,
    name: row?.name ?? (legacy ? LEAGUE.league.name : 'Your league'),
    season: row?.season ?? 2027,
    source: row?.source ?? null,
    founded: s.founded ?? (legacy ? Number(LEAGUE.league.founded) || null : null),
    platform: s.platform ?? (legacy ? LEAGUE.league.platform : null),
    scoring: s.scoring ?? (legacy ? LEAGUE.league.scoring : 'AFL Fantasy'),
    charter: s.charter ?? DEFAULT_CHARTER,
    honourRoll: s.honour_roll ?? (legacy ? (LEAGUE.honour_roll as HonourRow[]) : []),
  };
});
