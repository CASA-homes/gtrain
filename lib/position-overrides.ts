import type { Line } from '@/lib/ratings';
// Position changes the commish has confirmed ahead of the 2027 season, applied over the database positions everywhere
// (lineups, best 22, ratings, mock draft). Keyed by full name. Remove once the database carries the 2027 positions.
export const POSITION_OVERRIDES: Record<string, Line[]> = {
  'Izak Rankine': ['MID'],
  'Shai Bolton': ['MID'],
  'Tom Sparrow': ['MID'],
};
export const positionsFor = (fullName: string | null, dbPositions: Line[]) => (fullName && POSITION_OVERRIDES[fullName]) || dbPositions;
